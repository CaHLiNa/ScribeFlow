# Git And Snapshots

The repository contains both repo-level git workflows and workspace-level history/snapshot flows used by the desktop app.

## Repository-level git

Normal source control for the app itself lives at the repository root.

Relevant repo-level automation includes:

- release automation in `.github/workflows/release.yml`
- AI review workflow commands in `scripts/agentReviewWorkflow.mjs`
- version checking and bumping in `scripts/version-utils.mjs` and `scripts/bump-version.mjs`

This is separate from the per-workspace history behavior the desktop app can create for opened project folders.

## Workspace-level history

Workspace folders opened in the app can be linked to a local history repository and auto-commit flow through:

- `src/domains/git/workspaceRepoLinkRuntime.js`
- `src/services/workspaceHistoryRepo.js`
- `src/services/workspaceAutoCommit.js`

Current behavior:

- a local git repository can be initialized for the workspace if one does not already exist
- the history repo can be seeded with an initial commit
- auto-commit can be enabled and triggered as part of workspace linking
- remote setup and `.gitignore` support are treated as explicit follow-up steps in the repo-link runtime

## Snapshot model

Workspace snapshots are normalized records built from git-backed history plus local save-point metadata.
Representative files:

- `src/domains/changes/workspaceSnapshotRuntime.js`
- `src/domains/changes/workspaceLocalSnapshotStoreRuntime.js`
- `src/domains/changes/workspaceSnapshotManifestRuntime.js`
- `src/domains/changes/workspaceVersionHistoryRuntime.js`

### File history entries

File history entries are mapped into explicit records with:

- git-backed source ids
- file scope
- normalized kind values such as named, save, or auto
- stable display fields for UI surfaces

### Workspace save points

Workspace save points merge:

- git-backed history entries that carry snapshot manifests
- local save-point payload metadata stored in the workspace data area

The merge step produces repo-wide workspace snapshot entries that can be filtered for visibility and restored through explicit runtime paths.

## Current operational intent

- keep workspace history separate from user source documents where possible
- expose stable UI-facing snapshot records even when source history is git-based
- prefer explicit restore and preview paths over opaque history behavior
- avoid treating ordinary repo commits and workspace save points as the same product concept

## Important boundaries

- repo-level source control for the app is not the same thing as a workspace history repo created for a user project
- local visibility state can hide specific snapshots from the UI without rewriting source history
- workspace save points are a product-facing recovery feature, not just raw git log exposure

## Validation anchors

- `tests/workspaceSnapshotRuntime.test.mjs`
- `tests/workspaceSnapshotPreviewRuntime.test.mjs`
- `tests/workspaceHistoryAvailabilityRuntime.test.mjs`
- `tests/fileVersionHistoryViewRuntime.test.mjs`

## See also

- `docs/DATA_MODEL.md`
- `docs/OPERATIONS.md`
- `docs/TESTING.md`
