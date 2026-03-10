import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";

import {
  formatCompletedMessages,
  formatFailedMessages,
  formatQueuedMessage
} from "../core/message-formatter.js";
import { TaskOrchestrator } from "../core/task-orchestrator.js";
import type { BindingStore } from "../store/binding-store.js";

export const runCommandDefinition: ApplicationCommandDataResolvable = {
  name: "run",
  description: "Run a Codex task in the project bound to this channel",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "prompt",
      description: "Natural-language task for Codex",
      required: true
    }
  ]
};

export interface RunCommandHandlerDeps {
  bindingStore: BindingStore;
  orchestrator: TaskOrchestrator;
}

export class RunCommandHandler {
  public constructor(private readonly deps: RunCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "run") {
      return false;
    }

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "这个命令只能在服务器频道中使用。",
        ephemeral: true
      });
      return true;
    }

    const binding = await this.deps.bindingStore.getByChannelId(interaction.channelId);
    if (!binding) {
      await interaction.reply({
        content: "这个频道还没有绑定项目。请先使用 `/project bind path:<absolute-path>`。",
        ephemeral: true
      });
      return true;
    }

    const prompt = interaction.options.getString("prompt", true).trim();
    const submission = this.deps.orchestrator.submit({
      guildId: interaction.guildId ?? "unknown",
      channelId: interaction.channelId,
      userId: interaction.user.id,
      prompt,
      binding
    });

    await interaction.reply({
      content: formatQueuedMessage(submission.taskId, submission.queuedAhead)
    });

    const result = await submission.completion;
    const messages =
      result.status === "completed"
        ? formatCompletedMessages(result)
        : formatFailedMessages(result);

    for (const message of messages) {
      await interaction.followUp({ content: message });
    }

    return true;
  }
}
