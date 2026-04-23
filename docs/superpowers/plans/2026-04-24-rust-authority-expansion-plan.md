# ScribeFlow JS Runtime Decomposition into Rust Plan

> 这份 phase 的目标不是“Rust-first”口号化，也不是只把最终 authority 挪到 Rust。
> 目标是：**持续把 JS / Vue 中承担 backend 功能性、运行时规则、状态机、查询、调度、缓存、编排的架构层，系统性转成 Rust 主导。**

## 目标定义

本 phase 的核心目标是：

- 凡是属于桌面 runtime / backend 功能性的逻辑，默认进入 Rust 候选池。
- 前端最终只保留：
  - UI 渲染
  - 用户输入
  - 极薄的 bridge
  - 短暂 UI state
- 不再接受 `stores`、`domains/*.js`、`services/*.js` 长期承载后台规则。

换句话说，这一轮不是“继续优化 JS 架构”，而是**持续掏空 JS backend 架构**。

## 为什么要另起这个 Phase

`2026-04-22` convergence plan 已经完成，Rust 已拿下：

- workspace preferences / lifecycle / workbench shell layout
- document workflow session / preview binding / ui resolve / action resolve
- references snapshot / merge / citation / BibTeX
- editor session / recent files
- CI / release baseline quality gate
- `latex` / `references` 的第一轮 Rust 模块拆分

但当前仓库里仍有大量 backend-ish 逻辑堆在前端：

- `src/stores/references.js`
- `src/stores/latex.js`
- `src/stores/files.js`
- `src/stores/editor.js`
- `src/stores/workspace.js`
- `src/app/workspace/useWorkspaceLifecycle.js`
- `src/domains/files/*`
- `src/domains/document/documentWorkflowSessionRuntime.js`
- 以及若干 `services/*.js` 中的 runtime bridge / fallback / orchestration

所以现在的问题已经不是“Rust 有没有拿到一部分 authority”，而是：

**JS 里还残留多少 backend 架构。**

## 迁移原则

### 1. 默认怀疑前端 backend 功能性

只要某段 JS / Vue 逻辑在做以下事情，就默认应评估迁到 Rust：

- query / filter / sort / search
- session / state machine
- runtime reconcile
- compile / preview / import / export orchestration
- background task scheduling
- cache / watch / hydrate / restore 规则
- 跨模块共享的 normalize / merge / dedupe 语义

### 2. 不按文件类型判断，按职责判断

不是 `.vue` 就一定不能迁，也不是 `.js` 就一定要迁。

判断标准只有一个：

**它是在做 UI，还是在做 backend 功能性。**

### 3. 不接受长期 bridge 膨胀

短期 bridge 可以接受，但必须满足：

- 范围清楚
- 生命周期短
- 后续删除条件明确

不能让 bridge 重新长成新的 JS 功能中心。

### 3.1 禁止用“新增 JS 文件”承接 backend Rust 迁移

本 phase 增加一条硬约束：

- **禁止为了 backend Rust 迁移而新建 JS / TS 文件去承载 runtime 逻辑。**
- 如果某个 backend 规则准备迁到 Rust，正确做法是：
  - 直接新增 Rust 模块
  - 在现有前端文件中保留极薄 invoke / adapter
  - 逐步删除旧 JS authority
- 不允许出现“从一个 JS 文件减掉，再新建另一个 JS 文件继续承载同类 backend 语义”的做法。

这条规则适用于：

- `src/domains/*.js`
- `src/services/*.js`
- `src/stores/*.js`
- 任何为 query / mutation / reconcile / orchestration / normalize / cache / restore 新开的前端 runtime 文件

换句话说：

- **允许新增 Rust 文件**
- **允许缩薄现有前端文件**
- **允许删除旧 JS runtime**
- **禁止新建 JS backend runtime**

已有同类 JS bridge / runtime 文件，只能被视为待删除迁移债，不能继续扩张成功能中心。

### 4. 每一刀都要减少 JS 架构面积

验收不是“Rust 新增了一个 command”，而是：

- 对应 JS 文件真的变薄
- 对应 JS 职责真的减少
- 对应 runtime 规则不再留在前端

### 5. 不误伤纯 UI 层

以下区域不作为本 phase 的主迁移对象：

- 组件模板
- 样式与布局
- 交互动效
- 编辑器视图本身
- pane drag/drop / hover / click 这类直接 UI 行为

## 非目标

- 不把 Vue 组件渲染层改写成 Rust UI。
- 不做一次性“全仓重写”。
- 不因为追求纯 Rust runtime，就硬拆已经足够薄的纯 UI adapter。
- 不把 `PdfEmbed*`、`TextEditor.vue`、`ReferenceLibraryWorkbench.vue` 这类 UI-heavy 文件误当成 backend 迁移目标。

## 当前迁移对象分类

### A. 明确属于 backend 功能性，应持续 Rust 化

#### 1. References Runtime Completion

文件：

- `src/stores/references.js`

仍在前端的 backend 功能性：

- section / source / collection / tag / query 语义
- search / sort / counts
- citation usage index
- collection / tag registry 变更规则
- import 后 selection / refresh 语义

当前进度：

- 已完成第一刀：新增 `src-tauri/src/references_query.rs`
- 已完成第二刀：新增 `src-tauri/src/references_mutation.rs`
- `filteredReferences` / `sortedLibrary` / `counts` / `citedIn` 已开始消费 Rust query result
- collection create / rename / remove、reference collection toggle、import merge / selection 已开始消费 Rust mutation result

