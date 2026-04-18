# Product

Altals is a local-first desktop academic research workbench for Markdown and LaTeX.

## Core workflow

- Open a local project directory.
- Browse project files and project references in one workspace.
- Read source material without leaving the desktop app.
- Write Markdown and LaTeX documents.
- Insert citations and maintain bibliography output in context.
- Compile and preview documents inside the same desktop workflow.
- Inspect outline and closely related context in the right-side panel.

## Product boundaries

- The Tauri desktop app is the primary product surface.
- The left sidebar stays project-tree-first.
- The right-side panel stays outline and research-context oriented.
- Keep the app desktop-first and local-first.
- Do not turn the app into a generic PKM, chat shell, or disconnected library manager.
- Do not let the separate `web/` project drive desktop decisions.

## Current direction

- Stabilize the current desktop writing workflow.
- Tighten the loop among references, reading, writing, citation, compile, and preview.
- Prefer removing stale systems over preserving dead architecture.
- Keep future AI and translation work plugin-capable instead of hard-wired into the core app.
