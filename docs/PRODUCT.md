# Product

Altals is a local-first, project-directory-centered research and academic operating system.

## Core Loop

The product is centered on one integrated loop:

- open a local project directory
- browse files, notes, and references
- draft in Markdown and notebooks
- author papers in LaTeX and Typst
- run code through terminal and notebook-backed flows
- build and preview outputs
- review changes, history, and save points
- optionally sync through Git
- use AI through auditable proposal and patch workflows

## First-Class Objects

- Project
- Document
- Notebook
- Computation
- Reference
- Build
- Change
- Workflow

## Supporting Systems

- Git sync and remote linking
- global and workspace settings
- generic chat surfaces
- packaging and release automation

These systems matter, but they do not replace the core research loop.

## Current Product Reality

- The strongest landed experience is still document-heavy: file browsing, editing, references, build/preview, history, and patch-first AI.
- Notebook, terminal, and computation flows exist, but their boundaries are less even than the document path.
- The desktop Tauri app is the primary product surface today.
- The `web/` directory is a separate web project, not the main desktop shell.

## Product Guardrails

- Keep safety boundaries explicit between autosave, local save points, Git history, and remote sync.
- Keep AI conservative, reviewable, and mutation-aware.
- Prefer product clarity and operational safety over feature count.
