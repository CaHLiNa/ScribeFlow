# Contributing

This repository prefers small, validated slices over broad rewrites.

## Before changing code

- read `AGENTS.md`
- for meaningful product work, start with `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`
- for academic platform direction work, also read `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- consult `docs/DOCUMENT_WORKFLOW.md` when changing preview, compile, or editor workflow behavior
- consult `docs/OPERATIONS.md` when your change touches agent workflow, release steps, or environment-dependent operations

## Working expectations

- investigate first, then change
- update docs in the same slice when behavior or repo policy changes
- prefer deleting stale architecture over preserving dead systems
- do not let the `web/` directory drive desktop app decisions unless explicitly requested
- keep the desktop app as the primary product surface for decision-making

## Practical contribution flow

1. identify the smallest meaningful slice
2. read the relevant product, architecture, and subsystem docs
3. inspect the live code before proposing structural changes
4. implement the change without speculative expansions
5. run the minimum relevant validation command for the touched slice
6. run broader checks when the slice affects meaningful frontend or integration behavior
7. update docs when repository expectations changed

## Useful commands

- `npm run lint`
- `npm run format:check`
- `npm run build`

## Review workflow

- enable the Codex stop-time gate when setting up a machine: `npm run agent:enable-codex-gate`
- run a Codex review for code changes: `npm run agent:codex-review`
- run the Claude postflight audit for plan-based Codex work: `npm run agent:claude-plan-audit -- --plan <path>`

## When docs must change too

Update docs in the same slice when you change:

- product scope or boundaries
- architectural ownership or directory responsibilities
- document workflow behavior
- repository validation or release expectations
- required contributor workflow commands

## See also

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/OPERATIONS.md`
