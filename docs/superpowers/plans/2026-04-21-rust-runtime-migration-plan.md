# ScribeFlow Rust Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先把 ScribeFlow 现有核心功能的运行时权威稳定下沉到 Rust，再在单一权威之上做后续体验优化与产品打磨。

**Architecture:** 迁移按运行时边界推进，而不是按页面推进。Rust 成为 workspace/preferences、document workflow、references/citation、editor session 的唯一权威；Vue/Pinia 只保留渲染、轻量交互状态和调用 Rust command 的桥接职责。

**Tech Stack:** Tauri 2、Rust、Vue 3、Pinia、现有 `src-tauri/*` runtime、现有 `src/domains/*` 与 `src/services/*` 桥接层

---

## 当前进度

截至 2026-04-24，这份 migration plan 对应的核心目标已完成，并在后续 `2026-04-22` convergence plan 中继续完成了 legacy off-ramp、quality gate 和模块拆分。

当前稳定状态：

- Workspace / preferences / lifecycle / workbench shell layout 已由 Rust 持有权威。
- Document workflow 的 preview binding、session、workspace preview state、workflow UI state、action availability 已由 Rust 持有权威。
- References 的 snapshot normalize、record normalize、duplicate/merge、citation、BibTeX 输出与 metadata hydrate 已由 Rust 持有权威。
- Editor session / recent files 已由 Rust 持有权威；前端只保留 restore glue 与 UI state。
- `latex` 与 `references` 的 Rust 大模块已完成第一轮 bounded context 拆分。
- 本地与 CI 已共用 `npm run check`、`npm run check:rust`、`npm run test:rust` 作为 baseline quality gate。

仍保留但已降为非主路径的部分：

- browser preview fallback：只服务非桌面环境，不再代表桌面 authority。
- `preview:` tab legacy compat：只用于旧会话恢复与只读展示，不再作为 document workflow 主路径。
- desktop smoke 验证仍依赖当前环境是否可附着桌面窗口；若不可附着，需要在验收说明里明确缺口。

下面各 task section 主要保留为历史迁移记录与验收痕迹；当前真实 authority 分布请以 `docs/ARCHITECTURE.md`、`docs/DOMAINS.md`、`docs/DOCUMENT_WORKFLOW.md` 与 `docs/OPERATIONS.md` 为准。

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

当前进度：

- 已新增 Rust `references_snapshot_normalize` / `references_record_normalize` / `references_record_from_csl`
- 已把 snapshot normalize、tag registry、record normalize 收口到 `references_backend.rs`
- 已把 citation formatter 改为始终通过 Rust `references_citation_render`，不再依赖前端 `cslToReferenceRecord/referenceRecordToCsl` 作为最终权威
- 已把 metadata refresh（Crossref/DOI）改为通过 Rust hydrate record
- 已把 `references` store 的写回路径改成消费 backend normalized snapshot / record，而不是继续沿用本地组装对象
- 当前仍未做真实桌面点击回归；原因仍是 Computer Use 无法附着 `tauri dev` 窗口

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

- [x] **Step 1: 扩展 Rust references schema 与 snapshot command**

要求：

- Rust 直接返回 normalized library snapshot
- 前端不再自己做 final normalize

- [x] **Step 2: 把 duplicate / merge / import 规则下沉**

处理：

- `bibtexImport.js` 从规则实现变为 command wrapper
- `references.js` 删除本地 duplicate/merge 权威

- [x] **Step 3: 把 citation / bibliography 输出完全交给 Rust**

要求：

- citation formatting 只通过 Rust
- bibliography write / export 不再有前端 shadow path

- [x] **Step 4: 收口 Zotero sync 集成**

要求：

- sync 之后的 snapshot merge 由 Rust 负责
- Settings 页只负责账号、同步触发和展示反馈

### 验收标准

- 前端不再维护 references normalize/merge 规则
- 引用渲染、BibTeX 输出、duplicate merge 均由 Rust 单点决定
- Zotero sync 后库快照稳定，不再存在双权威 merge

当前结果：

