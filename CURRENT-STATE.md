# ScribeFlow Current State

Last updated: 2026-04-29

## Product Position

ScribeFlow is a local-first Tauri desktop workbench for academic writing and research.

The current product surface is no longer a demo. It already has these main paths:

- workspace open / close / recent workspace lifecycle
- file tree browsing, file mutation, editor session restore
- Markdown, LaTeX, Python editing workflows
- Markdown preview, LaTeX compile / PDF preview, Python terminal output
- reference library, BibTeX / PDF import, citation formatting, Zotero sync
- settings for editor, environment, Zotero, updates and general preferences

## Current Architecture

- `src/app`: app shell orchestration and workspace lifecycle wiring
- `src/components`: Vue UI surfaces
- `src/composables`: UI composition helpers
- `src/domains`: frontend pure rules and state transition helpers
- `src/services`: side-effect and Tauri bridge layer
- `src/stores`: Pinia coordination state
- `src-tauri/src`: Rust runtime authority for filesystem, workflow, references, Python, LaTeX, preferences and workspace access

Current boundary rule: Vue UI layers should not import Tauri APIs directly. Tauri API and plugin usage belongs in `src/services`.

## Verification Contract

The standard local gate is:

```sh
npm run verify
```

It runs:

- `npm run guard:ui-bridges`
- `npm run guard:pdf-runtime`
- `npm run guard:textmate-runtime`
- `npm run build`
- `npm run check:bundle`
- `npm run check:rust`
- `npm run test:rust`

Current baseline on 2026-04-29:

- UI bridge boundary check passed
- PDF runtime boundary check passed
- TextMate runtime boundary check passed
- Vite build passed
- Bundle budget check passed
- Rust check passed
- Rust tests passed: 128 tests

Desktop main-path feel, visual quality, layout behavior and interaction quality are intentionally user-owned manual checks. Do not propose automating them again.

## Accepted Next Phases

### Phase 1: Verification and State Contract

Status: completed.

Goal:

- keep one stable `npm run verify` entrypoint
- keep this file as the living product / architecture / debt map
- avoid reintroducing removed historical repo shells

Done:

- restored a single local verification contract through `npm run verify`
- recorded the current product and architecture state in this file
- wrote the user decision that desktop / visual / interaction automation is out of scope

### Phase 2: Research-to-Writing Loop

Status: in progress.

Goal:

Turn the existing reference, PDF, citation, Markdown and LaTeX capabilities into one coherent academic writing loop:

- import from PDF / BibTeX / Zotero
- normalize metadata and keep local edits safe
- attach and read PDFs / extracted full text
- insert citations from Markdown and LaTeX
- write or update `.bib`
- compile LaTeX and inspect citation-related problems
- show where a reference is cited inside the workspace

Primary areas:

- `src/stores/references.js`
- `src/components/references/*`
- `src/components/editor/CitationPalette.vue`
- `src/services/references/*`
- `src-tauri/src/references_*`
- `src-tauri/src/latex_*`

First seam:

- LaTeX compile syncs the current ScribeFlow reference library to `references.bib` beside the resolved compile target.
- Existing manually maintained `references.bib` files are not overwritten unless they already contain the ScribeFlow auto-generated marker.
- When the compile target already declares `\bibliography{...}`, ScribeFlow writes the selected document reference pool to that declared `.bib` file instead of forcing `references.bib`.
- LaTeX Problems now warn when a cited key exists in the global reference library but has not been added to the current document reference pool, so the generated `.bib` will not silently omit it.
- LaTeX `.bib` sync now runs inside `latexStore.compile()`, so manual compile, auto build and runtime-request compile share the same compile-target reference pool instead of only syncing through the document workflow adapter.
- LaTeX citation hover and autocomplete now keep using the resolved root-file reference scope while editing subfiles, and citation hover renders imported reference metadata as DOM text instead of interpolated HTML.
- BibLaTeX `\addbibresource{...}` declarations now use the same selected document reference pool and manual-file overwrite guard as BibTeX `\bibliography{...}` declarations.

### Phase 3: Leaf Rustification

Status: in progress.

Goal:

Continue moving leaf capabilities to Rust without changing frontend-visible contracts.

Allowed first candidates:

- read-only parsing
- diagnostics
- autocomplete data sources
- preview target resolution
- file metadata / path status
- citation style scan

Done:

- citation style scan is already backed by Rust runtime command `references_scan_workspace_styles`.
- document reference panel now reads LaTeX citation keys from the Rust LaTeX project graph instead of using a frontend regex parser.
- the old frontend-only LaTeX citation key extractor has been removed from the editor citation module.
- an unused exported Markdown citation-group parser was removed from drag/drop text insertion helpers.
- Markdown draft diagnostics now have a staged Rust runtime command `markdown_extract_diagnostics` with parity-focused tests and a thin frontend bridge.
- Markdown workflow diagnostics now use a reactive Rust diagnostics cache, with the old frontend parser retained only as a synchronous first-render fallback.
- The Markdown diagnostics first-render fallback no longer imports the old unified / remark AST parser chain; it now uses a lightweight line scanner while the Rust runtime remains the main diagnostics path.
- The unused frontend Markdown draft AST parser wrapper was removed; `parser.js` now only exposes Rust-backed heading helpers, and the unified / remark stack remains owned by Markdown preview.
- The document dock Problems page now surfaces draft / project diagnostics instead of only compile-origin diagnostics.
- LaTeX SyncTeX target path resolution now goes through Rust command `latex_sync_target_resolve`, with the previous frontend resolver kept as fallback.
- LaTeX SyncTeX artifact discovery now goes through Rust command `latex_existing_synctex_resolve`, with the previous frontend candidate probe kept as fallback.

Current seam:

- preview target resolution for LaTeX SyncTeX artifacts and read-only Markdown diagnostics runtime extraction.

Frozen by default:

- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/PaneContainer.vue`
- `src/App.vue`
- `src/stores/documentWorkflow.js`

Do not migrate shared workflow, editor shell, session persistence and UI chrome in the same phase.

### Phase 4: Bundle Size and Chunk Hygiene

Status: completed.

Goal:

Reduce oversized frontend chunks without changing product behavior.

Known signal:

- the PDFium worker chunk is an upstream EmbedPDF worker bundle and is explicitly budgeted at 750 KiB
- ordinary JS chunks keep the stricter 500 KiB budget through `npm run check:bundle`
- likely pressure points include PDF, CodeMirror language support, KaTeX and TextMate assets

Preferred approach:

- inspect build output first
- split heavy optional viewers and language assets only where the user path benefits
- do not add broad build complexity for cosmetic chunk reshuffling

Done:

- added `npm run check:bundle` as a post-build budget guard for JS, CSS and WASM assets
- raised Vite's generic chunk warning limit to 750 KiB so the known PDF worker does not hide actionable regressions behind repeated generic warnings
- removed the redundant dynamic import of CodeMirror autocomplete from `TextEditor.vue`; build output no longer reports the autocomplete static/dynamic import warning
- replaced Markdown preview's generic `rehype-highlight` dependency with a constrained local highlighter that registers only common writing / coding languages; the preview chunk dropped from about 366 KiB to about 265 KiB while preserving code highlighting for the supported language set
- continued in Phase 5 with named heavy runtime budgets, PDF / TextMate runtime boundary guards, and deferred generic language-data loading for LaTeX editor paths

### Phase 5: Heavy Runtime Loading Contract

Status: completed.

Goal:

Make the remaining heavy runtime assets explicit, lazy and budgeted without weakening the desktop writing path:

- PDFium / EmbedPDF stays loaded only for PDF preview surfaces
- TextMate / Oniguruma stays loaded only for LaTeX editing surfaces
- CodeMirror language-data stays loaded only for editor language resolution
- heavyweight assets keep named budgets and cannot drift silently
- product behavior stays the same for Markdown, LaTeX, Python, PDF preview and citation workflows

Why this is a separate phase:

- the remaining large assets are real runtime capabilities, not leftover dead code
- moving them changes load timing and error boundaries, so it needs a contract before implementation
- the user-owned desktop / visual / interaction checks stay manual and are not part of this phase automation

Current baseline:

- `pdfium-*.wasm`: about 4518 KiB / 5120 KiB budget
- `worker-engine-*.js`: about 683 KiB / 750 KiB budget
- `onig-*.wasm`: about 462 KiB / 512 KiB budget
- largest ordinary app JS chunk: about 330 KiB / 500 KiB budget
- `preview-*.js`: about 265 KiB after the constrained Markdown highlighter change

Final verified bundle readings:

- `pdfium-Dpd2ZUYs.wasm`: 4518.33 KiB / 5120.00 KiB budget
- `worker-engine-B_bbnxZw.js`: 682.73 KiB / 750.00 KiB budget
- `onig-CwjCXqnP.wasm`: 462.06 KiB / 512.00 KiB budget
- largest ordinary app JS chunk `index-Jxbfzmm9.js`: 330.37 KiB / 500.00 KiB budget
- `preview-BlIFeQX_.js`: 264.78 KiB / 500.00 KiB budget

Primary areas:

- `scripts/check-bundle-budget.mjs`
- `vite.config.js`
- `src/components/editor/PdfArtifactPreview.vue`
- `src/components/editor/PdfEmbedSurface.vue`
- `src/components/editor/PdfEmbedDocumentSurface.vue`
- `src/services/pdf/embedPdfAdapter.js`
- `src/components/editor/TextEditor.vue`
- `src/editor/latexLanguage.js`

Phase steps:

1. Budget Manifest and Drift Reporting
   - Move hard-coded asset budget rules into a small named manifest inside `scripts/check-bundle-budget.mjs` or an adjacent JSON module.
   - Keep current budgets for known heavy assets instead of raising limits.
   - Add output that distinguishes ordinary chunks, upstream PDF worker, PDFium WASM and Oniguruma WASM.
   - Do not fail on hash changes; fail on size and unknown oversized asset classes.

2. PDF Runtime Boundary Audit
   - Confirm `@embedpdf/*` and `pdfium-*.wasm` enter only through PDF preview components and `src/services/pdf/*`.
   - If any PDF dependency leaks into app shell, editor shell or non-PDF surfaces, move it behind existing async component / service boundaries.
   - Keep PDF search, thumbnails, selection, export, SyncTeX forward/backward sync and view-state restore in scope.
   - Do not replace EmbedPDF or remove PDF features in this phase.

3. TextMate Runtime Boundary Audit
   - Confirm `vscode-textmate`, `vscode-oniguruma`, TextMate grammars and theme JSON files enter only through `src/editor/latexLanguage.js`.
   - Preserve current LaTeX highlighting and citation/autocomplete behavior.
   - If possible, split theme parsing or runtime creation so non-LaTeX editors do not pay additional initialization cost.
   - Do not migrate LaTeX highlighting to a different engine in this phase.

4. CodeMirror Language Resolution Review
   - Review `TextEditor.vue` language loading so Markdown, LaTeX and generic code paths do not load broader language-data earlier than needed.
   - Preserve Markdown fenced-code support and generic file highlighting.
   - Any change must keep editor setup contract stable and avoid touching shared editor shell behavior beyond the language-loading seam.

5. Verification and Documentation
   - Run `npm run verify`.
   - Record before/after top bundle assets in this file.
   - Commit as one or more small commits by seam: budget manifest, PDF boundary, TextMate boundary, language resolution.

Acceptance criteria:

- `npm run verify` passes.
- `npm run check:bundle` reports the same named heavy asset classes and no ordinary JS chunk above 500 KiB.
- Markdown files still use Markdown language support.
- LaTeX files still load TextMate highlighting and LaTeX autocomplete.
- Python / generic code files still receive language support where CodeMirror can resolve it.
- PDF preview still opens through the existing PDF surface and keeps search / selection / thumbnails / SyncTeX paths in code.
- No desktop, visual, layout or interaction automation is added.

Done:

- Step 1 completed: `scripts/check-bundle-budget.mjs` now uses a named asset budget manifest, reports known heavy runtime assets separately from ordinary checked assets, and fails on oversized unknown asset classes instead of silently accepting new large files.
- Step 2 completed: `scripts/check-pdf-runtime-boundary.mjs` now guards `@embedpdf/*`, `usePdfiumEngine`, and the PDF preview component import chain so PDFium / EmbedPDF stay behind async PDF preview surfaces and `src/services/pdf/*`.
- Step 3 completed: `scripts/check-textmate-runtime-boundary.mjs` now guards `vscode-textmate`, `vscode-oniguruma`, `onig.wasm`, TextMate grammar/theme imports, and static `latexLanguage` imports so TextMate stays behind the LaTeX editor dynamic import seam.
- Step 4 completed: `TextEditor.vue` now resolves the LaTeX language path before importing `@codemirror/language-data`, while Markdown still loads language-data for fenced-code support and generic code files still use CodeMirror language-data matching.
- Step 5 completed: `npm run verify` passes with `guard:ui-bridges`, `guard:pdf-runtime`, `guard:textmate-runtime`, Vite build, bundle budget check, Rust check, and Rust tests.

Non-goals:

- no replacement of EmbedPDF / PDFium
- no removal of PDF search, thumbnails, selection or SyncTeX
- no replacement of TextMate highlighting
- no broad editor shell rewrite
- no broad Vite manual chunk map unless a measured leak requires it

## Explicit Non-Goals

- no automated desktop main-path smoke phase
- no automated visual review phase
- no automated layout / interaction QA phase
- no recommendation to replace user manual inspection for those areas

Bundle size work remains in scope because it is a quantifiable build and performance concern.
