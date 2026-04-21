# ScribeFlow Rust Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把 ScribeFlow 现有核心功能的运行时权威稳定下沉到 Rust，再在单一权威之上做后续体验优化与产品打磨。

**Architecture:** 迁移按运行时边界推进，而不是按页面推进。Rust 成为 workspace/preferences、document workflow、references/citation、editor session 的唯一权威；Vue/Pinia 只保留渲染、轻量交互状态和调用 Rust command 的桥接职责。

**Tech Stack:** Tauri 2、Rust、Vue 3、Pinia、现有 `src-tauri/*` runtime、现有 `src/domains/*` 与 `src/services/*` 桥接层

---

## 当前进度

截至 2026-04-21，Task 1 与 Task 2 已完成并达到当前 phase 验收：

- 已新增 Rust `WorkspacePreferences` / `WorkbenchState` schema
- 已新增 `workspace_preferences_load` / `workspace_preferences_save` / `workbench_state_normalize`
- 已把前端 `workspacePreferences.js` 收口为 Rust bridge + DOM side effect helper
- 已把 `workspace.js` 的主要 preferences 更新路径改为消费 Rust-normalized 结果
- 已完成 legacy `localStorage` 迁移入口与清理
- 已把 browser preview 的 workbench normalize 收口到统一 bridge
- 已把 `src/shared/workbench*` 与 `src/shared/workspaceThemeOptions.js` 降为纯 metadata，不再承载 normalize 规则
- 已新增 Rust `document_workflow_ui_resolve`，并把 document workflow 的 workflow ui state / action availability 收口到 backend cache
- 已把 `documentWorkflow` build/runtime 改成消费 Rust preview state + Rust ui state

当前剩余不阻塞 Task 1 完成、但值得在后续 phase 持续关注的点：

- Computer Use 当前无法附着到 `tauri dev` 窗口，缺少一次真实桌面点击验证
- browser preview 为非桌面环境，仍保留只读 fallback normalize；它不再是桌面产品权威

---

## 背景与原则

这不是“把所有 JS 都搬到 Rust”。本计划只迁移以下几类内容：

- 持久化默认值、迁移规则、合法值归一化
- 编译 / 预览 / 文档工作流状态机
- references / citation / bibliography 的运行时规则
- editor 相邻但不属于纯 UI 的 session / preview / restore 规则

明确不迁移：

- 组件树、样式、交互动画、UI 布局
- 纯视图层派生状态
- 仅供单个组件内部使用的临时 UI state

迁移护栏：

- 不制造长期双权威；Rust 一旦接管，前端同类规则必须同时降权或删除
- 不按页面“表面改造”；只按 runtime 边界切
- 每个 phase 都必须可独立验证，并能真实删除一层旧前端权威
- 未迁完之前，不做体验 polish；只做为迁移服务的必要桥接

---

## 当前权威分布

### 1. Workspace / Preferences

当前前端仍然持有大量权威：

- `src/stores/workspace.js`
- `src/services/workspacePreferences.js`
- `src/shared/workbenchSidebarPanels.js`
- `src/shared/workbenchInspectorPanels.js`
- `src/shared/workspaceThemeOptions.js`
- `src/components/settings/*`

问题：

- 默认值、localStorage 读写、合法值修正、迁移兼容仍在前端
- shell surface / sidebar / zoom / theme 的归一化规则不在 Rust
- settings UI 和 settings semantics 仍然耦合

### 2. Document Workflow / Preview / Compile

当前是“前端 orchestration + Rust partial runtime”混合结构：

- 前端：
  - `src/stores/documentWorkflow.js`
  - `src/domains/document/documentWorkflowRuntime.js`
  - `src/domains/document/documentWorkflowBuildRuntime.js`
  - `src/domains/document/documentWorkflowBuildOperationRuntime.js`
  - `src/domains/document/documentWorkflowActionRuntime.js`
  - `src/domains/document/documentWorkspacePreviewRuntime.js`
  - `src/services/documentWorkflow/*`
