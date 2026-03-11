import {
  ApplicationCommandOptionType,
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction
} from "discord.js";

import {
  formatQueuedMessage,
  formatTaskResultMessages
} from "../core/message-formatter.js";
import { TaskOrchestrator } from "../core/task-orchestrator.js";
import type { BindingStore } from "../store/binding-store.js";

export const reviewCommandDefinition: ApplicationCommandDataResolvable = {
  name: "review",
  description: "Run a code review task in the project bound to this channel",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "prompt",
      description: "Optional review instruction for Codex",
      required: false
    }
  ]
};

export interface ReviewCommandHandlerDeps {
  bindingStore: BindingStore;
  orchestrator: TaskOrchestrator;
}

export class ReviewCommandHandler {
  public constructor(private readonly deps: ReviewCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "review") {
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

    const prompt =
      interaction.options.getString("prompt")?.trim() || buildDefaultReviewPrompt();

    const submission = this.deps.orchestrator.submit({
      guildId: interaction.guildId ?? "unknown",
      channelId: interaction.channelId,
      userId: interaction.user.id,
      prompt,
      taskType: "review",
      binding
    });

    await interaction.reply({
      content: formatQueuedMessage(submission.taskId, submission.queuedAhead)
    });

    const result = await submission.completion;
    const messages = formatTaskResultMessages(result);

    for (const message of messages) {
      await interaction.followUp({ content: message });
    }

    return true;
  }
}

export function buildDefaultReviewPrompt(): string {
  return [
    "Review the current project and the latest relevant changes.",
    "Prioritize findings about bugs, risks, regressions, and missing tests.",
    "Keep the response concise and list findings first before any short summary."
  ].join("\n");
}