- 前端已不再持有 references snapshot / record 的最终 normalize 权威
- 引用渲染、BibTeX 输出、duplicate merge、PDF metadata import、Crossref/DOI hydrate 均由 Rust 决定
- Zotero sync 后前端只消费 Rust 返回结果并经 backend normalized snapshot 落盘，不再保留前端 shadow merge

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml references_`
- `npm run build`
- `npm run lint`
- 手动验证：
  - 导入 BibTeX
  - 从 PDF 导入 metadata
  - duplicate merge
  - citation render
  - bibliography 文件写出
  - Zotero 连接与同步

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml references_`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 已执行 `npm run tauri -- dev`，确认桌面应用在当前改动下能启动
- 尚未完成真实桌面窗口点击回归；阻塞原因仍是当前 Computer Use 无法识别 `tauri dev` 窗口实例

---

## Task 4: Editor-Adjacent Runtime Migration

**目标：** 把 editor 周边但不属于纯 UI 的 session / restore / preview route 权威迁到 Rust。

当前进度：

- 已新增 Rust `editor_session_runtime.rs`
- 已新增 `editor_session_save` / `editor_session_load`
- 已把 editor session 的 save/load/virtual tab cleanup/active pane/context restore 从前端迁到 Rust
- 已把前端 `editorPersistence.js` 收口为 bridge，并把 editor store 改成消费 backend restore 结果
- 已把 `PaneContainer.vue` / `EditorPane.vue` 接上 `restoreGeneration`，让 restore 后视图实例真正重建
- 已把 `documentWorkspacePreviewRuntime.js` 收敛为纯 UI adapter，不再承载 session restore 规则
- 当前仍未做真实桌面点击回归；原因仍是 Computer Use 无法附着 `tauri dev` 窗口

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

- [x] **Step 1: 定义 editor session schema**

内容包括：

- pane tree 可持久部分
- active tab
- preview bindings
- virtual tab filter rules

- [x] **Step 2: 把 `editorPersistence.js` 收成薄桥接**

删除目标：

- 虚拟 tab 前缀清理权威
- 恢复时的最终 normalize 逻辑

- [x] **Step 3: 把 preview route restore 与 pane restore 接到 Rust**

要求：

- `editor.js` 不再自己定义最终恢复规则
- `documentWorkspacePreviewRuntime.js` 只保留 UI 侧 adapter

### 验收标准

- 应用重开后 pane / tab / preview 恢复由 Rust 单点归一化
- 前端不再持有 editor session 的最终真相

当前结果：

- pane / tab / preview 恢复、virtual tab cleanup、active pane/context restore 已由 Rust 单点归一化
- 前端不再自己决定 editor-state.json 的最终保存格式与恢复规则
- `workspace.workspaceDataDir` 已成为 editor session 持久化的实际 backend 存储根目录

### 验证

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml editor_session`
- `npm run build`
- `npm run lint`
- 手动验证：
  - 多标签恢复
  - preview tab 恢复
  - 虚拟 tab 清理
  - split pane 状态恢复

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml editor_session`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 已执行 `npm run tauri -- dev`，确认桌面应用在当前改动下能启动
- 尚未完成真实桌面窗口点击回归；阻塞原因仍是当前 Computer Use 无法识别 `tauri dev` 窗口实例

---

## Task 5: 迁移完成后的优化 Phase

**目标：** 只在前 4 个 phase 完成后，再开始体验与性能优化。

当前进度：

- 已完成 LaTeX compile / PDF preview 交互优化：当 PDF artifact 尚不存在时，`reveal-pdf` / `open-output` 不再空转，而是先触发 compile，再在成功后自动打开 PDF preview 或外部输出
- 已完成 references insertion 体验优化：Citation palette 导入 DOI / BibTeX / RIS / 标题后，无论是新增文献还是命中现有重复文献，都能稳定选中并直接插入 / 加入当前 citation group
- 已完成 settings UX 收束：citation style 不再依赖 Zotero account 已连接，sync summary 会在设置页内直接反馈
- 已完成 editor 打开 / 恢复性能优化：editor session save 增加去重，重复打开当前 tab / pane 不再无意义触发持久化
- 当前仍未做真实桌面点击回归；原因仍是 Computer Use 无法附着 `tauri dev` 窗口，并且本机 `1420` 端口已有既有 Vite 进程占用

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

