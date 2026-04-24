# Domains 说明

## 目的

`src/domains/*` 用来承载可复用的产品策略与运行时决策代码，这些逻辑不应直接放进 Vue 组件。

## 当前领域划分

- `src/domains/document`
  文档工作流解析、构建编排、预览适配与对账逻辑。
- `src/domains/editor`
  Pane 树、标签、清理、恢复与编辑器运行时协调规则。
- `src/domains/files`
  文件创建、内容处理、树刷新、hydrate、缓存与 watcher 策略。
- `src/domains/references`
  文献归一化、CSL 转换与展示辅助逻辑。
- `src/domains/workbench`
  工作台动效与 shell 级协调辅助逻辑。
- `src/domains/workspace`
  工作区模板与启动逻辑。

## 规则

如果某段行为属于产品策略，而不是单纯副作用 plumbing，就优先放进 `domains`，而不是 `components`、`services` 或 `stores`。

当前前端 `domains` 的默认职责是：

- 消费 Rust authority 的输出
- 组织 UI 事件、cache 与短期 orchestration
- 为组件提供可复用但不持有最终业务权威的运行时 helper

不再允许把桌面端的最终 normalize、merge、session state machine 或 preview/build rule 长期放回前端 `domains`。

## Rust Bounded Context

- `src-tauri/src/latex.rs`
  保留 LaTeX command facade、compile state 与 SyncTeX 高层入口。
- `src-tauri/src/latex_compile.rs`
  承担 LaTeX compile 执行链、streaming log、command 组装与 formatter / chktex 共享进程 helper。
- `src-tauri/src/latex_diagnostics.rs`
  承担 LaTeX / ChkTeX diagnostics 解析与列号修正。
- `src-tauri/src/references_backend.rs`
  保留 references library 文件读写、asset store 与 command facade。
- `src-tauri/src/references_snapshot.rs`
  承担 references snapshot / record normalize、CSL <-> record 转换与结构默认值。
- `src-tauri/src/references_merge.rs`
  承担 duplicate identity、snapshot merge 与 imported reference merge 策略。
- `src-tauri/src/references_query.rs`
  承担 references library 的 query/filter/sort/count 与 citation usage index 解析。
- `src-tauri/src/references_mutation.rs`
  承担 references library 的 collection mutation、import merge/select 与 mutation-side snapshot 收口。
- `src-tauri/src/references_runtime.rs`
  保留 PDF import、Crossref / DOI 查询、BibTeX 输出与 command facade。
