import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  ChannelTaskQueue,
  QueueTaskCancelledError
} from "../src/core/channel-task-queue.js";

describe("ChannelTaskQueue", () => {
  it("runs tasks serially within the same channel", async () => {
    const queue = new ChannelTaskQueue();
    const events: string[] = [];

    const first = queue.enqueue("channel-a", async () => {
      events.push("first:start");
      await delay(30);
      events.push("first:end");
      return "first";
    });

    const second = queue.enqueue("channel-a", async () => {
      events.push("second:start");
      events.push("second:end");
      return "second";
    });

    await Promise.all([first, second]);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end"
    ]);
  });

  it("allows different channels to execute independently", async () => {
    const queue = new ChannelTaskQueue();
    let firstChannelRunning = false;
    let secondObservedOverlap = false;

    const first = queue.enqueue("channel-a", async () => {
      firstChannelRunning = true;
      await delay(40);
      firstChannelRunning = false;
    });

    const second = queue.enqueue("channel-b", async () => {
      secondObservedOverlap = firstChannelRunning;
    });

    await Promise.all([first, second]);

    expect(secondObservedOverlap).toBe(true);
  });

  it("cancels the next queued task without interrupting the active task", async () => {
    const queue = new ChannelTaskQueue();
    let releaseFirstTask!: () => void;
    const firstTaskDone = new Promise<void>((resolve) => {
      releaseFirstTask = resolve;
    });

    let firstTaskStarted!: () => void;
    const firstTaskRunning = new Promise<void>((resolve) => {
      firstTaskStarted = resolve;
    });

    const first = queue.enqueue(
      "channel-a",
      async () => {
        firstTaskStarted();
        await firstTaskDone;
        return "first";
      },
      {
        taskId: "task-1",
        taskType: "run",
        promptPreview: "Implement the feature."
      }
    );

    await firstTaskRunning;

    const second = queue.enqueue(
      "channel-a",
      async () => "second",
      {
        taskId: "task-2",
        taskType: "review",
        promptPreview: "Review the current diff."
      }
    );

    const cancelled = await queue.cancelNext("channel-a");
    const runtime = queue.getRuntimeState("channel-a");

    expect(cancelled).toMatchObject({
      taskId: "task-2",
      taskType: "review",
      scope: "queued"
    });
    expect(runtime.pendingCount).toBe(1);
    expect(runtime.queuedCount).toBe(0);
    expect(runtime.activeTaskId).toBe("task-1");
    expect(runtime.activeTaskType).toBe("run");
    expect(runtime.hasCancellableTask).toBe(false);
    await expect(second).rejects.toBeInstanceOf(QueueTaskCancelledError);

    releaseFirstTask();
    await expect(first).resolves.toBe("first");
  });

  it("invokes the active task cancellation hook and reports cancellable state", async () => {
    const queue = new ChannelTaskQueue();
    let cancelCalled = false;
    let releaseFirstTask!: () => void;
    const firstTaskDone = new Promise<void>((resolve) => {
      releaseFirstTask = resolve;
    });

    let firstTaskStarted!: () => void;
    const firstTaskRunning = new Promise<void>((resolve) => {
      firstTaskStarted = resolve;
    });

    const first = queue.enqueue(
      "channel-a",
      async () => {
        firstTaskStarted();
        await firstTaskDone;
        return "first";
      },
      {
        taskId: "task-1",
        taskType: "run",
        promptPreview: "Implement the feature.",
        onCancel: async () => {
          cancelCalled = true;
          releaseFirstTask();
        }
      }
    );

    await firstTaskRunning;

    const cancelled = await queue.cancelActive("channel-a");
    const runtime = queue.getRuntimeState("channel-a");

    expect(cancelCalled).toBe(true);
    expect(cancelled).toMatchObject({
      taskId: "task-1",
      taskType: "run",
      scope: "active"
    });
    expect(runtime.activeTaskId).toBe("task-1");
    expect(runtime.activeTaskType).toBe("run");
    expect(runtime.hasCancellableTask).toBe(true);

    await expect(first).resolves.toBe("first");
  });
});
