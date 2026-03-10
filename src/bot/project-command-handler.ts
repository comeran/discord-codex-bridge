import path from "node:path";
import { stat } from "node:fs/promises";

import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";
import type { Logger } from "pino";

import type { BindingStore } from "../store/binding-store.js";

export const projectCommandDefinition: ApplicationCommandDataResolvable = {
  name: "project",
  description: "Manage the project bound to this Discord channel",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "bind",
      description: "Bind this channel to a local project directory",
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "path",
          description: "Absolute path to the local project directory",
          required: true
        }
      ]
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "show",
      description: "Show the current channel project binding"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "unbind",
      description: "Remove the current channel project binding"
    }
  ]
};

export interface ProjectCommandHandlerDeps {
  bindingStore: BindingStore;
  logger: Logger;
}

export class ProjectCommandHandler {
  public constructor(private readonly deps: ProjectCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "project") {
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
      case "bind":
        await this.handleBind(interaction);
        return true;
      case "show":
        await this.handleShow(interaction);
        return true;
      case "unbind":
        await this.handleUnbind(interaction);
        return true;
      default:
        await interaction.reply({
          content: "未知的 project 子命令。",
          ephemeral: true
        });
        return true;
    }
  }

  private async handleBind(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const projectPath = normalizeInput(
      interaction.options.getString("path", true) ?? ""
    );

    if (!projectPath) {
      await interaction.reply({
        content: "请提供要绑定的项目绝对路径。",
        ephemeral: true
      });
      return;
    }

    if (!path.isAbsolute(projectPath)) {
      await interaction.reply({
        content: "请使用绝对路径绑定项目目录。",
        ephemeral: true
      });
      return;
    }

    try {
      const target = await stat(projectPath);
      if (!target.isDirectory()) {
        await interaction.reply({
          content: "绑定失败：目标路径不是目录。",
          ephemeral: true
        });
        return;
      }
    } catch {
      await interaction.reply({
        content: "绑定失败：目标路径不存在或不可访问。",
        ephemeral: true
      });
      return;
    }

    const binding = await this.deps.bindingStore.upsert({
      guildId: interaction.guildId ?? "unknown",
      channelId: interaction.channelId,
      projectPath
    });

    this.deps.logger.info(
      {
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        projectPath: binding.projectPath
      },
      "Channel project binding updated"
    );

    await interaction.reply({
      content: `已将当前频道绑定到 \`${binding.projectPath}\`。`,
      ephemeral: true
    });
  }

  private async handleShow(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const binding = await this.deps.bindingStore.getByChannelId(interaction.channelId);
    if (!binding) {
      await interaction.reply({
        content: "当前频道还没有绑定项目。",
        ephemeral: true
      });
      return;
    }

    const sandboxSource =
      binding.sandboxModeSource === "channel" ? "频道自定义" : "全局默认";

    await interaction.reply({
      content: [
        `当前绑定项目：\`${binding.projectPath}\``,
        `当前沙箱模式：\`${binding.sandboxMode}\``,
        `来源：${sandboxSource}`
      ].join("\n"),
      ephemeral: true
    });
  }

  private async handleUnbind(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const removed = await this.deps.bindingStore.remove(interaction.channelId);

    await interaction.reply({
      content: removed ? "已移除当前频道绑定。" : "当前频道没有可移除的绑定。",
      ephemeral: true
    });
  }
}

function normalizeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}
