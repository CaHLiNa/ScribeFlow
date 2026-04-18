# Altals Rust-Native Editor Migration and Parity Recovery Plan

> **For agentic workers:** execute this plan in order. Treat checked items as already landed on the current branch/worktree. Treat unchecked items as remaining work. Do not reintroduce CodeMirror or a user-facing fallback editor while implementing the remaining parity tasks.

**Goal:** Replace Altals' former WebView-hosted CodeMirror editor with a Rust-native editor stack that preserves Altals' Markdown and LaTeX writing workflow, preview sync, citations, diagnostics, toolbar, and editor-assist ergonomics that users already rely on.

**Architecture:** Keep the Tauri/Vue workbench as the desktop shell, but move text state, interaction analysis, edit planning, and eventually rendering-oriented editor semantics into Rust-owned runtime layers. The Vue side should remain a host and workflow shell, not the long-term home of editor semantics. Do not add visual placeholder surfaces, prolonged dual-editor UI, or a user-facing switch back to CodeMirror.

**Current truth:** the migration core and direct cutover are already in place, but parity is not complete. CodeMirror has been removed too early relative to presentation and assist-layer parity, so this plan now includes both the original migration milestones and the detailed recovery work needed to finish the job correctly.

---

## Decision Summary

### Chosen route

- Build and keep an Altals-owned Rust-native editor stack.
- Keep the current desktop shell and document workflow system intact while replacing the editing runtime underneath it.
- Continue backend-first: Rust owns editor semantics and planning; Vue hosts surfaces and dispatches app-level side effects.
- Recover missing editor-assist capabilities in Rust/native form instead of reintroducing CodeMirror.
- Treat migration as incomplete until editor-assist parity is restored, not merely until the old dependencies are deleted.

### Explicitly rejected

- Reintroducing CodeMirror as a long-lived fallback.
- Shipping a visible `web + native` dual-editor mode.
- Embedding a foreign native editor view into the old Vue pane tree as a temporary bridge.
- Declaring migration complete based only on document open/save/preview/citation basics while editor-assist capabilities are still missing.

### Updated success criteria

The migration is complete only when all of the following are true:

- Text input, selection, dirty state, save, reopen, and runtime document source-of-truth come from the Rust-native runtime.
- Markdown and LaTeX still participate in outline, diagnostics, preview sync, compile, citation, and workflow toolbar flows.
- Native editor presentation parity exists for syntax highlighting and inline semantic decoration.
- Native editor assist parity exists for Markdown formatting shortcuts, Markdown snippets, wiki-link completion, and LaTeX autocomplete.
- Native editor shell parity exists for context menu, table commands, and core editor visual feedback.
- No user-facing workflow still depends on CodeMirror code or dependencies.

---

## Status Snapshot as of 2026-04-19

### Landed already

- Rust editor core crate exists and has core state tests.
- Native helper/runtime bridge exists.
- Vue workbench routes text editing through `NativePrimaryTextSurface.vue`.
- Document persistence, selection sync, diagnostics, outline, Markdown sync, LaTeX SyncTeX, citation insertion/update, and file-tree drag insertion are bridged through the native runtime.
- `TextEditor.vue`, `src/editor/*`, and CodeMirror npm dependencies have been removed.

### Still missing before the migration can be called complete

The current native primary surface is still a `textarea` host and is missing these editor-assist groups:

1. syntax highlighting and token theming
2. gutter rendering for line numbers and fold affordances
3. active-line / selection-match / bracket-match / drop-cursor visual feedback
4. Markdown footnote and math hover preview
5. Markdown formatting shortcuts
6. Markdown slash snippets popup
7. wiki-link autocomplete
8. Markdown inline semantic decorations for wiki links and citations
9. Markdown table insert / format commands
10. LaTeX autocomplete popup
11. project-aware LaTeX completions for cite/ref/input/bibliography flows
12. LaTeX inline citation decorations and annotation
13. editor context menu parity

### Migration verdict

- Tasks 1 through 5 are effectively complete.
- Task 6 direct cutover and deletion happened, but final parity validation is not complete.
- New parity-recovery tasks below are mandatory completion work, not optional polish.

---

## Architecture Guardrails for the Remaining Work

