import path from "node:path";
import { stat } from "node:fs/promises";

import type { Message } from "discord.js";
import type { Logger } from "pino";

import {
  formatCompletedMessages,
  formatFailedMessages,
  formatHelpMessage,
  formatQueuedMessage
} from "../core/message-formatter.js";
import { TaskOrchestrator } from "../core/task-orchestrator.js";
import type { BindingStore } from "../store/binding-store.js";

export interface MessageHandlerCommands {
  bindCommand: string;
  bindingCommand: string;
  unbindCommand: string;
  helpCommand: string;
}

export interface DiscordMessageHandlerDeps {
  bindingStore: BindingStore;
  orchestrator: TaskOrchestrator;
  commands: MessageHandlerCommands;
  logger: Logger;
}

export class DiscordMessageHandler {
  public constructor(private readonly deps: DiscordMessageHandlerDeps) {}

  public async handle(message: Message<boolean>): Promise<void> {
    if (message.author.bot || !message.inGuild()) {
      return;
    }

    const content = message.content.trim();
    if (!content) {
      return;
    }

    if (await this.handleCommand(message, content)) {
      return;
    }

    const binding = await this.deps.bindingStore.getByChannelId(message.channelId);
    if (!binding) {
      await message.reply(
        `这个频道还没有绑定项目。使用 \`${this.deps.commands.bindCommand} /absolute/path/to/project\` 进行绑定。`
      );
      return;
    }

    const submission = this.deps.orchestrator.submit({
      guildId: message.guildId ?? "unknown",
      channelId: message.channelId,
      userId: message.author.id,
      prompt: content,
      binding
    });

    await message.reply(formatQueuedMessage(submission.taskId, submission.queuedAhead));

    const result = await submission.completion;
    const messages =
      result.status === "completed"
        ? formatCompletedMessages(result)
        : formatFailedMessages(result);

    await this.sendChunks(message, messages);
  }

  private async handleCommand(
    message: Message<boolean>,
    content: string
  ): Promise<boolean> {
    const { bindCommand, bindingCommand, unbindCommand, helpCommand } =
      this.deps.commands;

    if (content === helpCommand) {
      await message.reply(formatHelpMessage(bindCommand, bindingCommand, unbindCommand));
      return true;
    }

    if (content === bindingCommand) {
      const binding = await this.deps.bindingStore.getByChannelId(message.channelId);
      await message.reply(
        binding
          ? `当前绑定项目：\`${binding.projectPath}\``
          : "当前频道还没有绑定项目。"
      );
      return true;
    }

    if (content === unbindCommand) {
      const removed = await this.deps.bindingStore.remove(message.channelId);
      await message.reply(removed ? "已移除当前频道绑定。" : "当前频道没有可移除的绑定。");
      return true;
    }

    if (content === bindCommand || content.startsWith(`${bindCommand} `)) {
      const projectPath = normalizeCommandArgument(
        content.slice(bindCommand.length).trim()
      );

      if (!projectPath) {
        await message.reply(`用法：\`${bindCommand} /absolute/path/to/project\``);
        return true;
      }

      if (!path.isAbsolute(projectPath)) {
        await message.reply("请使用绝对路径绑定项目目录。");
        return true;
      }

      try {
        const target = await stat(projectPath);
        if (!target.isDirectory()) {
          await message.reply("绑定失败：目标路径不是目录。");
          return true;
        }
      } catch {
        await message.reply("绑定失败：目标路径不存在或不可访问。");
        return true;
      }

      const binding = await this.deps.bindingStore.upsert({
        guildId: message.guildId ?? "unknown",
        channelId: message.channelId,
        projectPath
      });

      this.deps.logger.info(
        {
          channelId: message.channelId,
          guildId: message.guildId,
          projectPath: binding.projectPath
        },
        "Channel binding updated"
      );

      await message.reply(`已将当前频道绑定到 \`${binding.projectPath}\``);
      return true;
    }

    return false;
  }

  private async sendChunks(
    message: Message<boolean>,
    chunks: string[]
  ): Promise<void> {
    const [firstChunk, ...remainingChunks] = chunks;

    if (firstChunk) {
      await message.reply(firstChunk);
    }

    for (const chunk of remainingChunks) {
      await message.reply(chunk);
    }
  }
}

function normalizeCommandArgument(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}
