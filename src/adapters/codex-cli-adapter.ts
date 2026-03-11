import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Logger } from "pino";

import type { CodexAdapter, CodexExecuteInput, CodexExecuteResult } from "../types/adapter.js";
import type { CodexSandboxMode } from "../types/config.js";

export interface CodexCliAdapterOptions {
  binaryPath: string;
  timeoutMs: number;
  logger: Logger;
}

export interface BuildCodexExecArgsInput {
  projectPath: string;
  outputFile: string;
  prompt: string;
  sandboxMode: CodexSandboxMode;
}

export interface BuildCodexResumeArgsInput {
  outputFile: string;
  prompt: string;
  sandboxMode: CodexSandboxMode;
  sessionId: string;
}

export interface CodexCliCommandRequest {
  args: string[];
  cwd: string;
  outputFile: string;
  abortSignal?: AbortSignal;
}

export interface CodexCliCommandResult {
  durationMs: number;
  exitCode: number | null;
  outputLastMessage: string;
  stderr: string;
  stdout: string;
  timedOut: boolean;
  cancelled: boolean;
}

export type CodexCliCommandRunner = (
  request: CodexCliCommandRequest
) => Promise<CodexCliCommandResult>;

export class CodexCliAdapter implements CodexAdapter {
  private readonly runCommand: CodexCliCommandRunner;

  public constructor(
    private readonly options: CodexCliAdapterOptions & {
      runner?: CodexCliCommandRunner;
    }
  ) {
    this.runCommand = options.runner ?? ((request) => this.runCodexCommand(request));
  }

  public async execute(input: CodexExecuteInput): Promise<CodexExecuteResult> {
    const startedAt = Date.now();

    try {
      await access(input.projectPath);

      const projectStats = await stat(input.projectPath);
      if (!projectStats.isDirectory()) {
        return this.failureResult(
          `Project path is not a directory: ${input.projectPath}`,
          startedAt
        );
      }

      const existingSessionId = input.session?.lastCodexSessionId?.trim() || null;

      if (existingSessionId) {
        const resumedResult = await this.executeResume(
          input,
          existingSessionId
        );

        if (resumedResult.ok) {
          return resumedResult;
        }

        if (resumedResult.cancelled) {
          return resumedResult;
        }

        this.options.logger.warn(
          {
            taskId: input.taskId,
            channelId: input.session?.channelId,
            projectPath: input.projectPath,
            sessionId: existingSessionId,
            stderr: resumedResult.stderr,
            exitCode: resumedResult.exitCode
          },
          "Codex resume failed; starting a fresh session"
        );
      }

      return await this.executeFresh(input);
    } catch (error) {
      const message =
        isNodeError(error) && error.code === "ENOENT"
          ? `Codex binary not found: ${this.options.binaryPath}`
          : error instanceof Error
            ? error.message
            : "Unknown Codex execution error";

      return this.failureResult(message, startedAt);
    }
  }

  private failureResult(
    errorMessage: string,
    startedAt: number
  ): CodexExecuteResult {
    return {
      ok: false,
      content: "",
      stderr: "",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      errorMessage
    };
  }

  private async executeFresh(
    input: CodexExecuteInput
  ): Promise<CodexExecuteResult> {
    return await this.withTempOutputFile(async (outputFile) => {
      const prompt = buildFreshPrompt(input.prompt, input.session?.historySummary);
      const args = buildCodexExecArgs({
        projectPath: input.projectPath,
        outputFile,
        prompt,
        sandboxMode: input.sandboxMode
      });

      this.options.logger.debug(
        { taskId: input.taskId, projectPath: input.projectPath, args },
        "Executing Codex CLI with a fresh session"
      );

      const commandResult = await this.runCommand({
        args,
        cwd: input.projectPath,
        outputFile,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      });

      return normalizeCommandResult(commandResult, null);
    });
  }

  private async executeResume(
    input: CodexExecuteInput,
    sessionId: string
  ): Promise<CodexExecuteResult> {
    return await this.withTempOutputFile(async (outputFile) => {
      const args = buildCodexResumeArgs({
        outputFile,
        prompt: input.prompt,
        sandboxMode: input.sandboxMode,
        sessionId
      });

      this.options.logger.debug(
        { taskId: input.taskId, projectPath: input.projectPath, sessionId, args },
        "Resuming Codex CLI session"
      );

      const commandResult = await this.runCommand({
        args,
        cwd: input.projectPath,
        outputFile,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      });

      return normalizeCommandResult(commandResult, sessionId);
    });
  }

