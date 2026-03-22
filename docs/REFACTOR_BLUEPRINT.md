# Refactor Blueprint

## Overview

Altals is being refactored from a broad, feature-heavy research desktop application into a focused, local-first academic writing workspace centered on project-based document editing, references, builds, changes, and AI-assisted patch workflows.

This file is the living execution plan for the refactor. It must always reflect the real repository state, not an aspirational plan.

Current overall assessment:

- Phase 0 is effectively complete.
- Phase 1 is substantially advanced but not fully closed.
- Phase 2 is meaningfully underway with two major store/domain reductions already completed.
- Phase 3 onward are still mostly ahead of us and should not be treated as already in execution.

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

The store still retains mostly store-specific lifecycle, watcher, self-write bookkeeping, load generation, and state sync responsibilities.

##### Editor domain status

The editor store has already had these responsibilities extracted into domain modules:

- pane tree / layout
- pane tab mutation
- surface switching
- persistence runtime
- editor view registry
- dirty persistence bridge
- research / execution insertion actions
- cleanup runtime
- restore runtime

The editor store is now much smaller and is no longer the highest-priority refactor target.

#### Remaining large frontend bottlenecks

The largest remaining frontend architectural bottlenecks include:

- `src/stores/files.js`
- `src/stores/workspace.js`
- `src/stores/chat.js`
- `src/stores/terminal.js`
- `src/components/editor/PdfViewer.vue`

`files` is now the clearest next large store/domain split target.

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

Current next target:
- `src/stores/files.js`

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
- Not yet meaningfully started

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
- Not yet started in code
- partially identified in audit

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

- [ ] Audit `src/stores/files.js` in detail and identify the cleanest first extraction slice
- [ ] Create `src/domains/files/*` or equivalent runtime boundary for the first `files` slice
- [ ] Validate the first `files` extraction with build verification
- [ ] Decide whether the next slice stays in `files` or shifts to `workspace`

### Product and architecture docs

- [ ] Create `docs/PRODUCT.md`
- [ ] Create `docs/ARCHITECTURE.md`
- [ ] Create `docs/DOMAINS.md`
- [ ] Create `docs/OPERATIONS.md`

### Safety model

- [ ] Document the current coupling between auto-commit and history/version flows
- [ ] Create `docs/GIT_AND_SNAPSHOTS.md`
- [ ] Identify a concrete first code slice for separating safety responsibilities

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

## Blocked / Risks

- Workspace open/close still touches multiple stores and services, so careless reordering can introduce regressions
- Auto-commit and history/version flows are still coupled
- `PdfViewer.vue` remains extremely large and highly coupled, but is not yet the best next target
- Validation is still heavily dependent on build checks and manual confidence rather than systematic tests
- `references` still retains watcher/self-write/load-generation/state-sync responsibilities that should eventually move into clearer infra/runtime boundaries
- `files` may already have partial helper boundaries (`fileStoreIO` / `fileStoreEffects`) that can either help the migration or hide remaining coupling
- Backend flattening is still untouched and could become harder if frontend assumptions harden further

## Next Recommended Slice

1. Switch the next large store/domain reduction target to `src/stores/files.js`
2. Audit the remaining non-extracted logic in `files.js`, especially:
   - tree cache
   - workspace snapshot
   - refresh runtime
3. Choose exactly one narrow, high-value first extraction slice
4. Move that slice into `src/domains/files/*` or an equivalent runtime module
5. validate with build verification
6. update this blueprint based on the actual migration result
7. only then decide whether to keep pushing `files` or redirect to `workspace`

## Validation Checklist

- [x] Blueprint reflects the current repository state
- [x] App-layer boundary extraction is documented
- [x] `App.vue` responsibility has materially shrunk
- [x] `references` first-round split is documented
- [x] `editor` first-round split is documented
- [x] current bottlenecks are explicitly named
- [x] next recommended slice is explicit
- [ ] core architecture docs have been created
- [ ] safety model has been documented as a first-class system
- [ ] testing/validation story is stronger than build-only checks
- [ ] backend layering migration has begun

## Migration Notes

- The refactor correctly began by reducing root-level orchestration before attacking every large store at once.
- `references` was a good first store/domain split because it allowed meaningful logic extraction without immediately entangling the entire workspace lifecycle.
- `editor` was a reasonable second large split, and it now appears to be past the highest-value extraction stage for the current phase.
- `files` is now the highest-value next target because it remains large, central, and only partially bounded by earlier helper modules.
- `workspace` should likely remain behind `files` unless the `files` audit reveals that the next safe slice is actually blocked on workspace boundaries.
- `PdfViewer.vue` is large enough to deserve future attention, but it should not displace the more structurally important `files` migration unless product work proves otherwise.
- Missing documentation is now a repository-level risk, not just a nice-to-have, because the codebase is accumulating new boundaries without a matching shared architectural map.
- Safety model separation should become a first-class implementation effort soon after the next store-boundary slice, especially because current history/version flows still imply Git-coupled safety behavior.