- Rust：
  - `src-tauri/src/document_workflow.rs`
  - `src-tauri/src/document_workflow_controller.rs`
  - `src-tauri/src/document_workspace_preview.rs`
  - `src-tauri/src/document_workspace_preview_state.rs`

问题：

- preview route、artifact ready、visibility、action availability 仍大量在前端推导
- Rust `document_workflow_reconcile` 已存在，但尚不是完整唯一权威

### 3. References / Citation / Bibliography

当前 references 能力分布最散：

- 前端：
  - `src/stores/references.js`
  - `src/services/references/bibtexImport.js`
  - `src/services/references/bibtexExport.js`
  - `src/services/references/citationFormatter.js`
  - `src/services/references/referenceLibraryIO.js`
  - `src/services/references/zoteroSync.js`
  - `src/services/references/pdfMetadata.js`
- Rust：
  - `src-tauri/src/references_backend.rs`
  - `src-tauri/src/references_runtime.rs`
  - `src-tauri/src/references_citation.rs`
  - `src-tauri/src/references_import.rs`
  - `src-tauri/src/references_pdf.rs`
  - `src-tauri/src/references_zotero.rs`
  - `src-tauri/src/references_zotero_account.rs`

问题：

- library snapshot 的归一化、筛选、排序、去重、merge 逻辑大量留在前端
- Rust 与前端共享 responsibilities，后续优化时非常容易重复修 bug

### 4. Editor-Adjacent Runtime

当前仍有一部分“不是纯 UI，但也没下沉”的规则：

- `src/stores/editor.js`
- `src/services/editorPersistence.js`
- `src/domains/document/documentWorkspacePreviewRuntime.js`
- `src/components/editor/*`

问题：

- 标签恢复、preview route 恢复、虚拟 tab 清理、preview path 恢复规则仍偏前端
- editor session 的长期状态还没形成清晰 Rust authority

---

## 迁移顺序

严格按以下顺序执行，不要并行重写：

1. Workspace / Preferences
2. Document Workflow / Preview / Compile
3. References / Citation / Bibliography
4. Editor-Adjacent Runtime
5. 迁移完成后的体验优化 phase

原因：

- Phase 1 风险最低，能先建立“Rust 持有配置权威”的基础设施
- Phase 2 最影响产品稳定性
- Phase 3 最影响产品差异化
- Phase 4 最容易与 UI 纠缠，必须放在前 3 个 phase 之后

---

## Task 1: Workspace + Preferences Runtime Migration

**目标：** 把 workspace shell 与 settings/preferences 的默认值、持久化、迁移与合法值修正从前端下沉到 Rust。

**Files:**

- Create: `src-tauri/src/workspace_preferences.rs`
- Create: `src-tauri/src/workbench_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/workspace.js`
- Modify: `src/services/workspacePreferences.js`
- Modify: `src/shared/workbenchSidebarPanels.js`
- Modify: `src/shared/workbenchInspectorPanels.js`
- Modify: `src/shared/workspaceThemeOptions.js`
- Modify: `src/components/settings/Settings.vue`
- Modify: `src/components/settings/SettingsTheme.vue`
- Modify: `src/components/settings/SettingsEditor.vue`
- Modify: `src/components/settings/SettingsEnvironment.vue`

### 边界

Rust 接管：

- workspace preference schema
- 默认值
- enum 合法值修正
- 历史字段迁移
- shell surface / sidebar / inspector / zoom / theme 的 normalized state

前端保留：

- Settings UI
- 即时输入交互
- 轻量 optimistic UI

### 执行步骤

- [x] **Step 1: 定义 Rust preference schema**

输出：

- `WorkspacePreferences`
- `WorkbenchState`
- 对应的 normalize / migrate / serialize 逻辑

- [x] **Step 2: 在 Rust 提供 load/save/normalize command**

新增 command：

- `workspace_preferences_load`
- `workspace_preferences_save`
- `workbench_state_normalize`

- [x] **Step 3: 收口前端 `workspacePreferences.js`**

处理方式：

- 保留纯 UI helper
- 删除默认值与合法值判定权威
- 改为调用 Rust command

- [x] **Step 4: 收口 `workspace.js`**

要求：

