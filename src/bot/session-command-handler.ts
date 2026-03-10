import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";

import type { SessionStore } from "../store/session-store.js";

export const sessionCommandDefinition: ApplicationCommandDataResolvable = {
  name: "session",
  description: "Inspect or reset the current channel session",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "show",
      description: "Show the current channel session state"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "reset",
      description: "Reset the current channel session state"
    }
  ]
};

export interface SessionCommandHandlerDeps {
  sessionStore: SessionStore;
}

export class SessionCommandHandler {
  public constructor(private readonly deps: SessionCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "session") {
      return false;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "这个命令只能在服务器频道中使用。",
        ephemeral: true
      });
      return true;
    }

    switch (interaction.options.getSubcommand(true)) {
      case "show":
        await this.handleShow(interaction);
        return true;
      case "reset":
        await this.handleReset(interaction);
        return true;
      default:
        await interaction.reply({
          content: "未知的 session 子命令。",
          ephemeral: true
        });
        return true;
    }
  }

  private async handleShow(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const session = await this.deps.sessionStore.getByChannelId(interaction.channelId);
    if (!session) {
      await interaction.reply({
        content: "当前频道还没有会话状态。",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: [
        `当前 Codex 会话 ID：\`${session.lastCodexSessionId ?? "未记录"}\``,
        `最近任务 ID：\`${session.lastTaskId ?? "未记录"}\``,
        "会话摘要：",
        session.historySummary || "暂无摘要。"
      ].join("\n"),
      ephemeral: true
    });
  }

  private async handleReset(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const cleared = await this.deps.sessionStore.clear(interaction.channelId);

    await interaction.reply({
      content: cleared
        ? "已重置当前频道的会话状态。"
        : "当前频道还没有可重置的会话状态。",
      ephemeral: true
    });
  }
}
