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
