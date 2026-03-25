# Domains

Altals already spans several product domains, even though not all of them are fully isolated in code yet.

## Primary Product Domains

- Workspace and project lifecycle
- Files, tree hydration, and file watching
- Documents, editors, and preview surfaces
- References and library management
- Terminal, notebook, and computation flows
- Build and document workflow operations
- Changes, history, and save points
- AI chat and workflow execution

## Current Code Mapping

- `src/domains/workspace/*`: workspace bootstrap, automation, settings, and GitHub runtimes
- `src/domains/editor/*`: pane-tree and editor-facing runtime helpers
- `src/domains/reference/*`: reference navigation and related behavior
- `src/services/documentWorkflow/*`: build and preview operations that are being pulled toward clearer domain seams
- `src/stores/*`: still holds some domain-facing state that has not been fully extracted

## Important Cross-Cutting Areas

- References touch editor insertion, library state, file-backed storage, and PDF navigation.
- Builds touch document type detection, adapter-specific compile behavior, preview panes, and terminal logs.
- History touches local save points, Git commits, file preview, and restore flows.
- AI touches chat sessions, workflow runs, proposal checkpoints, and document/reference helpers.

## Domain Gaps Still Present

- Notebook and kernel-backed computation flows are still spread across multiple layers.
- Some document workflow behavior still spans stores, services, and UI glue.
- The backend has not yet mirrored the frontend domain structure consistently.