  private async withTempOutputFile<T>(
    run: (outputFile: string) => Promise<T>
  ): Promise<T> {
    const tempDir = await mkdtemp(path.join(tmpdir(), "discord-codex-bridge-"));
    const outputFile = path.join(tempDir, "last-message.txt");

    try {
      return await run(outputFile);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async runCodexCommand(
    request: CodexCliCommandRequest
  ): Promise<CodexCliCommandResult> {
    const startedAt = Date.now();
    if (request.abortSignal?.aborted) {
      return {
        durationMs: Date.now() - startedAt,
        exitCode: null,
        outputLastMessage: await readOutputFile(request.outputFile, ""),
        stderr: "",
        stdout: "",
        timedOut: false,
        cancelled: true
      };
    }

    const child = spawn(this.options.binaryPath, request.args, {
      cwd: request.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;
    let hardKillHandle: NodeJS.Timeout | null = null;

    const abortHandler = () => {
      cancelled = true;
      child.kill("SIGTERM");

      hardKillHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);
    };

    request.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");

      hardKillHandle = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);

      child.once("close", () => {
        if (hardKillHandle) {
          clearTimeout(hardKillHandle);
        }
      });
    }, this.options.timeoutMs);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve(code);
      });
    });

    clearTimeout(timeoutHandle);
    request.abortSignal?.removeEventListener("abort", abortHandler);
    if (hardKillHandle) {
      clearTimeout(hardKillHandle);
    }

    return {
      durationMs: Date.now() - startedAt,
      exitCode,
      outputLastMessage: await readOutputFile(request.outputFile, ""),
      stderr: stderr.trim(),
      stdout: stdout.trim(),
      timedOut,
      cancelled
    };
  }
}

async function readOutputFile(
  outputFile: string,
  stdoutFallback: string
): Promise<string> {
  try {
    const raw = await readFile(outputFile, "utf8");
    return raw.trim() || stdoutFallback.trim();
  } catch {
    return stdoutFallback.trim();
  }
}

function buildPrompt(prompt: string, sessionSummary?: string): string {
  if (!sessionSummary?.trim()) {
    return prompt;
  }

  return [
    "You are continuing work for the same Discord channel.",
    "Channel context summary:",
    sessionSummary.trim(),
    "",
    "New user request:",
    prompt
  ].join("\n");
}

function buildFreshPrompt(prompt: string, sessionSummary?: string): string {
  return buildPrompt(prompt, sessionSummary);
}

export function buildCodexExecArgs(
  input: BuildCodexExecArgsInput
): string[] {
  return [
    "exec",
    "--json",
    "-C",
    input.projectPath,
    "--skip-git-repo-check",
    "-s",
    input.sandboxMode,
    "--color",
    "never",
    "-o",
    input.outputFile,
    input.prompt
  ];
}

export function buildCodexResumeArgs(
  input: BuildCodexResumeArgsInput
): string[] {
  return [
    "exec",
    "resume",
    "--json",
    "-c",
    `sandbox_mode="${input.sandboxMode}"`,
    "--skip-git-repo-check",
    "-o",
    input.outputFile,
    input.sessionId,
    input.prompt
  ];
}

export interface ParsedCodexJsonStream {
  lastAssistantMessage: string;
  threadId: string | null;
}

export function parseCodexJsonStream(stdout: string): ParsedCodexJsonStream {
  let threadId: string | null = null;
  let lastAssistantMessage = "";

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }

    try {
      const event = JSON.parse(trimmed) as {
        item?: { text?: string; type?: string };
        thread_id?: string;
        type?: string;
      };

      if (event.type === "thread.started" && typeof event.thread_id === "string") {
        threadId = event.thread_id;
      }

      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string"
      ) {
        lastAssistantMessage = event.item.text.trim();
      }
    } catch {
      continue;
    }
  }

  return {
    lastAssistantMessage,
    threadId
  };
}

function normalizeCommandResult(
  commandResult: CodexCliCommandResult,
  fallbackSessionId: string | null
): CodexExecuteResult {
  const parsedStream = parseCodexJsonStream(commandResult.stdout);
  const sessionId = parsedStream.threadId ?? fallbackSessionId;
  const content =
    commandResult.outputLastMessage.trim() ||
    parsedStream.lastAssistantMessage ||
    "";

  if (commandResult.timedOut) {
    return {
      ok: false,
      content,
      stderr: commandResult.stderr,
      exitCode: commandResult.exitCode,
      durationMs: commandResult.durationMs,
      ...(sessionId ? { sessionId } : {}),
      errorMessage: "Codex timed out before producing a final response."
    };
  }

  if (commandResult.cancelled) {
    return {
      ok: false,
      content,
      stderr: commandResult.stderr,
      exitCode: commandResult.exitCode,
      durationMs: commandResult.durationMs,
      cancelled: true,
      ...(sessionId ? { sessionId } : {}),
      errorMessage: "Codex execution was cancelled."
    };
  }

  if (commandResult.exitCode === 0) {
    return {
      ok: true,
      content,
      stderr: commandResult.stderr,
      exitCode: commandResult.exitCode,
      durationMs: commandResult.durationMs,
      ...(sessionId ? { sessionId } : {})
    };
  }

  return {
    ok: false,
    content,
    stderr: commandResult.stderr,
    exitCode: commandResult.exitCode,
    durationMs: commandResult.durationMs,
    ...(sessionId ? { sessionId } : {}),
    errorMessage:
      content ||
      commandResult.stderr ||
      `Codex exited with code ${commandResult.exitCode ?? "unknown"}.`
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
