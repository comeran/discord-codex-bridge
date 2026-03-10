# Discord Command Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Discord-native slash command surface for execution, project management, session inspection, and safe skill/MCP discovery without exposing login or raw CLI passthrough features.

**Architecture:** Extend the existing Discord bot with command-family handlers that reuse current binding, session, queue, and orchestrator modules. Keep execution on the same task pipeline used by plain channel messages, and implement read-only discovery for skills and MCP servers through narrow service interfaces instead of direct Discord-specific logic in adapters.

**Tech Stack:** Node.js, TypeScript, discord.js, vitest

---

### Task 1: Add failing tests for runtime status inspection

**Files:**
- Create: `tests/channel-status-service.test.ts`
- Modify: `src/core/channel-task-queue.ts`
- Modify: `src/store/session-store.ts`

**Step 1: Write the failing test**

Add tests that expect a channel status service to report:
- `idle` when a bound channel has no active work
- `running` when a task is executing
- queue depth when additional tasks are pending

Use a stub queue and session store state so the tests do not depend on Discord.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/channel-status-service.test.ts`
Expected: FAIL because no channel status service exists yet.

**Step 3: Write minimal implementation**

Create a status-focused service that reads:
- binding information
- session metadata
- queue runtime state

Add a read-only queue inspection method instead of exposing queue internals directly.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/channel-status-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/channel-status-service.test.ts src/core/channel-task-queue.ts src/store/session-store.ts src/core/channel-status-service.ts
git commit -m "feat(core): add channel status service"
```

### Task 2: Add failing tests for `/project` and `/session` handlers

**Files:**
- Create: `tests/project-command-handler.test.ts`
- Create: `tests/session-command-handler.test.ts`
- Modify: `src/store/binding-store.ts`
- Modify: `src/store/session-store.ts`

**Step 1: Write the failing test**

Add tests covering:
- `/project bind` accepts an absolute path and persists the channel binding
- `/project show` formats the bound project and sandbox mode
- `/project unbind` removes the binding
- `/session show` returns current session summary and last Codex session id
- `/session reset` clears channel session state without touching the binding

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-command-handler.test.ts tests/session-command-handler.test.ts`
Expected: FAIL because command handlers and session reset behavior are incomplete.

**Step 3: Write minimal implementation**

Create:
- `src/bot/project-command-handler.ts`
- `src/bot/session-command-handler.ts`

Add a `reset(channelId)` helper to the session store if one does not exist.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-command-handler.test.ts tests/session-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/project-command-handler.test.ts tests/session-command-handler.test.ts src/bot/project-command-handler.ts src/bot/session-command-handler.ts src/store/binding-store.ts src/store/session-store.ts
git commit -m "feat(bot): add project and session slash commands"
```

### Task 3: Add failing tests for `/run` reusing the existing orchestration path

**Files:**
- Create: `tests/run-command-handler.test.ts`
- Modify: `src/core/task-orchestrator.ts`
- Modify: `src/bot/message-handler.ts`

**Step 1: Write the failing test**

Add tests that verify `/run prompt:<text>`:
- resolves the current channel binding
- submits work to the same orchestrator path as plain channel messages
- returns a queued or started status message

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/run-command-handler.test.ts`
Expected: FAIL because no `/run` handler exists yet.

**Step 3: Write minimal implementation**

Create `src/bot/run-command-handler.ts` and route it through the same orchestration entry point used by normal messages. If that entry point is currently embedded in the message handler, extract it into a shared submission helper.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/run-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/run-command-handler.test.ts src/bot/run-command-handler.ts src/bot/message-handler.ts src/core/task-orchestrator.ts
git commit -m "feat(bot): add slash run command"
```

### Task 4: Add failing tests for slash command registration and routing

**Files:**
- Create: `tests/bot-command-registration.test.ts`
- Modify: `src/bot/bot.ts`

**Step 1: Write the failing test**

Add tests that verify the bot registers these command families:
- `project`
- `session`
- `sandbox`
- `run`
- `status`
- `skill`
- `mcp`

