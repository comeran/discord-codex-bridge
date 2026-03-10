import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SessionCommandHandler,
  sessionCommandDefinition
} from "../src/bot/session-command-handler.js";
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

describe("SessionCommandHandler", () => {
  it("shows the current channel session summary", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "session-command-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-session",
      historySummary: "Last request: review code\nLast result: looks good",
      lastCodexSessionId: "session-42",
      lastTaskId: "task-99"
    });

    const handler = new SessionCommandHandler({ sessionStore });
    const interaction = createInteraction({
      commandName: "session",
      subcommand: "show",
      channelId: "channel-session",
      guildId: "guild-1"
    });

    const handled = await handler.handle(interaction);

    expect(handled).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("session-42"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("Last request: review code"),
      ephemeral: true
    });
  });

  it("resets the current channel session", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "session-command-test-"));
    tempDirs.push(tempDir);

    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-session",
      historySummary: "Last request: test resume\nLast result: done",
      lastCodexSessionId: "session-7",
      lastTaskId: "task-7"
    });

    const handler = new SessionCommandHandler({ sessionStore });
    const interaction = createInteraction({
      commandName: "session",
      subcommand: "reset",
      channelId: "channel-session",
      guildId: "guild-1"
    });

    await handler.handle(interaction);

    expect(await sessionStore.getByChannelId("channel-session")).toBeNull();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "已重置当前频道的会话状态。",
      ephemeral: true
    });
  });

  it("defines show and reset session subcommands", () => {
    expect(sessionCommandDefinition).toMatchObject({
      name: "session",
      options: [
        { name: "show" },
        { name: "reset" }
      ]
    });
  });
});

interface InteractionOptions {
  commandName: string;
  subcommand: string;
  channelId: string;
  guildId: string;
}

function createInteraction(options: InteractionOptions) {
  return {
    commandName: options.commandName,
    channelId: options.channelId,
    guildId: options.guildId,
    inGuild: () => true,
    options: {
      getSubcommand: vi.fn(() => options.subcommand)
    },
    reply: vi.fn(async () => {})
  } as const;
}
