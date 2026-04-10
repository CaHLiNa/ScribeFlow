# Architecture

This repository is organized around a desktop-first Tauri application with a Vue frontend and a Rust backend.

## High-level runtime shape

### Frontend boot

- `src/main.js` initializes locale, telemetry, Vue, and Pinia, then mounts `App.vue`.
- `src/App.vue` composes the main shell, launcher, sidebars, workbench, settings surface, dialogs, and overlays.

### Desktop backend

- `src-tauri/src/lib.rs` is the main backend integration point for native behavior, workspace protocol serving, keychain access, and registered backend modules.
- the Rust backend owns native seams such as filesystem access, platform commands, and desktop-specific protocol handling

## Layer responsibilities

### `src/app/*`

Shell lifecycle and app-level orchestration.
Examples:

- `src/app/shell/useAppShellEventBridge.js`
- `src/app/workspace/useWorkspaceLifecycle.js`
- `src/app/changes/useWorkspaceSnapshotActions.js`

### `src/domains/*`

Product rules and reusable runtime decisions that should stay out of components.
Current domain families:

- document workflows
- editor routing and pane behavior
- file tree and file operations
- workspace history and snapshots
- workspace bootstrap and automation
- git/workspace repo linking

### `src/services/*`

Effectful integrations such as files, compile flows, environment checks, repository operations, and preview bridges.
Examples:

- `src/services/documentWorkflow/*`
- `src/services/environmentPreflight.js`
- `src/services/workspaceHistoryRepo.js`

### `src/stores/*`

Reactive state and coordination.
Important stores:

- `src/stores/workspace.js`
- `src/stores/editor.js`
- `src/stores/documentWorkflow.js`
- `src/stores/files.js`
- `src/stores/latex.js`
- `src/stores/typst.js`

### `src/components/*`

UI rendering and user intent emission.
Representative surfaces:

- launcher: `src/components/Launcher.vue`
- workbench chrome: `src/components/layout/WorkbenchRail.vue`
- editor surface: `src/components/editor/EditorPane.vue`
- left sidebar: `src/components/sidebar/LeftSidebar.vue`
- right sidebar: `src/components/sidebar/RightSidebar.vue`
- settings surface: `src/components/settings/Settings.vue`

### `src/composables/*`

Reusable UI glue that should stay lighter than product-policy code.

### `src-tauri/*`

Native filesystem, process, protocol, and platform seams.
The backend module list in `src-tauri/src/lib.rs` currently includes file, git, GitHub auth loopback, LaTeX, Typst, workspace access, and security-related modules.

## Important architectural seams

### Shell and surface composition

`src/App.vue` currently chooses between:

- launcher when no workspace is open
- workspace workbench when a workspace is open
- settings surface when the primary surface changes to settings

The same shell also owns dialogs for setup, unsaved changes, snapshots, and version history.

### Sidebar model

- the left sidebar is normalized through `src/shared/workbenchSidebarPanels.js` and is currently file-tree focused
- the right inspector is normalized through `src/shared/workbenchInspectorPanels.js` and currently only exposes `outline`

### Document workflow architecture

Document workflow behavior is split across:

- adapter definitions in `src/services/documentWorkflow/adapters/*`
- workflow policy in `src/services/documentWorkflow/policy.js`
- runtime orchestration in `src/domains/document/*`
- persisted workflow session state in `src/stores/documentWorkflow.js`

### Workspace persistence

`src/stores/workspace.js` resolves a hashed workspace identity, separate workspace-owned metadata directories, and shell preference persistence. This is one of the main boundaries between user project files and app-owned metadata.

### History and snapshot architecture

Workspace history and save points are modeled in `src/domains/changes/*`, where git-backed history and local snapshot metadata are merged into stable UI-facing records.

### Release and repo automation

Repository automation is split between:

- `scripts/frontendBaselineTooling.mjs`
- `scripts/agentReviewWorkflow.mjs`
- `.github/workflows/release.yml`

## Architectural direction

- keep policy in `domains` where possible
- keep `services` effectful and policy-light
- keep stores thinner over time instead of turning them into another policy layer
- keep the desktop app as the primary architecture driver
- do not let deleted legacy systems define new structure choices

## See also

- `docs/PRODUCT.md`
- `docs/DOMAINS.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/GIT_AND_SNAPSHOTS.md`