- Keep policy in Rust or `src/domains/editor/*` whenever possible.
- Keep `NativePrimaryTextSurface.vue` as a thin host. It should not grow back into a large policy component.
- Do not rebuild missing features as ad hoc Vue-only regex logic if the same semantic should ultimately belong in Rust.
- Presentation concerns may still require Vue-side rendering layers, but the semantic inputs for those layers should come from Rust-native inspection/planning APIs.
- Do not restyle the editor chrome beyond what is necessary to restore the pre-cutover visual language.

---

## Primary File Map

### Core native stack already in play

- `src-tauri/crates/altals-editor-core/src/lib.rs`
- `src-tauri/crates/altals-native-editor-app/src/main.rs`
- `src-tauri/src/native_editor_bridge.rs`
- `src-tauri/src/native_editor_runtime.rs`
- `src/services/editorRuntime/nativeBridge.js`
- `src/stores/editorRuntime.js`
- `src/components/editor/NativePrimaryTextSurface.vue`
- `src/domains/editor/nativePrimarySurfaceRuntime.js`

### Shell and workflow files that parity work must continue to respect

- `src/components/editor/EditorPane.vue`
- `src/components/editor/DocumentWorkflowBar.vue`
- `src/components/editor/EditorContextMenu.vue`
- `src/services/documentWorkflow/adapters/markdown.js`
- `src/services/documentWorkflow/adapters/latex.js`
- `src/services/markdown/previewSync.js`
- `src/services/latex/previewSync.js`
- `src/composables/useEditorPaneWorkflow.js`
- `src/domains/document/documentWorkspacePreviewRuntime.js`

### Files expected to change during parity recovery

