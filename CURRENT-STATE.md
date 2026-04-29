# ScribeFlow Current State

Last updated: 2026-04-29

## Product Position

ScribeFlow is a local-first Tauri desktop workbench for academic writing and research.

The current product surface is no longer a demo. It already has these main paths:

- workspace open / close / recent workspace lifecycle
- file tree browsing, file mutation, editor session restore
- Markdown, LaTeX, Python editing workflows
- Markdown preview, LaTeX compile / PDF preview, Python terminal output
- reference library, BibTeX / PDF import, citation formatting, Zotero sync
- settings for editor, environment, Zotero, updates and general preferences

## Current Architecture

- `src/app`: app shell orchestration and workspace lifecycle wiring
- `src/components`: Vue UI surfaces
- `src/composables`: UI composition helpers
- `src/domains`: frontend pure rules and state transition helpers
- `src/services`: side-effect and Tauri bridge layer
- `src/stores`: Pinia coordination state
- `src-tauri/src`: Rust runtime authority for filesystem, workflow, references, Python, LaTeX, preferences and workspace access

Current boundary rule: Vue UI layers should not import Tauri APIs directly. Tauri API and plugin usage belongs in `src/services`.

## Verification Contract

The standard local gate is:

```sh
npm run verify
```

It runs:

- `npm run guard:ui-bridges`
- `npm run build`
- `npm run check:rust`
- `npm run test:rust`

Current baseline on 2026-04-29:

- UI bridge boundary check passed
- Vite build passed
- Rust check passed
- Rust tests passed: 120 tests

Desktop main-path feel, visual quality, layout behavior and interaction quality are intentionally user-owned manual checks. Do not propose automating them again.

## Accepted Next Phases

### Phase 1: Verification and State Contract

Status: in progress.

Goal:

- keep one stable `npm run verify` entrypoint
- keep this file as the living product / architecture / debt map
- avoid reintroducing removed historical repo shells

Done:

- restored a single local verification contract through `npm run verify`
- recorded the current product and architecture state in this file
- wrote the user decision that desktop / visual / interaction automation is out of scope

### Phase 2: Research-to-Writing Loop

Status: next product phase.

Goal:

Turn the existing reference, PDF, citation, Markdown and LaTeX capabilities into one coherent academic writing loop:

- import from PDF / BibTeX / Zotero
- normalize metadata and keep local edits safe
- attach and read PDFs / extracted full text
- insert citations from Markdown and LaTeX
- write or update `.bib`
- compile LaTeX and inspect citation-related problems
- show where a reference is cited inside the workspace

Primary areas:

- `src/stores/references.js`
- `src/components/references/*`
- `src/components/editor/CitationPalette.vue`
- `src/services/references/*`
- `src-tauri/src/references_*`
- `src-tauri/src/latex_*`

### Phase 3: Leaf Rustification

Status: accepted direction, not started.

Goal:

Continue moving leaf capabilities to Rust without changing frontend-visible contracts.

Allowed first candidates:

- read-only parsing
- diagnostics
- autocomplete data sources
- preview target resolution
- file metadata / path status
- citation style scan

Frozen by default:

- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/PaneContainer.vue`
- `src/App.vue`
- `src/stores/documentWorkflow.js`

Do not migrate shared workflow, editor shell, session persistence and UI chrome in the same phase.

### Phase 4: Bundle Size and Chunk Hygiene

Status: accepted engineering debt.

Goal:

Reduce oversized frontend chunks without changing product behavior.

Known signal:

- `npm run build` passes but warns about chunks over 500 kB
- likely pressure points include PDF, CodeMirror language support, KaTeX and TextMate assets

Preferred approach:

- inspect build output first
- split heavy optional viewers and language assets only where the user path benefits
- do not add broad build complexity for cosmetic chunk reshuffling

## Explicit Non-Goals

- no automated desktop main-path smoke phase
- no automated visual review phase
- no automated layout / interaction QA phase
- no recommendation to replace user manual inspection for those areas

Bundle size work remains in scope because it is a quantifiable build and performance concern.
