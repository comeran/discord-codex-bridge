import type { ChannelSession } from "./domain.js";

export interface CodexExecuteInput {
  taskId: string;
  projectPath: string;
  prompt: string;
  session?: ChannelSession | null;
}

export interface CodexExecuteResult {
  ok: boolean;
  content: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  sessionId?: string | null;
  errorMessage?: string;
}

export interface CodexAdapter {
  execute(input: CodexExecuteInput): Promise<CodexExecuteResult>;
}
