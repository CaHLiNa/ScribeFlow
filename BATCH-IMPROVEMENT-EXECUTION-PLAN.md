# ScribeFlow Batch Improvement Execution Plan

Last updated: 2026-05-12

> For agentic workers: execute this plan one batch at a time. Each batch must end with verification, a scoped commit, and a clear statement of remaining risk. Do not mix batches unless the previous batch is verified and committed.

## Goal

Turn the current strong runtime and extension platform into a smoother end-to-end academic writing workflow: workspace -> document editing -> preview/compile/run -> references -> citations -> plugin-assisted document work -> persisted desktop state.

## Architecture

Keep the existing layer contract intact:

- Rust remains the runtime authority for filesystem, workspace state, references, LaTeX/Python execution, PDF/reference assets, extension host, persistence, and security.
- `src/services` remains the Tauri bridge and side-effect boundary.
- Pinia stores coordinate UI state and call services, but do not become a second backend.
- Vue components render product surfaces, local drafts, loading/error/empty states, and user intent.
- `src/domains` contains pure deterministic presentation rules only.

## Tech Stack

- Tauri 2 desktop app
- Rust runtime in `src-tauri/src`
- Vue 3 frontend in `src`
- Pinia stores
- Vite build
- Local extension host under `src-tauri/resources/extension-host`
- Standard verification gate: `npm run verify`
- Isolated desktop smoke path: `npm run tauri:dev:isolated`

## Execution Rules

- Start every batch with `git status --short --branch`.
- Preserve unrelated dirty files. At the time this plan was written, `src/components/editor/WorkspaceStarterEmptyState.vue` was already dirty and must not be staged unless the active batch explicitly owns it.
- Use small commits with Conventional Commits.
- Stage only files touched by the active batch.
- Do not rename Tauri commands without a dedicated compatibility batch.
- Do not edit editor core files unless executing Batch 5.
- Do not add automated Tauri smoke, automated visual review, or automated interaction QA. Desktop feel remains manual.
- Prefer `npm run tauri:dev:isolated` for desktop smoke to avoid mutating real `$HOME/.scribeflow` state.
- If a batch discovers a blocking product decision, stop the batch after documenting the exact decision needed.

## Batch Order

1. Refresh current-state and execution baseline.
2. Run product main-path desktop smoke and record concrete findings.
3. Close remaining reference authority gaps.
4. Productize right-sidebar plugin usage with real document workflows.
5. Open a dedicated editor stability phase.
6. Split high-risk store/component responsibilities without changing behavior.
7. Polish core desktop UI surfaces from manual findings.
8. Final verification, docs sync, and release-readiness audit.

---

## Batch 1: Refresh Current-State And Baseline

### Goal

Make the project state accurate before touching behavior, so later batches are executed against current facts rather than the 2026-05-02 snapshot.

### Files

- Modify: `CURRENT-STATE.md`
- Modify: `ARCHITECTURE-BOUNDARY-MAP.md`
- Modify: `README.md` only if commands or product scope are stale
- Do not modify: `src/**`, `src-tauri/**`

### Steps

- [ ] Run `git status --short --branch`.
- [ ] Run `npm run verify`.
- [ ] Run `npm run tauri:dev:isolated` and confirm the desktop process starts with `SCRIBEFLOW_DATA_ROOT=/private/tmp/scribeflow-tauri-dev`.
- [ ] Update `CURRENT-STATE.md` date and baseline results.
- [ ] Update `ARCHITECTURE-BOUNDARY-MAP.md` if line-count inventory, known debt, or service inventory changed.
- [ ] Keep the docs factual. Do not claim manual desktop smoke is complete unless Batch 2 was actually executed.

### Acceptance

- `CURRENT-STATE.md` reflects the current verified baseline.
- `ARCHITECTURE-BOUNDARY-MAP.md` no longer reads like a stale snapshot.
- The document distinguishes automated verification from manual desktop smoke.

### Verification

```sh
npm run verify
git diff --check -- CURRENT-STATE.md ARCHITECTURE-BOUNDARY-MAP.md README.md
```

### Commit

```sh
git add CURRENT-STATE.md ARCHITECTURE-BOUNDARY-MAP.md README.md
git commit -m "docs: refresh project state baseline"
git push
```

---

## Batch 2: Product Main-Path Desktop Smoke

### Goal

Turn the current "manual desktop smoke remains user-judged" gap into concrete findings, then fix only the issues that are clearly within the main academic workflow.

