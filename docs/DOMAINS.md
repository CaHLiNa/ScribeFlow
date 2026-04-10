# Domains

The `src/domains` directory holds product rules and reusable runtime decisions that should stay out of components.

## Why this layer exists

Use domains for product policy that needs to be shared across stores, components, or services.

A good domain module usually:

- accepts explicit inputs instead of reading UI directly
- returns normalized state or decisions
- keeps policy out of components
- avoids becoming a thin wrapper around one store method

## Current domain areas

### `src/domains/document/*`

Owns document workflow capabilities, preview/build actions, adapter resolution, diagnostics, and workspace preview state.

Representative files:

- `documentWorkflowRuntime.js`
- `documentWorkflowAdaptersRuntime.js`
- `documentWorkflowBuildRuntime.js`
- `documentWorkspacePreviewRuntime.js`

### `src/domains/files/*`

Owns file tree hydration, refresh, creation, mutation, watches, file content behavior, and workspace text indexing.

Representative files:

- `fileTreeHydrationRuntime.js`
- `fileTreeRefreshRuntime.js`
- `fileCreationRuntime.js`
- `fileMutationRuntime.js`
- `fileContentRuntime.js`

### `src/domains/editor/*`

Owns editor open/persist/restore behavior, pane layout, tab behavior, runtime view registration, and cleanup.

Representative files:

- `editorOpenRoutingRuntime.js`
- `editorPersistenceRuntime.js`
- `paneTreeLayout.js`
- `paneTabs.js`
- `editorRestoreRuntime.js`

### `src/domains/changes/*`

Owns workspace snapshots, local save points, visibility filtering, diff/preview/apply behavior, version history, and history preparation.

Representative files:

- `workspaceSnapshotRuntime.js`
- `workspaceLocalSnapshotStoreRuntime.js`
- `workspaceSnapshotPreviewRuntime.js`
- `workspaceVersionHistoryRuntime.js`
- `workspaceHistoryPreparationRuntime.js`

### `src/domains/workspace/*`

Owns workspace bootstrap, starter metrics, automation, and workspace-level GitHub flows.

Representative files:

- `workspaceBootstrapRuntime.js`
- `workspaceStarterMetrics.js`
- `workspaceAutomationRuntime.js`
- `workspaceGitHubRuntime.js`

### `src/domains/git/*`

Owns workspace repository linking behavior.

Representative file:

- `workspaceRepoLinkRuntime.js`

## Practical boundary rules

- put cross-component product decisions in `domains`
- keep direct filesystem/process/network effects in `services`
- keep Pinia stores focused on state ownership and coordination
- keep Vue components focused on rendering and emitting user intent

## Signs logic belongs in a domain

- the same decision is needed by both a store and a component
- a workflow has multiple valid states that need one normalized answer
- the code is defining product behavior rather than performing an effect
- tests can describe the logic without mounting UI

## Validation anchors

A large share of the repository tests target domain runtime files directly. Representative examples:

- `tests/documentWorkflow*.test.mjs`
- `tests/fileTreeHydrationRuntime.test.mjs`
- `tests/editorOpenRoutingRuntime.test.mjs`
- `tests/workspaceSnapshot*.test.mjs`

## See also

- `docs/ARCHITECTURE.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/TESTING.md`
