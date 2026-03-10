import { JsonFileStore } from "./file-store.js";

import type { ChannelBinding } from "../types/domain.js";

type BindingMap = Record<string, ChannelBinding>;

export interface UpsertChannelBindingInput {
  guildId: string;
  channelId: string;
  projectPath: string;
}

export interface BindingStore {
  getByChannelId(channelId: string): Promise<ChannelBinding | null>;
  upsert(input: UpsertChannelBindingInput): Promise<ChannelBinding>;
  remove(channelId: string): Promise<boolean>;
  list(): Promise<ChannelBinding[]>;
}

export class FileBindingStore implements BindingStore {
  public static fromFile(filePath: string): FileBindingStore {
    return new FileBindingStore(new JsonFileStore<BindingMap>(filePath, () => ({})));
  }

  public constructor(private readonly store: JsonFileStore<BindingMap>) {}

  public async getByChannelId(channelId: string): Promise<ChannelBinding | null> {
    const bindings = await this.store.read();
    return bindings[channelId] ?? null;
  }

  public async upsert(input: UpsertChannelBindingInput): Promise<ChannelBinding> {
    let savedBinding!: ChannelBinding;

    await this.store.update((current) => {
      const now = new Date().toISOString();
      const existing = current[input.channelId];

      savedBinding = {
        guildId: input.guildId,
        channelId: input.channelId,
        projectPath: input.projectPath,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };

      return {
        ...current,
        [input.channelId]: savedBinding
      };
    });

    return savedBinding;
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
    return Object.values(bindings).sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt)
    );
  }
}
