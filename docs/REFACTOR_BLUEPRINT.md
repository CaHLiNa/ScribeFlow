# Refactor Blueprint

## Overview

Altals is being refactored from a broad, feature-heavy research desktop application into a focused, local-first academic writing workspace centered on project-based document editing, references, builds, changes, and AI-assisted patch workflows.

This file is the living execution plan for the refactor. It must always reflect the real repository state, not an aspirational plan.

Current overall assessment:

- Phase 0 is effectively complete.
- Phase 1 is substantially advanced but not fully closed.
- Phase 2 has completed its currently highest-value `editor` slice and should no longer be extended for cosmetic cleanup.
- Phase 3 is now in early execution with the first `documentWorkflow` preview/open/reconcile runtime extraction landed and validated.
- Phase 4 is now also in early execution with the first history-repo vs auto-commit separation slice landed and its immediate `pathExists` cleanup follow-up validated.
- Repository state was re-audited on 2026-03-22; the current in-flight refactor state includes landed `editor`, `documentWorkflow`, and early safety-model runtime/service extractions plus targeted tests.

## Product Direction

Target product definition:

> A local-first, project-directory-centered academic writing workspace.

Primary workflow:

1. Open project
2. Browse files
3. Edit document
4. Manage references
5. Build / preview
6. Review changes
7. Use AI through auditable proposals

First-class product objects:

- Project
- Document
- Reference
- Build
- Change
- Workflow

Secondary/supporting systems:

- Git
- remote sync
- terminal
- AI chat
- experimental panels
- legacy migration shims

If there is tension between the writing workflow and support systems, the writing workflow wins.

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
- `src/domains/project`
- `src/domains/document`
- `src/domains/reference`
- `src/domains/build`
- `src/domains/changes`
- `src/domains/ai`
- `src/domains/git`
- `src/domains/terminal`
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

The current strongest signs of progress are:

- `src/app` entry-layer boundaries have been established.
- `App.vue` has already been reduced significantly and no longer carries as much direct orchestration as before.
- `src/domains/changes` has been established as an early domain boundary.
- `references` and `editor` have both gone through first-round store/domain extraction.
- `references` has now also entered a second-round runtime extraction sequence.
- `files` and `workspace` have both gone through repeated runtime extraction cycles and are no longer the clearest Phase 2 bottlenecks.
- `src/domains/document/documentWorkflowRuntime.js` now marks the first concrete Phase 3 main-loop boundary.
- `src/services/workspaceHistoryRepo.js` now marks the first concrete Phase 4 safety-model boundary, separating history repo bootstrap from auto-commit execution.

### Frontend current state

#### App/root layer

The root app component has already been reduced through extraction of several orchestration modules, including workspace lifecycle, shell event bridge, workspace history actions, teardown handling, and footer status sync.

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

`references` and `editor` have both now had their highest-value currently identified Phase 2 slices extracted, and `documentWorkflow` has now had its first main-loop slice extracted; the next higher-value repository need sits in early Phase 4 safety-model cleanup and then the remaining Phase 3 build/review loop.

##### Document workflow status

`src/domains/document/documentWorkflowRuntime.js` now carries preview-pane reuse, split-right fallback, preview-session state updates, jump-to-preview routing, and reconcile/close-preview orchestration.

`src/stores/documentWorkflow.js` is now 400 lines after this extraction, down from 521 lines, and the store is beginning to resemble a thinner shell around state plus smaller action wrappers rather than the whole preview loop.

##### Safety model status

The first concrete safety-model split has landed:

- `src/services/workspaceHistoryRepo.js` now owns history-repo existence/init plus optional initial seed commit behavior.
- `src/services/workspaceAutoCommit.js` now focuses on marker checks, explicit enablement, and commit execution rather than repo bootstrap.
- `src/domains/changes/workspaceHistory.js` and `src/services/workspaceGitHub.js` now compose history-repo readiness and auto-commit enablement explicitly at the caller boundary.

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

