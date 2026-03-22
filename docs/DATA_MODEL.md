# Data Model

## Purpose

This document records the current explicit data-model seams that already exist in Altals.

It describes the repository as it exists today. It does not describe target models as if they are already implemented.

## Current Snapshot Model

Altals still stores local history in Git.

It now has ten explicit layers above that Git history:

- `src/domains/changes/workspaceSnapshotRuntime.js`
- `src/domains/changes/workspaceSnapshotMetadataRuntime.js`
- `src/domains/changes/workspaceSnapshotManifestRuntime.js`
- `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js`
- `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js`
- `src/domains/changes/workspaceSnapshotProjectTextRuntime.js`
- `src/domains/changes/workspaceSnapshotPreviewRuntime.js`
- `src/domains/changes/workspaceSnapshotDiffRuntime.js`
- `src/domains/changes/workspaceSnapshotFileApplyRuntime.js`
- `src/domains/changes/workspaceSnapshotDeletionRuntime.js`

These layers now introduce a first local workspace-save-point index plus a first restorable local payload slice while still reusing Git-backed history for the underlying content state. They map Git-backed history into explicit snapshot objects, attach UI/runtime metadata, persist a minimal manifest trailer for explicit workspace save points, record workspace-level save points into a local index under `workspaceDataDir`, capture payload manifests plus per-file payload content for a filtered project text set inside the current workspace, and model added-file removal inside that same explicit scope.

Current Git-backed record shape:

```js
{
  id: 'git:<commit-hash>',
  backend: 'git',
  sourceKind: 'git-commit',
  sourceId: '<commit-hash>',
  scope: 'file' | 'workspace',
  filePath: '/workspace/demo/draft.md',
  kind: 'named' | 'save' | 'auto' | 'empty',
  label: 'Draft 3 ready',
  message: 'Draft 3 ready',
  rawMessage: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
  createdAt: '2026-03-22T10:11:00Z',
  manifest: null | {
    version: 1,
    scope: 'workspace',
    kind: 'named',
  },
}
```

Current meaning:

- `id` is the app-facing snapshot id
- `backend` identifies the current storage/recovery backend
- `sourceKind` and `sourceId` preserve the underlying Git implementation detail
- `scope` distinguishes file-history records from workspace-level save points created through the explicit snapshot action
- `kind` comes from the persisted manifest when present, and otherwise falls back to the shared history-message runtime
- `filePath` is populated for file-history/version-browser entries and stays empty for repo-wide workspace snapshot feed entries
- `label` is only populated for named history points
- `message` is the clean display text after stripping any persisted manifest trailer
- `rawMessage` preserves the raw Git-backed history subject
- `manifest` is only present for explicit workspace save points that were written through the new manifest trailer path
- only file-scoped snapshots are previewable/restorable through the current version-history flow

Current local workspace-save-point index record shape:

```js
{
  id: 'local:workspace:<commit-hash>',
  backend: 'local',
  sourceKind: 'workspace-save-point',
  sourceId: '<commit-hash>',
  scope: 'workspace',
  filePath: '',
  kind: 'named' | 'save',
  label: 'Draft 3 ready',
  message: 'Draft 3 ready',
  rawMessage: 'Draft 3 ready [[altals-snapshot:v=1;scope=workspace;kind=named]]',
  createdAt: '2026-03-22T10:11:00.000Z',
  manifest: {
    version: 1,
    scope: 'workspace',
    kind: 'named',
  },
  payload: {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/<commit-hash>/manifest.json',
    fileCount: 2,
    skippedCount: 1,
    capturedAt: '2026-03-22T10:11:30.000Z',
    captureScope: 'open-workspace-files' | 'loaded-workspace-text' | 'project-text-set',
  },
}
```

Current meaning:

