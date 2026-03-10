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
  sandboxMode: CodexSandboxMode;
  logger: Logger;
}

export interface BuildCodexExecArgsInput {
  projectPath: string;
  outputFile: string;
  prompt: string;
  sandboxMode: CodexSandboxMode;
}

export class CodexCliAdapter implements CodexAdapter {
  public constructor(private readonly options: CodexCliAdapterOptions) {}

  public async execute(input: CodexExecuteInput): Promise<CodexExecuteResult> {
    const startedAt = Date.now();
    const tempDir = await mkdtemp(path.join(tmpdir(), "discord-codex-bridge-"));
    const outputFile = path.join(tempDir, "last-message.txt");

    try {
      await access(input.projectPath);

      const projectStats = await stat(input.projectPath);
      if (!projectStats.isDirectory()) {
        return this.failureResult(
          `Project path is not a directory: ${input.projectPath}`,
          startedAt
        );
      }

      const prompt = buildPrompt(input.prompt, input.session?.historySummary);
      const args = buildCodexExecArgs({
        projectPath: input.projectPath,
        outputFile,
        prompt,
        sandboxMode: this.options.sandboxMode
      });

      this.options.logger.debug(
        { taskId: input.taskId, projectPath: input.projectPath, args },
        "Executing Codex CLI"
      );

      const child = spawn(this.options.binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");

        const hardKillHandle = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);

        child.once("close", () => {
          clearTimeout(hardKillHandle);
        });
      }, this.options.timeoutMs);

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => {
          resolve(code);
        });
      });

      clearTimeout(timeoutHandle);

      const content = await readOutputFile(outputFile, stdout);

      if (timedOut) {
        return {
          ok: false,
          content,
          stderr: stderr.trim(),
          exitCode,
          durationMs: Date.now() - startedAt,
          errorMessage: `Codex timed out after ${this.options.timeoutMs}ms.`
        };
      }

      if (exitCode === 0) {
        return {
          ok: true,
          content,
          stderr: stderr.trim(),
          exitCode,
          durationMs: Date.now() - startedAt
        };
      }

      return {
        ok: false,
        content,
        stderr: stderr.trim(),
        exitCode,
        durationMs: Date.now() - startedAt,
        errorMessage:
          content.trim() ||
          stderr.trim() ||
          `Codex exited with code ${exitCode ?? "unknown"}.`
      };
    } catch (error) {
      const message =
        isNodeError(error) && error.code === "ENOENT"
          ? `Codex binary not found: ${this.options.binaryPath}`
          : error instanceof Error
            ? error.message
            : "Unknown Codex execution error";

      return this.failureResult(message, startedAt);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
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

export function buildCodexExecArgs(
  input: BuildCodexExecArgsInput
): string[] {
  return [
    "exec",
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
