# Rust Parity Target

Altals is confirmed as a desktop-first, local-first document workspace. The Rust parity effort is not a vehicle for reintroducing retired surfaces or rewriting the entire repository; it is the methodical migration of the existing document shell to Rust where it makes sense.

## Goal

Keep the current desktop document-workspace experience intact while progressively moving policy, runtime, and effectful workflows into Rust-owned seams. Visually, the shell stays the same; behaviorally, the workspace, file tree, editor, preview, snapshot, and build loops continue working.

## In Scope

- Desktop shell behavior (left sidebar, center workbench, right inspector)
- Workspace lifecycle (open/close workspace, tree hydration, preferences)
- Document workflow runtime (editor state, preview/build state, diagnostics, citation support)
- Build, preview, snapshot, and git-support workflows currently orchestrated through Vue stores
- Existing Tauri command surface plus any Rust-owned adapters needed to satisfy parity tests

## Out of Scope

- Rebuilding the separate `web/` project as part of this migration
- Mechanical, literal translation of every Vue/SFC file into Rust code
- Reintroducing removed product surfaces or expanding scope beyond the document loop

## Parity Standard

Each migrated slice must preserve:

- The visible user behavior of the desktop workspace (open file, preview, build, etc.)
- Explicit safety boundaries around autosave, save points, Git sync, and workspace snapshots
- Observable runtime contracts such as workspace tree hydration, editor state restoration, diagnostics propagation, and snapshot visibility

## Allowed Implementation Changes

- Replace Vue widget glue with Rust-driven commands and typed event bridges where needed
- Move workflow decision logic into Rust domains before adding new Vue coordination
- Keep a thin Vue adapter layer until the Rust backend can fully own the contracts

## UI Strategy Decision

Rust migration must pick one of the following before touching UI code:

1. Rust-owned backend with the existing Vue shell as the surface layer
2. Rust-owned backend with a progressively thinner Vue shell (Vue as adapter only)
3. Full Rust-native desktop UI replacement (requires separate design/QA tracker)

Until option 3 is explicitly approved, work assumes the existing Vue shell stays and adopts Rust-owned contracts under the hood.

## Non-Goals

- Do not attempt a single-commit rewrite of the entire repository into Rust.
- Do not fold the `web/` subtree into this desktop parity effort.
- Do not relax autosave/save point/git safety boundaries simply to make migration easier.
