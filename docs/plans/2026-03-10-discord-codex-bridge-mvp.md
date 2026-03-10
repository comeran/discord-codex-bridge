# discord-codex-bridge MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a runnable MVP Discord bot that binds a channel to a project directory and executes channel tasks serially through `codex exec`.

**Architecture:** A single Node.js service handles Discord messages, stores channel bindings and session metadata in local JSON files, serializes work with a per-channel queue, and delegates execution through a replaceable `CodexAdapter`. The first adapter runs the local Codex CLI with `codex exec` in the bound project directory.

**Tech Stack:** Node.js, TypeScript, discord.js, dotenv, zod, pino, vitest

---

### Task 1: Create repository scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

**Step 1: Write the base package manifest**

Include runtime deps for Discord, config validation, and logging, plus dev deps for TypeScript, test runner, and local dev execution.

**Step 2: Add TypeScript configs**

Use a strict project config for development and a build config that emits to `dist/`.

**Step 3: Add repo hygiene files**

Ignore `node_modules`, `dist`, `.env`, and runtime `data/`.

**Step 4: Document startup**

Write README sections for setup, binding, running, testing, and project structure.

### Task 2: Define domain contracts

**Files:**
- Create: `src/types/config.ts`
- Create: `src/types/domain.ts`
- Create: `src/types/adapter.ts`

**Step 1: Define config contracts**

Capture validated env config, data paths, and runtime options.

**Step 2: Define domain models**

Add binding, session, task, status, and queue-related types.

**Step 3: Define adapter contracts**

Describe the interface for Codex execution independent from Discord.

### Task 3: Add config, logging, and filesystem stores

**Files:**
- Create: `src/config/env.ts`
- Create: `src/utils/logger.ts`
- Create: `src/store/file-store.ts`
- Create: `src/store/binding-store.ts`
- Create: `src/store/session-store.ts`

**Step 1: Load and validate environment**

Use `dotenv` and `zod` to validate required configuration and set defaults.

**Step 2: Add logger**

Expose a shared `pino` logger configured for readable local development.

**Step 3: Implement JSON file persistence**

Provide a generic file store with safe read/write helpers and directory creation.

**Step 4: Implement binding and session stores**

Support create, read, update, list, and simple get-by-channel operations.

### Task 4: Implement queueing and orchestration

**Files:**
- Create: `src/core/channel-task-queue.ts`
- Create: `src/core/task-orchestrator.ts`
- Create: `src/core/message-formatter.ts`

**Step 1: Build a per-channel serial queue**

Guarantee only one active task per channel while allowing different channels to work independently.

**Step 2: Implement orchestration**

Create tasks, update status, invoke the adapter, persist session metadata, and return formatted execution results.

**Step 3: Add Discord-safe formatting**

Chunk long responses and normalize status or error output for channel replies.

### Task 5: Implement the Codex CLI adapter

**Files:**
- Create: `src/adapters/codex-cli-adapter.ts`

**Step 1: Spawn `codex exec`**

Run the local CLI in the bound project directory and capture stdout, stderr, exit code, and timing.

**Step 2: Add safety and diagnostics**

Support timeout, binary-not-found handling, and structured logging fields.

**Step 3: Preserve future session hooks**

Accept channel session context now and reserve fields for future `resume` support.

### Task 6: Wire up the Discord bot

**Files:**
- Create: `src/bot/bot.ts`
- Create: `src/bot/message-handler.ts`
- Create: `src/index.ts`

**Step 1: Bootstrap the Discord client**

Listen for message events with the minimum required intents.

**Step 2: Implement message handling**

Ignore bot messages, support a lightweight bind command, and route normal messages into the orchestrator.

**Step 3: Start the application**

Initialize stores, adapter, orchestrator, and bot wiring from a single entrypoint.

### Task 7: Add baseline tests

**Files:**
- Create: `tests/channel-task-queue.test.ts`
- Create: `tests/binding-store.test.ts`
- Create: `tests/task-orchestrator.test.ts`

**Step 1: Test queue serialization**

Verify tasks in the same channel execute in order and tasks in different channels can overlap.

**Step 2: Test binding persistence**

Verify the store saves and retrieves channel bindings correctly.

**Step 3: Test orchestration with a fake adapter**

Verify status transitions, session updates, and success/error mapping.

### Task 8: Verify the scaffold

**Files:**
- Modify: `README.md`

**Step 1: Install dependencies**

Run: `npm install`
Expected: dependencies install without errors

**Step 2: Run tests**

Run: `npm test`
Expected: all baseline tests pass

**Step 3: Build the project**

Run: `npm run build`
Expected: TypeScript compiles to `dist/`

**Step 4: Smoke-check the runtime**

Run: `npm run dev`
Expected: startup validation runs and exits clearly if env values are missing
