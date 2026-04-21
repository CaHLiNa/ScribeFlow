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
