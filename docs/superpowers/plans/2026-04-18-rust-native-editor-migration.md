# Altals Rust-Native Editor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Altals' current WebView-hosted CodeMirror editor with a Rust-native editor core that can eventually deliver Zed-class input latency, scrolling behavior, multi-cursor semantics, and native text rendering without breaking Altals' document workflow, preview, citation, and LaTeX integration.

**Architecture:** Do not attempt to embed a foreign native editor view inside the current Vue pane tree. Instead, introduce a Rust-native editor subsystem in two layers: `altals-editor-core` for buffer, selection, viewport, transaction, and syntax-facing runtime; and `altals-native-editor-app` as a separate native helper process that owns the experimental editor window and communicates with the Tauri shell through a typed bridge. Keep the existing Vue/Tauri workbench alive during migration, extract editor-agnostic contracts first, run the native editor in shadow mode, then cut over by feature flag once document workflows and sync loops are stable.

**Tech Stack:** Tauri 2, Vue 3.5, Pinia, Rust 2021, native helper process IPC, Markdown/LaTeX workflow adapters

---

## Decision Summary

### Chosen route

- Build an Altals-owned Rust-native editor stack that takes design cues from Zed's editor core.
- Keep the current Tauri/Vue workbench as the shell during the migration.
- Run the native editor first as a separate helper process and native window, not as a WebView child.
- Extract editor-independent workflow contracts before replacing any user-facing editing path.

### Explicitly rejected

- Embedding a native editor directly inside the current WebView pane.
- Treating this as a CodeMirror replacement only.
- Rewriting the entire Altals workbench into Rust native UI before the editor core proves itself.
- Porting Zed wholesale into Altals as an opaque dependency.

### Success criteria

- Typing, scrolling, selection, and multi-cursor behavior come from Rust-native runtime, not CodeMirror.
- Markdown and LaTeX documents still participate in outline, preview sync, diagnostics, citation insertion, and save flows.
- Experimental mode can be enabled per workspace or app setting without destabilizing the default editor.
- A cutover checklist exists and CodeMirror removal happens only after parity gates pass.

---

## File Map

### Create

- `src-tauri/crates/altals-editor-core/Cargo.toml`
- `src-tauri/crates/altals-editor-core/src/lib.rs`
- `src-tauri/crates/altals-native-editor-app/Cargo.toml`
- `src-tauri/crates/altals-native-editor-app/src/main.rs`
- `src-tauri/src/native_editor_runtime.rs`
- `src-tauri/src/native_editor_bridge.rs`
- `src/domains/editor/editorRuntimeContract.js`
- `src/services/editorRuntime/nativeBridge.js`
- `src/stores/editorRuntime.js`
- `src/components/editor/NativeEditorSurface.vue`

### Modify

- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/TextEditor.vue`
- `src/stores/editor.js`
- `src/components/panel/OutlinePanel.vue`
- `src/services/markdown/previewSync.js`
- `src/services/latex/previewSync.js`
- `src/services/documentWorkflow/adapters/markdown.js`
- `src/services/documentWorkflow/adapters/latex.js`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`

### Remove later, not in the first migration slice

- `src/editor/*` CodeMirror-specific extensions
- `src/components/editor/TextEditor.vue`
- direct CodeMirror assumptions inside outline, preview sync, and context menu code

---

## Task 1: Extract the Editor Runtime Contract

**Files:**
- Create: `src/domains/editor/editorRuntimeContract.js`
- Create: `src/stores/editorRuntime.js`
- Modify: `src/components/editor/TextEditor.vue`
- Modify: `src/components/editor/EditorPane.vue`
- Modify: `src/stores/editor.js`
- Modify: `src/components/panel/OutlinePanel.vue`
- Modify: `src/services/markdown/previewSync.js`
- Modify: `src/services/latex/previewSync.js`

- [ ] **Step 1: Introduce a runtime-mode store**

Create a small store that makes editor runtime an explicit shell concern instead of a hidden component decision.

