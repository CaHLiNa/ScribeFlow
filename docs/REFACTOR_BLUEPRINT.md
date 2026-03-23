# Refactor Blueprint

## Overview

Altals is being refactored from a broad, feature-heavy research desktop application into a focused, local-first research and academic operating system centered on project-based writing, notebook-backed computation, references, builds, history, optional Git sync, and AI-assisted patch workflows.

This file is the living execution plan for the refactor. It must always reflect the real repository state, not an aspirational plan.

Current overall assessment:

- Phase 0 is effectively complete.
- Phase 1 is substantially advanced but not fully closed.
- Phase 2 has completed its currently highest-value `editor` slice and should no longer be extended for cosmetic cleanup.
- Phase 3 is complete for the current planned scope: the `documentWorkflow` preview/open/reconcile runtime, build/diagnostic seam, shared build execution seam, typst shared-pane seam, and UI-facing action-routing seam are all landed and validated.
- Phase 4 is complete for the current planned scope: explicit history-point intent, Git-backed snapshot metadata/manifest seams, local workspace-save-point indexing, app-managed payload restore, project-text-set capture, preview/diff/apply flows, and in-scope added-file removal are all landed and validated.
- Phase 5 is complete for the current planned scope: document-scoped AI launch routing is now behind an explicit runtime seam, the existing TeX/Typst proposal-first workflows are documented truthfully, and no broader direct-action AI path was expanded.
- Phase 6 is complete for the current planned scope: the missing core docs baseline now exists, remaining direct AI launch/deletion targets are documented, and repo-level audit tests now guard the docs baseline plus the current direct AI launch inventory.
- Repository state was re-audited on 2026-03-23; active docs and agent instructions are now aligned with the broader research-operating-system definition, while the biggest remaining product-shape gap is the missing execution/notebook domain boundary.

## Product Direction

Target product definition:

> A local-first, project-directory-centered research and academic operating system.

Primary workflow:

1. Open project
2. Browse files and references
3. Draft in Markdown and notebooks
4. Author in LaTeX / Typst and related project files
5. Run code through notebook and terminal-backed execution flows
6. Build / preview outputs
7. Review changes and restore points
8. Optionally sync with Git
9. Use AI through auditable proposals

First-class product objects:

- Project
- Document
- Notebook
- Computation
- Reference
- Build
- Change
- Workflow

Secondary/supporting systems:

- Git
- remote sync
- AI chat
- experimental panels
- legacy migration shims

If there is tension between the core research workflow and support systems, the research workflow wins.

## Architectural Principles

- Domain-first structure
- Thin root components
- Thin Rust commands
- Shared operation-oriented boundaries
- Patch-first AI
- Clear separation of autosave, snapshot, git commit, and remote sync
- Documentation maintained alongside code
- Controlled migration instead of blind rewrite
- Real boundary extraction over cosmetic refactors
- Narrow, validated slices over broad speculative changes

Target frontend direction:

- `src/app`
- `src/domains/workspace`
- `src/domains/files`
- `src/domains/document`
- `src/domains/execution`
- `src/domains/reference`
- `src/domains/build`
- `src/domains/changes`
- `src/domains/ai`
- `src/domains/git`
- `src/shared`

Target Rust direction:

- `src-tauri/src/commands`
- `src-tauri/src/core`
- `src-tauri/src/services`
- `src-tauri/src/models`
- `src-tauri/src/errors`

## Current State Assessment

### Product / architecture reality

The repository has already moved away from a fully App-centric structure, but it has not yet reached a stable domain-oriented architecture.

The writing/build/history loop is the strongest landed product path.
The notebook/kernel/terminal-backed computation loop is real, but still fragmented across components, stores, services, and flat Rust modules.

The current strongest signs of progress are:

- `src/app` entry-layer boundaries have been established.
- `App.vue` has already been reduced significantly and no longer carries as much direct orchestration as before.
- `src/domains/changes` has been established as an early domain boundary.
- `references` and `editor` have both gone through first-round store/domain extraction.
- `references` has now also entered a second-round runtime extraction sequence.
- `files` and `workspace` have both gone through repeated runtime extraction cycles and are no longer the clearest Phase 2 bottlenecks.
- `src/domains/document/documentWorkflowRuntime.js` now marks the first concrete Phase 3 main-loop boundary.
- `src/services/workspaceHistoryRepo.js` now marks the first concrete Phase 4 safety-model boundary, separating history repo bootstrap from auto-commit execution.
- Notebook execution, kernel discovery, and environment setup are all present in the codebase, but they still lack one explicit `execution` / `notebook` domain family.

### Frontend current state

#### App/root layer

The root app component has already been reduced through extraction of several orchestration modules, including workspace lifecycle, shell event bridge, workspace history actions, teardown handling, and footer status sync.

A narrow persistent left rail for `Project` / `Library` / `AI` navigation has now also landed as a shell-level component, replacing the previous header-level primary-surface switcher without reintroducing broader orchestration into `App.vue`; the left-sidebar toggle affordance now lives as one persistent control in the global header, tracking the live left-sidebar edge while expanded and snapping back to the traffic-light/left-rail anchor when collapsed instead of duplicating a second toggle in the top-right chrome.

#### Large store reduction progress

Two major store reductions have already happened:

1. `references`
2. `editor`

##### References domain status

The references store has already had these responsibilities extracted into domain modules:

- workflow metadata
- workbench collections / saved views
- search / export
- import / dedup / merge
- storage IO

The store has now also begun a second-round extraction:

- `src/domains/reference/referenceLibraryRuntime.js` now carries save scheduling, self-write bookkeeping, fs-change listener lifecycle, and three-file library/workbench/workspace collection persistence.
- `src/domains/reference/referenceLibraryLoadRuntime.js` now carries workspace context capture, stale-generation guards, load sequencing, hydrated state application, and post-load watcher startup.
- `src/domains/reference/referenceMigrationRuntime.js` now carries legacy workspace-library import, legacy asset relocation, and safe asset deletion behavior.
- `src/domains/reference/referenceWorkspaceViewRuntime.js` now carries workspace/global view synchronization, membership-state repair, and save-on-mutation commit helpers.
- `src/domains/reference/referenceMutationRuntime.js` now carries collection/saved-view mutation coordination plus workflow/tag updates.
- `src/domains/reference/referenceCrudRuntime.js` now carries add/import/update/merge coordination.
- `src/domains/reference/referenceAssetRuntime.js` now carries global asset deletion and PDF/fulltext storage flows.

The store is now mostly a thinner shell around focus/detail-mode state, search/export helpers, path lookup helpers, and a smaller set of direct UI bridges.

##### Editor domain status

The editor store has already had these responsibilities extracted into domain modules:

- pane tree / layout
- pane tab mutation
- surface switching
- pane/file/chat/launcher open routing
- persistence runtime
- editor view registry
- dirty persistence bridge
- research / execution insertion actions
- cleanup runtime
- restore runtime

`src/domains/editor/editorOpenRoutingRuntime.js` now carries pane/file/chat/new-tab/AI-launcher open-routing decisions, including side-pane reuse and split-right fallback behavior.

The editor store is now 756 lines after the open-routing extraction, and the remaining editor logic is no longer the highest-value place to keep spending Phase 2 effort.

#### Remaining large frontend bottlenecks

The largest remaining frontend architectural bottlenecks include:

- `src/stores/latex.js`
- `src/stores/pdfTranslate.js`
- `src/stores/reviews.js`
- `src/components/editor/PdfViewer.vue`

`references` and `editor` have both now had their highest-value currently identified Phase 2 slices extracted, and `documentWorkflow` has now had its first main-loop slice extracted; the next higher-value repository need has shifted back to the remaining Phase 3 build/review loop now that the current planned Phase 4 safety-model slices have landed.

##### Document workflow status

`src/domains/document/documentWorkflowRuntime.js` now carries preview-pane reuse, split-right fallback, preview-session state updates, jump-to-preview routing, and reconcile/close-preview orchestration.

`src/domains/document/documentWorkflowBuildRuntime.js` now carries workflow adapter context construction, adapter-specific log opening, problem aggregation, UI-state lookup, and status-text/tone wiring needed for compile/review visibility.

`src/domains/document/documentWorkflowBuildOperationRuntime.js` now carries shared build execution above that build/runtime seam, so UI-facing composables no longer launch LaTeX/Typst builds by calling compile adapters directly.

`src/domains/document/documentWorkflowTypstPaneRuntime.js` now carries the typst preview/pdf shared-pane state machine, including shared-pane reuse, preview-close behavior, preview-to-PDF switching, PDF overlay vs owned-pane tracking, and split-right fallback when no reusable pane exists.

`src/domains/document/documentWorkflowActionRuntime.js` now carries UI-facing document workflow action branching for markdown preview toggles, primary compile-vs-preview routing, non-typst reveal-preview behavior, and typst reveal delegation.

`src/stores/documentWorkflow.js` is now 450 lines after the third extraction sequence, up from the thinner mid-migration shell because it now exposes more explicit runtime-backed action wrappers; the newly added surface area is wrapper-oriented rather than a return to inline orchestration.

`src/composables/useEditorPaneWorkflow.js` now reuses the same document seam for toolbar visibility/status wiring, shared build execution, compile-artifact lookup, typst preview/pdf pane switching, and UI-facing primary/reveal action routing instead of calling compile adapters or running the typst shared-pane/action state machine directly inside the composable.

##### Safety model status

The first concrete safety-model split has landed:

- `src/services/workspaceHistoryRepo.js` now owns history-repo existence/init plus optional initial seed commit behavior.
- `src/services/workspaceAutoCommit.js` now focuses on marker checks, explicit enablement, and commit execution rather than repo bootstrap.
- `src/domains/changes/workspaceHistoryAvailabilityRuntime.js` now owns explicit history availability checks, home-directory unavailability handling, and optional auto-commit enablement bridging.
- `src/domains/changes/workspaceHistoryPointRuntime.js` now owns app-level history-point intent resolution and orchestration across availability, preparation, message, and commit runtimes.
- `src/domains/changes/workspaceHistoryPreparationRuntime.js` now owns dirty-editor persistence plus eligible open-file save preparation before explicit history commits.
- `src/domains/changes/workspaceHistoryCommitRuntime.js` now owns staged explicit history commits, no-change detection, and default commit-message fallback behavior.
- `src/domains/changes/workspaceHistoryMessageRuntime.js` now owns default save/auto message generation plus named-vs-system history entry classification for UI affordances.
- `src/domains/changes/workspaceSnapshotRuntime.js` now owns Git-backed snapshot record mapping for both workspace-level save points and file-level version-history entries.
- `src/domains/changes/workspaceSnapshot.js` now owns the shared Git-backed snapshot operation boundary for create/list/preview/restore behavior, with explicit file-history vs workspace-save-point wrappers as the surviving public seams, and the old `workspaceHistory.js` bridge has been removed.
- `src/domains/changes/workspaceSnapshotMetadataRuntime.js` now owns explicit snapshot title, named/system classification, and preview/restore capability metadata above the raw Git-backed snapshot records.
- `src/domains/changes/workspaceSnapshotManifestRuntime.js` now owns persisted snapshot manifest trailers so explicit workspace save points can retain `scope` / `kind` metadata above raw Git message heuristics even when they later appear in file-scoped Git history.
- `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js` now owns the local workspace-save-point index path plus record/backfill behavior under `workspaceDataDir`.
- `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` now owns payload-manifest paths plus app-managed capture/load/restore behavior for payload-backed workspace save points.
- `src/domains/changes/workspaceSnapshotProjectTextRuntime.js` now owns the filtered project-text candidate set used by workspace save-point payload capture.
- `src/domains/changes/workspaceSnapshotPreviewRuntime.js` now owns current-workspace preview summaries for payload-backed workspace save points without routing those previews through Git history.
- `src/domains/changes/workspaceSnapshotDiffRuntime.js` now owns per-file diff/content preview data for modified or missing payload-backed workspace save-point files, including the full content needed for the new local patch/diff editor surface without routing those previews through Git history.
- `src/domains/changes/workspaceSnapshotFileApplyRuntime.js` now owns app-managed file writes plus open-editor synchronization for workspace snapshot restore and chunk-level preview apply flows, so chunk application does not bypass the normal save/reload/editor-update path.
- `src/domains/changes/workspaceSnapshotDeletionRuntime.js` now owns in-scope added-file detection/removal for payload-backed workspace save points inside the current filtered `project-text-set`, so full restore no longer ignores newly added project-text files.
- `src/domains/changes/workspaceAutoCommitRuntime.js` now owns auto-commit marker enablement, workspace eligibility gating, shared auto-message construction, and timed Git add/status/commit execution behind the service shell.
- `src/domains/changes/workspaceVersionHistoryRuntime.js` now owns Git-backed history list/load/restore IO so `VersionHistory.vue` no longer performs those side effects directly.
- `src/domains/git/workspaceRepoLinkRuntime.js` now owns local history bootstrap plus remote-link preparation ordering, so `workspaceGitHub.js` no longer inlines history repo creation, auto-commit enablement, remote setup, and initial auto-commit sequencing.
- `src/app/changes/snapshotLabelPromptRuntime.js` plus `src/app/changes/useSnapshotLabelPrompt.js` now own Footer snapshot-label prompt timers, dialog visibility, and pending confirmation resolution instead of leaving that UI state embedded in `Footer.vue`.
- `src/domains/files/workspaceTextFileLimits.js` now carries the shared text-read byte limit so payload/runtime tests do not need to import `fileStoreIO` just to reuse that limit.
- `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` now also preserves empty `project-text-set` payload manifests, so a workspace save point can still model an in-scope empty state for later added-file removal instead of silently behaving like “no payload exists”.

This is now a cleaner explicit boundary: shared filesystem existence checks come from `src/services/pathExists.js`, so the safety split no longer depends on a temporary dynamic-import workaround to stay testable.

Current `files`-specific audit notes:

- `src/stores/files.js` is now 579 lines after the cache, refresh, watch, hydration, flat-file indexing, content-runtime, entry-creation/import, mutation-runtime, and cleanup slices.
- `fileStoreIO` already carries filesystem IO helpers.
- `fileStoreEffects` already carries cross-store rename/move/delete side effects.
- `src/domains/files/fileTreeCacheRuntime.js` now carries the first extracted `files` runtime slice:
  - `treeCacheByWorkspace`
  - root expanded-dir snapshotting
  - cached tree restore
  - cached expanded-dir replay
- `src/domains/files/fileTreeRefreshRuntime.js` now carries visible-tree refresh orchestration:
  - loaded-directory traversal
  - tree snapshot diffing
  - queued visible-tree refresh loop
- `src/domains/files/fileTreeWatchRuntime.js` now carries watch/poll lifecycle orchestration:
  - filesystem event filtering
  - debounce handling
  - activity tracking
  - visibility-aware polling
- `src/domains/files/fileTreeHydrationRuntime.js` now carries tree hydration/loading orchestration:
  - entry lookup
  - shallow tree load
  - directory child hydration
  - post-mutation tree resync / expansion replay
- `src/domains/files/flatFilesIndexRuntime.js` now carries flat-file indexing/runtime orchestration:
  - delayed recursive indexing
  - generation-based stale-result suppression
  - promise/timer reuse and cleanup
- `src/domains/files/fileContentRuntime.js` now carries file content/runtime orchestration:
  - text/PDF read behavior
  - file load error normalization and cache updates
  - PDF source-kind detection and reload behavior
  - save-path cache synchronization
- `src/domains/files/fileCreationRuntime.js` now carries entry-creation/import runtime orchestration:
  - create file
  - duplicate path
  - create folder
  - copy external file into workspace
