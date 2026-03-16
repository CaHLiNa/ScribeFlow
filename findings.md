# Active Findings: 2026-03-16 路线图贴仓库校准

## Initial Context
- 仓库 README 与 `package.json` 已明确项目定位为 local-first desktop workspace，覆盖 writing、references、code、AI-assisted research workflows。
- 当前版本号为 `0.2.18`，与用户提到的 release 节奏一致。
- 近期已完成一轮大规模清理、分包与 document adapter formalization，这意味着当前更适合补主链路可信度，而不是继续横向扩张。

## Early Signals
- `src/components/sidebar/ReferenceList.vue`、`src/components/editor/ReferenceView.vue`、`src/services/referenceImport.js`、`src/services/referenceFiles.js`、`src/utils/bibtexParser.js`、`src/utils/risParser.js` 表明 references 已有基础，但是否达到“文献库”级别还需进一步抽查。
- `src/components/editor/PdfViewer.vue`、`src/components/editor/DocumentPdfViewer.vue`、`src/services/pdfDocument.js`、`src/utils/pdfMetadata.js` 表明 PDF 已进入主工作流，但 annotation / note / backlink 能力未知。
- `src/components/editor/NotebookEditor.vue`、`src/components/editor/NotebookCell.vue`、`src/editor/chunkOutputs.js`、`src/services/chunkKernelBridge.js`、`src/services/environmentPreflight.js` 表明代码执行与环境检测已有基础。
- `src/components/editor/DocxEditor.vue`、`src/components/editor/DocxReviewBar.vue`、`src/components/comments/*`、`src/components/VersionHistory.vue`、`src/editor/diffOverlay.js` 表明 DOCX 与审阅系统已有显著基础，需要判断离“可交付”还有多远。

## Updated Findings After Core File Review
- `references` 这条线已经不是“只有 citation picker”阶段了：有持久化文献库（`references/library.json`）、排序、全文搜索字段、`ReferenceView` 详情面板、BibTeX/RIS/DOI/CSL-JSON/PDF 导入、去重、PDF 绑定和 `citedIn` 反查。
- references 当前最大的缺口不是“从 0 到 1”，而是“库治理”：去重规则偏轻量（DOI 精确匹配 + 标题相似度），没有显式的冲突预览/合并 UI，也没有批量导入时的逐字段保留策略。
- `PDF` 当前更接近“高质量查看器”：有页码、缩放、目录、缩略图、双击定位、翻译入口，以及基于 `pdfjs` 的文本提取工具；但没看到持久化 annotation、摘录卡片、文稿回链、图表截图资产等研究工作流能力。
- `Notebook / chunk execution` 已有 kernel 检测、环境探测、Jupyter 执行、review 集成、chunk 输出渲染，但状态模型仍停在 `running/done/error`，没有“结果已过期 / 依赖失效 / 嵌入结果可追溯”的科研复现层。
- `DOCX` 当前基础明显强于路线图假设：已有 suggesting 模式、tracked changes 的 accept/reject、原生 comment 输入、Zotero citation import、bibliography refresh、版本预览；但缺少 round-trip 透明度、段落级 diff 视图、clean/review 双导出这些“交付安全感”层的产品化收口。
- 用户已明确允许“按真实缺口重排优先级”，因此后续方案不再强行保留原始阶段顺序。

## Design Decision
- 采用“缺口优先”的克制版路线：
  - Week 1-2: PDF research input foundation
  - Week 3-4: reference governance + PDF coupling
  - Week 5-6: execution provenance + stale results
  - Week 7-8: DOCX delivery confidence
- 不在 8 周内先做统一 research object 大底座，避免抽象先行吞掉主链路交付。
- 正式文档已写入：
  - `/Users/math173sr/Documents/GitHub项目/Altals/docs/plans/2026-03-16-research-core-roadmap-design.md`
  - `/Users/math173sr/Documents/GitHub项目/Altals/docs/plans/2026-03-16-research-core-roadmap.md`

