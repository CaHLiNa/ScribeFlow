# Task Plan: Reference Library Development Checklist

## Goal
Turn the repository's references / reader / citation direction into an executable development checklist grounded in the current codebase.

## Phases
- [x] Phase 1: Review product and architecture direction
- [x] Phase 2: Inspect current reference-, citation-, and PDF-related capabilities
- [x] Phase 3: Draft a structured development checklist
- [x] Phase 4: Save the checklist to `/plan`
- [x] Phase 5: Run doc verification

## Key Questions
1. Which parts already exist in the current workbench and should not be replanned?
2. What is the minimum shippable slice for a project-scoped references library?
3. How should work split across `domains`, `services`, `stores`, `components`, and `src-tauri`?
4. What tests should gate each phase?

## Decisions Made
- Use `docs/ACADEMIC_PLATFORM_DIRECTION.md` as the canonical roadmap source.
- Keep the checklist aligned with existing architecture boundaries from `docs/ARCHITECTURE.md` and `docs/DOMAINS.md`.
- Treat existing PDF preview and document workflow support as reusable infrastructure, not as greenfield work.

## Errors Encountered
- `scripts/codex_hook_emulation.py` is not present in this repository, so the session-start helper could not run.
- The repository does not currently contain a dedicated references-library implementation plan under `docs/superpowers/plans/`.

## Status
**Completed** - The checklist is saved in `/plan/reference-library-development-checklist.md` and the minimal docs verification passed.
