# ScribeFlow

ScribeFlow is a local-first Tauri desktop workbench for academic writing and research.

It combines a Vue frontend with a Rust runtime for workspace files, editor state, Markdown / LaTeX / Python workflows, reference management, PDF assets and Zotero sync.

## Features

- Open and manage local workspaces
- Browse, create, rename, move, duplicate and delete workspace files
- Edit Markdown, LaTeX and Python documents
- Preview Markdown
- Compile LaTeX and inspect PDF output
- Run Python through the configured runtime
- Import references from BibTeX, PDF metadata and Zotero
- Attach PDFs and extracted full text to references
- Insert citations into Markdown and LaTeX
- Sync selected document references into LaTeX bibliography files
- Inspect where references are cited in the workspace
- Configure editor, workspace, PDF, citation, environment, Zotero, extensions and update settings
- Discover local plugin packages, enable and configure them in Settings
- Use plugin-owned right sidebar tabs from the active document or PDF workflow
- Render plugin-owned sidebar tree views, task summaries and prompt surfaces through the plugin host

## Requirements

- Node.js 22
- npm
- Rust stable
- Tauri system requirements for the target platform

Optional runtime tools:

- LaTeX distribution or Tectonic for LaTeX compile paths
- Python interpreter for Python run paths
- Zotero API key for Zotero sync

## Install

```sh
npm ci
```

## Development

Run the frontend dev server:

```sh
npm run dev
```

Run the Tauri desktop app:

```sh
npm run tauri dev
```

`npm run tauri dev` uses the normal ScribeFlow data root at `$HOME/.scribeflow`.
For development smoke checks that must not restore or mutate the real desktop
state, run the isolated dev profile instead:

```sh
npm run tauri:dev:isolated
```

This sets `SCRIBEFLOW_DATA_ROOT=/private/tmp/scribeflow-tauri-dev` for the Tauri
process. You can set `SCRIBEFLOW_DATA_ROOT` to another absolute path when a
different disposable data root is needed.

Build frontend assets:

```sh
npm run build
```

## Verification

Use the standard local gate before claiming a change is ready:

```sh
npm run verify
```

This runs bridge guards, runtime boundary guards, Vite build, bundle budget check, Rust check and Rust tests.

Individual checks:

```sh
npm run verify:quick
npm run verify:extensions
npm run verify:build
npm run verify:rust
npm run guard:ui-bridges
npm run guard:js-layer-boundaries
npm run guard:pdf-runtime
npm run guard:textmate-runtime
npm run check:bundle
npm run check:rust
npm run test:rust
```

## Architecture

- `src/app`: desktop lifecycle and shell orchestration
- `src/components`: Vue UI surfaces
- `src/composables`: UI interaction helpers
- `src/domains`: pure frontend rules and state transitions
- `src/services`: Tauri bridge and side-effect boundary
- `src/stores`: Pinia coordination state
- `src-tauri/src`: Rust runtime authority

Frontend layers should not import Tauri APIs directly. Tauri `invoke`, Tauri plugin access and native event bridges belong in `src/services`.

Layer contract:

| Layer | Responsibility |
| --- | --- |
| Vue UI | render surfaces, emit user intent, show loading/error/empty states |
| JS bridge | wrap Tauri commands, plugins, native events and DTO compatibility in `src/services` |
| Pinia coordination | coordinate screen state and service calls in `src/stores` |
| JS domains | keep pure presentation rules, labels, sorting and deterministic state derivation in `src/domains` |
| Rust runtime | own filesystem, workspace state, references, runtime execution, persistence, plugins and security in `src-tauri/src` |

Boundary examples:

- Allowed: a reference detail component edits a local draft and asks the references store to save it; the store calls a service; Rust validates, normalizes and persists the record.
- Disallowed: a Vue component or service performs reference merge policy that should be Rust-owned.
- Allowed: a service maps frontend camelCase DTOs to a stable Rust command payload.
- Disallowed: a store validates workspace path authority or executes runtime work that should be Rust-owned.

Command payload changes must update the Rust command, JS bridge, store call sites and regression verification together.

Editor core is frozen during global module reorganization. Do not edit `src/editor/**`, the core editor Vue surfaces, `src/stores/editor.js`, `src/services/editorPersistence.js` or `src-tauri/src/editor_session_runtime.rs` unless a separate editor-specific phase is approved.

See `ARCHITECTURE-BOUNDARY-MAP.md` for the current boundary inventory and known cleanup debt.

## Release

The repository includes `.github/workflows/release-installers.yml` for desktop installer builds.

Version consistency is checked by:

```sh
npm run release:check-version
```

Version bumps use:

```sh
npm run version:bump
```

## Current State

See `CURRENT-STATE.md` for the current product state, architecture boundaries and verification baseline.

## Plugin Architecture

See:

- `Plugin.md` for the current platform implementation
- `PLUGIN-ARCHITECTURE.md` for the final plugin architecture direction
