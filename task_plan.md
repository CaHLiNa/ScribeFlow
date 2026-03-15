# Task Plan: 全局冗余代码清理与归并

## Goal
对 Altals 项目做一轮激进但可验证的全局清理，删除明确未使用代码、合并重复实现、移除历史残留，并在每一轮改动后通过构建验证，确保 Markdown/LaTeX、DOCX、聊天 AI、终端、GitHub 同步、引用管理、PDF/Typst 等主流程不被打坏。

## Current Phase
Complete

## Phases
### Phase 1: Baseline & Mapping
- [x] 确认用户接受激进清理策略
- [x] 明确所有主流程都属于不可破坏范围
- [x] 产出设计文档与实施计划
- [x] 建立当前代码引用图、入口图和高风险模块清单
- **Status:** complete

### Phase 2: Frontend Surface Cleanup
- [x] 清理未接入组件、未引用工具模块和明显重复的前端实现
- [x] 基于主入口可达性扫描删除完全不可达文件
- [x] 运行根前端构建验证
- **Status:** complete

### Phase 3: Store / Service / Editor Consolidation
- [x] 清理 services / utils / stores 中的死代码与无效导出
- [x] 收拢只在文件内使用的 helper，删除断链 wrapper
- [x] 运行根前端构建验证
- **Status:** complete

### Phase 4: Rust / Tauri Boundary Cleanup
- [x] 清理未使用命令、重复 helper 和历史兼容残留
- [x] 删除前端已无入口的 Rust command 注册
- [x] 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
- **Status:** complete

### Phase 5: Final Verification & Delivery
- [x] 重新运行完整验证矩阵
- [x] 更新 findings / progress / task_plan
- [x] 输出清理结果、风险与后续建议
- **Status:** complete

## Key Questions
1. 哪些文件、导出、组件和 Rust 命令已经不再被任何入口使用？
2. 哪些模块虽然仍被引用，但实际存在两套并行实现，可以归并成一套？
3. 哪些路径存在动态导入、字符串调用或运行时反射，不能仅凭静态搜索直接删除？
4. 在没有自动化测试的情况下，怎样把每轮清理边界控制在“可构建验证”的范围内？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 采用“模块归并优先 + 明确死代码删除”的 C 档清理策略 | 满足用户希望的大扫除力度，但避免直接做高风险目录重组 |
| 所有主流程都视为不可破坏范围 | 用户明确表示所有能力都在意 |
| 每轮改动后必须立即验证 | 降低激进清理带来的累积回归风险 |
| 先从静态引用图和入口图入手，再删除代码 | 避免误删运行时仍会触发的模块 |
| 动态导入、命令注册、组件映射类模块默认保守处理 | 这些位置最容易被“看起来没引用”误导 |
| 当“入口不可达扫描”和“未调用命令扫描”都清空后停止继续下钻 | 后续收益会快速下降，风险会转向主链路重构与包体优化 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 暂无阻断错误 | - | 各轮验证均一次通过 |

## Notes
- 仓库当前缺少自动化测试，因此本轮“测试”以构建/编译验证为主。
- 本轮未触碰 `web/` OAuth bridge，因此未额外运行 `web/` 构建。
- 首轮推送后继续做了一轮低风险续扫，重点收掉旧兼容导出、被新实现替代的 DOCX 老路径，以及构建里可安全消除的动态/静态导入混用 warning。
- 第二轮续扫继续聚焦低风险依赖收缩，已清掉 `@tauri-apps/api/core`、`plugin-dialog`、`@tauri-apps/api/event`、`citationStyleRegistry`、`crossref`、`bibtexParser`、`codeRunner`、`latexBib`、`pdfMetadata`、`toast`、`tauriFetch` 等模块的混用 warning；剩余项已明显转向 store 间依赖回路与更深层的结构问题。
