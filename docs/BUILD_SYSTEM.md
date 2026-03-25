# Build System

Altals uses Vite for the frontend build and Tauri for the desktop application shell.

## Frontend Build

- `npm run dev`: starts the Vite development server
- `npm run build`: produces the frontend production build under `dist/`
- `npm run preview`: serves the built frontend locally through Vite

## Desktop Packaging

- `npm run tauri`: forwards to the Tauri CLI
- `npm run build:macos:app`: builds a macOS app bundle without signing
- `npm run build:macos:dmg`: builds the app bundle and then packages a DMG

## Backend Build Context

- `src-tauri/` contains the Rust crate, Tauri configuration, and native build assets.
- Native outputs are produced under `src-tauri/target/` during Tauri builds.

## Current Build Characteristics

- The frontend bundle includes large editor- and PDF-related chunks.
- Vite currently reports some large-chunk warnings, but the production build completes successfully.
- The desktop app depends on both the Vite asset build and the Tauri native build pipeline.
