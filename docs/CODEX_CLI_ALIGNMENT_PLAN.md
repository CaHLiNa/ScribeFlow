# Codex CLI 能力对齐计划

## 目标

在不改动当前桌面 UI 方向的前提下，把 ScribeFlow 的 AI/runtime 能力逐步对齐到 Codex CLI 的核心执行模型：

- skill 发现与注入遵循 Codex 风格 `SKILL.md` 包
- runtime 能真实暴露并执行本地工具，而不是只停留在 provider 流式壳层
- 权限、审批、文件修改、命令执行形成可持续扩展的原生 Rust 能力链

## 当前差距

截至 `f770df9`，skill catalog、runtime shape、settings management 已经统一到 `codex-skill` 与 `pathToSkillMd/pathToSkillDir`。

但整体离 Codex CLI 仍有三类核心差距：

1. `src-tauri/src/codex_runtime/tools.rs` 仍基本是空壳，模型缺少真实的本地执行能力。
2. provider 层虽然支持 tool continuation，但没有接上可工作的工具实现与审批链。
3. 还没有形成 Codex CLI 那种分层清晰的 `只读工具 -> 写入/patch -> 命令执行/审批` 渐进执行模型。

## 实施策略

采用三阶段推进，优先补齐最影响整体能力的执行层，而不是继续打磨 skill 文案或 prompt 外形。

### 阶段 1：只读 runtime tools

目标：让模型具备最基本的工作区读取能力，不再只能依赖 prompt 注入的上下文猜测。

范围：

- 在 `codex_runtime/tools.rs` 中实现最小可用只读工具集
- 第一批工具限定为：
  - `read_file`
  - `list_files`
  - `search_files`
- 只允许访问当前 workspace root 内路径
- 输出统一为结构化 JSON 文本，便于模型续轮消费

验收：

- provider 请求里出现真实 `tools`
- 模型发起只读 tool call 时，runtime 能返回真实结果
- `cargo check` 与 `npm run build` 通过

状态：已实现第一批只读工具（`read_file` / `list_files` / `search_files`）

### 阶段 2：写入与 patch 执行

目标：补齐 Codex CLI 最关键的文件修改闭环。

范围：

- 实现 `apply_patch`
- 接入文件变更审批事件
- 让 runtime item / session rail 能正确显示 patch 申请与结果

验收：

- 模型可生成 patch 并由 runtime 执行
- UI 可见审批与结果
- 工作区越权写入被阻止

状态：已实现首个闭环（`apply_patch` + runtime 审批 + 结果回传）

### 阶段 3：命令执行与交互编排

目标：补齐更接近 Codex CLI 的 agent 编排能力。

范围：

- 实现 `exec_command`
- 接入命令审批与输出流
- 逐步对齐 `request_user_input`、plan/exit-plan、后续自动化能力

验收：

- runtime 可执行受控命令
- 审批流与输出回传完整
- 形成可扩展的工具注册与执行边界

状态：待开始

## 本次切片

当前已完成两个切片：

1. 阶段 1：只读工具层
2. 阶段 2：`apply_patch` 的首个受控闭环

本次已完成：

- 在 `src-tauri/src/codex_runtime/tools.rs` 中实现 `read_file`
- 在 `src-tauri/src/codex_runtime/tools.rs` 中实现 `list_files`
- 在 `src-tauri/src/codex_runtime/tools.rs` 中实现 `search_files`
- 三个工具都限制在当前 workspace root 内执行
- 工具结果统一输出为结构化 JSON 文本

阶段 2 已额外完成：

- 在 `src-tauri/src/codex_runtime/tools.rs` 中实现受限版 `apply_patch`
- 在 `src-tauri/src/codex_runtime/providers.rs` 中接入 runtime-managed permission request / resolve 等待
- 用户拒绝 patch 时，错误结果会回传给模型进入续轮
- 用户批准 patch 时，变更会在 workspace root 内执行

阶段 1 完成后，ScribeFlow 将从“Codex 风格 skill/runtime 外壳”进入“具备最小执行能力的 Codex 风格 agent runtime”。