- store 不再本地决定 settings 语义
- `openSettings` / `setPrimarySurface` / `setRightSidebarPanel` 等路径只消费 Rust-normalized 结果

- [x] **Step 5: 清理旧 localStorage 影子规则**

当前状态：

- 已移除前端对 `leftSidebarPanel` / `rightSidebarPanel` / `primarySurface` / `theme` / `zoom` 的主持久化与最终 normalize 权威
- browser preview 仅保留非桌面 fallback，避免非 Tauri 环境调用 Rust command 失败

删除目标：

- 前端对 `leftSidebarPanel` / `rightSidebarPanel` / `primarySurface` / `theme` / `zoom` 的独立权威判定

### 验收标准

- 前端不再自己定义 settings 默认值和合法值修正
- 切换 workspace 后仍能恢复 shell 状态
- settings 打开、关闭、切换 section 行为不回归

当前结果：

- 已满足“桌面端权威由 Rust 持有”的验收目标
- settings / theme / sidebar / zoom 的持久化与 normalize 已不再由前端主导
- `~/.scribeflow/workspace-preferences.json` 已稳定生成并承载当前权威状态

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml workspace_preferences`
- `npm run build`
- `npm run lint`
- 手动验证：
  - 打开工作区
  - 切换左右侧边栏
  - 切换 settings section
  - 关闭并重开应用后确认状态恢复

当前验证记录：

- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml workspace_preferences`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 已执行 `npm run tauri -- dev`，确认应用能在当前改动下启动
- 已检查 `~/.scribeflow/workspace-preferences.json`，确认 Rust 持久化文件存在且字段完整
- 尚未完成真实桌面窗口点击验证；阻塞原因是当前 Computer Use 无法识别 `tauri dev` 窗口实例

---

## Task 2: Document Workflow / Preview / Compile Runtime Migration

**目标：** 让 document workflow 的 preview、compile、artifact state、action availability 由 Rust 统一判定。

当前进度：

- 已新增 Rust `document_workflow_ui_resolve`，把 workflow UI state / action availability 从前端规则下沉到 Rust
- 已把 `documentWorkflow` store 扩展为缓存型 backend consumer，增加 resolved workflow ui state cache
- 已把 `documentWorkflowBuildRuntime.js` 改成以 backend preview state + backend ui state 为主，不再本地生成最终 workflow ui state
- `documentWorkflowActionRuntime.js` 继续通过 Rust action plan 执行动作，前端只负责触发与响应
- 当前仍未做真实桌面点击回归；原因仍是 Computer Use 无法附着 `tauri dev` 窗口

**Files:**

- Modify: `src-tauri/src/document_workflow.rs`
- Modify: `src-tauri/src/document_workflow_controller.rs`
- Modify: `src-tauri/src/document_workspace_preview.rs`
- Modify: `src-tauri/src/document_workspace_preview_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/documentWorkflow.js`
- Modify: `src/domains/document/documentWorkflowRuntime.js`
- Modify: `src/domains/document/documentWorkflowBuildRuntime.js`
- Modify: `src/domains/document/documentWorkflowBuildOperationRuntime.js`
- Modify: `src/domains/document/documentWorkflowActionRuntime.js`
- Modify: `src/domains/document/documentWorkspacePreviewRuntime.js`
- Modify: `src/services/documentWorkflow/workspacePreviewBridge.js`
- Modify: `src/services/documentWorkflow/workspacePreviewStateBridge.js`
- Create: `src/services/documentWorkflow/workflowUiStateBridge.js`
- Modify: `src/services/documentWorkflow/actionRuntimeBridge.js`
- Modify: `src/services/documentWorkflow/controllerBridge.js`
- Modify: `src/services/documentWorkflow/adapters/markdown.js`
- Modify: `src/services/documentWorkflow/adapters/latex.js`

### 边界

Rust 接管：

- workflow reconcile
- preview mode 解析
- artifact readiness
- action availability
- compile/preview session state
- preview close/open effect

前端保留：

- Pane 渲染
- preview surface 组件
- 用户触发动作后的 UI 响应

### 执行步骤

- [x] **Step 1: 扩展 Rust workflow command set**

