# Channel Session Resume Design

**Date:** 2026-03-10

## Goal

Upgrade channel-level context handling from prompt-summary continuity to
native Codex session continuity. Each Discord channel should reuse the
most recent Codex session id when handling later tasks, including after
process restarts.

## Scope

Included:
- capture Codex `thread_id` from `codex exec --json`
- persist the session id per Discord channel
- reuse that session id through `codex exec resume <session_id>`
- automatically fall back to a fresh `codex exec --json` run if resume
  fails
- keep lightweight history summaries for diagnostics and fallback

Excluded:
- multi-session branching per channel
- commands to inspect or reset past Codex sessions
- complete conversation transcript persistence
- Discord UI changes

## Recommended Approach

Use a `session id` first strategy with summary fallback.

For a channel with no saved session id:
- run `codex exec --json`
- extract `thread_id`
- store it as `lastCodexSessionId`

For a channel with a saved session id:
- run `codex exec resume <session_id>`
- if resume succeeds, keep using the same session id
- if resume fails, log the failure and automatically fall back to a new
  `codex exec --json` session

This preserves continuity while keeping the system resilient when local
Codex state changes or resume data becomes invalid.

## Data Model

The existing `ChannelSession` contract is sufficient:

- `channelId`
- `historySummary`
- `lastCodexSessionId`
- `lastTaskId`
- `updatedAt`

The change is behavioral: `lastCodexSessionId` becomes an active field
instead of a placeholder.

## Adapter Changes

The Codex CLI adapter should support two execution paths:

1. fresh session:
   - `codex exec --json ...`
   - parse JSONL events
   - capture `thread.started.thread_id`
   - capture final response content

2. resumed session:
   - `codex exec resume --json <session_id> ...`
   - capture final response content
   - reuse the same session id unless the CLI emits a replacement id

The adapter should expose whether resume was attempted and whether it
fell back to a fresh run, mainly for logging and tests.

## Orchestrator Changes

The orchestrator continues to:
- read channel session state before execution
- pass that state into the adapter
- persist the updated session after execution

The main difference is that session persistence should now prioritize
the adapter-reported session id rather than only storing summaries.

## Error Handling

### Resume failure

If `codex exec resume` exits non-zero:
- log it with task id, channel id, project path, and prior session id
- automatically run a fresh `codex exec --json`
- update the stored session id if the new run yields one

### Missing thread id

If a fresh `exec --json` run succeeds but no `thread_id` is emitted:
- return the task result normally
- keep `lastCodexSessionId` unset
- log a warning for later diagnosis

### Hard execution failure

If both resume and fallback fresh execution fail:
- return the failure to Discord
- preserve the last known session summary

## Testing

Add tests for:
- capturing `thread_id` from JSONL output
- using `resume` when a session id exists
- falling back from failed resume to fresh exec
- preserving session state across orchestrated runs

## Risks

- Codex JSONL event shapes may evolve
- resume may depend on local Codex state not visible to this process
- some failures may produce partial stdout mixed with JSONL

These are acceptable for MVP if parsing is defensive and fallback stays
automatic.
