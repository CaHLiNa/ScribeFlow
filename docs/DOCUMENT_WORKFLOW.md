# Document Workflow

Altals treats document workflows as explicit runtime capabilities instead of one-off editor behavior.

## Supported workflow sources

The workflow layer currently recognizes two source kinds through `src/services/documentWorkflow/adapters/index.js`:

- **Markdown**
- **LaTeX**

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

Current implementation note:

- PDF preview currently uses the inline iframe surface in the main workbench webview.
- The hosted child-webview path remains in the codebase but is not enabled until workbench overlays can span webview boundaries without clipping menus.

LaTeX readiness is gated by `ensureLatexCompileReady()` in `src/services/environmentPreflight.js`.

## Workspace preview rules

The workspace preview runtime in `src/domains/document/documentWorkspacePreviewRuntime.js` currently enforces these high-level rules:

- Markdown uses a single built-in workspace preview mode.
- LaTeX preview is PDF-only.
- Hidden-by-user preview state is preserved explicitly rather than inferred indirectly.

Preview state includes:

- whether the workspace surface should be used
- whether preview is visible
- preview kind and preview mode
- target resolution status
- reason codes such as `workspace-markdown`, `workspace-latex-pdf`, and `artifact-ready-external`

## Toolbar behavior

`src/components/editor/DocumentWorkflowBar.vue` exposes workflow-aware controls:

- primary compile action for LaTeX
- preview toggle for Markdown
- PDF action when a PDF artifact can be opened
- status and phase display for render/compile state

This toolbar is rendered both in integrated shell contexts and inline editor header contexts.

## Diagnostics and artifact flow

- Markdown surfaces draft and preview problems.
- LaTeX surfaces compile errors, warnings, lint problems, and project-level problems.
- artifact paths for LaTeX are resolved through compile adapters, not guessed in components.

## See also

- `docs/ARCHITECTURE.md`
- `docs/PRODUCT.md`
