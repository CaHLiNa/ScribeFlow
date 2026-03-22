# Git And Snapshots

## Purpose

This document records the current safety model in Altals and the gaps that still remain between:

1. autosave
2. local snapshot
3. Git commit
4. remote sync

The current implementation does not fully separate these concepts yet. This file exists to describe the real current state and the target direction.

## Current Truth

Altals now has a first explicit history-repo boundary, a local workspace-snapshot index, and an app-managed workspace save-point payload/restore surface for a filtered project text set, including in-scope added-file removal, behind explicit workspace save points.

Today:

- autosave exists as normal file/editor persistence behavior
- named workspace save points still create Git commits
- explicit workspace save points now stamp a small manifest trailer into the Git-backed history subject
- explicit workspace save points now also record a local index entry under `workspaceDataDir`
- explicit workspace save points can now capture a local payload manifest plus per-file content payload for a filtered project text set in the current workspace
- that `project-text-set` payload boundary is assembled from loaded text candidates plus the workspace flat-file index, then filtered to exclude PDF/binary/non-document/support-only paths even if they have cached string content or appear in the raw index
- payload capture now also records skipped project-text candidates so unreadable or over-limit files remain visible in the save-point metadata instead of disappearing silently
- payload capture now also preserves empty `project-text-set` manifests so a later restore can still model the in-scope empty state of a save point
- Git history is the current recovery/history backend
- remote sync is layered on top of the same Git repository

This means the four concepts are more separated than before, but still not fully separated.

## Current Components

### History Repo Bootstrap

`src/services/workspaceHistoryRepo.js` is the first concrete Phase 4 boundary.

It is responsible for:

- rejecting invalid targets such as the home directory
- initializing a workspace-local Git repository when needed
- optionally seeding an initial commit

It is intentionally separate from auto-commit execution.

### Auto-Commit

`src/services/workspaceAutoCommit.js` currently owns:

- auto-commit marker lookup and enablement
- workspace eligibility guard checks
- Git add/status/commit execution for timed auto-commit

That service is now a thin shell over `src/domains/changes/workspaceAutoCommitRuntime.js`, which owns the actual marker gating, shared auto-history message construction, and timed commit orchestration.

This is still Git-centric safety behavior, not an app-level snapshot system.

### Explicit Save + Commit

`src/domains/changes/workspaceSnapshot.js` now exposes `createWorkspaceSnapshot`, which is the explicit save-point path used by the UI.

Current flow:

1. ensure the history repo exists
2. optionally enable auto-commit
3. persist dirty editors and in-memory file contents
4. resolve the explicit history message / fallback label
5. append a Git-backed snapshot manifest trailer for explicit workspace save points
6. `git add`
7. `git status`
8. create an explicit commit
9. record a workspace-save-point entry in the local snapshot index when `workspaceDataDir` is available
10. capture a local payload manifest plus per-file payload files for the current filtered project text set, excluding PDF/binary/non-document/support-only paths

This is useful, but it means explicit save history is still coupled to Git commit behavior for the underlying content state.

The public snapshot boundary now composes these lower seams:

- `src/domains/changes/workspaceHistoryAvailabilityRuntime.js`
- `src/domains/changes/workspaceSnapshot.js`
- `src/domains/changes/workspaceHistoryPointRuntime.js`
- `src/domains/changes/workspaceHistoryPreparationRuntime.js`
- `src/domains/changes/workspaceHistoryCommitRuntime.js`
- `src/domains/changes/workspaceSnapshotManifestRuntime.js`

### Named Snapshot UI

The current snapshot UI is not a separate snapshot backend.

`src/components/layout/Footer.vue` and `src/components/layout/SnapshotDialog.vue` currently collect an optional name for the explicit save-point action, and that name still becomes the Git commit message used by `createWorkspaceSnapshot`.

`src/domains/changes/workspaceHistoryMessageRuntime.js` now centralizes the current message-generation and message-classification rules so history UI no longer depends on hard-coded English `Save:` prefix checks.

`src/domains/changes/workspaceHistoryPointRuntime.js` now makes the app-level history-point intent explicit before the Git commit layer runs.

`src/domains/changes/workspaceSnapshotRuntime.js` and `src/domains/changes/workspaceSnapshot.js` now provide the first explicit Git-backed snapshot object and operation boundary above those history runtimes.

`src/domains/changes/workspaceSnapshotMetadataRuntime.js` now attaches explicit title/named/capability metadata above those records.

`src/domains/changes/workspaceSnapshotManifestRuntime.js` now persists and parses a minimal manifest trailer so explicit workspace save points keep `scope` / `kind` metadata even when they later show up inside file-scoped Git history.

