# Testing

The repository uses targeted runtime tests plus baseline lint, format, and build checks.

## Default verification commands

- `npm run format:check`
- `npm run lint`
- `node --test tests/*.test.mjs`
- `npm run build`
- `npm run agent:codex-review`
- `npm run agent:claude-plan-audit -- --plan <path>`

## How to choose the minimum useful test slice

### For repo policy or docs changes

Run at least:

- `node --test tests/repoDocsAudit.test.mjs`
- `node --test tests/frontendToolingBaselineTargets.test.mjs` when baseline tooling changes

### For document workflow changes

Look first at:

- `tests/documentWorkflowAdapterContracts.test.mjs`
- `tests/documentWorkflowAdaptersRuntime.test.mjs`
- `tests/documentWorkflowBuildRuntime.test.mjs`
- `tests/documentWorkflowRuntime.test.mjs`
- `tests/documentWorkspacePreviewRuntime.test.mjs`

### For shell or workbench chrome changes

Look first at:

- `tests/appShellLayout.test.mjs`
- `tests/workbenchChromeEntries.test.mjs`
- `tests/workbenchInspectorPanels.test.mjs`
- `tests/workbenchSidebarPanels.test.mjs`

### For file tree and editor behavior

Look first at:

- `tests/fileTreeHydrationRuntime.test.mjs`
- `tests/fileTreeRefreshRuntime.test.mjs`
- `tests/fileMutationRuntime.test.mjs`
- `tests/fileTreeWatchRuntime.test.mjs`
- `tests/editorOpenRoutingRuntime.test.mjs`
- `tests/editorPersistenceRuntime.test.mjs`

## What current tests cover

- document workflow runtime behavior
- editor routing, persistence, and pane layout
- file tree hydration, refresh, creation, and mutation
- workspace shell and workbench layout expectations
- repo policy audits for docs and baseline tooling

## Current testing expectations

- when behavior changes, update the matching tests in the same slice
- when repo policy or docs change, update the related audit tests in the same slice
- run the smallest relevant subset during investigation, then the meaningful slice checks before completion
- run `npm run build` for meaningful frontend or integration changes
- if something cannot be verified, say so explicitly

## Baseline tooling

`scripts/frontendBaselineTooling.mjs` owns the repository lint and format baseline. If a file is protected by a baseline audit, keep its lint/format coverage aligned with the tests.

## Representative test files

- `tests/repoDocsAudit.test.mjs`
- `tests/documentWorkflow*.test.mjs`
- `tests/frontendToolingBaselineTargets.test.mjs`
- `tests/workbenchInspectorPanels.test.mjs`

## See also

- `docs/CONTRIBUTING.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/OPERATIONS.md`