必须覆盖：

- active kind
- preview mode
- artifact ready
- action matrix
- workspace preview visibility
- source/preview route 关系

- [x] **Step 2: 前端 store 改成“接收型”而不是“推导型”**

要求：

- `documentWorkflow.js` 不再本地重建 workflow truth
- `documentWorkspacePreviewRuntime.js` 只保留 UI adapter，删除策略判断

- [x] **Step 3: 收口 bridge**

把以下桥接改成薄层：

- `workspacePreviewBridge.js`
- `workspacePreviewStateBridge.js`
- `actionRuntimeBridge.js`
- `controllerBridge.js`

- [x] **Step 4: 删除前端重复策略**

删除目标：

- preview kind 推导重复逻辑
- artifact ready 的本地重复判定
- action enable/disable 的本地最终权威

当前结果：

- preview state、workspace preview visibility、preview close/open effect 继续由 Rust command 决定
- workflow ui state 与 action availability 已由 Rust 统一输出，前端不再本地决定最终 `canRevealPreview` / `canOpenPdf` / `primaryAction`
- `documentWorkflow.js` 已收敛为 orchestration + cache 层，前端 build runtime 不再本地生成最终 workflow ui state

### 验收标准

- Markdown / LaTeX 的 preview 切换行为由 Rust 单点决定
- build / preview / open output / reveal source 不再依赖前端多处推导
- `documentWorkflow.js` 只剩 orchestration 与缓存，不再做规则中心

当前结果：

- 已满足“preview / artifact / action availability 由 Rust 单点决定”的 phase 目标
- 前端仍保留 markdown render 状态与 latex compile 原始状态采集，但这些只是 backend resolve 的输入，不再是最终行为权威

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml document_workflow`
- `npm run build`
- `npm run lint`
- 手动验证：
  - Markdown 打开/关闭 preview
  - LaTeX 编译后 PDF preview 打开
  - 关闭 preview 后状态恢复
  - 重新打开文档后 preview route 正确

当前验证记录：

- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml document_workflow`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 已执行 `npm run tauri -- dev`，确认桌面应用在当前改动下能启动
- 尚未完成真实桌面窗口点击回归；阻塞原因仍是当前 Computer Use 无法识别 `tauri dev` 窗口实例

---

## Task 3: References / Citation / Bibliography Runtime Migration

**目标：** 把 references library、citation render、duplicate/merge、BibTeX 输出的策略权威下沉到 Rust。

**Files:**

- Modify: `src-tauri/src/references_backend.rs`
- Modify: `src-tauri/src/references_runtime.rs`
- Modify: `src-tauri/src/references_citation.rs`
- Modify: `src-tauri/src/references_import.rs`
- Modify: `src-tauri/src/references_pdf.rs`
- Modify: `src-tauri/src/references_zotero.rs`
- Modify: `src-tauri/src/references_zotero_account.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/references.js`
- Modify: `src/services/references/referenceLibraryIO.js`
- Modify: `src/services/references/bibtexImport.js`
- Modify: `src/services/references/bibtexExport.js`
- Modify: `src/services/references/citationFormatter.js`
- Modify: `src/services/references/referenceImport.js`
- Modify: `src/services/references/pdfMetadata.js`
- Modify: `src/services/references/zoteroSync.js`
- Modify: `src/components/settings/SettingsZotero.vue`
- Modify: `src/components/references/ReferenceLibraryWorkbench.vue`

### 边界

Rust 接管：

- library snapshot normalize
- duplicate detect / merge rules
- citation render inputs/outputs
- BibTeX export / write
- PDF metadata import normalize
- Zotero sync 后入库规则

前端保留：

- library 筛选控件
- 列表渲染
- 导入/同步触发

### 执行步骤

- [ ] **Step 1: 扩展 Rust references schema 与 snapshot command**

要求：

- Rust 直接返回 normalized library snapshot
- 前端不再自己做 final normalize

- [ ] **Step 2: 把 duplicate / merge / import 规则下沉**

处理：

- `bibtexImport.js` 从规则实现变为 command wrapper
- `references.js` 删除本地 duplicate/merge 权威

