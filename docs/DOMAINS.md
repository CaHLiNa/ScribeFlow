# Domains

## Purpose

`src/domains/*` holds reusable product policy and runtime decision code that should not live in Vue components.

## Current domain areas

- `src/domains/ai`
  AI runtime-facing presentation and context helpers that remain on the frontend side.
- `src/domains/document`
  Document workflow resolution, build orchestration, preview adapters, and reconcile logic.
- `src/domains/editor`
  Pane-tree, tab, cleanup, restore, and editor-runtime coordination rules.
- `src/domains/files`
  File creation, content, tree refresh, hydration, cache, and watcher policy.
- `src/domains/references`
  Reference normalization, CSL conversion, and presentation helpers.
- `src/domains/workbench`
  Workbench motion and shell-level coordination helpers.
- `src/domains/workspace`
  Workspace template and starter logic.

## Rule

If behavior is product policy rather than side-effect plumbing, prefer `domains` over `components`, `services`, or `stores`.
