# discord-codex-bridge

`discord-codex-bridge` is a minimal Discord-to-Codex bridge built for a trusted local environment. Each Discord channel binds to one local project directory, maintains its own channel session metadata, and executes tasks serially through the local `codex exec` CLI.

## MVP features

- One project binding per Discord channel
- Per-channel session metadata
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

Any non-command message posted in a bound channel is treated as a Codex task.

## Data files

The bot stores state under `DATA_DIR`:

- `bindings.json` stores channel-to-project mappings
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
codex exec -C <projectPath> --skip-git-repo-check -a never -s workspace-write
```

Channel session continuity is implemented in the MVP by injecting a compact channel summary into the next prompt. The `ChannelSession` model also reserves a `lastCodexSessionId` field for future native `resume` support.
