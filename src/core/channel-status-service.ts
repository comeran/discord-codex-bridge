import type { SessionStore } from "../store/session-store.js";
import type { ChannelSession } from "../types/domain.js";
import { ChannelTaskQueue } from "./channel-task-queue.js";

export interface ChannelStatusServiceDeps {
  queue: ChannelTaskQueue;
  sessionStore: SessionStore;
}

export interface ChannelStatusSnapshot {
  channelId: string;
  state: "idle" | "running";
  pendingCount: number;
  queuedCount: number;
  activeTaskId: string | null;
  activePromptPreview: string | null;
  session: ChannelSession | null;
}

export class ChannelStatusService {
  public constructor(private readonly deps: ChannelStatusServiceDeps) {}

  public async getByChannelId(channelId: string): Promise<ChannelStatusSnapshot> {
    const [session, runtime] = await Promise.all([
      this.deps.sessionStore.getByChannelId(channelId),
      Promise.resolve(this.deps.queue.getRuntimeState(channelId))
    ]);

    return {
      channelId,
      state: runtime.isRunning ? "running" : "idle",
      pendingCount: runtime.pendingCount,
      queuedCount: runtime.queuedCount,
      activeTaskId: runtime.activeTaskId,
      activePromptPreview: runtime.activePromptPreview,
      session
    };
  }
}
