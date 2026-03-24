# Architecture

## Purpose

This document records the current repository architecture of Altals.

It describes the current system truthfully. It does not present the target architecture as if it has already landed.

## Current Top-Level Shape

The repository currently has these major layers:

- `src/app`
- `src/domains/*`
- `src/services/*`
- `src/stores/*`
- `src/components/*`
- `src/composables/*`
- `src-tauri/src/*`

The frontend already has meaningful runtime/domain seams.
The backend is still comparatively flat.
The execution/notebook stack is real, but it is not yet expressed as one dedicated frontend domain.

## Frontend Layers

### `src/app`

This layer now carries app-facing orchestration close to the shell, including:

- workspace lifecycle
- shell event bridges
- teardown handling
- footer/status coordination
- snapshot prompt and workspace-history entry actions
- persistent shell navigation composition for project/library/AI surface selection
- surface-aware left-sidebar hosting so each primary surface can own its own shell-level secondary panels without pushing more orchestration back into `App.vue`
- surface-aware right-inspector hosting so the workspace surface owns `Outline` / `Backlinks`, the library surface owns a shell-level `Details` inspector, and the AI surface intentionally has no always-on right inspector yet
- shell-level resize orchestration that keeps sidebars mounted across open/close toggles, batches drag-time width updates to animation frames, and exposes explicit resizing state to the header/sidebar chrome

This layer is thinner than the old `App.vue`-centric shape, but it is still not a full operation layer.

### `src/domains`

`src/domains/*` is the strongest current architecture direction.

The most established runtime seams today are:

- `src/domains/document/*`
- `src/domains/changes/*`
- `src/domains/files/*`
- `src/domains/reference/*`
- `src/domains/chat/*`
- `src/domains/terminal/*`
- `src/domains/workspace/*`
- `src/domains/editor/*`
- `src/domains/git/*`

These modules carry much of the workflow/runtime logic that previously lived inside large stores and UI glue.

### `src/services`

`src/services/*` still owns many effectful helpers and provider-specific integrations, especially:

- AI launch/session wiring
- document workflow adapters
- LaTeX / Typst helpers
- notebook/document serialization helpers
- terminal and process helpers
- provider-specific PDF translation option shaping and serialization

This layer is still broader and flatter than the target architecture.

### `src/stores`

Stores are increasingly migration shells plus UI state holders.

They are still important, but they are no longer the only architecture boundary.

Current remaining large store-heavy bottlenecks include:

- `src/stores/latex.js`
- `src/stores/references.js`
- `src/stores/editor.js`
- `src/stores/workspace.js`
- `src/stores/pdfTranslate.js`

`src/domains/document/pdfTranslateRuntime.js` now owns PDF translation settings normalization, request shaping, requested-output selection, glossary extraction policy, advanced translation/PDF extra shaping, and the user-facing formula-dense auto-enhancement toggle above the store shell. `src/services/pdfTranslateProviderOptions.js` now owns provider-specific PDF translation tuning schema plus serialization for model settings. The settings surfaces (`src/components/settings/SettingsPdfTranslate.vue` and `src/components/settings/SettingsModels.vue`) now expose those runtime/provider knobs while the Rust/Python backend remains a filtered pass-through into `pdf2zh_next`; `scripts/pdf_translate_formula_guard.py` now holds the retry heuristics/profile merge for formula-heavy pages so `translate_stream.py` does not become a pure inline policy blob, but `src/stores/pdfTranslate.js` and `src/components/editor/PdfViewer.vue` remain the larger workflow bottlenecks around that slice.

### `src/components` and `src/composables`

UI code still carries significant glue and several large surfaces, especially:

- `src/components/editor/PdfViewer.vue`
- `src/components/library/GlobalLibraryWorkbench.vue`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/NotebookEditor.vue`

The risk here is no longer only visual complexity.
The risk is workflow logic drifting back into giant Vue files or heavy composables.

## Strongest Landed Seams

### Document Loop

The clearest current operation-like seams are in:

- `src/domains/document/documentWorkflowRuntime.js`
- `src/domains/document/documentWorkflowBuildRuntime.js`
- `src/domains/document/documentWorkflowBuildOperationRuntime.js`
- `src/domains/document/documentWorkflowTypstPaneRuntime.js`
- `src/domains/document/documentWorkflowActionRuntime.js`
- `src/domains/document/documentWorkflowAiRuntime.js`

`src/stores/documentWorkflow.js` is now primarily a migration shell over those runtimes.

### Change / Snapshot / History

The clearest safety-model architecture is in `src/domains/changes/*`, including:

- explicit history availability, preparation, message, commit, and history-point intent
- snapshot record, metadata, and manifest layers
- local workspace save-point index and payload layers
- workspace preview/diff/apply/delete behavior
- file version history runtime kept separate from workspace save-point restore

### Files / References / Terminal / Chat

These areas now have real extracted runtime seams, even if the stores are not yet minimal:

- files tree/content/mutation runtimes
- reference library/load/migration/mutation/asset runtimes
- terminal lifecycle/execution/hydration/log/session runtimes
- chat persistence/session/message/title/runtime-config/live-instance runtimes

## Execution / Notebook Status

The computation stack currently spans multiple layers:

- `src/components/editor/NotebookEditor.vue`
- `src/stores/kernel.js`
- `src/stores/environment.js`
- `src/services/chunkKernelBridge.js`
- `src/services/notebookDocument.js`
- `src-tauri/src/kernel.rs`

This already provides:

- Jupyter kernelspec discovery
- Python / R / Julia kernel support
- notebook cell execution
- chunk execution from text/code editing surfaces
- environment detection and kernel installation prompts

What is still missing is one explicit `execution` or `notebook` domain boundary that unifies those flows.

## Backend Shape

The Rust/Tauri backend is still comparatively flat.

Current major modules live directly under `src-tauri/src/`, including:

- `fs_commands.rs`
- `git.rs`
- `kernel.rs`
- `latex.rs`
- `pdf_translate.rs`
- `pty.rs`
- `typst_export.rs`
- `workspace_access.rs`

`src-tauri/src/lib.rs` still wires many commands directly from this flat module layout.

The backend has not yet been migrated into the target `commands/core/services/models/errors` layering.

## Current Architecture Direction

The current practical direction is:

- app hooks choose top-level shell actions
- domain runtimes own the best current workflow seams
- services provide effectful adapters
- stores bridge reactive state into those runtimes
- components/composables render UI and invoke thin bridges
- the backend still needs the first real layering pass

## Current Risks

The biggest current architecture risks are:

- the backend is still flat while frontend seams multiply
- notebook/kernel logic is spread across component, store, service, and Rust layers
- some large components remain highly coupled
- AI launch entry points are still distributed
- docs can drift if architecture changes land without doc updates