- [ ] **Step 3: 把 citation / bibliography 输出完全交给 Rust**

要求：

- citation formatting 只通过 Rust
- bibliography write / export 不再有前端 shadow path

- [ ] **Step 4: 收口 Zotero sync 集成**

要求：

- sync 之后的 snapshot merge 由 Rust 负责
- Settings 页只负责账号、同步触发和展示反馈

### 验收标准

- 前端不再维护 references normalize/merge 规则
- 引用渲染、BibTeX 输出、duplicate merge 均由 Rust 单点决定
- Zotero sync 后库快照稳定，不再存在双权威 merge

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run build`
- 手动验证：
  - 导入 BibTeX
  - 从 PDF 导入 metadata
  - duplicate merge
  - citation render
  - bibliography 文件写出
  - Zotero 连接与同步

---

## Task 4: Editor-Adjacent Runtime Migration

**目标：** 把 editor 周边但不属于纯 UI 的 session / restore / preview route 权威迁到 Rust。

**Files:**

- Create: `src-tauri/src/editor_session_runtime.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/editor.js`
- Modify: `src/services/editorPersistence.js`
- Modify: `src/domains/document/documentWorkspacePreviewRuntime.js`
- Modify: `src/components/editor/PaneContainer.vue`
- Modify: `src/components/editor/EditorPane.vue`

### 边界

Rust 接管：

- 标签恢复 schema
- preview route restore
- 虚拟 tab 清理规则
- editor session normalize

前端保留：

- 当前打开标签的渲染
- drag/drop / focus / selection 等纯交互细节

### 执行步骤

- [ ] **Step 1: 定义 editor session schema**

内容包括：

- pane tree 可持久部分
- active tab
- preview bindings
- virtual tab filter rules

- [ ] **Step 2: 把 `editorPersistence.js` 收成薄桥接**

删除目标：

- 虚拟 tab 前缀清理权威
- 恢复时的最终 normalize 逻辑

- [ ] **Step 3: 把 preview route restore 与 pane restore 接到 Rust**

要求：

- `editor.js` 不再自己定义最终恢复规则
- `documentWorkspacePreviewRuntime.js` 只保留 UI 侧 adapter

### 验收标准

- 应用重开后 pane / tab / preview 恢复由 Rust 单点归一化
- 前端不再持有 editor session 的最终真相

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run build`
- 手动验证：
  - 多标签恢复
  - preview tab 恢复
  - 虚拟 tab 清理
  - split pane 状态恢复

---

## Task 5: 迁移完成后的优化 Phase

**目标：** 只在前 4 个 phase 完成后，再开始体验与性能优化。

**允许开始的前提：**

- Workspace / Preferences 的 Rust 权威完成
- Document workflow 的 Rust 权威完成
- References / citation 的 Rust 权威完成
- Editor-adjacent runtime 的 Rust 权威完成

**优化方向：**

- 编译/预览交互细节
- references 插入体验
- settings 结构与 UX 收束
- editor 打开/恢复速度

**禁止：**

- 在 phase 1-4 未完成前提前做大规模 UI polish
- 在旧前端权威上继续叠加新功能

---

## Phase 完成定义

每个 phase 完成时，必须在验收说明里明确回答三件事：

1. 哪些职责已迁到 Rust
2. 哪些前端旧实现已删除或降权
3. 剩余未迁部分的阻塞点是什么

如果回答不出这三件事，该 phase 视为未完成。

---

## 推荐执行方式

推荐一次只开一个 phase，不并行。

推荐顺序：

1. Phase 1: Workspace + Preferences
2. Phase 2: Document Workflow
3. Phase 3: References / Citation / Bibliography
4. Phase 4: Editor-Adjacent Runtime
5. Phase 5: 优化

---

## 首个执行目标

首个实际执行 phase 固定为：

**Workspace + Preferences Runtime Migration**

理由：

- 风险最低
- 对所有后续 phase 都是基础设施
- 能先建立“Rust 持有设置权威”的工程模式
- 一旦完成，settings 与 shell 的后续优化成本会显著下降
