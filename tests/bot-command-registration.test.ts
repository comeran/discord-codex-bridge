import { describe, expect, it, vi } from "vitest";

import {
  buildGuildCommandDefinitions,
  dispatchChatInputCommand
} from "../src/bot/bot.js";

describe("Discord bot command registration", () => {
  it("registers every supported slash command family", () => {
    const definitions = buildGuildCommandDefinitions();
    const names = definitions.map(
      (definition) => (definition as { name: string }).name
    );

    expect(names).toEqual([
      "sandbox",
      "project",
      "session",
      "run",
      "review",
      "cancel",
      "status",
      "skill",
      "mcp"
    ]);
  });

  it("routes chat input interactions to the matching handler", async () => {
    const first = {
      handle: vi.fn(async () => false)
    };
    const second = {
      handle: vi.fn(async () => true)
    };

    const handled = await dispatchChatInputCommand(
      {
        commandName: "status"
      } as never,
      [first, second]
    );

    expect(handled).toBe(true);
    expect(first.handle).toHaveBeenCalledTimes(1);
    expect(second.handle).toHaveBeenCalledTimes(1);
  });
});