```js
// src/stores/editorRuntime.js
import { defineStore } from 'pinia'

export const EDITOR_RUNTIME_MODES = Object.freeze({
  WEB: 'web',
  NATIVE_EXPERIMENTAL: 'native-experimental',
})

export const useEditorRuntimeStore = defineStore('editorRuntime', {
  state: () => ({
    mode: EDITOR_RUNTIME_MODES.WEB,
    shadowMode: false,
    lastNativeSessionId: null,
  }),
})
```

- [ ] **Step 2: Define the editor runtime contract**

Create a contract file that describes the capabilities Altals expects from any editor runtime.

```js
// src/domains/editor/editorRuntimeContract.js
export function createEditorRuntimeContract(runtime) {
  return {
    openDocument: runtime.openDocument,
    closeDocument: runtime.closeDocument,
    applyExternalContent: runtime.applyExternalContent,
    persistActiveDocument: runtime.persistActiveDocument,
    revealOffset: runtime.revealOffset,
    requestSelection: runtime.requestSelection,
    setDiagnostics: runtime.setDiagnostics,
    setOutlineContext: runtime.setOutlineContext,
    dispose: runtime.dispose,
  }
}
```

- [ ] **Step 3: Refactor current CodeMirror path to implement the contract**

Do not change behavior yet. Wrap the current `TextEditor.vue` behavior behind the new contract so outline, preview sync, save, and selection consumers stop depending on CodeMirror types directly.

- [ ] **Step 4: Add shadow-mode telemetry hooks**

Emit normalized events for:

- document open and close
- content changes
- cursor move
- selection change
- reveal line and reveal offset
- diagnostics update
- markdown and LaTeX preview sync requests

The purpose is to collect the exact event surface the Rust runtime must satisfy before user-visible cutover.

- [ ] **Step 5: Run the frontend verification slice**

Run:

```bash
npm run build
```

Expected: the Vue shell still builds with the new runtime contract in place and default mode remains `web`.

---

## Task 2: Scaffold the Rust Editor Core

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/crates/altals-editor-core/Cargo.toml`
- Create: `src-tauri/crates/altals-editor-core/src/lib.rs`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add a Rust workspace entry**

Extend the existing `src-tauri/Cargo.toml` so the desktop package remains the root package but also owns a workspace for editor crates.

```toml
[workspace]
members = [
  ".",
  "crates/altals-editor-core",
  "crates/altals-native-editor-app",
]
resolver = "2"
```

- [ ] **Step 2: Create the editor-core crate**

Start with a backend-agnostic crate. It must not depend on Tauri, WebView, or Vue assumptions.

```toml
# src-tauri/crates/altals-editor-core/Cargo.toml
[package]
name = "altals-editor-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 3: Define the initial core data model**

Seed the crate with explicit types for buffer, selection, transaction, and viewport state.

```rust
// src-tauri/crates/altals-editor-core/src/lib.rs
pub struct EditorSessionId(pub String);

pub struct DocumentBuffer {
    pub path: String,
    pub text: String,
}

pub struct CursorPosition {
    pub offset: usize,
    pub line: u32,
    pub column: u32,
}

pub struct SelectionRange {
    pub anchor: usize,
    pub head: usize,
}
```

- [ ] **Step 4: Write core tests before adding rendering**

Add tests for:

- open and replace document content
- single cursor edits
- multi-selection transaction application
- line and column mapping
- soft-wrap-independent offset reveal math

- [ ] **Step 5: Run the Rust unit-test gate**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p altals-editor-core
```

Expected: the new crate builds and its basic state-model tests pass without invoking the desktop shell.

---

## Task 3: Build the Native Editor Host as a Separate Helper Process

**Files:**
- Create: `src-tauri/crates/altals-native-editor-app/Cargo.toml`
- Create: `src-tauri/crates/altals-native-editor-app/src/main.rs`
- Create: `src-tauri/src/native_editor_runtime.rs`
- Create: `src-tauri/src/native_editor_bridge.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1: Create a separate native helper binary**

The helper process owns the native editor window and event loop. It must not be embedded in the main WebView.

