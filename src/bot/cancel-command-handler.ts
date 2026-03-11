import { type ApplicationCommandDataResolvable, type ChatInputCommandInteraction } from "discord.js";

import { TaskOrchestrator } from "../core/task-orchestrator.js";

export const cancelCommandDefinition: ApplicationCommandDataResolvable = {
  name: "cancel",
  description: "Cancel the current running task or the next queued task in this channel"
};

export interface CancelCommandHandlerDeps {
  orchestrator: TaskOrchestrator;
}

export class CancelCommandHandler {
  public constructor(private readonly deps: CancelCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "cancel") {
      return false;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "这个命令只能在服务器频道中使用。",
        ephemeral: true
      });
      return true;
    }

    const cancelled = await this.deps.orchestrator.cancel(interaction.channelId);
    if (!cancelled) {
      await interaction.reply({
        content: "当前频道没有可取消任务。",
        ephemeral: true
      });
      return true;
    }

    await interaction.reply({
      content:
        cancelled.scope === "active"
          ? `已请求取消当前运行中的任务 \`${cancelled.taskId ?? "unknown"}\`。`
          : `已取消排队中的任务 \`${cancelled.taskId ?? "unknown"}\`。`,
      ephemeral: true
    });

    return true;
  }
}
