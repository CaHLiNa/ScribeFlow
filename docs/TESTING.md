# Testing

The repository baseline should prove that the document workspace still formats, lint-checks, tests, and builds successfully.

## Default Verification Commands

- `npm run format:check`
- `npm run lint`
- `node --test tests/*.test.mjs`
- `npm run build`
- `npm run agent:codex-review`
- `npm run agent:codex-postflight -- --plan <path-to-plan>`

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

## AI Audit Commands

- `npm run agent:enable-codex-gate` enables the Codex stop-time review gate for the current checkout.
- `npm run agent:codex-review` runs a manual Codex review. It defaults to `--base main`; pass `-- --uncommitted` to review local edits instead.
- `npm run agent:codex-postflight -- --plan <path-to-plan>` runs a read-only Claude audit that compares the current branch against the supplied plan and reports execution status.