### Files

- Create: `MANUAL-SMOKE-REPORT.md`
- Modify only if a real issue is found:
  - `src/components/sidebar/FileTree.vue`
  - `src/components/editor/MarkdownPreview.vue`
  - `src/components/editor/DocumentWorkflowBar.vue`
  - `src/components/references/ReferenceLibraryWorkbench.vue`
  - `src/components/panel/ReferenceDetailPanel.vue`
  - `src/stores/files.js`
  - `src/stores/documentWorkflow.js`
  - `src/stores/references.js`
  - relevant Rust runtime files under `src-tauri/src`

### Smoke Path

- [ ] Start with `npm run tauri:dev:isolated`.
- [ ] Open an existing workspace.
- [ ] Browse the file tree.
- [ ] Create a test Markdown file.
- [ ] Edit text and confirm cursor, selection, and scroll do not jump.
- [ ] Preview Markdown.
- [ ] Open a LaTeX file and compile if the workspace has one.
- [ ] Open a PDF preview.
- [ ] Open the reference library.
- [ ] Import or edit one reference.
- [ ] Insert a citation into Markdown or LaTeX.
- [ ] Open Settings and save one harmless preference.
- [ ] Enable or disable an extension if a local extension is present.
- [ ] Close and reopen the workspace.
- [ ] Confirm tabs, layout, reference state, and recent workspace state persist.

### Report Format

Write `MANUAL-SMOKE-REPORT.md` with these sections:

- Environment
- Workspace used
- Steps passed
- Issues found
- Fixes applied in this batch
- Issues deferred
- Verification evidence

### Fix Policy

- Fix P0/P1 blockers in the same batch if the root cause is clear.
- Defer editor cursor/selection changes to Batch 5 unless the fix is outside editor core.
- Defer broad UI redesign to Batch 7.
- Do not hide a failure by weakening runtime checks or removing user-visible errors.

### Acceptance

- There is a written smoke report with concrete pass/fail evidence.
- Main-path blockers discovered during smoke are either fixed or explicitly deferred with file-level evidence.
- Isolated data root was used for the test run.

### Verification

```sh
npm run verify
git diff --check -- MANUAL-SMOKE-REPORT.md
```

If code changed, also run the most relevant focused command:

```sh
npm run verify:quick
npm run verify:rust
```

### Commit

```sh
git add MANUAL-SMOKE-REPORT.md
git add <only-files-fixed-in-this-batch>
git commit -m "test: document desktop main-path smoke"
git push
```

---

## Batch 3: Reference Authority Convergence

### Goal

Make references behave like a Rust-owned academic data system, not a UI-owned library with scattered compatibility logic.

### Files

- Audit: `src/services/references/**`
- Audit: `src/domains/references/**`
- Modify as needed: `src/stores/references.js`
- Modify as needed: `src/components/references/ReferenceLibraryWorkbench.vue`
- Modify as needed: `src/components/panel/ReferenceDetailPanel.vue`
- Modify as needed: `src-tauri/src/references_*.rs`
- Preserve bridge compatibility: `src/services/references/referenceRuntime.js`

### Steps

- [ ] Search for frontend reference normalization and merge decisions:

```sh
rg -n "normalize|dedupe|merge|citation|abstract|notes|rating|zotero|documentReferenceSelections" src/services/references src/domains/references src/stores/references.js src/components/references src/components/panel
```

- [ ] Classify each hit as one of:
  - pure display derivation
  - bridge DTO compatibility
  - UI draft state
  - backend-owned policy that must move to Rust
- [ ] Move backend-owned policy into the relevant Rust module:
  - normalization: `src-tauri/src/references_snapshot.rs` or `src-tauri/src/references_backend.rs`
  - mutation/merge: `src-tauri/src/references_mutation.rs` or `src-tauri/src/references_merge.rs`
  - citation rendering/export: `src-tauri/src/references_citation.rs` or `src-tauri/src/references_runtime.rs`
  - Zotero semantics: `src-tauri/src/references_zotero.rs`
- [ ] Keep JS services as command wrappers and DTO adapters only.
- [ ] Keep `ReferenceDetailPanel.vue` as local draft UI plus save intent.
- [ ] Keep `ReferenceLibraryWorkbench.vue` as selection/filter/command orchestration only.
- [ ] Add or preserve Rust regression tests for:
  - `abstract`
  - `notes`
  - citation keys
  - local overrides
  - PDF asset fields
  - Zotero IDs
  - deleted/renamed collection and tag cleanup

