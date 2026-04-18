# Architecture

This repository is organized around a desktop-first Tauri application with a Vue frontend and a Rust backend.

The architecture targets one local-first academic platform where document writing, literature management, reading, and AI workflows are peer product capabilities inside the same project workbench. AI is not a detached add-on surface: it should stay grounded in the active project, open documents, selected references, reader context, citation workflow, and an embedded agent shell.

## High-level runtime shape

### Frontend boot

- `src/main.js` initializes locale, Vue, and Pinia, then mounts `App.vue`.
- `src/App.vue` composes the launcher, workspace shell, sidebars, workbench surfaces, settings surface, dialogs, and overlays.

### Desktop backend

- `src-tauri/src/lib.rs` is the main backend integration point for native behavior, workspace protocol serving, and registered backend modules.
- the Rust backend owns native seams such as filesystem access, secure path resolution, process execution, and desktop-specific protocol handling

### Product workbench model

- the workspace shell is the primary container for writing, references, reading, and AI-assisted research actions
- the left sidebar remains project-tree-first, with references as a peer workspace navigation panel
- the main workbench hosts editor, reference, preview, compile, and grounded AI workflow surfaces
- the right inspection area is currently outline-first and may grow only when a panel directly supports drafting, citation, reading, or grounded AI assistance

## Layer responsibilities

### `src/app/*`

Shell lifecycle and app-level orchestration.
Examples:

- `src/app/shell/useAppShellEventBridge.js`
- `src/app/workspace/useWorkspaceLifecycle.js`

### `src/domains/*`

Product rules and reusable runtime decisions that should stay out of components.
Current domain families:

- document workflow runtime and preview decisions
- editor routing, pane layout, cleanup, and persistence
- file tree hydration, mutation, watches, and text indexing
- reference interop, search token normalization, and citation presentation rules
- AI context normalization and artifact rules
- workbench motion and surface coordination
- workspace setup and starter flows

Near-term domain expansions should cover:

- reader session and source-to-draft navigation policy
- deeper AI workflow policy, citation guardrails, and automation decisions

### `src/services/*`

Effectful integrations such as files, compile flows, environment checks, repository operations, document intelligence extraction, reference import or export adapters, PDF helpers, and future model or translation clients.
Current examples:

- `src/services/documentWorkflow/*`
- `src/services/documentIntelligence/*`
- `src/services/ai/*`
- `src/services/references/*`
- `src/services/pdf/*`
- `src/services/environmentPreflight.js`

### `src/stores/*`

Reactive state and thin coordination.
Important stores:

- `src/stores/workspace.js`
- `src/stores/editor.js`
- `src/stores/documentWorkflow.js`
- `src/stores/ai.js`
- `src/stores/references.js`
- `src/stores/files.js`
- `src/stores/latex.js`

Future stores should follow the same thin-coordination rule when reader or deeper AI features land, for example:

- reader session state
- AI task or session state
- grounded context selection state

### `src/components/*`

UI rendering and user intent emission.
Representative surfaces:

- launcher: `src/components/Launcher.vue`
- workbench chrome: `src/components/layout/WorkbenchRail.vue`
- editor surface: `src/components/editor/EditorPane.vue`
- AI agent panel: `src/components/panel/AiAgentPanel.vue`
- reference workbench: `src/components/references/ReferenceLibraryWorkbench.vue`
- references sidebar: `src/components/sidebar/ReferencesSidebarPanel.vue`
- reference detail panel: `src/components/panel/ReferenceDetailPanel.vue`
- left sidebar: `src/components/sidebar/LeftSidebar.vue`
- right sidebar: `src/components/sidebar/RightSidebar.vue`
- settings surface: `src/components/settings/Settings.vue`
- AI settings surface: `src/components/settings/SettingsAi.vue` for multi-provider presets, active routing, and custom relay compatibility

Future reader and AI surfaces should remain workbench-native views or contextual panels instead of becoming an unrelated app-within-an-app.

### `src/composables/*`

Reusable UI glue that should stay lighter than product-policy code.

### `src-tauri/*`

Native filesystem, process, protocol, and platform seams.
The backend module list in `src-tauri/src/lib.rs` currently centers on file access, LaTeX execution, workspace access, and security-sensitive desktop integration.

The Rust backend is also the landing zone for the future native editor migration:

- `src-tauri/crates/altals-editor-core` is the first backend-agnostic editor-core crate for buffer, selection, transaction, and viewport math
- `src-tauri/src/native_editor_runtime.rs` is the stateful Tauri-side session owner for the helper process and should progressively absorb helper session state instead of leaving that responsibility in frontend stores
- save and persistence paths should increasingly materialize current document text from Rust-owned session state instead of relying on frontend in-memory mirrors
- future native editor host and bridge crates should live under `src-tauri/crates/*`, not inside the Vue shell
- editor workflow policy should continue to stay above the core, while low-level text mechanics move into Rust over time

During migration, do not add user-facing experimental editor controls or placeholder editor surfaces unless explicitly approved. The default direction is backend-first replacement with hidden protocol seams until final cutover is ready.

Future backend seams for reader helpers, reference tooling, local model runners, or translation execution should remain typed desktop integrations instead of ad hoc UI-owned process launching.

## Important architectural seams

### Shell and surface composition

`src/App.vue` currently chooses between:

- launcher when no workspace is open
- workspace workbench when a workspace is open
- settings surface when the primary surface changes to settings

The same shell also owns setup flow overlays and file or workspace confirmations.

### Sidebar and workbench composition

- the left sidebar is normalized through `src/shared/workbenchSidebarPanels.js` and currently exposes `files` and `references`
- references are already first-class workbench navigation, not a hidden utility flow
- the right inspector is normalized through `src/shared/workbenchInspectorPanels.js` and currently exposes `outline` and `ai`
- future inspector panels are allowed only when they directly support drafting, citation, reading, or grounded AI assistance inside the same workbench

### Document workflow architecture

Document workflow behavior is split across:

- adapter definitions in `src/services/documentWorkflow/adapters/*`
- workflow policy in `src/services/documentWorkflow/policy.js`
- reconcile helpers in `src/services/documentWorkflow/reconcile.js`
- runtime orchestration in `src/domains/document/*`
- persisted workflow session state in `src/stores/documentWorkflow.js`

Citation behavior and AI writing assistance should attach to document workflow decisions rather than fork into disconnected subsystems.

### References architecture

References are no longer a speculative sidecar. The current architecture already includes a real slice:

- reference UI in `src/components/references/*` and `src/components/sidebar/ReferencesSidebarPanel.vue`
- reference detail rendering in `src/components/panel/ReferenceDetailPanel.vue`
- coordination state in `src/stores/references.js`
- reference normalization and presentation rules in `src/domains/references/*`
- import, export, formatting, metadata, assets, and sync adapters in `src/services/references/*`

The default storage model should stay local-first: shared reference assets and library data may live in the app-owned Altals directory, while workspace-local usage, citation context, and draft links stay tied to the active project.

### Reader architecture

Reader features should stay tightly connected to the same research loop:

- PDF or source reading state should be recoverable from workspace state
- reader navigation should connect back to the active draft, selected references, citation targets, and outline context
- annotations or extracted metadata should prefer local persistence
- a reader should not become a separate navigation universe that ignores the current project

### AI workflow architecture

AI workflow is a first-class product capability, but it should be architected as a grounded agent shell with provider runtimes, tools, and filesystem-native skills rather than a generic chat shell:

- the current slice already ships a right-inspector AI shell, multi-provider settings, active-provider routing, skill execution, `/` and `$skill` invocation, grouped settings-side skill management, artifact application via capability handlers, and Altals-managed filesystem skill discovery
- the runtime is moving away from one-shot completion calls toward a Proma-style provider adapter layer with SSE parsing, tool-use loops, and provider-specific request shaping for Anthropic, OpenAI-compatible, and Google-style APIs
- Anthropic now also has a Tauri-managed Node sidecar seam for the Claude Agent SDK path, so agent-style runtime behavior can be added without rewriting the desktop app around Electron
- desktop approval flows and provider-specific built-in tool policies should stay explicit in the UI rather than hiding all tool decisions inside prompts
- AI actions should start from explicit project context such as the active file, selected references, reader selection, diagnostics, or compile state
- filesystem skills should be discovered only from Altals-managed user and workspace directories, not arbitrary external tool folders
- effectful model clients, retrieval adapters, translation clients, and indexing jobs belong in `src/services/*`
- prompt assembly, context eligibility, citation-grounding rules, and workflow guardrails belong in `src/domains/*`
- user-facing AI surfaces belong in `src/components/*` and should appear as workbench-native actions, panels, or automation entry points
- coordination state belongs in `src/stores/*`, but long-lived policy should not drift into stores
- the first-party core should remain useful without remote AI, and future AI integrations should stay plugin-capable
- Anthropic-specific SDK orchestration should be treated as a runtime seam, not hard-wired into the UI layer, because the desktop product runs on Tauri rather than Electron/Node

### Document intelligence seam

`src/services/documentIntelligence/*` already forms a useful bridge between core document behavior and future AI workflows:

- outline normalization
- diagnostic normalization
- workspace graph helpers

This seam should continue to provide structured local context that can support writing, reading, citation, and AI workflows without forcing product policy into low-level services.

### Workspace persistence

`src/stores/workspace.js` resolves a hashed workspace identity, separate workspace-owned metadata directories, and shell preference persistence. This is one of the main boundaries between user project files and app-owned metadata.

That boundary should carry workspace-local reader session state, AI working context, and other project metadata, while shared reference assets or reusable model caches remain in app-owned Altals storage where appropriate.

### Release and repo automation

Repository automation is split between:

- `scripts/frontendBaselineTooling.mjs`
- `scripts/agentReviewWorkflow.mjs`
- `.github/workflows/release.yml`

## Architectural direction

- keep the desktop app as the primary architecture driver
- treat writing, literature management, reading, and AI workflows as peer loops inside one workbench
- keep AI grounded in active project context instead of building a detached chat product
- keep policy in `domains` where possible
- keep `services` effectful and policy-light
- keep stores thinner over time instead of turning them into another policy layer
- keep references, reading state, and AI context local-first by default
- make citations document-aware instead of format-agnostic shortcuts
- keep AI and translation capabilities modular and plugin-friendly
- do not let deleted legacy systems define new structure choices

## See also

- `docs/PRODUCT.md`
- `docs/DOMAINS.md`
- `docs/ACADEMIC_PLATFORM_DIRECTION.md`
- `docs/DOCUMENT_WORKFLOW.md`
