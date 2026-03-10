import { JsonFileStore } from "./file-store.js";

import type { ChannelSession } from "../types/domain.js";

type SessionMap = Record<string, ChannelSession>;

export interface SessionUpdateInput {
  channelId: string;
  historySummary?: string;
  lastCodexSessionId?: string | null;
  lastTaskId?: string | null;
}

export interface SessionStore {
  getByChannelId(channelId: string): Promise<ChannelSession | null>;
  upsert(input: SessionUpdateInput): Promise<ChannelSession>;
  clear(channelId: string): Promise<boolean>;
}

export class FileSessionStore implements SessionStore {
  public static fromFile(filePath: string): FileSessionStore {
    return new FileSessionStore(new JsonFileStore<SessionMap>(filePath, () => ({})));
  }

  public constructor(private readonly store: JsonFileStore<SessionMap>) {}

  public async getByChannelId(channelId: string): Promise<ChannelSession | null> {
    const sessions = await this.store.read();
    return sessions[channelId] ?? null;
  }

  public async upsert(input: SessionUpdateInput): Promise<ChannelSession> {
    let savedSession!: ChannelSession;

    await this.store.update((current) => {
      const now = new Date().toISOString();
      const existing = current[input.channelId];

      savedSession = {
        channelId: input.channelId,
        historySummary: input.historySummary ?? existing?.historySummary ?? "",
        lastCodexSessionId:
          "lastCodexSessionId" in input
            ? input.lastCodexSessionId ?? null
            : existing?.lastCodexSessionId ?? null,
        lastTaskId:
          "lastTaskId" in input
            ? input.lastTaskId ?? null
            : existing?.lastTaskId ?? null,
        updatedAt: now
      };

      return {
        ...current,
        [input.channelId]: savedSession
      };
    });

    return savedSession;
  }

  public async clear(channelId: string): Promise<boolean> {
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
}
