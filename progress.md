# Progress Log

## Session: 2026-03-15

### Phase 1: Baseline & Mapping
- **Status:** complete
- Actions taken:
  - 读取 `using-superpowers`、`planning-with-files`、`brainstorming`、`writing-plans`、`verification-before-completion`
  - 扫描仓库结构、`package.json`、README 与 architecture 文档
  - 与用户确认采用激进清理策略，并把“每轮改完立即测试”设为硬约束
  - 生成 `docs/plans/2026-03-15-global-cleanup-design.md`
  - 生成 `docs/plans/2026-03-15-global-cleanup.md`
  - 建立前端主入口可达性扫描和 Tauri 命令注册/调用对照扫描
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/plans/2026-03-15-global-cleanup-design.md`
  - `docs/plans/2026-03-15-global-cleanup.md`

### Phase 2: Frontend Surface Cleanup
- **Status:** complete
- Actions taken:
  - 删除 6 个从 `src/main.js` 完全不可达的前端死文件
  - 移除旧 DOCX citation node / overlay 路径、旧 HTML preview、旧 PDF settings popover、旧 preview sync actions 和废弃 workspace protocol util
  - 运行首轮构建验证
- Files created/modified:
  - `src/components/editor/DocxCitationOverlays.vue` (deleted)
  - `src/components/editor/HtmlPreview.vue` (deleted)
  - `src/components/editor/PdfSettingsPopover.vue` (deleted)
  - `src/components/editor/PreviewSyncActions.vue` (deleted)
  - `src/editor/docxCitations.js` (deleted)
  - `src/utils/workspaceProtocol.js` (deleted)

### Phase 3: Store / Service / Editor Consolidation
- **Status:** complete
- Actions taken:
  - 删除无调用更新 stub、DOCX/OpenAlex 辅助死代码和断链 git wrapper
  - 收拢一批只在文件内使用的 helper，移除多余导出
  - 清理 `services` / `utils` / `stores` 中的无效 API 面
  - 持续在每轮后重跑前端构建与 Rust 编译检查
- Files created/modified:
  - `src/services/appUpdater.js`
  - `src/services/apiClient.js`
  - `src/services/chatModels.js`
  - `src/services/citationStyleRegistry.js`
  - `src/services/codeRunner.js`
  - `src/services/crossref.js`
  - `src/services/documentWorkflow/policy.js`
  - `src/services/documentWorkflow/reconcile.js`
  - `src/services/docxContext.js`
  - `src/services/git.js`
  - `src/services/openalex.js`
  - `src/services/refAi.js`
  - `src/services/telemetry.js`
  - `src/services/workspacePermissions.js`
  - `src/stores/links.js`
  - `src/utils/chatMarkdown.js`
  - `src/utils/errorMessages.js`
  - `src/utils/fileTypes.js`
  - `src/i18n/index.js`

### Phase 4: Rust / Tauri Boundary Cleanup
- **Status:** complete
- Actions taken:
  - 删除前端无调用的 Tauri commands
  - 清理命令删除后遗留的 LaTeX 状态字段与关联结构
  - 删除断链 git init / git diff Rust 命令
  - 更新 `generate_handler!` 注册表
- Files created/modified:
  - `src-tauri/src/git.rs`
  - `src-tauri/src/latex.rs`
  - `src-tauri/src/lib.rs`
  - `src-tauri/src/typst_export.rs`

### Phase 5: Final Verification
- **Status:** complete
- Actions taken:
  - 复跑最后一轮 `npm run build`
  - 复跑最后一轮 `cargo check --manifest-path src-tauri/Cargo.toml`
  - 重新执行前端不可达文件扫描，结果为空
  - 重新执行 Tauri 未调用命令扫描，结果为空
  - 更新记录文件并准备交付

### Follow-up Continuation: Post-push Low-risk Cleanup
- **Status:** complete
- Actions taken:
  - 删除 `src/services/chatTools.js` 中完全无调用的 legacy export
  - 删除 `src/services/docxCitationImporter.js` 中被 `postProcessCitationsOrdered` 取代的旧 Phase 2 路径，并将多处内部 helper 收回私有
  - 将 `src/services/modelCatalog.js` 中仅文件内使用的 helper 改回私有函数
  - 统一 `telemetry` 与 `errorMessages` 的引用方式，消掉两组 Vite 动态/静态导入混用 warning
  - 每一小轮后都重新执行前端构建与 Rust 编译验证
- Files created/modified:
  - `src/services/chatTools.js`
  - `src/services/docxCitationImporter.js`
  - `src/services/modelCatalog.js`
  - `src/App.vue`
  - `src/components/VersionHistory.vue`
  - `src/components/editor/DocxEditor.vue`
  - `src/components/editor/NotebookEditor.vue`
  - `src/editor/ghostSuggestion.js`
  - `src/stores/chat.js`
  - `src/stores/editor.js`
  - `src/stores/files.js`
  - `src/stores/references.js`
  - `src/stores/reviews.js`
  - `src/stores/typst.js`
  - `src/stores/workspace.js`

### Follow-up Continuation 2: Import Consolidation
- **Status:** complete
- Actions taken:
  - 统一 `@tauri-apps/api/core`、`@tauri-apps/plugin-dialog`、`@tauri-apps/api/event` 的引用方式，删除仅制造 warning 的动态导入
  - 统一 `citationStyleRegistry`、`crossref`、`bibtexParser`、`codeRunner`、`latexBib`、`pdfMetadata`、`toast`、`tauriFetch` 的引用方式
  - 构建中途发现一次真实问题：`tauriFetch` 被误当成命名导出；已定位到 `createTauriFetch()` 才是正确导出，并最小修正
  - 在修正后重新执行完整验证，确认本轮整理未引入回归
- Files created/modified:
  - `src/App.vue`
  - `src/components/VersionHistory.vue`
  - `src/components/chat/ProposalCard.vue`
  - `src/components/editor/DocxEditor.vue`
  - `src/components/editor/DocxToolbar.vue`
  - `src/components/editor/EditorPane.vue`
  - `src/components/editor/NotebookEditor.vue`
  - `src/components/editor/ReferenceView.vue`
  - `src/components/editor/TextEditor.vue`
  - `src/components/shared/RichTextInput.vue`
  - `src/components/sidebar/AddReferenceDialog.vue`
  - `src/components/sidebar/ReferenceList.vue`
  - `src/services/chatTools.js`
  - `src/services/citationFormatterCSL.js`
  - `src/stores/chat.js`
  - `src/stores/files.js`
  - `src/stores/references.js`
  - `src/stores/reviews.js`

### Follow-up Continuation 3: Store-edge Warning Cleanup
- **Status:** complete
- Actions taken:
  - 将 `references` store 在组件与服务边界上的 5 处动态导入改为静态引用，消除 `references.js` 的 mixed import warning
  - 将 `VersionHistory.vue` 里的 `@codemirror/lang-markdown` 改成真正按需加载，消除该包 warning
  - 将 `pdfMetadata.js` 统一到与 `PdfViewer.vue` 相同的 `pdfjs` 入口，消除 `pdfjs-dist/legacy/build/pdf.mjs` warning
  - 重新执行前端构建与 Rust 检查，确认本轮改动未引入回归
- Files created/modified:
  - `src/components/chat/ProposalCard.vue`
  - `src/components/editor/EditorPane.vue`
  - `src/components/VersionHistory.vue`
  - `src/services/chatTools.js`
  - `src/services/editorPersistence.js`
  - `src/services/workspaceMeta.js`
  - `src/utils/pdfMetadata.js`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| 前端构建 Round 1 | `npm run build` | 删除前端死文件后仍可构建 | 通过 | 通过 |
| Rust 检查 Round 1 | `cargo check --manifest-path src-tauri/Cargo.toml` | 删除前端死文件后 Rust 仍可编译 | 通过 | 通过 |
| 前端构建 Round 2 | `npm run build` | 删除未调用 Tauri command 后仍可构建 | 通过 | 通过 |
| Rust 检查 Round 2 | `cargo check --manifest-path src-tauri/Cargo.toml` | 删除未调用 Tauri command 后仍可编译 | 通过 | 通过 |
| 前端构建 Round 3 | `npm run build` | 删除 services/utils 死代码后仍可构建 | 通过 | 通过 |
| Rust 检查 Round 3 | `cargo check --manifest-path src-tauri/Cargo.toml` | 删除 services/utils 死代码后仍可编译 | 通过 | 通过 |
| 前端构建 Round 4 | `npm run build` | 收拢内部 helper API 后仍可构建 | 通过 | 通过 |
| Rust 检查 Round 4 | `cargo check --manifest-path src-tauri/Cargo.toml` | 收拢内部 helper API 后仍可编译 | 通过 | 通过 |
| 前端构建 Round 5 | `npm run build` | 删除旧兼容导出与废弃 DOCX Phase 2 后仍可构建 | 通过 | 通过 |
| Rust 检查 Round 5 | `cargo check --manifest-path src-tauri/Cargo.toml` | 删除旧兼容导出与废弃 DOCX Phase 2 后仍可编译 | 通过 | 通过 |
| 前端构建 Round 6 | `npm run build` | 统一 `telemetry` 引用方式后仍可构建 | 通过，且对应 warning 消失 | 通过 |
| Rust 检查 Round 6 | `cargo check --manifest-path src-tauri/Cargo.toml` | 统一 `telemetry` 引用方式后仍可编译 | 通过 | 通过 |
| 前端构建 Round 7 | `npm run build` | 统一 `errorMessages` 引用方式后仍可构建 | 通过，且对应 warning 消失 | 通过 |
| Rust 检查 Round 7 | `cargo check --manifest-path src-tauri/Cargo.toml` | 统一 `errorMessages` 引用方式后仍可编译 | 通过 | 通过 |
| 前端构建 Round 8 | `npm run build` | 第一批 import consolidation 后仍可构建 | 通过，且多组 warning 消失 | 通过 |
| Rust 检查 Round 8 | `cargo check --manifest-path src-tauri/Cargo.toml` | 第一批 import consolidation 后仍可编译 | 通过 | 通过 |
| 前端构建 Round 9 | `npm run build` | 第二批 import consolidation 后仍可构建 | 通过，且更多 warning 消失 | 通过 |
| Rust 检查 Round 9 | `cargo check --manifest-path src-tauri/Cargo.toml` | 第二批 import consolidation 后仍可编译 | 通过 | 通过 |
| 前端构建 Round 10 | `npm run build` | 修正 `createTauriFetch()` 导出使用后仍可构建 | 通过，且 `toast/tauriFetch` warning 消失 | 通过 |
| Rust 检查 Round 10 | `cargo check --manifest-path src-tauri/Cargo.toml` | 修正 `createTauriFetch()` 导出使用后仍可编译 | 通过 | 通过 |
| 前端构建 Round 11 | `npm run build` | `references` 与 `@codemirror/lang-markdown` 统一加载方式后仍可构建 | 通过，且两组 warning 消失 | 通过 |
| Rust 检查 Round 11 | `cargo check --manifest-path src-tauri/Cargo.toml` | `references` 与 `@codemirror/lang-markdown` 续扫后仍可编译 | 通过 | 通过 |
| 前端构建 Round 12 | `npm run build` | `pdfjs-dist/legacy/build/pdf.mjs` 统一加载方式后仍可构建 | 通过，且 `pdfjs` warning 消失 | 通过 |
| Rust 检查 Round 12 | `cargo check --manifest-path src-tauri/Cargo.toml` | `pdfjs` 续扫后仍可编译 | 通过 | 通过 |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 本轮续扫中 | `src/stores/chat.js` 错误导入不存在的 `tauriFetch` 命名导出，导致 `npm run build` 失败 | 读取 `src/services/tauriFetch.js` 导出定义并比对调用方 | 改为导入 `createTauriFetch` 并在调用处实例化，复跑构建通过 |

## Current State
- 本轮大清理已经完成一个安全收束点。
- 主入口不可达文件扫描为空。
- Tauri 已注册但前端未调用的命令扫描为空。
- `telemetry.js` 与 `errorMessages.js` 两组动态/静态导入混用 warning 已清掉。
- 第二轮续扫后，`core`、`plugin-dialog`、`event`、`citationStyleRegistry`、`crossref`、`bibtexParser`、`codeRunner`、`latexBib`、`pdfMetadata`、`toast`、`tauriFetch` 的混用 warning 也已清掉。
- 第三轮续扫后，`references.js`、`@codemirror/lang-markdown`、`pdfjs-dist/legacy/build/pdf.mjs` 的混用 warning 也已清掉。
- 目前剩余更高价值但更高风险的工作，已经集中在 stores 互相依赖、`workspace/usage` 状态回路、`documentWorkflow`/`files` 交叉依赖，以及包级分块优化。
