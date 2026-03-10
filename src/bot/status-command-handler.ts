import { type ApplicationCommandDataResolvable, type ChatInputCommandInteraction } from "discord.js";

import { formatStatusMessage } from "../core/message-formatter.js";
import { ChannelStatusService } from "../core/channel-status-service.js";
import type { BindingStore } from "../store/binding-store.js";

export const statusCommandDefinition: ApplicationCommandDataResolvable = {
  name: "status",
  description: "Show the current project, queue, and session state for this channel"
};

export interface StatusCommandHandlerDeps {
  bindingStore: BindingStore;
  statusService: ChannelStatusService;
}

export class StatusCommandHandler {
  public constructor(private readonly deps: StatusCommandHandlerDeps) {}

  public async handle(
    interaction: ChatInputCommandInteraction
  ): Promise<boolean> {
    if (interaction.commandName !== "status") {
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
        content: "这个频道还没有绑定项目。",
        ephemeral: true
      });
      return true;
    }

    const status = await this.deps.statusService.getByChannelId(interaction.channelId);

    await interaction.reply({
      content: formatStatusMessage(binding, status),
      ephemeral: true
    });

    return true;
  }
}
