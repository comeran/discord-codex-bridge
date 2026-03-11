import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCodexExecArgs,
  buildCodexResumeArgs,
  CodexCliAdapter,
  parseCodexJsonStream,
  type CodexCliCommandRunner
} from "../src/adapters/codex-cli-adapter.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const target = tempDirs.pop();
    if (target) {
      await rm(target, { recursive: true, force: true });
    }
  }
});

describe("Codex CLI adapter helpers", () => {
  it("builds fresh exec args with json mode and no top-level approval flags", () => {
    const args = buildCodexExecArgs({
      projectPath: "/tmp/project",
      outputFile: "/tmp/out.txt",
      prompt: "Implement the task.",
      sandboxMode: "workspace-write"
    });

    expect(args).not.toContain("-a");
    expect(args).toEqual([
      "exec",
      "--json",
      "-C",
      "/tmp/project",
      "--skip-git-repo-check",
      "-s",
      "workspace-write",
      "--color",
      "never",
      "-o",
      "/tmp/out.txt",
      "Implement the task."
    ]);
  });

  it("builds resume args around a saved session id", () => {
    const args = buildCodexResumeArgs({
      outputFile: "/tmp/out.txt",
      prompt: "Continue the task.",
      sandboxMode: "workspace-write",
      sessionId: "session-123"
    });

    expect(args).toEqual([
      "exec",
      "resume",
      "--json",
      "-c",
      'sandbox_mode="workspace-write"',
      "--skip-git-repo-check",
      "-o",
      "/tmp/out.txt",
      "session-123",
      "Continue the task."
    ]);
  });

  it("parses thread ids and final assistant messages from jsonl output", () => {
    const parsed = parseCodexJsonStream([
      '{"type":"thread.started","thread_id":"session-123"}',
      "not-json diagnostic line",
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hello from Codex"}}'
    ].join("\n"));

    expect(parsed.threadId).toBe("session-123");
    expect(parsed.lastAssistantMessage).toBe("Hello from Codex");
  });
});

describe("CodexCliAdapter", () => {
  it("captures a fresh session id from exec json output", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "codex-adapter-test-"));
    tempDirs.push(tempDir);

    const runner = vi.fn<CodexCliCommandRunner>(async () => ({
      durationMs: 25,
      exitCode: 0,
      outputLastMessage: "Fresh execution result",
      stderr: "",
      stdout: [
        '{"type":"thread.started","thread_id":"session-fresh"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"Fresh execution result"}}'
      ].join("\n"),
      timedOut: false,
      cancelled: false
    }));

    const adapter = new CodexCliAdapter({
      binaryPath: "codex",
      timeoutMs: 1_000,
      logger: pino({ level: "silent" }),
      runner
    });

    const result = await adapter.execute({
      taskId: "task-1",
      projectPath: tempDir,
      prompt: "Do the work.",
      sandboxMode: "workspace-write"
    });

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe("session-fresh");
    expect(result.content).toBe("Fresh execution result");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0].args).toContain("--json");
  });

  it("falls back to a fresh exec when resume fails", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "codex-adapter-test-"));
    tempDirs.push(tempDir);

    const runner = vi
      .fn<CodexCliCommandRunner>()
      .mockResolvedValueOnce({
        durationMs: 10,
        exitCode: 1,
        outputLastMessage: "",
        stderr: "resume failed",
        stdout: "",
        timedOut: false,
        cancelled: false
      })
      .mockResolvedValueOnce({
        durationMs: 30,
        exitCode: 0,
        outputLastMessage: "Fresh fallback result",
        stderr: "",
        stdout: [
          '{"type":"thread.started","thread_id":"session-fallback"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"Fresh fallback result"}}'
        ].join("\n"),
        timedOut: false,
        cancelled: false
      });

    const adapter = new CodexCliAdapter({
      binaryPath: "codex",
      timeoutMs: 1_000,
      logger: pino({ level: "silent" }),
      runner
    });

    const result = await adapter.execute({
      taskId: "task-2",
      projectPath: tempDir,
      prompt: "Continue the work.",
      sandboxMode: "workspace-write",
      session: {
        channelId: "channel-1",
        historySummary: "Last request: do x\nLast result: done",
        lastCodexSessionId: "session-old",
        lastTaskId: "task-0",
        updatedAt: new Date().toISOString()
      }
    });

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe("session-fallback");
    expect(result.content).toBe("Fresh fallback result");
    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner.mock.calls[0]?.[0].args).toEqual([
      "exec",
      "resume",
      "--json",
      "-c",
      'sandbox_mode="workspace-write"',
      "--skip-git-repo-check",
      "-o",
      runner.mock.calls[0]?.[0].outputFile ?? "",
      "session-old",
      "Continue the work."
    ]);
    expect(runner.mock.calls[1]?.[0].args).toContain("--json");
    expect(runner.mock.calls[1]?.[0].args.at(-1)).toContain(
      "Channel context summary:"
    );
  });

  it("passes an abort signal to the command runner and reports cancellation", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "codex-adapter-test-"));
    tempDirs.push(tempDir);

    const controller = new AbortController();
    const runner = vi.fn<CodexCliCommandRunner>(async (request) => {
      expect(request.abortSignal).toBe(controller.signal);

      if (!request.abortSignal?.aborted) {
        await new Promise<void>((resolve) => {
          request.abortSignal?.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true }
          );
        });
      }

      return {
        durationMs: 15,
        exitCode: null,
        outputLastMessage: "",
        stderr: "",
        stdout: "",
        timedOut: false,
        cancelled: true
      };
    });

    const adapter = new CodexCliAdapter({
      binaryPath: "codex",
      timeoutMs: 1_000,
      logger: pino({ level: "silent" }),
      runner
    });

    const execution = adapter.execute({
      taskId: "task-3",
      projectPath: tempDir,
      prompt: "Do cancellable work.",
      sandboxMode: "workspace-write",
      abortSignal: controller.signal
    });

    controller.abort();

    const result = await execution;

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.errorMessage).toBe("Codex execution was cancelled.");
  });
});
