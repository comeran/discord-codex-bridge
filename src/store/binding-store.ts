import { JsonFileStore } from "./file-store.js";

import type { CodexSandboxMode } from "../types/config.js";
import type { ChannelBinding } from "../types/domain.js";

interface StoredChannelBinding {
  guildId: string;
  channelId: string;
  projectPath: string;
  sandboxMode?: CodexSandboxMode;
  createdAt: string;
  updatedAt: string;
}

type BindingMap = Record<string, StoredChannelBinding>;

export interface UpsertChannelBindingInput {
  guildId: string;
  channelId: string;
  projectPath: string;
}

export interface BindingStore {
  getByChannelId(channelId: string): Promise<ChannelBinding | null>;
  upsert(input: UpsertChannelBindingInput): Promise<ChannelBinding>;
  setSandboxMode(
    channelId: string,
    sandboxMode: CodexSandboxMode
  ): Promise<ChannelBinding | null>;
  resetSandboxMode(channelId: string): Promise<ChannelBinding | null>;
  remove(channelId: string): Promise<boolean>;
  list(): Promise<ChannelBinding[]>;
}

export class FileBindingStore implements BindingStore {
  public static fromFile(
    filePath: string,
    defaultSandboxMode: CodexSandboxMode
  ): FileBindingStore {
    return new FileBindingStore(
      new JsonFileStore<BindingMap>(filePath, () => ({})),
      defaultSandboxMode
    );
  }

  public constructor(
    private readonly store: JsonFileStore<BindingMap>,
    private readonly defaultSandboxMode: CodexSandboxMode
  ) {}

  public async getByChannelId(channelId: string): Promise<ChannelBinding | null> {
    const bindings = await this.store.read();
    const binding = bindings[channelId];
    return binding ? this.toChannelBinding(binding) : null;
  }

  public async upsert(input: UpsertChannelBindingInput): Promise<ChannelBinding> {
    let savedBinding!: StoredChannelBinding;

    await this.store.update((current) => {
      const now = new Date().toISOString();
      const existing = current[input.channelId];

      savedBinding = {
        guildId: input.guildId,
        channelId: input.channelId,
        projectPath: input.projectPath,
        ...(existing?.sandboxMode ? { sandboxMode: existing.sandboxMode } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      return {
        ...current,
        [input.channelId]: savedBinding
      };
    });

    return this.toChannelBinding(savedBinding);
  }

  public async setSandboxMode(
    channelId: string,
    sandboxMode: CodexSandboxMode
  ): Promise<ChannelBinding | null> {
    let updatedBinding: StoredChannelBinding | null = null;

    await this.store.update((current) => {
      const existing = current[channelId];
      if (!existing) {
        return current;
      }

      updatedBinding = {
        ...existing,
        sandboxMode,
        updatedAt: new Date().toISOString()
      };

      return {
        ...current,
        [channelId]: updatedBinding
      };
    });

    return updatedBinding ? this.toChannelBinding(updatedBinding) : null;
  }

  public async resetSandboxMode(channelId: string): Promise<ChannelBinding | null> {
    let updatedBinding: StoredChannelBinding | null = null;

    await this.store.update((current) => {
      const existing = current[channelId];
      if (!existing) {
        return current;
      }

      updatedBinding = {
        guildId: existing.guildId,
        channelId: existing.channelId,
        projectPath: existing.projectPath,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString()
      };

      return {
        ...current,
        [channelId]: updatedBinding
      };
    });

    return updatedBinding ? this.toChannelBinding(updatedBinding) : null;
  }

  public async remove(channelId: string): Promise<boolean> {
    let removed = false;

    await this.store.update((current) => {
      if (!(channelId in current)) {
        return current;
      }

      removed = true;
      const next = { ...current };
      delete next[channelId];
      return next;
    });

    return removed;
  }

  public async list(): Promise<ChannelBinding[]> {
    const bindings = await this.store.read();
    return Object.values(bindings)
      .map((binding) => this.toChannelBinding(binding))
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  }

  private toChannelBinding(binding: StoredChannelBinding): ChannelBinding {
    return {
      guildId: binding.guildId,
      channelId: binding.channelId,
      projectPath: binding.projectPath,
      sandboxMode: binding.sandboxMode ?? this.defaultSandboxMode,
      sandboxModeSource: binding.sandboxMode ? "channel" : "default",
      createdAt: binding.createdAt,
      updatedAt: binding.updatedAt
    };
  }
}
