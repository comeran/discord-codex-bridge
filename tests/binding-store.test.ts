import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

describe("FileBindingStore", () => {
  it("persists and retrieves bindings by channel id", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "binding-store-test-"));
    tempDirs.push(tempDir);

    const store = FileBindingStore.fromFile(path.join(tempDir, "bindings.json"));

    const saved = await store.upsert({
      guildId: "guild-1",
      channelId: "channel-1",
      projectPath: "/tmp/project-a"
    });

    const loaded = await store.getByChannelId("channel-1");
    const allBindings = await store.list();

    expect(loaded).toEqual(saved);
    expect(allBindings).toHaveLength(1);
    expect(allBindings[0]?.projectPath).toBe("/tmp/project-a");
  });

  it("removes bindings cleanly", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "binding-store-test-"));
    tempDirs.push(tempDir);

    const store = FileBindingStore.fromFile(path.join(tempDir, "bindings.json"));

    await store.upsert({
      guildId: "guild-1",
      channelId: "channel-1",
      projectPath: "/tmp/project-a"
    });

    expect(await store.remove("channel-1")).toBe(true);
    expect(await store.getByChannelId("channel-1")).toBeNull();
  });
});
