import { CodexCliAdapter } from "./adapters/codex-cli-adapter.js";
import { DiscordBot } from "./bot/bot.js";
import { DiscordMessageHandler } from "./bot/message-handler.js";
import { McpCommandHandler } from "./bot/mcp-command-handler.js";
import { ProjectCommandHandler } from "./bot/project-command-handler.js";
import { RunCommandHandler } from "./bot/run-command-handler.js";
import { SandboxCommandHandler } from "./bot/sandbox-command-handler.js";
import { SessionCommandHandler } from "./bot/session-command-handler.js";
import { SkillCommandHandler } from "./bot/skill-command-handler.js";
import { StatusCommandHandler } from "./bot/status-command-handler.js";
import { loadConfig } from "./config/env.js";
import { ChannelStatusService } from "./core/channel-status-service.js";
import { ChannelTaskQueue } from "./core/channel-task-queue.js";
import { TomlMcpDiscoveryService } from "./core/mcp-discovery-service.js";
import { FileSystemSkillDiscoveryService } from "./core/skill-discovery-service.js";
import { TaskOrchestrator } from "./core/task-orchestrator.js";
import { FileBindingStore } from "./store/binding-store.js";
import { FileSessionStore } from "./store/session-store.js";
import { createLogger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const bindingStore = FileBindingStore.fromFile(
    config.storage.bindingsFile,
    config.codex.sandboxMode
  );
  const sessionStore = FileSessionStore.fromFile(config.storage.sessionsFile);
  const queue = new ChannelTaskQueue();
  const codexAdapter = new CodexCliAdapter({
    binaryPath: config.codex.binaryPath,
    timeoutMs: config.codex.timeoutMs,
    logger
  });

  const orchestrator = new TaskOrchestrator({
    codexAdapter,
    sessionStore,
    queue,
    logger
  });
  const channelStatusService = new ChannelStatusService({
    queue,
    sessionStore
  });
  const skillDiscoveryService = FileSystemSkillDiscoveryService.fromCodexHome();
  const mcpDiscoveryService = TomlMcpDiscoveryService.fromCodexHome();

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
  const sandboxCommandHandler = new SandboxCommandHandler({
    bindingStore,
    logger
  });
  const projectCommandHandler = new ProjectCommandHandler({
    bindingStore,
    logger
  });
  const sessionCommandHandler = new SessionCommandHandler({
    sessionStore
  });
  const runCommandHandler = new RunCommandHandler({
    bindingStore,
    orchestrator
  });
  const statusCommandHandler = new StatusCommandHandler({
    bindingStore,
    statusService: channelStatusService
  });
  const skillCommandHandler = new SkillCommandHandler({
    discoveryService: skillDiscoveryService
  });
  const mcpCommandHandler = new McpCommandHandler({
    discoveryService: mcpDiscoveryService
  });

  const bot = new DiscordBot({
    token: config.discord.token,
    handler,
    commandHandlers: [
      sandboxCommandHandler,
      projectCommandHandler,
      sessionCommandHandler,
      runCommandHandler,
      statusCommandHandler,
      skillCommandHandler,
      mcpCommandHandler
    ],
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
