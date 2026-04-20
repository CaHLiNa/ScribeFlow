# Codex ACP 运行时收敛

## 目标

把 ScribeFlow 的 AI 执行边界收敛到一条清晰主路径：

- `codex` 负责用户本机的 launcher defaults
- `codex-acp` 负责桌面应用与 Codex 之间的 ACP bridge
- ScribeFlow 只负责桌面端 session、artifact、verification 与研究工作流集成

这意味着应用不再维护自建 provider runtime，也不再假装自己是另一套 model gateway。

## 收敛结论

当前稳定边界如下：

- `runtimeBackend = "codex-acp"`
- `codexCli` 配置块继续保留，表示 launcher defaults，而不是 transport 本身
- `codex_acp_runtime.rs` 是唯一执行主路径
- `codex_cli.rs` 只负责检测本机 `codex` 命令与 launcher 状态

## 配置模型

`ai.json` 现在只保留两类信息：

1. `researchDefaults`
   - 默认引用样式
   - evidence strategy
   - completion threshold

2. `codexCli`
   - `commandPath`
   - `model`
   - `profile`
   - `sandboxMode`
   - `webSearch`
   - `useAsciiWorkspaceAlias`

这里的 `codexCli` 不是旧式 provider config，而是：

- ACP bridge 要连接的 `codex` launcher
- 默认 model/profile 覆盖
- 运行时工作目录兼容设置

## Rust 运行时职责

Rust 侧当前承担以下职责：

- 解析与持久化 `ai.json`
- 检测本机 `codex` 命令是否可用
- 启动 `codex-acp` bridge
- 建立与恢复 ACP session
- 发送 prompt、处理中断、消费 permission 事件
- 持久化 session overlay
- 应用 artifact
- 执行 reference / citation / bibliography / compile verification

前端不再承担：

- provider catalog
- API key 管理
- model pool 聚合
- HTTP AI proxy / 自建 responses stream

## Prepare 层

`ai_agent_prepare_current_config` 现在是 thin prepare layer。

它只负责：

- 读取当前 session
- 注入当前 workspacePath
- 注入 `codexCli` launcher defaults
- 返回 ACP 主路径需要的最小 prepared run

它不再承担：

- 旧 provider 兼容语义
- 伪 model/provider runtime 拼装
- 未接实的 research planner 外壳

## UI 语义

桌面端 AI 面板现在应该按这套心智模型理解：

- 面板展示的是 `Codex ACP` session
- 模型信息是当前 launcher override 的展示值，不是“可浏览的 provider model catalog”
- artifact apply 是 ScribeFlow 本地产品能力，不依赖一层失效的 tool gating

设置页保留：

- `Research defaults`
- `Codex ACP` runtime settings

设置页不再表达：

- provider 列表
- API key
- provider connection test
- model pool

## 已删除的残留

本次收敛明确移除了以下历史路径：

- Tauri `network.rs` 中未被前端使用的 AI proxy / stream 命令
- AI config 中未使用的 `enabledTools`
- 前端 store 中的伪 provider/model pool 壳层
- 失效的 artifact capability gating

## 兼容说明

为了避免一次性破坏已有用户设置：

- `codexCli` 字段名继续沿用
- `commandPath` 仍指向用户本机的 `codex` 命令

这只是配置名兼容，不代表应用仍走旧式 `codex exec` 直连模式。

## 后续方向

后续若继续扩展，应遵循同一条原则：

- transport 扩展走 ACP / MCP
- 产品差异继续落在 ScribeFlow 的 artifact / verification / research workflow

不要重新引入：

- 自建 provider runtime
- 应用内 API key 体系
- 另一套独立 model catalog
