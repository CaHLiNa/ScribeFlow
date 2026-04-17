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

Owns document workflow capabilities, preview or build actions, adapter resolution, diagnostics decisions, and workspace preview state.

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
- `workspaceSnapshotFlatFilesRuntime.js`

### `src/domains/references/*`

Owns reference interop, search token normalization, citation presentation decisions, and other reusable reference rules that should not live in components or stores.

Representative files:

- `referenceInterop.js`
- `referencePresentation.js`

### `src/domains/editor/*`

Owns editor open or persist behavior, pane layout, tab behavior, runtime view registration, and cleanup.

Representative files:

- `editorOpenRoutingRuntime.js`
- `editorPersistenceRuntime.js`
- `paneTreeLayout.js`
- `paneTabs.js`
- `editorRestoreRuntime.js`

### `src/domains/workbench/*`

Owns workbench-level interaction and motion rules that should not be buried in view components.

Representative files:

- `workbenchMotionRuntime.js`

### Future `src/domains/reader/*`

Owns reader session policy, source-to-draft navigation decisions, inspection behavior for reading context, and annotation rules that should be shared across components and stores.

Representative future files:

- `readerSessionRuntime.js`
- `readerNavigationRuntime.js`
- `readerInspectionRuntime.js`
- `annotationMappingRuntime.js`

### `src/domains/ai/*`

Owns grounded AI workflow policy, context eligibility, prompt assembly rules, filesystem-skill execution policy, citation-backed drafting guardrails, and other reusable AI decisions that should not live in components or stores.

Representative files:

- `aiContextRuntime.js`
- `aiArtifactRuntime.js`

Future additions can include:

- `groundedPromptRuntime.js`
- `citationGuardrailsRuntime.js`
- `aiWorkflowRuntime.js`

### `src/domains/workspace/*`

Owns workspace starter metrics, templates, and shell-facing workspace setup behavior.

Representative files:

- `workspaceStarterMetrics.js`
- `workspaceTemplateRuntime.js`

## Practical boundary rules

- put cross-component product decisions in `domains`
- keep direct filesystem, process, and network effects in `services`
- keep Pinia stores focused on state ownership and coordination
- keep Vue components focused on rendering and emitting user intent
- keep reference, citation, reader, and AI policy out of components even when the UI feels sidebar-shaped or panel-shaped

## Signs logic belongs in a domain

- the same decision is needed by both a store and a component
- a workflow has multiple valid states that need one normalized answer
- the code is defining product behavior rather than performing an effect
- tests can describe the logic without mounting UI
- the feature needs to adapt differently for Markdown and LaTeX without duplicating UI conditionals
- the feature coordinates files, references, readers, and AI under one research task

## See also

- `docs/ARCHITECTURE.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOCUMENT_WORKFLOW.md`