- `src/domains/files/fileMutationRuntime.js` now carries rename/move/delete coordination:
  - cache migration after rename
  - editor tab and wiki-link side effects
  - expanded-dir state repair
  - deletion race protection and post-mutation tree refresh
- `files` is no longer the clearest next extraction target; the next high-value store slice has shifted to `workspace`.

Current `references`-specific audit notes:

- `src/stores/references.js` is now 761 lines after the library/runtime, load/runtime, migration/runtime, workspace-view/runtime, mutation/runtime, CRUD/runtime, and asset/runtime slices.
- `src/domains/reference/referenceLibraryRuntime.js` now carries:
  - delayed save scheduling
  - self-write bookkeeping
  - fs-change listener lifecycle
  - global/workbench/workspace collection writes
- `src/domains/reference/referenceLibraryLoadRuntime.js` now carries:
  - workspace context capture/match
  - stale-generation guards
  - loadLibrary orchestration
  - hydrated state application
  - citation-style/user-style postload handling
- `src/domains/reference/referenceMigrationRuntime.js` now carries:
  - safe asset deletion
  - legacy workspace-library import
  - legacy PDF/fulltext relocation into global storage
- `src/domains/reference/referenceWorkspaceViewRuntime.js` now carries:
  - workspace/global view synchronization
  - save-on-mutation commit helpers
  - workspace membership add/remove and key-rename state repair
  - global-removal active/selection cleanup
- `src/domains/reference/referenceMutationRuntime.js` now carries:
  - collection and saved-view mutation coordination
  - workflow field updates
  - summary/reading-note saves
  - reference tag mutation helpers
- `src/domains/reference/referenceCrudRuntime.js` now carries:
  - add/addMany reference import flows
  - duplicate detection and workspace re-attach behavior
  - update/rename-through-update state persistence
  - mergeReference coordination
- `src/domains/reference/referenceAssetRuntime.js` now carries:
  - global reference removal with asset cleanup
  - PDF copy/import orchestration
  - extracted fulltext writeback
- The store still directly mixes several distinct concerns:
  - focus/detail-mode UI bridges
  - search/export/path helpers
  - thin wrapper methods around extracted runtimes
- `references` is now thin enough that the next high-value Phase 2 slice should shift away from it.

Current `workspace`-specific audit notes:

- `src/stores/workspace.js` is now 727 lines after automation, GitHub session, settings/instructions, and bootstrap/watch runtime extractions.
- `src/domains/workspace/workspaceAutomationRuntime.js` now carries:
  - auto-commit interval lifecycle
  - sync timer lifecycle
  - auto-sync / fetch / sync-now orchestration
  - timer cleanup during workspace teardown
- `src/domains/workspace/workspaceGitHubRuntime.js` now carries:
  - init/connect/disconnect state transitions
  - repo link/unlink orchestration
  - sync-state application bridges
- `src/domains/workspace/workspaceSettingsRuntime.js` now carries:
  - workspace settings load orchestration
  - instructions file migration/load/open flows
  - global key/model config persistence
  - tool-permission and skills-manifest IO
- `src/domains/workspace/workspaceBootstrapRuntime.js` now carries:
  - bootstrap step sequencing with stale-generation guards
  - watch-directory registration
  - instructions fs-change listener lifecycle
  - workspace usage kickoff and auto-commit startup bridge
- Remaining `workspace` store logic is now mostly:
  - open/close state reset
  - thin service wrappers for data-dir/project-dir/edit-hook setup
  - preference/UI state setters and zoom/theme helpers
- The next high-value store reduction has already shifted away from `workspace`; `src/stores/chat.js` (854 lines) is now the largest remaining store, but the active extraction sequence is still finishing high-value seams in `src/stores/terminal.js`.

Current `chat`-specific audit notes:

- `src/stores/chat.js` is now 381 lines after six chat runtime extractions and is no longer a primary Phase 2 bottleneck.
- Existing chat support modules already cover portions of the persistence/runtime surface:
  - `src/stores/chatSessionPersistence.js`
  - `src/services/ai/runtimeConfig.js`
  - `src/services/ai/sessionLabeling.js`
  - `src/services/chatTransport.js`
- `src/domains/chat/chatPersistenceRuntime.js` now carries:
  - persisted session meta loading
  - workspace chat bootstrap/reset orchestration
  - persisted session save behavior
  - store cleanup/reset orchestration
- `src/domains/chat/chatSessionLifecycleRuntime.js` now carries:
  - session creation and AI metadata application
  - persisted-session reopen behavior
  - archive/background session lifecycle
  - delete/remove session cleanup orchestration
- `src/domains/chat/chatMessageRuntime.js` now carries:
  - user-message send gating
  - first-message smart labeling
  - multimodal file-ref/context shaping
  - rich-html attachment persistence
  - live session abort behavior
- `src/domains/chat/chatTitleRuntime.js` now carries:
  - first-exchange title-generation gating
  - smart session-label helpers
  - UIMessage text extraction for titles
  - keyword persistence after AI titling
- `src/domains/chat/chatRuntimeConfigRuntime.js` now carries:
  - provider/runtime config assembly
  - missing-API-key gating
  - runtime metadata persistence
  - usage/cost accounting callbacks
- `src/domains/chat/chatLiveInstanceRuntime.js` now carries:
  - Chat instance creation/reuse
  - broken tool-call recovery
  - artifact sync lifecycle
  - ready-state persistence and background cleanup wiring
- The store still directly mixes several distinct concerns:
  - runtime accessor wiring
  - reactive getters/state shell
  - thin session/message bridges
- `chat` is now thin enough that the next high-value Phase 2 slice should shift away from it.

Current `terminal`-specific audit notes:

- `src/stores/terminal.js` is now 508 lines after five terminal runtime extraction slices and is no longer the active Phase 2 bottleneck.
- Terminal infra helpers already exist in:
  - `src/services/terminal/terminalSessions.js`
  - `src/services/terminal/terminalPersistence.js`
  - `src/services/terminal/terminalShellIntegration.js`
  - `src/services/terminal/terminalEvents.js`
- `src/domains/terminal/terminalExecutionRuntime.js` now carries:
  - PTY session startup
  - shell bootstrap injection
  - chunked terminal writes
  - multiline REPL temp-file command building
  - create/focus/send-to-REPL event routing
- `src/domains/terminal/terminalHydrationRuntime.js` now carries:
  - workspace-bound terminal snapshot persistence
  - workspace reset / live-session disposal
  - snapshot hydration and invalid-id repair
  - localized-label refresh after restore
- `src/domains/terminal/terminalLifecycleRuntime.js` now carries:
  - base-group creation
  - terminal instance creation
  - instance/group activation
  - tab reorder and rename flows
  - split/create/shared/language/log terminal lifecycle orchestration
- `src/domains/terminal/terminalLogRuntime.js` now carries:
  - log buffer mutation
  - log status mapping
  - formatted build-log text generation
  - build/tool log event routing
- `src/domains/terminal/terminalSessionRuntime.js` now carries:
  - PTY close/reset teardown
  - session exit state repair
  - cwd/surface-size updates
  - command-marker start/finish tracking
- The store still directly mixes several distinct concerns:
  - simple find UI state setters
  - runtime accessor wiring
  - thin lookup helpers
- `terminal` is now thin enough that the next high-value Phase 2 slice should shift to `chat`.

### Backend current state

Rust backend structure is still largely flat.

Large backend modules still include:

- `src-tauri/src/latex.rs`
- `src-tauri/src/fs_commands.rs`
- `src-tauri/src/kernel.rs`
- `src-tauri/src/pdf_translate.rs`
- `src-tauri/src/git.rs`

This means the backend has not yet entered the target command/core/service/model layering.

### Docs state

The docs baseline is much stronger than before, but it still requires ongoing maintenance.

Observed repository reality as of 2026-03-23:

- `docs/REFACTOR_BLUEPRINT.md` remains the primary execution document.
- `docs/OPERATIONS.md` and `docs/GIT_AND_SNAPSHOTS.md` now exist and document the current Phase 3/4 boundaries truthfully.
- `docs/DATA_MODEL.md` now exists and documents the explicit snapshot record/index/payload seams truthfully.
- `docs/AI_SYSTEM.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAINS.md`, `docs/BUILD_SYSTEM.md`, `docs/CONTRIBUTING.md`, and `docs/TESTING.md` now also exist and reflect the current frontend/runtime-heavy architecture truthfully.
- The repository now has a real top-level architecture/testing/docs baseline instead of relying only on the blueprint plus a few phase-specific docs.

At the moment, the most established active refactor docs are `docs/REFACTOR_BLUEPRINT.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAINS.md`, `docs/OPERATIONS.md`, `docs/DATA_MODEL.md`, `docs/GIT_AND_SNAPSHOTS.md`, `docs/AI_SYSTEM.md`, `docs/BUILD_SYSTEM.md`, `docs/CONTRIBUTING.md`, and `docs/TESTING.md`.

### Safety model observations

Safety boundaries are still not clean.

Important remaining coupling:
- `workspaceAutoCommit`
- version history flows
- app-level history triggers
- Git-based safety expectations
- named "snapshot" UI semantics now use a shared history-message runtime, an explicit history-point operation wrapper, and a dedicated Footer prompt seam, but the backend is still Git-backed rather than a first-class app-level snapshot store

This means autosave, local snapshot, git commit, and remote sync are much more explicit than before, but still not fully separated because explicit workspace save points still create Git commits for the underlying content state and remote sync still rides on the same repository.

## Phase Plan

### Phase 0 - Inventory and Truthful Documentation
Goal:
- record the real repository structure
- identify actual bottlenecks
- replace placeholder planning with truthful documentation

Status:
- Complete

Exit criteria:
- current structure documented truthfully
- major bottlenecks identified
- blueprint is no longer a placeholder

### Phase 1 - App and Domain Skeleton
Goal:
- establish `src/app` entry-layer boundaries
- shrink `App.vue`
- begin app/domain separation
- establish early domain boundaries

Status:
- In progress, late stage

What has already happened:
- workspace lifecycle extraction
- shell event bridge extraction
- workspace history action extraction
- teardown extraction
- footer status sync extraction
- early `changes` boundary creation

Exit criteria:
- `App.vue` reduced to mostly composition/template/UI glue
- remaining root-level responsibilities explicitly documented
- no new business logic added back into root app layer

### Phase 2 - Store Boundary Reduction
Goal:
- reduce giant store responsibility
- move domain logic out of stores
- reduce cross-store orchestration pressure

Status:
- In progress

Completed phase slices:
- `references` first-round extraction completed
- `editor` first-round extraction completed
- `files` repeated runtime extraction sequence completed for the current phase focus
- `workspace` repeated runtime extraction sequence completed for the current phase focus

Current next target:
- Phase 2 no longer has a clearly higher-value active target; further work here should happen only if a non-cosmetic seam appears

Exit criteria:
- third large store/domain split begun and validated
- store responsibilities narrower and better documented
- migration notes identify legacy deletion targets

### Phase 3 - Project / Document / Build / Change Loop
Goal:
- stabilize the main product loop:
  - open project
  - edit document
  - save
  - build
  - review changes
- unify diagnostics and visibility of outcomes

Status:
- Complete for the current planned scope

What has already happened:
- `src/domains/document/documentWorkflowRuntime.js` established
- preview open/reconcile orchestration moved out of `src/stores/documentWorkflow.js`
- targeted runtime tests added for preview-pane reuse, split-right fallback, ready-preview reuse, and reconcile behavior
- targeted runtime tests now also cover adapter-context construction, adapter-specific log opening, markdown draft/preview problems, and queued compile visibility outside the Pinia shell

Exit criteria:
- coherent main loop documented
- build/diagnostic/change visibility improved
- core loop is more explicit than legacy cross-store behavior

### Phase 4 - Safety Model Separation
Goal:
- separate autosave, local snapshot, git commit, remote sync
- reduce hidden automation
- weaken Git’s role as implicit safety layer

Status:
- Complete for the current planned scope

What has already happened:
- `src/services/workspaceHistoryRepo.js` established
- history-repo init/seed behavior moved out of `src/services/workspaceAutoCommit.js`
- explicit auto-commit enablement moved to caller composition in `workspaceHistory` and `workspaceGitHub`
- targeted service tests added for repo init/seed and home-directory guard behavior
- `src/domains/changes/workspaceHistoryPreparationRuntime.js` established for pre-history file persistence
- `src/domains/changes/workspaceHistoryCommitRuntime.js` established for explicit history-commit execution and commit-message fallback
- `src/domains/changes/workspaceHistoryMessageRuntime.js` established for explicit history-message generation and classification across commit/runtime and version-history UI
- `src/domains/changes/workspaceHistoryAvailabilityRuntime.js` established for explicit history availability checks and optional auto-commit enablement
- `src/domains/changes/workspaceHistoryPointRuntime.js` established for explicit history-point intent resolution and orchestration across the new safety seams
- `src/app/changes/snapshotLabelPromptRuntime.js` / `src/app/changes/useSnapshotLabelPrompt.js` established for explicit Footer history-point prompt state
- `src/domains/changes/workspaceSnapshotRuntime.js`, `workspaceSnapshotMetadataRuntime.js`, and `workspaceSnapshotManifestRuntime.js` established for explicit snapshot records, metadata, and persisted manifest trailers above raw Git history
- `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js` and `workspaceLocalSnapshotPayloadRuntime.js` established for local workspace-save-point indexing plus app-managed payload capture/load/restore under `workspaceDataDir`
- `src/domains/changes/workspaceSnapshotProjectTextRuntime.js` established so payload capture broadens to the current filtered `project-text-set` without becoming a whole-workspace rewind
- `src/domains/changes/workspaceSnapshotPreviewRuntime.js`, `workspaceSnapshotDiffRuntime.js`, and `src/components/WorkspaceSnapshotDiffEditor.vue` established for app-managed preview summary, full diff surface, and chunk-level apply/restore without routing workspace preview through Git history
- `src/domains/changes/workspaceSnapshotFileApplyRuntime.js` established so preview-apply and payload restore both reuse the same app-managed file-write/editor-sync seam
- `src/domains/changes/workspaceSnapshotDeletionRuntime.js` established so payload-backed full restore can remove newly added in-scope project-text files without using `git checkout`
- empty `project-text-set` payload manifests are now preserved so later preview/remove flows can still represent “no in-scope files existed at this save point”
- file version history remains a separate Git-backed path through `workspaceVersionHistoryRuntime.js` and `VersionHistory.vue`

Exit criteria:
- explicit safety model documented
- auto-commit/history coupling reduced
- recovery model clearer to users and maintainers

### Phase 5 - AI Workflow Discipline
Goal:
- constrain AI to proposal/patch/review
- prevent direct broad side effects
- move toward operation-aligned AI paths

Status:
- Complete for the current planned scope

Exit criteria:
- AI behavior documented
- at least one narrow proposal-first workflow planned or implemented
- no expansion of direct-action AI paths

### Phase 6 - Cleanup and Stabilization
Goal:
- delete dead legacy paths
- build missing docs
- add tests and validation
- reduce ambiguity in the repository

Status:
- Complete for the current planned scope

Exit criteria:
- missing core docs exist
- dead paths are identified and some are removed
- validation story is stronger than raw build-only confidence

## Task Backlog

### Highest-priority backlog

