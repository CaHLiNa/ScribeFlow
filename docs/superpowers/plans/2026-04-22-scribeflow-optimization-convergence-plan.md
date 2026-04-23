# ScribeFlow 优化收口与工程稳态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩张产品表面的前提下，把 ScribeFlow 从“方向正确但仍有混合权威”的状态，推进到可持续演进的 Rust-first 桌面研究工作台。

**Architecture:** 优化按 runtime authority、legacy off-ramp、quality gate 和 bounded context 拆分四条主线推进，而不是按页面零碎修补。Rust 继续接管 workspace / document workflow / references 等运行时权威；Vue/Pinia 退回到渲染、轻量 orchestration 和 optimistic UI；CI 与文档负责把这套权威边界固定下来。

**Tech Stack:** Tauri 2、Rust、Vue 3、Pinia、Vite、GitHub Actions、现有 `src-tauri/*` runtime、现有 `src/domains/*` / `src/services/*` / `src/stores/*`

---

## 计划定位

这份文档只定义下一阶段优化与收口路线，不包含当前立即执行的代码改动。

本计划明确服务于以下已观察到的现状：

- 产品方向已经比上游 `shoulders-main` 更聚焦，当前主问题不是“缺 feature”，而是“runtime authority 仍混合、legacy 路径仍偏多、质量门不足”。
- 仓库已明确要求 Rust-first，并要求 `stores` 保持薄、`services` 不承载长期策略权威。
- 当前工作区存在未完成的 `EmbedPDF` 相关改动：
  - `src/components/editor/PdfEmbedSurface.vue`
  - `src/services/pdf/embedPdfAdapter.js`
  - `src/components/editor/PdfEmbedDocumentSurface.vue`

本计划默认这些改动不属于本 phase 执行范围。后续执行时，必须避免把本计划和该未完成切片混在同一个 commit。

---

## 目标产出

本计划完成后，ScribeFlow 应达到以下结果：

- Workspace / preferences / lifecycle / document workflow 的桌面端运行时权威继续向 Rust 收口。
- `legacy*`、browser preview fallback、旧 preview pane 兼容分支不再无限期存在，而是有明确删除顺序和退出条件。
- 仓库从“能 release”提升到“每次变更先过质量门再 release”。
- `latex` 与 `references` 两块大模块完成按职责拆分，后续功能开发不再依赖超大文件持续膨胀。
- 产品、架构、phase 文档能准确描述当前 authority 分布，而不是落后于真实实现。

---

## 非目标

- 不新增聊天壳子、通用 PKM、云同步、多人协作等新产品表面。
- 不因为“优化”而整体重做桌面 UI 风格。
- 不在同一阶段里同时重写 editor、references、latex 和 preview 全部实现。
- 不追求“一次性清完所有技术债”；本计划只解决当前最影响后续演进效率的几类债务。

---

## 执行原则

1. 按 authority 边界推进，不按页面推进。
2. 每个 task 必须独立可验证，并在完成后真实减少一层旧权威。
3. 只要 Rust 已覆盖对应规则，就要在同 phase 或紧随其后的 task 中删除旧前端权威。
4. 不把 pending 的 `EmbedPDF` 改动、体验 polish、视觉调整混入本计划的 runtime 收口任务。
5. 每个 task 必须带测试、构建或 smoke 验证，不允许“代码改完但没法证明”。

---

## 总体阶段拆分

### Phase A: Runtime Authority Convergence

目标：继续把 workspace / lifecycle / document workflow 从“前端 orchestrated runtime”收成“Rust authority + thin frontend consumer”。

### Phase B: Legacy Off-Ramp

目标：清理为迁移阶段保留的 legacy state、legacy preview、browser fallback 和桥接重复逻辑。

### Phase C: Quality Gate

目标：建立稳定的本地与 CI 质量门，让 release 不再承担首次完整验证的职责。

### Phase D: Module Decomposition

目标：把 `latex` 与 `references` 相关超大模块拆成职责清晰的 bounded context，降低后续 feature phase 的修改成本和回归风险。

