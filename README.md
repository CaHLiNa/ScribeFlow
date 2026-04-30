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
- Discover local extension packages, configure them and run contributed menu, palette and keybinding commands with shared `when` context

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
npm run guard:ui-bridges
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
