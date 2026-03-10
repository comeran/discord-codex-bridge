import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ChannelStatusService } from "../src/core/channel-status-service.js";
import { ChannelTaskQueue } from "../src/core/channel-task-queue.js";
import { FileSessionStore } from "../src/store/session-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("ChannelStatusService", () => {
  it("reports an idle channel when nothing is running", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "channel-status-test-"));
    tempDirs.push(tempDir);

    const service = new ChannelStatusService({
      queue: new ChannelTaskQueue(),
      sessionStore: FileSessionStore.fromFile(path.join(tempDir, "sessions.json"))
    });

    const status = await service.getByChannelId("channel-idle");

    expect(status.state).toBe("idle");
    expect(status.pendingCount).toBe(0);
    expect(status.queuedCount).toBe(0);
    expect(status.activeTaskId).toBeNull();
    expect(status.activePromptPreview).toBeNull();
    expect(status.session).toBeNull();
  });

  it("reports the active task and queued depth for a busy channel", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "channel-status-test-"));
    tempDirs.push(tempDir);

    const queue = new ChannelTaskQueue();
    const sessionStore = FileSessionStore.fromFile(path.join(tempDir, "sessions.json"));
    await sessionStore.upsert({
      channelId: "channel-busy",
      historySummary: "Last request: add tests\nLast result: done",
      lastCodexSessionId: "session-42",
      lastTaskId: "task-previous"
    });

    const service = new ChannelStatusService({
      queue,
      sessionStore
    });

    let releaseFirstTask!: () => void;
    const firstTaskDone = new Promise<void>((resolve) => {
      releaseFirstTask = resolve;
    });

    let firstTaskStarted!: () => void;
    const firstTaskRunning = new Promise<void>((resolve) => {
      firstTaskStarted = resolve;
    });

    const first = queue.enqueue(
      "channel-busy",
      async () => {
        firstTaskStarted();
        await firstTaskDone;
      },
      {
        taskId: "task-1",
        promptPreview: "Inspect the current repository status."
      }
    );

    await firstTaskRunning;

    const second = queue.enqueue(
      "channel-busy",
      async () => {},
      {
        taskId: "task-2",
        promptPreview: "Summarize the open work."
      }
    );

    const status = await service.getByChannelId("channel-busy");

    expect(status.state).toBe("running");
    expect(status.pendingCount).toBe(2);
    expect(status.queuedCount).toBe(1);
    expect(status.activeTaskId).toBe("task-1");
    expect(status.activePromptPreview).toBe("Inspect the current repository status.");
    expect(status.session?.lastCodexSessionId).toBe("session-42");
    expect(status.session?.lastTaskId).toBe("task-previous");

    releaseFirstTask();
    await Promise.all([first, second]);
  });
});
