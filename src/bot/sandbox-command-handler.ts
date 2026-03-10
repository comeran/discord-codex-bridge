import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";
import type { Logger } from "pino";

import type { CodexSandboxMode } from "../types/config.js";
import type { BindingStore } from "../store/binding-store.js";

export const sandboxCommandDefinition: ApplicationCommandDataResolvable = {
  name: "sandbox",
  description: "Show or change the current channel sandbox mode",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "show",
      description: "Show the current channel sandbox mode"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "set",
      description: "Set the sandbox mode for this channel",
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "mode",
          description: "Sandbox mode for tasks in this channel",
          required: true,
          choices: [
            {
              name: "read-only",
              value: "read-only"
            },
            {
              name: "workspace-write",
              value: "workspace-write"
            },
            {
              name: "danger-full-access",
              value: "danger-full-access"
            }
          ]
        }
      ]
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "reset",
      description: "Reset this channel to the default sandbox mode"
    }
  ]
};

export interface SandboxCommandHandlerDeps {
  bindingStore: BindingStore;
  logger: Logger;
}

export class SandboxCommandHandler {
  public constructor(private readonly deps: SandboxCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "sandbox") {
      return false;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "这个命令只能在服务器频道中使用。",
        ephemeral: true
      });
      return true;
    }

    const subcommand = interaction.options.getSubcommand(true);
    switch (subcommand) {
      case "show":
        await this.handleShow(interaction);
        return true;
      case "set":
        await this.handleSet(interaction);
        return true;
      case "reset":
        await this.handleReset(interaction);
        return true;
      default:
        await interaction.reply({
          content: "未知的 sandbox 子命令。",
          ephemeral: true
        });
        return true;
    }
  }

  private async handleShow(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const binding = await this.deps.bindingStore.getByChannelId(interaction.channelId);
    if (!binding) {
      await interaction.reply({
        content: "当前频道还没有绑定项目，无法查看沙箱模式。",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: formatSandboxStatus(binding.projectPath, binding.sandboxMode, binding.sandboxModeSource),
      ephemeral: true
    });
  }

  private async handleSet(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const mode = interaction.options.getString("mode", true) as CodexSandboxMode;
    const binding = await this.deps.bindingStore.setSandboxMode(
      interaction.channelId,
      mode
    );

    if (!binding) {
      await interaction.reply({
        content: "当前频道还没有绑定项目，无法设置沙箱模式。",
        ephemeral: true
      });
      return;
    }

    this.deps.logger.warn(
      {
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        sandboxMode: mode
      },
      "Channel sandbox mode updated"
    );

    const riskNotice =
      mode === "danger-full-access"
        ? "\n\n警告：该模式允许后续任务写入 `.git` 并执行高风险命令。"
        : "";

    await interaction.reply({
      content: `已将当前频道的沙箱模式设置为 \`${mode}\`。${riskNotice}`,
      ephemeral: true
    });
  }

  private async handleReset(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const binding = await this.deps.bindingStore.resetSandboxMode(
      interaction.channelId
    );

    if (!binding) {
      await interaction.reply({
        content: "当前频道还没有绑定项目，无法重置沙箱模式。",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `已将当前频道恢复为默认沙箱模式 \`${binding.sandboxMode}\`。`,
      ephemeral: true
    });
  }
}

function formatSandboxStatus(
  projectPath: string,
  sandboxMode: CodexSandboxMode,
  sandboxModeSource: "default" | "channel"
): string {
  const sourceLabel =
    sandboxModeSource === "channel" ? "频道自定义" : "全局默认";

  return [
    `当前绑定项目：\`${projectPath}\``,
    `当前沙箱模式：\`${sandboxMode}\``,
    `来源：${sourceLabel}`
  ].join("\n");
}