# Findings & Decisions

## Requirements
- 用户要求对整个项目做一次全局检查和大力度清理。
- 清理范围包括：没用的代码、旧代码、写了但没用的代码、两套相同作用但只用其中一套的代码。
- 用户明确选择激进清理方案，但要求每次改完后都要做测试。
- Markdown/LaTeX、DOCX、聊天 AI、终端、GitHub 同步、引用管理、PDF/Typst 等主流程都不能被打坏。

## Resolved Findings
| Finding | Cleanup | Evidence |
|---------|---------|----------|
| 前端存在一批从 `src/main.js` 根本不可达的死文件 | 删除 6 个完全不可达文件，包括旧的 DOCX citation overlay、旧 HTML/PDF preview UI 和废弃 workspace 协议工具 | `src/components/editor/DocxCitationOverlays.vue`, `src/components/editor/HtmlPreview.vue`, `src/components/editor/PdfSettingsPopover.vue`, `src/components/editor/PreviewSyncActions.vue`, `src/editor/docxCitations.js`, `src/utils/workspaceProtocol.js` |
| Tauri 注册了前端根本不会调用的命令 | 删除 6 个无调用 command，并清理它们唯一依赖的残留状态/结构 | `src-tauri/src/latex.rs`, `src-tauri/src/git.rs`, `src-tauri/src/typst_export.rs`, `src-tauri/src/lib.rs` |
| services / utils 中存在断链 wrapper 和完全未使用 helper | 删除无调用导出、断链 git wrapper、无效更新 stub、DOCX/OpenAlex 辅助死代码 | `src/services/appUpdater.js`, `src/services/codeRunner.js`, `src/services/docxContext.js`, `src/services/openalex.js`, `src/services/refAi.js`, `src/services/git.js`, `src/utils/errorMessages.js`, `src/utils/fileTypes.js` |
| 多个模块把仅文件内使用的 helper 暴露成公共 API，增加维护噪音 | 将内部 helper 改回私有函数，缩小维护面而不改行为 | `src/services/citationStyleRegistry.js`, `src/services/crossref.js`, `src/services/documentWorkflow/policy.js`, `src/services/documentWorkflow/reconcile.js`, `src/services/workspacePermissions.js`, `src/stores/links.js`, `src/utils/chatMarkdown.js`, `src/i18n/index.js`, `src/services/telemetry.js`, `src/services/apiClient.js`, `src/services/chatModels.js` |
| 推送后续扫中仍发现少量断链兼容层和废弃实现 | 删除 `chatTools` 旧兼容导出、移除 `docxCitationImporter` 被 `postProcessCitationsOrdered` 替代的旧 Phase 2，并继续收拢 `modelCatalog` 内部 helper | `src/services/chatTools.js`, `src/services/docxCitationImporter.js`, `src/services/modelCatalog.js` |
| 构建 warning 中存在可安全收缩的动态/静态导入混用 | 统一 `telemetry` 与 `errorMessages` 的引用方式，减少无意义 chunk warning 噪音 | `src/App.vue`, `src/components/VersionHistory.vue`, `src/components/editor/DocxEditor.vue`, `src/components/editor/NotebookEditor.vue`, `src/editor/ghostSuggestion.js`, `src/stores/chat.js`, `src/stores/editor.js`, `src/stores/files.js`, `src/stores/references.js`, `src/stores/reviews.js`, `src/stores/typst.js`, `src/stores/workspace.js` |
| 构建 warning 里还残留一批无状态工具模块的动态/静态混用 | 继续统一 `core`、`plugin-dialog`、`event`、`citationStyleRegistry`、`crossref`、`bibtexParser`、`codeRunner`、`latexBib`、`pdfMetadata`、`toast`、`tauriFetch` 的引用方式，进一步压缩 warning 面 | `src/App.vue`, `src/components/VersionHistory.vue`, `src/components/chat/ProposalCard.vue`, `src/components/editor/DocxEditor.vue`, `src/components/editor/DocxToolbar.vue`, `src/components/editor/EditorPane.vue`, `src/components/editor/NotebookEditor.vue`, `src/components/editor/ReferenceView.vue`, `src/components/editor/TextEditor.vue`, `src/components/shared/RichTextInput.vue`, `src/components/sidebar/AddReferenceDialog.vue`, `src/components/sidebar/ReferenceList.vue`, `src/services/chatTools.js`, `src/services/citationFormatterCSL.js`, `src/stores/chat.js`, `src/stores/files.js`, `src/stores/references.js`, `src/stores/reviews.js` |
| 构建 warning 里还残留少量低风险模块混用 | 继续统一 `references.js`、`@codemirror/lang-markdown`、`pdfjs-dist/legacy/build/pdf.mjs` 的加载方式，把非 store 类 warning 基本清空 | `src/components/chat/ProposalCard.vue`, `src/components/editor/EditorPane.vue`, `src/components/VersionHistory.vue`, `src/services/chatTools.js`, `src/services/editorPersistence.js`, `src/services/workspaceMeta.js`, `src/utils/pdfMetadata.js` |
| 剩余 store warning 中仍有一批单向配置读取或边缘动态入口 | 继续统一 `workspace.js` 与 `chat.js` 的低风险动态入口，进一步把 warning 收敛到更真实的状态回路 | `src/services/citationFormatterCSL.js`, `src/stores/usage.js`, `src/stores/comments.js`, `src/services/chatTools.js` |
| `comments` store 同时承担评论状态、编辑器修改和聊天提交流程，形成边缘状态回路 | 抽出 `documentComments` 与 `commentActions` 服务，评论 store 只保留状态与持久化，UI 改为调用服务层动作 | `src/services/documentComments.js`, `src/services/commentActions.js`, `src/stores/comments.js`, `src/stores/chat.js`, `src/services/chatTools.js`, `src/components/comments/CommentPanel.vue`, `src/components/comments/CommentMargin.vue` |
| `files` store 直接编排 `documentWorkflow / editor / links / reviews` 多组副作用，动态导入既制造 warning 也放大维护面 | 抽出 `fileStoreEffects`，统一承接预览源路径判断、外部文件变更、重命名/移动/删除后的跨 store 副作用 | `src/services/fileStoreEffects.js`, `src/stores/files.js` |
| `workspace` store 把 usage 加载、说明文件打开和 pull 后刷新打开文件混在 store 内，且 pull 刷新逻辑使用了不存在的 `editorStore.tabs` 路径 | 抽出 `workspaceStoreEffects`，并修正为基于 `editorStore.allOpenFiles` 刷新已打开文件 | `src/services/workspaceStoreEffects.js`, `src/stores/workspace.js` |
| `usage.js` 同时被组件静态导入和 AI 边缘模块动态导入，成为最后一条 mixed import warning | 新增 `usageAccess` 统一预算判断、usage 记录与摘要加载入口，清空 `usage.js` warning | `src/services/usageAccess.js`, `src/services/workspaceStoreEffects.js`, `src/stores/chat.js`, `src/stores/pdfTranslate.js`, `src/services/docxProvider.js`, `src/services/refAi.js`, `src/editor/docxGhost.js`, `src/editor/ghostSuggestion.js` |
| 根入口同步装配了设置、版本历史、侧栏和底部面板，导致主包过胖 | 将 `Settings`、`VersionHistory`、`LeftSidebar`、`RightPanel`、`BottomPanel` 收成异步组件，主壳层只保留首屏必要骨架 | `src/App.vue` |
| 设置页和次级面板虽然 UI 不总显示，但内部 section/子面板仍会提前进入共享包 | 将 `Settings` 各 section、`ReferenceList`、`Backlinks` 改成真正按需加载 | `src/components/settings/Settings.vue`, `src/components/sidebar/LeftSidebar.vue`, `src/components/panel/RightPanel.vue` |
| `TextEditor / PdfViewer / CsvEditor / ImageViewer / SearchResults` 仍通过同步入口进入工作区主包 | 将这些入口收成异步组件，减少主 `index` chunk 的同步代码量 | `src/components/editor/EditorPane.vue`, `src/components/layout/Header.vue` |
| `vite.config.js` 缺少稳定 vendor 分包策略，导致主入口与重依赖粘连 | 新增 `manualChunks`，按功能簇拆出 `vendor-vue`、`vendor-ai`、`vendor-codemirror-data`、`vendor-markdown`、`vendor-citations`、`vendor-pdf-viewer`、`vendor-xterm`、`vendor-handsontable`、`vendor-superdoc` 等稳定 chunk | `vite.config.js` |