```toml
# src-tauri/crates/altals-native-editor-app/Cargo.toml
[package]
name = "altals-native-editor-app"
version = "0.1.0"
edition = "2021"

[dependencies]
altals-editor-core = { path = "../altals-editor-core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Define the bridge protocol**

Create a typed command and event surface between Tauri and the helper process.

```rust
// src-tauri/src/native_editor_bridge.rs
#[derive(serde::Serialize, serde::Deserialize)]
pub enum NativeEditorCommand {
    OpenDocument { path: String, text: String },
    ApplyExternalContent { path: String, text: String },
    RevealOffset { path: String, offset: usize },
    SetDiagnostics { path: String, diagnostics: serde_json::Value },
}

#[derive(serde::Serialize, serde::Deserialize)]
pub enum NativeEditorEvent {
    Ready { session_id: String },
    ContentChanged { path: String, text: String },
    CursorMoved { path: String, offset: usize, line: u32, column: u32 },
    SelectionChanged { path: String, from: usize, to: usize },
}
```

- [ ] **Step 3: Add Tauri-owned lifecycle management**

`native_editor_runtime.rs` should be responsible for:

- spawning the helper process
- tracking session lifecycle
- forwarding commands from the Vue shell
- converting helper events into Tauri events or commands safe for the current shell

- [ ] **Step 4: Prove a minimal smoke path**

The spike is successful only if Altals can:

- launch the native editor helper
- open a text document in a native window
- receive content change events back into Tauri
- shut the helper process down cleanly when the workspace closes

- [ ] **Step 5: Run the backend verification slice**

Run:

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: the desktop shell and helper process compile together.

---

## Task 4: Bridge Document Workflow into the New Runtime

**Files:**
- Modify: `src/services/documentWorkflow/adapters/markdown.js`
- Modify: `src/services/documentWorkflow/adapters/latex.js`
- Modify: `src/services/markdown/previewSync.js`
- Modify: `src/services/latex/previewSync.js`
- Modify: `src/components/panel/OutlinePanel.vue`
- Modify: `src-tauri/src/native_editor_runtime.rs`

- [ ] **Step 1: Stop coupling workflow adapters to CodeMirror instances**

Markdown and LaTeX workflow adapters should talk to the editor runtime contract, not directly to CodeMirror view objects.

- [ ] **Step 2: Route diagnostics through the bridge**

Normalize existing Markdown and LaTeX diagnostics into a runtime-neutral payload before delivery to the editor. The native editor should receive the same problem model currently used by document workflow.

- [ ] **Step 3: Route outline and sync requests through the bridge**

Keep these flows working in both runtime modes:

- outline highlight from current cursor
- markdown source-to-preview and preview-to-source sync
- LaTeX forward and backward SyncTeX reveal
- citation insertion at current selection

- [ ] **Step 4: Keep preview surfaces WebView-based during this phase**

Do not migrate Markdown preview, PDF preview, references, or AI panels into native UI yet. This slice is about editor core replacement, not shell redesign.

- [ ] **Step 5: Verify workflow parity**

Run:

```bash
npm run build
```

Then run:

```bash
npm run tauri -- dev
```

Expected: in `web` mode behavior is unchanged; in `native-experimental` mode the editor helper can receive diagnostics and reveal requests without breaking the rest of the workbench.

---

## Task 5: Introduce Native Shadow Mode and Feature-Parity Gates

**Files:**
- Create: `src/services/editorRuntime/nativeBridge.js`
- Create: `src/components/editor/NativeEditorSurface.vue`
- Modify: `src/components/editor/EditorPane.vue`
- Modify: `src/components/editor/TextEditor.vue`
- Modify: `src/stores/editor.js`
- Modify: `src/stores/editorRuntime.js`

- [ ] **Step 1: Add a native bridge service on the frontend**

This service should hide Tauri invocation details and expose a small API:

```js
export function createNativeEditorBridge() {
  return {
    startSession,
    stopSession,
    openDocument,
    applyExternalContent,
    revealOffset,
    setDiagnostics,
    onEvent,
  }
}
```

- [ ] **Step 2: Add shadow mode before visible cutover**

When `shadowMode` is enabled:

- CodeMirror remains the user-facing editor.
- The native helper receives mirrored document state and reveal commands.
- Event deltas are logged and compared.

Do not expose native editor as default UI yet.

- [ ] **Step 3: Define cutover parity gates**

The native path cannot become interactive until these are proven:

- typing latency stays within target on large Markdown and LaTeX files
- selection and multi-cursor semantics match expected document edits
- save and dirty-state transitions remain correct
- outline follows cursor correctly
- markdown and LaTeX sync loops remain stable
- no data loss occurs across workspace close and reopen

- [ ] **Step 4: Add an explicit experimental setting**

Users should be able to enable:

- `web`
- `web + native shadow`
- `native-experimental`

per app setting or per workspace.

- [ ] **Step 5: Verify the hybrid shell**

Run:

```bash
npm run build
```

Then run:

```bash
npm run tauri -- dev
```

Expected: the app can switch between runtime modes without breaking tab restoration, dirty-state tracking, or document workflow chrome.

---

## Task 6: Cut Over Incrementally and Remove CodeMirror Last

**Files:**
- Modify: `src/components/editor/EditorPane.vue`
- Modify: `src/stores/editor.js`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/OPERATIONS.md`
- Delete later: `src/components/editor/TextEditor.vue`
- Delete later: `src/editor/*`

