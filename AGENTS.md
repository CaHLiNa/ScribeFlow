# Altals Agent Constitution

Scope: repository-wide.

Read `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` before making meaningful changes.
Consult `docs/DOCUMENT_WORKFLOW.md` for preview/compile/editor workflow work and `docs/OPERATIONS.md` for agent/release workflow commands.

## Mission

Altals is a local-first desktop academic research platform for Markdown and LaTeX, with integrated project-level references, reading, and citation workflows.

The product is centered on one practical workbench:

- open a local project directory
- browse project files and project references from the same workspace
- read source material without leaving the desktop app
- write Markdown and LaTeX documents
- insert citations and maintain bibliography output in context
- compile and preview documents correctly
- inspect outline and other research-adjacent context in the right-side inspection area

## Product Boundaries

- The desktop Tauri app is the primary product surface.
- The core scope is one academic research workbench for writing, references, reading, citation, compile, and preview flows.
- The left sidebar remains project-tree-first even when reference entry points are added.
- The right-side inspection area is currently outline-first, but may grow to support directly related reading or citation context.
- Do not add new product surfaces, new workflow systems, or speculative platform expansions.
- The `web/` directory is not the primary product and should not drive decisions for the desktop app.

## Current Direction

- Stabilize the current desktop research workflow while extending it into a coherent references, reading, and writing loop.
- Prefer removing stale systems over preserving dead architecture.
- Project-scoped references, in-app reading, writing, and citation insertion are peer parts of the active product direction.
- Future AI workflows and PDF translation should support a plugin-capable extension model rather than being welded into the core app from day one.
- Do not turn the app into a generic PKM, chat shell, or disconnected library manager.
- When making desktop UX decisions, prefer a polished macOS-native direction over generic cross-platform chrome.

## Working Rules

- First investigate, then change.
- Do not make speculative or opportunistic expansions while fixing current behavior.
- Prefer deleting obsolete systems over layering compatibility glue on top of them.
- Keep work desktop-first and local-first.
- Update tests and docs in the same slice when behavior, architecture, or repo policy changes.
- Do not touch the separate `web/` project unless the user explicitly asks.

## Frontend Guardrail

- The existing frontend look and feel is intentionally preserved.
- Do not restyle, redesign, or significantly rework frontend interaction patterns without explicit user approval.
- If a frontend change is necessary to complete a bug fix, keep the visual change minimal and confirm with the user before making broader UI adjustments.

## Architecture Guidance

Use this direction unless the user explicitly approves a different structure:

- `src/app`: shell lifecycle, app boot, and desktop orchestration
- `src/domains/*`: document, reference, citation, reader, and workspace workflow rules plus reusable runtime decisions
- `src/services/*`: effectful integrations such as filesystem access, compile runners, preview bridges, importers, metadata adapters, and external tool seams
- `src/stores/*`: reactive state and thin coordination
- `src/components/*`: UI rendering and user intent emission
- `src/composables/*`: reusable UI glue, not product policy
- `src-tauri/*`: backend commands, native integration, filesystem/process execution, and typed desktop seams

Keep policy out of components when it can live in `domains`. Keep `services` effectful but policy-light. Keep stores thinner over time instead of turning them into another policy layer.

## Change Shape

- Prefer small, validated slices when investigating or de-risking a change.
- Once the root cause is clear, implement the complete and correct fix instead of stopping at a temporary patch.
- Avoid big-bang rewrites unless the user explicitly asks for one.
- Preserve working compile/preview behavior while replacing internals.

## Validation

- Run the smallest relevant verification commands during investigation.
- Before claiming completion, run the targeted tests for the changed slice.
- Run `npm run build` for meaningful frontend or integration changes.
- If repo policy or docs change, update the related audit tests in the same slice.
- If something cannot be verified, say so explicitly.

## AI Review Workflow

- For Claude Code work in this repository, keep the Codex stop-time review gate enabled. Run `npm run agent:enable-codex-gate` once in the repo when setting up a machine or fresh checkout.
- After Claude-authored code changes, expect a Codex review before sign-off. Use `/codex:review --base main` in Claude Code or `npm run agent:codex-review`.
- After Codex-authored changes that are meant to implement a plan, run `npm run agent:codex-postflight -- --plan <path-to-plan>` before claiming completion.
- The Claude postflight audit compares the current branch against the chosen plan and reports `Completed`, `Pending`, `Deviations`, `Risks`, `Verification`, and `Next step`.
