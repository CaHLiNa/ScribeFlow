# Operations

This document describes the main user-facing operations that still exist in the document-only product.

## Core Operations

- Open a workspace folder
- Restore file tree, recent files, and editor layout
- Open a document or create a new document tab
- Autosave edited text buffers back to disk
- Render Markdown preview
- Compile LaTeX or Typst documents
- Open generated document output externally
- Inspect outline, document context, document export state, and document-run status
- Prepare workspace files before snapshots or history capture

## Operational Rules

- Operations should route through named runtimes or services instead of large component-local side effects.
- Preview routes are derived from a source document and should not become their own source of truth.
- Compile failures must remain visible in the document run surface.
- Persistence and recovery paths should stay explicit and auditable.

## Validation

- Verify source edits persist correctly.
- Verify preview routes resolve back to the correct source file.
- Verify compile and external output opening flows handle missing tools and failing builds cleanly.
