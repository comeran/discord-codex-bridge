import { CodexCliAdapter } from "./adapters/codex-cli-adapter.js";
import { DiscordBot } from "./bot/bot.js";
import { DiscordMessageHandler } from "./bot/message-handler.js";
import { loadConfig } from "./config/env.js";
import { ChannelTaskQueue } from "./core/channel-task-queue.js";
import { TaskOrchestrator } from "./core/task-orchestrator.js";
import { FileBindingStore } from "./store/binding-store.js";
import { FileSessionStore } from "./store/session-store.js";
import { createLogger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const bindingStore = FileBindingStore.fromFile(config.storage.bindingsFile);
  const sessionStore = FileSessionStore.fromFile(config.storage.sessionsFile);
  const queue = new ChannelTaskQueue();
  const codexAdapter = new CodexCliAdapter({
    binaryPath: config.codex.binaryPath,
    timeoutMs: config.codex.timeoutMs,
    sandboxMode: config.codex.sandboxMode,
    logger
  });

  const orchestrator = new TaskOrchestrator({
    codexAdapter,
    sessionStore,
    queue,
    logger
  });

  const handler = new DiscordMessageHandler({
    bindingStore,
    orchestrator,
    commands: {
      bindCommand: config.discord.bindCommand,
      bindingCommand: config.discord.bindingCommand,
      unbindCommand: config.discord.unbindCommand,
      helpCommand: config.discord.helpCommand
    },
    logger
  });

  const bot = new DiscordBot({
    token: config.discord.token,
    handler,
    logger
  });

  setupSignalHandlers(bot, logger);

  logger.info(
    {
      dataDir: config.storage.dataDir,
      bindingsFile: config.storage.bindingsFile,
      sessionsFile: config.storage.sessionsFile,
      codexBinary: config.codex.binaryPath
    },
    "Starting discord-codex-bridge"
  );

  await bot.start();
}

function setupSignalHandlers(
  bot: DiscordBot,
  logger: ReturnType<typeof createLogger>
): void {
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    await bot.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  // Keep startup failures obvious for local debugging.
  console.error(error);
  process.exit(1);
});
