# Repository Metadata

This file collects the minimum repository copy needed when creating the
project on GitHub or another Git hosting platform.

## Repository Name

`discord-codex-bridge`

## Short Description

Bridge Discord channels to Codex with one project per channel and
serial task execution.

## Chinese Description

一个通过 Discord 控制 Codex 的本地桥接服务，采用“一条频道绑定一个项目”
的模型，支持频道级上下文隔离和串行任务执行。

## README Summary

`discord-codex-bridge` is a minimal Discord-to-Codex bridge for trusted
local environments. Each Discord channel binds to one local project
directory, keeps independent session metadata, and forwards natural
language tasks to `codex exec` in that project context.

## Problem Statement

Codex is powerful in local project contexts, but operating it across
multiple projects becomes cumbersome when switching between tasks and
collaborators. This project makes Discord the control surface and keeps
project contexts isolated by binding each Discord channel to exactly one
local directory.

## Core Features

- One project binding per Discord channel
- Per-channel session metadata and context continuity
- Per-channel serial task execution
- Replaceable Codex adapter design
- Local JSON persistence for bindings and sessions
- Clear logs for debugging and future automation

## MVP Scope

- Discord text message intake
- Local `codex exec` adapter
- File-backed channel bindings
- File-backed channel sessions
- Queue-based same-channel serialization

## Non-Goals

- Web UI
- Multi-tenant admin backend
- Complex approval or permission workflows
- Full audit system
- Deployment platform integration

## Suggested Topics

- `discord`
- `codex`
- `discord-bot`
- `typescript`
- `nodejs`
- `automation`
- `developer-tools`

## Suggested Initial Release Notes

Initial MVP release of `discord-codex-bridge`.

- Scaffolded a Node.js + TypeScript project structure
- Added a Discord bot entrypoint using `discord.js`
- Implemented file-backed channel bindings and session storage
- Added a per-channel serial task queue
- Added a replaceable Codex adapter with a `codex exec` implementation
- Added baseline tests and build/typecheck scripts

## Suggested GitHub "About" Text

Run Codex from Discord with one project per channel.
