# discord-codex-bridge

[English](./README.md) | [简体中文](./README.zh-CN.md)

`discord-codex-bridge` 是一个面向可信本地环境的轻量 Discord 到 Codex 桥接器。每个 Discord 频道会绑定到一个本地项目目录，维护各自的频道会话元数据，并通过本地 `codex exec` CLI 串行执行任务。

## MVP 功能

- 每个 Discord 频道绑定一个项目目录
- 按频道维持 Codex 会话连续性
- 按频道串行执行任务
- 用本地 JSON 文件持久化绑定和会话信息
- 可替换的 Codex 适配器接口
- 带任务和频道上下文的结构化日志

## 架构

```text
Discord channel
  -> message handler
  -> task orchestrator
  -> per-channel queue
  -> Codex adapter
  -> codex exec in bound project directory
  -> Discord reply
```

## 项目结构

```text
src/
  adapters/   Codex 后端适配器
  bot/        Discord 启动和消息处理
  config/     环境加载和校验
  core/       队列、任务编排、消息格式化
  store/      文件持久化
  types/      共享契约和领域类型
  utils/      日志等通用工具
tests/        基础测试
docs/plans/   设计和实现说明
```

## 运行要求

- Node.js 20+
- 一个启用了 `Message Content Intent` 的 Discord Bot Token
- 本地已安装并可正常使用的 `codex` CLI

当前 MVP 假设运行在可信的 Discord 服务器中。任何能访问该 Bot 的用户，都可以把频道绑定到本地目录，并在该目录中触发 Codex 执行。

## 快速开始

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制 `.env.example` 为 `.env`，并填入你的 token：

   ```bash
   cp .env.example .env
   ```

3. 以开发模式启动 Bot：

   ```bash
   npm run dev
   ```

## 命令

- `!bind /absolute/path/to/project`
  将当前频道绑定到一个项目目录。
- `!binding`
  显示当前频道的绑定信息。
- `!unbind`
  移除当前频道绑定。
- `!codex-help`
  输出命令帮助。
- `/project bind path:<absolute-path>`
  将当前频道绑定到一个项目目录。
- `/project show`
  显示当前频道绑定的项目目录。
- `/project unbind`
  移除当前频道绑定。
- `/session show`
  显示当前频道的会话摘要和保存的 Codex 会话 ID。
- `/session reset`
  清空当前频道的会话元数据，但不解除项目绑定。
- `/run prompt:<text>`
  在当前频道中显式执行一条 Codex 任务。
- `/review`
  对当前项目运行默认的 findings-first 代码审查提示词。
- `/review prompt:<text>`
  使用自定义审查指令运行 review 任务。
- `/cancel`
  取消当前频道任务。优先终止正在运行的本地 Codex 进程，否则移除下一个排队任务。
- `/status`
  显示当前项目路径、队列深度、活动任务和会话状态。
- `/sandbox show`
  显示当前频道生效的 sandbox 模式。
- `/sandbox set mode:<read-only|workspace-write|danger-full-access>`
  为当前频道设置 sandbox 模式覆盖值。
- `/sandbox reset`
  将当前频道恢复为全局默认 sandbox 模式。
- `/skill list`
  列出从本地 Codex Home 自动发现的技能。
- `/skill show name:<skill>`
  显示某个已发现的本地技能。
- `/mcp list`
  列出本地 Codex 配置中的 MCP 服务器。
- `/mcp show name:<server>`
  显示某个已配置的 MCP 服务器。

绑定频道中的普通消息会被视为一条 Codex 任务。

`danger-full-access` 风险较高。在这个模式下，后续任务可以写入 `.git`、创建提交，并运行更危险的本地命令。

当前命令集有意排除了登录、输入 token、原始 Codex CLI 透传、部署和发布流程。

## 数据文件

Bot 会把状态存储在 `DATA_DIR` 下：

- `bindings.json` 保存频道到项目的绑定关系
- 频道绑定中也会保存可选的按频道 sandbox 覆盖值
- `sessions.json` 保存按频道的会话元数据

当前 MVP 中，排队任务只保存在内存里。进程重启后，尚未完成的任务会丢失。

## 开发

运行测试：

```bash
npm test
```

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build
```

## Codex 执行说明

默认适配器执行的命令为：

```bash
codex exec --json -C <projectPath> --skip-git-repo-check -s workspace-write
```

频道会话连续性现在优先复用原生 Codex session。桥接器会为每个 Discord 频道保存最新的 Codex `thread_id`，后续任务优先使用 `codex exec resume`。如果 resume 失败，会自动回退到新的 `codex exec --json` 会话，并更新保存的 session id。恢复执行时也会通过 CLI 配置覆盖重新应用当前的 sandbox 模式，确保恢复后的任务仍然符合项目的写入策略。`historySummary` 仍然会保留一份紧凑摘要，用于诊断和兜底上下文。
