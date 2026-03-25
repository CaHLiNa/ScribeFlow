# Git And Snapshots

Altals keeps several safety and history concepts separate on purpose.

## Separate Concepts

- autosave
- local workspace save points
- Git commits
- remote sync

These are related, but they are not interchangeable.

## Local Save Points

- Workspace save points capture project text state into local payload manifests.
- They support preview and restore flows without treating Git history as the only recovery mechanism.
- Save-point restore semantics are explicit and workspace-scoped.

## Git History

- Git-backed history is used for explicit change tracking and commits.
- Auto-commit is a separate capability, not a synonym for autosave.
- Commit messages and history listings are surfaced through dedicated runtime helpers.

## Remote Sync

- Remote sync is optional.
- Linking a repo, fetching, pulling, and pushing are separate operations from local save or recovery.
- Remote success does not imply local recovery coverage.

## Execution State Caveat

- Notebook execution state is not recreated by restoring files alone.
- Restoring a workspace save point is not the same as replaying kernel state.