- [ ] **Step 1: Cut over one document class at a time**

Recommended order:

1. plain text and Markdown drafts
2. Markdown with preview sync and wiki links
3. LaTeX source editing with diagnostics
4. LaTeX citation and SyncTeX flows

- [ ] **Step 2: Keep the rollback path alive until final parity**

Do not remove CodeMirror while:

- native editor still lacks one of the required document workflows
- helper-process lifecycle still leaks or hangs
- save/restore reliability is not proven

- [ ] **Step 3: Remove dead CodeMirror dependencies only after cutover**

Delete:

- `src/editor/setup.js`
- `src/editor/theme.js`
- `src/editor/markdown*`
- `src/editor/latex*`
- direct CodeMirror dependency usage in editor components

- [ ] **Step 4: Run the full verification loop**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p altals-editor-core
```

Run:

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Run:

```bash
npm run build
```

Run:

```bash
npm run agent:codex-postflight -- --plan docs/superpowers/plans/2026-04-18-rust-native-editor-migration.md
```

Expected: the implementation can be audited back to this migration plan and the Web editor path can be retired with confidence.

---

## Phase Gates

### Gate A: Contract Extraction Complete

Must be true before writing native UI code:

- no workflow code requires a raw CodeMirror view
- runtime mode can be switched centrally
- shadow telemetry exists

### Gate B: Rust Core Viable

Must be true before helper-process integration:

- core crate has passing transaction and selection tests
- no Tauri or Vue dependency in `altals-editor-core`

### Gate C: Native Helper Viable

Must be true before user-visible experiments:

- helper process opens and closes cleanly
- document edits round-trip to the shell
- crash or disconnect does not corrupt editor state

### Gate D: Workflow Parity Viable

Must be true before `native-experimental` becomes interactive:

- diagnostics render correctly
- outline follows cursor
- markdown preview sync works
- LaTeX reveal and SyncTeX work

### Gate E: Cutover Ready

Must be true before CodeMirror removal:

- save and dirty state are stable
- tab restore is stable
- performance regression numbers are accepted
- rollback path has not been needed for one full verification cycle

---

## Not in This Slice

- Rewriting the whole Altals shell in Rust native UI
- Migrating AI panel, references workbench, or PDF reader out of WebView
- Porting Zed directly into the Altals repository
- Shipping a macOS-only editor path as the final architecture
- Visual redesign of the editor chrome during the core migration

---

## Recommended Execution Order

1. Task 1 and Gate A
2. Task 2 and Gate B
3. Task 3 and Gate C
4. Task 4 and Gate D
5. Task 5 for shadow mode and interactive experiments
6. Task 6 only after parity evidence is collected

## Migration Notes

- The biggest technical trap is trying to preserve the current WebView pane embedding model while demanding native editor feel. Do not optimize that trap.
- The biggest product trap is replacing the editing surface before the document workflow contracts are extracted. Do not cut over early.
- The native helper process is a migration tool and may or may not remain the final packaging model. The editor core crate is the durable asset.
