# Altals Agent Constitution

Scope: repository-wide.

Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and `docs/REFACTOR_BLUEPRINT.md` before making meaningful changes.

## Mission

Altals must stay a local-first, project-directory-centered research and academic operating system.

Every meaningful change should strengthen the same core loop:

- open a local project
- browse files and references
- draft and edit documents
- run builds, notebooks, and terminal tasks
- inspect outputs, history, and AI-assisted changes

## Repository Rules

- Keep autosave, snapshots, Git history, remote sync, and AI mutation as explicit safety boundaries.
- Prefer small validated slices over broad speculative rewrites.
- Follow the existing `app -> domains -> services -> stores/components` direction instead of adding new glue in random layers.
- Update tests and docs in the same slice when behavior, architecture, or repo policy changes.
- Keep the desktop research workflow as the primary product surface; do not optimize the separate `web/` project at the expense of the main app.

## Expected Change Shape

- `src/app` composes shell-facing orchestration
- `src/domains/*` owns reusable runtime and workflow decisions
- `src/services/*` owns effectful integrations and adapters
- `src/stores/*` holds reactive state and thin coordination
- `src/components/*` renders UI and emits intent

If a file is already too large or responsibilities are tangled, use the current slice to extract a clearer seam instead of layering on more coupling.