后续目标：

- 继续把 mutation-side runtime 规则迁入 Rust
- 把 `references.js` 收成 query input + selection state + UI dispatch

建议 Rust 边界：

- `references_query.rs`
- `references_mutation.rs`
- `references_selection.rs`

#### 2. Files / Workspace Tree Runtime

文件：

- `src/stores/files.js`
- `src/domains/files/*`

仍在前端的 backend 功能性：

- visible tree hydrate / reconcile
- watch refresh / debounce
- flat file index build
- expanded dirs replay
- tree cache / snapshot patch 规则

后续目标：

- workspace tree runtime 进入 Rust
- 前端只接收 normalized tree snapshot

建议 Rust 边界：

- `workspace_tree_runtime.rs`
- `workspace_tree_cache.rs`
- `workspace_tree_watch.rs`

#### 3. LaTeX Orchestration Runtime

文件：

- `src/stores/latex.js`

仍在前端的 backend 功能性：

- compile queue
- rerun scheduling
- lint runtime state
- tool / compiler check cache
- terminal stream aggregation
- auto-compile debounce 规则

后续目标：

- `latex.js` 从 runtime coordinator 降为 UI-facing state consumer

建议 Rust 边界：

- `latex_queue.rs`
- `latex_lint_runtime.rs`
- `latex_terminal_runtime.rs`

#### 4. Workspace Bootstrap / Teardown Orchestration

文件：

- `src/app/workspace/useWorkspaceLifecycle.js`

仍在前端的 backend 功能性：

- workspace open / close sequencing
- hydrate 顺序
- editor restore 时序
- watcher start / refresh 条件
- zotero auto sync 背景任务编排

后续目标：

- 前端只保留 dialog / shell hook / side effect adapter

建议 Rust 或 typed contract 边界：

- `workspace_bootstrap.rs`
- `workspace_runtime_contract.rs`

#### 5. Editor Restore / Routing Runtime

文件：

- `src/stores/editor.js`
- `src/domains/editor/editorOpenRoutingRuntime.js`
- `src/domains/editor/editorRestoreRuntime.js`
- `src/domains/editor/editorPersistenceRuntime.js`

仍在前端的 backend 功能性：

- restore fallback
- preferred context selection
- companion pane routing
- active pane / context recovery
- recent files 与 restore 的衔接规则

后续目标：

- 只保留 UI interaction
- runtime restore / routing 规则继续下沉

建议 Rust 边界：

- `editor_restore_contract.rs`
- `editor_routing_runtime.rs`

### B. Mixed Zone，但不是第一优先级

#### `src/stores/workspace.js`

现状：

- 核心 authority 已在 Rust
- 仍混有 shell state、bookmark / launcher 协调、settings UI state

策略：

- 不作为本 phase 第一刀
- 跟随 workspace bootstrap contract 一起继续瘦身

#### `src/domains/document/documentWorkflowSessionRuntime.js`

现状：

- document workflow 主 authority 已在 Rust
- 剩余主要是 Rust-backed session 的前端 apply/save glue

策略：

- 可以继续瘦，但优先级低于 references / files / latex / workspace bootstrap

### C. 明确不应机械 Rust 化的 UI-heavy 文件

- `src/components/editor/PdfEmbedDocumentSurface.vue`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/MarkdownPreview.vue`
- `src/components/references/ReferenceLibraryWorkbench.vue`
- `src/components/sidebar/FileTree.vue`
- `src/components/settings/*`

这些文件可以拆组件、做 adapter 提纯，但不应作为“Rust backend 架构迁移”的主目标。

## 执行顺序

推荐按下面顺序推进，不要乱序：

1. References query / mutation runtime
2. Files / workspace tree runtime
3. LaTeX orchestration runtime
4. Workspace bootstrap / teardown orchestration
5. Editor restore / routing runtime

## 当前切片状态

### Task A: References Query / Mutation Rust Migration

状态：

- 已开始并已完成前两刀

已完成内容：

- Rust 新增 `references_query.rs`
- Rust 新增 `references_mutation.rs`
- 前端 `references.js` 已开始消费 Rust query result
- collection mutation 与 import selection contract 已开始消费 Rust mutation result

剩余内容：

- add/update/remove reference 的 mutation 协调进一步下沉
- search / query state normalize 与 selectedReference reconcile 的完整 Rust contract
- `references.js` 继续收口成 query input + selection state + UI dispatch

## 每个切片的共同验收标准

- 对应 backend 功能性不再在前端保留同级实现。
- 对应 JS 文件职责和行数同时下降。
- Rust 新模块有直接测试入口。
- 若仍保留前端 fallback，必须明确是 fallback-only，而不是桌面端真实实现。
- 不允许为了迁移而新增新的 JS backend runtime / bridge 文件；若出现新增前端文件，必须证明它只是纯 UI adapter，而不是 backend 规则载体。

## 建议配套审计

本 phase 的审计文件：

- `docs/2026-04-24-remaining-rust-authority-audit.md`

用途：

- 区分 UI-heavy 与 backend-ish 剩余面
- 防止误把大组件当成迁移目标
- 为每个后续切片提供边界依据

## 最终目标

当这个 phase 完成时，ScribeFlow 的前端应主要剩下：

- 渲染
- 输入
- 极薄 bridge
- 短期 UI state

而不是再继续承担：

- backend 规则
- runtime state machine
- project-level query / filter / sort / merge / reconcile / bootstrap 语义

这才叫**JS backend 架构持续 Rust 化**。
