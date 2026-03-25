# Architecture

Altals is a desktop-first Vue and Tauri application with a growing separation between shell orchestration, domain runtimes, effectful services, and presentation.

## Top-Level Shape

- `src/`: frontend application
- `src-tauri/`: Rust and Tauri backend
- `tests/`: node:test coverage for runtime helpers and repo policy
- `docs/`: current product, architecture, and refactor truth
- `web/`: separate web project, not the main desktop app shell

## Frontend

The frontend is moving toward these boundaries:

- `src/app`: top-level shell orchestration and bridge logic
- `src/domains/*`: reusable workflow and runtime decisions
- `src/services/*`: effectful integrations, adapters, and provider boundaries
- `src/stores/*`: reactive state and thin action shells
- `src/components/*`: UI rendering
- `src/composables/*`: reusable UI glue
- `src/editor/*`: editor-specific behaviors and extensions
- `src/shared/*`: shared constants and runtime helpers

## Backend

The backend is still comparatively flat, but the intended direction is:

- command handlers for input normalization and response shaping
- core logic for reusable business rules
- services for filesystem, process, and provider integrations
- models and errors as explicit shared types

## Current State

- The frontend has the clearest seams today.
- App-shell and workspace flows are actively being thinned into narrower runtimes.
- Several backend modules are still broader than desired and remain refactor targets.
- Not every operation is formalized yet; some behavior still spans stores, services, and components.

## Architectural Direction

- Keep root shell files thinner over time.
- Prefer named runtime boundaries over component-only or store-only orchestration.
- Avoid hidden mutation paths, especially for AI, Git, and recovery behavior.
