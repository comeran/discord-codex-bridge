# Channel Sandbox Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-channel sandbox configuration that users can inspect and change from Discord via slash commands.

**Architecture:** Channel bindings become the source of truth for effective sandbox mode. The binding store resolves an effective sandbox mode from either the channel override or the global default. Discord slash commands update that channel-scoped setting, and the task orchestrator passes the resolved mode into the Codex CLI adapter for both fresh and resumed sessions.

**Tech Stack:** Node.js, TypeScript, discord.js, vitest

---

### Task 1: Add failing tests for channel sandbox persistence

**Files:**
- Modify: `tests/binding-store.test.ts`

**Step 1: Add a failing test for default sandbox resolution**

Verify bindings created from older or minimal data resolve to the global default sandbox mode.

**Step 2: Add a failing test for channel override persistence**

Verify setting a per-channel sandbox mode persists and survives future reads.

### Task 2: Add failing tests for sandbox propagation

**Files:**
- Modify: `tests/task-orchestrator.test.ts`

**Step 1: Add a failing test for binding sandbox propagation**

Verify the orchestrator passes the channel binding sandbox mode to the Codex adapter.

### Task 3: Implement channel binding sandbox storage

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/store/binding-store.ts`
- Modify: `src/index.ts`

**Step 1: Add sandbox fields to binding models**

Represent the effective sandbox mode and whether it comes from the default or a channel override.

**Step 2: Normalize persisted bindings**

Support existing JSON bindings without a sandbox field by resolving them to the configured default.

**Step 3: Add update helpers**

Add store methods to set and reset the per-channel sandbox mode.

### Task 4: Implement slash command handling

**Files:**
- Create: `src/bot/sandbox-command-handler.ts`
- Modify: `src/bot/bot.ts`
- Modify: `src/bot/message-handler.ts`

**Step 1: Define slash command metadata**

Add `/sandbox show`, `/sandbox set`, and `/sandbox reset`.

**Step 2: Register commands at startup**

Register the command in each connected guild so new settings are available quickly.

**Step 3: Handle command execution**

Read and update the current channel binding, and return clear status or high-risk warnings.

### Task 5: Wire sandbox mode into execution

**Files:**
- Modify: `src/types/adapter.ts`
- Modify: `src/adapters/codex-cli-adapter.ts`
- Modify: `src/core/task-orchestrator.ts`

**Step 1: Pass sandbox mode per task**

Use the binding’s resolved sandbox mode instead of only the global adapter default.

**Step 2: Keep resume aligned**

Ensure resumed sessions reuse the same resolved sandbox mode.

### Task 6: Verify and document

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

Document text command behavior alongside the new `/sandbox` workflow and note the danger of `danger-full-access`.
