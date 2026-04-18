# Operations

This doc tracks repository operations that keep the desktop app and its review workflow coherent.

## Local development operations

### Core commands

- install dependencies: `npm ci`
- run the frontend dev server: `npm run dev`
- run the desktop shell: `npm run tauri -- dev`
- build the frontend: `npm run build`
- build the Rust backend directly: `cargo build --manifest-path src-tauri/Cargo.toml`
- build the experimental native editor helper: `cargo build --manifest-path src-tauri/Cargo.toml -p altals-native-editor-app`
- run the experimental native editor helper protocol directly: `src-tauri/target/debug/altals-native-editor-app`
- query the current helper-backed native editor session snapshot from Tauri: call `native_editor_session_state`
- query a specific helper-backed document snapshot from Tauri: call `native_editor_document_state`

### Typical local flow

1. install dependencies
2. open or rebuild the desktop shell with `npm run tauri -- dev`
3. make the smallest relevant code change
4. run targeted tests for the touched slice
5. run broader checks such as `npm run build` when the slice affects meaningful frontend or integration behavior

For the native editor migration, prefer backend-only progress slices:

- move buffer, selection, viewport, and transaction mechanics into `altals-editor-core`
- move helper session state ownership into `src-tauri/src/native_editor_runtime.rs`
- move save-time document materialization toward `native_editor_document_state` instead of frontend-only file content caches
- avoid reintroducing user-visible experimental settings or placeholder editor panes while the replacement is still backend-first

## Environment-dependent operations

Some operations depend on local tools being present.

- LaTeX compile readiness is checked through `ensureLatexCompileReady()` in `src/services/environmentPreflight.js`

When these tools are missing, the app surfaces settings-oriented recovery actions instead of failing silently.

## AI review workflow

The repo has explicit AI review commands implemented in `scripts/agentReviewWorkflow.mjs`.

### Commands

- enable the Codex review gate: `npm run agent:enable-codex-gate`
- run a Codex review: `npm run agent:codex-review`
- run the Claude plan audit: `npm run agent:claude-plan-audit -- --plan <path>`

### Current intent

- keep the Codex stop-time review gate enabled for Claude-authored code work
- use Codex review before sign-off on code changes
- use the Claude postflight audit to compare implementation against an explicit plan when that workflow is in play

## Release operations

Release automation lives in:

- `.github/workflows/release-on-version-bump.yml`
- `.github/workflows/release.yml`

Current release flow:

- pushing a version bump commit to the default branch can auto-create the matching `v*` tag
- the version bump workflow explicitly dispatches the release workflow after pushing the tag, so release builds do not depend on GitHub re-triggering workflows from bot-created tag pushes
- no release is triggered when the version files did not change, when the version matches the latest tag, or when the tag already exists
- pushing a `v*` tag builds and publishes the actual release artifacts
- `Altals Release` also supports manual `workflow_dispatch` runs with a tag input as a fallback when a specific tag needs to be rebuilt
- build and publish release artifacts for macOS, Linux, and Windows
- the Windows release job currently builds the NSIS installer path instead of the full default bundle set on hosted runners
- generate and upload a helper DMG for macOS builds

## Operational focus

- keep the desktop app as the source of truth
- keep agent and release workflows documented in the repo, not only in local habits
- prefer explicit automation over undocumented manual steps
- keep environment requirements visible when they block user-facing workflows

## See also

- `docs/BUILD_SYSTEM.md`
- `docs/CONTRIBUTING.md`
