import { describe, expect, it, vi } from "vitest";

import {
  SkillCommandHandler,
  skillCommandDefinition
} from "../src/bot/skill-command-handler.js";
import type { SkillDiscoveryService } from "../src/core/skill-discovery-service.js";

describe("SkillCommandHandler", () => {
  it("lists available local skills", async () => {
    const discoveryService: SkillDiscoveryService = {
      list: vi.fn(async () => [
        {
          name: "playwright",
          description: "Browser automation via Playwright",
          filePath: "/Users/zane/.codex/skills/playwright/SKILL.md",
          source: "user"
        },
        {
          name: "brainstorming",
          description: "Design before implementation",
          filePath: "/Users/zane/.codex/superpowers/skills/brainstorming/SKILL.md",
          source: "superpowers"
        }
      ]),
      getByName: vi.fn(async () => null)
    };

    const handler = new SkillCommandHandler({ discoveryService });
    const interaction = createInteraction({
      subcommand: "list"
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("playwright"),
      ephemeral: true
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("brainstorming"),
      ephemeral: true
    });
  });

  it("shows one named skill and reports a clean miss", async () => {
    const discoveryService: SkillDiscoveryService = {
      list: vi.fn(async () => []),
      getByName: vi.fn(async (name: string) =>
        name === "playwright"
          ? {
              name: "playwright",
              description: "Browser automation via Playwright",
              filePath: "/Users/zane/.codex/skills/playwright/SKILL.md",
              source: "user"
            }
          : null
      )
    };

    const handler = new SkillCommandHandler({ discoveryService });
    const showInteraction = createInteraction({
      subcommand: "show",
      strings: {
        name: "playwright"
      }
    });

    await handler.handle(showInteraction);

    expect(showInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("/Users/zane/.codex/skills/playwright/SKILL.md"),
      ephemeral: true
    });

    const missInteraction = createInteraction({
      subcommand: "show",
      strings: {
        name: "missing"
      }
    });

    await handler.handle(missInteraction);

    expect(missInteraction.reply).toHaveBeenCalledWith({
      content: "未找到名为 `missing` 的 skill。",
      ephemeral: true
    });
  });

  it("defines list and show subcommands", () => {
    expect(skillCommandDefinition).toMatchObject({
      name: "skill",
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
    commandName: "skill",
    channelId: "channel-skill",
    guildId: "guild-1",
    inGuild: () => true,
    options: {
      getSubcommand: vi.fn(() => options.subcommand),
      getString: vi.fn((name: string) => options.strings?.[name] ?? null)
    },
    reply: vi.fn(async () => {})
  } as const;
}
