# Contributing

Contributions should preserve product clarity, explicit operations, and safe local-first behavior.

## Before Changing Code

- Read the root `AGENTS.md`.

## Working Style

- Prefer small, coherent slices over broad rewrites.
- Keep docs truthful and update them in the same slice when behavior or architecture changes.
- Do not create git worktrees by default.
- Do not use destructive Git commands unless explicitly requested.

## Placement Guidance

- Put shell orchestration in `src/app`.
- Put reusable workflow logic in `src/domains/*`.
- Put effectful adapters in `src/services/*`.
- Keep stores, components, and composables thinner over time.

## Validation Expectations

- Run targeted tests for the changed slice.
- Run `node --test tests/*.test.mjs`.
- Run `npm run build`.
- Record any pre-existing failures explicitly if the full suite is not green.

## AI Review Workflow

- Enable the repository Codex stop-time review gate with `npm run agent:enable-codex-gate`.
- Run `npm run agent:codex-review` after Claude Code changes when you want an explicit Codex review on demand in addition to the stop gate.
- Run `npm run agent:codex-postflight -- --plan <path-to-plan>` after Codex implements a plan so Claude audits execution progress against the plan.
