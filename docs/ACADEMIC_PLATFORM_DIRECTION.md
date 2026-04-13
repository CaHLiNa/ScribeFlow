# Academic Platform Direction

This document defines the near-term product direction for turning Altals from a writing-only desktop workbench into a broader academic research platform.

It is intentionally phased. The goal is not to clone every research tool at once. The goal is to keep the user inside one coherent loop while they manage references, read, write, cite, and revise.

## Product thesis

Academic users do not experience writing, reading, references, and citation as separate products.

They are doing one job:

1. collect or open source material
2. read and extract what matters
3. write the draft
4. insert citations at the point of writing
5. generate or maintain bibliography output
6. revise safely

Altals should serve that full loop inside one local-first desktop app.

## Guardrails

- writing, literature management, and reading are peer product loops inside one research workbench
- project folders remain the primary organizing model
- references are project-scoped first, not mandatory global-library-first
- PDF and source reading stay close to the active draft and active reference context
- AI workflows should be grounded in the active project, draft, and selected references
- PDF translation is a valid extension, but it should not distort the first release of the references and reader foundation
- avoid turning Altals into a generic PKM, chat shell, or feed reader

## Delivery phases

## Phase 1: Project References Foundation

Goal: make references a real project asset instead of a loose set of imported files.

Scope:

- project-scoped references data model
- import from `BibTeX`, `CSL-JSON`, `RIS`, and direct PDF attachment
- local reference records stored in workspace-owned metadata
- basic reference list, search, and selection
- document-aware citation insertion entry point
- references-first entry points that are not subordinate to editor-only flows

Success criteria:

- a user can open a project and see its references without leaving Altals
- references survive app restarts and remain bound to the workspace
- Markdown and LaTeX each get a correct citation insertion path

## Phase 2: In-App Reading Loop

Goal: stop forcing the user to leave the workbench to read source material.

Scope:

- open project-linked PDFs in an in-app reader
- keep reader navigation recoverable from workspace state
- support search, page navigation, and draft-adjacent reading workflows
- connect reader selection back to the active draft or citation flow
- allow reading to be a primary workflow, not only a side panel of writing

Success criteria:

- a user can read and write side by side in the same workspace
- the reader feels like part of the project workbench, not a separate mini-app
- switching between draft and source does not lose context

## Phase 3: Bibliography and Metadata Reliability

Goal: make citation output dependable enough for serious writing.

Scope:

- bibliography generation per document workflow
- reference validation and duplicate handling
- metadata editing and normalization
- better import diagnostics and recovery flows

Success criteria:

- references can move from imported to production-usable without external cleanup
- bibliography output is predictable and testable
- citation quality improves without making the workflow feel like database administration

## Phase 4: Plugin-Ready Research Extensions

Goal: add high-value research automation without baking every future feature into core.

Scope:

- plugin-capable seams for AI research workflows
- plugin-capable seams for PDF translation
- project-grounded prompts and retrieval, not generic chat surfaces
- optional remote services that do not block the core offline workflow

Success criteria:

- the core app remains useful without AI
- AI and translation features can evolve independently
- the workbench stays legible instead of collapsing into tool sprawl

## Suggested module shape

The expected implementation direction is:

- `src/domains/references/*` for reference policy, citation insertion rules, and bibliography decisions
- `src/domains/reader/*` for reader session and source-to-draft navigation policy
- `src/services/references/*` for import, parse, metadata, and formatting adapters
- `src/services/reader/*` for PDF or source integration seams
- `src/stores/references.js` and related thin stores for state coordination
- `src/components/references/*` and `src/components/reader/*` for UI
- `src-tauri/*` for typed desktop seams where filesystem, PDF helpers, or external tooling are required

Keep policy in `domains`. Keep effectful parsing, IO, and tool invocation in `services`.

## Immediate next implementation slice

If work starts now, the smallest meaningful slice is:

1. define the project references data model
2. persist references in workspace-owned metadata
3. add a basic references list and selection flow
4. implement citation insertion for one path in each of Markdown and LaTeX
5. allow a project PDF to open in a workbench-adjacent reader

That slice is narrow enough to ship and broad enough to prove the product direction.

## See also

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `AGENTS.md`