### Phase E: Documentation Lock-In

目标：同步产品、架构、domains 和 operations 文档，防止 authority 漂移后文档失真。

---

## 文件规划

### 优先修改文件

- `src/stores/workspace.js`
- `src/stores/documentWorkflow.js`
- `src/services/workspacePreferences.js`
- `src/services/workspaceRecents.js`
- `src/services/documentWorkflow/*`
- `src-tauri/src/lib.rs`
- `src-tauri/src/workspace_preferences.rs`
- `src-tauri/src/workspace_lifecycle.rs`
- `src-tauri/src/document_workflow.rs`
- `src-tauri/src/document_workflow_controller.rs`
- `src-tauri/src/document_workflow_session.rs`
- `src-tauri/src/document_workspace_preview_state.rs`
- `.github/workflows/*`
- `package.json`

### 计划新增文件

- `src-tauri/src/document_workflow_ui_state.rs`
- `src-tauri/src/document_workflow_preview_binding.rs`
- `src-tauri/src/latex_compile.rs`
- `src-tauri/src/latex_diagnostics.rs`
- `src-tauri/src/references_snapshot.rs`
- `src-tauri/src/references_merge.rs`
- `.github/workflows/ci.yml`
- `docs/DOMAINS.md`
- `docs/2026-04-22-runtime-authority-audit.md`

### 预期只读参考文件

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/OPERATIONS.md`
- `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

---

## Task 1: 收口 Workspace Runtime Authority

**目标：** 让 workspace open/close/bootstrap、preferences、lifecycle 的语义由 Rust 统一归一化，前端 store 不再同时承担持久化语义和 UI 协调。

**Files:**

- Modify: `src/stores/workspace.js`
- Modify: `src/services/workspacePreferences.js`
- Modify: `src/services/workspaceRecents.js`
- Modify: `src/app/workspace/useWorkspaceLifecycle.js`
- Modify: `src-tauri/src/workspace_preferences.rs`
- Modify: `src-tauri/src/workspace_lifecycle.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/workspace_preferences.rs`
- Test: `src-tauri/src/workspace_lifecycle.rs`

**边界：**

- Rust 接管：
  - workspace preference schema
  - lifecycle normalize
  - workspace bootstrap snapshot 结构
  - legacy migration decision
- 前端保留：
  - settings surface 的交互状态
  - DOM side effect
  - optimistic 更新与失败回滚

- [x] **Step 1: 冻结现有 authority contract**

输出一份简短审计记录到 `docs/2026-04-22-runtime-authority-audit.md`，列明以下内容：

```md
## Workspace Authority
- Rust owns: persisted preferences, lifecycle state, normalized defaults
- Frontend owns: DOM apply, transient settings panel state
- To delete: browser preview write path, duplicate local normalize helpers
```

Run: `rg -n "loadWorkspacePreferences|saveWorkspacePreferences|loadWorkspaceLifecycleState|saveWorkspaceLifecycleState" src`

Expected: 能完整列出当前 workspace 读写链路。

- [x] **Step 2: 为 workspace bootstrap 定义 Rust 返回结构**

在 `src-tauri/src/workspace_lifecycle.rs` 增加统一返回结构，至少包含：

```rust
pub struct WorkspaceBootstrapState {
    pub recent_workspaces: Vec<RecentWorkspace>,
    pub last_workspace: String,
    pub setup_complete: bool,
    pub reopen_last_workspace_on_launch: bool,
    pub reopen_last_session_on_launch: bool,
}
```

要求：

- 不再让前端自行推导默认值。
- 归一化尾部 `/`、空字符串、重复 recent workspace。

- [x] **Step 3: 收口前端 service 为 bridge-only**

把以下文件收敛为“调用 Rust + 执行最少本地 fallback”的 bridge：

- `src/services/workspacePreferences.js`
- `src/services/workspaceRecents.js`

要求：

- 删除或降权本地 normalize 函数。
- browser preview 只保留 read-only fallback，不再承载桌面端真实 authority。

验收检查：

