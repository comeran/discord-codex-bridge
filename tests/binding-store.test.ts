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

    const store = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );

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
    expect(allBindings[0]?.sandboxMode).toBe("workspace-write");
    expect(allBindings[0]?.sandboxModeSource).toBe("default");
  });

  it("removes bindings cleanly", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "binding-store-test-"));
    tempDirs.push(tempDir);

    const store = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );

    await store.upsert({
      guildId: "guild-1",
      channelId: "channel-1",
      projectPath: "/tmp/project-a"
    });

    expect(await store.remove("channel-1")).toBe(true);
    expect(await store.getByChannelId("channel-1")).toBeNull();
  });

  it("resolves missing sandbox values to the configured default", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "binding-store-test-"));
    tempDirs.push(tempDir);

    const store = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "danger-full-access"
    );

    const saved = await store.upsert({
      guildId: "guild-1",
      channelId: "channel-2",
      projectPath: "/tmp/project-b"
    });

    expect(saved.sandboxMode).toBe("danger-full-access");
    expect(saved.sandboxModeSource).toBe("default");
  });

  it("persists a channel-level sandbox override", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "binding-store-test-"));
    tempDirs.push(tempDir);

    const store = FileBindingStore.fromFile(
      path.join(tempDir, "bindings.json"),
      "workspace-write"
    );

    await store.upsert({
      guildId: "guild-1",
      channelId: "channel-3",
      projectPath: "/tmp/project-c"
    });

    const updated = await store.setSandboxMode("channel-3", "danger-full-access");
    const loaded = await store.getByChannelId("channel-3");

    expect(updated?.sandboxMode).toBe("danger-full-access");
    expect(updated?.sandboxModeSource).toBe("channel");
    expect(loaded?.sandboxMode).toBe("danger-full-access");
    expect(loaded?.sandboxModeSource).toBe("channel");
  });
});