`src/domains/changes/workspaceLocalSnapshotStoreRuntime.js` now owns the first local snapshot-store slice:

- resolve the workspace save-point index path under `workspaceDataDir`
- normalize local workspace-save-point records
- record newly created workspace save points into the local index
- backfill manifest-backed Git workspace save points into the local index when the browser/feed is loaded

`src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js` now owns the first restorable payload slice:

- resolve payload manifest/content paths under `workspaceDataDir/snapshots/payloads/*`
- capture text payload files for the current filtered project text set inside the workspace
- reuse `src/domains/changes/workspaceSnapshotProjectTextRuntime.js` so project-text candidate collection stays outside the payload/runtime shell
- exclude PDF/binary/non-document/support-only paths from that broadened set even when other parts of the app cache string content for them
- persist the current payload capture scope alongside the payload manifest metadata
- persist skipped project-text candidates plus simple capture-failure reasons alongside the payload manifest metadata
- persist an empty payload manifest when the current `project-text-set` is empty so the save point can still represent an in-scope empty state
- write a payload manifest that describes the captured files
- restore those captured files without using `git checkout`

`src/domains/changes/workspaceSnapshotPreviewRuntime.js` now owns the aggregate current-workspace comparison summary for payload-backed workspace save points.

`src/domains/changes/workspaceSnapshotDiffRuntime.js` now owns the selected-file full diff/content preview surface for modified or missing payload-backed workspace save-point files.

`src/components/WorkspaceSnapshotDiffEditor.vue` now renders that save-point file preview as a local patch/diff editor surface using the shared merge-view helper instead of paired excerpt cards.

`src/domains/changes/workspaceSnapshotFileApplyRuntime.js` now owns writing merged snapshot preview content back through the normal file-save/editor-sync path, so chunk-level apply does not bypass the app-managed workspace snapshot boundary.

`src/domains/changes/workspaceSnapshotDeletionRuntime.js` now owns listing and removing files that were added after the selected save point but still fall inside the current filtered `project-text-set`, so full restore no longer has to ignore those files or collapse back into a Git rewind.

`src/app/changes/snapshotLabelPromptRuntime.js` plus `src/app/changes/useSnapshotLabelPrompt.js` now isolate the Footer prompt timer, dialog visibility, and pending label resolution from the rest of the Footer status UI.

User-facing wording is now more honest than before:

- the Footer prompt still offers to name the saved version
- the dialog title now uses version-history wording instead of “Create Snapshot”
- initial seed history labels now use `Initial history` rather than `Initial snapshot`

So, in current Altals terminology:

- naming a saved version in the footer is functionally creating a named Git-backed snapshot that is still stored as a Git commit

That is a key current-state limitation, not just a wording issue.

### Version History

`src/components/VersionHistory.vue` is backed by Git history:

- list entries via `git log`
- preview entries via `git show`
- restore from Git history

The Git IO behind that UI now lives in `src/domains/changes/workspaceVersionHistoryRuntime.js`, and the component now consumes file-scoped snapshot objects through `src/domains/changes/workspaceSnapshot.js` instead of raw Git entries.

The app-facing file-history entry points are now explicit:

- `openFileVersionHistoryBrowser({ workspace, filePath, ... })`
- `listFileVersionHistory({ workspacePath, filePath })`
- `loadFileVersionHistoryPreview(...)`
- `restoreFileVersionHistoryEntry(...)`

### Workspace Save Points

`src/components/WorkspaceSnapshotBrowser.vue` is now the dedicated user-facing browser for repo-wide workspace save points.

Its current app-facing entry points are:

- `listWorkspaceSavePoints({ workspacePath, workspaceDataDir })`
- `restoreWorkspaceSavePointFile({ workspace, snapshot, filePath, ... })`

Its lower runtime entry point is now also explicit:

- `listWorkspaceSavePointEntries({ workspacePath, workspaceDataDir })`

That feed now reads a local workspace-save-point index under `workspaceDataDir/snapshots/workspace-save-points.json` and backfills manifest-backed Git workspace save points into that index as needed.

`WorkspaceSnapshotBrowser.vue` now also:

