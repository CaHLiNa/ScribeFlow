# 数据模型

## 前端状态

- `src/stores/workspace.js`
  工作区打开 / 关闭状态、活动 surface、侧边栏状态，以及 shell 级工作区协调。
- `src/stores/editor.js`
  Pane 树、打开标签、活动文档、脏状态与编辑器交互。
- `src/stores/documentWorkflow.js`
  预览、编译、诊断与工作流能力状态。
- `src/stores/references.js`
  文献库、筛选、选中项、导入与引用相关状态。

## 后端 / 运行时接缝

- `src-tauri/src/document_workflow.rs`
  桌面端文档工作流命令面。
- `src-tauri/src/references_*`
  文献导入、引用、PDF、Zotero 与文献库运行时数据交换。

## 规则

优先在现有 store 与运行时 schema 上演进，而不是再引入一套并行的影子模型。
