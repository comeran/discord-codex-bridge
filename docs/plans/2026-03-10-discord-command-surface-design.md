# Discord Command Surface Design

**Date:** 2026-03-10

## Goal

Expand the bridge from a message-only Codex trigger into a Discord-native
command surface that covers the most important execution and project
management flows without exposing sensitive account, login, or deployment
operations.

## Scope

Included:
- add Discord slash commands for high-frequency execution and project
  management flows
- preserve the current "plain message triggers a task" behavior in bound
  channels
- introduce channel-visible session and queue inspection commands
- add safe discovery commands for local skills and MCP servers
- reserve room for future channel-level skill and MCP toggles

Excluded:
- login, OAuth, token entry, or remote account binding workflows
- raw Codex CLI passthrough commands
- arbitrary shell command execution from Discord
- deployment and publish commands
- approval workflows or role-based authorization
- GUI-specific Codex app controls

## Current State

The project already supports:
- channel-to-project binding
- per-channel serial task execution
- native Codex session resume
- per-channel sandbox mode overrides
- plain text commands such as `!bind` and `!binding`

The new command surface should layer on top of these primitives rather
than replacing the current task and adapter architecture.

## Recommended Approach

Use a Discord-native command surface organized into three layers:

1. execution commands
2. management commands
3. capability discovery commands

This is preferred over a one-to-one Codex CLI mirror because Discord
users benefit from guided inputs, constrained options, and explicit risk
boundaries. It also keeps the bridge decoupled from CLI argument details
that do not map well to chat UX.

## Command Layers

### Execution layer

These commands initiate or control work:

- `/run prompt:<text>`
- `/review prompt:<text>`
- `/status`
- `/cancel`

`/run` is the explicit slash-command alternative to plain text task
messages. `/review` is a specialized entry point for code-review style
requests but still runs through the same adapter abstraction. `/status`
shows queue length, active task, project path, session status, and
effective sandbox mode for the current channel. `/cancel` only targets
queued tasks in the MVP and does not force-stop an active Codex process.

### Management layer

These commands control the channel-to-project relationship and channel
execution state:

- `/project bind path:<absolute-path>`
- `/project show`
- `/project unbind`
- `/session show`
- `/session reset`
- `/sandbox show`
- `/sandbox set mode:<read-only|workspace-write|danger-full-access>`
- `/sandbox reset`

This layer absorbs the existing text commands over time while remaining
backward compatible with them for the MVP.

### Capability discovery layer

These commands expose locally available bridge capabilities without
requiring login or remote service setup:

- `/skill list`
- `/skill show name:<skill>`
- `/mcp list`
- `/mcp show name:<server>`

Future channel-scoped toggles can extend this layer:

- `/skill enable`
- `/skill disable`
- `/mcp enable`
- `/mcp disable`

The MVP should stop at discovery plus read-only inspection. Enable and
disable commands belong to the next phase because they need persistent
channel configuration and clear execution semantics.

## Safety Model

The bridge remains designed for trusted Discord servers, but the command
surface should still reduce accidental misuse.

Allowed in scope:
- project path binding
- session reset
- sandbox changes, including `danger-full-access`, with clear warnings
- local skill and MCP discovery

Explicitly out of scope:
- authentication commands
- token storage commands
- marketplace or remote installation flows
- shell passthrough
- raw Codex subcommand passthrough

This keeps the command set aligned with project-local automation rather
than turning the bot into a general remote administration endpoint.

## Data Model Changes

Add only the minimal persisted state needed for the MVP command surface.

### Channel binding

The existing binding model already stores:
- guild id
- channel id
- project path
- effective sandbox mode

No structural change is required for `/project` and `/sandbox`.

### Channel session

The existing session model already stores:
- history summary
- last task id
- last Codex session id

For `/session show`, expose this state in a user-facing summary. For
`/session reset`, clear the stored session metadata for the current
channel without unbinding the project.

### Channel runtime state

The queue already exists in memory. `/status` needs a small read-only
runtime view per channel:
- active task id
- active task prompt preview
- queue depth
- current state (`idle`, `running`, `queued`)

This should remain in memory and not be persisted.

### Capability metadata

Skill and MCP discovery should not invent a new database. Instead:
- skills are read from local skill metadata already available in the
  Codex environment
- MCP server discovery is read from existing configured resources or
  adapter-facing metadata

If local enumeration is not yet available for one side, the bridge
should degrade gracefully and report that discovery is unavailable.

## Component Changes

### `src/bot`

Add slash command registration and handlers for:
- `/run`
- `/status`
- `/project ...`
- `/session ...`
- `/skill ...`
- `/mcp ...`

Keep each command family in its own handler module so that Discord entry
points remain thin and testable.

### `src/core`

Add a command-oriented service layer for:
- task submission
- queue inspection
- session inspection/reset
- capability formatting

This should reuse the existing orchestrator and queue rather than
creating a second execution path.

### `src/store`

Add only whatever is required to support session reset and any future
channel-scoped capability toggles. Read-only capability discovery should
not require new persistence.

### `src/adapters`

Keep the Codex adapter focused on execution. Do not mix Discord-specific
command parsing into the adapter. If MCP discovery needs adapter support,
add a narrow interface for listing configured servers rather than
exposing arbitrary MCP command execution.

## Data Flow

### `/run` and `/review`

1. Discord slash command arrives.
2. Bot resolves the current channel binding.
3. Bot enqueues the task through the existing orchestrator.
4. Queue runs the task serially for that channel.
5. Codex adapter executes or resumes the local Codex session.
6. Result, status, or failure is sent back to Discord.

### `/status`

1. Discord slash command arrives.
2. Bot reads binding, session, and queue runtime state.
3. Bot formats a compact channel status summary.
4. No Codex execution occurs.

### `/skill list` and `/mcp list`

1. Discord slash command arrives.
2. Bot reads local discovery metadata.
3. Bot formats the available skills or MCP servers.
4. No project mutation occurs.

## Error Handling

User-facing command errors should stay short and specific:
- channel not bound
- invalid absolute path
- no session exists to reset
- capability not found
- capability discovery unavailable

Operational logs should still include:
- channel id
- guild id
- project path
- task id when relevant
- command family

For slash commands that only inspect state, failures should never affect
queue execution.

## Testing

Add tests for:
- slash command registration metadata
- `/project` and `/session` command handlers
- `/status` formatting from mixed binding/session/queue state
- `/run` reusing the same orchestration path as plain text messages
- `/skill list` and `/mcp list` response formatting with empty and
  populated data

Do not add network-dependent tests. Discovery tests should run against
local stubs or adapter mocks.

## MVP Boundary

Phase 1:
- `/run`
- `/status`
- `/project bind|show|unbind`
- `/session show|reset`
- `/sandbox show|set|reset`
- `/skill list|show`
- `/mcp list|show`

Phase 2:
- `/review`
- `/cancel`
- `/skill enable|disable`
- `/mcp enable|disable`

This keeps the first release focused on the commands users need most
while avoiding configuration semantics that have not been validated yet.
