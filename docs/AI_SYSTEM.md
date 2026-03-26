# AI System

AI in Altals is intended to be conservative, scoped, auditable, and reviewable.

## Default Pattern

1. gather scoped context
2. generate a proposal or patch
3. show the proposed action
4. require approval when mutation is involved
5. apply through the normal operation path
6. associate recovery metadata when appropriate

## Current AI Surfaces

- chat sessions and launcher flows
- workflow templates and workflow runs
- document-oriented diagnose and fix helpers
- reference intake and maintenance helpers
- notebook and code-assistance flows

## System Rules

- Do not perform invisible file rewrites by default.
- Do not commit or push automatically.
- Do not bypass existing save, history, or review boundaries.
- Keep workflow checkpoints explicit when file, notebook, or reference mutations are requested.

## Current Reality

- AI behavior already spans chat state, workflow runs, and several document/reference entry points.
- The codebase is still consolidating these surfaces behind clearer workflow and operation seams.
- TeX / Typst compile diagnosis and fix now default to a dedicated right-sidebar document run panel, so document workflow users can stay in the current file context while reviewing run state, approvals, and results.
- Those document runs now send the real workflow prompt as a hidden launch message, which keeps the full run auditable without showing an artificial user bubble in the visible transcript.
- The document-run launch path now also reuses the full TeX / Typst fixer preparation step, so diagnosis and fix runs start with fresh compile context and an explicit instruction to edit the source through workspace tools when a real fix is requested.
- TeX / Typst fix runs now narrow the available tools to file-read, file-edit, and compile verification paths and require a tool-driven first step, reducing the chance that the model responds with prose-only advice instead of attempting an actual source-file repair.
- AI text-file edit tools now also sync the in-memory editor buffer immediately after a successful write, including direct-apply mode, so the visible document surface reflects the applied patch instead of waiting for a later file reload.
- The AI workbench remains available as the secondary surface for opening the full workflow session thread after a document run has already been started in-place.
