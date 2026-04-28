# ScribeFlow Current State

As of 2026-04-28, this repository is no longer a minimal demo. It is a medium-complexity Tauri desktop workspace with a working main path around `workspace -> file tree -> multi-pane editor -> document workflow -> references`.

This document records the current product surface, architecture shape, and debt profile so future work can stay aligned with the desktop-first scope.

## Repository Summary

- Product shape: local-first academic writing workspace
- Frontend contract: Vue 3 + Pinia + Vite
- Runtime authority: Tauri / Rust
- Current local quality gates: `npm run verify` and `npm run smoke:web-shell`
- Current reality: the app has a real desktop shell and several working subdomains, but repo infra and boundary consistency still lag behind the product surface

## Phase Map

| Phase | Scope | Current Status | Evidence | Main Debt |
| --- | --- | --- | --- | --- |
| 0 | Repo baseline and delivery infra | Closed for current scope | Repo verify gate, CI, lint, architecture guards, frontend unit tests, web shell smoke, build and Rust checks all exist | No typecheck gate |
| 1 | Desktop shell and workspace lifecycle | Closed loop | Workspace open/close/bootstrap is Rust-led and stateful | Bootstrap path is growing into a coordination hub |
| 2 | Filesystem authority and security boundary | Mostly healthy | Allowed roots and filesystem mutations are enforced in Rust | Bridge usage is not fully normalized on the frontend |
| 3 | File tree and multi-pane editor | Closed loop | Tree snapshot, watch, recent files, split panes, restore and dirty state are implemented | Behavior-rich area without frontend regression coverage |
| 4 | Unified document workflow | Structurally strong | Markdown / LaTeX / Python are routed through shared workflow state | High abstraction cost and debugging complexity |
| 5 | LaTeX and Python runtime integration | Uneven but real | LaTeX is deep, Python is lighter but usable | Capability balance is skewed toward LaTeX |
| 6 | References, Crossref, Zotero | Feature-rich | Library, import/export, sync, detail view, citation formatting all exist | Highest domain complexity and scope-creep risk |
| 7 | Settings, onboarding, about | Complete enough | Theme, fonts, session restore, environment, updates and setup wizard exist | Infrastructure reality and product UI messaging are slightly out of sync |

## Detailed State

### Phase 0: Repo Baseline and Delivery Infra

Current state:

- The repository is locally verifiable through `npm run verify`.
- A separate `npm run smoke:web-shell` command now proves the empty workspace shell can boot through a live Vite process.
- Repo-level CI runs the same verification gate on `macos-latest`.
- Frontend now has a lint gate, a UI bridge architecture guard, and Vitest-based unit coverage for key main-path logic helpers.
- There is still no `tsconfig`.

Interpretation:

- The codebase is not blocked by compilation instability.
- The next infra gap is no longer baseline verification, but typechecking and tighter runtime boundary confidence.

### Phase 1: Desktop Shell and Workspace Lifecycle

Current state:

- Workspace open/close is orchestrated from the frontend but authority is delegated to Rust.
- Rust prepares workspace identity, data directories, config roots, lifecycle persistence, and bootstrap data.
- Frontend schedules bootstrap tasks and restores working state.

Interpretation:

- This is the strongest part of the current architecture.
- The repo already behaves like a desktop application, not a browser-first editor.

### Phase 2: Filesystem Authority and Security Boundary

Current state:

- Rust maintains allowed roots for workspace, data, global config, and Claude config.
- File reads, writes, rename, move, copy, preview reads, and related operations route through Rust commands.
- Workspace-scoped protocol access is protected by root resolution logic.

Interpretation:

- The architecture follows the intended Rust-first constraint.
- The remaining issue is consistency on the frontend side, where not every call path is equally well wrapped.

### Phase 3: File Tree and Multi-Pane Editor

Current state:

- The app supports a persistent file tree, tree reveal, watch-based refresh, recent files, and multi-pane tabs.
- Editor session restore and dirty tracking are first-class concerns.
- Recent-file ordering, de-duplication, open timestamps, and moved-path repair now resolve in Rust runtime persistence instead of frontend store policy.
- The shell supports left sidebar, right inspector, split panes, and multiple surface modes.

Interpretation:

- The editor/workbench core is a real product surface.
- This area is sensitive to regressions because it contains a lot of user-facing state transitions.

### Phase 4: Unified Document Workflow

Current state:

- Markdown, LaTeX, and Python are routed through shared workflow state and preview/build actions.
- Preview preference, preview visibility, artifact path resolution, and workspace preview state are unified.
- Rust now resolves the workflow summary contract itself: `uiState`, normalized `problems`, runtime-backed `artifactPath`, and status metadata for Markdown / LaTeX / Python.
- Document-workflow session persistence now mutates through Rust as well: preview prefs/bindings, workspace preview visibility/requests, and persisted LaTeX preview artifacts no longer rely on a frontend save queue or JS-side path reconciliation loop.
- Document-workflow context resolution now also collapses through Rust: preview-state resolution, workflow-state resolution, and status text/tone now come back from one runtime command instead of separate frontend bridge/cache layers.
- Frontend document adapters have been reduced to thin preview/compile bridges instead of owning their own workflow diagnostics and state-derivation layers.

