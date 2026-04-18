# Document Workflow

## Scope

This document covers preview, compile, editor, and document-workflow decisions in the desktop app.

## Workflow rules

- Preserve working compile and preview behavior while replacing internals.
- Treat Markdown and LaTeX as first-class document sources.
- Keep preview, compile, diagnostics, and outline flows consistent with the active file.
- Update docs and tests in the same slice when document workflow behavior changes.

## Architecture guidance

- Put document policy in `src/domains/document/*` when possible.
- Keep file-format adapters aligned with the runtime adapters under `src/services/documentWorkflow/adapters/*` and `src/domains/document/*`.
- Keep editor-specific UI glue in `src/components/*` and `src/composables/*`, not in business-policy modules.

## Validation

- Run the smallest relevant checks while investigating.
- Run `npm run build` for meaningful frontend or integration changes.
- Run `cargo check --manifest-path src-tauri/Cargo.toml` when Tauri/backend seams change.
- If preview or compile behavior changes, verify at least one real document path end to end.
