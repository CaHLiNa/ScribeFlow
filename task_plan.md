## Active Task: 8 周主链路补完路线图落地

### Goal
把用户给出的 8 周路线图落成一份贴着 Altals 当前代码结构的执行方案，重点确认四个阶段对应的现有基础、明显缺口、实现依赖与建议切入顺序；在设计确认前不直接进入功能开发。

### Current Phase
Task 3 Execution

### Planned Phases
#### Phase A: Context Mapping
- [x] 读取现有 README、package、近期计划记录与最近提交
- [x] 抽查 references / PDF / execution / DOCX-review 四条链路的关键模块
- [x] 汇总“已有基础 / 缺口 / 风险 / 依赖”
- **Status:** complete

#### Phase B: Scope Alignment
- [x] 基于代码现状评估用户 8 周路线图的可执行性
- [x] 识别是否有更适合先做的基础设施项
- [x] 向用户确认是“保留原四阶段结构”还是“按真实缺口重排优先级”
- **Status:** complete

#### Phase C: Design & Handoff
- [x] 产出贴仓库的设计/实施建议
- [x] 写入 design doc 与 implementation plan
- [x] 等待用户选择执行方式
- **Status:** complete

#### Phase D: Task 1 - Research Input Foundation
- [x] 在隔离 worktree 中同步 roadmap 文档
- [x] 确认 workspace / projectDir / App 生命周期接入点
- [x] 新增 `researchArtifacts` store 与 `pdfAnchors` 服务
- [x] 把 research artifacts 接入 workspace open / close 生命周期
- [x] 运行 `npm run build`
- [x] 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
- **Status:** complete

#### Phase E: Task 2 - PDF Annotation Capture
- [x] 设计 PDF annotation capture 的最小 UI 与交互入口
- [x] 在 PDF 选区上创建 annotation
- [x] 增加 annotation 列表与回跳能力
- [x] 运行 `npm run build`
- **Status:** complete

#### Phase F: Task 3 - Notes and Manuscript Inserts
- [x] 为 annotation 增加 note card 入口
- [x] 持久化 note comment / inserted state / source_ref
- [x] 支持向已打开 manuscript editor 插入摘录与来源标记
- [x] 运行 `npm run build`
- [x] 运行 `cargo check --manifest-path src-tauri/Cargo.toml`
- **Status:** complete

#### Phase G: Task 4 - Reference Governance
- [ ] 为批量导入增加 preview / merge 入口
- [ ] 扩展 duplicate audit 规则
- [ ] 补 bibliography audit 与 reference coupling
- **Status:** pending

### Key Questions
1. 当前 references / PDF / notebook / DOCX-review 各自已经做到多深？
2. 用户给出的阶段顺序是否需要根据现有实现基础微调？
3. 现阶段最合适的起点，是先补 references library，还是先收口某个跨链路基础模型？

### Decisions Made
| Decision | Rationale |
|----------|-----------|
| 先做仓库现状映射，再评价路线图 | 这份路线图已经足够明确，当前最需要的是贴代码库校准，而不是空泛补充 |
| 设计确认前不直接进入大规模功能实现 | `brainstorming` 要求先完成设计澄清与用户确认 |
| 延续已有 planning files，而不是新建并行文件 | 便于保留项目级工作记忆，同时把当前任务单独标为 active |
| 按 `using-git-worktrees` 在 `.worktrees/research-input-foundation` 执行实现 | 避免把 roadmap 执行和当前主工作区未提交内容混在一起 |
| Task 1 先只补项目级 research artifact 持久化，不提前做 annotation UI | 遵守最小实现边界，先把后续 PDF / note 工作流需要的底座立起来 |
| Task 2 把 annotation capture、列表、回跳都留在现有 `PdfViewer` 壳内实现 | 避免过早拆新面板组件，优先打通最短研究输入链 |
| Task 3 的 manuscript insert 只命中“已打开且像手稿的编辑器” | 降低把摘录误插进代码文件的风险，先支持 `md/tex/typ/qmd/rmd/docx` |

### Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 暂无 | - | - |

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
- 第三轮续扫进一步清掉了 `references.js`、`@codemirror/lang-markdown` 和 `pdfjs-dist/legacy/build/pdf.mjs` 的混用 warning；当前构建告警已收敛到 store 互相依赖和超大 chunk 两类结构性问题。
- 第四轮续扫又清掉了 `workspace.js` 与 `chat.js` 两组 store warning 的低风险动态入口；目前剩余项主要集中在 `files / editor / comments / usage / documentWorkflow / links / reviews` 这几组真实状态回路，以及超大 chunk。
- 第五轮续扫进入状态层解藕：已把评论提交/采纳、文件变更副作用、workspace 拉取后刷新和 usage 访问分别抽到服务层，构建中的 `comments.js`、`documentWorkflow.js`、`links.js`、`reviews.js`、`editor.js`、`files.js`、`usage.js` mixed import warning 已全部清空。
- 当前构建剩余告警只剩超大 chunk；这已经是分包与包体优化问题，不再属于低风险状态解藕范围。
- 第六轮续扫进入分包与包体优化：根壳层和工作区重视图已切成异步入口，`Settings`/`LeftSidebar`/`RightPanel` 做了二级按需加载，`manualChunks` 已把 `vue`、`ai`、`codemirror-data`、`markdown`、`citations`、`pdf-viewer`、`xterm`、`handsontable`、`superdoc` 等重依赖切成稳定 vendor 包。
- 当前主入口包已从约 `3.68 MB` 压到约 `379 KB`，根样式入口也从约 `496 KB` 压到约 `79 KB`；剩余超大 chunk 主要来自近单体第三方依赖：`superdoc`、`codemirror`、`handsontable` 和 `pdfjs` 核心。
- 最新续扫已把文档工作流中原本半成品的统一抽象正式化成 `DocumentAdapter / CompileAdapter`：`compile / diagnostics / preview / citationSyntax` 现在都能通过 adapter registry 收口，`documentWorkflow` store 与 `useEditorPaneWorkflow` 不再需要分别知道三套格式细节。