- [x] Audit `src/stores/files.js` in detail and identify the cleanest first extraction slice
- [x] Create `src/domains/files/*` or equivalent runtime boundary for the first `files` slice
- [x] Validate the first `files` extraction with build verification
- [x] Decide whether the next slice stays in `files` or shifts to `workspace`
- [x] Extract the `files` refresh/runtime orchestration slice into `src/domains/files/*`
- [x] Validate the `files` refresh/runtime extraction with targeted runtime tests and build verification
- [x] Decide whether the next safe slice remains in `files` watch/poll orchestration or shifts to `workspace`
- [x] Extract the `files` watch/poll orchestration slice into `src/domains/files/*`
- [x] Validate the `files` watch/poll extraction with targeted runtime tests and build verification
- [x] Remove the dead `files` flat-file cache gate and unused active-file state left behind after the runtime splits
- [x] Decide whether the next safe slice is `files` tree hydration/runtime or a docs/architecture catch-up slice
- [x] Extract the `files` tree hydration/runtime slice into `src/domains/files/*`
- [x] Validate the `files` tree hydration/runtime extraction with targeted runtime tests and build verification
- [x] Decide whether the next safe slice remains in `files` flat-file indexing/runtime or shifts to architecture/doc catch-up
- [x] Extract the `files` flat-file indexing/runtime slice into `src/domains/files/*`
- [x] Validate the `files` flat-file indexing/runtime extraction with targeted runtime tests and build verification
- [x] Decide whether the next safe slice remains in `files` content/runtime or shifts to architecture/doc catch-up
- [x] Extract the `files` content/runtime slice into `src/domains/files/*`
- [x] Validate the `files` content/runtime extraction with targeted runtime tests and build verification
- [x] Decide whether the next safe slice remains in `files` entry-creation/import runtime or shifts to architecture/doc catch-up
- [x] Extract the `files` entry-creation/import runtime slice into `src/domains/files/*`
- [x] Validate the `files` entry-creation/import runtime extraction with targeted runtime tests and build verification
- [x] Decide whether rename/move/delete should become a dedicated file-operations boundary or wait until `docs/OPERATIONS.md` exists
- [x] Extract the `files` rename/move/delete coordination slice into `src/domains/files/*` without widening cross-store leakage
- [x] Validate the rename/move/delete slice against editor-tab migration, wiki-link updates, and delete-race behavior
- [x] Decide whether the next safe slice shifts from `files` to `workspace` timer/runtime orchestration
- [x] Extract the `workspace` auto-commit + GitHub sync timer/runtime slice into `src/domains/workspace/*` or `src/app/workspace/*`
- [x] Validate the `workspace` timer/runtime extraction with targeted tests and build verification
- [x] Decide whether the next safe slice after timer/runtime extraction is GitHub session lifecycle or settings/bootstrap loading
- [x] Extract the `workspace` GitHub session lifecycle slice into `src/domains/workspace/*`
- [x] Validate the `workspace` GitHub session lifecycle extraction with targeted tests and build verification
- [x] Extract the `workspace` settings/instructions/runtime slice into `src/domains/workspace/*`
- [x] Validate the `workspace` settings/instructions/runtime extraction with targeted tests and build verification
- [x] Decide whether the next safe `workspace` slice is bootstrap/watch orchestration or preference-state cleanup
- [x] Extract the `workspace` bootstrap/watch orchestration slice into `src/domains/workspace/*`
- [x] Validate the `workspace` bootstrap/watch extraction with targeted tests and build verification
- [x] Decide whether `workspace` still merits another high-value extraction or whether Phase 2 focus should shift to the next large store
- [x] Audit `src/stores/terminal.js` in detail and identify the cleanest first extraction slice
- [x] Extract the first `terminal` runtime/domain slice into `src/domains/terminal/*`
- [x] Validate the first `terminal` slice with targeted tests and build verification
- [x] Decide whether the second `terminal` slice should target hydration/persistence or close/reset lifecycle
- [x] Extract the `terminal` hydration/persistence slice into `src/domains/terminal/*`
- [x] Validate the `terminal` hydration/persistence slice with targeted tests and build verification
- [x] Extract the `terminal` instance/group lifecycle slice into `src/domains/terminal/*`
- [x] Validate the `terminal` instance/group lifecycle slice with targeted tests and build verification
- [x] Extract the `terminal` log-routing/runtime slice into `src/domains/terminal/*`
- [x] Validate the `terminal` log-routing/runtime slice with targeted tests and build verification
- [x] Extract the `terminal` session/teardown runtime slice into `src/domains/terminal/*`
- [x] Validate the `terminal` session/teardown runtime slice with targeted tests and build verification
- [x] Audit `src/stores/chat.js` in detail and identify the cleanest first extraction slice
- [x] Extract the `chat` persistence/runtime slice into `src/domains/chat/*` or equivalent
- [x] Validate the `chat` persistence/runtime slice with targeted tests and build verification
- [x] Extract the `chat` session/archive lifecycle slice into `src/domains/chat/*`
- [x] Validate the `chat` session/archive lifecycle slice with targeted tests and build verification
- [x] Extract the `chat` message/runtime slice into `src/domains/chat/*`
- [x] Validate the `chat` message/runtime slice with targeted tests and build verification
- [x] Extract the `chat` title/runtime slice into `src/domains/chat/*`
- [x] Validate the `chat` title/runtime slice with targeted tests and build verification
- [x] Extract the `chat` runtime-config slice into `src/domains/chat/*`
- [x] Validate the `chat` runtime-config slice with targeted tests and build verification
- [x] Extract the `chat` live-instance/runtime slice into `src/domains/chat/*`
- [x] Validate the `chat` live-instance/runtime slice with targeted tests and build verification
- [x] Audit `src/stores/references.js` in detail and identify the cleanest second-round extraction slice
- [x] Extract the `references` library save/watch/self-write slice into `src/domains/reference/*`
- [x] Validate the `references` library save/watch/self-write slice with targeted tests and build verification
- [x] Extract the `references` load/runtime slice into `src/domains/reference/*`
- [x] Validate the `references` load/runtime slice with targeted tests and build verification
- [x] Extract the `references` legacy migration/runtime slice into `src/domains/reference/*`
- [x] Validate the `references` legacy migration/runtime slice with targeted tests and build verification
- [x] Extract the `references` workspace/global view sync runtime slice into `src/domains/reference/*`
- [x] Validate the `references` workspace/global view sync runtime slice with targeted tests and build verification
- [x] Extract the `references` mutation/runtime slice for collections, saved views, workflow fields, and tags into `src/domains/reference/*`
- [x] Validate the `references` mutation/runtime slice with targeted tests and build verification
- [x] Extract the `references` CRUD/import runtime slice into `src/domains/reference/*`
- [x] Validate the `references` CRUD/import runtime slice with targeted tests and build verification
- [x] Extract the `references` asset/runtime slice into `src/domains/reference/*`
- [x] Validate the `references` asset/runtime slice with targeted tests and build verification
- [x] Audit `src/stores/editor.js` in detail and identify the cleanest next extraction seam after the existing first-round split
- [x] Extract the next `editor` runtime/domain slice into `src/domains/editor/*`
- [x] Validate the next `editor` slice with targeted tests and build verification
- [x] Audit `src/stores/documentWorkflow.js` and identify the first concrete Phase 3 main-loop extraction seam
- [x] Extract the first `documentWorkflow` runtime/domain slice into `src/domains/document/*`
- [x] Validate the first `documentWorkflow` slice with targeted tests and build verification

### Product and architecture docs

- [x] Create `docs/PRODUCT.md`
- [x] Create `docs/ARCHITECTURE.md`
- [x] Create `docs/DOMAINS.md`
- [x] Create `docs/BUILD_SYSTEM.md`
- [x] Create `docs/CONTRIBUTING.md`
- [x] Create `docs/TESTING.md`
- [x] Create `docs/OPERATIONS.md`

### Safety model

- [x] Document the current coupling between auto-commit and history/version flows
- [x] Create `docs/GIT_AND_SNAPSHOTS.md`
- [x] Identify a concrete first code slice for separating safety responsibilities
- [x] Extract the first history-repo bootstrap slice away from `workspaceAutoCommit`
- [x] Validate the first safety-model slice with targeted tests and build verification
- [x] Remove the temporary dynamic-import workaround introduced in `workspaceHistoryRepo` and keep the safety split statically testable
- [x] Extract the next Phase 3 document build/diagnostic slice so preview, compile status, and review visibility continue converging toward one main loop
- [x] Extract the pre-history file persistence slice out of `workspaceHistory` so explicit history actions stop mixing save orchestration with Git commit execution
- [x] Extract the Git add/status/commit execution plus commit-message fallback slice out of `workspaceHistory` so explicit history actions compose repo readiness, file preparation, and commit execution as separate safety steps
- [x] Extract history entry message classification out of UI heuristics so named snapshot affordances stop depending on hard-coded English Git commit prefixes
- [x] Extract history-repo readiness and auto-commit enablement out of `workspaceHistory` so availability checks become a dedicated safety boundary alongside preparation and commit execution
- [x] Introduce an explicit snapshot-intent / history-point operation wrapper so footer naming and version-history entry creation stop flowing through raw commit-message prompts
- [x] Extract Footer history-point prompt state out of generic save-confirmation UI state so snapshot naming no longer piggybacks on save-message timers and modal flags
- [x] Remove the now-unused `saveWorkspaceHistoryCommit` / `requestCommitMessage` bridge names once the UI path no longer depends on them
- [x] Reuse shared history message helpers from `workspaceAutoCommit` so auto-created history entries and version-history classification stop depending on duplicated `Auto:` formatting
- [x] Extract the local history bootstrap + remote-link preparation slice out of `workspaceGitHub.linkWorkspaceRepo` so remote binding stops directly orchestrating safety setup details
- [x] Align remaining user-facing snapshot wording with the current Git-backed history model so the UI stops implying a separate snapshot backend that does not exist yet
- [x] Extract the Git log/show/restore IO seam out of `VersionHistory.vue` so review-history UI stops owning file-history side effects directly
- [x] Add an explicit snapshot metadata seam above the Git-backed snapshot records so UI/runtime code stops re-deriving titles, named state, and preview/restore capability rules ad hoc
- [x] Define the first app-level snapshot backend/data-model slice above raw Git commit messages

### Backend planning

- [ ] Audit `src-tauri/src/latex.rs` for command/core/service split opportunities
- [ ] Audit `src-tauri/src/fs_commands.rs` for future boundary extraction
- [ ] Define first backend layering slice after frontend store work has progressed further

### Cleanup / validation

- [x] Identify dead or near-dead paths left behind by App/store extraction
- [x] Record deletion targets for temporary bridges
- [x] Strengthen validation beyond repeated build-only verification

## In Progress

