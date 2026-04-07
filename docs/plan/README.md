# Iteration Plan

This file tracks medium-term priorities. It is not the execution log; `docs/REFACTOR_BLUEPRINT.md` is the live slice record.

## Current Iteration Priorities

1. Reframe Altals as one coherent academic writing workbench instead of a leftover shell.
2. Unify Markdown, LaTeX, and Typst around shared document, preview, build, and citation workflows.
3. Keep frontend and backend changes landing in small validated slices with matching docs and tests.

## Product Reshape Plan

### Phase 1 — Workbench information architecture and visual baseline

Goal: make the desktop shell immediately read as a focused writing workspace.

- simplify the launcher into a workspace-first entry surface
- clarify the top rail as project navigation plus writing actions
- tighten spacing, surfaces, and state hierarchy across shell chrome
- reduce visual noise before deeper runtime changes

### Phase 2 — Unified document workflow seams

Goal: stop treating Markdown, LaTeX, and Typst like three separate apps.

- add shared document adapter boundaries for outline, preview, build, and citation behavior
- move file-type branching out of broad stores and components
- keep editor, preview, and build panels driven by named workflow seams

### Phase 3 — Build and diagnostics experience

Goal: make compile and preview behavior trustworthy for academic writing.

- unify build task state and diagnostics models
- improve error-to-source navigation
- separate streaming run feedback from final build results
- make external output opening and run history clearer

### Phase 4 — Backend slimming

Goal: move the Tauri backend toward explicit command, service, model, and error boundaries.

- thin command handlers down to validation, normalization, service calls, and structured responses
- extract coherent filesystem, process, Git, and document-build services
- reduce coupling inside broad backend modules

### Phase 5 — Academic writing differentiators

Goal: make the product meaningfully better than a generic editor shell.

- strengthen bibliography discovery and citation insertion
- add clearer project templates for article, thesis, report, notes, and resume flows
- improve save-point, history, and project-level export affordances

## Current Execution Slice

### Slice A — Shell refresh and planning baseline

Goal: establish a cleaner entry and navigation experience without expanding product scope.

Completed work:

- rewrote the medium-term plan to reflect the workbench rebuild path
- refreshed launcher, header, and top-rail chrome around the writing workflow
- added shared shell surface tokens instead of one-off styling
- recorded the slice in `docs/REFACTOR_BLUEPRINT.md`

### Slice B — Document workflow seams and academic starters

Goal: keep document behavior unified while making the writing workspace feel more intentional.

Completed work:

- added document context inspector plus shared workflow diagnostics and export-state runtimes
- introduced document adapter and document citation runtimes
- routed citation/drop syntax through document-level runtime seams
- added starter templates for Markdown, LaTeX, and Typst in the workspace starter surface
- continued slimming backend support modules by extracting LaTeX, Git, and filesystem helper modules

## Ongoing Quality Work

- expand tests when new domain seams land
- keep docs aligned with the shipped desktop product
- prefer deleting stale shell behavior over preserving misleading compatibility paths