Run: `rg -n "normalizeWorkspaceLifecycleState|normalizeWorkbenchSurfaceLocally|normalizeWorkbenchSidebarPanelLocally|normalizeWorkbenchInspectorPanelLocally" src/services`

Expected: 只保留 browser preview 所必需的 fallback；桌面端路径不再依赖这些本地 normalize。

- [x] **Step 4: 瘦身 workspace store**

调整 `src/stores/workspace.js`，让它只做：

- 调用 Rust bridge
- 保存乐观 patch
- 处理 UI surface 状态

禁止继续在 store 中新增：

- 持久化 schema 规则
- recents normalize 规则
- lifecycle 默认值规则

建议目标结构：

```js
async hydrateWorkspaceRuntime() {}
async persistWorkspacePreferencesPatch(patch) {}
async persistWorkspaceLifecyclePatch(patch) {}
```

- [x] **Step 5: 跑验证并提交**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml workspace_preferences workspace_lifecycle
npm run lint
npm run build
```

Expected:

- `cargo check` 通过
- 相关 Rust 单测通过
- 前端 lint / build 通过

Commit:

```bash
git add docs/2026-04-22-runtime-authority-audit.md src/stores/workspace.js src/services/workspacePreferences.js src/services/workspaceRecents.js src/app/workspace/useWorkspaceLifecycle.js src-tauri/src/workspace_preferences.rs src-tauri/src/workspace_lifecycle.rs src-tauri/src/lib.rs
git commit -m "refactor: converge workspace runtime authority"
```

**完成标准：**

- Workspace preferences / lifecycle 的桌面权威明确落在 Rust。
- 前端不再持有同级 normalize 逻辑。
- browser preview fallback 不再伪装成桌面产品的真实实现。

---

## Task 2: 收口 Document Workflow Runtime Authority

**目标：** 把 document workflow 的 preview binding、UI resolve、session reconcile 和 action availability 收口成 Rust authority，`documentWorkflow` store 退化为 cache + dispatch coordinator。

**Files:**

- Modify: `src/stores/documentWorkflow.js`
- Modify: `src/domains/document/documentWorkflowRuntime.js`
- Modify: `src/domains/document/documentWorkflowBuildRuntime.js`
- Modify: `src/domains/document/documentWorkflowBuildOperationRuntime.js`
- Modify: `src/services/documentWorkflow/sessionStateBridge.js`
- Modify: `src/services/documentWorkflow/workflowUiStateBridge.js`
- Modify: `src/services/documentWorkflow/workspacePreviewStateBridge.js`
- Create: `src-tauri/src/document_workflow_ui_state.rs`
- Create: `src-tauri/src/document_workflow_preview_binding.rs`
- Modify: `src-tauri/src/document_workflow.rs`
- Modify: `src-tauri/src/document_workflow_controller.rs`
- Modify: `src-tauri/src/document_workflow_session.rs`
- Modify: `src-tauri/src/document_workspace_preview_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/document_workflow.rs`
- Test: `src-tauri/src/document_workflow_session.rs`
- Test: `src-tauri/src/document_workflow_action.rs`

**边界：**

- Rust 接管：
  - preview binding normalize
  - detached state / reopen state
  - workflow ui state resolve
  - preview target resolution
- 前端保留：
  - 点击和快捷键触发
  - UI 过渡态
  - 预览 surface 渲染

- [x] **Step 1: 固定 document workflow 的 authority matrix**

在计划执行前，先把当前状态拆成四类：

```md
- Session persistence
- Preview binding
- UI state resolve
- Build / reveal action availability
```

Run: `rg -n "resolvedWorkflowUiStates|previewBindings|workspacePreviewRequests|workspacePreviewVisibility" src/stores/documentWorkflow.js src/domains/document src/services/documentWorkflow src-tauri/src`

Expected: 能完整定位四类状态当前各自的真实来源。

- [x] **Step 2: 新增 Rust 子模块承接 UI state 与 preview binding**

新增：

- `src-tauri/src/document_workflow_ui_state.rs`
- `src-tauri/src/document_workflow_preview_binding.rs`

要求：

- 把当前散落在 `document_workflow.rs`、`document_workflow_controller.rs`、`document_workspace_preview_state.rs` 的 normalize 规则按职责归位。
- `lib.rs` 只负责注册 command，不继续膨胀新逻辑。

建议模块边界：

```rust
pub fn resolve_document_workflow_ui_state(...) -> Value
pub fn normalize_preview_binding_set(...) -> Vec<PreviewBinding>
pub fn reconcile_preview_session(...) -> Value
```

- [x] **Step 3: 瘦身前端 documentWorkflow store**

当前结果：

- 已把 UI state resolve 从 `document_workflow_action.rs` 拆到 `document_workflow_ui_state.rs`
- 已把 preview binding schema / normalize 从 session 模块拆到 `document_workflow_preview_binding.rs`
- 已让 close-preview plan 的 detach / unbind effect 优先由 Rust controller 输出驱动
- 已把 persistent/session cache 逻辑拆到 `src/domains/document/documentWorkflowSessionRuntime.js`
- 已把 resolved preview / UI state cache 逻辑拆到 `src/domains/document/documentWorkflowResolvedStateRuntime.js`
- `src/stores/documentWorkflow.js` 已从 899 行降到 329 行，退回为 cache + dispatch coordinator

重写 `src/stores/documentWorkflow.js` 的职责边界：

- 保留 cache
- 保留事件分发
- 删除本地 authority 推导

禁止继续在 store 中长期保留：

- `previewBindings` 的最终 normalize 规则
- `workspacePreviewVisibility` 的产品语义
- workflow action availability 推导

Run: `wc -l src/stores/documentWorkflow.js`

Expected: 体量明显下降，至少不再继续膨胀。

- [x] **Step 4: 为核心路径补 Rust 侧回归测试**

必须覆盖：

- markdown source -> html preview resolve
- latex source -> pdf preview resolve
- detached preview reopen
- preview close effect
- legacy pane 结果禁用后的行为

测试用例结构示例：

```rust
#[test]
fn resolves_markdown_preview_without_legacy_pane_result() {}