### 当前结果

- `DocumentWorkflowBar` 的 PDF action 已从“无 artifact 时禁用 / 空转”变为“build and open PDF”，闭合了 LaTeX compile-preview 主路径
- references 导入结果现在会返回结构化 selection 信息，citation palette 与 reference workbench 不再依赖脆弱的“读 selectedReference 猜结果”
- Zotero settings 中 citation style 已回到 workspace-level references 能力本身，不再错误耦合账号连接状态
- editor persistence 增加了 state payload 去重，减少了重复写盘和 reopen 当前 tab 时的无意义状态更新

### 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml document_workflow`
- `npm run build`
- `npm run lint`
- `npm run tauri -- dev`

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml document_workflow`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 已尝试执行 `npm run tauri -- dev`，但当前环境中 `1420` 端口已被既有 `node` 进程占用，`beforeDevCommand` 无法启动，因此本轮未完成桌面启动验证

### Phase 5 完成定义核对

1. 已完成的优化职责：
   LaTeX preview/build 交互闭环、references import/insert 闭环、settings UX 收束、editor 持久化去噪
2. 已删除或降权的旧前端行为：
   PDF artifact 缺失时的空动作、citation style 对 Zotero account 连接态的错误前置依赖、citation import 对隐式 `selectedReference` 的脆弱依赖、editor 对重复状态的无差别写盘
3. 剩余阻塞点：
   仍缺一次真实桌面点击回归；当前阻塞来自 Computer Use 无法附着 `tauri dev` 窗口，以及本机已有 `:1420` Vite 进程占用

---

## 剩余未 Rust 化清单

### 已收口的 runtime 权威

1. `LaTeX runtime preferences / toolchain policy`
   已迁到 Rust，前端仅作为 optimistic consumer 与 runtime coordinator。
2. `Workspace lifecycle persistence`
   已迁到 Rust，前端仅保留 workspace picker / setup wizard 的 UI 编排。
3. `Document workflow session convergence`
   已迁到 Rust，前端仅保留 transient cache、markdown render 和 pane UI 编排。
4. `Workspace bookmark storage`
   已迁到 Rust，macOS security-scoped bookmark 不再由前端 `localStorage` 持久化。
5. `Editor recent files`
   已迁到 Rust，最近文件列表由 workspace data dir 下的 `editor-recent-files.json` 持久化，前端只保留 browser preview fallback 与一次性 legacy 迁移输入。
6. `Workbench shell layout`
   已迁到 Rust，左右侧栏宽度与 bottom panel 高度由全局 `workbench-layout.json` 持久化，前端只负责拖拽交互和视口约束。

### 可以保留在前端的 UI coordination

- `references` 列表筛选、排序、search query、section/tag/collection 过滤
- `editor` pane tree、tab drag/drop、split/close/reorder 等纯视图结构操作
- setup wizard 的展示编排与非持久化 UI state

### 新优先级

1. **Task 6: LaTeX Runtime Preferences Migration**
   直接影响 compile / lint / format / toolchain 选择，且当前仍明显依赖前端 `localStorage`。
2. **Task 7: Workspace Lifecycle Persistence Migration**
   解决 recent workspace / last workspace / setup wizard 恢复仍由前端主持久化的问题。
3. **Task 8: Document Workflow Session Runtime Convergence**
   继续收紧 document workflow preview/session 的最终权威，减少前端 orchestration state。

当前状态：

- `Task 6` 已完成
- `Task 7` 已完成
- `Task 8` 已完成
- 当前 migration plan 的后续新增 phase 已全部收口；后续又补充完成了 workspace bookmark storage、editor recent files 和 workbench shell layout 的 Rust 化。桌面端剩余前端持久化入口仅作为 browser preview fallback 或 legacy 迁移输入，不再作为 runtime 权威。

---

## Task 6: LaTeX Runtime Preferences Migration

**目标：** 把 LaTeX compile / format / toolchain 的偏好设置默认值、持久化、历史字段迁移和合法值修正从前端下沉到 Rust。

当前进度：

- 已新增 Rust `latex_preferences.rs`
- 已新增 `latex_preferences_load` / `latex_preferences_save`
- 已把前端 `src/services/latexPreferences.js` 收口为 Rust bridge，browser preview 仅保留 fallback
- 已把 `src/stores/latex.js` 的 `compilerPreference` / `enginePreference` / `autoCompile` / `formatOnSave` / `buildRecipe` / `buildExtraArgs` / `customSystemTexPath` 改为消费 Rust-normalized 结果
- 已把旧 `localStorage` key（含 `latex.customLatexmkPath`）迁移并清理

**Files:**

- Create: `src-tauri/src/latex_preferences.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/latexPreferences.js`
- Modify: `src/stores/latex.js`
- Modify: `src/app/workspace/useWorkspaceLifecycle.js`
- Modify: `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

