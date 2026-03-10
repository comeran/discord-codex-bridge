export interface QueueTaskMetadata {
  taskId?: string;
  promptPreview?: string;
}

export interface ChannelQueueRuntimeState {
  pendingCount: number;
  queuedCount: number;
  isRunning: boolean;
  activeTaskId: string | null;
  activePromptPreview: string | null;
}

interface QueueState {
  pending: number;
  tail: Promise<void>;
  activeTask: QueueTaskMetadata | null;
  isRunning: boolean;
}

export class ChannelTaskQueue {
  private readonly states = new Map<string, QueueState>();

  public getPendingCount(channelId: string): number {
    return this.states.get(channelId)?.pending ?? 0;
  }

  public getRuntimeState(channelId: string): ChannelQueueRuntimeState {
    const state = this.states.get(channelId);
    const pendingCount = state?.pending ?? 0;

    return {
      pendingCount,
      queuedCount: Math.max(pendingCount - (state?.isRunning ? 1 : 0), 0),
      isRunning: state?.isRunning ?? false,
      activeTaskId: state?.activeTask?.taskId ?? null,
      activePromptPreview: state?.activeTask?.promptPreview ?? null
    };
  }

  public enqueue<T>(
    channelId: string,
    task: () => Promise<T>,
    metadata: QueueTaskMetadata = {}
  ): Promise<T> {
    const state = this.states.get(channelId) ?? {
      pending: 0,
      tail: Promise.resolve(),
      activeTask: null,
      isRunning: false
    };

    state.pending += 1;

    const result = state.tail.catch(ignoreError).then(async () => {
      state.isRunning = true;
      state.activeTask = metadata;

      try {
        return await task();
      } finally {
        state.isRunning = false;
        state.activeTask = null;
      }
    });

    state.tail = result.then(ignoreVoid, ignoreVoid);
    this.states.set(channelId, state);

    return result.finally(() => {
      const current = this.states.get(channelId);
      if (!current) {
        return;
      }

      current.pending -= 1;
      if (current.pending <= 0) {
        this.states.delete(channelId);
      }
    });
  }
}

function ignoreError(): void {}

function ignoreVoid(): void {}