Interpretation:

- This is the most product-platform-like part of the repository.
- It is a strong base for future iteration, but it raises the cost of careless changes.

### Phase 5: LaTeX and Python Runtime Integration

Current state:

- LaTeX support includes compiler detection, runtime scheduling, diagnostics, logs, SyncTeX, formatting, and Tectonic download flow.
- LaTeX source warmup, compile-request resolution, change-target resolution, and lint state now resolve through Rust runtime snapshot/change commands instead of frontend file-discovery helpers.
- LaTeX terminal/log text is now also assembled in Rust compile state instead of being reformatted inside the frontend store before every terminal dispatch.
- LaTeX project-aware autocomplete now resolves from Rust too: citation keys, labels, include targets, and bibliography file suggestions no longer depend on frontend graph-walking logic.
- LaTeX workflow problems no longer depend on a frontend-cached project graph either; Rust now computes graph-backed unresolved refs/citations directly inside document workflow resolution when given `workspacePath` and current source content.
- Python support includes interpreter detection, preference persistence, runtime listing, and compile state tracking.

Interpretation:

- LaTeX is already a deep integrated path.
- Python is present, but it is not yet a peer to LaTeX in depth.

### Phase 6: References, Crossref, and Zotero

Current state:

- The repository contains a substantial references subsystem.
- It supports local library state, metadata refresh, BibTeX import/export, PDF import, citation rendering, Crossref lookup, and Zotero sync/account handling.
- Reference asset storage and PDF fulltext extraction now resolve in Rust instead of the frontend runtime layer.
- References also influence workspace bootstrap and right-side detail views.

Interpretation:

- This is the richest non-editor domain in the repository.
- It is also the easiest place for product scope to sprawl.

### Phase 7: Settings, Onboarding, and About

Current state:

- There is a setup wizard and a multi-section settings surface.
- Theme, fonts, session restore, file tree behavior, PDF viewer defaults, LaTeX/Python environment state, and updates UI are already exposed.

Interpretation:

- The app presents itself like a mature desktop tool.
- The infra reality still needs to catch up with that presentation.

## Architecture Shape

What is already working well:

- Rust owns workspace authority, persistence boundaries, filesystem mutation, and runtime integrations.
- Vue and Pinia orchestrate shell state, user interaction, and short-lived workflow behavior.
- `domains/*` and `services/*` show an intentional separation between pure runtime logic and side-effect bridges.

What is not fully cleaned up:

- UI-layer direct Tauri API usage has been removed from `app/`, `components/`, `composables/`, and `i18n/`, and a repo guard now enforces that boundary for both `@tauri-apps/api/core` and `@tauri-apps/api/event`.
- The same boundary tightening now covers selected main-path stores: `workspace`, `files`, `links`, `latex`, and `references`, so Tauri event listeners also stay inside `services/*`.
- Remaining bridge calls are now concentrated in `services/*`, and several previously broad bridge files have started to split into narrower runtime slices.
- SyncTeX fallback parsing now resolves in Rust, and the old frontend `latexWorkshopSynctex*` parser/runtime files have been removed from the active bridge path.
- `latex/projectGraph` also carries less frontend surface now: unused JS facade entrypoints and an unused Rust command have been removed, leaving fewer non-UI call paths around project-target resolution.
- `latex/projectGraph` workspace file discovery no longer depends on a dedicated frontend helper file; Rust can now resolve workspace flat files itself when the bridge only provides `workspacePath`.
- `latex/root` fallback helpers have also been removed from the active path; compile target fallback now prefers existing runtime state, and the remaining project-graph cache is narrower instead of acting as a general root/preview authority.
- `latex/runtime` has tightened further now: editor warmup, compile-request lookup, change-target lookup, and lint refresh no longer ask the frontend to prepare flat file lists before invoking Rust.
- `latex/runtime` now also owns terminal/log text assembly for completed compile state, so the frontend store only forwards runtime-produced text to the terminal surface instead of rebuilding that output itself.
- `latex/projectGraph` has tightened further now too: the old frontend autocomplete path no longer resolves graph data, relative include paths, or bibliography target suggestions in JS, and the dedicated `projectGraphRuntime.js` bridge file has been removed from the active path.
- `documentWorkflow` is aligned with that same direction now: LaTeX project diagnostics are no longer sourced from a frontend graph cache, and the old `projectGraphCache.js` file has been removed from the active path.
- `documentOutline` follows the same direction now: the frontend no longer gathers workspace flat files for outline resolution, and Rust can derive the needed workspace file set from `workspacePath`.
- Workspace document template creation now follows the same Rust-first boundary: Rust owns template body text, extension normalization, unique file naming, and directory creation, while the frontend only passes `templateId`, `ext`, and display-facing labels.
- `editorPersistence` is narrower now too: recent-file open/rename policy no longer lives in Pinia/service helpers, and the frontend only forwards the current list plus path events into Rust persistence.
- `documentWorkflow/session` has tightened on the same axis: the old frontend persistence queue, preview-binding save choreography, and LaTeX artifact path cleanup loop have been collapsed into Rust session mutation/load commands, while the frontend keeps only live state projection and editor-side effects.
- `documentWorkflow/build` has tightened further too: the old frontend split between `workflowUiStateBridge`, `workspacePreviewStateBridge`, and dual resolved-state caches has been replaced by one Rust-backed context resolver, leaving a smaller JS build runtime that mainly prepares transient store inputs and compile adapters.
- `latex/previewSync` has now shed most of its non-UI authority too: moved-file path repair and in-editor selection matching resolve in Rust commands, while the frontend side only waits for views and applies the final editor focus.
- `documentWorkflow` has now crossed the same boundary: the old adapter-local workflow derivation for Markdown / LaTeX / Python has been collapsed into a Rust summary resolver, and the deleted `latex/diagnostics.js` mapping layer no longer sits between runtime state and workflow UI.
- `TextEditor` no longer warms LaTeX project graph and lint through separate frontend-side orchestration; the store now asks Rust for a source snapshot and only applies the returned state.
- The same Rust autocomplete move also fixed a deeper path-policy bug: relative include and magic-root paths containing `..` are now normalized in Rust before graph traversal, instead of silently breaking editor-time project discovery.
- The repo still carries light traces of earlier scope, even after the desktop-focused slim-down.

