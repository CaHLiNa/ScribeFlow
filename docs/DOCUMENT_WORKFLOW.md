# Document Workflow

Altals treats document workflows as explicit runtime capabilities instead of one-off editor behavior.

## Supported workflow sources

The workflow layer currently recognizes three source kinds through `src/services/documentWorkflow/adapters/index.js`:

- **Markdown**
- **LaTeX**
- **Typst**

Workflow kind resolution and preview preference decisions are driven by:

- `src/services/documentWorkflow/policy.js`
- `src/services/documentWorkflow/adapters/index.js`
- `src/stores/documentWorkflow.js`

## Main responsibilities

The workflow system is responsible for:

- resolving the correct adapter for the active file
- choosing the preferred preview kind for that document kind
- exposing compile status, diagnostics, and artifact paths
- coordinating workspace preview visibility and user intent
- keeping editor, toolbar, and preview behavior aligned inside the workbench

Representative runtime files:

- `src/stores/documentWorkflow.js`
- `src/domains/document/documentWorkflowRuntime.js`
- `src/domains/document/documentWorkflowAdaptersRuntime.js`
- `src/domains/document/documentWorkflowBuildRuntime.js`
- `src/domains/document/documentWorkspacePreviewRuntime.js`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/DocumentWorkflowBar.vue`

## Capability matrix

### Markdown

- matched by `src/services/documentWorkflow/adapters/markdown.js`
- preview kind: `html`
- compile adapter: none
- preview path shape: `preview:<sourcePath>`
- primary behavior: render/toggle preview inside the workspace surface

Markdown workflow state includes draft problems plus preview problems. The UI state is built in `buildMarkdownWorkflowUiState()`.

### LaTeX

- matched by `src/services/documentWorkflow/adapters/latex.js`
- compile adapter: present
- artifact path comes from the compile adapter
- toolbar behavior centers on **Compile** plus **Open PDF** when an artifact exists
- supported preview kind: `pdf`
- LaTeX preview is PDF-only

LaTeX readiness is gated by `ensureLatexCompileReady()` in `src/services/environmentPreflight.js`.

### Typst

- matched by `src/services/documentWorkflow/adapters/typst.js`
- compile adapter: present
- default preview kind: `native`
- supported preview kinds: `native`, `pdf`
- native preview is used when Tinymist-backed preview is available
- PDF artifact behavior is still available when explicitly requested and compiled

Typst readiness is gated by `ensureTypstCompileReady()` in `src/services/environmentPreflight.js`.

## Workspace preview rules

The workspace preview runtime in `src/domains/document/documentWorkspacePreviewRuntime.js` currently enforces these high-level rules:

- Markdown uses a single built-in workspace preview mode.
- LaTeX preview is PDF-only.
- Typst prefers native preview when available.
- Typst can also switch to PDF preview when explicitly requested and an artifact exists.
- Hidden-by-user preview state is preserved explicitly rather than inferred indirectly.

Preview state includes:

- whether the workspace surface should be used
- whether preview is visible
- preview kind and preview mode
- target resolution status
- reason codes such as `workspace-markdown`, `workspace-typst-native`, `workspace-latex-pdf`, and `artifact-ready-external`

## Toolbar behavior

`src/components/editor/DocumentWorkflowBar.vue` exposes workflow-aware controls:

- primary compile action for LaTeX and Typst
- preview toggle for Markdown and native Typst preview
- PDF action when a PDF artifact can be opened
- status and phase display for render/compile state

This toolbar is rendered both in integrated shell contexts and inline editor header contexts.

## Diagnostics and artifact flow

- Markdown surfaces draft and preview problems.
- LaTeX surfaces compile errors, warnings, lint problems, and project-level problems.
- Typst surfaces compile diagnostics and preview capability state.
- artifact paths for LaTeX and Typst are resolved through compile adapters, not guessed in components.

## Validation anchors

Key tests for this area include:

- `tests/documentWorkflowAdapterContracts.test.mjs`
- `tests/documentWorkflowAdaptersRuntime.test.mjs`
- `tests/documentWorkflowBuildRuntime.test.mjs`
- `tests/documentWorkflowRuntime.test.mjs`
- `tests/documentWorkspacePreviewRuntime.test.mjs`

## See also

- `docs/ARCHITECTURE.md`
- `docs/PRODUCT.md`
- `docs/TESTING.md`
