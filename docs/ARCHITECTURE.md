# Architecture

Altals is a desktop-first Vue and Tauri application with a document-first shell and a progressively cleaner split between orchestration, runtime logic, integrations, and UI.

## Top-Level Shape

- `src/`: frontend application
- `src-tauri/`: Rust and Tauri backend
- `tests/`: `node:test` coverage plus repository policy audits
- `docs/`: current product and engineering truth
- `web/`: separate web project, not the primary desktop shell

## Frontend Boundaries

- `src/app`: shell lifecycle, teardown, and app-level bridges
- `src/domains/*`: reusable document workflow and runtime decisions
- `src/services/*`: filesystem, process, compile, and adapter integrations
- `src/stores/*`: reactive state plus thin coordination
- `src/components/*`: visible UI surfaces
- `src/composables/*`: reusable UI glue
- `src/shared/*`: shared constants and helper utilities

## Backend Direction

The Tauri backend is still flatter than the frontend, but the target split is:

- commands for input normalization and response shaping
- core logic for shared document rules
- services for filesystem and process execution
- explicit shared types and error paths

## Current State

- The shell already behaves like a single document workspace.
- The right inspector now separates outline, document context, and document-run feedback.
- Document preview, diagnostics, citation syntax, and export-state summaries are increasingly routed through named adapter and runtime seams.
- Editor restore and preference loading still carry a small amount of migration code for old saved state.
- Some backend modules and editor-heavy paths are still broader than ideal.

## Architectural Direction

- Keep `App.vue` and top-level stores thinner over time.
- Move workflow decisions into `src/domains/*` before adding more component or store glue.
- Keep services effectful but policy-light.
- Avoid hidden mutation paths around autosave, compile, recovery, and sync behavior.

## Rust Migration Direction

- Rust migration should move workflow policy and effectful runtime decisions into typed backend seams before rewriting UI surfaces.
- UI replacement (if pursued) should follow proven parity slices and keep the desktop document loop intact; no big-bang rewrites of the shell.
