import {
  Client,
  Events,
  GatewayIntentBits,
  type Message
} from "discord.js";
import type { Logger } from "pino";

import { DiscordMessageHandler } from "./message-handler.js";

export interface DiscordBotOptions {
  token: string;
  handler: DiscordMessageHandler;
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
    });

    this.client.on(Events.MessageCreate, (message) => {
      void this.safeHandleMessage(message);
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
}