### Acceptance

- No Vue component writes normalized reference records directly.
- JS services do not own reference merge, duplicate detection, persisted schema policy, or citation rendering policy.
- Create/update/delete/link/asset mutations flow through a single Rust mutation authority.
- Existing camelCase bridge compatibility still works.

### Verification

```sh
npm run verify:quick
npm run verify:rust
npm run build
```

Manual check after build:

- Import one BibTeX entry.
- Edit title, abstract, and notes.
- Save, close detail, reopen detail.
- Attach or inspect a PDF asset if available.
- Insert one citation into a Markdown or LaTeX document.

### Commit

```sh
git add src/services/references src/domains/references src/stores/references.js src/components/references src/components/panel src-tauri/src/references_*.rs
git commit -m "refactor: consolidate reference authority"
git push
```

---

## Batch 4: Right-Sidebar Plugin Productization

### Goal

Move extension work from "platform capability exists" to "real plugin workflow is natural from the document right sidebar."

### Files

- Modify: `EXTENSION-RIGHT-SIDEBAR-PLAN.md` only if product contract changes
- Modify: `Plugin.md`
- Modify: `PLUGIN-ARCHITECTURE.md`
- Modify as needed: `src/stores/extensions.js`
- Modify as needed: `src/domains/extensions/**`
- Modify as needed: `src/components/extensions/ExtensionSidebarPanel.vue`
- Modify as needed: `src/components/extensions/ExtensionTaskPanel.vue`
- Modify as needed: `src/components/sidebar/DocumentPluginsPanel.vue`
- Modify as needed: `src/components/sidebar/DocumentDock.vue`
- Modify as needed: `src-tauri/resources/extension-host/extension-host.mjs`
- Modify as needed: `src-tauri/src/extension_*.rs`

### Steps

- [ ] Confirm Settings remains management-only:
  - discovery
  - enable/disable
  - permissions
  - configuration
  - runtime metadata
- [ ] Confirm plugin usage routes into the document right sidebar:
  - PDF actions
  - document actions
  - reference-aware actions
  - command reveal requests
- [ ] Normalize vocabulary:
  - plugin container = right-sidebar tab identity
  - plugin view = runtime-rendered sub-surface inside the container
  - plugin task = persisted runtime work item with status, timeline, outputs, artifacts
- [ ] Improve sidebar plugin task UX without hardcoding a specific plugin:
  - context summary
  - task status
  - action row
  - result summary
  - artifact entry points
- [ ] Keep secrets in secure settings:
  - manifest-declared API keys and tokens use `secureStorage: true`
  - no API key lands in workspace JSON or plugin public settings files
- [ ] Add or update focused probes for any new runtime contract.

### Acceptance

- A plugin-owned PDF or document action opens or focuses the correct plugin tab.
- The plugin surface receives active document/PDF/reference context immediately.
- Result entries and artifacts are visible from the right sidebar.
- Settings is not used as the operational surface.
- No per-plugin special UI is added to core components.

### Verification

```sh
npm run verify:extensions
npm run verify:quick
npm run build
npm run verify:rust
```

Manual check:

- Enable a local plugin.
- Trigger a plugin action from document or PDF context.
- Confirm the matching right-sidebar tab opens or focuses.
- Confirm task status and result entries are visible there.

### Commit

```sh
git add EXTENSION-RIGHT-SIDEBAR-PLAN.md Plugin.md PLUGIN-ARCHITECTURE.md src/stores/extensions.js src/domains/extensions src/components/extensions src/components/sidebar src-tauri/resources/extension-host src-tauri/src/extension_*.rs scripts
git commit -m "feat: productize right-sidebar plugin workflows"
git push
```

---

## Batch 5: Dedicated Editor Stability Phase

### Goal

Open the frozen editor core only for a focused stability phase that protects cursor, selection, reveal, scroll, session payloads, and citation insertion.

### Files

- Modify only in this batch:
  - `src/editor/**`
  - `src/components/editor/TextEditor.vue`
  - `src/components/editor/EditorPane.vue`
  - `src/components/editor/EditorTextRouteSurface.vue`
  - `src/components/editor/EditorTextWorkspaceSurface.vue`
  - `src/components/editor/PaneContainer.vue`
  - `src/composables/useTextEditorBridges.js`
  - `src/stores/editor.js`
  - `src/services/editorPersistence.js`
  - `src-tauri/src/editor_session_runtime.rs`
