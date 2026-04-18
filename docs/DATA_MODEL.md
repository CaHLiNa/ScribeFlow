# Data Model

## Frontend state

- `src/stores/workspace.js`
  Workspace open/close state, active surfaces, sidebar state, and shell-level workspace coordination.
- `src/stores/editor.js`
  Pane tree, open tabs, active documents, dirty state, and editor interactions.
- `src/stores/documentWorkflow.js`
  Preview, compile, diagnostics, and workflow capability state.
- `src/stores/references.js`
  Reference library, filters, selection, import, and citation-related state.
- `src/stores/ai.js`
  Frontend AI panel state and Rust-runtime integration state.

## Backend/runtime seams

- `src-tauri/src/codex_runtime/*`
  Runtime threads, turns, items, approvals, events, persistence, and tool protocol types.
- `src-tauri/src/document_workflow.rs`
  Desktop document workflow command surface.
- `src-tauri/src/references_*`
  Reference import, citation, PDF, Zotero, and library runtime data exchange.

## Rule

Prefer evolving existing store and runtime schemas in place over introducing parallel shadow models.
