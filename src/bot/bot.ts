import {
  Client,
  Events,
  type Guild,
  GatewayIntentBits,
  type Interaction,
  type Message
} from "discord.js";
import type { Logger } from "pino";

import { DiscordMessageHandler } from "./message-handler.js";
import {
  SandboxCommandHandler,
  sandboxCommandDefinition
} from "./sandbox-command-handler.js";

export interface DiscordBotOptions {
  token: string;
  handler: DiscordMessageHandler;
  sandboxCommandHandler: SandboxCommandHandler;
  logger: Logger;
}

export class DiscordBot {
  private readonly client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  public constructor(private readonly options: DiscordBotOptions) {}

  public async start(): Promise<void> {
    this.client.once(Events.ClientReady, (readyClient) => {
      this.options.logger.info(
        { userTag: readyClient.user.tag },
        "Discord bot connected"
      );

      void this.registerGuildCommands();
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.safeHandleMessage(message);
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.safeHandleInteraction(interaction);
    });

    this.client.on(Events.GuildCreate, (guild) => {
      void this.registerCommandsForGuild(guild);
    });

    await this.client.login(this.options.token);
  }

  public async stop(): Promise<void> {
    await this.client.destroy();
  }

  private async safeHandleMessage(message: Message<boolean>): Promise<void> {
    try {
      await this.options.handler.handle(message);
    } catch (error) {
      this.options.logger.error(
        {
          channelId: message.channelId,
          guildId: message.guildId,
          err: error
        },
        "Failed to process Discord message"
      );
    }
  }

  private async safeHandleInteraction(
    interaction: Interaction
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      await this.options.sandboxCommandHandler.handle(interaction);
    } catch (error) {
      this.options.logger.error(
        {
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          commandName: interaction.commandName,
          err: error
        },
        "Failed to process Discord interaction"
      );

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "命令执行失败，请查看 bot 日志。",
          ephemeral: true
        });
      }
    }
  }

  private async registerGuildCommands(): Promise<void> {
    await Promise.all(
      this.client.guilds.cache.map(async (guild) => {
        await this.registerCommandsForGuild(guild);
      })
    );
  }

  private async registerCommandsForGuild(guild: Guild): Promise<void> {
    try {
      await guild.commands.set([sandboxCommandDefinition]);
      this.options.logger.info(
        { guildId: guild.id, guildName: guild.name },
        "Registered guild slash commands"
      );
    } catch (error) {
      this.options.logger.error(
        { guildId: guild.id, guildName: guild.name, err: error },
        "Failed to register guild slash commands"
      );
    }
  }
}
