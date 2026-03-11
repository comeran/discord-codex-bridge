import type { ChannelStatusSnapshot } from "./channel-status-service.js";
import type { ChannelBinding, TaskExecutionResult } from "../types/domain.js";

const DISCORD_MESSAGE_LIMIT = 1_900;

export function formatQueuedMessage(taskId: string, queuedAhead: number): string {
  if (queuedAhead > 0) {
    return `任务 \`${taskId}\` 已入队，当前频道前面还有 ${queuedAhead} 个任务。`;
  }

  return `任务 \`${taskId}\` 已开始执行。`;
}

export function formatCompletedMessages(
  result: TaskExecutionResult
): string[] {
  const header = `任务 \`${result.task.taskId}\` 已完成 (${formatDuration(result.durationMs)})\n项目: \`${result.task.projectPath}\``;
  const body = result.output.trim() || "Codex 执行完成，但没有返回最终消息。";
  return chunkDiscordMessage(`${header}\n\n${body}`);
}

export function formatFailedMessages(result: TaskExecutionResult): string[] {
  const stderrBlock = result.stderr
    ? `\n\nstderr:\n${truncateText(result.stderr, 800)}`
    : "";
  const body = result.error?.trim() || "Codex 执行失败。";

  return chunkDiscordMessage(
    `任务 \`${result.task.taskId}\` 执行失败 (${formatDuration(result.durationMs)})\n项目: \`${result.task.projectPath}\`\n\n${body}${stderrBlock}`
  );
}

export function formatCancelledMessages(
  result: TaskExecutionResult
): string[] {
  const body = result.error?.trim() || "Codex 任务已取消。";

  return chunkDiscordMessage(
    `任务 \`${result.task.taskId}\` 已取消 (${formatDuration(result.durationMs)})\n项目: \`${result.task.projectPath}\`\n\n${body}`
  );
}

export function formatTaskResultMessages(
  result: TaskExecutionResult
): string[] {
  switch (result.status) {
    case "completed":
      return formatCompletedMessages(result);
    case "cancelled":
      return formatCancelledMessages(result);
    case "failed":
    default:
      return formatFailedMessages(result);
  }
}

export function formatHelpMessage(
  bindCommand: string,
  bindingCommand: string,
  unbindCommand: string
): string {
  return [
    "可用命令：",
    "文本命令：",
    `${bindCommand} /absolute/path/to/project`,
    `${bindingCommand}`,
    `${unbindCommand}`,
    "Slash 命令：",
    "/project bind path:<absolute-path>",
    "/project show",
    "/project unbind",
    "/session show",
    "/session reset",
    "/run prompt:<text>",
    "/status",
    "/sandbox show",
    "/sandbox set mode:<read-only|workspace-write|danger-full-access>",
    "/sandbox reset",
    "/skill list",
    "/skill show name:<skill>",
    "/mcp list",
    "/mcp show name:<server>",
    "频道中的普通消息仍会作为 Codex 任务执行。",
    "不支持登录、token 录入、raw CLI 透传或部署发布命令。"
  ].join("\n");
}

export function formatStatusMessage(
  binding: ChannelBinding,
  status: ChannelStatusSnapshot
): string {
  const sandboxSource =
    binding.sandboxModeSource === "channel" ? "频道自定义" : "全局默认";

  return [
    `当前绑定项目：\`${binding.projectPath}\``,
    `当前沙箱模式：\`${binding.sandboxMode}\` (${sandboxSource})`,
    `当前状态：\`${status.state}\``,
    `总待处理任务数：\`${status.pendingCount}\``,
    `排队任务数：\`${status.queuedCount}\``,
    `当前任务：\`${status.activeTaskId ?? "无"}\``,
    `当前任务摘要：${status.activePromptPreview ?? "无"}`,
    `当前 Codex 会话：\`${status.session?.lastCodexSessionId ?? "未记录"}\``,
    `最近任务 ID：\`${status.session?.lastTaskId ?? "未记录"}\``
  ].join("\n");
}

export function chunkDiscordMessage(
  content: string,
  limit = DISCORD_MESSAGE_LIMIT
): string[] {
  const normalized = content.trim();
  if (!normalized) {
    return [""];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", limit);
    }
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)}s`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
