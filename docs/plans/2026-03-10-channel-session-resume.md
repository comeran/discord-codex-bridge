# Channel Session Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the Discord bridge to reuse native Codex sessions per channel via `codex exec resume`, with automatic fallback to a fresh session when resume fails.

**Architecture:** The Codex CLI adapter becomes responsible for both starting new JSON-mode executions and resuming existing sessions. The orchestrator continues to load and persist `ChannelSession`, but now relies on adapter-reported session ids as the primary continuity mechanism.

**Tech Stack:** Node.js, TypeScript, discord.js, vitest

---

### Task 1: Add adapter regression tests first

**Files:**
- Modify: `tests/codex-cli-adapter.test.ts`

**Step 1: Add a failing test for fresh exec arg construction**

Verify new-session args include `--json` and no unsupported approval flags.

**Step 2: Add a failing test for resume arg construction**

Verify resume args call `exec resume --json <session_id>`.

**Step 3: Add a failing test for thread id parsing**

Verify JSONL parsing extracts `thread_id` and final message content.

### Task 2: Implement adapter JSONL parsing and resume execution

**Files:**
- Modify: `src/adapters/codex-cli-adapter.ts`

**Step 1: Split fresh exec and resume argument builders**

Add explicit helpers for new-session and resumed-session commands.

**Step 2: Parse JSONL events**

Extract `thread.started.thread_id` and the final assistant message from
event lines while ignoring non-JSON diagnostics.

**Step 3: Implement resume-first execution**

If `lastCodexSessionId` exists, try resume first. If it fails, fall back
to a fresh exec and return the fresh session id.

### Task 3: Adjust orchestration persistence

**Files:**
- Modify: `src/core/task-orchestrator.ts`

**Step 1: Persist adapter-returned session ids**

Make sure successful fresh exec and successful fallback both update the
channel session.

**Step 2: Preserve summary fallback**

Keep writing `historySummary` so the channel retains a small diagnostic
trail even if native session resume is unavailable later.

### Task 4: Extend orchestration tests

**Files:**
- Modify: `tests/task-orchestrator.test.ts`

**Step 1: Add a failing test for saved session ids**

Verify a returned `sessionId` is written to `sessions.json`.

**Step 2: Add a failing test for reuse**

Verify the adapter receives the existing channel session on later tasks.

### Task 5: Verify the upgrade end-to-end

**Files:**
- Modify: `README.md`

**Step 1: Run tests**

Run: `npm test`
Expected: all tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no TypeScript errors

**Step 3: Run build**

Run: `npm run build`
Expected: project compiles cleanly

**Step 4: Update docs**

Document that per-channel continuity now prefers native Codex session
resume and falls back to summaries only when necessary.
