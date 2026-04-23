# Remaining Rust Authority Audit

## 背景

`2026-04-22` convergence plan 已完成，但仓库中仍有一批前端文件承载桌面 runtime / backend authority。这个审计只回答三件事：

1. 哪些大文件只是 UI-heavy，不应该机械 Rust 化。
2. 哪些前端文件仍然持有 runtime authority，应进入下一轮 Rust phase。
3. 哪些区域需要先切 contract，再迁实现。

## 结论

### 不应直接以“全 Rust”目标处理的 UI-heavy 文件

这些文件很大，但主体是渲染、布局、编辑器集成或复杂交互，不应因为体量大就直接迁 Rust：

- `src/components/editor/PdfEmbedDocumentSurface.vue`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/MarkdownPreview.vue`
- `src/components/references/ReferenceLibraryWorkbench.vue`
- `src/components/sidebar/FileTree.vue`
- `src/components/settings/*`

它们可以继续做瘦身、分组件或提纯 adapter，但不属于下一轮 Rust authority 主战场。

### 明确仍持有 runtime authority 的前端区域

#### 1. References Store

文件：

- `src/stores/references.js`

当前仍在前端持有的 authority：

- section / source / collection / tag / search filter 语义
- reference list sort 规则
- citation usage index 构建
- 部分 query selection / list refresh glue
- add/update/remove reference 的局部 mutation 协调

判断：

- 这不是纯 store cache，已经是 project-level references runtime 规则。
- 下一轮最适合优先处理。

建议 Rust 边界：

- `references_query.rs`
- `references_mutation.rs`

#### 2. Files / Workspace Tree Runtime

文件：

- `src/stores/files.js`
- `src/domains/files/fileTreeCacheRuntime.js`

当前仍在前端持有的 authority：

- visible tree hydrate / reconcile
- expanded dirs replay
- flat file index build
- file watch refresh / debounce 策略
- tree cache / snapshot patch 规则

判断：

- 这些逻辑已经超出 UI glue，更像桌面 workspace tree runtime。
- 适合在 references 之后作为第二优先级迁移。
- 当前进度已前推一轮：`fileTreeHydrationRuntime.js` / `fileTreeRefreshRuntime.js` / `fileTreeWatchRuntime.js` / `flatFilesIndexRuntime.js` 以及对应 bridge 已删除，tree runtime 已并回现有 `src/stores/files.js` 直接调用 Rust 命令。
- 这一步减少了前端多文件 runtime 架构面，但 `files.js` 仍然承载了大量 runtime authority，后续仍应继续下沉到 Rust，而不是停在“从多个 JS 文件并到一个 JS 文件”。

建议 Rust 边界：

- `workspace_tree_runtime.rs`
- `workspace_tree_cache.rs`

#### 3. LaTeX Store Runtime

文件：

- `src/stores/latex.js`

当前仍在前端持有的 authority：

- compile queue / rerun scheduling
- lint diagnostics runtime state
- terminal stream aggregation
- compiler / tools check cache
- auto-compile debounce 策略

判断：

- `latex.rs` 已拆模块，但 compile orchestration 仍大量停在前端。
- 它不再只是一个 UI-facing store。
- 当前进度已前推一轮：`services/latex/runtime.js` 已删除，`latex.js` 直接 invoke Rust `latex_runtime_*` 命令。
- queue / rerun 调度语义已继续下沉到 `latex_runtime.rs`，前端不再自己持有完整 schedule state machine。

建议 Rust 边界：

- `latex_queue.rs`
- `latex_lint_runtime.rs`

#### 4. Workspace Bootstrap / Close Orchestration

文件：

- `src/app/workspace/useWorkspaceLifecycle.js`

当前仍在前端持有的 authority：

- workspace open / close 流程排序
- references hydrate / workflow hydrate / editor restore 的启动顺序
- watcher start / background refresh trigger
- zotero auto sync 的背景任务时序

判断：

- 这已经不是单纯 composable，而是 shell-level runtime contract。
- 迁移前最好先定义 typed bootstrap contract。

建议 Rust 或 typed contract 边界：

- `workspace_bootstrap.rs`
- `workspace_runtime_contract.rs`

#### 5. Editor Restore / Routing Rules

文件：

- `src/stores/editor.js`
- `src/domains/editor/editorOpenRoutingRuntime.js`
- `src/domains/editor/editorRestoreRuntime.js`
- `src/domains/editor/editorPersistenceRuntime.js`

当前仍在前端持有的 authority：

- preferred context selection
- open routing / companion pane 选择
- restore 后 active pane / context fallback
- recent files 与 restore 之间的衔接规则

判断：

- 这块是 mixed zone，不应整个 store 一口气迁 Rust。
- 只迁真正属于 runtime rule 的部分，不碰纯 pane interaction。

建议先切 contract：

- editor restore contract
- pane routing contract

### 仍在前端但暂时不建议迁移的 mixed 区域

#### `src/stores/workspace.js`

现状：

- 体量仍大，但主要混着 UI state、shell state、settings surface 协调、bookmark / launcher 交互。

判断：

- 核心 preferences / lifecycle authority 已在 Rust。
- 这里下一轮不是“继续整块 Rust 化”的首要目标，更适合随着 workspace bootstrap 合同收口一起瘦身。

#### `src/domains/document/documentWorkflowSessionRuntime.js`

现状：

- 仍有 443 行，但目前主要是对 Rust-backed persistent state 的前端消费、snapshot apply、queue save 和少量 UI-facing helper。

判断：

- Document workflow 的核心 authority 已在 Rust。
- 这里还有瘦身空间，但优先级低于 references / files / latex。

## 推荐的下一刀

下一轮建议从 `references` 开始，而不是先碰 `editor` 或 `files`：

原因：

1. 边界最清晰。
2. 当前前端 authority 最集中。
3. 迁移后能显著减轻 `src/stores/references.js` 的产品语义负担。
4. 对后续 citation / reference UX phase 的影响最大。

建议第一项执行任务：

- **Task A: References Query / Mutation Authority Migration**

最小切片目标：

- 把 filter / sort / collection-tag query 语义迁到 Rust
- 前端 `references.js` 退化为 query input + selection state + UI dispatch

当前进度：

- 已新增 Rust `references_query.rs`
- 已新增 Rust `references_mutation.rs`
- 已把 `references.js` 的 `filteredReferences` / `sortedLibrary` / `sectionCounts` / `sourceCounts` / `collectionCounts` / `tagCounts` 改成消费 backend query result
- `citedIn` 已消费 Rust query 返回的 citation usage index
- collection create / rename / remove、reference collection toggle、import merge / selectedReference resolve 已改成消费 Rust mutation result
- `referenceQueryBridge.js` / `referenceQueryRuntime.js` 已删除，query 路径改成现有 `references.js` 直接 invoke Rust command
- add / update / remove reference 已改成消费 Rust mutation result
- `selectedReferenceId` 的 filtered fallback 已改成由 Rust query 结果负责 reconcile，而不是前端 store 自己兜底

## 本审计的判断规则

- “文件大”不等于“该迁 Rust”
- “跨会话一致行为”和“最终业务语义”才是 Rust 迁移信号
- 只要某段前端逻辑已经是桌面端唯一真相来源，它就应被优先审计，而不是继续留在 Vue / Pinia
- backend Rust 迁移过程中，禁止通过新建 JS / TS runtime 文件转移旧 authority；已有同类前端 runtime 只允许删除或降权，不允许扩张
