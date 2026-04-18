# Architecture

## Default structure

- `src/app`: shell lifecycle, app boot, and desktop orchestration
- `src/domains/*`: product policy and reusable runtime decisions
- `src/services/*`: effectful integrations and bridge code
- `src/stores/*`: reactive state and thin coordination
- `src/components/*`: UI rendering and user intent emission
- `src/composables/*`: reusable UI glue
- `src-tauri/*`: native backend commands, process execution, filesystem access, and typed desktop seams

## Directional rules

- Keep product policy out of components when it can live in `domains`.
- Keep `services` effectful but policy-light.
- Keep stores thin over time instead of turning them into another policy layer.
- Prefer Rust-owned runtime authority for AI/session/tool behavior.
- Prefer small, validated slices over big-bang rewrites.

## Desktop UX guardrail

- Preserve the existing desktop look and feel unless the user explicitly approves broader UI change.
- If a frontend change is needed for a bug fix, keep the visual impact minimal.
- Prefer a polished macOS-native direction over generic cross-platform chrome.
