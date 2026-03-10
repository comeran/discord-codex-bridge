import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";

import type { McpDiscoveryService } from "../core/mcp-discovery-service.js";

export const mcpCommandDefinition: ApplicationCommandDataResolvable = {
  name: "mcp",
  description: "Inspect configured local MCP servers",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "list",
      description: "List configured MCP servers"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "show",
      description: "Show one configured MCP server",
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: "name",
          description: "MCP server name",
          required: true
        }
      ]
    }
  ]
};

export interface McpCommandHandlerDeps {
  discoveryService: McpDiscoveryService;
}

export class McpCommandHandler {
  public constructor(private readonly deps: McpCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "mcp") {
      return false;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "这个命令只能在服务器频道中使用。",
        ephemeral: true
      });
      return true;
    }

    try {
      switch (interaction.options.getSubcommand(true)) {
        case "list":
          await this.handleList(interaction);
          return true;
        case "show":
          await this.handleShow(interaction);
          return true;
        default:
          await interaction.reply({
            content: "未知的 mcp 子命令。",
            ephemeral: true
          });
          return true;
      }
    } catch {
      await interaction.reply({
        content: "当前无法读取 MCP 配置。",
        ephemeral: true
      });
      return true;
    }
  }

  private async handleList(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const servers = await this.deps.discoveryService.list();
    if (servers.length === 0) {
      await interaction.reply({
        content: "当前没有发现已配置的 MCP server。",
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: servers
        .map((server) => {
          const command =
            server.command === null
              ? "未记录命令"
              : [server.command, ...server.args].join(" ");

          return `- \`${server.name}\`: ${command}`;
        })
        .join("\n"),
      ephemeral: true
    });
  }

  private async handleShow(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString("name", true);
    const server = await this.deps.discoveryService.getByName(name);

    if (!server) {
      await interaction.reply({
        content: `未找到名为 \`${name}\` 的 MCP server。`,
        ephemeral: true
      });
      return;
    }

    const command =
      server.command === null
        ? "未记录命令"
        : [server.command, ...server.args].join(" ");

    await interaction.reply({
      content: [
        `名称：\`${server.name}\``,
        `命令：${command}`,
        `来源：\`${server.source}\``
      ].join("\n"),
      ephemeral: true
    });
  }
}
