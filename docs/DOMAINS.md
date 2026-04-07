# Domains

Altals is now intentionally narrowed to a document-first desktop workspace centered on three authoring formats: Markdown, LaTeX, and Typst.

## Primary Product Domains

- Workspace and project lifecycle
- Files, tree hydration, and file watching
- Documents, editors, and preview surfaces
- Build and document workflow operations
- Changes, history, and save points

## Current Code Mapping

- `src/domains/workspace/*`: workspace bootstrap, automation, settings, and GitHub runtimes
- `src/domains/editor/*`: pane-tree and editor-facing runtime helpers
- `src/domains/document/*`: document routing, adapter resolution, preview, and build/runtime decisions for Markdown, LaTeX, and Typst
- `src/domains/files/*`: project file creation, mutation, hydration, and watch flows
- `src/domains/changes/*`: local save points, history availability, preview, and restore flows
- `src/services/documentWorkflow/*`: build and preview operations that are being pulled toward clearer domain seams
- `src/stores/*`: still holds some domain-facing state that has not been fully extracted

## Important Cross-Cutting Areas

- Builds touch document type detection, adapter-specific compile behavior, preview panes, and output inspection.
- History touches local save points, Git commits, file preview, and restore flows.
- Workspace state still connects the shell, editor session, and file lifecycle seams.

## Domain Gaps Still Present

- Some document workflow behavior still spans stores, services, and UI glue.
- The remaining document complexity is now mostly concentrated in build/runtime coordination and legacy compatibility helpers rather than in separate product surfaces.
- The backend has not yet mirrored the frontend domain structure consistently.
