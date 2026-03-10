import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { ChannelTaskQueue } from "../src/core/channel-task-queue.js";

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
});