- `src/app` entry-layer boundary construction
- reduction of `App.vue` toward composition-only role
- early `changes` domain boundary
- post-extraction stabilization after `references` first-round split
- post-extraction stabilization after `editor` first-round split
- transition of store-boundary reduction focus toward `files`
- `files` detailed audit completed; first narrow slice selected as tree cache / workspace snapshot runtime
- `files` first runtime extraction has landed; focus remains on `files` for at least one more slice before reevaluating `workspace`
- 2026-03-22 execution cycle: re-auditing `files` post-watch state, docs truthfulness, and validation gaps before the next code slice lands
- `files` refresh/runtime orchestration has now been extracted into a dedicated domain runtime module; next decision is whether to continue with watch/poll orchestration in the same domain
- `files` watch/poll orchestration has now also been extracted into a dedicated domain runtime module; remaining `files` runtime complexity is concentrated in tree hydration/loading and a small reconcile/status shell
- `files` tree hydration/runtime has now also been extracted into a dedicated domain runtime module; the next remaining `files` runtime knot is flat-file indexing and timer/promise coordination
- `files` flat-file indexing/runtime has now also been extracted into a dedicated domain runtime module; the next remaining `files` logic cluster is file content/PDF handling plus mutation-side orchestration
- `files` content/runtime has now also been extracted into a dedicated domain runtime module; the next remaining `files` logic cluster is creation/import mutations plus rename/move/delete coordination
- `files` entry-creation/import runtime has now also been extracted into a dedicated domain runtime module; the remaining `files` mutation logic is concentrated in rename/move/delete plus reconcile/status shell code
- `files` rename/move/delete is now also extracted as an explicit file-operations boundary; remaining `files` store logic is mostly state shell and reconcile/watch/bootstrap glue
- `workspace` automation/runtime orchestration is now extracted; remaining `workspace` store pressure has shifted to GitHub session lifecycle, settings/instructions IO, and bootstrap/watch sequencing
- `workspace` GitHub session lifecycle is now also extracted; the remaining `workspace` store pressure has shifted to settings/instructions IO plus bootstrap/watch sequencing
- `workspace` settings/instructions IO is now also extracted; the remaining `workspace` store pressure is concentrated in bootstrap/watch sequencing and a smaller preference-state shell
- `workspace` bootstrap/watch orchestration is now also extracted; the remaining `workspace` pressure is mostly a thinner preference/open-close shell rather than another large orchestration knot
- `terminal` audit is now underway; the first extraction target is session startup + command routing rather than persistence or cosmetic tab/group helpers
- `terminal` session startup + command routing is now extracted; the next execution cycle stays in `terminal` for hydration/persistence before touching lower-value UI helpers
- `terminal` hydration/persistence is now also extracted; the next execution cycle stays in `terminal` for instance/group lifecycle before shifting to log routing or close-teardown work
- `terminal` instance/group lifecycle is now also extracted; the next execution cycle stays in `terminal` for log-routing/runtime before deciding whether close/reset teardown is still worth another slice
- `terminal` log-routing/runtime is now also extracted; the next execution cycle stays in `terminal` for session/teardown runtime before deciding whether the store is thin enough to shift to `chat`
- `terminal` session/teardown runtime is now also extracted; Phase 2 focus now shifts to `chat`, starting with persistence/runtime orchestration
- `chat` persistence/runtime is now also extracted; the next execution cycle stays in `chat` for session/archive lifecycle before touching transport creation or message send paths
- `chat` session/archive lifecycle is now also extracted; the next execution cycle stays in `chat` for message send/build before deciding whether transport creation or title generation is the better follow-up seam
- `chat` message/runtime is now also extracted; the next execution cycle stays in `chat` for title generation before touching transport creation or runtime-config construction
- `chat` title/runtime is now also extracted; the next execution cycle stays in `chat` for runtime-config construction before touching the more coupled live Chat instance wiring
- `chat` runtime-config is now also extracted; the next execution cycle stays in `chat` for live Chat instance wiring before deciding whether the store is now thin enough to shift focus back to another boundary
- `chat` live-instance/runtime is now also extracted; the next execution cycle should shift Phase 2 focus away from `chat` because the remaining store shell is mostly accessors/getters rather than another large orchestration knot
- `references` library save/watch/self-write runtime is now also extracted; the next execution cycle stays in `references` for load-generation/runtime rather than jumping to another store too early
- `references` load/runtime is now also extracted; the next execution cycle stays in `references` for legacy migration/runtime rather than shifting away before the main remaining knot is split
- `references` legacy migration/runtime is now also extracted; the next execution cycle stays in `references` for workspace/global view synchronization before considering a shift to another store
- `references` workspace/global view runtime is now also extracted; the next execution cycle stays in `references` for mutation-heavy library operations before considering a shift to another store
- `references` mutation/runtime is now also extracted; the next execution cycle stays in `references` for CRUD/import coordination before considering a shift to another store
- `references` CRUD/runtime is now also extracted; the next execution cycle should decide whether asset/runtime is still a safe final `references` slice before shifting to another store
- `references` asset/runtime is now also extracted; the second-round `references` sequence is complete enough that the next execution cycle should shift Phase 2 focus to `editor`
- `editor` open-routing/runtime is now also extracted; reassessment shows the remaining editor shell is lower-value than starting the Phase 3 document preview/build/review loop
- `documentWorkflow` preview/open/reconcile runtime is now also extracted; the next execution cycle should decide whether the remaining main-loop priority is build/review flow work or the first safety-model cleanup follow-up
- 2026-03-22 execution cycle: the shared document build-operation seam plus compile-artifact lookup reroute are now landed, and the remaining Phase 3 knot is the typst preview/pdf shared-pane state machine still living in `useEditorPaneWorkflow.js`
- 2026-03-22 execution cycle: `documentWorkflowTypstPaneRuntime` is now landed, so the typst preview/pdf shared-pane state machine no longer lives in `useEditorPaneWorkflow.js`; the next remaining Phase 3 knot is the UI-facing action branching that still lives there
- 2026-03-22 execution cycle: extracting the remaining document workflow action branching out of `useEditorPaneWorkflow.js` so primary-action, reveal-preview, and preview-toggle routing converge behind a shared document action seam
- 2026-03-22 execution cycle: the current planned Phase 3 scope is now being closed after `documentWorkflowActionRuntime` landed; remaining `useEditorPaneWorkflow.js` direct workflow calls are thin wrappers or lower-priority AI-entry glue rather than the next best architectural knot
- 2026-03-23 execution cycle: `documentWorkflowAiRuntime` landed, `docs/AI_SYSTEM.md` was created, and the current planned Phase 5 scope is now complete around one explicit document-scoped patch-first AI entry seam rather than a broad AI rewrite
- `workspaceHistoryRepo` is now extracted as a first safety-model boundary, and the shared `pathExists` cleanup has removed its temporary dynamic-import workaround; the next execution cycle should shift back to the next concrete Phase 3 main-loop seam
- 2026-03-22 execution cycle: `docs/OPERATIONS.md` and `docs/GIT_AND_SNAPSHOTS.md` are now created, and the newest landed Phase 4 slice separates pre-history file persistence from Git commit execution in `workspaceHistory`
- 2026-03-22 execution cycle: `workspaceHistoryCommitRuntime` is now landed, so repo readiness, file preparation, and commit execution are separate safety steps
- 2026-03-22 execution cycle: `workspaceAutoCommitRuntime` is now landed, so auto-commit marker enablement, gating, and shared auto-history message construction are validated behind an explicit safety runtime
- 2026-03-22 execution cycle: `workspaceRepoLinkRuntime` is now landed, so remote linking no longer inlines history repo bootstrap, auto-commit enablement, remote setup, and initial local auto-commit ordering inside `workspaceGitHub.js`
- 2026-03-22 execution cycle: user-facing history wording and initial seed labels now avoid overstating an app-level snapshot backend that has not landed yet
- 2026-03-22 execution cycle: `workspaceVersionHistoryRuntime` is now landed, so Git-backed history list/load/restore IO no longer lives directly inside `VersionHistory.vue`
- 2026-03-22 execution cycle: the next Phase 4 step is no longer another narrow extraction; it is defining the first app-level snapshot backend/data-model slice above raw Git commit messages
- 2026-03-22 execution cycle: `workspaceSnapshotRuntime` is now landed, so version-history UI consumes explicit Git-backed snapshot objects instead of raw commit entries
- 2026-03-22 execution cycle: explicit history-point creation now also returns the same snapshot object family instead of only commit-message metadata
- 2026-03-22 execution cycle: the shared Git-backed snapshot operation boundary for create/list/preview/restore has now landed instead of splitting app actions across history-point and version-history runtimes
- 2026-03-22 execution cycle: snapshot-centric public action naming has now landed at the app-shell boundary, and the now-unused `workspaceHistory.js` bridge has been removed
- 2026-03-22 execution cycle: snapshot scope is now explicit so workspace-level save points are not misread as file-level restore records
- 2026-03-22 execution cycle: file-scope guards are now enforced around snapshot preview/restore so workspace-level save points cannot be misused as file-history entries
- 2026-03-22 execution cycle: `workspaceSnapshotMetadataRuntime` is now landed, so snapshot objects carry explicit title, named/system classification, and preview/restore capability metadata above the raw Git-backed record shape
- 2026-03-22 execution cycle: `workspaceSnapshotManifestRuntime` is now landed, so explicit workspace save points persist a Git-backed manifest trailer and keep `workspace` scope even when surfaced through file-scoped history
- 2026-03-22 execution cycle: the repo-wide workspace snapshot feed has now landed at the operation layer, and it lists only manifest-backed explicit workspace save points above the file-history path
- 2026-03-22 execution cycle: the repo-wide workspace snapshot feed is now wired into a separate workspace-snapshot browser instead of reusing `VersionHistory.vue`
- 2026-03-22 execution cycle: the file-scoped history surface is now being clarified as `File Version History` so it no longer shares one ambiguous name with workspace save points
- 2026-03-22 execution cycle: explicit file-history vs workspace-save-point operation names have now landed, so `workspaceSnapshot.js` no longer exposes one overloaded list/open surface to active UI callers
- 2026-03-22 execution cycle: explicit file-history preview/restore operation names have now landed, so active UI callers no longer depend on generic snapshot preview/restore names
- 2026-03-22 execution cycle: explicit file-history vs workspace-save-point runtime names have now landed, so the lower snapshot runtime mirrors the operation-layer truth instead of exposing only generic list/preview/restore seams
- 2026-03-22 execution cycle: the now-unused snapshot compatibility aliases have been deleted from `workspaceSnapshot.js` and `workspaceSnapshotRuntime.js`, so the snapshot/history surface no longer carries a dual-system bridge at those boundaries
- 2026-03-22 execution cycle: the last shell-level `open-version-history` legacy event alias has been deleted, and the app boundary now keeps only the explicit file-version-history / workspace-snapshot events
- 2026-03-22 execution cycle: `workspaceHistoryMessageRuntime` is now landed, so footer/version-history UI no longer infer named snapshots from hard-coded English commit prefixes
- 2026-03-22 execution cycle: `workspaceHistoryAvailabilityRuntime` is now landed, and repo-readiness details remain isolated beneath the shared snapshot/history seams instead of living inline at the app boundary
- 2026-03-22 execution cycle: continuing Phase 4 by introducing an explicit snapshot-intent / history-point operation wrapper so footer naming and version-history actions stop flowing through raw commit-message prompts
- 2026-03-22 execution cycle: re-auditing footer save-confirmation wiring and the app snapshot actions boundary so the next slice introduces a real history-point intent boundary instead of another commit-message bridge
- 2026-03-22 execution cycle: after landing the history-point wrapper, the next follow-up is to expose that app-level operation explicitly in action/composable wiring instead of keeping Git-centric save-and-commit names at the public boundary
- 2026-03-22 execution cycle: `workspaceHistoryPointRuntime` is now landed, and app/shell wiring now calls `createWorkspaceHistoryPoint` / `createHistoryPoint` instead of Git-centric save-and-commit names
- 2026-03-22 execution cycle: continuing Phase 4 by separating Footer history-point prompt state from generic save-confirmation UI state so snapshot naming no longer piggybacks on save timers
- 2026-03-22 execution cycle: extracting Footer history-point prompt state into its own runtime/composable so the UI shell matches the new `createHistoryPoint` operation boundary
- 2026-03-22 execution cycle: removing the now-unused `saveWorkspaceHistoryCommit` / `requestCommitMessage` compatibility bridge so the public history API stops leaking old Git-centric naming
- 2026-03-22 execution cycle: `snapshotLabelPromptRuntime` / `useSnapshotLabelPrompt` are now landed, and the public history API no longer exports the old save-and-commit bridge names
- 2026-03-22 execution cycle: continuing Phase 4 by unifying auto-commit message generation with the shared history message helper so automatic and explicit history entries use the same message semantics
- 2026-03-22 execution cycle: choosing the first true local snapshot backend path as a separate local store under `workspaceDataDir` instead of stacking another Git-only wrapper above the current manifest trailer
- 2026-03-22 execution cycle: the next narrow safety slice is a local workspace-save-point index only; file-history preview/restore stays Git-backed until restore semantics are designed explicitly
- 2026-03-22 execution cycle: the first local snapshot-store slice has now landed as a workspace-save-point index under `workspaceDataDir`, and the next gap is no longer store existence but defining a restorable local snapshot payload/restore seam
- 2026-03-22 execution cycle: the workspace snapshot feed now backfills manifest-backed Git save points into the local index so the new local store does not stay a new-records-only side path
- 2026-03-22 execution cycle: continuing Phase 4 by defining the first app-managed workspace-snapshot payload manifest and restore runtime without using `git checkout` or raw commit rewinds as the restore path
- 2026-03-22 execution cycle: the first restore slice is intentionally narrow and should restore only explicitly captured workspace-save-point payload files rather than inventing a whole-workspace rewind in one jump
- 2026-03-22 execution cycle: after landing the first payload/restore seam, the next narrow follow-up is exposing payload manifest summary in the workspace-snapshot browser so restore transparency improves alongside restore capability
- 2026-03-22 execution cycle: continuing Phase 4 by broadening workspace save-point payload capture from the initial open-file set toward the current loaded workspace text set while keeping restore app-managed and distinct from Git-backed file history
- 2026-03-22 execution cycle: the payload-backed workspace save-point seam now captures the current loaded workspace text set, persists an explicit payload `captureScope`, and surfaces that boundary in the workspace snapshot browser instead of leaving it implicit
- 2026-03-22 execution cycle: continuing Phase 4 by tightening the loaded-workspace-text payload boundary so PDF/binary/non-document paths do not leak into workspace save-point payloads through cached text fallbacks
- 2026-03-22 execution cycle: the loaded-workspace-text payload boundary is now explicit in code, so cached PDF extraction text and other binary/non-document paths no longer count as workspace snapshot payload candidates
- 2026-03-22 execution cycle: continuing Phase 4 by extracting an explicit project-text candidate seam so workspace save-point payload capture can broaden from the filtered loaded set to a broader project text set without falling back to ad hoc whole-project rewinds
- 2026-03-22 execution cycle: the project-text candidate seam is now landed, and payload-backed workspace save points now capture a filtered `project-text-set` derived from loaded text candidates plus the workspace flat-file index
- 2026-03-22 execution cycle: `workspaceTextFileLimits.js` is now extracted so snapshot payload capture can reuse the shared text read limit without importing the `fileStoreIO -> fileStoreEffects -> editor` chain during Node runtime tests
- 2026-03-22 execution cycle: broadened `project-text-set` capture is now transparent, because payload manifests record skipped/unreadable candidates and the workspace snapshot browser exposes that coverage instead of silently dropping it
- 2026-03-22 execution cycle: workspace save points now also expose a current-workspace preview summary above the payload manifest, so restore decisions are no longer made from capture counts alone
- 2026-03-22 execution cycle: workspace save points now also expose a per-file diff/content preview excerpt for modified or missing payload-backed files without routing preview through Git history
- 2026-03-22 execution cycle: workspace save-point restore can now target the selected file in the dedicated workspace snapshot browser instead of forcing every restore through the all-captured-files path
- 2026-03-22 execution cycle: selected-file workspace restore is now exposed as an explicit workspace snapshot operation seam instead of leaving the public app boundary on a generic `targetPaths` parameter bridge
- 2026-03-22 execution cycle: workspace save-point preview is now upgraded from excerpt cards to a fuller local patch/diff editor surface without routing preview through Git history
- 2026-03-22 execution cycle: the chunk-level apply/restore slice has now landed inside that diff surface without adding delete semantics or collapsing back into Git history
- 2026-03-22 execution cycle: workspace save-point diff review now supports explicit chunk-level apply/restore inside the app-managed snapshot boundary, while still avoiding delete semantics and Git-based workspace rewinds
- 2026-03-22 execution cycle: continuing Phase 4 by defining delete semantics only for the current app-managed `project-text-set` scope so full workspace save-point restore can remove newly added in-scope files without becoming a whole-workspace rewind
- 2026-03-22 execution cycle: continuing Phase 4 by preserving empty `project-text-set` payload manifests so delete semantics can still restore a save point that originally had no in-scope text files
- 2026-03-22 execution cycle: the current planned Phase 4 scope is now being closed after `project-text-set` added-file removal and empty-payload-manifest preservation landed; the next repository focus shifts back to the remaining Phase 3 build/review loop

## Completed

- Replaced placeholder blueprint content with a truthful execution-oriented blueprint
- Identified the real primary frontend bottlenecks
- Identified the real primary backend bottlenecks
- Established `src/app/workspace/useWorkspaceLifecycle.js`
- Established `src/app/shell/useAppShellEventBridge.js`
- Established `src/app/changes/useWorkspaceSnapshotActions.js`
- Established `src/app/teardown/useAppTeardown.js`
- Established `src/app/editor/useFooterStatusSync.js`
- Reduced `App.vue` substantially from its earlier monolithic role
- Established `src/domains/changes/workspaceHistory.js`
- Extracted `references` domain logic into:
  - `referenceMetadata.js`
  - `referenceWorkbench.js`
  - `referenceSearchExport.js`
  - `referenceImportMerge.js`
  - `referenceStorageIO.js`
- Extracted `editor` domain logic into:
  - `paneTreeLayout.js`
  - `paneTabs.js`
  - `editorSurfaces.js`
  - `editorPersistenceRuntime.js`
  - `editorViewRegistry.js`
  - `editorDirtyPersistence.js`
  - `editorInsertActions.js`
  - `editorCleanupRuntime.js`
  - `editorRestoreRuntime.js`
- Repeatedly validated migration slices with successful `npm run build`
- Audited `src/stores/files.js` and identified tree cache / workspace snapshot runtime as the first extraction slice
- Established `src/domains/files/fileTreeCacheRuntime.js`
- Moved `files` tree cache snapshotting, cached tree restore, and cached expanded-dir replay behind the new runtime module
- Reduced `src/stores/files.js` from 996 lines to 976 lines
- Validated the `files` slice with a fresh successful `npm run build`
- Established `src/domains/files/fileTreeRefreshRuntime.js`
- Moved loaded-directory traversal, tree snapshot diffing, and queued visible-tree refresh orchestration behind the new runtime module
- Reduced `src/stores/files.js` from 976 lines to 839 lines
- Added `tests/fileTreeRefreshRuntime.test.mjs` to validate merge/patch helpers and queued refresh behavior outside the Pinia store shell
- Validated the refresh/runtime slice with:
  - `node --test tests/fileTreeRefreshRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/files/fileTreeWatchRuntime.js`
- Moved file-watch filtering, debounce handling, activity tracking, visibility-aware polling, and filesystem listener lifecycle behind the new runtime module
- Reduced `src/stores/files.js` from 839 lines to 749 lines
- Added `tests/fileTreeWatchRuntime.test.mjs` to validate `.git` filtering, debounced watch handling, and refresh triggering outside the Pinia store shell
- Removed the dead `treeCacheByWorkspace[workspacePath]?.flatFilesReady` gate in favor of `_flatFilesWorkspace`-based cache reuse
- Removed the unused `activeFilePath` state that no longer participates in the main file workflow
- Validated the watch/runtime and cleanup slices with:
  - `node --test tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build` after the watch/runtime extraction
