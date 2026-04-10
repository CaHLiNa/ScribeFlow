# Product

Altals is a local-first desktop writing workspace for project folders with first-class Markdown, LaTeX, and Typst support.

## Primary user flow

The product is built around one practical workbench:

1. open a local project folder from the launcher
2. browse and manage files in the left sidebar
3. open documents into the editor workbench
4. preview or compile supported document formats without leaving the workspace surface
5. inspect the current document outline in the right sidebar
6. use save points, local history, and repository workflows as safety boundaries while writing

Representative entry points:

- launcher and recent workspaces: `src/components/Launcher.vue`
- shell composition: `src/App.vue`
- left sidebar file tree: `src/components/sidebar/LeftSidebar.vue`
- right sidebar outline: `src/components/sidebar/RightSidebar.vue`
- top workbench controls: `src/components/layout/WorkbenchRail.vue`

## Current scope

### Core surfaces

- **Launcher** for opening a local workspace or cloning a repository into a local workspace
- **Workspace surface** for file tree, editor panes, preview/compile actions, and outline inspection
- **Settings surface** for theme, editor, environment, and update preferences
- **Dialogs and overlays** for setup, unsaved changes, version history, and workspace snapshot browsing

### Core capabilities

- open a local workspace folder and restore recent workspaces
- edit document files in the main workbench
- support workflow-aware behavior for Markdown, LaTeX, and Typst
- manage workspace preferences and persisted shell state
- keep local history, snapshots, and repository-linked writing workflows available inside the desktop app
- produce release-ready desktop builds through the repository release pipeline

### Current supported writing formats

- **Markdown** with a single built-in preview mode
- **LaTeX** with compile status, diagnostics, and PDF preview
- **Typst** with native preview when available plus PDF preview

The product copy in `src/components/Launcher.vue:11` and `src/components/SetupWizard.vue:13` already reflects this trimmed scope.

## Product boundaries

- The Tauri desktop app is the primary product surface.
- The `web/` directory exists, but it does not define the main product direction for the current app.
- The current core experience is writing, previewing, compiling, and navigating project documents.
- The left sidebar is file-tree focused.
- The right sidebar is outline-only in the current build, as reflected by `src/shared/workbenchInspectorPanels.js`.
- New product surfaces or speculative workflow systems should not be introduced casually.

## State and persistence expectations

- workspace identity and workspace-owned metadata are managed through `src/stores/workspace.js`
- editor panes, tabs, and dirty state live in `src/stores/editor.js`
- document workflow session state and preview preferences live in `src/stores/documentWorkflow.js`
- local history and save-point behavior are integrated into the writing flow rather than treated as a separate product

## Non-goals for the current slice

- reviving deleted legacy feature claims just because they existed in old docs
- expanding the inspector into multiple panels without a product decision
- letting release, sync, or repository features overshadow the writing workbench itself

## See also

- `docs/ARCHITECTURE.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/GIT_AND_SNAPSHOTS.md`
- `docs/TESTING.md`
