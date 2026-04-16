# Academic Platform Direction

This document defines the near-term product direction for Altals as a local-first academic research platform where writing, literature management, reading, and AI workflows are peer capabilities inside one desktop workbench.

It is intentionally phased. The goal is not to clone every research tool at once. The goal is to keep the user inside one coherent loop while they manage references, read, write, invoke grounded AI help, cite, and revise.

## Product thesis

Academic users do not experience writing, reading, references, citation, and AI assistance as separate products.

They are doing one job:

1. collect or open source material
2. organize references and project context
3. read and extract what matters
4. write the draft
5. invoke AI with grounded project, document, and reference context
6. insert citations at the point of writing
7. generate or maintain bibliography output
8. revise safely

Altals should serve that full loop inside one local-first desktop app.

## Guardrails

- writing, literature management, reading, and AI workflows are peer product loops inside one research workbench
- project folders remain the primary organizing model
- references are project-scoped first, not mandatory global-library-first
- PDF and source reading stay close to the active draft and active reference context
- AI workflows should be grounded in the active project, draft, selected references, and reader context
- AI should appear as an embedded agent shell with tools and filesystem-native skills, not a detached chat shell
- PDF translation is a valid AI-adjacent extension, but it should not distort the first release of the references and reader foundation
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

## Cross-cutting Track: Grounded AI Workflows

Goal: make AI genuinely useful across writing, literature management, and reading without breaking local-first boundaries.

Scope:

- context assembly from the active file, selected references, outline, diagnostics, and reader selections
- citation-grounded drafting, revision, summarization, and planning flows
- document-aware translation or explanation helpers that remain tied to the current project
- optional local or remote model runners behind plugin-capable seams
- automation hooks that help the user move across reading, writing, and citation tasks without rebuilding context each time

Success criteria:

- AI helps inside the same workspace instead of requiring a separate chat-first workflow
- AI outputs can stay anchored to local project material and selected references
- the core app remains useful without AI
- AI capabilities can evolve independently without becoming the primary navigation model

## Suggested module shape

The expected implementation direction is:

- `src/domains/references/*` for reference policy, citation insertion rules, and bibliography decisions
- `src/domains/reader/*` for reader session and source-to-draft navigation policy
- `src/domains/ai/*` for grounded prompt policy, context selection, artifact normalization, and AI workflow guardrails
- `src/services/references/*` for import, parse, metadata, and formatting adapters
- `src/services/reader/*` or equivalent PDF helpers for source integration seams
- future `src/services/ai/*` for model adapters, retrieval, translation, and indexing clients
- `src/stores/references.js` and related thin stores for state coordination
- future reader and AI stores for session state, not long-lived policy
- `src/components/references/*`, `src/components/reader/*`, and future AI workbench surfaces for UI
- `src-tauri/*` for typed desktop seams where filesystem, PDF helpers, model runners, or external tooling are required

Keep policy in `domains`. Keep effectful parsing, IO, model invocation, and tool execution in `services`.

## Immediate next implementation slice

If work starts now, the smallest meaningful slice is:

1. define the project references data model
2. persist references in workspace-owned metadata
3. add a basic references list and selection flow
4. implement citation insertion for one path in each of Markdown and LaTeX
5. allow a project PDF to open in a workbench-adjacent reader
6. expose one grounded AI workflow that can use the active draft plus selected references

That foundation slice is now implemented in the workbench as an AI shell with provider settings, grounded context assembly, skill execution, filesystem skill discovery, and first-pass artifact application.

That slice is narrow enough to ship and broad enough to prove the product direction.

## See also

- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAINS.md`
- `AGENTS.md`