- Established `src/domains/files/fileTreeHydrationRuntime.js`
- Moved tree entry lookup, shallow root load, directory hydration, reveal/toggle expansion wiring, and post-mutation tree resync behind the new runtime module
- Reduced `src/stores/files.js` from 749 lines to 680 lines
- Added `tests/fileTreeHydrationRuntime.test.mjs` to validate nested entry lookup, directory-load promise coalescing, ancestor reveal expansion, and mutation-triggered tree resync outside the Pinia store shell
- Validated the hydration/runtime slice with:
  - `node --test tests/fileTreeHydrationRuntime.test.mjs tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/files/flatFilesIndexRuntime.js`
- Moved delayed recursive flat-file indexing, stale-generation suppression, and timer/promise lifecycle cleanup behind the new runtime module
- Reduced `src/stores/files.js` from 680 lines to 639 lines
- Added `tests/flatFilesIndexRuntime.test.mjs` to validate request coalescing, ready-cache reuse, stale workspace suppression, and timer cleanup outside the Pinia store shell
- Validated the flat-file indexing/runtime slice with:
  - `node --test tests/flatFilesIndexRuntime.test.mjs tests/fileTreeHydrationRuntime.test.mjs tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/files/fileContentRuntime.js`
- Moved PDF source-kind detection, PDF/text read behavior, save-path cache synchronization, and in-memory file-content updates behind the new runtime module
- Reduced `src/stores/files.js` from 639 lines to 583 lines
- Added `tests/fileContentRuntime.test.mjs` to validate PDF source-kind coalescing, PDF reload invalidation, text read failure handling, and save success/failure behavior outside the Pinia store shell
- Validated the content/runtime slice with:
  - `node --test tests/fileContentRuntime.test.mjs tests/flatFilesIndexRuntime.test.mjs tests/fileTreeHydrationRuntime.test.mjs tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/files/fileCreationRuntime.js`
- Moved create-file, duplicate, create-folder, and external-copy workspace entry creation flows behind the new runtime module
- `src/stores/files.js` ended at 587 lines after the extraction; the new runtime boundary landed, but the store shell grew slightly because the remaining rename/move/delete bridge code still dominates and now sits beside an additional runtime accessor
- Added `tests/fileCreationRuntime.test.mjs` to validate duplicate-name handling, forced folder hydration, and tree-sync behavior for duplicate/import flows outside the Pinia store shell
- Validated the entry-creation/import slice with:
  - `node --test tests/fileCreationRuntime.test.mjs tests/fileContentRuntime.test.mjs tests/flatFilesIndexRuntime.test.mjs tests/fileTreeHydrationRuntime.test.mjs tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/files/fileMutationRuntime.js`
- Moved rename, move, delete, cache migration, expanded-dir repair, and delete-race coordination behind the new runtime module
- Reduced `src/stores/files.js` from 587 lines to 579 lines
- Added `tests/fileMutationRuntime.test.mjs` to validate rename cache migration, move no-op/relocation behavior, and delete cleanup outside the Pinia store shell
- Validated the mutation/runtime slice with:
  - `node --test tests/fileMutationRuntime.test.mjs tests/fileCreationRuntime.test.mjs tests/fileContentRuntime.test.mjs tests/flatFilesIndexRuntime.test.mjs tests/fileTreeHydrationRuntime.test.mjs tests/fileTreeRefreshRuntime.test.mjs tests/fileTreeWatchRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/workspace/workspaceAutomationRuntime.js`
- Moved workspace auto-commit, sync timer lifecycle, auto-sync/fetch/sync-now orchestration, and timer cleanup behind the new runtime module
- Reduced `src/stores/workspace.js` from 809 lines to 791 lines
- Added `tests/workspaceAutomationRuntime.test.mjs` to validate timer scheduling, committed auto-sync flow, remote fetch reload behavior, and cleanup outside the Pinia store shell
- Validated the workspace automation/runtime slice with:
  - `node --test tests/workspaceAutomationRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/workspace/workspaceGitHubRuntime.js`
- Moved GitHub init/connect/disconnect/link/unlink state orchestration and sync-state application behind the new runtime module
- Reduced `src/stores/workspace.js` from 791 lines to 764 lines
- Added `tests/workspaceGitHubRuntime.test.mjs` to validate init, disconnect, link/unlink, and sync-state mapping outside the Pinia store shell
- Validated the workspace GitHub/runtime slice with:
  - `node --test tests/workspaceAutomationRuntime.test.mjs tests/workspaceGitHubRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/workspace/workspaceSettingsRuntime.js`
- Moved workspace settings load, instructions migration/load/open, key/model persistence, tool-permission IO, and skills-manifest IO behind the new runtime module
- Reduced `src/stores/workspace.js` from 764 lines to 755 lines
- Added `tests/workspaceSettingsRuntime.test.mjs` to validate settings load, provider-model sync, instructions IO, and tool-permission persistence outside the Pinia store shell
- Validated the workspace settings/runtime slice with:
  - `node --test tests/workspaceAutomationRuntime.test.mjs tests/workspaceGitHubRuntime.test.mjs tests/workspaceSettingsRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/workspace/workspaceBootstrapRuntime.js`
- Moved workspace bootstrap step sequencing, stale-generation guards, watch-directory registration, instructions listener lifecycle, usage kickoff, and auto-commit startup bridge behind the new runtime module
- Reduced `src/stores/workspace.js` from 755 lines to 727 lines
- Added `tests/workspaceBootstrapRuntime.test.mjs` to validate step order, stale bootstrap cancellation, listener refresh, and listener-failure resilience outside the Pinia store shell
- Validated the workspace bootstrap/runtime slice with:
  - `node --test tests/workspaceAutomationRuntime.test.mjs tests/workspaceGitHubRuntime.test.mjs tests/workspaceSettingsRuntime.test.mjs tests/workspaceBootstrapRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/terminal/terminalExecutionRuntime.js`
- Moved terminal session startup, shell integration bootstrap injection, chunked writes, multiline REPL temp-file command generation, and REPL event routing behind the new runtime module
- Reduced `src/stores/terminal.js` from 889 lines to 817 lines
- Added `tests/terminalExecutionRuntime.test.mjs` to validate session startup, chunked terminal writes, REPL temp-file commands, and terminal event routing outside the Pinia store shell
- Validated the first terminal/runtime slice with:
  - `node --test tests/terminalExecutionRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/terminal/terminalHydrationRuntime.js`
- Moved terminal snapshot persistence, workspace reset/session disposal, snapshot hydration, invalid-id repair, and localized-label refresh behind the new runtime module
- Reduced `src/stores/terminal.js` from 817 lines to 747 lines
- Added `tests/terminalHydrationRuntime.test.mjs` to validate snapshot persistence, workspace reset teardown, snapshot repair, and base-group restore outside the Pinia store shell
- Validated the second terminal/runtime slice with:
  - `node --test tests/terminalExecutionRuntime.test.mjs tests/terminalHydrationRuntime.test.mjs`
  - `npm run build`
- Established `src/domains/terminal/terminalLifecycleRuntime.js`
- Moved terminal base-group creation, instance/group activation, tab reorder, split/create flows, and shared/language/log terminal lifecycle orchestration behind the new runtime module
- Reduced `src/stores/terminal.js` from 747 lines to 613 lines
- Added `tests/terminalLifecycleRuntime.test.mjs` to validate base-group creation, terminal creation, repl split behavior, shared/log terminal reuse, and tab lifecycle mutations outside the Pinia store shell
- Validated the third terminal/runtime slice with:
  - `node --test tests/terminalExecutionRuntime.test.mjs tests/terminalHydrationRuntime.test.mjs tests/terminalLifecycleRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/terminal/terminalLogRuntime.js`
- Moved terminal log buffer mutation, status mapping, formatted build-log text generation, and tool/build log event routing behind the new runtime module
- Reduced `src/stores/terminal.js` from 613 lines to 566 lines
- Added `tests/terminalLogRuntime.test.mjs` to validate log buffering, status mapping, build-log formatting, and tool-log stream handling outside the Pinia store shell
- Validated the fourth terminal/runtime slice with:
  - `node --test tests/terminalExecutionRuntime.test.mjs tests/terminalHydrationRuntime.test.mjs tests/terminalLifecycleRuntime.test.mjs tests/terminalLogRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/terminal/terminalSessionRuntime.js`
- Moved terminal close/reset teardown, session exit repair, cwd/surface-size updates, and command-marker tracking behind the new runtime module
- Reduced `src/stores/terminal.js` from 566 lines to 508 lines
- Added `tests/terminalSessionRuntime.test.mjs` to validate close fallback behavior, snapshot clearing, session exit repair, and command-marker trimming outside the Pinia store shell
- Validated the fifth terminal/runtime slice with:
  - `node --test tests/terminalExecutionRuntime.test.mjs tests/terminalHydrationRuntime.test.mjs tests/terminalLifecycleRuntime.test.mjs tests/terminalLogRuntime.test.mjs tests/terminalSessionRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatPersistenceRuntime.js`
- Moved persisted chat meta loading, workspace chat bootstrap/reset, session save behavior, and cleanup/reset orchestration behind the new runtime module
- Reduced `src/stores/chat.js` from 854 lines to 796 lines
- Added `tests/chatPersistenceRuntime.test.mjs` to validate persisted meta sorting, session save/meta update, workspace bootstrap reset, and cleanup state clearing outside the Pinia store shell
- Validated the first chat/runtime slice with:
  - `node --test tests/chatPersistenceRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatSessionLifecycleRuntime.js`
- Moved session creation, AI metadata application, archive/background lifecycle, reopen/delete flows, and session removal cleanup behind the new runtime module
- Reduced `src/stores/chat.js` from 796 lines to 698 lines
- Added `tests/chatSessionLifecycleRuntime.test.mjs` to validate session creation, AI metadata sync, archive behavior, reopen behavior, and delete fallback cleanup outside the Pinia store shell
- Validated the second chat/runtime slice with:
  - `node --test tests/chatPersistenceRuntime.test.mjs tests/chatSessionLifecycleRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatMessageRuntime.js`
- Moved chat send gating, message text/file shaping, rich-html persistence, and live-session abort behavior behind the new runtime module
- Reduced `src/stores/chat.js` from 698 lines to 629 lines
- Added `tests/chatMessageRuntime.test.mjs` to validate multimodal send payload shaping, first-message labeling, send blocking, and abort behavior outside the Pinia store shell
- Validated the third chat/runtime slice with:
  - `node --test tests/chatMessageRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatTitleRuntime.js`
- Moved smart session-label helpers, UIMessage title text extraction, first-exchange title gating, and keyword persistence behind the new runtime module
- Reduced `src/stores/chat.js` from 629 lines to 543 lines
- Added `tests/chatTitleRuntime.test.mjs` to validate smart labels, title text extraction, first-exchange gating, and plain-text/JSON title persistence outside the Pinia store shell
- Validated the fourth chat/runtime slice with:
  - `node --test tests/chatTitleRuntime.test.mjs tests/chatMessageRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatRuntimeConfigRuntime.js`
- Moved runtime config assembly, no-key gating, runtime metadata persistence, and usage/cost accounting behind the new runtime module
- Reduced `src/stores/chat.js` from 543 lines to 482 lines
- Added `tests/chatRuntimeConfigRuntime.test.mjs` to validate missing-key gating, runtime metadata updates, usage recording, and `opencode` no-access behavior outside the Pinia store shell
- Validated the fifth chat/runtime slice with:
  - `node --test tests/chatRuntimeConfigRuntime.test.mjs tests/chatTitleRuntime.test.mjs tests/chatMessageRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/chat/chatLiveInstanceRuntime.js`
- Moved Chat instance creation/reuse, broken tool-call recovery, artifact sync lifecycle, and ready-state persistence wiring behind the new runtime module
- Reduced `src/stores/chat.js` from 482 lines to 381 lines
- Added `tests/chatLiveInstanceRuntime.test.mjs` to validate instance reuse, artifact sync teardown, ready-state side effects, and broken tool-call recovery outside the Pinia store shell
- Validated the sixth chat/runtime slice with:
  - `node --test tests/chatLiveInstanceRuntime.test.mjs tests/chatRuntimeConfigRuntime.test.mjs tests/chatTitleRuntime.test.mjs tests/chatMessageRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowBuildRuntime.js`
- Moved workflow adapter context construction, adapter-specific log opening, problem aggregation, UI-state lookup, and toolbar status-text/tone helpers behind the new document runtime seam
- Reduced `src/stores/documentWorkflow.js` from 400 lines to 381 lines while removing duplicated build/diagnostic wiring from `src/composables/useEditorPaneWorkflow.js`
- Added `tests/documentWorkflowBuildRuntime.test.mjs` to validate adapter-context construction, compile-log routing, markdown draft/preview problems, and queued LaTeX visibility outside the Pinia shell
- Adjusted LaTeX and Typst workflow adapters to lazy-load compile preflight helpers so document-workflow runtime tests can exercise build/diagnostic behavior without pulling compile-only environment setup into module load
- Validated the second document-workflow slice with:
  - `node --test tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowBuildOperationRuntime.js`
- Rerouted `src/stores/documentWorkflow.js` and `src/composables/useEditorPaneWorkflow.js` so LaTeX/Typst build launch now goes through the shared document build operation seam instead of the composable calling compile adapters directly
- Extended `src/domains/document/documentWorkflowBuildRuntime.js` plus the same store/composable path so compile-artifact lookup for typst/pdf reveal also stays behind the document workflow build/runtime boundary instead of reading compile adapters directly in the composable
- Added `tests/documentWorkflowBuildOperationRuntime.test.mjs` and expanded `tests/documentWorkflowBuildRuntime.test.mjs` to validate shared build execution delegation plus adapter-specific artifact-path lookup outside the UI shell
- Updated `docs/OPERATIONS.md` to describe the new document build operation seam truthfully
- Validated the next two document-workflow slices with:
  - `node --test tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkflowBuildOperationRuntime.test.mjs`
  - `node --test tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkflowBuildOperationRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowTypstPaneRuntime.js`
- Rerouted `src/stores/documentWorkflow.js` and `src/composables/useEditorPaneWorkflow.js` so typst preview/pdf shared-pane reuse, overlay/owned-pane switching, and close-preview reconciliation now run through the new typst pane runtime instead of UI glue
- Added `tests/documentWorkflowTypstPaneRuntime.test.mjs` to validate overlay toggling, owned-pane reuse, and shared-pane close behavior outside the composable shell
- Updated `docs/OPERATIONS.md` to describe the new typst pane runtime and the thinner composable truthfully
- Validated the next document-workflow slice with:
  - `node --test tests/documentWorkflowTypstPaneRuntime.test.mjs tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkflowBuildOperationRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowActionRuntime.js`
- Rerouted `src/stores/documentWorkflow.js` and `src/composables/useEditorPaneWorkflow.js` so markdown preview toggles, primary compile-vs-preview routing, reveal-preview routing, and typst reveal-PDF delegation now run through the new document action runtime instead of UI-facing branching
- Added `tests/documentWorkflowActionRuntime.test.mjs` to validate markdown preview toggles, compile primary actions, typst delegation, and generic reveal-preview routing outside the composable shell
- Updated `docs/OPERATIONS.md` to describe the new document action runtime and the current planned Phase 3 closure truthfully
- Validated the next document-workflow slice with:
  - `node --test tests/documentWorkflowActionRuntime.test.mjs tests/documentWorkflowTypstPaneRuntime.test.mjs tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkflowBuildOperationRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowAiRuntime.js`
