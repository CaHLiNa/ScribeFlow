# Rust-First Runtime Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend a thin desktop workbench shell while Rust owns CPU-heavy, IO-heavy, and security-sensitive runtime work.

**Architecture:** Keep Vue/Pinia responsible for rendering, ephemeral view state, user intent capture, and embedding CodeMirror or pdf.js. Move document parsing, preview preparation, citation formatting, metadata normalization, indexing, and other expensive transforms behind typed Tauri commands so the JS side becomes an orchestration layer instead of a compute layer.

**Tech Stack:** Vue 3, Pinia, Tauri 2, Rust, Tokio, existing Tauri `invoke` bridge, `hayagriva`, pdf.js, Markdown rendering crate added in this slice.

---

## Scope Lock

- Do not redesign the existing desktop UI.
- Do not touch the separate `web/` project.
- Do not rewrite CodeMirror or pdf.js rendering in Rust during this plan.
- Treat "Rust-first" as a runtime-boundary rule, not a vanity language-ratio goal.
- JS may keep view-only logic, but it must stop owning expensive transforms.

## Current-State Evidence

- Product source is still frontend-heavy by line count: `src` has about `46k` LOC while `src-tauri/src` has about `26k` LOC.
- Many core heavy paths are already correctly in Rust: filesystem access, LaTeX compile and SyncTeX, reference import, CSL formatting, AI runtime, workspace snapshots, and secure desktop seams.
- The biggest remaining frontend-owned heavy paths are:
  - Markdown parse + preview render in `src/services/markdown/parser.js` and `src/services/markdown/preview.js`
  - PDF viewer session logic in `src/components/editor/PdfIframeSurface.vue`
  - Legacy citation orchestration duplication in `src/services/references/citationStyleRegistry.js`
- Large frontend files such as `src/stores/ai.js`, `src/stores/latex.js`, and `src/stores/references.js` are mostly coordination/state and should be split for maintainability, but they are not the first performance target.

## Target Runtime Boundary

### Frontend keeps

- Vue components, DOM rendering, workbench layout, transient UI state
- CodeMirror integration and editor event plumbing
- pdf.js embedding as an isolated preview surface
- typed calls into Rust services

### Rust owns

- filesystem traversal, snapshots, watches, writes, and permission checks
- LaTeX compile, SyncTeX, project graph, and diagnostics normalization
- bibliography import, normalization, duplicate detection, and CSL formatting
- Markdown parsing, heading extraction, preview HTML generation, and preview metadata extraction
- PDF artifact byte loading, metadata extraction, annotation persistence, and preview-session coordination
- future workspace indexing, search ranking, and document intelligence pipelines

## File Structure

### New files

- Create: `src-tauri/src/markdown_runtime.rs`
  Responsibility: Markdown parse/render/extract commands and shared Markdown output structs.
- Create: `src/services/markdown/runtimeBridge.js`
  Responsibility: thin frontend bridge for Markdown commands.
- Create: `tests/markdownRuntimeBridge.test.mjs`
  Responsibility: verify frontend Markdown services call the backend bridge instead of local parser pipelines.
- Create: `src-tauri/src/pdf_preview_runtime.rs`
  Responsibility: backend-owned PDF preview session registry, artifact caching, and viewer coordination commands.
- Create: `src/services/pdf/runtimeBridge.js`
  Responsibility: thin frontend bridge for PDF preview/runtime commands.
- Create: `tests/pdfPreviewRuntimeBridge.test.mjs`
  Responsibility: verify PDF preview surface uses the backend runtime bridge.

### Files to modify

- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/services/markdown/parser.js`
- Modify: `src/services/markdown/outline.js`
- Modify: `src/services/markdown/preview.js`
- Modify: `src/utils/markdownPreview.js`
- Modify: `src/components/editor/TextEditor.vue`
- Modify: `src/components/editor/PdfIframeSurface.vue`
- Modify: `src/services/pdf/artifactPreview.js`
- Modify: `src/services/references/citationStyleRegistry.js`
- Modify: `src/services/references/citationFormatter.js`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Modify: `tests/repoDocsAudit.test.mjs`

## Acceptance Criteria

- Markdown outline extraction and preview rendering no longer import `unified`, `remark-*`, or `rehype-*` from active runtime code.
- Citation formatting has a single Rust-backed execution path instead of split JS orchestration branches.
- PDF preview surface no longer owns artifact-loading policy or byte-transport lifecycle.
- The frontend remains responsible for rendering surfaces, but not for expensive document transforms.
- `npm run build` passes.
- Targeted tests pass for Markdown bridge, PDF bridge, repo docs audit, and any touched runtime slices.

### Task 1: Establish And Enforce The Rust-First Boundary

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Modify: `tests/repoDocsAudit.test.mjs`

- [ ] **Step 1: Add the runtime-boundary policy to the architecture docs**

Document that `src/services/*` on the frontend may orchestrate but must not become the long-term home for parsing, indexing, bibliography formatting, or other CPU-heavy transforms when a typed Rust seam exists.

- [ ] **Step 2: Add a repo audit that blocks regression**

Add a docs or repo-policy audit that fails if active frontend Markdown runtime files directly depend on heavyweight parser/render stacks after the migration is complete.

- [ ] **Step 3: Run the docs audit slice**

Run: `node --test tests/repoDocsAudit.test.mjs`
Expected: PASS

### Task 2: Move Markdown Parse, Outline, And Preview Rendering To Rust

**Files:**
- Create: `src-tauri/src/markdown_runtime.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/markdown/runtimeBridge.js`
- Modify: `src/services/markdown/parser.js`
- Modify: `src/services/markdown/outline.js`
- Modify: `src/services/markdown/preview.js`
- Modify: `src/utils/markdownPreview.js`
- Modify: `src/components/editor/TextEditor.vue`
- Create: `tests/markdownRuntimeBridge.test.mjs`

- [ ] **Step 1: Add the failing bridge test**

Assert that active Markdown services call `invoke(...)` through `runtimeBridge.js` and no longer build a local `unified()` processor.

- [ ] **Step 2: Add a Rust Markdown runtime module**

Implement commands with a shape close to:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownHeadingItem {
    kind: String,
    text: String,
    level: u8,
    display_level: u8,
    offset: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownPreviewResult {
    html: String,
    headings: Vec<MarkdownHeadingItem>,
}

#[tauri::command]
async fn markdown_extract_headings(content: String) -> Result<Vec<MarkdownHeadingItem>, String> { ... }

#[tauri::command]
async fn markdown_render_preview(content: String) -> Result<MarkdownPreviewResult, String> { ... }
```

Use a Rust Markdown crate that supports GFM-like tables, task lists, footnotes, and math passthrough, and keep sanitization on the backend output contract.

- [ ] **Step 3: Replace frontend Markdown services with invoke wrappers**

`src/services/markdown/parser.js`, `src/services/markdown/outline.js`, and `src/services/markdown/preview.js` should become thin bridges that return backend results and keep only lightweight view decoration that cannot live in Rust.

- [ ] **Step 4: Keep wikilink DOM decoration as a frontend-only post-process**

The `[[wikilink]]` DOM rewrite may stay in JS because it is view-layer decoration, but it must operate on backend-rendered HTML instead of owning the full parse pipeline.

- [ ] **Step 5: Run the Markdown slice**

Run: `node --test tests/markdownRuntimeBridge.test.mjs tests/documentWorkflowRuntime.test.mjs`
Expected: PASS

- [ ] **Step 6: Run the build**

Run: `npm run build`
Expected: PASS

### Task 3: Collapse Citation Formatting To One Rust Path

**Files:**
- Modify: `src/services/references/citationStyleRegistry.js`
- Modify: `src/services/references/citationFormatter.js`
- Modify: `src/stores/references.js`
- Modify: `tests/documentWorkflowRuntime.test.mjs`

- [ ] **Step 1: Remove frontend branching that pretends citation formatting is partly a JS concern**

Keep style metadata in JS for UI labels, but route all formatting calls through the Rust commands already defined in `src-tauri/src/references_citation.rs`.

- [ ] **Step 2: Make `citationStyleRegistry.js` a frontend metadata registry only**

It should choose display names and categories, not own execution-path decisions.

- [ ] **Step 3: Ensure bibliography and inline/reference rendering all use one backend bridge**

`citationFormatter.js` should expose one consistent async API regardless of style family.

- [ ] **Step 4: Run the citation slice**

Run: `node --test tests/documentWorkflowRuntime.test.mjs`
Expected: PASS

### Task 4: Move PDF Preview Runtime Policy Behind A Backend Session Layer

**Files:**
- Create: `src-tauri/src/pdf_preview_runtime.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/services/pdf/runtimeBridge.js`
- Modify: `src/services/pdf/artifactPreview.js`
- Modify: `src/components/editor/PdfIframeSurface.vue`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Create: `tests/pdfPreviewRuntimeBridge.test.mjs`

- [ ] **Step 1: Add the failing PDF bridge test**

Assert that `PdfIframeSurface.vue` no longer owns raw artifact-loading policy and instead calls a dedicated PDF runtime bridge for preview session setup, reload, and save.

- [ ] **Step 2: Introduce a backend PDF preview runtime**

The new backend module should own:

```rust
#[tauri::command]
async fn pdf_preview_open_session(...) -> Result<PdfPreviewSession, String> { ... }

#[tauri::command]
async fn pdf_preview_reload_session(...) -> Result<PdfPreviewSession, String> { ... }

#[tauri::command]
async fn pdf_preview_save_annotations(...) -> Result<(), String> { ... }
```

This module should centralize artifact byte loading, cached session metadata, save eligibility, and SyncTeX-adjacent coordination. The frontend should remain an embedded viewer shell.

- [ ] **Step 3: Strip `PdfIframeSurface.vue` back to a viewer adapter**

Keep iframe/webview binding, theme patching, pointer events, and user interaction in the component. Move session policy, artifact retries, and data-source decisions out of the component.

- [ ] **Step 4: Run the PDF slice**

Run: `node --test tests/pdfPreviewRuntimeBridge.test.mjs tests/documentWorkflowBuildRuntime.test.mjs`
Expected: PASS

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: PASS

### Task 5: Post-Migration Cleanup And Guardrails

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DOCUMENT_WORKFLOW.md`
- Modify: `tests/repoDocsAudit.test.mjs`

- [ ] **Step 1: Remove stale comments or docs that still describe frontend-owned heavy runtime work**

- [ ] **Step 2: Document the remaining allowed frontend-heavy exceptions**

Explicitly allow only:
- DOM rendering
- CodeMirror extensions
- pdf.js rendering surface
- tiny view-layer post-processing such as wikilink decoration

- [ ] **Step 3: Run the verification set**

Run: `node --test tests/repoDocsAudit.test.mjs tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

## Non-Goals In This Plan

- Rewriting pdf.js itself in Rust
- Native PDF painting or annotation rendering in this slice
- Migrating every store to Rust just because the file is large
- Chasing GitHub language percentages without changing the actual runtime boundary

## Execution Order

1. Task 1 first, so the target boundary is explicit.
2. Task 2 next, because Markdown preview is the clearest remaining frontend-owned transform.
3. Task 3 immediately after, because the backend citation path already exists and the cleanup is low-risk.
4. Task 4 last, because PDF preview has the highest UX sensitivity and needs the most careful de-risking.

## Why This Plan Matches The Product

- It preserves the current desktop workbench UX instead of opening a redesign project.
- It makes the Tauri backend the owner of real computation and desktop-sensitive work.
- It keeps the frontend as the visible shell, which is what a Tauri app should be.
- It reduces the chance that preview, citation, or reading workflows stall the UI thread during normal use.
