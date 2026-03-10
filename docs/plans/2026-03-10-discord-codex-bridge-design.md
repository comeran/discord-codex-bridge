# discord-codex-bridge Design

**Date:** 2026-03-10

## Goal

Build an MVP that lets users control Codex from Discord using a "one project per Discord channel" model. Each bound channel maps to one local project directory, runs tasks in that project context, and sends status and results back to the same channel.

## MVP Boundaries

Included:
- Discord text message intake
- Per-channel project binding via local file storage
- Per-channel isolated session metadata
- Per-channel serial task execution
- Local `codex exec` invocation from the bound project directory
- Clear structured logging
- Minimal tests for the queue and file-backed store

Excluded:
- Web UI
- Complex permissions or admin backend
- Diff preview and approval flows
- Automatic test execution or git commit workflows
- Full audit system
- Crash-safe task recovery

## Architecture

The system is a single Node.js process with clear module boundaries:

- `src/bot`: Discord client bootstrap, message intake, and channel replies
- `src/core`: orchestration, queueing, session handling, and output formatting
- `src/adapters`: Codex adapter abstraction plus a CLI-backed implementation
- `src/store`: file-backed stores for channel bindings and sessions
- `src/types`: domain models and execution contracts
- `src/config`: environment loading and validation
- `src/utils`: logger and small helpers

## Data Model

### Channel Binding

Maps one Discord channel to one project directory.

- `guildId`
- `channelId`
- `projectPath`
- `createdAt`
- `updatedAt`

### Channel Session

Stores per-channel execution context metadata.

- `channelId`
- `historySummary`
- `lastCodexSessionId` (optional, reserved for future use)
- `lastTaskId` (optional)
- `updatedAt`

### Task Record

Tracks task lifecycle for logging and replies.

- `taskId`
- `channelId`
- `guildId`
- `userId`
- `prompt`
- `status`
- `createdAt`
- `startedAt` (optional)
- `finishedAt` (optional)
- `error` (optional)

## Runtime Flow

1. A user sends a message in a Discord channel.
2. The bot ignores unsupported messages and checks whether the channel is bound.
3. If unbound, the bot replies with a binding hint.
4. If bound, the bot creates a task and enqueues it in the channel-specific queue.
5. The orchestrator sends a "queued" or "running" status update.
6. The queue executes one task at a time for that channel.
7. The Codex adapter runs `codex exec -C <projectPath> ...` with the user prompt plus channel session context.
8. The orchestrator captures output, updates session metadata, and posts the result or error back to Discord.

## Error Handling

The design distinguishes four error classes:

- Configuration errors: missing env vars, bad filesystem paths, missing `codex` binary
- Business errors: channel not bound, invalid bind request, unsupported message
- Execution errors: `codex exec` timeout, non-zero exit code, empty response
- Platform errors: Discord send failures, rate limits, oversized messages

User-facing errors stay short and actionable. Logs keep structured context such as `taskId`, `channelId`, `guildId`, `projectPath`, and execution phase.

## Recommended Implementation Strategy

Use a single-process MVP with:

- local JSON files for bindings and sessions
- in-memory per-channel serial queues
- a replaceable `CodexAdapter` interface
- a `CodexCliAdapter` implementation based on `codex exec`

This gives the fastest path to a working system while keeping the execution layer and persistence layer swappable later.

## Extension Points

The initial structure should make it easy to add:

- slash or text commands for binding and management
- richer session persistence
- approval and diff preview flows
- test and git action runners
- alternate Codex backends such as MCP or a remote worker
