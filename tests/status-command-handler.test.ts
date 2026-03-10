import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ChatInputCommandInteraction } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusCommandHandler } from "../src/bot/status-command-handler.js";
import { ChannelStatusService } from "../src/core/channel-status-service.js";
import { ChannelTaskQueue } from "../src/core/channel-task-queue.js";
import { FileBindingStore } from "../src/store/binding-store.js";
import { FileSessionStore } from "../src/store/session-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("StatusCommandHandler", () => {
  it("shows the current project, sandbox, queue, and session status", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "status-command-test-"));
    tempDirs.push(tempDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    await bindingStore.upsert({
      guildId: "guild-1",
      channelId: "channel-status",
      projectPath: "/tmp/project-status"
    });
    await bindingStore.setSandboxMode("channel-status", "danger-full-access");

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-status",
      historySummary: "Last request: inspect\nLast result: done",
      lastCodexSessionId: "session-42",
      lastTaskId: "task-previous"
    });

    const queue = new ChannelTaskQueue();
    const statusService = new ChannelStatusService({
      queue,
      sessionStore
    });

    let releaseFirstTask!: () => void;
    const firstTaskDone = new Promise<void>((resolve) => {
      releaseFirstTask = resolve;
    });

    let firstTaskStarted!: () => void;
    const firstTaskRunning = new Promise<void>((resolve) => {
      firstTaskStarted = resolve;
    });

    const first = queue.enqueue(
      "channel-status",
      async () => {
        firstTaskStarted();
        await firstTaskDone;
      },
      {
        taskId: "task-1",
        promptPreview: "Check the current repository status."
      }
    );

    await firstTaskRunning;

    const second = queue.enqueue(
      "channel-status",
      async () => {},
      {
        taskId: "task-2",
        promptPreview: "Summarize the pending work."
      }
    );

    const handler = new StatusCommandHandler({
      bindingStore,
      statusService
    });

    const interaction = createInteraction({
      commandName: "status",
      channelId: "channel-status",
      guildId: "guild-1"
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前绑定项目：`/tmp/project-status`"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前沙箱模式：`danger-full-access`"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前状态：`running`"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("排队任务数：`1`"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前任务：`task-1`"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前 Codex 会话：`session-42`"),
      ephemeral: true
    });

    releaseFirstTask();
    await Promise.all([first, second]);
  });

  it("returns a binding error for unconfigured channels", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "status-command-test-"));
    tempDirs.push(tempDir);

    const handler = new StatusCommandHandler({
      bindingStore: FileBindingStore.fromFile(
        path.join(tempDir, "bindings.json"),
        "workspace-write"
      ),
      statusService: new ChannelStatusService({
        queue: new ChannelTaskQueue(),
        sessionStore: FileSessionStore.fromFile(path.join(tempDir, "sessions.json"))
      })
    });

    const interaction = createInteraction({
      commandName: "status",
      channelId: "channel-missing",
      guildId: "guild-1"
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "这个频道还没有绑定项目。",
      ephemeral: true
    });
  });
});

function createInteraction(options: {
  commandName: string;
  channelId: string;
  guildId: string;
}) {
  return {
    commandName: options.commandName,
    channelId: options.channelId,
    guildId: options.guildId,
    inGuild: () => true,
    reply: vi.fn(async () => {})
  } as unknown as ChatInputCommandInteraction;
}