- local workspace-save-point entries are stored in `workspaceDataDir/snapshots/workspace-save-points.json`
- `backend: 'local'` means the browser/feed is reading from the app-managed index, not that content restore is independent from Git yet
- `sourceId` still points at the underlying Git commit hash for the saved workspace milestone
- `payload` is present only when that workspace save point has a local restorable payload manifest
- `payload.captureScope` makes the current restore-set boundary explicit so older open-files-only payloads, intermediate loaded-workspace-text payloads, and newer project-text-set payloads do not look identical
- `payload.skippedCount` records how many project-text candidates were inspected but not captured as restorable text
- payload metadata can now exist with `fileCount: 0` either when capture recorded only skipped files or when the current `project-text-set` itself was empty; those save points remain explainable in the browser, and later added-file removal is derived from preview-summary state rather than metadata capability flags alone
- the local index stores payload metadata, while the payload manifest/content live under `workspaceDataDir/snapshots/payloads/*`
- payload-backed workspace restore can now replay either the full captured set or an explicit selected subset of those captured files

Current local workspace-save-point payload manifest shape:

```js
{
  version: 1,
  kind: 'workspace-text-v1',
  workspacePath: '/workspace/demo',
  snapshot: {
    sourceId: '<commit-hash>',
    createdAt: '2026-03-22T10:11:00Z',
    message: 'Draft 3 ready',
  },
  capturedAt: '2026-03-22T10:11:30.000Z',
  fileCount: 2,
  skippedCount: 1,
  captureScope: 'project-text-set',
  files: [
    {
      path: '/workspace/demo/draft.md',
      relativePath: 'draft.md',
      contentPath: 'files/0.txt',
    },
  ],
  skippedFiles: [
    {
      path: '/workspace/demo/large.md',
      relativePath: 'large.md',
      reason: 'too-large',
    },
  ],
}
```

Current meaning:

- payload manifests live under `workspaceDataDir/snapshots/payloads/<snapshot-source-id>/manifest.json`
- each manifest entry points to a payload content file stored beside that manifest
- `captureScope` currently records whether the payload came from the older open-files-only set, the intermediate loaded-workspace-text set, or the newer project-text-set
- `project-text-set` is assembled from the workspace's loaded text candidates plus the current flat-file index, then filtered through the persistable-history path rules and binary-file guard
- `skippedFiles` records project-text candidates that were considered but could not be captured as restorable text, currently with reasons such as `read-failed` and `too-large`
- the broadened set still excludes PDF/binary/non-document/support-only paths instead of treating every cached string or indexed path as restorable workspace text
- the manifest can now also persist with `fileCount: 0` and `skippedCount: 0`, which represents a save point whose current filtered `project-text-set` was empty
- this payload slice is broader than the loaded set, but it still does not represent a whole-project rewind

Current attached metadata shape:

```js
{
  snapshotId: 'git:<commit-hash>',
  scope: 'file' | 'workspace',
  backend: 'git',
  sourceKind: 'git-commit',
  kind: 'named' | 'save' | 'auto' | 'empty',
  title: 'Draft 3 ready',
  message: 'Draft 3 ready',
  isNamed: true,
  isSystemGenerated: false,
  capabilities: {
    canPreview: true,
    canRestore: true,
    canCopy: false,
  },
  payload: {
    version: 1,
    kind: 'workspace-text-v1',
    manifestPath: '/workspace/.altals/snapshots/payloads/<commit-hash>/manifest.json',
    fileCount: 2,
    skippedCount: 1,
    capturedAt: '2026-03-22T10:11:30.000Z',
    captureScope: 'project-text-set',
  },
}
```

This metadata is derived at runtime from the snapshot record and is attached by `src/domains/changes/workspaceSnapshot.js`.

Current workspace save-point preview-summary shape:

```js
{
  manifest: {
    version: 1,
    kind: 'workspace-text-v1',
    workspacePath: '/workspace/demo',
    fileCount: 2,
    skippedCount: 1,
    captureScope: 'project-text-set',
  },
  counts: {
    unchanged: 1,
    modified: 1,
    missing: 0,
    unreadable: 0,
    tooLarge: 0,
    added: 2,
  },
  entries: [
    {
      path: '/workspace/demo/draft.md',
      relativePath: 'draft.md',
      status: 'modified',
    },
  ],
  addedEntries: [
    {
      path: '/workspace/demo/new-notes.md',
      relativePath: 'new-notes.md',
      status: 'added',
    },
  ],
  skippedFiles: [
    {
      path: '/workspace/demo/large.md',
      relativePath: 'large.md',
      reason: 'too-large',
    },
  ],
  reason: '',
}
```