#[test]
fn preserves_detached_preview_binding_until_user_rebinds() {}
```

- [x] **Step 5: 跑验证并提交**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml document_workflow document_workflow_session document_workflow_action
npm run lint
npm run build
```

Commit:

```bash
git add src/stores/documentWorkflow.js src/domains/document/documentWorkflowRuntime.js src/domains/document/documentWorkflowBuildRuntime.js src/domains/document/documentWorkflowBuildOperationRuntime.js src/services/documentWorkflow/sessionStateBridge.js src/services/documentWorkflow/workflowUiStateBridge.js src/services/documentWorkflow/workspacePreviewStateBridge.js src-tauri/src/document_workflow_ui_state.rs src-tauri/src/document_workflow_preview_binding.rs src-tauri/src/document_workflow.rs src-tauri/src/document_workflow_controller.rs src-tauri/src/document_workflow_session.rs src-tauri/src/document_workspace_preview_state.rs src-tauri/src/lib.rs
git commit -m "refactor: move document workflow authority to rust"
```

**完成标准：**

- `documentWorkflow` store 不再是 runtime authority。
- preview/session/ui state 的真实产品语义收敛到 Rust。
- 后续新增 workflow feature 时，不需要再往 store 里叠状态机。

---

## Task 3: 建立 Legacy Off-Ramp 与 Bridge 清理顺序

**目标：** 让 legacy state、legacy preview、localStorage migration 与 browser preview fallback 变成“有明确删除顺序的临时层”，而不是长期兼容泥潭。

**Files:**

- Modify: `src-tauri/src/document_workflow.rs`
- Modify: `src-tauri/src/document_workflow_controller.rs`
- Modify: `src-tauri/src/document_workspace_preview_state.rs`
- Modify: `src-tauri/src/editor_session_runtime.rs`
- Modify: `src-tauri/src/workspace_preferences.rs`
- Modify: `src-tauri/src/workspace_lifecycle.rs`
- Modify: `src/services/workspacePreferences.js`
- Modify: `src/services/workspaceRecents.js`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Test: `src-tauri/src/editor_session_runtime.rs`