- Modify as needed for citation insertion:
  - `src/components/editor/CitationPalette.vue`
  - `src/components/sidebar/DocumentReferencesPanel.vue`

### Steps

- [ ] Write a short editor-specific scope note at the top of the batch commit body or in `CURRENT-STATE.md`.
- [ ] Reproduce the exact editor behavior being improved before changing code.
- [ ] Protect these invariants:
  - typing does not jump cursor
  - selection survives sidebar refreshes
  - reveal and scroll do not fight each other
  - restored tabs point to the same document and editor position
  - citation insertion lands at the intended cursor position
- [ ] Keep CodeMirror extension changes minimal and isolated.
- [ ] Do not combine visual redesign with editor runtime changes.
- [ ] Add focused regression coverage where the current project test surface supports it.

### Acceptance

- The editor phase has a narrow written scope.
- Cursor, selection, reveal, scroll, and session restoration are manually checked.
- Citation insertion works after the change.
- No unrelated file tree, reference, plugin, or settings behavior is changed.

### Verification

```sh
npm run verify:quick
npm run build
npm run verify:rust
```

Manual check:

- Type in Markdown.
- Select text.
- Open/close sidebars.
- Insert a citation.
- Switch tabs and reopen workspace.
- Confirm cursor and scroll behavior remain stable.

### Commit

```sh
git add src/editor src/components/editor src/composables/useTextEditorBridges.js src/stores/editor.js src/services/editorPersistence.js src-tauri/src/editor_session_runtime.rs
git commit -m "fix: stabilize editor interaction state"
git push
```

---

## Batch 6: Store And Component Responsibility Split

### Goal

Reduce the chance that large stores and components become accidental backend centers or brittle UI shells.

### Files

Primary candidates:

- `src/stores/extensions.js`
- `src/stores/references.js`
- `src/stores/files.js`
- `src/stores/latex.js`
- `src/stores/workspace.js`
- `src/components/editor/PdfEmbedDocumentSurface.vue`
- `src/components/editor/MarkdownPreview.vue`
- `src/components/references/ReferenceLibraryWorkbench.vue`
- `src/components/sidebar/FileTree.vue`
- `src/components/settings/SettingsExtensions.vue`
- `src/components/layout/WorkbenchRail.vue`

Extraction targets:

- `src/domains/**` for pure deterministic derivation
- `src/services/**` for native bridge and side effects
- focused child components for repeated presentation shells

### Steps

- [ ] Pick one subsystem per commit.
- [ ] Before editing, write the current responsibility split in the batch notes.
- [ ] Extract pure deterministic logic to `src/domains/**`.
- [ ] Extract repeated UI chrome to focused child components.
- [ ] Keep bridge calls in `src/services/**`.
- [ ] Keep Pinia stores as orchestration and state owners only.
- [ ] Do not move Rust-owned policy into JS while shrinking files.
- [ ] Update `ARCHITECTURE-BOUNDARY-MAP.md` after each subsystem extraction.

### Acceptance

- No service file becomes a business-policy owner.
- No domain file imports services, stores, Tauri APIs, filesystem, or process authority.
- Large components become clearer without changing behavior.
- Existing focused probes continue to pass.

### Verification

```sh
npm run guard:ui-bridges
npm run guard:js-layer-boundaries
npm run verify:quick
npm run build
```

Run `npm run verify` before the final commit of this batch group.

### Commit

Use one commit per subsystem:

```sh
git add <subsystem-files> ARCHITECTURE-BOUNDARY-MAP.md
git commit -m "refactor: clarify <subsystem> responsibilities"
git push
```

---

## Batch 7: Desktop UI And Interaction Polish

### Goal

Make the main desktop surfaces feel coherent and efficient without turning ScribeFlow into a decorative marketing UI.

### Files

Candidates depend on Batch 2 findings:

- `src/App.vue`
- `src/style.css`
- `src/components/layout/WorkbenchRail.vue`
- `src/components/sidebar/FileTree.vue`
- `src/components/editor/WorkspaceStarterEmptyState.vue`
- `src/components/editor/MarkdownPreview.vue`
- `src/components/editor/PdfEmbedDocumentSurface.vue`
- `src/components/references/ReferenceLibraryWorkbench.vue`
- `src/components/panel/ReferenceDetailPanel.vue`
- `src/components/settings/Settings.vue`
- `src/components/settings/SettingsExtensions.vue`
- `src-tauri/resources/i18n/zh-CN.json`

