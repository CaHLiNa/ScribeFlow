# Operations

This doc tracks repository operations that keep the desktop app and its review workflow coherent.

## Local development operations

### Core commands

- install dependencies: `npm ci`
- run the frontend dev server: `npm run dev`
- run the desktop shell: `npm run tauri -- dev`
- build the frontend: `npm run build`
- build the Rust backend directly: `cargo build --manifest-path src-tauri/Cargo.toml`

### Typical local flow

1. install dependencies
2. open or rebuild the desktop shell with `npm run tauri -- dev`
3. make the smallest relevant code change
4. run targeted tests for the touched slice
5. run broader checks such as `npm run build` when the slice affects meaningful frontend or integration behavior

## Environment-dependent operations

Some operations depend on local tools being present.

- LaTeX compile readiness is checked through `ensureLatexCompileReady()` in `src/services/environmentPreflight.js`
- Typst compile readiness is checked through `ensureTypstCompileReady()` in `src/services/environmentPreflight.js`
- GitHub sync readiness checks for a local `git` executable through the same environment preflight service

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

Release automation lives in `.github/workflows/release.yml`.

Current release flow:

- validate the default branch before release tagging
- read the project version from the repo scripts
- verify version and tag state
- build and publish release artifacts for macOS, Linux, and Windows
- generate and upload a helper DMG for macOS builds

The release workflow also validates `VITE_GITHUB_AUTH_ORIGIN` for public release builds.

## Operational focus

- keep the desktop app as the source of truth
- keep agent and release workflows documented in the repo, not only in local habits
- prefer explicit automation over undocumented manual steps
- keep environment requirements visible when they block user-facing workflows

## See also

- `docs/TESTING.md`
- `docs/BUILD_SYSTEM.md`
- `docs/CONTRIBUTING.md`