### 边界

Rust 接管：

- LaTeX preferences schema
- 默认值
- enum 合法值修正
- legacy `localStorage` 字段迁移
- compile / format / toolchain preference 持久化

前端保留：

- compile queue state
- lint diagnostics state
- compile stream / terminal 输出协调
- Settings UI 与 diagnostics 展示

### 验收标准

- 前端不再自己定义 LaTeX preference 默认值和主持久化
- `compilerPreference` / `enginePreference` / `autoCompile` / `formatOnSave` / `buildRecipe` / `buildExtraArgs` / `customSystemTexPath` 均由 Rust 单点 normalize 与落盘
- 旧 `localStorage` key 完成迁移后不再继续作为桌面端权威

当前结果：

- 已满足“桌面端 LaTeX preferences 权威由 Rust 持有”的 phase 目标
- 前端 `latexStore` 已从本地 `localStorage` holder 降为 optimistic consumer + runtime coordinator
- `~/.scribeflow/latex-preferences.json` 已成为 LaTeX 偏好的实际持久化位置

### 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml latex_preferences`
- `npm run build`
- `npm run lint`

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml latex_preferences`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 本轮未执行 `npm run tauri -- dev`；原因是该 phase 未修改桌面窗口启动链路，且当前环境仍存在既有 dev server 干扰

### Phase 6 完成定义核对

1. 已迁到 Rust 的职责：
   LaTeX 偏好的 schema、默认值、合法值修正、legacy 迁移和持久化
2. 已删除或降权的前端旧实现：
   `src/stores/latex.js` 中基于 `localStorage` 的默认值读取、保存与 `customLatexmkPath` 清理逻辑
3. 剩余未迁部分的阻塞点：
   compile queue / lint diagnostics / terminal stream 仍属于前端 runtime coordination，尚未进入 Rust phase；workspace lifecycle 与 document workflow session 仍是后续 phase

---

## Task 7: Workspace Lifecycle Persistence Migration

**目标：** 把 recent workspaces、last workspace 恢复和 setup wizard 完成状态从前端 `localStorage` 下沉到 Rust。

当前进度：

- 已新增 Rust `workspace_lifecycle.rs`
- 已新增 `workspace_lifecycle_load` / `workspace_lifecycle_save`
- 已把前端 `src/services/workspaceRecents.js` 收口成 Rust bridge，browser preview 仅保留 fallback
- 已把 `src/stores/workspace.js` 改成持有 Rust-backed 的 `recentWorkspaces` / `lastWorkspace` / `setupComplete` state
- 已把 `src/app/workspace/useWorkspaceLifecycle.js` 和 `src/components/SetupWizard.vue` 改为只消费 store state，不再直接读取这三个 `localStorage` key

**Files:**

- Create: `src-tauri/src/workspace_lifecycle.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/services/workspaceRecents.js`
- Modify: `src/stores/workspace.js`
- Modify: `src/app/workspace/useWorkspaceLifecycle.js`
- Modify: `src/components/SetupWizard.vue`
- Modify: `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

### 边界

Rust 接管：

- `recentWorkspaces`
- `lastWorkspace`
- `setupComplete`
- legacy `localStorage` 迁移
- recents 去重、裁剪与 path normalize

前端保留：