## Verification Findings
- 共完成 22 轮成功的“改完即测”验证。
- 每一轮都运行了：
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
- 最后一轮的最新结果仍然是：
  - 根前端 `npm run build` 通过
  - Rust `cargo check --manifest-path src-tauri/Cargo.toml` 通过
- 第五轮续扫新增 4 轮验证：
  - `comments / chat / commentActions / documentComments` 解藕后通过
  - `files / fileStoreEffects / documentWorkflow / links / reviews` 副作用收口后通过
  - `workspace / workspaceStoreEffects` 解藕并修正 pull 刷新路径后通过
  - `usageAccess` 收口剩余 usage 访问后通过，且 `usage.js` mixed import warning 消失
- 第六轮续扫新增 4 轮验证：
  - 根壳层异步化与首版 `manualChunks` 后通过
  - `Settings / LeftSidebar / RightPanel` 二级按需加载后通过
  - 工作区重视图异步化与更细 vendor 分组试验后通过
  - 回退有循环 warning 的 `codemirror` 细拆、保留稳定分包方案后通过
- 本轮续扫中有 1 次中间构建失败：
  - 原因是把 `createTauriFetch()` 误写成不存在的命名导出 `tauriFetch`
  - 已按最小修正恢复，并在修正后重新完成完整验证
