# Architecture

This repository is organized around a desktop-first Tauri application with a Vue frontend and a Rust backend.

The architecture now targets one local-first academic workbench: project files, document workflows, references, readers, citations, and later plugin-style AI or translation extensions.

## High-level runtime shape

### Frontend boot

- `src/main.js` initializes locale, Vue, and Pinia, then mounts `App.vue`.
- `src/App.vue` composes the main shell, launcher, sidebars, workbench, settings surface, dialogs, and overlays.

### Desktop backend

- `src-tauri/src/lib.rs` is the main backend integration point for native behavior, workspace protocol serving, and registered backend modules.
- the Rust backend owns native seams such as filesystem access, platform commands, and desktop-specific protocol handling

## Layer responsibilities

### `src/app/*`

Shell lifecycle and app-level orchestration.
Examples:

- `src/app/shell/useAppShellEventBridge.js`
- `src/app/workspace/useWorkspaceLifecycle.js`

### `src/domains/*`

Product rules and reusable runtime decisions that should stay out of components.
Current domain families:

- document workflows
- editor routing and pane behavior
- file tree and file operations
- project references, citation policy, and reference-to-document decisions
- reader session behavior and writing-adjacent inspection flows
- workspace setup and starter flows
- git/workspace repo linking

### `src/services/*`

Effectful integrations such as files, compile flows, environment checks, repository operations, reference import or metadata adapters, preview bridges, and reader integration seams.
Examples:

- `src/services/documentWorkflow/*`
- `src/services/environmentPreflight.js`

### `src/stores/*`

Reactive state and coordination.
Important stores:

- `src/stores/workspace.js`
- `src/stores/editor.js`
- `src/stores/documentWorkflow.js`
- `src/stores/files.js`
- `src/stores/latex.js`

Future stores should follow the same thin-coordination rule when reference or reader features land, for example:

- project references state
- citation insertion session state
- reader session state

### `src/components/*`

UI rendering and user intent emission.
Representative surfaces:

- launcher: `src/components/Launcher.vue`
- workbench chrome: `src/components/layout/WorkbenchRail.vue`
- editor surface: `src/components/editor/EditorPane.vue`
- left sidebar: `src/components/sidebar/LeftSidebar.vue`
- right sidebar: `src/components/sidebar/RightSidebar.vue`
- settings surface: `src/components/settings/Settings.vue`

Future reference and reader UI should remain subordinate to the desktop workbench shell instead of introducing an unrelated app-within-an-app.

### `src/composables/*`

Reusable UI glue that should stay lighter than product-policy code.

### `src-tauri/*`

Native filesystem, process, protocol, and platform seams.
The backend module list in `src-tauri/src/lib.rs` currently includes file, LaTeX, workspace access, and security-related modules.

Future backend seams for references, citation tooling, or reader helpers should remain typed desktop integrations instead of ad hoc UI-owned process launching.

## Important architectural seams

### Shell and surface composition

`src/App.vue` currently chooses between:

- launcher when no workspace is open
- workspace workbench when a workspace is open
- settings surface when the primary surface changes to settings

The same shell also owns setup flow overlays and file or workspace confirmations.

### Sidebar model

- the left sidebar is normalized through `src/shared/workbenchSidebarPanels.js` and is currently file-tree focused
- the left sidebar should remain project-tree-first even when project references or reader entry points are introduced
- the right inspector is normalized through `src/shared/workbenchInspectorPanels.js` and currently only exposes `outline`
- future inspection panels are allowed only when they directly support drafting, citation, reading, or document understanding inside the same workbench

### Document workflow architecture

Document workflow behavior is split across:

- adapter definitions in `src/services/documentWorkflow/adapters/*`
- workflow policy in `src/services/documentWorkflow/policy.js`
- runtime orchestration in `src/domains/document/*`
- persisted workflow session state in `src/stores/documentWorkflow.js`

Citation behavior should attach to document workflow decisions rather than fork into a disconnected formatting subsystem.

### Project references architecture

Project references are a first-class planned slice, but they should follow the existing layering rules:

- reference library data and assets should live under the app-owned Altals data directory, not in the user workspace tree
- import, parse, metadata, and citation-format adapters belong in `src/services/*`
- selection rules, reference filtering, citation insertion policy, and bibliography decisions belong in `src/domains/*`
- UI surfaces for references and readers belong in `src/components/*`
- coordination state belongs in `src/stores/*`

The default model should be a local app-owned library that stays available across workspaces without polluting the user project tree.

### Reader architecture

Reader features should stay tightly connected to the writing workflow:

- PDF or source reading state should be recoverable from workspace state
- reader navigation should connect back to the active draft, citation targets, and outline context
- annotations or extracted metadata should prefer project-local persistence where practical
- a reader should not become a separate navigation universe that ignores the current project

### AI and translation extension architecture

AI-assisted research flows and PDF translation are valid future product areas, but they should be added through modular seams:

- keep the first-party core useful without any remote AI dependency
- place effectful model or translation clients in `services`
- keep user-facing automation policy in `domains`
- prefer plugin-capable boundaries over hard-coding every future workflow into the shell

### Workspace persistence

`src/stores/workspace.js` resolves a hashed workspace identity, separate workspace-owned metadata directories, and shell preference persistence. This is one of the main boundaries between user project files and app-owned metadata.

That boundary should carry workspace-local reader session state and other project-local metadata, while the shared reference library itself stays in the app-owned Altals directory.

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
- keep writing as the primary product loop even as references and readers are added
- keep project-scoped reference and reader data local-first
- make citations document-aware instead of format-agnostic shortcuts
- keep AI and translation capabilities modular and plugin-friendly
- do not let deleted legacy systems define new structure choices

## See also

- `docs/PRODUCT.md`
- `docs/DOMAINS.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOCUMENT_WORKFLOW.md`
