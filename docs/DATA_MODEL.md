# Data Model

This repository mixes user workspace files, desktop app state, and derived workflow state.

## Main state buckets

### Workspace state

`src/stores/workspace.js` owns the active workspace identity plus shell-level preferences.
Important fields include:

- `path`
- `workspaceId`
- `workspaceDataDir`
- `claudeConfigDir`
- shell surface and sidebar preferences
- settings section state

`workspaceId` is a SHA-256 hash of the opened workspace path, generated through `src/services/workspacePaths.js`.

### Editor state

`src/stores/editor.js` owns:

- pane tree structure
- active pane and active tab
- dirty paths
- recent files
- editor runtime registration and persistence hooks

This state is UI-facing and highly session-oriented.

### File tree and file content state

`src/stores/files.js` owns:

- the current tree representation
- flat file cache
- expanded directories
- cached workspace tree snapshots
- loaded text file contents
- per-file load errors

This store is the bridge between backend filesystem reads and the workbench-visible file model.

### Document workflow state

`src/stores/documentWorkflow.js` owns:

- preview preferences by workflow kind
- active workflow session state
- preview bindings from preview paths to source paths
- markdown preview state
- workspace preview visibility and request state

### Compile/runtime state

Language-specific compile state is owned separately:

- `src/stores/latex.js` — compile state, queue state, diagnostics, compiler/tool availability, forward sync state

## Persisted locations

### User project files

User-owned documents stay in the opened workspace directory.

### App-owned workspace metadata

`src/stores/workspace.js` resolves a separate workspace data directory through `resolveWorkspaceDataDir()` in `src/services/workspacePaths.js`.

That workspace-owned area is used for app metadata such as:

- workspace bootstrap metadata
- project-owned internal data directory setup

### Local storage

The frontend also persists lightweight UI preferences in browser storage, including:

- document workflow preview preferences
- setup-complete flag
- editor and theme preferences handled by workspace/services layers

## Important record shapes

### Preview bindings

Preview bindings connect a preview path to its source path, preview kind, document kind, and pane ownership. This lets the app keep editor and preview actions synchronized.

### Compile state

LaTeX stores maintain per-file compile state maps. These records commonly include:

- `status`
- `errors`
- `warnings`
- `pdfPath`
- logs and timestamps

## Data boundaries

- user documents should remain in the opened workspace
- app-owned metadata should live outside source documents when possible
- derived workflow state should be reproducible from source files plus persisted metadata
- components should consume normalized store/domain state instead of inventing parallel ad hoc record shapes

## See also

- `docs/ARCHITECTURE.md`
- `docs/DOCUMENT_WORKFLOW.md`
