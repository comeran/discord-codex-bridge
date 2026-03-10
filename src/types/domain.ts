import type { CodexSandboxMode } from "./config.js";

export type TaskStatus = "queued" | "running" | "completed" | "failed";
export type SandboxModeSource = "default" | "channel";

export interface ChannelBinding {
  guildId: string;
  channelId: string;
  projectPath: string;
  sandboxMode: CodexSandboxMode;
  sandboxModeSource: SandboxModeSource;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelSession {
  channelId: string;
  historySummary: string;
  lastCodexSessionId?: string | null;
  lastTaskId?: string | null;
  updatedAt: string;
}

export interface TaskRecord {
  taskId: string;
  guildId: string;
  channelId: string;
  userId: string;
  projectPath: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface TaskRequest {
  guildId: string;
  channelId: string;
  userId: string;
  prompt: string;
  binding: ChannelBinding;
}

export interface TaskExecutionResult {
  task: TaskRecord;
  status: Extract<TaskStatus, "completed" | "failed">;
  output: string;
  durationMs: number;
  stderr?: string;
  error?: string;
}

export interface TaskSubmission {
  taskId: string;
  queuedAhead: number;
  completion: Promise<TaskExecutionResult>;
}
