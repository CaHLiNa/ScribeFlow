# Iteration Plan

This file tracks medium-term refactor arcs. It is not the execution log; that role belongs to `docs/REFACTOR_BLUEPRINT.md`.

## Current Iteration Priorities

1. Keep the local research loop clear across files, references, builds, previews, history, and AI workflows.
2. Continue thinning app-shell and store-heavy paths into explicit domain and operation seams.
3. Keep the docs baseline truthful so repository policy tests reflect current reality.

## Near-Term Frontend Work

- continue reducing shell-level layout coupling
- improve PDF and preview-surface performance at viewer boundaries
- keep moving workflow decisions out of large UI roots and into named runtimes

## Near-Term Backend Work

- extract flatter Tauri modules toward command, service, and core boundaries
- keep filesystem, process execution, and response shaping separate

## Ongoing Quality Work

- restore or expand tests when new seams land
- remove stale documentation and legacy assumptions incrementally
