# Product

Altals is a local-first desktop academic writing platform for project folders, with first-class Markdown and LaTeX support plus an integrated project-level references and reading workflow.

The product is still writing-first. References, readers, citations, and later AI-assisted research tasks exist to keep the user inside one focused academic workbench, not to turn Altals into a generic knowledge manager.

## Core user loop

The target product loop is one practical desktop workbench:

1. open a local project folder from the launcher
2. browse project files and project-scoped references without leaving the app
3. read PDFs or other source material alongside the draft
4. write Markdown and LaTeX documents in the editor workbench
5. insert citations and maintain bibliography output from the same workspace
6. preview or compile supported document formats without leaving the workspace surface
7. inspect document structure, citation context, or reader structure in the right-side inspection area
8. use save flows and repository workflows as safety boundaries while writing

Representative current entry points:

- launcher and recent workspaces: `src/components/Launcher.vue`
- shell composition: `src/App.vue`
- left sidebar shell: `src/components/sidebar/LeftSidebar.vue`
- right sidebar shell: `src/components/sidebar/RightSidebar.vue`
- top workbench controls: `src/components/layout/WorkbenchRail.vue`

## Product direction

### Current shipped build

The current shipped build remains centered on:

- opening a local workspace folder and restoring recent workspaces
- editing project documents in the main workbench
- workflow-aware behavior for Markdown and LaTeX
- previewing or compiling supported writing formats
- outline inspection in the current right sidebar
- repository-linked writing workflows

### Current expansion target

The next product expansion is not a separate surface. It is an extension of the same desktop workbench:

- project-scoped references library stored alongside workspace-owned metadata
- in-app PDF and research reading flows that stay close to the draft
- direct citation insertion for Markdown and LaTeX
- bibliography generation that respects the active document workflow
- reference metadata, import, and reading context that remain local-first

The workbench can already open supporting files such as standalone PDFs, `.txt`, `.bib`, and common LaTeX sidecar text files. The next step is to turn that support into a coherent academic writing loop rather than treat those files as second-class attachments.

## Core surfaces

### Current surfaces

- **Launcher** for opening a local workspace
- **Workspace surface** for file tree, editor panes, preview or compile actions, and current inspection flows
- **Settings surface** for theme, editor, environment, and update preferences
- **Dialogs and overlays** for setup and focused file or workspace actions

### Planned workbench additions

- **Project references flow** inside the workspace surface, not as a disconnected second app
- **Reader flow** for PDFs and other project-linked research material
- **Citation insertion flow** attached to the editor and active document workflow

Future AI and translation features should plug into this workbench rather than replace it.

## Supported writing formats

Current first-class writing formats remain:

- **Markdown** with a built-in preview mode
- **LaTeX** with compile status, diagnostics, and PDF preview
  Citations and bibliography behavior should adapt to each format instead of forcing one fake cross-format syntax over the top.

## Product boundaries

- The Tauri desktop app is the primary product surface.
- The `web/` directory exists, but it does not define the main product direction for the current app.
- The core experience is one desktop academic workbench, not a bundle of loosely related utilities.
- The left sidebar remains project-tree-first, even when project references or reader entry points are introduced.
- The right-side inspection area is currently outline-only in the shipped build, but it may grow into other writing-adjacent inspection panels when they directly support drafting, citation, or reading tasks.
- References, reading, and citation features should stay project-scoped and local-first by default.
- AI workflows and PDF translation are valid future capabilities, but they should land through modular seams or plugins instead of bloating the first-party core.
- New surfaces, sync systems, or speculative platform expansion should not be introduced casually.

## State and persistence expectations

- workspace identity and workspace-owned metadata are managed through `src/stores/workspace.js`
- editor panes, tabs, and dirty state live in `src/stores/editor.js`
- document workflow session state and preview preferences live in `src/stores/documentWorkflow.js`
- future references, reader state, and citation caches should remain scoped to the current workspace or its owned metadata directory rather than a mandatory global cloud account

## Non-goals for the current direction

- turning Altals into a general note-taking or personal knowledge management product
- building a global library-first product that weakens the project workspace model
- shipping AI chat surfaces that are disconnected from the active draft or reference set
- letting repository, sync, or release workflows overshadow the academic writing workbench itself
- reviving deleted legacy feature claims just because they existed in old docs

## See also

- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/TESTING.md`
