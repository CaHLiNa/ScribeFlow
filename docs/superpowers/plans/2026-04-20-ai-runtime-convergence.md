# AI Runtime Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ScribeFlow 的 AI 架构收敛到 `codex-acp bridge` 主路径，删除旧 provider / HTTP proxy 残留，并把桌面 UI 与文档统一到同一套心智模型。

**Architecture:** Rust 继续持有 ACP session、prompt dispatch、artifact/verification 与 session 持久化；前端只保留 session UI、prompt 输入、运行态展示与产品特有的 artifact 操作。配置层保留 `codexCli` 作为 launcher defaults，但 runtime 语义统一表达为 `codex-acp`。

**Tech Stack:** Tauri 2、Rust、Vue 3、Pinia、`@zed-industries/codex-acp`

---

### Task 1: 收敛 Rust AI runtime 边界

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/ai_config.rs`
- Modify: `src-tauri/src/ai_agent_prepare.rs`
- Delete or stop wiring: `src-tauri/src/network.rs`

- [ ] **Step 1: 删除未被前端使用的 AI proxy / stream 命令暴露**

目标：`invoke_handler` 不再暴露 `proxy_api_call`、`proxy_api_call_full`、`proxy_ai_responses`、`start_ai_responses_stream`、`abort_ai_responses_stream`。

- [ ] **Step 2: 把公开配置与运行态命名统一到 ACP bridge**

目标：`ai_config` 的 `runtimeBackend`、`ai_agent_prepare` 的 `providerState` 与 store 可见字段不再混用 `codex-cli` / `codex-acp` 两套含义；`codexCli` 仅表示 launcher defaults。

- [ ] **Step 3: 把 prepare 层收缩成 thin prepare**

目标：删掉或降权误导性的 legacy/provider 字段，明确这里只负责把当前 session、workspace 和 launcher config 交给 ACP 主路径，不再伪装成重 research planner。

### Task 2: 收敛前端 AI store 与面板

**Files:**
- Modify: `src/stores/ai.js`
- Modify: `src/components/panel/AiAgentPanel.vue`
- Modify: `src/components/panel/AiConversationMessage.vue`

- [ ] **Step 1: 清理 store 中无效 provider/model 壳层**

目标：删除 `hasKey`、`requiresApiKey`、`baseUrl`、`unifiedModelPool*`、`setCurrentProvider()`、`refreshUnifiedModelPool()` 这类旧 provider 模型残留，保留真正被 ACP 路径使用的 runtime 状态。

- [ ] **Step 2: 简化面板中的模型与运行时表达**

目标：AI 面板不再显示“伪 model pool 选择器”，改为 ACP runtime 状态展示；用户只保留 `model` 覆盖和 `commandPath` 配置。

- [ ] **Step 3: 去掉无效 tool capability gating**

目标：`enabledToolIds` 现在恒为空，artifact apply 不应被一层失效的 tool catalog 卡死；保留本地 artifact 能力和真实 verification。

### Task 3: 更新文档与依赖叙事

**Files:**
- Modify: `docs/CODEX_CLI_RUNTIME_REFACTOR.md`
- Modify: `docs/AI_CODEX_DESKTOP_REPLICATION.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `package.json`

- [ ] **Step 1: 更新 AI 架构文档**

目标：文档明确写成“`codex` launcher defaults + `codex-acp bridge` transport + ScribeFlow product-specific artifact/verification layer”。

- [ ] **Step 2: 清理明显无用的前端 AI 依赖**

目标：移除未再使用的 legacy SDK 依赖，避免仓库继续传达“应用自带独立 AI 接入层”的错误信号。

- [ ] **Step 3: 记录验证与 postflight 预期**

目标：在操作文档里保留 `lint`、`build`、`cargo check` 基线，并强调 ACP 收敛后的验证口径。

### Task 4: 验证与提交

**Files:**
- Verify only

- [ ] **Step 1: 运行前端验证**

Run: `npm run lint`
Expected: exit 0

- [ ] **Step 2: 运行前端构建**

Run: `npm run build`
Expected: exit 0

- [ ] **Step 3: 运行 Rust 验证**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: exit 0

- [ ] **Step 4: 提交并推送**

Run:

```bash
git add docs/CODEX_CLI_RUNTIME_REFACTOR.md docs/AI_CODEX_DESKTOP_REPLICATION.md docs/OPERATIONS.md docs/superpowers/plans/2026-04-20-ai-runtime-convergence.md package.json package-lock.json src/components/panel/AiAgentPanel.vue src/components/panel/AiConversationMessage.vue src/stores/ai.js src-tauri/src/ai_agent_prepare.rs src-tauri/src/ai_config.rs src-tauri/src/lib.rs src-tauri/src/network.rs
git commit -m "refactor: converge ai runtime on codex acp"
git push
```

Expected: commit 与 push 成功
