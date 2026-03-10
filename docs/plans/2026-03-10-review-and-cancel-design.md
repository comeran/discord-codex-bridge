# Review And Cancel Commands Design

**Date:** 2026-03-10

## Goal

Add a Discord-native `/review` command for code-review style requests and
a `/cancel` command that can cancel queued tasks or terminate the
currently running local `codex` CLI task for the current channel.

## Scope

Included:
- add `/review` with both default and prompt-driven modes
- add `/cancel` for the current channel
- support queued task cancellation
- support terminating the currently running local `codex` CLI process
- add a `cancelled` task outcome
- expose cancellation-aware queue state through `/status`

Excluded:
- cancelling tasks in other channels
- cancelling tasks by historical task id
- recovering cancelled task state after process restart
- partial-output streaming during cancellation
- batch cancellation

## Current State

The bridge already supports:
- channel-scoped project bindings
- channel-scoped Codex session resume
- serial task execution through an in-memory per-channel queue
- slash command execution for `/run`, `/status`, `/project`, `/session`,
  `/sandbox`, `/skill`, and `/mcp`

The current queue implementation is Promise-tail based. It can report
basic runtime state but cannot remove a queued task or interrupt a
running task. The Codex adapter also waits for the child process to
complete without any abort path.

## Recommended Approach

Use a unified task model with explicit channel queue entries and
task-scoped cancellation handles.

This is preferred over ad hoc process killing because:
- `/run` and `/review` stay on one execution path
- queue inspection and cancellation stay coherent
- later commands such as `/apply` or `/test` can reuse the same task
  infrastructure

## Command Behavior

### `/review`

The command supports two modes:

1. default review:
   - `/review`
   - builds a built-in code-review prompt
   - aims at the current project and recent local context

2. prompt-driven review:
   - `/review prompt:<text>`
   - uses the user-supplied review instruction

Default review should bias toward:
- bugs
- risks
- behavioral regressions
- missing tests

The output should remain concise and findings-first, matching the
existing review guidance used elsewhere in the bridge.

### `/cancel`

The command operates only on the current channel.

Cancellation priority:
1. if there is a running task, cancel that task first
2. otherwise cancel the earliest queued task
3. otherwise report that there is no cancellable task

The command does not require a task id in the MVP. This keeps the UX
simple and aligned with the bridge's current "one active lane per
channel" model.

## Queue Model Changes

Replace the Promise-tail-only model with an explicit queue state per
channel:

- `activeTask`
- `pendingTasks[]`

Each queue entry should retain:
- `taskId`
- `taskType`
- `prompt`
- `promptPreview`
- `status`
- execution callback
- cancellation hooks

The queue must support:
- enqueue
- runtime inspection
- cancel active task
- cancel next queued task

The queue remains in-memory for the MVP.

## Task Model Changes

Extend the task model with:
- `taskType: "run" | "review"`
- `status: "queued" | "running" | "completed" | "failed" | "cancelled"`

`/run` and `/review` should both flow through the same orchestrator.
They only differ in the prompt generation and task type metadata.

## Codex Adapter Changes

The adapter must become abort-aware.

Required behavior:
- start the local `codex` process in a way that exposes the child handle
- accept an `AbortSignal`
- terminate the running child process on abort
- surface a distinct cancelled result to the orchestrator

The cancellation strategy should be pragmatic:
1. send a normal termination signal
2. wait briefly
3. force kill if the process does not exit

This is sufficient for MVP and avoids trying to preserve partial Codex
output or build protocol-level interruption.

## Orchestrator Changes

The orchestrator remains the source of truth for task submission and
result shaping.

It must now:
- submit both `run` and `review` tasks
- pass abort signals down to the adapter
- map adapter cancellation into a `cancelled` task result
- update session state only when appropriate

For cancelled tasks:
- do not treat them as failures
- do not overwrite channel session summaries with cancellation text
- keep the last successful or failed session context intact unless a new
  Codex session id was actually produced before cancellation

## `/status` Changes

`/status` should reflect:
- whether a task is currently cancellable
- the active task type
- queue depth
- the current task id

It does not need to show historical cancelled tasks in the MVP.

## Error Handling

### Cancelling a running task

If the child process terminates cleanly, report the task as cancelled.
If the termination attempt itself fails, report that cancellation was
attempted but could not be completed.

### Cancelling a queued task

Queued task cancellation should complete synchronously and never touch
the adapter.

### Review prompt generation

If default review prompt construction fails for any reason, fail fast and
report the command error without enqueueing a task.

## Testing

Add tests for:
- default `/review` prompt generation
- prompt-driven `/review`
- cancelling a queued task
- cancelling a running task
- queue runtime state after cancellation
- adapter abort behavior
- `/status` output for cancellable state

## Risks

- child-process cancellation differs slightly across platforms
- a cancelled process may still emit trailing output before exiting
- queue refactoring touches core execution flow

These are acceptable for MVP if the implementation keeps the queue API
small, the adapter abort path narrow, and tests cover both queued and
running cancellation paths.