- workspace picker / launcher UI
- setup wizard 展示与关闭交互
- workspace bookmark capture / activate / release 的 UI 触发

### 验收标准

- 前端不再直接读取 `recentWorkspaces` / `lastWorkspace` / `setupComplete` 作为桌面端权威
- workspace 最近列表、上次工作区恢复、setup wizard 完成态均由 Rust 单点落盘
- 旧 `localStorage` key 在迁移后被清理，不再继续作为桌面端真实来源

当前结果：

- 已满足“workspace lifecycle persistence 权威由 Rust 持有”的 phase 目标
- 前端 `workspace` store 已从直接读写 `localStorage` 改为 Rust-backed lifecycle state consumer
- `~/.scribeflow/workspace-lifecycle.json` 已成为 recent workspace / last workspace / setupComplete 的实际持久化位置

### 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml workspace_lifecycle`
- `npm run build`
- `npm run lint`

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml workspace_lifecycle`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 本轮未执行 `npm run tauri -- dev`；原因是当前 phase 未修改桌面启动链路，且环境中仍有既有 dev server / Computer Use 附着问题

### Phase 7 完成定义核对

1. 已迁到 Rust 的职责：
   recent workspace 列表、last workspace 恢复、setup wizard 完成态，以及 legacy `localStorage` 迁移与 recents normalize
2. 已删除或降权的前端旧实现：
   `src/app/workspace/useWorkspaceLifecycle.js` 和 `src/components/SetupWizard.vue` 对这三个 `localStorage` key 的直接读取 / 写入；`workspaceRecents.js` 不再是桌面端主持久化实现
3. 剩余未迁部分的阻塞点：
   document workflow session 仍有前端 preview/session orchestration state；workspace bookmark 存储已补充迁到 Rust，前端只保留非桌面 fallback。

---

## Task 8: Document Workflow Session Runtime Convergence

**目标：** 把 document workflow 的 preview prefs、preview bindings、workspace preview visibility/request、detached source/session state 从前端本地权威收口到 Rust。

当前进度：

- 已新增 Rust `document_workflow_session.rs`
- 已新增 `document_workflow_session_load` / `document_workflow_session_save`
- 已把前端 `src/services/documentWorkflow/sessionStateBridge.js` 收口为 Rust bridge，browser preview 仅保留 fallback
- 已把 `src/stores/documentWorkflow.js` 改成 Rust-backed persistent state consumer，`previewPrefs`、`session`、`previewBindings`、`workspacePreviewVisibility`、`workspacePreviewRequests` 不再直接依赖本地 `localStorage`
- 已把 workspace open / close 生命周期接入 document workflow store，确保工作区切换时正确 hydrate / cleanup backend state

**Files:**

- Create: `src-tauri/src/document_workflow_session.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/documentWorkflow/sessionStateBridge.js`
- Modify: `src/stores/documentWorkflow.js`
- Modify: `src/app/workspace/useWorkspaceLifecycle.js`
- Modify: `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

### 边界

Rust 接管：

- `previewPrefs`
- `session`
- `previewBindings`
- `workspacePreviewVisibility`
- `workspacePreviewRequests`
- legacy preview preference `localStorage` 迁移

前端保留：

- resolved preview/ui state cache
- markdown render transient state
- pane open/activate 的 UI 编排

### 验收标准

- 前端不再自己定义 document workflow preview preference 默认值和主持久化
- preview/session/binding/visibility/request 状态均由 Rust 单点 normalize 与落盘
- 工作区切换时 document workflow 状态能按 workspaceDataDir 正确 hydrate 和 cleanup

当前结果：

- 已满足“document workflow session 权威由 Rust 持有”的 phase 目标
- 前端 `documentWorkflow` store 已从本地 preference/session holder 降为 Rust-backed consumer + transient cache/orchestration layer
- `workspaceDataDir/document-workflow-state.json` 已成为该 workspace 的 document workflow session 状态持久化位置

### 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml document_workflow_session`
- `npm run build`
- `npm run lint`

当前验证记录：

