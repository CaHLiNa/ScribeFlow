# Data Model

Altals stores state across the UI shell, workspace metadata, local history, references, AI workflows, and terminal execution.

## Core Entities

- Workspace: path, workspace id, workspace data dir, settings, active surface, sidebar state
- Document and tab state: open tabs, dirty status, viewer type, active pane
- Pane tree: split layout, pane ids, active tabs, preview ownership
- Reference library: global references, workspace collections, views, tags, active detail state
- Snapshot: Git-backed history entries and workspace-local save points with payload manifests
- Workflow run: template id, steps, checkpoints, status, visible chat output, stored snapshot
- Chat session: messages, runtime metadata, labels, restored workflow state
- Terminal session: groups, instances, build logs, shell metadata, persisted snapshots

## Persistence Layers

- `localStorage`: shell preferences such as zoom, surface, and sidebar state
- workspace metadata directory: project-scoped runtime files, save-point payloads, instructions, and related app data
- Git repository: explicit history and commit records
- global config directory: shared references, models, tools, and workspace-adjacent settings

## Data Model Rules

- Autosave state is not the same as save-point state.
- Save points are not the same as Git commits.
- Remote sync state is not the same as local recovery state.
- Notebook output and execution state should remain distinct from saved document state.