- [ ] **Step 1: 建一份 legacy inventory**

Run:

```bash
rg -n "legacy_|legacy|preserveOpenLegacy|allow_legacy|hasDesktopInvoke" src src-tauri docs
```

把结果归类成：

- migration-only
- fallback-only
- temporary compat
- stale and removable

输出更新到：

- `docs/2026-04-22-runtime-authority-audit.md`

- [ ] **Step 2: 为每类 legacy path 增加退出条件**

在文档中明确：

```md
| Legacy Path | Current Purpose | Delete When | Owner |
| --- | --- | --- | --- |
| browser preview lifecycle fallback | non-desktop demo | desktop-only path stable and smoke-tested | workspace runtime |
| allow_legacy_pane_result | preview migration compat | preview binding rust authority complete | document workflow |
```

- [ ] **Step 3: 删除已无必要的双权威逻辑**

优先删：

- 已由 Rust normalize 覆盖的前端同类规则
- 仅为老 preview pane 保留、但当前主路径不再依赖的兼容逻辑

要求：

- 删除前先有测试
- 删除后更新文档

- [ ] **Step 4: 验证历史迁移不回归**

至少覆盖：

- 有旧 localStorage 快照时首次启动仍可迁移
- 没有旧快照时不会写入旧字段
- 旧 preview tab 不会在新 runtime 下制造脏状态

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml editor_session_runtime workspace_preferences workspace_lifecycle
npm run build
```

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/document_workflow.rs src-tauri/src/document_workflow_controller.rs src-tauri/src/document_workspace_preview_state.rs src-tauri/src/editor_session_runtime.rs src-tauri/src/workspace_preferences.rs src-tauri/src/workspace_lifecycle.rs src/services/workspacePreferences.js src/services/workspaceRecents.js docs/ARCHITECTURE.md docs/DOCUMENT_WORKFLOW.md docs/2026-04-22-runtime-authority-audit.md
git commit -m "refactor: remove obsolete legacy runtime paths"
```

**完成标准：**

- 所有 legacy 路径都有 owner 和删除条件。
- 已覆盖的新 Rust authority 不再同时保留旧前端 authority。
- 架构文档能准确反映“哪些 legacy 还存在、为什么存在、何时删除”。

---

## Task 4: 建立本地与 CI 质量门

**目标：** 把仓库从“只有 release pipeline”提升到“每个变更先过 check pipeline，再进入 release”。

**Files:**

- Modify: `package.json`
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/release-on-version-bump.yml`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: 统一本地检查命令**

在 `package.json` 新增：

```json
{
  "scripts": {
    "check": "npm run lint && npm run build",
    "check:rust": "cargo check --manifest-path src-tauri/Cargo.toml",
    "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml"
  }
}
```

要求：

- 不新增空壳命令。
- 命令必须能直接被 CI 复用。

- [ ] **Step 2: 新建 CI workflow**

新增 `.github/workflows/ci.yml`，至少包含：

- Node install
- `npm ci`
- `npm run lint`
- `npm run build`
- Rust toolchain
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`

建议 workflow 结构：

```yaml
name: ScribeFlow CI
on:
  pull_request:
  push:
    branches: [main]
```

- [ ] **Step 3: 让 release 依赖 CI 通过**

要求：

- release 仍负责打包
- 但 release 之前必须能依赖 CI 或重复关键检查
- 避免“release 是第一次发现 build 挂了”

- [ ] **Step 4: 在 operations 文档写清开发者入口**

更新 `docs/OPERATIONS.md`，增加：

- 本地提交前执行哪些命令
- CI 覆盖哪些检查
- release workflow 与 CI 的关系

- [ ] **Step 5: 验证并提交**

Run:

```bash
npm run check
npm run check:rust
npm run test:rust
```

Commit:

```bash
git add package.json .github/workflows/ci.yml .github/workflows/release.yml .github/workflows/release-on-version-bump.yml docs/OPERATIONS.md docs/ARCHITECTURE.md
git commit -m "ci: add baseline quality gates"
```

**完成标准：**

- 本地与 CI 共用一套检查入口。
- Release 不再是首次完整验证。
- 新增 phase 可以直接复用这套验证基线。

---

## Task 5: 拆分 LaTeX 与 References 大模块

**目标：** 把当前最重的 Rust 模块按职责拆开，防止后续优化继续在超大文件上叠逻辑。

**Files:**

- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/latex.rs`
- Create: `src-tauri/src/latex_compile.rs`
- Create: `src-tauri/src/latex_diagnostics.rs`
- Modify: `src-tauri/src/references_runtime.rs`
- Modify: `src-tauri/src/references_backend.rs`
- Create: `src-tauri/src/references_snapshot.rs`
- Create: `src-tauri/src/references_merge.rs`
- Modify: `docs/DOMAINS.md`
- Test: `src-tauri/src/latex_project_graph.rs`
- Test: `src-tauri/src/references_runtime.rs`
- Test: `src-tauri/src/references_backend.rs`

**拆分原则：**

- 先提纯职责，再移动代码。
- 不做一次性大爆炸式 rename。
- 每次拆分必须保持 public command 名称稳定，避免前端同步大面积重写。

- [ ] **Step 1: 拆 LaTeX runtime**

将 `src-tauri/src/latex.rs` 至少分成：

- `latex_compile.rs`
- `latex_diagnostics.rs`
- `latex.rs` 仅保留 command 注册和高层 orchestration

建议职责：

```rust
// latex_compile.rs
pub async fn run_latex_compile(...) -> Result<..., String>

// latex_diagnostics.rs
pub fn parse_latex_log(...) -> Vec<Diagnostic>
```

- [ ] **Step 2: 拆 References runtime**

将 `references_runtime.rs` / `references_backend.rs` 至少分成：

- `references_snapshot.rs`
- `references_merge.rs`
- 原文件只保留 command facade 和边界协调

建议职责：

```rust
pub fn normalize_reference_snapshot(...) -> Value
pub fn merge_reference_entries(...) -> Vec<Value>
```

- [ ] **Step 3: 先迁测试，再迁实现**

要求：

- 新提取模块必须先把现有行为测试补上
- 再移动实现
- 避免“拆完才能补测”的被动局面

- [ ] **Step 4: 验证模块边界**

Run:

```bash
wc -l src-tauri/src/latex.rs src-tauri/src/references_runtime.rs src-tauri/src/references_backend.rs
cargo test --manifest-path src-tauri/Cargo.toml latex_project_graph references_runtime references_backend
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected:

- 被拆的 facade 文件明显缩短
- 测试通过

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/lib.rs src-tauri/src/latex.rs src-tauri/src/latex_compile.rs src-tauri/src/latex_diagnostics.rs src-tauri/src/references_runtime.rs src-tauri/src/references_backend.rs src-tauri/src/references_snapshot.rs src-tauri/src/references_merge.rs docs/DOMAINS.md
git commit -m "refactor: split latex and references runtimes"
```

**完成标准：**

- `latex` 与 `references` 的主入口文件不再承载过多具体实现。
- 新功能能按 bounded context 增加，而不是继续堆到 800-1700 行文件。

---

## Task 6: 文档锁定与最终验收包

**目标：** 在执行完前 5 个 task 后，把产品/架构/操作文档同步到真实状态，形成下一轮 feature phase 的稳定起点。

**Files:**

- Modify: `docs/PRODUCT.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOMAINS.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

- [ ] **Step 1: 更新 authority 分布**

文档必须明确写出：

- 哪些权威已经在 Rust
- 哪些仍在前端但属于纯 UI glue
- 哪些 fallback 尚未删除，以及为什么

- [ ] **Step 2: 更新开发与验证入口**

把以下内容写入 `docs/OPERATIONS.md`：