## Debt Map

### Infra Debt

- No typecheck gate
- Remaining large async bundle mass is now concentrated mainly in the PDF engine path rather than the main shell path

### Boundary Debt

- Bridge conventions now hold across UI layers, i18n entrypoints, and the main product-facing stores
- The old frontend typed-file creation loop has been removed from `FileTree.vue`; template file creation no longer depends on JS-side `pathExists` probing or JS-owned initial document bodies.
- The old frontend recent-files normalization/update path has also been removed from the active editor store flow; JS now delegates open and rename events to Rust instead of owning recents ordering and timestamp mutation.
- The old frontend document-workflow session save queue and JS-side LaTeX preview artifact reconciliation path have also been removed from the active runtime flow; session mutations now persist through Rust instead of frontend debounce/orchestration helpers.
- The old frontend dual resolved-state path for document workflow has been removed too; preview/workflow context now resolves through one Rust command instead of separate JS-managed cache/bridge layers for preview state and workflow state.
- `workspacePreferences`, `workspacePermissions`, `references/zoteroSync`, `references/referenceLibraryIO`, `references/referenceImport`, `references/referenceAssets`, `references/crossref`, `references/citationFormatter`, `editorPersistence`, `workspaceRecents`, `workspaceTreeRuntime`, `latex/runtime`, `latexPreferences`, `latex/projectGraph`, `pdf/latexPdfSync`, `pdf/artifactPreview`, and the `documentWorkflow` summary path now route through narrower Rust-backed bridges, but other bridge-heavy service modules still aggregate multiple Rust command families and should be split further when it reduces coupling
- The old frontend bridge entrypoints for standalone LaTeX compile-request and compile-target resolution have been removed from the active command surface; the remaining JS cache around project graph exists mainly for editor-time autocomplete reuse, not as a policy authority
- The old frontend project-graph cache layer has now been removed from the active path entirely; project-relative autocomplete policy and workflow-level unresolved ref/citation diagnostics both resolve in Rust instead

### Scope Debt

- References + Zotero + Crossref is the heaviest domain after the editor core
- Python is present but not yet deep enough to justify broad product claims
- The codebase can easily drift back into multi-product scope if new work is not actively constrained

### Cleanup Debt

- Slim-down completed at the repo level, but some local structural leftovers still exist
- The app has fewer dead code markers than expected, which means debt is implicit instead of explicitly tracked

## Current Execution Focus

The next execution phase should stay narrow:

1. Keep the main path centered on `workspace / editor / preview-build / references`.
2. Preserve repo trust through the verify gate and CI instead of letting new work bypass them.
3. Continue shrinking broad service-level bridge surfaces into more focused runtime wrappers where it is low-risk to do so, especially in remaining large services that still mix path policy, persistence, and command orchestration.
4. Use the new Rust-owned workflow summary pattern as the default for future bridge cleanup instead of reintroducing adapter-local policy layers in JS.
5. Reuse the new LaTeX runtime snapshot/change-resolver pattern for other remaining state-heavy stores before adding more frontend-side orchestration.
6. Prefer stable facade files over direct deep imports so internal service slicing can keep evolving without forcing cross-repo call-site churn.
7. Avoid expanding new product surfaces until remaining boundary debt is tighter.

## Definition of Progress for the Next Phase

The repository should move from:

- "locally buildable desktop app with broad capability surface"

to:

- "desktop app with a guarded main path, repeatable repo verification, and service-level bridge boundaries that are easier to reason about"
