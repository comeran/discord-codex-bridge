import { randomUUID } from "node:crypto";

import type { Logger } from "pino";

import type { CodexAdapter } from "../types/adapter.js";
import type {
  ChannelBinding,
  ChannelSession,
  TaskExecutionResult,
  TaskRecord,
  TaskRequest,
  TaskSubmission
} from "../types/domain.js";
import type { SessionStore } from "../store/session-store.js";
import { ChannelTaskQueue } from "./channel-task-queue.js";

export interface TaskOrchestratorDeps {
  codexAdapter: CodexAdapter;
  sessionStore: SessionStore;
  queue: ChannelTaskQueue;
  logger: Logger;
}

export class TaskOrchestrator {
  public constructor(private readonly deps: TaskOrchestratorDeps) {}

  public submit(request: TaskRequest): TaskSubmission {
    const task: TaskRecord = {
      taskId: randomUUID(),
      guildId: request.guildId,
      channelId: request.channelId,
      userId: request.userId,
      projectPath: request.binding.projectPath,
      prompt: request.prompt,
      status: "queued",
      createdAt: new Date().toISOString()
    };

    const queuedAhead = this.deps.queue.getPendingCount(request.channelId);
    const completion = this.deps.queue.enqueue(request.channelId, async () =>
      this.runTask(task, request.binding)
    );

    return {
      taskId: task.taskId,
      queuedAhead,
      completion
    };
  }

  private async runTask(
    task: TaskRecord,
    binding: ChannelBinding
  ): Promise<TaskExecutionResult> {
    const logger = this.deps.logger.child({
      taskId: task.taskId,
      channelId: task.channelId,
      guildId: task.guildId,
      projectPath: binding.projectPath
    });

    const runningTask: TaskRecord = {
      ...task,
      status: "running",
      startedAt: new Date().toISOString()
    };

    logger.info({ phase: "task.running" }, "Starting Codex task");

    try {
      const session = await this.deps.sessionStore.getByChannelId(task.channelId);
      const result = await this.deps.codexAdapter.execute({
        taskId: task.taskId,
        projectPath: binding.projectPath,
        prompt: task.prompt,
        sandboxMode: binding.sandboxMode,
        session
      });

      const finishedAt = new Date().toISOString();
      const nextSession = buildNextSession(
        task,
        session,
        result.ok ? result.content : (result.errorMessage ?? result.stderr),
        !result.ok
      );

      await this.deps.sessionStore.upsert({
        channelId: task.channelId,
        historySummary: nextSession.historySummary,
        lastCodexSessionId: result.sessionId ?? session?.lastCodexSessionId ?? null,
        lastTaskId: task.taskId
      });

      if (result.ok) {
        const completedTask: TaskRecord = {
          ...runningTask,
          status: "completed",
          finishedAt
        };

        logger.info(
          { phase: "task.completed", durationMs: result.durationMs },
          "Codex task completed"
        );

        return {
          task: completedTask,
          status: "completed",
          output: result.content.trim(),
          durationMs: result.durationMs,
          ...(result.stderr.trim() ? { stderr: result.stderr.trim() } : {})
        };
      }

      const errorMessage =
        result.errorMessage?.trim() ||
        result.stderr.trim() ||
        "Codex execution failed.";

      const failedTask: TaskRecord = {
        ...runningTask,
        status: "failed",
        finishedAt,
        error: errorMessage
      };

      logger.error(
        {
          phase: "task.failed",
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          stderr: result.stderr
        },
        "Codex task failed"
      );

      return {
        task: failedTask,
        status: "failed",
        output: result.content.trim(),
        durationMs: result.durationMs,
        error: errorMessage,
        ...(result.stderr.trim() ? { stderr: result.stderr.trim() } : {})
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const failedTask: TaskRecord = {
        ...runningTask,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: message
      };

      await this.deps.sessionStore.upsert({
        channelId: task.channelId,
        historySummary: buildHistorySummary(task.prompt, message, true),
        lastTaskId: task.taskId
      });

      logger.error({ phase: "task.crashed", err: error }, "Task orchestration crashed");

      return {
        task: failedTask,
        status: "failed",
        output: "",
        durationMs: 0,
        error: message
      };
    }
  }
}

function buildNextSession(
  task: TaskRecord,
  existingSession: ChannelSession | null,
  latestOutput: string,
  isError: boolean
): ChannelSession {
  const summary = buildHistorySummary(task.prompt, latestOutput, isError);

  return {
    channelId: task.channelId,
    historySummary: summary,
    lastCodexSessionId: existingSession?.lastCodexSessionId ?? null,
    lastTaskId: task.taskId,
    updatedAt: new Date().toISOString()
  };
}

function buildHistorySummary(
  prompt: string,
  response: string,
  isError = false
): string {
  const prefix = isError ? "Last error" : "Last result";

  return [
    `Last request: ${truncateForSummary(prompt, 240)}`,
    `${prefix}: ${truncateForSummary(response, 800)}`
  ].join("\n");
}

function truncateForSummary(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}
