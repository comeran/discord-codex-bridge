import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";

import type { SkillDiscoveryService } from "../core/skill-discovery-service.js";

export const skillCommandDefinition: ApplicationCommandDataResolvable = {
  name: "skill",
  description: "Inspect locally available Codex skills",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "list",
      description: "List available local skills"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "show",
      description: "Show details for one local skill",
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "name",
          description: "Skill name",
          required: true
        }
      ]
    }
  ]
};

export interface SkillCommandHandlerDeps {
  discoveryService: SkillDiscoveryService;
}

export class SkillCommandHandler {
  public constructor(private readonly deps: SkillCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "skill") {
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
      case "list":
        await this.handleList(interaction);
        return true;
      case "show":
        await this.handleShow(interaction);
        return true;
      default:
        await interaction.reply({
          content: "未知的 skill 子命令。",
          ephemeral: true
        });
        return true;
    }
  }

  private async handleList(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const skills = await this.deps.discoveryService.list();
    if (skills.length === 0) {
      await interaction.reply({
        content: "当前没有发现可用的 skill。",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: skills
        .map((skill) => `- \`${skill.name}\`: ${skill.description}`)
        .join("\n"),
      ephemeral: true
    });
  }

  private async handleShow(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString("name", true);
    const skill = await this.deps.discoveryService.getByName(name);

    if (!skill) {
      await interaction.reply({
        content: `未找到名为 \`${name}\` 的 skill。`,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: [
        `名称：\`${skill.name}\``,
        `来源：\`${skill.source}\``,
        `文件：\`${skill.filePath}\``,
        `说明：${skill.description}`
      ].join("\n"),
      ephemeral: true
    });
  }
}