- 已执行 `cargo fmt --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml`
- 已执行 `cargo test --manifest-path src-tauri/Cargo.toml document_workflow_session`
- 已执行 `npm run build`
- 已执行 `npm run lint`
- 本轮未执行 `npm run tauri -- dev`；原因是当前 phase 未修改桌面启动链路，且环境中仍有既有 dev server / Computer Use 附着问题

### Phase 8 完成定义核对

1. 已迁到 Rust 的职责：
   document workflow preview prefs、session、preview bindings、workspace preview visibility/request，以及 legacy preview preference 迁移
2. 已删除或降权的前端旧实现：
   `src/stores/documentWorkflow.js` 中基于 `localStorage` 的 `previewPrefs` 主持久化与本地 session/binding 权威
3. 剩余未迁部分的阻塞点：
   仅剩 resolved cache、markdown render transient state、pane UI 编排等前端 coordination；workspace bookmark storage 已补充迁到 Rust，前端只保留非桌面 fallback。

---

## Task 9: Remaining Persistence Authority Sweep

**目标：** 扫描剩余前端持久化入口，把仍属于桌面 runtime 权威的 editor recent files 与 workbench shell layout 下沉到 Rust。

当前进度：

- 已在 Rust `editor_session_runtime.rs` 中新增 `editor_recent_files_load` / `editor_recent_files_save`
- 已在 Rust `workbench_state.rs` 中新增 `workbench_layout_load` / `workbench_layout_save`
- 已把 `src/services/editorPersistence.js` 收口为 recent files Rust bridge，browser preview 仅保留 fallback
- 已把 `src/composables/useAppShellLayout.js` 的左右侧栏宽度与 bottom panel 高度持久化改为 Rust-backed
- 已把 workspace 打开流程改为等待 recent files hydrate，避免最近文件列表继续由旧前端 storage 主持久化

**Files:**

- Modify: `src-tauri/src/editor_session_runtime.rs`
- Modify: `src-tauri/src/workbench_state.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/services/editorPersistence.js`
- Modify: `src/domains/editor/editorPersistenceRuntime.js`
- Modify: `src/stores/editor.js`
- Modify: `src/app/workspace/useWorkspaceLifecycle.js`
- Modify: `src/composables/useAppShellLayout.js`
- Modify: `docs/superpowers/plans/2026-04-21-rust-runtime-migration-plan.md`

### 边界

Rust 接管：

- editor recent files schema、去重、裁剪、legacy migration 与 workspace 级持久化
- workbench shell layout schema、尺寸 clamp、legacy migration 与全局持久化

前端保留：

- editor recent files 的打开意图、空状态展示与当前会话内 optimistic 更新
- shell resize / snap / viewport clamp 等 UI 交互编排
- browser preview runtime 的 fallback storage

### 验收标准

- 桌面端不再把 recent files 存在 `localStorage`
- 桌面端不再把 shell layout 尺寸存在 `localStorage`
- 旧 `localStorage` key 在 Rust 迁移成功后被清理
- 前端仅通过 Tauri command 消费 Rust-normalized 结果

当前结果：

- 已满足“remaining persistence authority sweep”的目标
- `workspaceDataDir/editor-recent-files.json` 成为最近文件列表的实际持久化位置
- `~/.scribeflow/workbench-layout.json` 成为 shell layout 尺寸的实际持久化位置

### 验证

- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml editor_session`
- `cargo test --manifest-path src-tauri/Cargo.toml workbench_state`
- `cargo test --manifest-path src-tauri/Cargo.toml workspace_access`
- `npm run lint`
- `npm run build`

### Phase 9 完成定义核对

1. 已迁到 Rust 的职责：
   editor recent files 与 workbench shell layout 的 schema、normalize、legacy 迁移和持久化
2. 已删除或降权的前端旧实现：
   `recentFiles:${workspacePath}`、`leftSidebarWidth`、`rightSidebarWidth`、`bottomPanelHeight` 不再是桌面端权威；前端只保留 browser preview fallback
3. 剩余未迁部分的阻塞点：
   纯 UI state、CodeMirror / DOM 交互、browser preview mock/fallback 和 markdown render transient state 不应迁到 Rust；它们没有作为桌面 runtime 权威继续留在前端

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
