# Product

Altals is a local-first document workspace centered on Markdown, LaTeX, and Typst projects.

## Core Loop

- open a local project folder
- browse project files
- write or revise Markdown, LaTeX, and Typst documents
- compile or preview outputs
- inspect outline, run status, and generated document outputs
- save, snapshot, and review changes safely

## First-Class Objects

- Workspace
- Document
- Preview
- Build Run
- Save Point
- Comment Thread

## Supporting Systems

- autosave and local save points
- Git and GitHub sync
- editor, theme, and preview preferences
- document compile services and external output opening

These systems support the document loop. They are not separate products.

## Current Product Reality

- The desktop shell is intentionally reduced to one document workbench.
- The left sidebar is for project files only.
- The center surface is for text editing, Markdown preview, Typst preview, and unsupported-file fallback.
- The right sidebar is for outline, document context, export-state awareness, and document-run feedback.
- The desktop Tauri app is the main product surface today.
- The `web/` directory is a separate web project, not the main shell.

## Product Guardrails

- Keep autosave, manual save points, and Git sync as explicit safety boundaries.
- Keep the product workspace-centered and local-first.
- Prefer a smaller truthful scope over reviving removed product surfaces.

## Migration Direction

- Rust migration work must preserve the current desktop document workflow instead of expanding scope.
- "Parity" means matching the user-visible behavior and workspace safety semantics rather than mechanically translating every source file.
