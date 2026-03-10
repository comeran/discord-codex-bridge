import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CodexAdapter } from "../src/types/adapter.js";
import { ChannelTaskQueue } from "../src/core/channel-task-queue.js";
import { TaskOrchestrator } from "../src/core/task-orchestrator.js";
import { FileSessionStore } from "../src/store/session-store.js";
import type { ChannelBinding } from "../src/types/domain.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("TaskOrchestrator", () => {
  it("stores a session summary after successful execution", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    const adapter: CodexAdapter = {
      execute: vi.fn(async () => ({
        ok: true,
        content: "Implemented the requested change.",
        stderr: "",
        exitCode: 0,
        durationMs: 120
      }))
    };

    const orchestrator = new TaskOrchestrator({
      codexAdapter: adapter,
      sessionStore,
      queue: new ChannelTaskQueue(),
      logger: pino({ level: "silent" })
    });

    const binding: ChannelBinding = {
      guildId: "guild-1",
      channelId: "channel-1",
      projectPath: "/tmp/project-a",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      prompt: "Add a README section.",
      binding
    });

    const result = await submission.completion;
    const session = await sessionStore.getByChannelId("channel-1");

    expect(result.status).toBe("completed");
    expect(session?.lastTaskId).toBe(submission.taskId);
    expect(session?.historySummary).toContain("Last request:");
    expect(session?.historySummary).toContain("Last result:");
  });

  it("maps adapter failures into failed task results", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    const adapter: CodexAdapter = {
      execute: vi.fn(async () => ({
        ok: false,
        content: "",
        stderr: "command failed",
        exitCode: 1,
        durationMs: 200,
        errorMessage: "Codex exited with code 1."
      }))
    };

    const orchestrator = new TaskOrchestrator({
      codexAdapter: adapter,
      sessionStore,
      queue: new ChannelTaskQueue(),
      logger: pino({ level: "silent" })
    });

    const binding: ChannelBinding = {
      guildId: "guild-1",
      channelId: "channel-2",
      projectPath: "/tmp/project-b",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-2",
      userId: "user-2",
      prompt: "Run a broken task.",
      binding
    });

    const result = await submission.completion;

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Codex exited with code 1.");
    expect(result.stderr).toBe("command failed");
  });
});
