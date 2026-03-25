# Testing

Altals uses focused node:test coverage plus a required production build check.

## Default Validation Loop

- run targeted tests for the files or runtime helpers you changed
- run `node --test tests/*.test.mjs`
- run `npm run build`

## What The Full Test Suite Covers

- frontend runtime helpers and workflow runtimes
- persistence and history behavior
- reference, document, terminal, and AI workflow seams
- repo policy audits, including required documentation and AGENTS coverage

## Testing Guidance

- Add focused tests when you extract or simplify runtime logic.
- Prefer tests at explicit runtime/helper seams instead of UI-only snapshots.
- When the suite is not fully green, state the exact failing tests and whether they are pre-existing.
