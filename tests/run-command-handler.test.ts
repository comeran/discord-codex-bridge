import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RunCommandHandler,
  runCommandDefinition
} from "../src/bot/run-command-handler.js";
import { FileBindingStore } from "../src/store/binding-store.js";
import type { TaskSubmission } from "../src/types/domain.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("RunCommandHandler", () => {
  it("submits a slash-command prompt through the task orchestrator", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "run-command-test-"));
    tempDirs.push(tempDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    await bindingStore.upsert({
      guildId: "guild-1",
      channelId: "channel-run",
      projectPath: "/tmp/project-run"
    });

    const submit = vi.fn(
      (): TaskSubmission => ({
        taskId: "task-run-1",
        queuedAhead: 0,
        completion: Promise.resolve({
          task: {
            taskId: "task-run-1",
            guildId: "guild-1",
            channelId: "channel-run",
            userId: "user-1",
            projectPath: "/tmp/project-run",
            prompt: "Summarize this repository.",
            status: "completed",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString()
          },
          status: "completed",
          output: "Repository summary complete.",
          durationMs: 75
        })
      })
    );

    const handler = new RunCommandHandler({
      bindingStore,
      orchestrator: { submit } as never
    });

    const interaction = createInteraction({
      channelId: "channel-run",
      guildId: "guild-1",
      userId: "user-1",
      prompt: "Summarize this repository."
    });

    const handled = await handler.handle(interaction);

    expect(handled).toBe(true);
    expect(submit).toHaveBeenCalledWith({
      guildId: "guild-1",
      channelId: "channel-run",
      userId: "user-1",
      prompt: "Summarize this repository.",
      binding: expect.objectContaining({
        projectPath: "/tmp/project-run"
      })
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "任务 `task-run-1` 已开始执行。"
    });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("Repository summary complete.")
    });
  });

  it("returns a bound-project error when the channel is not configured", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "run-command-test-"));
    tempDirs.push(tempDir);

    const handler = new RunCommandHandler({
      bindingStore: FileBindingStore.fromFile(
        path.join(tempDir, "bindings.json"),
        "workspace-write"
      ),
      orchestrator: { submit: vi.fn() } as never
    });

    const interaction = createInteraction({
      channelId: "channel-missing",
      guildId: "guild-1",
      userId: "user-1",
      prompt: "Run without a binding."
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "这个频道还没有绑定项目。请先使用 `/project bind path:<absolute-path>`。",
      ephemeral: true
    });
  });

  it("defines a prompt option for the run command", () => {
    expect(runCommandDefinition).toMatchObject({
      name: "run",
      options: [
        {
          name: "prompt",
          required: true
        }
      ]
    });
  });
});

function createInteraction(options: {
  channelId: string;
  guildId: string;
  userId: string;
  prompt: string;
}) {
  return {
    commandName: "run",
    channelId: options.channelId,
    guildId: options.guildId,
    user: {
      id: options.userId
    },
    inGuild: () => true,
    options: {
      getString: vi.fn((name: string) =>
        name === "prompt" ? options.prompt : null
      )
    },
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {})
  } as const;
}