Also verify interactions are routed to the matching handler module.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/bot-command-registration.test.ts`
Expected: FAIL because the new command families are not registered.

**Step 3: Write minimal implementation**

Refactor bot startup so command metadata is composed from modular handler exports instead of a single inline list.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/bot-command-registration.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/bot-command-registration.test.ts src/bot/bot.ts src/bot/run-command-handler.ts src/bot/project-command-handler.ts src/bot/session-command-handler.ts
git commit -m "feat(bot): register command families"
```

### Task 5: Add failing tests for `/status` command formatting

**Files:**
- Create: `tests/status-command-handler.test.ts`
- Create: `src/bot/status-command-handler.ts`
- Modify: `src/core/message-formatter.ts`

**Step 1: Write the failing test**

Add tests that verify `/status` reports:
- bound project path
- effective sandbox mode
- queue depth
- active task id or idle state
- session id presence or absence

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/status-command-handler.test.ts`
Expected: FAIL because no `/status` command exists.

**Step 3: Write minimal implementation**

Create a dedicated status formatter or reuse the existing message formatter with a command-specific output shape.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/status-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/status-command-handler.test.ts src/bot/status-command-handler.ts src/core/message-formatter.ts src/core/channel-status-service.ts
git commit -m "feat(bot): add status command"
```

### Task 6: Add failing tests for skill discovery commands

**Files:**
- Create: `tests/skill-command-handler.test.ts`
- Create: `src/core/skill-discovery-service.ts`
- Create: `src/bot/skill-command-handler.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `/skill list` returns a formatted list of available local skills
- `/skill show` returns summary details for a named skill
- missing skills return a clean not-found response

Stub skill discovery so tests do not scan the real filesystem.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/skill-command-handler.test.ts`
Expected: FAIL because the discovery service and command handler do not exist.

**Step 3: Write minimal implementation**

Implement a small service that reads skill metadata from configured local skill sources and returns normalized records the bot can format.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/skill-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/skill-command-handler.test.ts src/core/skill-discovery-service.ts src/bot/skill-command-handler.ts
git commit -m "feat(bot): add skill discovery commands"
```

### Task 7: Add failing tests for MCP discovery commands

**Files:**
- Create: `tests/mcp-command-handler.test.ts`
- Create: `src/core/mcp-discovery-service.ts`
- Create: `src/bot/mcp-command-handler.ts`

**Step 1: Write the failing test**

Add tests that verify:
- `/mcp list` returns configured MCP servers or resources
- `/mcp show` returns details for one named server
- unavailable discovery is reported as unavailable rather than crashing

Use a stub discovery adapter so tests stay deterministic.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp-command-handler.test.ts`
Expected: FAIL because MCP discovery support does not exist yet.

**Step 3: Write minimal implementation**

Implement a narrow discovery service. It should provide read-only metadata only and must not expose raw MCP command execution.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp-command-handler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/mcp-command-handler.test.ts src/core/mcp-discovery-service.ts src/bot/mcp-command-handler.ts
git commit -m "feat(bot): add mcp discovery commands"
```

### Task 8: Integrate docs and help text

**Files:**
- Modify: `README.md`
- Modify: `src/bot/message-handler.ts`

**Step 1: Write the failing test**

If help text is test-covered, update or add tests asserting `!codex-help` includes the new slash command families and the safety boundary for excluded auth or raw CLI commands.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: either help tests fail or no new documentation exists.

**Step 3: Write minimal implementation**

Update README command documentation and the in-channel help text. Make it explicit that:
- plain messages still execute tasks
- slash commands provide structured control
- login and token workflows are intentionally unsupported

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md src/bot/message-handler.ts
git commit -m "docs: document discord command surface"
```

### Task 9: Final verification

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

Run: `npm run dev`
Expected: the bot starts, logs in, and registers slash commands without throwing.

**Step 5: Commit**

```bash
git add src/bot/bot.ts src/index.ts README.md tests
git commit -m "feat(bot): ship discord command surface"
```
