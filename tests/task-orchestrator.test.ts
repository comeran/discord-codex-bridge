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
        durationMs: 120,
        sessionId: "session-1"
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
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
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
    expect(session?.lastCodexSessionId).toBe("session-1");
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
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
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

  it("passes the saved channel session back into later adapter calls", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-3",
      historySummary: "Last request: add tests\nLast result: done",
      lastCodexSessionId: "session-existing",
      lastTaskId: "task-existing"
    });

    const seenSessions: Array<string | null | undefined> = [];
    const seenSummaries: string[] = [];
    const adapter: CodexAdapter = {
      execute: vi.fn(async (input) => {
        seenSessions.push(input.session?.lastCodexSessionId);
        seenSummaries.push(input.session?.historySummary ?? "");

        return {
          ok: true,
          content: "Continued the existing session.",
          stderr: "",
          exitCode: 0,
          durationMs: 80,
          sessionId: "session-existing"
        };
      })
    };

    const orchestrator = new TaskOrchestrator({
      codexAdapter: adapter,
      sessionStore,
      queue: new ChannelTaskQueue(),
      logger: pino({ level: "silent" })
    });

    const binding: ChannelBinding = {
      guildId: "guild-1",
      channelId: "channel-3",
      projectPath: "/tmp/project-c",
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-3",
      userId: "user-3",
      prompt: "Keep going.",
      binding
    });

    await submission.completion;

    expect(seenSessions).toEqual(["session-existing"]);
    expect(seenSummaries[0]).toContain("Last request:");
  });

  it("passes the binding sandbox mode into the adapter", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    const seenSandboxModes: string[] = [];
    const adapter: CodexAdapter = {
      execute: vi.fn(async (input) => {
        seenSandboxModes.push(input.sandboxMode);

        return {
          ok: true,
          content: "Executed with a channel-specific sandbox.",
          stderr: "",
          exitCode: 0,
          durationMs: 50,
          sessionId: "session-sandbox"
        };
      })
    };

    const orchestrator = new TaskOrchestrator({
      codexAdapter: adapter,
      sessionStore,
      queue: new ChannelTaskQueue(),
      logger: pino({ level: "silent" })
    });

    const binding: ChannelBinding = {
      guildId: "guild-1",
      channelId: "channel-4",
      projectPath: "/tmp/project-d",
      sandboxMode: "danger-full-access",
      sandboxModeSource: "channel",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-4",
      userId: "user-4",
      prompt: "Make a commit.",
      binding
    });

    await submission.completion;

    expect(seenSandboxModes).toEqual(["danger-full-access"]);
  });

  it("preserves review task type through orchestration", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    const adapter: CodexAdapter = {
      execute: vi.fn(async () => ({
        ok: true,
        content: "Review completed.",
        stderr: "",
        exitCode: 0,
        durationMs: 60,
        sessionId: "session-review"
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
      channelId: "channel-5",
      projectPath: "/tmp/project-e",
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-5",
      userId: "user-5",
      prompt: "Review the latest changes.",
      taskType: "review",
      binding
    });

    const result = await submission.completion;

    expect(result.status).toBe("completed");
    expect(result.task.taskType).toBe("review");
  });

  it("maps adapter cancellation into a cancelled task result without overwriting session history", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-6",
      historySummary: "Last request: add tests\nLast result: done",
      lastCodexSessionId: "session-existing",
      lastTaskId: "task-existing"
    });

    const adapter: CodexAdapter = {
      execute: vi.fn(async () => ({
        ok: false,
        cancelled: true,
        content: "",
        stderr: "",
        exitCode: null,
        durationMs: 20,
        errorMessage: "Codex execution was cancelled."
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
      channelId: "channel-6",
      projectPath: "/tmp/project-f",
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-6",
      userId: "user-6",
      prompt: "Run a cancellable task.",
      taskType: "run",
      binding
    });

    const result = await submission.completion;
    const session = await sessionStore.getByChannelId("channel-6");

    expect(result.status).toBe("cancelled");
    expect(result.task.status).toBe("cancelled");
    expect(result.task.error).toBe("Codex execution was cancelled.");
    expect(session?.historySummary).toBe("Last request: add tests\nLast result: done");
    expect(session?.lastTaskId).toBe("task-existing");
  });

  it("cancels the running task through the orchestrator", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "orchestrator-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    let taskStarted!: () => void;
    const running = new Promise<void>((resolve) => {
      taskStarted = resolve;
    });

    const adapter: CodexAdapter = {
      execute: vi.fn(async (input) => {
        taskStarted();

        if (!input.abortSignal?.aborted) {
          await new Promise<void>((resolve) => {
            input.abortSignal?.addEventListener(
              "abort",
              () => {
                resolve();
              },
              { once: true }
            );
          });
        }

        return {
          ok: false,
          cancelled: true,
          content: "",
          stderr: "",
          exitCode: null,
          durationMs: 35,
          errorMessage: "Codex execution was cancelled."
        };
      })
    };

    const orchestrator = new TaskOrchestrator({
      codexAdapter: adapter,
      sessionStore,
      queue: new ChannelTaskQueue(),
      logger: pino({ level: "silent" })
    });

    const binding: ChannelBinding = {
      guildId: "guild-1",
      channelId: "channel-7",
      projectPath: "/tmp/project-g",
      sandboxMode: "workspace-write",
      sandboxModeSource: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = orchestrator.submit({
      guildId: "guild-1",
      channelId: "channel-7",
      userId: "user-7",
      prompt: "Run a task that will be cancelled.",
      taskType: "run",
      binding
    });

    await running;

    const cancelled = await orchestrator.cancel("channel-7");
    const result = await submission.completion;

    expect(cancelled).toMatchObject({
      taskId: submission.taskId,
      taskType: "run",
      scope: "active"
    });
    expect(result.status).toBe("cancelled");
  });
});
