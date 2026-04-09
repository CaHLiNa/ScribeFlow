# Testing

The repository baseline should prove that the document workspace still formats, lint-checks, tests, and builds successfully.

## Default Verification Commands

- `npm run format:check`
- `npm run lint`
- `node --test tests/*.test.mjs`
- `npm run build`

## What The Suite Covers

- document workflow runtimes
- editor routing and persistence
- workspace preferences and restore behavior
- preview, document-context, and document-run helpers
- repository policy audits for docs and the root `AGENTS.md`

## Expectations

- When behavior changes, update the matching tests in the same slice.
- When docs or repo policy change, update the audit tests in the same slice.
- If the full suite is not green, report the exact failing command and the real failure count.
