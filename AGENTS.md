# Altals Agent Guide

Quick orientation for coding agents working in this repository.

## Project Summary

Altals is a Tauri v2 desktop app for research workspaces. The main product combines:

- A Vue 3 + Pinia frontend in `src/`
- A Rust backend command layer in `src-tauri/src/`
- An optional Nuxt 3 web service in `web/`

The desktop app is the primary runtime. Most filesystem, process, AI, and workspace operations go through Tauri commands rather than direct browser APIs.

## Current Documentation Reality

Older notes may refer to `docs/MAP.md` as a central registry. That file is currently not present in this repo. Use this file plus direct code inspection instead of assuming the doc map exists.

## Primary Entry Points

- Frontend bootstrap: `src/main.js`
- Desktop shell component: `src/App.vue`
- Main workspace state: `src/stores/workspace.js`
- Rust entry shim: `src-tauri/src/main.rs`
- Rust app setup and command registration: `src-tauri/src/lib.rs`

## High-Value Directories

### Frontend

- `src/components/`: UI components for layout, editor, panels, sidebar, modals
- `src/editor/`: CodeMirror and editor-side behaviors
- `src/stores/`: Pinia stores; workspace state is the main integration hub
- `src/services/`: business logic for chat, git, references, telemetry, bootstrap, auth, workspace helpers
- `src/utils/`: lower-level helpers

### Backend

- `src-tauri/src/fs_commands.rs`: file I/O, file watching, shell-facing helpers
- `src-tauri/src/git.rs`: Git operations
- `src-tauri/src/chat.rs`: AI streaming proxy
- `src-tauri/src/pty.rs`: terminal sessions
- `src-tauri/src/kernel.rs`: Jupyter kernels
- `src-tauri/src/latex.rs`: LaTeX compilation
- `src-tauri/src/typst_export.rs`: Markdown to Typst/PDF export
- `src-tauri/src/usage_db.rs`: usage tracking

### Web

- `web/`: separate Nuxt 3 app, not the main desktop runtime

## How Startup Works

1. `src-tauri/src/main.rs` launches the Rust app.
2. `src-tauri/src/lib.rs` registers Tauri commands and the custom workspace protocol.
3. `src/main.js` creates the Vue app and mounts `src/App.vue`.
4. `src/App.vue` restores UI state and opens the last workspace when applicable.
5. `src/stores/workspace.js` bootstraps workspace data, settings, watchers, instructions, and background tasks.

## Important Conventions

- Prefer reading `src/App.vue`, `src/stores/workspace.js`, and `src-tauri/src/lib.rs` before making cross-cutting changes.
- Frontend features often span both a Pinia store and one or more `src/services/` modules.
- Backend API changes usually require matching updates in both Rust command signatures and frontend `invoke()` calls.
- Workspace state is not stored only inside the project root. Some data lives in global config and derived workspace data directories.
- There are historical naming remnants of `Shoulders`, `.shoulders`, and `Altals`. Be careful with migrations, path handling, and compatibility logic.

## Known Gotchas

- SuperDoc objects should not be stored in Vue reactive wrappers that break private fields. Use `shallowRef` and `markRaw` where needed.
- When a Rust command expects a struct like `request: MyStruct`, the JS side must pass `{ request: { ... } }`, not flattened args.
- Avoid full-document editor swaps when position tracking matters; use minimal diff logic where the editor system expects it.
- Right-panel popovers can be clipped by layout overflow; use `Teleport` and fixed positioning when necessary.
- Do not assume all old documentation comments are current; verify against code.

## Common Commands

```bash
bun install
npx tauri dev
npx tauri build
bun run build
cargo build --manifest-path src-tauri/Cargo.toml
```

## Recommended Reading Order

For general orientation:

1. `src/App.vue`
2. `src/stores/workspace.js`
3. `src/services/workspaceBootstrap.js`
4. `src/services/systemPrompt.js`
5. `src-tauri/src/lib.rs`

Then branch by subsystem:

- Editor: `src/editor/`, `src/components/editor/`
- AI/chat: `src/stores/chat.js`, `src/services/chatTransport.js`, `src/services/chatTools.js`, `src/services/aiSdk.js`
- Git/sync: `src/services/git.js`, `src/services/githubSync.js`, `src-tauri/src/git.rs`
- Notebooks: `src/stores/kernel.js`, `src-tauri/src/kernel.rs`

## Editing Guidance

- Make small, surgical changes unless a broader refactor is clearly required.
- Check for existing service/store boundaries before introducing new abstractions.
- Preserve historical compatibility paths unless the task explicitly removes them.
- Verify behavior end-to-end when changing startup, workspace bootstrap, editor flows, or Rust command wiring.
