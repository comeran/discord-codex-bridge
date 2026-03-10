import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

import type { AppConfig } from "../types/config.js";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DATA_DIR: z.string().default("./data"),
  CODEX_BIN: z.string().default("codex"),
  CODEX_TIMEOUT_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  CODEX_SANDBOX: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .default("workspace-write"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DISCORD_BIND_COMMAND: z.string().default("!bind"),
  DISCORD_UNBIND_COMMAND: z.string().default("!unbind"),
  DISCORD_BINDING_COMMAND: z.string().default("!binding"),
  DISCORD_HELP_COMMAND: z.string().default("!codex-help")
});

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  if (rawEnv === process.env) {
    dotenv.config();
  }

  const parsed = envSchema.parse(rawEnv);
  const dataDir = path.resolve(parsed.DATA_DIR);

  return {
    discord: {
      token: parsed.DISCORD_BOT_TOKEN,
      bindCommand: parsed.DISCORD_BIND_COMMAND,
      unbindCommand: parsed.DISCORD_UNBIND_COMMAND,
      bindingCommand: parsed.DISCORD_BINDING_COMMAND,
      helpCommand: parsed.DISCORD_HELP_COMMAND
    },
    codex: {
      binaryPath: parsed.CODEX_BIN,
      timeoutMs: parsed.CODEX_TIMEOUT_MS,
      sandboxMode: parsed.CODEX_SANDBOX
    },
    storage: {
      dataDir,
      bindingsFile: path.join(dataDir, "bindings.json"),
      sessionsFile: path.join(dataDir, "sessions.json")
    },
    logLevel: parsed.LOG_LEVEL
  };
}
