# Product

Altals is a local-first desktop academic research platform for project folders, with first-class Markdown and LaTeX support plus integrated literature management, reading, citation, and an embedded AI agent shell.

The product is not just writing-first. Document writing, literature management, reading, and AI workflows are peer parts of one focused academic workbench, without turning Altals into a generic knowledge manager or detached chat shell.

## Core user loop

The target product loop is one practical desktop research workbench:

1. open a local project folder from the launcher
2. browse project files, references, and project context without leaving the app
3. manage app-owned references from the same workspace
4. read PDFs or other source material alongside the draft
5. write Markdown and LaTeX documents in the editor workbench
6. use grounded AI workflows based on the active draft, selected references, reader context, and project state
7. insert citations and maintain bibliography output from the same workspace
8. preview or compile supported document formats without leaving the workspace surface
9. inspect document structure, citation context, reader context, or AI-derived writing context in the right-side inspection area
10. use save flows and repository workflows as safety boundaries while researching and writing

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
- a grounded AI shell in the right sidebar plus multi-provider settings, grouped skill management in Settings, `/` and `$skill` invocation entry points, and custom relay support
- repository-linked writing workflows
- a real references slice inside the workspace shell

### Current expansion target

The next product expansion is not a separate surface. It is a deepening of the same desktop workbench:

- app-owned references library stored in the Altals data directory, not in the user workspace tree
- in-app PDF and research reading flows that stay close to the draft and reference set
- direct citation insertion for Markdown and LaTeX
- bibliography generation that respects the active document workflow
- grounded AI actions woven through writing, reading, references, and revision
- project-local context preparation plus optional plugin-capable model integrations

The workbench can already open supporting files such as standalone PDFs, `.txt`, `.bib`, and common LaTeX sidecar text files. The next step is to turn that support into a coherent academic research loop rather than treat those files as second-class attachments.

## Core surfaces

### Current surfaces

- **Launcher** for opening a local workspace
- **Workspace surface** for file tree, references, reader-adjacent panels, editor panes, preview or compile actions, and grounded AI workflow entry points
- **Settings surface** for theme, editor, environment, multi-provider AI routing, skill management, and update preferences
- **Dialogs and overlays** for setup and focused file or workspace actions

### Planned workbench additions

- **Project references flow** inside the workspace surface, not as a disconnected second app
- **Reader flow** for PDFs and other project-linked research material
- **AI workflow entry points** attached to editor, reference, reader, and revision context
- **Filesystem skills** discovered only from Altals-managed workspace and user directories, so the agent shell stays grounded in project-owned skills

AI workflows should be first-class inside this workbench and still plug into it rather than replace it.

## Supported writing formats

Current first-class writing formats remain:

- **Markdown** with a built-in preview mode
- **LaTeX** with compile status, diagnostics, and PDF preview

Citations and bibliography behavior should adapt to each format instead of forcing one fake cross-format syntax over the top.

## Product boundaries

- The Tauri desktop app is the primary product surface.
- The `web/` directory exists, but it does not define the main product direction for the current app.
- The core experience is one desktop academic research workbench, not a bundle of loosely related utilities.
- The left sidebar remains project-tree-first, even when project references, reader entry points, or AI actions are introduced.
- The right-side inspection area is currently outline-only in the shipped build, but it may grow into other writing-adjacent inspection panels when they directly support drafting, citation, reading, or grounded AI work.
- References, reading, writing, citation, and AI context should stay local-first by default.
- Reference library storage should live in an app-owned Altals directory rather than inside the user workspace tree.
- AI workflows are first-class, but they should land as a grounded workbench agent shell with skills and tools rather than a detached chat shell.
- PDF translation is a valid adjacent capability, but it should not distort the core local research loop.
- New surfaces, sync systems, or speculative platform expansion should not be introduced casually.

## State and persistence expectations

- workspace identity and workspace-owned metadata are managed through `src/stores/workspace.js`
- editor panes, tabs, and dirty state live in `src/stores/editor.js`
- document workflow session state and preview preferences live in `src/stores/documentWorkflow.js`
- AI session state, context selection, and generated artifacts live in `src/stores/ai.js`
- references state and citation formatting preferences live in `src/stores/references.js`
- future reader state, citation caches, and AI working context may remain workspace-scoped, but the shared reference library itself should live in an app-owned local directory rather than a mandatory global cloud account

## Non-goals for the current direction

- turning Altals into a general note-taking or personal knowledge management product
- building a cloud-first or account-first library product that weakens the desktop workspace model
- shipping AI chat surfaces that are disconnected from the active draft, reference set, or reader context
- letting repository, sync, or release workflows overshadow the academic research workbench itself
- reviving deleted legacy feature claims just because they existed in old docs

## See also

- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOCUMENT_WORKFLOW.md`
- `docs/TESTING.md`
