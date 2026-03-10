# Review And Cancel Commands Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/review` and `/cancel` to the Discord bridge, including queue-aware cancellation of queued tasks and running local `codex` CLI processes.

**Architecture:** Refactor the per-channel queue from a Promise-tail-only model into an explicit task queue with runtime entries and cancellation hooks. Keep `/run` and `/review` on one orchestrator path, and make the Codex CLI adapter abort-aware so `/cancel` can terminate the current child process while queued tasks are removed in-memory.

**Tech Stack:** Node.js, TypeScript, discord.js, vitest

---

### Task 1: Add failing tests for cancellable queue behavior

**Files:**
- Modify: `tests/channel-task-queue.test.ts`
- Modify: `src/core/channel-task-queue.ts`

**Step 1: Write the failing test**

Add tests that verify:
- the queue can cancel the earliest queued task without touching the active task
- the queue reports the active task type and cancellable state
- cancelling a queued task resolves with a distinct cancelled outcome

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/channel-task-queue.test.ts`
Expected: FAIL because the queue cannot cancel queued work yet.

**Step 3: Write minimal implementation**

Refactor the queue into explicit per-channel state with:
- `activeTask`
- `pendingTasks[]`
- `cancelActive(channelId)`
- `cancelNext(channelId)`
- a small queue result contract for cancelled tasks

Keep the queue API narrow and avoid introducing persistence.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/channel-task-queue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/channel-task-queue.test.ts src/core/channel-task-queue.ts
git commit -m "feat(core): add cancellable channel queue"
```

### Task 2: Add failing tests for abort-aware Codex CLI execution

**Files:**
- Modify: `tests/codex-cli-adapter.test.ts`
- Modify: `src/adapters/codex-cli-adapter.ts`
- Modify: `src/types/adapter.ts`

**Step 1: Write the failing test**

Add tests that verify:
- the adapter accepts an abort signal
- aborting execution returns a distinct cancelled result
- the adapter does not map cancellation to a generic failure

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/codex-cli-adapter.test.ts`
Expected: FAIL because the adapter does not support abort yet.

**Step 3: Write minimal implementation**

Extend the execute input with `AbortSignal` and update the CLI adapter to:
- spawn `codex`
- capture the child process handle
- terminate on abort
- return a cancelled adapter result

Prefer a normal termination signal first, then force-kill only if needed.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/codex-cli-adapter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/codex-cli-adapter.test.ts src/adapters/codex-cli-adapter.ts src/types/adapter.ts
git commit -m "feat(codex): add abort-aware cli execution"
```

### Task 3: Add failing tests for orchestrator cancellation and review task types

**Files:**
- Modify: `tests/task-orchestrator.test.ts`
- Modify: `src/core/task-orchestrator.ts`
- Modify: `src/types/domain.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `/review` and `/run` share the same orchestration path but preserve task type metadata
- cancelled adapter results become `cancelled` task results
- cancelled tasks do not overwrite session summaries like hard failures do

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/task-orchestrator.test.ts`
Expected: FAIL because task types and cancellation state are not modeled yet.

**Step 3: Write minimal implementation**

Extend domain types with:
- `TaskType`
- `cancelled` task status

Update the orchestrator to:
- accept task type in the request
- pass abort signals into the adapter
- surface a cancelled execution result
- preserve session continuity rules on cancellation

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/task-orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/task-orchestrator.test.ts src/core/task-orchestrator.ts src/types/domain.ts
git commit -m "feat(core): model review and cancelled tasks"
```

### Task 4: Add failing tests for `/review`

**Files:**
- Create: `tests/review-command-handler.test.ts`
- Create: `src/bot/review-command-handler.ts`
- Modify: `src/core/message-formatter.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `/review` without a prompt uses the default review prompt
- `/review prompt:<text>` uses the supplied prompt
- both paths enqueue through the orchestrator and return Discord status/result messages

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/review-command-handler.test.ts`
Expected: FAIL because the review handler does not exist.

**Step 3: Write minimal implementation**

Create a dedicated review handler that:
- resolves the channel binding
- builds a default findings-first review prompt when no prompt is supplied
- submits a `review` task through the orchestrator

Keep prompt construction local and deterministic.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/review-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/review-command-handler.test.ts src/bot/review-command-handler.ts src/core/message-formatter.ts
git commit -m "feat(bot): add review command"
```

### Task 5: Add failing tests for `/cancel`

**Files:**
- Create: `tests/cancel-command-handler.test.ts`
- Create: `src/bot/cancel-command-handler.ts`
- Modify: `src/core/channel-status-service.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `/cancel` terminates the running task when one exists
- `/cancel` otherwise removes the next queued task
- `/cancel` returns a clean no-op response when nothing is cancellable

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/cancel-command-handler.test.ts`
Expected: FAIL because the cancel handler does not exist and the queue is not exposed through a cancellation service yet.

**Step 3: Write minimal implementation**

Create a cancel handler and a small queue-facing service that decides:
- cancel active first
- otherwise cancel queued
- otherwise report nothing to cancel

Keep cancellation scoped to the current channel only.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/cancel-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/cancel-command-handler.test.ts src/bot/cancel-command-handler.ts src/core/channel-status-service.ts
git commit -m "feat(bot): add cancel command"
```

### Task 6: Add failing tests for updated command registration and status output

**Files:**
- Modify: `tests/bot-command-registration.test.ts`
- Modify: `tests/status-command-handler.test.ts`
- Modify: `src/bot/bot.ts`
- Modify: `src/index.ts`
- Modify: `src/bot/status-command-handler.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `review` and `cancel` are registered slash command families
- `/status` shows active task type and whether the current task is cancellable

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/bot-command-registration.test.ts tests/status-command-handler.test.ts`
Expected: FAIL because the new commands are not registered and status output does not include cancellation-aware fields.

**Step 3: Write minimal implementation**

Wire the new handlers into bot startup and registration. Update status formatting to show:
- active task type
- whether the current channel has a cancellable task

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/bot-command-registration.test.ts tests/status-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/bot-command-registration.test.ts tests/status-command-handler.test.ts src/bot/bot.ts src/index.ts src/bot/status-command-handler.ts
git commit -m "feat(bot): wire review and cancel commands"
```

### Task 7: Update help text and README

**Files:**
- Modify: `README.md`
- Modify: `src/core/message-formatter.ts`
- Modify: `tests/message-formatter.test.ts`

**Step 1: Write the failing test**

Update or extend help-text tests so `!codex-help` includes:
- `/review`
- `/cancel`
- the fact that `/cancel` can terminate the current local Codex task

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/message-formatter.test.ts`
Expected: FAIL because help text is missing the new commands.

**Step 3: Write minimal implementation**

Update README and help text to describe:
- `/review` default and prompt-driven behavior
- `/cancel` current-channel semantics
- the continued exclusion of auth and raw CLI passthrough

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/message-formatter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md src/core/message-formatter.ts tests/message-formatter.test.ts
git commit -m "docs(bot): document review and cancel commands"
```

### Task 8: Final verification

**Files:**
- Modify: `src/bot/bot.ts`
- Modify: `src/index.ts`

**Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no TypeScript errors

**Step 3: Run build**

Run: `npm run build`
Expected: project compiles cleanly

**Step 4: Smoke-test bot startup**

Run: `set -a; source /Users/zane/Documents/Self/Project/opensource/discord-codex-bridge/.env; set +a; npm run dev`
Expected: the bot starts, logs in, and registers slash commands without throwing.

**Step 5: Commit**

```bash
git add src tests README.md
git commit -m "feat(bot): ship review and cancel commands"
```
