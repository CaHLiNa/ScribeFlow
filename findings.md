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

## Verification Findings
- 共完成 12 轮成功的“改完即测”验证。
- 每一轮都运行了：
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
- 最后一轮的最新结果仍然是：
  - 根前端 `npm run build` 通过
  - Rust `cargo check --manifest-path src-tauri/Cargo.toml` 通过
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
- 仍存在较多 “dynamic import + static import 混用” 的 Vite 警告，说明还有进一步的代码分块/依赖整理空间，但这已进入主链路重构风险区。
- 其中 `telemetry.js` 与 `errorMessages.js` 两组混用告警已在续扫中消失，剩余 warning 主要集中在 stores 相互依赖、Tauri API 包装层和引用/预览子系统。
- 第三轮续扫后，`references.js`、`@codemirror/lang-markdown`、`pdfjs-dist/legacy/build/pdf.mjs` 这些 warning 也已消失；当前剩余项已收敛为 store 间状态回路、`workspace/usage` 互相引用、`documentWorkflow/files` 交叉依赖和包级分块问题。
- 主包体依旧很大，尤其 `superdoc` 和主 `index` chunk；这是后续性能/构建优化议题，不属于本轮“安全清屎山”范围。

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