- `src-tauri/src/native_editor_bridge.rs`
- `src-tauri/src/native_editor_runtime.rs`
- `src-tauri/src/lib.rs`
- `src/services/editorRuntime/nativeBridge.js`
- `src/stores/editorRuntime.js`
- `src/domains/editor/nativePrimarySurfaceRuntime.js`
- `src/components/editor/NativePrimaryTextSurface.vue`
- `src/components/editor/EditorContextMenu.vue`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`

---

## Task 1: Extract the Editor Runtime Contract

**Status:** complete

- [x] Introduce a runtime store and make editor runtime selection an explicit shell concern.
- [x] Define the editor runtime contract.
- [x] Refactor the old CodeMirror path to satisfy the contract before cutover.
- [x] Add runtime telemetry hooks for content, selection, reveal, diagnostics, and sync requests.
- [x] Run the frontend build slice with the contract in place.

**Completion note:** this task achieved the required decoupling and is not the source of the remaining parity gap.

---

## Task 2: Scaffold the Rust Editor Core

**Status:** complete

- [x] Add the Rust workspace entries.
- [x] Create `altals-editor-core`.
- [x] Define initial buffer, selection, transaction, and viewport state types.
- [x] Add core tests for content replacement, selection math, and mapping behavior.
- [x] Run the Rust unit-test gate for the editor core.

**Completion note:** the missing work is no longer at the bare core-state level.

---

## Task 3: Build the Native Editor Host as a Separate Helper Process

**Status:** complete

- [x] Create the separate native helper binary.
- [x] Define the typed bridge protocol.
- [x] Add Tauri-owned lifecycle management.
- [x] Prove helper open/edit/close smoke behavior.
- [x] Build the desktop shell and helper together.

---

## Task 4: Bridge Document Workflow into the New Runtime

**Status:** complete

- [x] Stop coupling workflow adapters to CodeMirror instances.
- [x] Route diagnostics through the bridge.
- [x] Route outline, Markdown preview sync, LaTeX SyncTeX, and citation requests through the bridge.
- [x] Keep previews WebView-based during the migration.
- [x] Verify workflow parity for the current shell-level document workflow.

**Completion note:** preview and toolbar regressions for draft paths were corrected; do not re-open this task unless workflow adapters regress again.

---

## Task 5: Define Direct Cutover Gates and Final Switch Preconditions

**Status:** complete

- [x] Add frontend native bridge service and store APIs.
- [x] Keep migration backend-first and avoid a user-facing shadow mode.
- [x] Define cutover parity gates.
- [x] Prepare the direct switch path to `native-primary`.
- [x] Validate readiness gates with build/dev/manual verification evidence.

**Completion note:** the gate model exists, but the original gate set was too narrow because it did not include editor-assist parity. The remaining tasks below close that gap.

---

## Task 6: Directly Cut Over to Rust Editor and Remove CodeMirror

**Status:** partially complete

- [x] Switch the workbench editor surface to the native primary path.
- [x] Delete CodeMirror in the cutover slice.
- [ ] Re-run final parity validation against the full editor feature surface, not just workflow basics.

### What is already true

- `NativePrimaryTextSurface.vue` is the active workbench text surface.
- CodeMirror modules and dependencies are removed.
- File-tree drag insertion, citations, save, preview sync, diagnostics, and toolbar/preview shell flows are wired to the native runtime path.

### Why Task 6 is not actually closed

The active editor still lacks presentation and assist-layer parity that users previously had. The remaining tasks below are therefore considered part of finishing Task 6 correctly.

---

## Task 7: Rebuild Rust-Native Presentation Primitives

**Status:** pending

**Goal:** restore the visual/editorial affordances that vanished when CodeMirror rendering was removed.

**Files:**

- Modify: `src-tauri/src/native_editor_bridge.rs`
- Modify: `src-tauri/src/native_editor_runtime.rs`
- Modify: `src/services/editorRuntime/nativeBridge.js`
- Modify: `src/stores/editorRuntime.js`
- Modify: `src/domains/editor/nativePrimarySurfaceRuntime.js`
- Modify: `src/components/editor/NativePrimaryTextSurface.vue`

- [ ] **Step 1: Define a native presentation snapshot contract**

Rust should expose a typed snapshot for the active visible slice of a document. The snapshot must be able to describe:

- per-line visible spans
- token classes for syntax highlighting
- semantic marks for wiki links and citations
- active line
- selection ranges
- selection-match ranges
- bracket-match ranges
- optional drop-cursor position

- [ ] **Step 2: Implement Rust-side visible-slice tokenization hooks**

Start with Markdown and LaTeX-visible token classes only. The first version does not need a full parser rewrite, but it must not hardcode all tokenization in the Vue component.

The Rust runtime must at minimum return enough data to render:

- headings
- emphasis and strong
- code spans and fences
- links and URLs
- list markers
- LaTeX commands
- LaTeX math-ish command spans
- comments where applicable
- citation and wikilink semantic spans

- [ ] **Step 3: Add a Vue host rendering layer without reintroducing CodeMirror**

`NativePrimaryTextSurface.vue` should render a visual text layer behind or above the input host using Rust-provided presentation spans. It must not import CodeMirror or clone the old extension system.

Expected output:

- syntax-highlighted visible text
- semantic decoration classes for wiki links and citations
- active-line visual state
- selection and reveal visuals consistent with the previous editor chrome

- [ ] **Step 4: Restore gutter rendering**

Rebuild line-number and fold-affordance gutter rendering for the native surface shell.

Requirements:

- stable line-number alignment
- no layout jitter on scroll
- current-line emphasis remains intact
- gutter does not break Markdown/LaTeX preview sync interactions

- [ ] **Step 5: Restore editor visual feedback primitives**

Restore the following visible feedback:

- active line
- selection matches
- bracket match
- reveal target highlight
- drop cursor visualization for file drops

- [ ] **Step 6: Verify presentation parity**

Run:

```bash
npm run build
```

Then manually verify on both Markdown and LaTeX files:

- syntax colors are present
- gutter is present
- active line and reveal highlight are visible
- file-drop insertion still shows an intelligible target

---

## Task 8: Rebuild Markdown Assist and Semantic Editing

**Status:** pending

**Goal:** restore Markdown authoring ergonomics without putting long-term editor semantics back into Vue-only logic.

**Files:**

- Modify: `src-tauri/src/native_editor_bridge.rs`
- Modify: `src-tauri/src/native_editor_runtime.rs`
- Modify: `src/services/editorRuntime/nativeBridge.js`
- Modify: `src/stores/editorRuntime.js`
- Modify: `src/domains/editor/nativePrimarySurfaceRuntime.js`
- Modify: `src/components/editor/NativePrimaryTextSurface.vue`
- Modify: `src/components/editor/EditorContextMenu.vue`

- [ ] **Step 1: Rebuild Markdown formatting shortcuts**

Restore the old shortcut surface:

- `Mod-b` bold toggle
- `Mod-i` italic toggle
- `Mod-Shift-x` strikethrough toggle
- `Mod-e` inline code toggle
- `Mod-k` insert link
- blockquote toggle
- ordered-list toggle
- unordered-list toggle

The transformation planning should come from Rust so wrapper and prefix rules are not reimplemented ad hoc in the component.

- [ ] **Step 2: Rebuild Markdown slash snippets**

Restore the snippet popup for commands such as:

- `/h1`, `/h2`, `/h3`
- `/quote`
- `/list`, `/olist`
- `/code`
- `/math`
- `/footnote`
- `/image`
- `/table`

Requirements:

- Rust should identify snippet-trigger context and candidate set
- Vue should only host the popup and apply the selected replacement plan
- snippets must not trigger inside code spans or code fences

- [ ] **Step 3: Rebuild wiki-link autocomplete**

Restore `[[...]]` authoring assistance:

- file name completion
- heading completion after `#`
- proper replacement and cursor placement
- no activation inside code contexts

