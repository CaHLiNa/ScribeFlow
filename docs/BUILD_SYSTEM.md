# Build System

The repository builds a Vue frontend and a Tauri desktop shell, with release automation through GitHub Actions.

## Public script entry points

The root `package.json` currently exposes these main build-related scripts:

- `npm run dev` — frontend dev server
- `npm run build` — frontend production build
- `npm run preview` — preview the built frontend
- `npm run tauri -- dev` — desktop development shell
- `npm run tauri -- build` — desktop production shell build
- `npm run build:macos:app` — macOS app bundle build
- `npm run build:macos:dmg` — macOS app build plus helper DMG generation
- `npm run version:check` and `npm run version:bump:*` — version management helpers

## Tooling entry points

- `package.json` defines the public scripts
- `scripts/frontendBaselineTooling.mjs` owns the lint/format baseline
- `scripts/run-tauri.mjs` is the main Tauri script entry
- `scripts/version-utils.mjs` and `scripts/bump-version.mjs` manage version checks and version bumps
- `scripts/build-macos-dmg.mjs` builds the helper DMG
- `.github/workflows/release-on-version-bump.yml` converts version bumps on the default branch into release tags and dispatches the release workflow explicitly
- `.github/workflows/release.yml` builds and publishes release artifacts from `v*` tags and also supports manual dispatch with a tag input

## Build layers

### Frontend

- Vite builds the frontend bundles used by the desktop app.
- CSS, Vue components, and shared frontend runtime files are validated through the baseline tooling script.

### Desktop shell

- Tauri packages the desktop shell around the frontend build output.
- the Rust backend under `src-tauri/` provides the native integration layer used by the desktop app.

### Release automation

GitHub Actions currently:

- detects version bumps pushed to the default branch
- skips release work when the version files did not change or the version has already been released
- creates and pushes the matching `v*` tag when the version advances
- dispatches the release workflow directly after the tag is pushed so bot-created tags still produce release builds
- creates or reuses the GitHub release record before the platform matrix starts so retries can resume cleanly
- publishes automatically when a `v*` tag is pushed
- installs platform dependencies
- builds artifacts for macOS, Linux, and Windows
- keeps the release in draft state until the matrix succeeds, then publishes it
- uploads the final release assets

## Current constraints and notes

- linting and formatting are intentionally restricted by repository baseline target lists instead of indiscriminately covering the entire tree
- release automation depends on a valid public `VITE_GITHUB_AUTH_ORIGIN`
- macOS helper DMG generation is handled by a dedicated script during release
- release builds are tag- and version-aware rather than purely branch-driven

## When to update this doc

Update this doc when you change:

- public build scripts in `package.json`
- baseline tooling ownership or scope
- release workflow steps or supported release platforms
- platform-specific packaging behavior

## See also

- `docs/OPERATIONS.md`
- `docs/TESTING.md`
- `docs/CONTRIBUTING.md`
