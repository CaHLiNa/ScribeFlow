# ScribeFlow Rust Authority Expansion Plan

> 目标不是“把所有 JS 变成 Rust”，而是继续把仍然停留在前端、但本质属于桌面 runtime / backend authority 的能力下沉到 Rust。

## 为什么另起这个 Phase

当前 `2026-04-22` convergence plan 已经完成，但剩余代码面里仍有几块明显的 backend-ish 逻辑留在 `src/stores/*`、`src/domains/*` 和 `src/services/*`：

- `src/stores/references.js`：928 行
- `src/stores/latex.js`：842 行
- `src/stores/files.js`：728 行
- `src/stores/workspace.js`：604 行
- `src/stores/editor.js`：579 行
- `src/app/workspace/useWorkspaceLifecycle.js`：332 行
- `src/domains/document/documentWorkflowSessionRuntime.js`：443 行
- `src/domains/files/*` 一组 tree/cache/watch/hydration runtime

这些文件里不全是 UI glue。里面还混着：

- library filter / section / collection / tag / search 语义
- LaTeX compile queue / lint / terminal stream orchestration
- workspace tree hydrate / reconcile / cache / watch 策略
- editor open routing / restore / context selection 的运行时决策
- workspace open/close/background task orchestration

这类逻辑如果继续留在前端，会让 Rust-first 只停在一部分 schema / command 上，而不是成为真正的桌面运行时权威。

## 非目标

- 不迁移纯组件渲染、布局、样式、动效。
- 不把 `TextEditor.vue`、`ReferenceLibraryWorkbench.vue`、`PdfEmbed*` 这类明显 UI-heavy 文件机械搬去 Rust。
- 不在这一个 phase 里重做整个 editor shell。

## 本 Phase 的判断标准

只有满足以下任一条件的前端逻辑，才纳入本 phase：

1. 它决定持久化后的最终状态语义。
2. 它决定跨会话 / 跨模块一致的 runtime 行为。
3. 它决定编译、预览、引用、文件树、恢复流程的产品规则。
4. 它当前已经是“前端唯一真相来源”，而不是纯渲染 adapter。

## 优先级

### Priority 1: References Runtime Authority Completion

**理由：** `references.js` 仍然承担大量产品语义，已经超出“薄 store + UI glue”的边界。

候选下沉内容：

- section / source / collection / tag / search filter 语义
- reference list sort rule
- citation usage index 构建
- collection / tag registry 变更规则
- reference import 结果归并后的 selection 语义

建议新增 Rust 边界：

- `references_query.rs`
- `references_filters.rs`

前端目标：

- `src/stores/references.js` 退化为 query input、selection state、UI event dispatch

### Priority 2: Files / Workspace Tree Runtime Migration

**理由：** `files.js` + `domains/files/*` 现在实际上承载了目录展开、snapshot hydrate、watch reconcile、cache replay 等运行时策略，这些更像桌面 runtime，而不是视图层 glue。

候选下沉内容：

- visible tree hydrate / reconcile
- expanded dirs replay
- flat file index build
- watch event normalize / debounce / refresh policy
- file mutation effect 的最终 tree patch 规则

建议新增 Rust 边界：

- `workspace_tree_runtime.rs`
- `workspace_tree_cache.rs`

前端目标：

- `src/stores/files.js` 主要保留 UI state、调用 backend、接收 normalized snapshot

### Priority 3: LaTeX Store Runtime Completion

**理由：** `latex.rs` 已拆分，但 `src/stores/latex.js` 仍然非常厚，compile queue、lint state、terminal stream、tool check cache 还停在前端。

候选下沉内容：

- compile queue state machine
- lint diagnostics runtime state
- tool/compiler check cache 语义
- compile result -> terminal/event aggregation
- auto-compile debounce policy（至少把最终 compile scheduling rule 下沉）

建议新增 Rust 边界：

- `latex_queue.rs`
- `latex_lint_runtime.rs`

前端目标：

- `src/stores/latex.js` 只保留 UI-facing status、command trigger、短期 cache

### Priority 4: Workspace Open/Close Orchestration

**理由：** `useWorkspaceLifecycle.js` 已经不只是 UI composable，它串联了打开工作区后的 background task、references hydrate、editor restore、watch start、zotero auto sync 等流程。

候选下沉内容：

- workspace bootstrap/teardown orchestration contract
- startup task ordering
- background refresh trigger condition
- restore sequencing contract

建议新增 Rust / typed contract 边界：

- `workspace_bootstrap.rs`
- `workspace_runtime_contract.rs`

前端目标：

- `useWorkspaceLifecycle.js` 退化为 shell hook + dialog + effect adapter

### Priority 5: Editor Routing / Restore Rule Convergence

**理由：** `editor.js` 体量仍大，但其中混有大量 UI 行为；这里只迁“不是纯 UI”的 routing / restore 规则。

候选下沉内容：

- preferred context selection
- tab restore ordering contract
- companion pane / split restore rule
- recent files 选择后的 restore policy

不迁移：

- pane drag/drop
- tab click/hover
- editor view registry

## 推荐执行顺序

1. References query / filter authority
2. Files / workspace tree runtime
3. LaTeX queue / lint runtime
4. Workspace bootstrap orchestration
5. Editor restore / routing convergence

## 每个 Task 的共同验收标准

- 迁入 Rust 的规则，不再在前端保留同级 authority。
- store / composable 文件行数和职责同时下降，而不是仅仅“换个文件继续写 JS”。
- 新 Rust 模块有直接测试入口。
- 若保留 browser preview fallback，必须明确它是 fallback-only。

## 先做的审计动作

执行这个 phase 前，建议先补一份剩余 authority 审计，专门回答三件事：

1. 哪些前端大文件只是 UI heavy，不该迁 Rust。
2. 哪些前端大文件仍是 runtime authority。
3. 哪些逻辑可以直接迁，哪些要先切 contract 再迁。

建议输出文件：

- `docs/2026-04-24-remaining-rust-authority-audit.md`

## 结论

你现在的感觉是对的：Rust 还没有到“桌面 runtime 权威的多数”。但真正该盯的不是 `.vue` 文件数量，而是剩余的前端 authority 面。这个新 phase 的目标，就是把这些 authority 面继续下沉，而不是误伤纯 UI 层。
