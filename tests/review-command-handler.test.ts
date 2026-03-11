import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ChatInputCommandInteraction } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ReviewCommandHandler,
  reviewCommandDefinition
} from "../src/bot/review-command-handler.js";
import { FileBindingStore } from "../src/store/binding-store.js";
import type { TaskSubmission } from "../src/types/domain.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("ReviewCommandHandler", () => {
  it("uses the default review prompt when the user omits one", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "review-command-test-"));
    tempDirs.push(tempDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    await bindingStore.upsert({
      guildId: "guild-1",
      channelId: "channel-review",
      projectPath: "/tmp/project-review"
    });

    const submit = vi.fn(
      (): TaskSubmission => ({
        taskId: "task-review-1",
        queuedAhead: 0,
        completion: Promise.resolve({
          task: {
            taskId: "task-review-1",
            taskType: "review",
            guildId: "guild-1",
            channelId: "channel-review",
            userId: "user-1",
            projectPath: "/tmp/project-review",
            prompt: "default-review",
            status: "completed",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString()
          },
          status: "completed",
          output: "Review findings.",
          durationMs: 90
        })
      })
    );

    const handler = new ReviewCommandHandler({
      bindingStore,
      orchestrator: { submit } as never
    });

    const interaction = createInteraction({
      channelId: "channel-review",
      guildId: "guild-1",
      userId: "user-1"
    });

    await handler.handle(interaction);

    expect(submit).toHaveBeenCalledWith({
      guildId: "guild-1",
      channelId: "channel-review",
      userId: "user-1",
      taskType: "review",
      prompt: expect.stringContaining("Review the current project"),
      binding: expect.objectContaining({
        projectPath: "/tmp/project-review"
      })
    });
    const firstCall = submit.mock.calls[0] as [{ prompt: string }] | undefined;
    const firstPrompt = firstCall?.[0]?.prompt;
    expect(firstPrompt).toContain("bugs");
    expect(firstPrompt).toContain("regressions");
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining("Review findings.")
    });
  });

  it("uses the provided review prompt verbatim", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "review-command-test-"));
    tempDirs.push(tempDir);

    const bindingStore = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );
    await bindingStore.upsert({
      guildId: "guild-1",
      channelId: "channel-review",
      projectPath: "/tmp/project-review"
    });

    const submit = vi.fn(
      (): TaskSubmission => ({
        taskId: "task-review-2",
        queuedAhead: 0,
        completion: Promise.resolve({
          task: {
            taskId: "task-review-2",
            taskType: "review",
            guildId: "guild-1",
            channelId: "channel-review",
            userId: "user-1",
            projectPath: "/tmp/project-review",
            prompt: "Check the latest TypeScript changes only.",
            status: "completed",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString()
          },
          status: "completed",
          output: "Scoped review findings.",
          durationMs: 70
        })
      })
    );

    const handler = new ReviewCommandHandler({
      bindingStore,
      orchestrator: { submit } as never
    });

    const interaction = createInteraction({
      channelId: "channel-review",
      guildId: "guild-1",
      userId: "user-1",
      prompt: "Check the latest TypeScript changes only."
    });

    await handler.handle(interaction);

    expect(submit).toHaveBeenCalledWith({
      guildId: "guild-1",
      channelId: "channel-review",
      userId: "user-1",
      taskType: "review",
      prompt: "Check the latest TypeScript changes only.",
      binding: expect.objectContaining({
        projectPath: "/tmp/project-review"
      })
    });
  });

  it("defines an optional prompt option for the review command", () => {
    expect(reviewCommandDefinition).toMatchObject({
      name: "review",
      options: [
        {
          name: "prompt",
          required: false
        }
      ]
    });
  });
});

function createInteraction(options: {
  channelId: string;
  guildId: string;
  userId: string;
  prompt?: string;
}) {
  return {
    commandName: "review",
    channelId: options.channelId,
    guildId: options.guildId,
    user: {
      id: options.userId
    },
    inGuild: () => true,
    options: {
      getString: vi.fn((name: string) =>
        name === "prompt" ? options.prompt ?? null : null
      )
    },
    reply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {})
  } as unknown as ChatInputCommandInteraction;
}