### Steps

- [ ] Use Batch 2 smoke findings as the source of truth.
- [ ] Fix visible hierarchy issues first:
  - unclear primary action
  - cramped toolbar
  - unreadable empty state
  - status text that is too noisy or hidden
  - controls that wrap badly
- [ ] Preserve professional research-workbench density.
- [ ] Keep cards at restrained radius and avoid nested card shells.
- [ ] Ensure Chinese strings fit their containers.
- [ ] Verify light/dark theme contrast where the surface supports themes.
- [ ] Respect `prefers-reduced-motion` for any animation change.
- [ ] Do not change backend or editor runtime behavior in this batch.

### Acceptance

- Main surfaces are easier to scan.
- Buttons and controls have stable dimensions.
- Chinese text does not overflow obvious containers.
- Empty/loading/error states are clear and non-marketing.
- No new decorative one-note palette dominates the app.

### Verification

```sh
npm run build
npm run verify:quick
```

Manual check:

- Desktop width around 1440 px.
- Narrow window around 900 px.
- Settings page.
- Reference library.
- PDF preview.
- Workspace empty state.
- Extension sidebar if available.

### Commit

```sh
git add src src-tauri/resources/i18n/zh-CN.json
git commit -m "style: polish desktop workflow surfaces"
git push
```

---

## Batch 8: Final Verification And Release-Readiness Audit

### Goal

Prove the batch sequence did not regress the product and leave future workers with accurate project state.

### Files

- Modify: `CURRENT-STATE.md`
- Modify: `ARCHITECTURE-BOUNDARY-MAP.md`
- Modify: `README.md` if commands or product scope changed
- Modify: `MANUAL-SMOKE-REPORT.md`
- Modify: this file if execution status needs recording

### Steps

- [ ] Run `git status --short --branch`.
- [ ] Run full verification:

```sh
npm run verify
```

- [ ] Run isolated desktop smoke:

```sh
npm run tauri:dev:isolated
```

- [ ] Repeat the Batch 2 main-path smoke checklist.
- [ ] Update docs with exact verification results.
- [ ] Confirm no known dirty files are accidentally staged.
- [ ] Confirm `main` and `origin/main` alignment after push.

### Acceptance

- `npm run verify` passes.
- Manual smoke report is current.
- Docs reflect actual project state.
- Worktree is clean except for intentionally preserved user changes.
- All batch commits are pushed.

### Verification

```sh
npm run verify
git diff --check
git status --short --branch
```

### Commit

```sh
git add CURRENT-STATE.md ARCHITECTURE-BOUNDARY-MAP.md README.md MANUAL-SMOKE-REPORT.md BATCH-IMPROVEMENT-EXECUTION-PLAN.md
git commit -m "docs: record batch improvement completion"
git push
```

---

## Recommended Execution Strategy

Execute in this order:

1. Batch 1 and Batch 2 together only if no code changes are needed.
2. Batch 3 separately because references are product-critical and data-sensitive.
3. Batch 4 separately because plugin runtime and UI contracts are broad.
4. Batch 5 separately because editor behavior is high-risk.
5. Batch 6 as multiple small commits, one subsystem at a time.
6. Batch 7 after real smoke findings exist.
7. Batch 8 only after all active batches are complete.

## Stop Conditions

Stop and report instead of continuing if:

- `npm run verify` fails for a reason unrelated to the active batch.
- A fix requires touching frozen editor core outside Batch 5.
- A Tauri command payload rename appears necessary.
- A reference migration would alter existing user data without an explicit compatibility plan.
- A plugin secret would need to be written into a plaintext workspace file.
- Manual smoke reveals data loss, broken workspace restore, or editor cursor corruption.

## Current Known Starting State

- `npm run tauri:dev:isolated` is the preferred disposable desktop smoke path.
- `npm run verify` is the authoritative automated gate.
- Extension platform probes are broad and should be preserved.
- Reference workflow is central to the product and should remain Rust-authority first.
- Editor core is intentionally frozen until Batch 5.
- `src/components/editor/WorkspaceStarterEmptyState.vue` had an existing uncommitted modification when this plan was created; preserve it unless a later batch explicitly owns that file.
