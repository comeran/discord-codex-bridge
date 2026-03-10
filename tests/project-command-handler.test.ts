import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ChatInputCommandInteraction } from "discord.js";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProjectCommandHandler,
  projectCommandDefinition
} from "../src/bot/project-command-handler.js";
import { FileBindingStore } from "../src/store/binding-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("ProjectCommandHandler", () => {
  it("binds an absolute project path to the current channel", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "project-command-test-"));
    tempDirs.push(tempDir);

    const projectDir = await mkdtemp(path.join(tmpdir(), "project-bind-target-"));
    tempDirs.push(projectDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    const handler = new ProjectCommandHandler({
      bindingStore,
      logger: pino({ level: "silent" })
    });

    const interaction = createInteraction({
      commandName: "project",
      subcommand: "bind",
      channelId: "channel-project",
      guildId: "guild-1",
      strings: {
        path: projectDir
      }
    });

    const handled = await handler.handle(interaction);
    const binding = await bindingStore.getByChannelId("channel-project");

    expect(handled).toBe(true);
    expect(binding?.projectPath).toBe(projectDir);
    expect(binding?.sandboxMode).toBe("workspace-write");
    expect(interaction.reply).toHaveBeenCalledWith({
      content: `已将当前频道绑定到 \`${projectDir}\`。`,
      ephemeral: true
    });
  });

  it("shows the current binding and removes it on unbind", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "project-command-test-"));
    tempDirs.push(tempDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    await bindingStore.upsert({
      guildId: "guild-1",
      channelId: "channel-project",
      projectPath: "/tmp/example-project"
    });

    const handler = new ProjectCommandHandler({
      bindingStore,
      logger: pino({ level: "silent" })
    });

    const showInteraction = createInteraction({
      commandName: "project",
      subcommand: "show",
      channelId: "channel-project",
      guildId: "guild-1"
    });

    await handler.handle(showInteraction);

    expect(showInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("当前绑定项目：`/tmp/example-project`"),
      ephemeral: true
    });

    const unbindInteraction = createInteraction({
      commandName: "project",
      subcommand: "unbind",
      channelId: "channel-project",
      guildId: "guild-1"
    });

    await handler.handle(unbindInteraction);

    expect(await bindingStore.getByChannelId("channel-project")).toBeNull();
    expect(unbindInteraction.reply).toHaveBeenCalledWith({
      content: "已移除当前频道绑定。",
      ephemeral: true
    });
  });

  it("defines bind, show, and unbind project subcommands", () => {
    expect(projectCommandDefinition).toMatchObject({
      name: "project",
      options: [
        { name: "bind" },
        { name: "show" },
        { name: "unbind" }
      ]
    });
  });
});

interface InteractionOptions {
  commandName: string;
  subcommand: string;
  channelId: string;
  guildId: string;
  strings?: Record<string, string>;
}

function createInteraction(options: InteractionOptions) {
  return {
    commandName: options.commandName,
    channelId: options.channelId,
    guildId: options.guildId,
    inGuild: () => true,
    options: {
      getSubcommand: vi.fn(() => options.subcommand),
      getString: vi.fn((name: string) => options.strings?.[name] ?? null)
    },
    reply: vi.fn(async () => {})
  } as unknown as ChatInputCommandInteraction;
}
