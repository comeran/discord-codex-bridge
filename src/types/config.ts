export type CodexSandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export interface AppConfig {
  discord: {
    token: string;
    bindCommand: string;
    unbindCommand: string;
    bindingCommand: string;
    helpCommand: string;
  };
  codex: {
    binaryPath: string;
    timeoutMs: number;
    sandboxMode: CodexSandboxMode;
  };
  storage: {
    dataDir: string;
    bindingsFile: string;
    sessionsFile: string;
  };
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
}