Current meaning:

- `entries` describes the captured files from the payload manifest as they compare to the current workspace state
- `addedEntries` describes in-scope `project-text-set` files that did not exist in the selected save point
- `counts.added` feeds the UI affordance for added-file removal during full restore
- empty payload manifests can still produce meaningful `addedEntries` later, even though metadata capability flags for file replay remain false

## Current Operations Using This Model

The current Git-backed snapshot wrapper is used by:

- `src/domains/changes/workspaceSnapshot.js`
- `src/components/VersionHistory.vue`
- `src/components/WorkspaceSnapshotBrowser.vue`
- `src/app/changes/useWorkspaceSnapshotActions.js`

Current operations use explicit snapshot objects for:

- explicit snapshot creation
- file-scoped version listing
- repo-wide workspace snapshot feed listing
- workspace payload-manifest summary loading
- preview loading
- restore actions
- selected-file workspace restore actions
- selected-file workspace preview chunk-apply actions
- added-file removal actions derived from workspace save-point preview summaries

Current feed behavior is now split:

- `listFileVersionHistory({ workspacePath, filePath })` returns the file history for that file, including manifest-backed workspace save points if they touched the file
- `listWorkspaceSavePoints({ workspacePath, workspaceDataDir })` returns workspace save points from the local index and backfills manifest-backed Git entries into that index when needed

The underlying implementation still routes through:

- `src/domains/changes/workspaceHistoryPointRuntime.js`
- `src/domains/changes/workspaceVersionHistoryRuntime.js`
- `src/domains/changes/workspaceSnapshotRuntime.js`, which now also exposes explicit `listFileVersionHistoryEntries`, `listWorkspaceSavePointEntries`, `loadFileVersionHistoryPreview`, and `restoreFileVersionHistoryEntry` runtime seams
- `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js`, which now owns the workspace save-point index path plus local record/write/backfill behavior
- `src/domains/changes/workspaceLocalSnapshotPayloadRuntime.js`, which now owns payload manifest paths plus capture/load/restore behavior for payload-backed workspace save points
- `src/domains/changes/workspaceSnapshotProjectTextRuntime.js`, which now owns the filtered project-text candidate set used by payload capture
- `src/domains/changes/workspaceSnapshotPreviewRuntime.js`, which now compares captured payload files against the current workspace files without routing that preview through Git history
- `src/domains/changes/workspaceSnapshotDiffRuntime.js`, which now loads the full saved/current content plus preview summary data for modified or missing payload-backed workspace save-point files without routing that preview through Git history
- `src/domains/changes/workspaceSnapshotFileApplyRuntime.js`, which now owns app-managed file writes plus editor synchronization for payload restore and chunk-apply flows
- `src/domains/changes/workspaceSnapshotDeletionRuntime.js`, which now derives and removes added in-scope `project-text-set` files above the payload manifest

## Current Limitations

This is now a hybrid local-index plus Git-content layer.

It does not yet provide:

- whole-workspace restore coverage beyond the current filtered project text set
- delete/rewind semantics outside the current filtered `project-text-set`
- manifest persistence outside Git-backed history subjects for the file-history path

## Next Data-Model Step

The current planned Phase 4 data-model slices are complete.

If snapshot data-model work resumes later, the next non-trivial decision is no longer another narrow payload wrapper. It is whether Altals should ever represent a broader whole-workspace rewind beyond the current filtered `project-text-set` plus explicit added-file removal.

The immediate next repository slice should shift back to Phase 3:

1. keep the current `workspace` vs `file` scope distinction explicit
2. extract shared document build execution above the existing document-workflow build/runtime seam
3. avoid drifting back into low-value naming cleanup now that the public app boundary is aligned
