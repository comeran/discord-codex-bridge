import {
  type ApplicationCommandDataResolvable,
  type ChatInputCommandInteraction,
  Client,
  Events,
  type Guild,
  GatewayIntentBits,
  type Interaction,
  type Message
} from "discord.js";
import type { Logger } from "pino";

import { DiscordMessageHandler } from "./message-handler.js";
import { sandboxCommandDefinition } from "./sandbox-command-handler.js";
import { projectCommandDefinition } from "./project-command-handler.js";
import { sessionCommandDefinition } from "./session-command-handler.js";
import { runCommandDefinition } from "./run-command-handler.js";
import { reviewCommandDefinition } from "./review-command-handler.js";
import { cancelCommandDefinition } from "./cancel-command-handler.js";
import { statusCommandDefinition } from "./status-command-handler.js";
import { skillCommandDefinition } from "./skill-command-handler.js";
import { mcpCommandDefinition } from "./mcp-command-handler.js";

export interface SlashCommandHandler {
  handle(interaction: ChatInputCommandInteraction): Promise<boolean>;
}

export function buildGuildCommandDefinitions(): ApplicationCommandDataResolvable[] {
  return [
    sandboxCommandDefinition,
    projectCommandDefinition,
    sessionCommandDefinition,
    runCommandDefinition,
    reviewCommandDefinition,
    cancelCommandDefinition,
    statusCommandDefinition,
    skillCommandDefinition,
    mcpCommandDefinition
  ];
}

export async function dispatchChatInputCommand(
  interaction: ChatInputCommandInteraction,
  handlers: SlashCommandHandler[]
): Promise<boolean> {
  for (const handler of handlers) {
    if (await handler.handle(interaction)) {
      return true;
    }
  }

  return false;
}

export interface DiscordBotOptions {
  token: string;
  handler: DiscordMessageHandler;
  commandHandlers: SlashCommandHandler[];
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
      const handled = await dispatchChatInputCommand(
        interaction,
        this.options.commandHandlers
      );

      if (!handled && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "未知命令或命令尚未启用。",
          ephemeral: true
        });
      }
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
      await guild.commands.set(buildGuildCommandDefinitions());
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
