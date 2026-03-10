import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";

import {
  McpCommandHandler,
  mcpCommandDefinition
} from "../src/bot/mcp-command-handler.js";
import type { McpDiscoveryService } from "../src/core/mcp-discovery-service.js";

describe("McpCommandHandler", () => {
  it("lists configured MCP servers and shows one named server", async () => {
    const discoveryService: McpDiscoveryService = {
      list: vi.fn(async () => [
        {
          name: "playwright",
          command: "npx",
          args: ["@playwright/mcp@latest"],
          source: "/Users/zane/.codex/config.toml"
        }
      ]),
      getByName: vi.fn(async (name: string) =>
        name === "playwright"
          ? {
              name: "playwright",
              command: "npx",
              args: ["@playwright/mcp@latest"],
              source: "/Users/zane/.codex/config.toml"
            }
          : null
      )
    };

    const handler = new McpCommandHandler({ discoveryService });
    const listInteraction = createInteraction({
      subcommand: "list"
    });

    await handler.handle(listInteraction);

    expect(listInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("playwright"),
      ephemeral: true
    });

    const showInteraction = createInteraction({
      subcommand: "show",
      strings: {
        name: "playwright"
      }
    });

    await handler.handle(showInteraction);

    expect(showInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("@playwright/mcp@latest"),
      ephemeral: true
    });
  });

  it("reports unavailable MCP discovery without crashing", async () => {
    const discoveryService: McpDiscoveryService = {
      list: vi.fn(async () => {
        throw new Error("config file unavailable");
      }),
      getByName: vi.fn(async () => {
        throw new Error("config file unavailable");
      })
    };

    const handler = new McpCommandHandler({ discoveryService });
    const interaction = createInteraction({
      subcommand: "list"
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: "当前无法读取 MCP 配置。",
      ephemeral: true
    });
  });

  it("defines list and show subcommands", () => {
    expect(mcpCommandDefinition).toMatchObject({
      name: "mcp",
      options: [
        { name: "list" },
        { name: "show" }
      ]
    });
  });
});

function createInteraction(options: {
  subcommand: string;
  strings?: Record<string, string>;
}) {
  return {
    commandName: "mcp",
    channelId: "channel-mcp",
    guildId: "guild-1",
    inGuild: () => true,
    options: {
      getSubcommand: vi.fn(() => options.subcommand),
      getString: vi.fn((name: string) => options.strings?.[name] ?? null)
    },
    reply: vi.fn(async () => {})
  } as unknown as ChatInputCommandInteraction;
}