- 额外复盘扫描结果：
  - 从 `src/main.js` 出发的前端不可达文件扫描结果为空
  - Tauri `generate_handler!` 中“已注册但前端未调用命令”扫描结果为空

## Quantified Outcome
- 本轮共改动 32 个文件。
- 净删除约 1621 行，新增约 102 行。
- 删除的代码以死文件、未调用命令、断链 wrapper 和无效导出为主，没有扩展用户功能范围。

## Remaining Known Risks
- 仓库仍然缺少自动化测试，本轮只能用构建/编译验证兜底，无法替代全链路交互回归。
- 状态层 mixed import warning 已全部清空；接下来如果继续推进，主要就是更高风险的 store 拆分和包体分块优化，而不再是“安全删废代码”。
- 本轮分包后，主 `index` chunk 已显著下降，但仍有几个大包来自近单体上游依赖：`superdoc`、`codemirror`、`handsontable`、`pdfjs`。
- 其中 `superdoc` 与 `handsontable` 的剩余体积主要受第三方库形态限制；继续压缩通常意味着更激进的功能替代或更深层运行时拆分。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 优先删除“可证明不可达”的文件和命令 | 这是收益最高、风险最低的全局清理入口 |
| 将仅文件内部使用的 helper 改为私有，而不是继续暴露导出 | 减少误导性的公共 API 面 |
| 当可达性扫描和未调用命令扫描均清空后停止继续扩大范围 | 再往下会进入真实业务链路重构，不适合在缺少自动化测试的前提下继续激进推进 |

## Resources
- `/Users/math173sr/Documents/GitHub项目/Altals/docs/plans/2026-03-15-global-cleanup-design.md`
- `/Users/math173sr/Documents/GitHub项目/Altals/docs/plans/2026-03-15-global-cleanup.md`
- `/Users/math173sr/Documents/GitHub项目/Altals/src`
- `/Users/math173sr/Documents/GitHub项目/Altals/src-tauri/src`