- 本地开发默认检查命令
- CI 覆盖内容
- release 与 CI 的先后关系

- [ ] **Step 3: 更新 document workflow 与 domains 文档**

要求：

- 反映新的 preview binding / session / ui resolve authority
- 反映 `latex` 与 `references` 的新模块边界

- [ ] **Step 4: 跑最终验收**

Run:

```bash
npm run check
npm run check:rust
npm run test:rust
```

如环境允许，再补一次桌面 smoke 验证：

1. 打开 workspace
2. 恢复上次 session
3. 打开 Markdown 文档并触发 preview
4. 打开 LaTeX 文档并触发编译/预览
5. 打开 references library

- [ ] **Step 5: 提交**

```bash
git add docs/PRODUCT.md docs/ARCHITECTURE.md docs/DOMAINS.md docs/DOCUMENT_WORKFLOW.md docs/OPERATIONS.md docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md
git commit -m "docs: sync runtime architecture and verification flow"
```

**完成标准：**

- 文档描述与真实 authority 分布一致。
- 后续做新功能时，不需要再先重新解释系统边界。

---

## 执行顺序与依赖

必须按以下顺序执行：

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

依赖说明：

- Task 3 依赖 Task 1 与 Task 2，因为只有在新 authority 稳定后才能安全删 legacy path。
- Task 4 可以在 Task 1 完成后开始，但建议放在 Task 3 前后单独落一个 clean commit。
- Task 5 不应早于 Task 2，否则会把 authority 收口和大模块拆分混成一个难 review 的切片。
- Task 6 必须最后做。

---

## 风险与防护

### 风险 1: 把 runtime 收口和 UI 变动混在一起

防护：

- 本计划默认不做大范围 UI 调整。
- 任何组件改动必须服务于 authority 收口，而不是顺手重做体验。

### 风险 2: 把 `EmbedPDF` 未完成改动混入本 phase

防护：

- 执行时使用路径级 `git add`。
- 不修改当前 pending 的 `PdfEmbed*` 文件，除非后续单独立项。

### 风险 3: 先拆大文件，再补测试

防护：

- Task 5 明确要求先补测试再搬实现。

### 风险 4: browser preview fallback 长期滞留

防护：

- Task 3 要求每条 fallback 都有 delete condition。

---

## 验收总标准

当以下条件全部满足时，本计划视为完成：

- Workspace / lifecycle / document workflow 的桌面 authority 已继续收口到 Rust。
- 已覆盖的新 authority 不再和旧前端规则并存。
- 仓库具备本地与 CI 的稳定质量门。
- `latex` / `references` 的大模块完成第一轮职责拆分。
- 架构文档与真实实现同步。

---

## 执行建议

推荐把本计划作为一个单独 milestone 执行，不与新 feature phase 并行。

推荐切片粒度：

- 每个 task 单独一个 branch 或至少单独一个 commit。
- 每个 task 完成后立即跑验证。
- Task 2 与 Task 5 必须留出 review 缓冲，不要在同一天合并。

---

## 自检

### 1. Spec coverage

本计划覆盖了当前最关键的五类优化点：

- runtime authority convergence
- legacy off-ramp
- quality gate
- module decomposition
- documentation lock-in

未纳入本计划的内容：

- `EmbedPDF` 当前切片收尾
- 新的阅读器能力
- 新的引用插入 UX
- 更大范围的桌面视觉优化

这些内容应在本计划完成后另起 phase。

### 2. Placeholder scan

本计划未使用 `TODO`、`TBD`、`implement later`、`write tests for above` 等空占位语句；每个 task 都给出文件、命令、边界、完成标准与提交建议。

### 3. Type / naming consistency

本计划统一使用以下术语：

- runtime authority
- legacy off-ramp
- preview binding
- workflow ui state
- browser preview fallback

未混用同义但不同名的阶段目标。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-scribeflow-optimization-convergence-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 我按 task 分发独立执行单元，逐 task review 和验证。

**2. Inline Execution** - 我在当前会话里按顺序直接执行这些 task，并在关键节点停下来给你确认。