Current docs are still incomplete.

Observed repository reality as of 2026-03-22:

- `docs/REFACTOR_BLUEPRINT.md` is still the only substantive top-level architecture/refactor document in `docs/`.
- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAINS.md`, `docs/OPERATIONS.md`, and the other required documents still do not exist.
- The repository currently has no additional markdown architecture map to explain how the newly extracted frontend domain modules relate to the remaining large stores.

Required docs such as the following are still missing:

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `docs/OPERATIONS.md`
- `docs/DATA_MODEL.md`
- `docs/BUILD_SYSTEM.md`
- `docs/AI_SYSTEM.md`
- `docs/GIT_AND_SNAPSHOTS.md`
- `docs/CONTRIBUTING.md`
- `docs/TESTING.md`

At the moment, `docs/REFACTOR_BLUEPRINT.md` is the only clearly established refactor doc.

### Safety model observations

Safety boundaries are still not clean.

Important remaining coupling:
- `workspaceAutoCommit`
- version history flows
- app-level history triggers
- Git-based safety expectations

This means autosave, local snapshot, git commit, and remote sync are still not sufficiently separated.

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
- In progress, early stage

What has already happened:
- `src/domains/document/documentWorkflowRuntime.js` established
- preview open/reconcile orchestration moved out of `src/stores/documentWorkflow.js`
- targeted runtime tests added for preview-pane reuse, split-right fallback, ready-preview reuse, and reconcile behavior

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
- In progress, early stage

What has already happened:
- `src/services/workspaceHistoryRepo.js` established
- history-repo init/seed behavior moved out of `src/services/workspaceAutoCommit.js`
- explicit auto-commit enablement moved to caller composition in `workspaceHistory` and `workspaceGitHub`
- targeted service tests added for repo init/seed and home-directory guard behavior

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
- Not yet started

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
- Not yet started, aside from blueprint maintenance

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

- [ ] Create `docs/PRODUCT.md`
- [ ] Create `docs/ARCHITECTURE.md`
- [ ] Create `docs/DOMAINS.md`
- [ ] Create `docs/OPERATIONS.md`

### Safety model

- [x] Document the current coupling between auto-commit and history/version flows
- [ ] Create `docs/GIT_AND_SNAPSHOTS.md`
- [x] Identify a concrete first code slice for separating safety responsibilities
- [x] Extract the first history-repo bootstrap slice away from `workspaceAutoCommit`
- [x] Validate the first safety-model slice with targeted tests and build verification
- [x] Remove the temporary dynamic-import workaround introduced in `workspaceHistoryRepo` and keep the safety split statically testable
- [ ] Extract the next Phase 3 document build/diagnostic slice so preview, compile status, and review visibility continue converging toward one main loop

### Backend planning

- [ ] Audit `src-tauri/src/latex.rs` for command/core/service split opportunities
- [ ] Audit `src-tauri/src/fs_commands.rs` for future boundary extraction
- [ ] Define first backend layering slice after frontend store work has progressed further

### Cleanup / validation

- [ ] Identify dead or near-dead paths left behind by App/store extraction
- [ ] Record deletion targets for temporary bridges
- [ ] Strengthen validation beyond repeated build-only verification

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
- `workspaceHistoryRepo` is now extracted as a first safety-model boundary, and the shared `pathExists` cleanup has removed its temporary dynamic-import workaround; the next execution cycle should shift back to the next concrete Phase 3 main-loop seam

## Completed

- Replaced placeholder blueprint content with a truthful execution-oriented blueprint
- Identified the real primary frontend bottlenecks
- Identified the real primary backend bottlenecks
- Established `src/app/workspace/useWorkspaceLifecycle.js`
- Established `src/app/shell/useAppShellEventBridge.js`
- Established `src/app/changes/useWorkspaceHistoryActions.js`
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

## Blocked / Risks

- Workspace open/close still touches multiple stores and services, so careless reordering can introduce regressions
- Auto-commit and history/version flows are still coupled
- `PdfViewer.vue` remains extremely large and highly coupled, but is not yet the best next target
- Validation is still heavily dependent on build checks and manual confidence rather than systematic tests outside the growing runtime test surface
- `files` may already have partial helper boundaries (`fileStoreIO` / `fileStoreEffects`) that can either help the migration or hide remaining coupling
- `files` refresh runtime remains more coupled than cache/snapshot state; pulling refresh logic first would widen blast radius compared with extracting the cache/runtime boundary
- `files` now delegates visible-tree refresh execution, watch/poll lifecycle orchestration, tree hydration/loading, flat-file indexing, file content/PDF handling, entry-creation/import flows, and rename/move/delete coordination to domain runtimes; the store is no longer the clearest next extraction target
- `workspace` now delegates automation, GitHub session lifecycle, settings/instructions IO, and bootstrap/watch sequencing to domain runtimes; the remaining store shell is thinner but still not minimal
- The remaining `workspace` logic is lower-value than before, so there is risk of slipping into cosmetic preference-wrapper extraction instead of moving to the next genuinely large store
- `terminal` is now mostly a thin shell around runtime accessors and local find-state setters; further extraction there risks becoming cosmetic rather than architectural
- `chat` is no longer one of the highest-value remaining Phase 2 seams; its remaining store logic is now mostly runtime accessors, getters, and a thinner shell
- `references` is much thinner after its seventh second-round slice, but still keeps thin UI/helper wrappers that are lower-value than shifting to a different large store
- `editor` still owns close/move/layout shell logic, but the major currently identified routing knot is now extracted; staying in Phase 2 there risks slipping into lower-value cleanup
- `documentWorkflow` is thinner after the preview/open/reconcile extraction, but the build/review loop is still not yet documented or split into clear operations
- The first safety-model slice is cleaner now, but the repository still lacks first-class documentation for autosave, local history, git commit, and remote sync boundaries
- Backend flattening is still untouched and could become harder if frontend assumptions harden further
- The architecture docs are still missing even though frontend domain boundaries are now multiplying; this remains a shared-understanding risk

## Next Recommended Slice

1. Continue Phase 3 by extracting the document build/diagnostic seam from `src/stores/documentWorkflow.js`, centered on `buildAdapterContext`, `openLogForFile`, `getProblemsForFile`, `getUiStateForFile`, and adjacent compile/review visibility wiring
2. Reuse the existing document adapters so the slice strengthens the main loop instead of inventing a parallel build abstraction
3. Preserve current adapter-specific log opening, problem focus, and preview UI-state behavior while making compile/review visibility testable outside the Pinia shell
4. Validate with targeted document-workflow runtime tests plus `node --test tests/*.test.mjs` and `npm run build`
5. Update this blueprint again based on whether that slice is enough to justify `docs/OPERATIONS.md` / `docs/GIT_AND_SNAPSHOTS.md` as the next paired documentation effort

## Validation Checklist

- [x] Blueprint reflects the current repository state
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
- [ ] safety model has been documented as a first-class system
- [x] testing/validation story is stronger than build-only checks for the current `files`, `workspace`, and `references` slices
- [ ] backend layering migration has begun

## Migration Notes

- The refactor correctly began by reducing root-level orchestration before attacking every large store at once.
- `references` was a good first store/domain split because it allowed meaningful logic extraction without immediately entangling the entire workspace lifecycle.
- `editor` was a reasonable second large split, and after the extended `references` re-entry it is now the highest-value remaining store to revisit.
- The repository has now correctly stopped extending Phase 2 after the `editor` open-routing seam; the next work should stay in Phase 3/4 unless a genuinely non-cosmetic store seam appears.
- The first Phase 3 slice has now started the document preview loop as an explicit domain runtime rather than leaving it buried inside the store.
- The first Phase 4 slice has now started separating history bootstrap from auto-commit, and the immediate shared-utility cleanup has removed the dynamic-import workaround before it could harden into new accidental complexity.
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