- Rerouted `src/stores/documentWorkflow.js` and `src/composables/useEditorPaneWorkflow.js` so document workflow AI diagnose/fix launch now goes through the new document AI runtime instead of the composable building TeX/Typst tasks and calling `launchAiTask(...)` directly
- Added `tests/documentWorkflowAiRuntime.test.mjs` to validate document-scoped AI launch routing, preserved launcher metadata, and unsupported-file guards outside the composable shell
- Deleted the now-unused typst-specific store bridge methods after the action runtime stopped calling them
- Created `docs/AI_SYSTEM.md` to document the current AI workflow system truthfully, including the existing TeX/Typst diagnosis-vs-patch approval behavior
- Updated `docs/OPERATIONS.md` to describe the new document AI runtime, `RunAiWorkflow` partial operation seam, and the current planned Phase 5 closure truthfully
- Validated the first Phase 5 slice plus dead-bridge cleanup with:
  - `node --test tests/documentWorkflowAiRuntime.test.mjs tests/documentWorkflowActionRuntime.test.mjs tests/documentWorkflowTypstPaneRuntime.test.mjs tests/documentWorkflowRuntime.test.mjs tests/documentWorkflowBuildRuntime.test.mjs tests/documentWorkflowBuildOperationRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Revalidated the landed Phase 5 scope after doc closure with:
  - targeted document workflow/AI suites passing `23/23`
  - `node --test tests/*.test.mjs` passing `331/331`
  - `npm run build` succeeding with only the pre-existing Vite dynamic-import and chunk-size warnings
- Created `docs/OPERATIONS.md` to document the real current operation seams around project/document/build/change flow
- Created `docs/GIT_AND_SNAPSHOTS.md` to document the real current safety model and the remaining autosave/snapshot/Git/sync coupling
- Established `src/domains/changes/workspaceHistoryPreparationRuntime.js`
- Moved dirty-editor persistence, eligible open-file save preparation, and history-path filtering out of `src/domains/changes/workspaceHistory.js`
- Added `tests/workspaceHistoryPreparationRuntime.test.mjs` to validate dirty-file persistence, eligible path filtering, and early-return save failures outside the Git commit shell
- Validated the second safety-model slice with:
  - `node --test tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceHistoryCommitRuntime.js`
- Moved explicit history `git add` / `git status` / `git commit` execution and default message fallback out of `src/domains/changes/workspaceHistory.js`
- Added `tests/workspaceHistoryCommitRuntime.test.mjs` to validate preferred/requested/fallback commit messages plus no-change handling outside the workspace history shell
- Validated the third safety-model slice with:
  - `node --test tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceHistoryMessageRuntime.js`
- Moved explicit history save/auto message formatting plus named-vs-system entry classification out of `VersionHistory.vue` and `workspaceHistoryCommitRuntime.js`
- Added `tests/workspaceHistoryMessageRuntime.test.mjs` to validate English and translated system-message detection plus named-entry classification outside the UI shell
- Validated the fourth safety-model slice with:
  - `node --test tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceHistoryAvailabilityRuntime.js`
- Moved history-repo readiness, home-directory unavailability handling, and optional auto-commit enablement out of `src/domains/changes/workspaceHistory.js`
- Added `tests/workspaceHistoryAvailabilityRuntime.test.mjs` to validate unavailable workspaces, existing auto-commit reuse, and enable-on-demand behavior outside the domain shell
- Fixed legacy extension-less imports in `src/services/workspaceAutoCommit.js` so the new availability runtime stays Node-testable under ESM
- Validated the fifth safety-model slice with:
  - `node --test tests/workspaceHistoryAvailabilityRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceHistoryPointRuntime.js`
- Moved app-level history-point intent resolution above the availability/preparation/message/commit seams and rerouted the app snapshot actions boundary, `useAppShellEventBridge`, and `App.vue` to `createWorkspaceHistoryPoint` / `createHistoryPoint`
- Added `tests/workspaceHistoryPointRuntime.test.mjs` to validate named-history intent, default save fallback, and no-change handling outside the app shell
- Updated `docs/OPERATIONS.md` and `docs/GIT_AND_SNAPSHOTS.md` so the current public operation path is described as history-point creation rather than Git-centric save+commit wording
- Validated the sixth safety-model slice with:
  - `node --test tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceHistoryAvailabilityRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/app/changes/snapshotLabelPromptRuntime.js` and `src/app/changes/useSnapshotLabelPrompt.js`
- Moved Footer history-point prompt timers, dialog visibility, and pending confirmation resolution out of `src/components/layout/Footer.vue`
- Added `tests/snapshotLabelPromptRuntime.test.mjs` to validate named-dialog resolution, timeout fallback, restart behavior, and dispose cleanup outside the Footer shell
- Removed the unused `saveWorkspaceHistoryCommit` alias and `requestCommitMessage` bridge from `src/domains/changes/workspaceHistory.js`, and updated the Footer shortcut label to use plain save wording instead of Git-centric copy
- Validated the seventh safety-model slice with:
  - `node --test tests/snapshotLabelPromptRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceHistoryAvailabilityRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceAutoCommitRuntime.js`
- Moved auto-commit marker enablement, home-directory gating, shared auto-message construction, and timed Git add/status/commit execution behind the new safety runtime
- Added `tests/workspaceAutoCommitRuntime.test.mjs` to validate marker enablement, home-directory blocking, no-change handling, and shared message construction outside the service shell
- Validated the eighth safety-model slice with:
  - `node --test tests/workspaceAutoCommitRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryAvailabilityRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceHistoryPreparationRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/git/workspaceRepoLinkRuntime.js`
- Moved local history bootstrap, optional auto-commit enablement, remote setup/gitignore ordering, and swallow-on-failure initial auto-commit behavior out of `src/services/workspaceGitHub.js`
- Added `tests/workspaceRepoLinkRuntime.test.mjs` to validate missing-path no-op, failed local-history preparation, and preserved remote-link ordering outside the service shell
- Validated the ninth safety-model slice with:
  - `node --test tests/workspaceRepoLinkRuntime.test.mjs tests/workspaceGitHubRuntime.test.mjs tests/workspaceAutoCommitRuntime.test.mjs tests/workspaceHistoryAvailabilityRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Aligned user-facing history wording so the naming dialog no longer says `Create Snapshot`, and changed initial seed labels from `Initial snapshot` to `Initial history`
- Established `src/domains/changes/workspaceVersionHistoryRuntime.js`
- Moved Git-backed version-history list/load/restore IO out of `src/components/VersionHistory.vue` while preserving unsupported-binary behavior and named-entry affordances
- Added `tests/workspaceVersionHistoryRuntime.test.mjs` to validate history list loading, preview loading, and restore/reload behavior outside the component shell
- Validated the tenth and eleventh safety/review slices with:
  - `node --test tests/workspaceVersionHistoryRuntime.test.mjs tests/workspaceHistoryMessageRuntime.test.mjs tests/workspaceHistoryRepo.test.mjs tests/workspaceRepoLinkRuntime.test.mjs tests/workspaceGitHubRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotRuntime.js`
- Moved Git-backed snapshot record mapping out of raw `VersionHistory.vue` commit handling so UI code now consumes explicit snapshot objects instead of raw Git entries
- Added `tests/workspaceSnapshotRuntime.test.mjs` to validate Git-entry mapping, snapshot listing, preview loading, restore behavior, and explicit `workspace` vs `file` scope semantics outside the component shell
- Established `src/domains/changes/workspaceSnapshot.js`
- Moved snapshot create/list/preview/restore behavior behind a shared Git-backed snapshot operation boundary and rerouted `useWorkspaceSnapshotActions`, `useAppShellEventBridge`, `App.vue`, and `VersionHistory.vue` through that boundary
- Added `tests/workspaceSnapshot.test.mjs` to validate create/open/list/preview/restore delegation outside the app shell
- Removed the now-unused `src/domains/changes/workspaceHistory.js` bridge after all public callers moved to the shared snapshot boundary
- Validated the twelfth, thirteenth, and fourteenth safety-model slices with:
  - `node --test tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceHistoryCommitRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotMetadataRuntime.js`
- Moved snapshot title, named/system classification, and preview/restore capability derivation out of ad hoc UI/runtime helpers and behind an explicit metadata seam
- Added `tests/workspaceSnapshotMetadataRuntime.test.mjs` to validate metadata derivation and attachment behavior outside the component shell
- Established `src/domains/changes/workspaceSnapshotManifestRuntime.js`
- Persisted explicit workspace snapshot manifest trailers in the Git-backed history message path and parsed them back into snapshot records before falling back to legacy message heuristics
- Extended `src/domains/changes/workspaceVersionHistoryRuntime.js` with repo-wide history loading and `src/domains/changes/workspaceSnapshotRuntime.js` with a separate workspace snapshot feed filtered to manifest-backed explicit save points
- Added `tests/workspaceSnapshotManifestRuntime.test.mjs` and expanded snapshot/version-history tests to validate persisted manifest parsing, workspace-scope preservation inside file history, and repo-wide workspace snapshot feed filtering
- Validated the fifteenth, sixteenth, and seventeenth safety-model/data-model slices with:
  - `node --test tests/workspaceSnapshotManifestRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Split file-history vs workspace-save-point app-facing operation names in `src/domains/changes/workspaceSnapshot.js` into explicit `openFileVersionHistoryBrowser`, `listFileVersionHistory`, and `listWorkspaceSavePoints` wrappers while keeping compatibility aliases temporarily
- Rerouted `src/components/VersionHistory.vue`, `src/components/WorkspaceSnapshotBrowser.vue`, and `src/app/changes/useWorkspaceSnapshotActions.js` to the explicit file/workspace operation names so active UI callers no longer depend on the overloaded list/open surface
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` to describe the explicit file/workspace operation split truthfully
- Expanded `tests/workspaceSnapshot.test.mjs` to validate the new explicit wrappers and the retained compatibility aliases
- Validated the eighteenth safety-model slice with:
  - `node --test tests/workspaceSnapshot.test.mjs tests/workspaceHistoryActions.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshotManifestRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Split file-history preview/restore app-facing operation names in `src/domains/changes/workspaceSnapshot.js` into explicit `loadFileVersionHistoryPreview` and `restoreFileVersionHistoryEntry` wrappers while keeping generic compatibility aliases temporarily
- Rerouted `src/components/VersionHistory.vue` to the explicit file-history preview/restore operation names so active UI callers no longer depend on generic snapshot preview/restore names
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the explicit file-history preview/restore split truthfully
- Expanded `tests/workspaceSnapshot.test.mjs` to validate the explicit preview/restore wrappers and the retained compatibility aliases
- Validated the nineteenth safety-model slice with:
  - `node --test tests/workspaceSnapshot.test.mjs tests/workspaceHistoryActions.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshotManifestRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Split the lower snapshot runtime names in `src/domains/changes/workspaceSnapshotRuntime.js` into explicit `listFileVersionHistoryEntries`, `listWorkspaceSavePointEntries`, `loadFileVersionHistoryPreview`, and `restoreFileVersionHistoryEntry` seams while keeping generic compatibility aliases temporarily
- Rerouted `src/domains/changes/workspaceSnapshot.js` to the explicit lower runtime entry points instead of the generic overloaded ones
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the explicit runtime split truthfully
- Expanded `tests/workspaceSnapshotRuntime.test.mjs` and `tests/workspaceSnapshot.test.mjs` to validate the explicit runtime seams plus the retained compatibility aliases
- Validated the twentieth safety-model slice with:
  - `node --test tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotActions.test.mjs tests/workspaceSnapshotManifestRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Deleted the now-unused overloaded compatibility aliases from `src/domains/changes/workspaceSnapshot.js` and `src/domains/changes/workspaceSnapshotRuntime.js` so explicit file-history and workspace-save-point seams are now the only remaining public entry points
- Trimmed snapshot tests to stop asserting the deleted compatibility aliases and keep validation focused on the surviving explicit seams
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the alias removal truthfully
- Validated the twenty-first safety-model slice with:
  - `node --test tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotActions.test.mjs tests/workspaceSnapshotManifestRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Renamed `src/app/changes/useWorkspaceSnapshotActions.js`, `src/app/changes/snapshotLabelPromptRuntime.js`, and `src/app/changes/useSnapshotLabelPrompt.js` so the public app boundary now describes snapshot actions and snapshot labeling instead of leaking old history-point wording
- Deleted the last shell-level `open-version-history` listener from `src/app/shell/useAppShellEventBridge.js` so the app boundary keeps only explicit file-version-history and workspace-snapshot events
- Renamed the prompt/action tests to `tests/snapshotLabelPromptRuntime.test.mjs` and `tests/workspaceSnapshotActions.test.mjs` and rerouted the Footer/snapshot action path to the new app-layer names
- Validated the twenty-second safety-model slice with:
  - `node --test tests/snapshotLabelPromptRuntime.test.mjs tests/workspaceSnapshotActions.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceHistoryPointRuntime.test.mjs tests/workspaceVersionHistoryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js`
- Moved local workspace-save-point index path resolution, local record normalization, explicit save-point recording, and manifest-backed Git backfill into the new local snapshot-store runtime
- Rerouted `src/domains/changes/workspaceSnapshot.js`, `src/domains/changes/workspaceSnapshotRuntime.js`, and `src/components/WorkspaceSnapshotBrowser.vue` so workspace save points now record/list through `workspaceDataDir`-backed local index paths while file preview/restore stays Git-backed
- Added `tests/workspaceLocalSnapshotStoreRuntime.test.mjs` and expanded `tests/workspaceSnapshot.test.mjs` / `tests/workspaceSnapshotRuntime.test.mjs` to validate local index recording, Git-backfill syncing, and local-store-aware workspace save-point listing
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` to describe the new hybrid local-index-plus-Git snapshot boundary truthfully
- Validated the twenty-third and twenty-fourth safety-model slices with:
  - `node --test tests/workspaceLocalSnapshotStoreRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceHistoryPointRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js`
- Moved payload-manifest path resolution, captured-file payload writing, payload-manifest loading, and app-managed workspace-save-point restore into the new local payload runtime
- Rerouted `src/domains/changes/workspaceSnapshot.js` so explicit workspace save points now capture payload manifests on create, expose payload-manifest loading for the browser, and restore payload-backed save points without using `git checkout`
- Added a narrow `TextEditor` runtime hook so open text editors can accept restored payload content without leaving stale persisted-state markers behind
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` so payload-backed workspace save points now show captured-file summaries and expose a restore action while older/backfilled save points remain listable without a restore button
- Added `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs` and expanded `tests/workspaceSnapshot.test.mjs` / `tests/workspaceSnapshotMetadataRuntime.test.mjs` to validate payload capture, payload-backed restore, browser-summary loading, and workspace restore capabilities
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the new payload-manifest-plus-restore boundary truthfully
- Validated the twenty-fifth and twenty-sixth safety-model slices with:
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceLocalSnapshotStoreRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Broadened `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` from the initial open-file-only payload set to the current loaded workspace text set and persisted explicit payload `captureScope` metadata for both local records and payload manifests
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` so payload-backed workspace save points now expose their capture-scope boundary instead of showing all payload-backed entries as if they had identical restore semantics
- Expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs`, `tests/workspaceSnapshotMetadataRuntime.test.mjs`, and `tests/workspaceSnapshot.test.mjs` to validate loaded-cache payload capture, capture-scope persistence, and backward-compatible older payload metadata behavior
- Validated the twenty-seventh safety-model slice with:
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceLocalSnapshotStoreRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Tightened `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` so the loaded-workspace-text payload set now explicitly excludes PDF/binary/non-document paths instead of relying on generic cached-string membership
- Expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs` again to validate that cached PDF extraction text and opened PDF paths do not leak into workspace save-point payload capture
- Validated the twenty-eighth safety-model slice with:
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshot.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotProjectTextRuntime.js`
- Established `src/domains/files/workspaceTextFileLimits.js`
- Broadened `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` from the filtered loaded-workspace-text set to a filtered `project-text-set` assembled from loaded text candidates plus the workspace flat-file index, while keeping workspace restore app-managed and separate from Git-backed file-history restore
- Rerouted `src/stores/files.js` and `src/services/fileStoreIO.js` to the shared `workspaceTextFileLimits` module so payload/runtime tests no longer depend on `fileStoreIO -> fileStoreEffects -> editor store` just to resolve the text read limit
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` and snapshot metadata/tests so payload-backed workspace save points now expose the new `project-text-set` capture scope instead of presenting broadened project capture as if it were still the narrower loaded-only boundary
- Added `tests/workspaceSnapshotProjectTextRuntime.test.mjs` and expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs`, `tests/workspaceSnapshotMetadataRuntime.test.mjs`, `tests/workspaceSnapshotRuntime.test.mjs`, and `tests/workspaceSnapshot.test.mjs` to validate project-text candidate filtering, flat-file-index broadening, payload capture-scope persistence, and workspace/browser integration
- Validated the twenty-ninth safety-model slice with:
  - `node --test tests/workspaceSnapshotProjectTextRuntime.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Broadened `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` again so payload metadata/manifests now record `skippedCount` plus `skippedFiles` for unreadable or over-limit project-text candidates, including skipped-only payload manifests when nothing restorable was captured
- Tightened `src/domains/changes/workspaceSnapshotMetadataRuntime.js` so workspace save points with skipped-only payload manifests remain explainable but do not falsely advertise local restore capability
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` so it now loads payload manifests for any payload-backed save point, lists skipped files with simple reasons, and distinguishes skipped-only save points from older no-payload entries
- Expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs`, `tests/workspaceSnapshotMetadataRuntime.test.mjs`, `tests/workspaceSnapshotRuntime.test.mjs`, and `tests/workspaceSnapshot.test.mjs` to validate skipped-candidate recording, skipped-only payload manifests, and restore-capability gating
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe skipped payload coverage truthfully
- Validated the thirtieth safety-model slice with:
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceSnapshot.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotPreviewRuntime.js`
- Rerouted `src/domains/changes/workspaceSnapshot.js` and `src/components/WorkspaceSnapshotBrowser.vue` so workspace save points can now load a current-workspace preview summary through the shared snapshot boundary instead of relying only on payload manifest counts
- Added `tests/workspaceSnapshotPreviewRuntime.test.mjs` and expanded `tests/workspaceSnapshot.test.mjs` to validate preview-summary comparison counts and the new app-facing preview-summary operation seam
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the new workspace save-point preview-summary boundary truthfully
- Validated the thirty-first safety-model slice with:
  - `node --test tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotDiffRuntime.js`
- Tightened `src/domains/changes/workspaceSnapshotMetadataRuntime.js` so payload-backed workspace save points now advertise preview capability alongside restore capability
- Rerouted `src/domains/changes/workspaceSnapshot.js` and `src/components/WorkspaceSnapshotBrowser.vue` so payload-backed workspace save points can now load per-file diff/content preview excerpts for modified or missing files through the shared workspace snapshot boundary instead of relying only on aggregate comparison counts
- Added `tests/workspaceSnapshotDiffRuntime.test.mjs` and expanded `tests/workspaceSnapshotMetadataRuntime.test.mjs` / `tests/workspaceSnapshot.test.mjs` to validate per-file preview excerpts, preview capability metadata, and the new app-facing workspace save-point file-preview operation seam
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the new per-file workspace save-point preview boundary truthfully
- Validated the thirty-second safety-model slice with:
  - `node --test tests/workspaceSnapshotDiffRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotRuntime.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Narrowed `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` so payload-backed workspace restore can now replay either all captured files or an explicit selected subset without routing restore through Git history
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` so payload-backed workspace save points now expose a `Restore this file` action beside the existing all-files restore path, and refresh the local preview summary after targeted restore instead of closing blindly
- Expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs` and `tests/workspaceSnapshot.test.mjs` to validate selected-file payload restore and selected-file workspace save-point restore through the shared snapshot boundary
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the new selected-file restore behavior truthfully
- Validated the thirty-third safety-model slice with:
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotDiffRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Rerouted `src/domains/changes/workspaceSnapshot.js` and `src/components/WorkspaceSnapshotBrowser.vue` so selected-file workspace restore now goes through an explicit `restoreWorkspaceSavePointFile(...)` operation seam instead of leaving the app-facing restore surface on a generic `targetPaths` parameter bridge
- Expanded `tests/workspaceSnapshot.test.mjs` again to validate the explicit selected-file workspace restore operation seam
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the explicit selected-file restore seam truthfully
- Validated the thirty-fourth safety-model slice with:
  - `node --test tests/workspaceSnapshot.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotDiffRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Tightened `src/editor/diffOverlay.js` so the shared merge-view helper can now reconfigure read-only diff surfaces without merge controls, and so empty-string originals still render as valid diffs instead of disabling the diff view
- Established `src/components/WorkspaceSnapshotDiffEditor.vue`
- Expanded `src/domains/changes/workspaceSnapshotDiffRuntime.js` so selected-file workspace save-point previews now include the full saved/current content needed for the new patch/diff editor surface instead of only excerpt cards
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` so selected-file workspace save-point preview now renders through the dedicated local diff editor instead of paired excerpt blocks
- Expanded `tests/workspaceSnapshotDiffRuntime.test.mjs` again to validate the fuller file-preview payload returned to the new diff editor surface
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the upgraded workspace save-point diff surface truthfully
- Validated the thirty-fifth safety-model slice with:
  - `node --test tests/workspaceSnapshotDiffRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotFileApplyRuntime.js`
- Rerouted `src/domains/changes/workspaceSnapshot.js` so payload-backed workspace snapshot restore and the new chunk-level preview apply path both reuse the same app-managed file-write/editor-sync seam instead of duplicating inline save/reload logic
- Rerouted `src/components/WorkspaceSnapshotBrowser.vue` and `src/components/WorkspaceSnapshotDiffEditor.vue` so the local workspace snapshot diff surface now exposes explicit chunk-level apply/restore through merge controls plus a dedicated apply action without routing those writes through Git history
- Added `tests/workspaceSnapshotFileApplyRuntime.test.mjs` and expanded `tests/workspaceSnapshot.test.mjs` to validate the new file-apply runtime plus the explicit chunk-apply workspace snapshot operation seam
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe the new chunk-level workspace save-point apply/restore boundary truthfully
- Validated the thirty-sixth safety-model slice with:
  - `node --test tests/workspaceSnapshotFileApplyRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotDiffRuntime.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/changes/workspaceSnapshotDeletionRuntime.js`
- Extended `src/domains/changes/workspaceSnapshotPreviewRuntime.js`, `src/domains/changes/workspaceSnapshot.js`, and `src/components/WorkspaceSnapshotBrowser.vue` so payload-backed workspace save points now surface added-after-save-point entries and can remove one or all newly added in-scope `project-text-set` files without using Git history or `git checkout`
- Added `tests/workspaceSnapshotDeletionRuntime.test.mjs` and expanded `tests/workspaceSnapshotPreviewRuntime.test.mjs` / `tests/workspaceSnapshot.test.mjs` to validate added-entry detection, targeted removal, and full-restore removal behavior
- Adjusted `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` so payload metadata/manifests can now persist even when the current filtered `project-text-set` is empty, preserving an explicit empty in-scope save-point state instead of silently dropping the payload
- Expanded `tests/workspaceLocalSnapshotPayloadRuntime.test.mjs` and `tests/workspaceSnapshotMetadataRuntime.test.mjs` to validate empty payload-manifest persistence and the corresponding metadata capability gating
- Updated `docs/DATA_MODEL.md`, `docs/OPERATIONS.md`, and `docs/GIT_AND_SNAPSHOTS.md` again to describe added-file removal and empty-manifest preservation truthfully
- Validated the thirty-seventh and thirty-eighth safety-model slices with:
  - `node --test tests/workspaceSnapshotDeletionRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/workspaceLocalSnapshotPayloadRuntime.test.mjs tests/workspaceSnapshotMetadataRuntime.test.mjs tests/workspaceSnapshotDeletionRuntime.test.mjs tests/workspaceSnapshotPreviewRuntime.test.mjs tests/workspaceSnapshot.test.mjs tests/workspaceSnapshotRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Re-audited the current planned Phase 4 closure after the delete-removal and empty-manifest slices, and reran fresh full validation with `node --test tests/*.test.mjs` (`317/317` passing) plus `npm run build`
- Established `src/domains/reference/referenceLibraryRuntime.js`
- Moved reference library save scheduling, self-write bookkeeping, fs-change listener lifecycle, and three-file persistence behind the new runtime module
- Reduced `src/stores/references.js` from 1089 lines to 1027 lines
- Added `tests/referenceLibraryRuntime.test.mjs` to validate three-file writes, debounced save behavior, self-write suppression, and watcher cleanup outside the Pinia store shell
- Validated the first second-round references slice with:
  - `node --test tests/referenceLibraryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/reference/referenceLibraryLoadRuntime.js`
- Moved workspace context capture, stale-generation guards, load sequencing, hydrated state application, and post-load watcher startup behind the new runtime module
- Reduced `src/stores/references.js` from 1027 lines to 976 lines
- Added `tests/referenceLibraryLoadRuntime.test.mjs` to validate state hydration, stale-generation guards, and invalid-context no-op behavior outside the Pinia store shell
- Validated the second second-round references slice with:
  - `node --test tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/reference/referenceMigrationRuntime.js`
- Moved safe asset deletion, legacy workspace-library import, and legacy PDF/fulltext relocation behind the new runtime module
- Reduced `src/stores/references.js` from 976 lines to 916 lines
- Added `tests/referenceMigrationRuntime.test.mjs` to validate legacy-library import, asset relocation, and delete-if-exists behavior outside the Pinia store shell
- Validated the third second-round references slice with:
  - `node --test tests/referenceMigrationRuntime.test.mjs tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/reference/referenceWorkspaceViewRuntime.js`
- Moved workspace/global view synchronization, save-on-mutation commit helpers, workspace membership add/remove, and global-removal state cleanup behind the new runtime module
- Reduced `src/stores/references.js` from 916 lines to 904 lines
- Added `tests/referenceWorkspaceViewRuntime.test.mjs` to validate workspace-view sync, save-on-change commit behavior, key rename propagation, workspace membership changes, and global-removal cleanup outside the Pinia store shell
- Validated the fourth second-round references slice with:
  - `node --test tests/referenceWorkspaceViewRuntime.test.mjs tests/referenceMigrationRuntime.test.mjs tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
- Established `src/domains/reference/referenceMutationRuntime.js`
- Moved collection/saved-view mutation coordination, workflow field updates, summary/note saves, and tag mutation helpers behind the new runtime module
- Reduced `src/stores/references.js` from 904 lines to 830 lines
- Added `tests/referenceMutationRuntime.test.mjs` to validate workbench mutation persistence, collection deletion/global commit routing, and workflow/tag mutation commits outside the Pinia store shell
- Validated the fifth second-round references slice with:
  - `node --test tests/referenceMutationRuntime.test.mjs tests/referenceWorkspaceViewRuntime.test.mjs tests/referenceMigrationRuntime.test.mjs tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
- Established `src/domains/reference/referenceCrudRuntime.js`
- Moved add/addMany import flow, duplicate detection, update persistence, and merge coordination behind the new runtime module
- Reduced `src/stores/references.js` from 830 lines to 796 lines
- Added `tests/referenceCrudRuntime.test.mjs` to validate add/import flow, duplicate re-attach behavior, batch import error reporting, and merge/update persistence outside the Pinia store shell
- Validated the sixth second-round references slice with:
  - `node --test tests/referenceCrudRuntime.test.mjs tests/referenceMutationRuntime.test.mjs tests/referenceWorkspaceViewRuntime.test.mjs tests/referenceMigrationRuntime.test.mjs tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
- Established `src/domains/reference/referenceAssetRuntime.js`
- Moved global reference removal, asset deletion orchestration, PDF copy/import, and fulltext extraction/writeback behind the new runtime module
- Reduced `src/stores/references.js` from 796 lines to 761 lines
- Added `tests/referenceAssetRuntime.test.mjs` to validate global-removal asset cleanup, PDF storage/update behavior, and no-config no-op behavior outside the Pinia store shell
- Validated the seventh second-round references slice with:
  - `node --test tests/referenceAssetRuntime.test.mjs tests/referenceCrudRuntime.test.mjs tests/referenceMutationRuntime.test.mjs tests/referenceWorkspaceViewRuntime.test.mjs tests/referenceMigrationRuntime.test.mjs tests/referenceLibraryLoadRuntime.test.mjs tests/referenceLibraryRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/editor/editorOpenRoutingRuntime.js`
- Moved `openFile`, `openChat`, `openChatBeside`, `openNewTab`, `openAiLauncher`, and `openFileInPane` routing/orchestration behind the new editor runtime module
- Reduced `src/stores/editor.js` from 853 lines to 756 lines
- Added `tests/editorOpenRoutingRuntime.test.mjs` to validate chat/file side-pane routing, launcher replacement semantics, and preview-pane opening outside the Pinia store shell
- Validated the second `editor` slice with:
  - `node --test tests/editorOpenRoutingRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/domains/document/documentWorkflowRuntime.js`
- Moved `closePreviewForSource`, `ensurePreviewForSource`, `revealPreview`, and `reconcile` orchestration behind the new document runtime module
- Reduced `src/stores/documentWorkflow.js` from 521 lines to 400 lines
- Added `tests/documentWorkflowRuntime.test.mjs` to validate preview-pane reuse, split-right fallback, ready-preview reuse, jump-to-preview routing, and close-preview reconcile behavior outside the Pinia store shell
- Validated the first `documentWorkflow` slice with:
  - `node --test tests/documentWorkflowRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/services/workspaceHistoryRepo.js`
- Moved history-repo existence/init and initial seed-commit behavior out of `src/services/workspaceAutoCommit.js`
- Updated `src/domains/changes/workspaceHistory.js` and `src/services/workspaceGitHub.js` to compose history readiness and auto-commit enablement explicitly
- Added `tests/workspaceHistoryRepo.test.mjs` to validate repo initialization, initial seed commit behavior, empty-workspace no-op behavior, and home-directory guard behavior outside the previous mixed auto-commit service
- Validated the first safety-model slice with:
  - `node --test tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Established `src/services/pathExists.js` as a shared filesystem existence helper rather than sourcing that check from `workspaceBootstrap`
- Removed the temporary dynamic-import workaround from `src/services/workspaceHistoryRepo.js` and restored static service dependencies
- Rerouted `workspaceBootstrap`, `workspaceAutoCommit`, and `workspaceSettings` to the shared `pathExists` helper so workspace safety and settings flows no longer depend on bootstrap as an accidental utility boundary
- Validated the safety cleanup follow-up with:
  - `node --test tests/workspaceHistoryRepo.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`
- Created `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAINS.md`, `docs/BUILD_SYSTEM.md`, `docs/CONTRIBUTING.md`, and `docs/TESTING.md` so the repository now has the missing core docs baseline required by the refactor constitution
- Updated `docs/AI_SYSTEM.md` and `docs/OPERATIONS.md` so the remaining direct AI launch callers, operation gaps, and post-Phase-6 next work are recorded truthfully
- Added `tests/aiLaunchBoundaryAudit.test.mjs` to freeze the current direct `launchAiTask(...)` / `launchWorkflowTask(...)` caller inventory and to guard against `useEditorPaneWorkflow.js` regressing back to direct TeX/Typst AI task launching
- Added `tests/repoDocsAudit.test.mjs` to guard the required top-level docs baseline plus the mandatory blueprint section headings
- Validated the current planned Phase 6 scope with:
  - `node --test tests/aiLaunchBoundaryAudit.test.mjs tests/repoDocsAudit.test.mjs tests/documentWorkflowAiRuntime.test.mjs`
  - `node --test tests/*.test.mjs`
  - `npm run build`

## Blocked / Risks

- Workspace open/close still touches multiple stores and services, so careless reordering can introduce regressions
- Auto-commit and history/version flows are still coupled
- `PdfViewer.vue` remains extremely large and highly coupled, but is not yet the best next target
- Validation is stronger now, but it still lacks a lint gate, a typecheck gate, browser E2E coverage, and a routine Rust test workflow for refactor slices
- `files` may already have partial helper boundaries (`fileStoreIO` / `fileStoreEffects`) that can either help the migration or hide remaining coupling
- `files` refresh runtime remains more coupled than cache/snapshot state; pulling refresh logic first would widen blast radius compared with extracting the cache/runtime boundary
- `files` now delegates visible-tree refresh execution, watch/poll lifecycle orchestration, tree hydration/loading, flat-file indexing, file content/PDF handling, entry-creation/import flows, and rename/move/delete coordination to domain runtimes; the store is no longer the clearest next extraction target
- `workspace` now delegates automation, GitHub session lifecycle, settings/instructions IO, and bootstrap/watch sequencing to domain runtimes; the remaining store shell is thinner but still not minimal
- The remaining `workspace` logic is lower-value than before, so there is risk of slipping into cosmetic preference-wrapper extraction instead of moving to the next genuinely large store
- `terminal` is now mostly a thin shell around runtime accessors and local find-state setters; further extraction there risks becoming cosmetic rather than architectural
- `chat` is no longer one of the highest-value remaining Phase 2 seams; its remaining store logic is now mostly runtime accessors, getters, and a thinner shell
- `references` is much thinner after its seventh second-round slice, but still keeps thin UI/helper wrappers that are lower-value than shifting to a different large store
- `editor` still owns close/move/layout shell logic, but the major currently identified routing knot is now extracted; staying in Phase 2 there risks slipping into lower-value cleanup
- `documentWorkflow` is now substantially split across explicit runtimes, but compile-specific button handlers still live in `useEditorPaneWorkflow.js` as thinner follow-up seams rather than full orchestration knots
- AI launch entry points are still distributed across other surfaces such as notebook, references, comments, and generic launcher UI even though the document workflow toolbar now has an explicit runtime seam
- The safety model is cleaner now, and workspace save points have a first app-managed payload manifest plus restore seam above the Git-backed snapshot/history boundary, but that restore coverage is still intentionally narrow
- Snapshot scope is now explicit (`workspace` vs `file`), and restore semantics are now split: file-scoped version history remains Git-backed while payload-backed workspace save points restore only the current filtered project text set
- Older/backfilled workspace save points can still appear in the browser without a local restore payload
- Older payload-backed workspace save points can still exist with the legacy open-files-only capture scope
- Older payload-backed workspace save points can still exist with the intermediate loaded-workspace-text capture scope
- The current `project-text-set` payload boundary is broader than the loaded set, but it still depends on flat-file index freshness, text-read limits, and explicit path filtering rather than representing a whole-project rewind
- Workspace save-point preview/restore now models captured-file replay, chunk-level apply/restore, and in-scope added-file removal inside the filtered `project-text-set`, but it still is not a whole-workspace rewind and does not delete files outside that explicit scope
- Backend flattening is still untouched and could become harder if frontend assumptions harden further
- The docs baseline now exists, but it can become stale again if later refactor slices land without updating the architecture/testing/product docs alongside the blueprint
- The repository now describes itself more accurately as a research-and-academic workspace, but the code still lacks a first-class execution/notebook boundary to match that broader product definition

## Next Recommended Slice

1. The current planned Phase 6 scope is complete; do not reopen it with docs-only churn or cosmetic cleanup
2. Start execution/notebook boundary planning by auditing `src/components/editor/NotebookEditor.vue`, `src/stores/kernel.js`, `src/stores/environment.js`, `src/services/chunkKernelBridge.js`, and `src-tauri/src/kernel.rs`
3. Use `docs/ARCHITECTURE.md` and `docs/OPERATIONS.md` to record the first explicit execution/notebook boundary and what will intentionally remain shared with the document/build loop for now
4. After the boundary is documented, extract one narrow runtime seam from the current execution/notebook stack instead of continuing cosmetic UI work
5. Keep workspace snapshot restore separate from Git-backed file-history restore, and keep AI mutation flowing through reviewable workflow/checkpoint paths rather than direct mutation entry points

## Validation Checklist

- [x] Blueprint reflects the current repository state
- [x] architecture docs baseline exists
- [x] testing docs baseline exists
- [x] required top-level docs presence is guarded by an audit test
- [x] medium-term plan exists under `docs/plan/README.md`
- [x] directory-scoped `AGENTS.md` files exist for the main work surfaces
- [x] active docs now describe Altals as a broader research-and-academic operating system rather than only a paper-writing workspace
- [x] remaining direct AI launch callers are documented and guarded by an audit test
- [x] App-layer boundary extraction is documented
- [x] `App.vue` responsibility has materially shrunk
- [x] `references` first-round split is documented
- [x] `editor` first-round split is documented
- [x] current bottlenecks are explicitly named
- [x] next recommended slice is explicit
- [x] `files` refresh/runtime extraction is documented truthfully
- [x] `files` watch/runtime extraction is documented truthfully
- [x] `files` hydration/runtime extraction is documented truthfully
- [x] `files` flat-file indexing/runtime extraction is documented truthfully
- [x] `files` content/runtime extraction is documented truthfully
- [x] `files` entry-creation/import runtime extraction is documented truthfully
- [x] `files` mutation/runtime extraction is documented truthfully
- [x] `workspace` automation/runtime extraction is documented truthfully
- [x] `workspace` GitHub/runtime extraction is documented truthfully
- [x] `workspace` settings/runtime extraction is documented truthfully
- [x] `workspace` bootstrap/runtime extraction is documented truthfully
- [x] `terminal` execution/runtime extraction is documented truthfully
- [x] `terminal` hydration/runtime extraction is documented truthfully
- [x] `terminal` lifecycle/runtime extraction is documented truthfully
- [x] `terminal` log/runtime extraction is documented truthfully
- [x] `terminal` session/runtime extraction is documented truthfully
- [x] `chat` persistence/runtime extraction is documented truthfully
- [x] `chat` session/runtime extraction is documented truthfully
- [x] `chat` message/runtime extraction is documented truthfully
- [x] `chat` title/runtime extraction is documented truthfully
- [x] `chat` runtime-config extraction is documented truthfully
- [x] `chat` live-instance/runtime extraction is documented truthfully
- [x] `references` library-runtime extraction is documented truthfully
- [x] `references` load-runtime extraction is documented truthfully
- [x] `references` migration-runtime extraction is documented truthfully
- [x] `references` workspace-view runtime extraction is documented truthfully
- [x] `references` mutation-runtime extraction is documented truthfully
- [x] `references` CRUD-runtime extraction is documented truthfully
- [x] `references` asset-runtime extraction is documented truthfully
- [ ] core architecture docs have been created
- [x] safety model has been documented as a first-class system
- [x] testing/validation story is stronger than build-only checks for the current `files`, `workspace`, and `references` slices
- [ ] backend layering migration has begun

## Migration Notes

- The refactor correctly began by reducing root-level orchestration before attacking every large store at once.
- `references` was a good first store/domain split because it allowed meaningful logic extraction without immediately entangling the entire workspace lifecycle.
- `editor` was a reasonable second large split, and after the extended `references` re-entry it is now the highest-value remaining store to revisit.
- The repository has now correctly stopped extending Phase 2 after the `editor` open-routing seam; the next work should stay in Phase 3/4 unless a genuinely non-cosmetic store seam appears.
- The first Phase 3 slice has now started the document preview loop as an explicit domain runtime rather than leaving it buried inside the store.
- The first Phase 4 slice has now started separating history bootstrap from auto-commit, and the immediate shared-utility cleanup has removed the dynamic-import workaround before it could harden into new accidental complexity.
- The next two Phase 4 slices separated pre-history file preparation and explicit history commit execution from the old `workspaceHistory.js` bridge; that bridge is now gone, and the remaining safety-model gap has shifted from ad hoc snapshot metadata to persisted manifest metadata above the new Git-backed boundary.
- The repository now has a first shared snapshot operation boundary plus explicit `workspace` vs `file` scope, explicit derived snapshot metadata, persisted manifest metadata, a local workspace-save-point index, and a payload-backed workspace restore seam that now covers a filtered project text set with explicit skipped-coverage metadata plus a workspace-level preview summary; the next gap is deepening that summary into per-file content diff/preview without collapsing back into raw Git rewinds.
- `files` was the highest-value target through the runtime extraction sequence, but after the mutation slice landed it is no longer the clearest bottleneck.
- After the refresh/runtime extraction, `files` still contains a second narrow orchestration seam around watch/poll scheduling and activity hooks; that is the best candidate if we continue in the same domain.
- After the watch/runtime extraction, the highest-value remaining `files` slice is tree hydration/loading rather than more watch logic.
- After the hydration/runtime extraction, the highest-value remaining `files` slice is flat-file indexing/runtime rather than immediately widening into workspace-level orchestration.
- After the flat-file indexing/runtime extraction, the highest-value remaining `files` slice is content/PDF handling rather than mutation-side cross-store coordination.
- After the content/runtime extraction, the highest-value remaining `files` slice is entry creation/import handling rather than rename/move/delete coordination.
- After the entry-creation/import extraction, the next remaining `files` slice was rename/move/delete coordination; that slice has now landed as `fileMutationRuntime`.
- The entry-creation/import slice improved boundary clarity more than raw line count; the store did not get smaller in that cycle because the remaining rename/move/delete bridge code still dominated.
- With rename/move/delete extracted, `files` is now mostly a thinner shell around state, reconcile status, and runtime accessors; the next high-value store reduction has shifted to `workspace`.
- The first `workspace` slice should target timer/runtime orchestration before bootstrap or settings loading because it has a narrower blast radius and can be tested without reopening workspace bootstrap sequencing.
- The first three `workspace` slices have now landed in the expected order: automation/timers first, then GitHub session lifecycle, then settings/instructions IO.
- The fourth `workspace` slice has now landed as `workspaceBootstrapRuntime`, so the remaining `workspace` logic is mostly a thinner shell plus preference/open-close wrappers.
- After four `workspace` slices, `src/stores/workspace.js` is down to 727 lines and is no longer the clearest next large-store target.
- Preference toggles remain in the store, but they are now lower-value than shifting to `terminal` because they are mostly direct state wrappers and do not carry the same orchestration risk.
- The first `terminal` slice has now landed as `terminalExecutionRuntime`, and it confirmed that the store can shed PTY startup / REPL routing without forcing a broad terminal rewrite.
- The second `terminal` slice has now landed as `terminalHydrationRuntime`, and it confirmed that snapshot persistence/reset can move out without changing the snapshot schema.
- The third `terminal` slice has now landed as `terminalLifecycleRuntime`, and it confirmed that create/activate/split/reuse flows can move out cleanly while continuing to reuse the hydration runtime for persistence.
- The fourth `terminal` slice has now landed as `terminalLogRuntime`, and it confirmed that log buffering/status logic can move out cleanly while continuing to reuse the lifecycle runtime for log-terminal creation.
- The fifth `terminal` slice has now landed as `terminalSessionRuntime`, and it confirmed that PTY teardown/session tracking can move out cleanly without widening into chat or workspace behavior.
- With five `terminal` slices landed, the store is now mostly a thin shell; the next high-value Phase 2 move is to start a comparable extraction sequence in `chat`.
- The first `chat` slice has now landed as `chatPersistenceRuntime`, and it confirmed that persisted-session IO and cleanup/reset behavior can move out without touching transport creation.
- The second `chat` slice has now landed as `chatSessionLifecycleRuntime`, and it confirmed that session creation/archive/reopen/delete behavior can move out cleanly while continuing to reuse the persistence runtime for saved-session IO.
- The third `chat` slice has now landed as `chatMessageRuntime`, and it confirmed that send/build behavior can move out cleanly while continuing to reuse the live Chat instance bridge in the store.
- The fourth `chat` slice has now landed as `chatTitleRuntime`, and it confirmed that auto-title generation can move out cleanly while continuing to reuse the store shell for live Chat instance lookup.
- The fifth `chat` slice has now landed as `chatRuntimeConfigRuntime`, and it confirmed that provider/runtime config behavior can move out cleanly while continuing to reuse the store shell for live Chat instance lookup.
- The sixth `chat` slice has now landed as `chatLiveInstanceRuntime`, and it confirmed that the remaining watch/recovery bridges can move out cleanly without changing the public store surface.
- With six `chat` slices landed, the store is now mostly a thin shell; the next Phase 2 move should re-enter `references` rather than extracting lower-value wrappers from `chat`, `terminal`, or `workspace`.
- The first second-round `references` slice has now landed as `referenceLibraryRuntime`, and it confirmed that save/watch/self-write orchestration can move out cleanly without widening into migration or workspace-view sync behavior.
- The second second-round `references` slice has now landed as `referenceLibraryLoadRuntime`, and it confirmed that load sequencing can move out cleanly while continuing to reuse the new library runtime for persistence/watch concerns.
- The third second-round `references` slice has now landed as `referenceMigrationRuntime`, and it confirmed that legacy-library import plus asset relocation can move out cleanly while continuing to reuse the load runtime for sequencing.
- The fourth second-round `references` slice has now landed as `referenceWorkspaceViewRuntime`, and it confirmed that workspace/global view sync plus membership-state repair can move out cleanly while continuing to reuse the library runtime for persistence.
- The fifth second-round `references` slice has now landed as `referenceMutationRuntime`, and it confirmed that collection/workflow/tag mutation coordination can move out cleanly while continuing to reuse the workspace-view runtime for save-on-mutation behavior.
- The sixth second-round `references` slice has now landed as `referenceCrudRuntime`, and it confirmed that add/import/update/merge behavior can move out cleanly while continuing to reuse the workspace-view runtime for save-on-mutation behavior.
- The seventh second-round `references` slice has now landed as `referenceAssetRuntime`, and it confirmed that asset deletion plus PDF/fulltext storage can move out cleanly while continuing to reuse the CRUD/runtime for update persistence.
- With the asset runtime landed, the current `references` sequence is complete enough that further work there would risk turning cosmetic; the next best Phase 2 move is to re-enter `editor`.
- The repository can now validate `files` runtime slices with focused `node:test` coverage instead of relying on build-only confidence.
- The repository can now also validate `workspace` runtime slices with focused `node:test` coverage instead of relying on build-only confidence for sync/settings/bootstrap behavior.
- `PdfViewer.vue` is large enough to deserve future attention, but it should not displace the more structurally important `files` migration unless product work proves otherwise.
- Missing documentation is now a repository-level risk, not just a nice-to-have, because the codebase is accumulating new boundaries without a matching shared architectural map.
- Safety model separation should become a first-class implementation effort soon after the next store-boundary slice, especially because current history/version flows still imply Git-coupled safety behavior.
