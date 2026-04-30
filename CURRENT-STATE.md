# ScribeFlow Current State

Last updated: 2026-04-30

## Product

ScribeFlow is a local-first Tauri desktop workbench for academic writing and research.

Current desktop paths:

- open, close and reopen local workspaces
- browse and mutate the workspace file tree
- restore editor tabs, document dock tabs and recent files
- edit Markdown, LaTeX and Python documents
- preview Markdown, compile LaTeX, inspect PDF output and run Python
- manage references from BibTeX, PDF metadata and Zotero
- insert Markdown and LaTeX citations
- sync selected document references into LaTeX bibliography files
- inspect where references are cited in the workspace
- configure editor, workspace, PDF, citation, environment, Zotero, extensions and update settings
- discover local extension packages, enable or disable them, configure contributed settings and run contributed commands from menus, command palette and manifest keybindings
- render extension-contributed sidebar containers in the workspace mode menu, resolve hierarchical sidebar view items from the extension host, surface title/item actions from extension menu contributions, and auto-refresh view data after extension command execution

## Architecture

- `src/app`: desktop lifecycle and shell orchestration
- `src/components`: Vue UI surfaces
- `src/composables`: UI composition and interaction helpers
- `src/domains`: frontend pure rules and state transitions
- `src/services`: Tauri bridge and side-effect boundary
- `src/stores`: Pinia coordination state
- `src-tauri/src`: Rust runtime authority for filesystem, workspace access, sessions, preferences, references, LaTeX, Python, extensions and updates

Boundary rules:

- Vue components, stores, domains and composables do not import Tauri APIs directly.
- Tauri `invoke`, Tauri plugin calls and event bridges belong in `src/services`.
- Rust owns filesystem authority, persisted app state, reference normalization, compile/runtime execution and workspace-scoped security checks.
- Rust owns extension discovery, manifest validation, extension host startup, command execution, task state and artifact access.
- Vue owns extension command palette, contributed menu rendering, contributed keybinding dispatch, extension sidebar container rendering, extension view item rendering and shared extension `when` context evaluation through the `src/services` bridge.
- JS remains a thin bridge and UI coordination layer, not a second backend.

## Verification

Use one local engineering gate:

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

Current baseline:

- UI bridge guard passes
- PDF runtime boundary guard passes
- TextMate runtime boundary guard passes
- Vite build passes
- bundle budget passes
- Rust check passes
- Rust tests pass: 147 tests

Desktop feel, visual layout and interaction quality are user-owned manual checks.

## Runtime Contracts

Heavy runtime boundaries:

- PDFium / EmbedPDF stays behind PDF preview surfaces and `src/services/pdf/*`.
- TextMate / Oniguruma stays behind the LaTeX editor dynamic import path.
- Ordinary JS chunks stay below the bundle budget enforced by `scripts/check-bundle-budget.mjs`.

State contracts:

- workspace lifecycle state is stored under the global ScribeFlow config directory
- workspace-specific state is stored under the resolved workspace data directory
- reference library state is stored under global ScribeFlow references data
- old localStorage and old per-workspace migration paths are no longer part of the runtime contract

## Current Scope

Completed engineering scope:

- research-to-writing reference loop
- citation insertion and usage inspection
- leaf Rustification for read-only parsing, diagnostics, path status and resolver seams
- bundle size and heavy runtime loading guards
- cleanup of historical migration code
- rewritten current documentation and README

Not in scope:

- restoring removed `docs/` or `web/` trees
- reintroducing historical sidecar scripts
- adding automated desktop smoke, visual review or interaction QA
- continuing Rustification into editor shell, shared workflow or UI-local parser code without a new phase decision