Use Rust for context inspection and replacement planning. Workspace file inventory can still be provided by JS-side services/stores as input.

- [ ] **Step 4: Rebuild Markdown inline semantic decorations**

Restore visible differentiation for:

- valid wiki links
- broken wiki links
- citation groups
- broken citation keys

These decorations should be driven by the presentation snapshot from Task 7.

- [ ] **Step 5: Rebuild Markdown hover affordances**

Restore:

- footnote hover preview
- inline math hover preview
- display math hover preview

The hover content can still be rendered in Vue, but the hit-testing/range identification should not live solely in the component.

- [ ] **Step 6: Rebuild Markdown table commands**

Restore:

- insert table action
- format current table action
- keyboard shortcuts for table commands
- context menu exposure where previously available

- [ ] **Step 7: Verify Markdown assist parity**

Manual acceptance must cover:

- shortcut toggles
- slash snippets
- wikilink completion
- broken-link styling
- footnote/math hover
- table insert/format

---

## Task 9: Rebuild LaTeX Assist and Semantic Editing

**Status:** pending

**Goal:** restore LaTeX authoring assist, project-aware completions, and visual semantic cues.

**Files:**

- Modify: `src-tauri/src/native_editor_bridge.rs`
- Modify: `src-tauri/src/native_editor_runtime.rs`
- Modify: `src/services/editorRuntime/nativeBridge.js`
- Modify: `src/stores/editorRuntime.js`
- Modify: `src/domains/editor/nativePrimarySurfaceRuntime.js`
- Modify: `src/components/editor/NativePrimaryTextSurface.vue`

- [ ] **Step 1: Rebuild static LaTeX command autocomplete**

Restore structured completion for:

- sectioning commands
- text formatting commands
- environment snippets
- math commands
- include / bibliography commands
- document setup commands

Selection placement and template insertion must be planned, not hand-assembled inline in the component.

- [ ] **Step 2: Rebuild project-aware LaTeX completions**

Restore completion flows for:

- cite / nocite
- ref / eqref / pageref / autoref / cref
- input / include / subfile
- bibliography / addbibresource

This work should reuse the existing project graph and document-intelligence services as data inputs, while keeping the completion context parsing in Rust.

- [ ] **Step 3: Rebuild LaTeX citation decorations**

Restore visible differentiation for:

- LaTeX citation commands
- citation keys
- broken citation keys
- optional post-citation inline annotation such as author/year

- [ ] **Step 4: Preserve formatter integration on the native path**

Ensure the native path still fully supports:

- explicit format-document command
- format-on-save
- no cursor corruption after formatting
- no dirty-state desynchronization after formatting

- [ ] **Step 5: Verify LaTeX assist parity**

Manual acceptance must cover:

- autocomplete popup appearance and insertion
- cite/ref/input completions against a real project graph
- citation decoration visibility
- format document
- format on save

---

## Task 10: Rebuild Shell-Level Editor Interaction Parity

**Status:** pending

**Goal:** restore the remaining shell behaviors that were previously provided by the old editor path.

**Files:**

- Modify: `src/components/editor/NativePrimaryTextSurface.vue`
- Modify: `src/domains/editor/nativePrimarySurfaceRuntime.js`
- Modify: `src/components/editor/EditorContextMenu.vue`
- Modify: `src/stores/editorRuntime.js`

- [ ] **Step 1: Reconnect the editor context menu**

Restore the native primary surface integration with `EditorContextMenu.vue`:

- right-click / control-click open behavior
- selection-aware actions
- Markdown table actions where applicable
- LaTeX format-document action where applicable

