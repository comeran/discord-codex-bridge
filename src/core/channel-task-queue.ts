export type QueueTaskType = "run" | "review";

export interface QueueTaskMetadata {
  taskId?: string;
  taskType?: QueueTaskType;
  promptPreview?: string;
  onCancel?: () => Promise<void> | void;
}

export interface QueueCancellationResult {
  taskId: string | null;
  taskType: QueueTaskType | null;
  promptPreview: string | null;
  scope: "active" | "queued";
}

export class QueueTaskCancelledError extends Error {
  public constructor(public readonly taskId: string | null) {
    super(taskId ? `Task ${taskId} was cancelled.` : "Task was cancelled.");
    this.name = "QueueTaskCancelledError";
  }
}

export interface ChannelQueueRuntimeState {
  pendingCount: number;
  queuedCount: number;
  isRunning: boolean;
  activeTaskId: string | null;
  activeTaskType: QueueTaskType | null;
  activePromptPreview: string | null;
  hasCancellableTask: boolean;
}

interface QueueState {
  activeTask: QueueTaskEntry | null;
  pendingTasks: QueueTaskEntry[];
}

interface QueueTaskEntry {
  task: () => Promise<unknown>;
  metadata: QueueTaskMetadata;
  deferred: Deferred<unknown>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export class ChannelTaskQueue {
  private readonly states = new Map<string, QueueState>();

  public getPendingCount(channelId: string): number {
    const state = this.states.get(channelId);
    if (!state) {
      return 0;
    }

    return state.pendingTasks.length + (state.activeTask ? 1 : 0);
  }

  public getRuntimeState(channelId: string): ChannelQueueRuntimeState {
    const state = this.states.get(channelId);
    const activeTask = state?.activeTask ?? null;

    return {
      pendingCount: this.getPendingCount(channelId),
      queuedCount: state?.pendingTasks.length ?? 0,
      isRunning: activeTask !== null,
      activeTaskId: activeTask?.metadata.taskId ?? null,
      activeTaskType: activeTask?.metadata.taskType ?? null,
      activePromptPreview: activeTask?.metadata.promptPreview ?? null,
      hasCancellableTask:
        activeTask?.metadata.onCancel !== undefined ||
        (state?.pendingTasks.length ?? 0) > 0
    };
  }

  public enqueue<T>(
    channelId: string,
    task: () => Promise<T>,
    metadata: QueueTaskMetadata = {}
  ): Promise<T> {
    const state = this.getOrCreateState(channelId);
    const deferred = createDeferred<T>();
    const entry: QueueTaskEntry = {
      task: task as () => Promise<unknown>,
      metadata,
      deferred: deferred as Deferred<unknown>
    };

    if (!state.activeTask) {
      this.startEntry(channelId, state, entry);
    } else {
      state.pendingTasks.push(entry);
    }

    return deferred.promise;
  }

  public async cancelActive(
    channelId: string
  ): Promise<QueueCancellationResult | null> {
    const state = this.states.get(channelId);
    const activeTask = state?.activeTask;
    if (!activeTask) {
      return null;
    }

    await activeTask.metadata.onCancel?.();

    return toCancellationResult(activeTask.metadata, "active");
  }

  public async cancelNext(
    channelId: string
  ): Promise<QueueCancellationResult | null> {
    const state = this.states.get(channelId);
    const nextTask = state?.pendingTasks.shift();
    if (!state || !nextTask) {
      return null;
    }

    nextTask.deferred.reject(
      new QueueTaskCancelledError(nextTask.metadata.taskId ?? null)
    );
    this.cleanupState(channelId, state);

    return toCancellationResult(nextTask.metadata, "queued");
  }

  private getOrCreateState(channelId: string): QueueState {
    const existing = this.states.get(channelId);
    if (existing) {
      return existing;
    }

    const created: QueueState = {
      activeTask: null,
      pendingTasks: []
    };
    this.states.set(channelId, created);
    return created;
  }

  private startEntry(
    channelId: string,
    state: QueueState,
    entry: QueueTaskEntry
  ): void {
    state.activeTask = entry;

    void entry.task().then(
      (value) => {
        entry.deferred.resolve(value);
      },
      (error) => {
        entry.deferred.reject(error);
      }
    ).finally(() => {
      const current = this.states.get(channelId);
      if (!current || current.activeTask !== entry) {
        return;
      }

      current.activeTask = null;
      const nextTask = current.pendingTasks.shift();
      if (nextTask) {
        this.startEntry(channelId, current, nextTask);
        return;
      }

      this.cleanupState(channelId, current);
    });
  }

  private cleanupState(channelId: string, state: QueueState): void {
    if (!state.activeTask && state.pendingTasks.length === 0) {
      this.states.delete(channelId);
    }
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  promise.catch(ignorePromiseRejection);

  return {
    promise,
    resolve,
    reject
  };
}

function toCancellationResult(
  metadata: QueueTaskMetadata,
  scope: "active" | "queued"
): QueueCancellationResult {
  return {
    taskId: metadata.taskId ?? null,
    taskType: metadata.taskType ?? null,
    promptPreview: metadata.promptPreview ?? null,
    scope
  };
}

function ignorePromiseRejection(): void {}
