import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import {
  CancelCommandHandler,
  cancelCommandDefinition
} from "../src/bot/cancel-command-handler.js";

describe("CancelCommandHandler", () => {
  it("reports cancellation of the active task", async () => {
    const cancel = vi.fn(async () => ({
      taskId: "task-1",
      taskType: "run" as const,
      promptPreview: "Implement the feature.",
      scope: "active" as const
    }));

    const handler = new CancelCommandHandler({
      orchestrator: { cancel } as never
    });

    const interaction = createInteraction();
    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "已请求取消当前运行中的任务 `task-1`。",
      ephemeral: true
    });
  });

  it("reports cancellation of the next queued task", async () => {
    const cancel = vi.fn(async () => ({
      taskId: "task-2",
      taskType: "review" as const,
      promptPreview: "Review the latest diff.",
      scope: "queued" as const
    }));

    const handler = new CancelCommandHandler({
      orchestrator: { cancel } as never
    });

    const interaction = createInteraction();
    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "已取消排队中的任务 `task-2`。",
      ephemeral: true
    });
  });

  it("reports when the channel has nothing cancellable", async () => {
    const cancel = vi.fn(async () => null);

    const handler = new CancelCommandHandler({
      orchestrator: { cancel } as never
    });

    const interaction = createInteraction();
    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "当前频道没有可取消任务。",
      ephemeral: true
    });
  });

  it("defines the cancel slash command", () => {
    expect(cancelCommandDefinition).toMatchObject({
      name: "cancel"
    });
  });
});

function createInteraction() {
  return {
    commandName: "cancel",
    channelId: "channel-cancel",
    guildId: "guild-1",
    inGuild: () => true,
    reply: vi.fn(async () => {})
  } as unknown as ChatInputCommandInteraction;
}