- loads the payload manifest summary for payload-backed workspace save points
- shows which captured files belong to the selected save point
- shows whether the selected save point uses the new `project-text-set` capture scope or one of the older narrower payload scopes
- shows which project-text candidates were skipped during capture and explains skipped-only save points without presenting them as restorable
- shows a current-workspace comparison summary for captured files before restore, without routing that preview through Git history
- shows files that were added after the selected save point inside the current filtered `project-text-set`
- shows a selected-file patch/diff editor for modified or missing captured files before restore, without routing that preview through Git history
- lets the user use chunk controls inside that diff surface and apply the merged text result back to the selected workspace file without routing that write through Git history
- lets the user restore the selected captured file without forcing the rest of the payload set to restore in the same action
- lets the user remove one added in-scope file, or remove all added in-scope files during full restore, without using `git checkout`
- restores those captured files through the new app-managed payload runtime

Older/backfilled workspace save points can still appear without a local payload.

### Remote Link Preparation

Remote-link preparation is now split more explicitly.

`src/domains/git/workspaceRepoLinkRuntime.js` owns:

- local history repo bootstrap before remote binding
- optional auto-commit enablement before the remote is configured
- remote setup / gitignore ordering
- initial local auto-commit swallow-on-failure behavior

`src/services/workspaceGitHub.js` now delegates that sequence instead of inlining it.

### Remote Sync

Remote sync currently lives in:

- `src/services/workspaceGitHub.js`
- `src/domains/workspace/workspaceAutomationRuntime.js`

Current behavior:

- auto-commit may trigger auto-sync
- fetch/pull cycles can reload open files after remote updates
- linking a remote can initialize history, enable auto-commit, and perform an initial auto-commit

So remote sync is still coupled to the same Git-backed local safety path.

## Separation Status

### Autosave

Current state:

- partially separate
- implemented through document/file persistence paths
- not presented as user history

This is the closest concept to being separate already.

### Local Snapshot

Current state:

- now has a first explicit snapshot object and operation boundary above Git
- snapshot scope is explicit: workspace-level save points vs file-level version-history entries
- explicit workspace save points now also persist a small manifest trailer in Git-backed history subjects
- explicit workspace save points now also persist into a local workspace-save-point index under `workspaceDataDir`
- the workspace snapshot browser now reads that local index and backfills older manifest-backed Git entries into it
- explicit workspace save points can now also persist a local payload manifest plus payload files for the current filtered project text set
- workspace-level restore now exists for payload-backed save points without using raw Git rewinds
- workspace-level restore now also models removal of newly added in-scope project-text files and can preserve an explicitly empty in-scope save point through empty payload manifests
- backend behavior for workspace save points still resolves to Git commit creation for the underlying content state
- payload capture is still intentionally narrow and currently covers a filtered project text set rather than the whole workspace
- that project text set is now explicitly filtered so cached PDF extraction text and other binary/non-document/support-only paths do not leak into workspace save-point payloads

This is the largest remaining safety-model gap.

### Git Commit

Current state:

- explicit save+commit exists
- timed auto-commit exists behind enablement markers
- version history and named safety points still rely on Git commits

Git is still carrying too much safety responsibility.

### Remote Sync

Current state:

- explicit GitHub/runtime layer exists
- sync timers are runtime-managed
- still depends on the same Git repository and history flows

Remote sync is more explicit than before, but it is not yet independent from local safety concepts.

## Current Risks

The main current risks are:

- workspace restore currently covers only the filtered project text set, not the whole workspace
- explicit save history and auto-commit still both feed Git history directly
- remote link/setup can also influence local history behavior
- users and maintainers can still misread Git history as the whole safety model
- older/backfilled workspace save points may exist in the browser without a local restore payload
- older payload-backed workspace save points may still carry the narrower `open-workspace-files` or `loaded-workspace-text` capture scope
- workspace save-point file preview is now app-managed and uses a fuller patch/diff editor surface with explicit chunk-level apply/restore semantics
- workspace save points can now replay one captured file, the whole captured set, or remove newly added in-scope files, but they still do not provide a whole-workspace rewind beyond the filtered `project-text-set`

## Target Direction

The repository target remains:

- autosave for frequent local persistence
- local snapshots as app-level restore points
- Git commits as explicit history/milestone actions
- remote sync as visible networked state synchronization

That target has landed only partially.

## Next Safety Slice

The current planned Phase 4 scope is now complete.

If safety-model work resumes later, the next non-trivial decision is no longer a narrow wrapper extraction; it is whether Altals should ever support a broader whole-workspace rewind beyond the current filtered `project-text-set`.

The immediate next repository slice should shift back to Phase 3:

1. extract document build execution out of UI-facing composables and into a shared document operation seam
2. keep the current `workspace` vs `file` restore distinction explicit
3. continue avoiding `git checkout` or raw commit rewinds as the default workspace-snapshot restore path
