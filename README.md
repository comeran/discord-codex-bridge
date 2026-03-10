# discord-codex-bridge

`discord-codex-bridge` is a minimal Discord-to-Codex bridge built for a trusted local environment. Each Discord channel binds to one local project directory, maintains its own channel session metadata, and executes tasks serially through the local `codex exec` CLI.

## MVP features

- One project binding per Discord channel
- Per-channel Codex session continuity
- Per-channel serial task execution
- Local JSON persistence for bindings and sessions
- Replaceable Codex adapter interface
- Clear structured logs with task and channel context

## Architecture

```text
Discord channel
  -> message handler
  -> task orchestrator
  -> per-channel queue
  -> Codex adapter
  -> codex exec in bound project directory
  -> Discord reply
```

## Project structure

```text
src/
  adapters/   Codex backend adapters
  bot/        Discord startup and message handling
  config/     Environment loading and validation
  core/       Queueing, orchestration, message formatting
  store/      File-backed persistence
  types/      Shared contracts and domain types
  utils/      Shared utilities such as logging
tests/        Baseline tests
docs/plans/   Design and implementation notes
```

## Requirements

- Node.js 20+
- A Discord bot token with the `Message Content Intent` enabled
- Local Codex installation with a working `codex` CLI

This MVP assumes a trusted Discord server. Any user with access to the bot can bind a channel to a local directory and trigger Codex execution there.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your token:

   ```bash
   cp .env.example .env
   ```

3. Start the bot in development mode:

   ```bash
   npm run dev
   ```

## Commands

- `!bind /absolute/path/to/project`
  Binds the current channel to a project directory.
- `!binding`
  Shows the current channel binding.
- `!unbind`
  Removes the current channel binding.
- `!codex-help`
  Prints command help.
- `/project bind path:<absolute-path>`
  Binds the current channel to a project directory.
- `/project show`
  Shows the current channel project binding.
- `/project unbind`
  Removes the current channel project binding.
- `/session show`
  Shows the current channel session summary and saved Codex session id.
- `/session reset`
  Clears the current channel session metadata without unbinding the project.
- `/run prompt:<text>`
  Explicitly runs a Codex task in the current channel.
- `/status`
  Shows the current project path, queue depth, active task, and session state.
- `/sandbox show`
  Shows the effective sandbox mode for the current channel.
- `/sandbox set mode:<read-only|workspace-write|danger-full-access>`
  Sets a channel-specific sandbox mode override.
- `/sandbox reset`
  Resets the channel back to the global default sandbox mode.
- `/skill list`
  Lists locally available Codex skills discovered from the local Codex home.
- `/skill show name:<skill>`
  Shows one discovered local skill.
- `/mcp list`
  Lists MCP servers configured in local Codex config.
- `/mcp show name:<server>`
  Shows one configured MCP server.

Any non-command message posted in a bound channel is treated as a Codex task.

`danger-full-access` is high risk. In that mode, later tasks in the
channel can write `.git`, create commits, and run more dangerous local
commands.

The command surface intentionally excludes login, token entry, raw Codex
CLI passthrough, deployment, and publish workflows.

## Data files

The bot stores state under `DATA_DIR`:

- `bindings.json` stores channel-to-project mappings
- channel bindings also store optional per-channel sandbox overrides
- `sessions.json` stores per-channel session metadata

Queued tasks are in-memory only for the MVP. Restarting the process drops any tasks that have not completed.

## Development

Run tests:

```bash
npm test
```

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

## Notes on Codex execution

The default adapter runs:

```bash
codex exec --json -C <projectPath> --skip-git-repo-check -s workspace-write
```

Channel session continuity now prefers native Codex session reuse. The
bridge stores the latest Codex `thread_id` per Discord channel and uses
`codex exec resume` on later tasks. If resume fails, it automatically
falls back to a fresh `codex exec --json` run and updates the stored
session id. The resume path also re-applies the configured sandbox mode
through CLI config override so resumed tasks stay aligned with the
project's write policy. A compact `historySummary` is still kept for
diagnostics and fallback context.
