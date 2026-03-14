# Building & Releasing

This document covers the current Altals desktop build and release flow.

## Prerequisites

- Node.js 22
- Rust toolchain
- Tauri prerequisites for your platform
- Bun is optional if you use the existing Tauri scripts, but the main documented flow uses `npm`

## Local Development

Install dependencies:

```bash
npm install
```

Desktop app:

```bash
npm run build
npm run tauri dev
```

GitHub OAuth bridge in `web/`:

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

The desktop app expects `VITE_GITHUB_AUTH_ORIGIN` to point at the public bridge origin used for GitHub sign-in.

## Local Builds

Common commands:

```bash
npx tauri build
npx tauri build --bundles app
npx tauri build --bundles dmg
npm run build:macos:dmg
```

Build outputs land under `src-tauri/target/.../bundle/`.

For unsigned macOS local builds, `npm run build:macos:dmg` is the preferred path because it creates the DMG and includes the helper script used for local distribution.

## Tectonic

Tectonic is not bundled into the app.

- users can install it from Settings → System
- local development can also use a system install such as `brew install tectonic`
- the app checks the managed install location first, then common system paths

See [tex-system.md](tex-system.md) for the current compiler discovery order and LaTeX engine behavior.

## Release Workflow

Current GitHub Actions release workflow:

- [`.github/workflows/release.yml`](/Users/math173sr/Documents/GitHub项目/Altals/.github/workflows/release.yml)

This workflow currently:

1. bumps the project version from the default branch
2. commits and tags the release
3. builds release artifacts for macOS ARM, Linux, and Windows
4. publishes the GitHub Release

There is no current `build.yml` workflow in this repository.

## Release Requirements

The release workflow expects `VITE_GITHUB_AUTH_ORIGIN` to be configured as a GitHub Actions variable for public release builds.

It must:

- be present
- use `https://`
- not point to localhost

This is enforced in [`.github/workflows/release.yml`](/Users/math173sr/Documents/GitHub项目/Altals/.github/workflows/release.yml).

## macOS Notes

Local verification examples:

```bash
codesign -dv src-tauri/target/release/bundle/macos/Altals.app
spctl -a -vv src-tauri/target/release/bundle/macos/Altals.app
```

If you create archives manually, use `Altals.app` rather than the historical `Shoulders.app` name.

## What This Doc No Longer Covers

The following historical topics are intentionally not treated as part of the current Altals build surface:

- historical Shoulders docs-site search indexing
- historical hosted web backend deployment
- historical web auto-update proxy documentation tied to `shoulde.rs`

If you need that material for archaeology, check [legacy/README.md](legacy/README.md).
