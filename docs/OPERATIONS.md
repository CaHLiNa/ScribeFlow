# Operations

Altals is moving toward an explicit operation model so major product actions are understandable, testable, and auditable.

## Target Operations

- `OpenProject`
- `ListProjectFiles`
- `ReadDocument`
- `SaveDocument`
- `RunNotebookCell`
- `RunCodeSelection`
- `BuildDocument`
- `BuildProject`
- `SearchReferences`
- `InsertCitation`
- `CreateSnapshot`
- `RestoreSnapshot`
- `ListChanges`
- `CommitChanges`
- `PushRemote`
- `PullRemote`
- `RunAiWorkflow`

## Current Reality

- Some operations already have named runtime seams, especially around document workflow, snapshots, references, terminals, and AI workflow runs.
- Other operations are still distributed across stores, services, and composables.
- The refactor direction is to keep reducing component-local side effects and hidden cross-domain behavior.

## Operation Rules

- Mutating operations should be explicit.
- Recovery and history operations should not be confused with autosave or remote sync.
- AI-triggered work should route through reviewable workflow or patch seams rather than invisible mutation.
- UI surfaces should invoke operations, not become the operation boundary themselves.
