import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface McpServerMetadata {
  name: string;
  command: string | null;
  args: string[];
  source: string;
}

export interface McpDiscoveryService {
  list(): Promise<McpServerMetadata[]>;
  getByName(name: string): Promise<McpServerMetadata | null>;
}

export class TomlMcpDiscoveryService implements McpDiscoveryService {
  public static fromCodexHome(
    codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex")
  ): TomlMcpDiscoveryService {
    return new TomlMcpDiscoveryService(path.join(codexHome, "config.toml"));
  }

  public constructor(private readonly configPath: string) {}

  public async list(): Promise<McpServerMetadata[]> {
    const config = await readFile(this.configPath, "utf8");

    return parseMcpServers(config).map((server) => ({
      ...server,
      source: this.configPath
    }));
  }

  public async getByName(name: string): Promise<McpServerMetadata | null> {
    const normalizedName = name.trim().toLowerCase();
    const servers = await this.list();

    return (
      servers.find((server) => server.name.trim().toLowerCase() === normalizedName) ??
      null
    );
  }
}

function parseMcpServers(config: string): Array<{
  name: string;
  command: string | null;
  args: string[];
}> {
  const lines = config.split(/\r?\n/);
  const servers: Array<{
    name: string;
    command: string | null;
    args: string[];
  }> = [];

  let current:
    | {
        name: string;
        command: string | null;
        args: string[];
      }
    | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const section = line.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (section) {
      if (current) {
        servers.push(current);
      }

      current = {
        name: section[1] ?? "",
        command: null,
        args: []
      };
      continue;
    }

    if (!current || line.startsWith("[")) {
      if (current && line.startsWith("[")) {
        servers.push(current);
        current = null;
      }
      continue;
    }

    const command = line.match(/^command\s*=\s*"(.+)"$/);
    if (command) {
      current.command = command[1] ?? null;
      continue;
    }

    const args = line.match(/^args\s*=\s*\[(.*)\]$/);
    if (args) {
      current.args = parseTomlStringArray(args[1] ?? "");
    }
  }

  if (current) {
    servers.push(current);
  }

  return servers;
}

function parseTomlStringArray(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^"(.*)"$/, "$1"));
}
