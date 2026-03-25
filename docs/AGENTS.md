# Docs Agents

Scope: everything under `docs/`.

Read the root `AGENTS.md` and `docs/REFACTOR_BLUEPRINT.md` before making meaningful docs changes.

## Mission

Documentation must describe the current Altals system truthfully as a local-first, project-directory-centered research and academic operating system.

## Rules

- Do not describe planned architecture as if it has already landed.
- Update docs in the same slice when product behavior, architecture, operations, or validation expectations change.
- Keep `docs/REFACTOR_BLUEPRINT.md` as the live execution log.
- Keep `docs/plan/README.md` as the medium-term roadmap, not the slice-by-slice log.
- Move stale material to `docs/LEGACY/` instead of leaving misleading active docs in place.

## Expected Outputs

- product docs should reflect the current research workflow
- architecture docs should reflect actual code seams
- operations and safety docs should keep Git, save points, sync, and AI boundaries explicit
- testing docs should match the commands contributors are expected to run
