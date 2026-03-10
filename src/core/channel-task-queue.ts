interface QueueState {
  pending: number;
  tail: Promise<void>;
}

export class ChannelTaskQueue {
  private readonly states = new Map<string, QueueState>();

  public getPendingCount(channelId: string): number {
    return this.states.get(channelId)?.pending ?? 0;
  }

  public enqueue<T>(channelId: string, task: () => Promise<T>): Promise<T> {
    const state = this.states.get(channelId) ?? {
      pending: 0,
      tail: Promise.resolve()
    };

    state.pending += 1;

    const result = state.tail.catch(ignoreError).then(task);
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