- [ ] **Step 2: Rebuild command routing for context-sensitive actions**

The native surface should expose the same command affordances the old shell expected:

- format document
- insert Markdown table
- format Markdown table
- citation edit/insert where contextually valid

- [ ] **Step 3: Verify selection and interaction fidelity**

Check:

- double-click behavior
- right-click does not destroy selection unexpectedly
- keyboard save and formatting commands still work
- drag insertion still works after context-menu and presentation changes

- [ ] **Step 4: Document the final host/runtime responsibility split**

Update docs so the final architecture is explicit:

- Rust owns editor semantics, context inspection, completion planning, and presentation snapshots
- Vue owns host DOM, popups, menus, and workbench-level side effects

---

## Task 11: Final Migration Audit and Sign-Off

**Status:** pending

**Goal:** close the migration with a verification loop that matches the actual feature surface, not the reduced gate set used during the early cutover.

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/OPERATIONS.md`
- Modify: this plan file if reality changes during execution

- [ ] **Step 1: Run code-level verification**

Run the smallest complete set available for the changed slice:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p altals-editor-core
```

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

```bash
npm run build
```

- [ ] **Step 2: Run desktop workflow verification**

Run:

```bash
npm run tauri -- dev
```

Verify at minimum:

- Markdown draft with toolbar and preview
- Markdown formatting shortcuts
- Markdown snippets and wikilinks
- LaTeX toolbar, compile, preview, and SyncTeX
- LaTeX autocomplete and formatter integration
- file-tree drag insertion
- citation insert and citation edit

- [ ] **Step 3: Run a parity checklist against the missing-groups inventory**

The migration cannot be signed off until all 13 missing groups listed in the status section are marked resolved with evidence.

- [ ] **Step 4: Run final postflight audit**

If the environment supports the repository script, run:

```bash
npm run agent:codex-postflight -- --plan docs/superpowers/plans/2026-04-18-rust-native-editor-migration.md
```

If the environment does not support that script, perform a manual audit against this plan and record:

- completed tasks
- pending tasks
- deviations
- risks
- verification evidence
- next step

- [ ] **Step 5: Only then declare the migration complete**

Completion criteria:

- no missing editor-assist groups remain
- no user-visible workflow relies on deleted CodeMirror code
- docs describe the new native editor architecture accurately

---

## Feature Parity Checklist

Do not mark the migration complete until every item here is resolved:

- [x] runtime contract extraction
- [x] Rust editor core and helper bridge
- [x] native primary workbench cutover
- [x] Markdown toolbar and preview for draft and non-draft files
- [x] LaTeX toolbar and preview for draft and non-draft files
- [x] diagnostics, outline, Markdown sync, LaTeX SyncTeX, citations
- [x] file-tree drag insertion
- [ ] syntax highlighting and theming
- [ ] gutter and fold affordances
- [ ] active-line / selection-match / bracket-match / drop-cursor visuals
- [ ] Markdown footnote and math hover
- [ ] Markdown formatting shortcuts
- [ ] Markdown slash snippets popup
- [ ] wiki-link autocomplete
- [ ] Markdown semantic decorations
- [ ] Markdown table commands
- [ ] LaTeX autocomplete popup
- [ ] project-aware LaTeX completions
- [ ] LaTeX citation decorations / annotations
- [ ] editor context menu parity

---

## Recommended Execution Order From Here

1. Task 7: presentation primitives
2. Task 8: Markdown assist
3. Task 9: LaTeX assist
4. Task 10: shell interaction parity
5. Task 11: final audit and completion sign-off

Do not reorder by implementing autocomplete before a stable presentation snapshot exists if the chosen UI depends on that snapshot. Do not stop after restoring only one or two obvious regressions.

---

## Migration Notes

- The earlier cutover proved that workflow basics could survive CodeMirror deletion, but it also exposed that editor-assist parity was under-specified. This plan fixes that planning defect.
- The remaining work is not a visual redesign. It is restoration of previously available editorial capability on the Rust-native path.
- The safest architectural split is: Rust decides editor semantics; Vue presents popups, menus, and shell-level UI.
- Do not keep expanding `NativePrimaryTextSurface.vue` with editor parsing logic. If a behavior is inherently editor-semantic, prefer adding a Rust bridge and letting the component consume typed results.
