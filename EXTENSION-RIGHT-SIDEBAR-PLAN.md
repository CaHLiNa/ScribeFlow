# ScribeFlow Extension Right Sidebar Plan

Last updated: 2026-05-01

## 1. Decision

ScribeFlow extensions should follow a strict split:

- the Settings extensions section is only for plugin discovery, lifecycle management, permission inspection, and plugin configuration
- plugin usage belongs in the document right sidebar
- each plugin should appear as a right-sidebar tab or panel container
- each plugin container should render its own plugin views, tree, status, and preview-oriented surface

This should become the default product rule for extension UX.

## 2. Product Intent

The goal is to make extensions feel like first-class research tools inside the document workflow, not detached utilities hidden behind settings.

For the user, the mental model should be:

- install / enable / configure a plugin in Settings
- use the plugin from the document right sidebar when reading or working on a file
- jump into the matching plugin surface from PDF actions, reference actions, or document context actions

This matches the existing expectation that citation and reference workflows live beside the active document, not inside a settings screen.

## 3. Non-Goals

This plan does not aim to:

- turn Settings into a plugin workbench
- add arbitrary freeform plugin pages outside the document shell
- replicate a full VS Code-style extension surface model
- make every plugin launch a custom standalone frontend app

## 4. Current Reality

The current platform already partially matches this direction.

What is already true:

- Settings can discover, enable, disable, and configure plugins
- enabled plugins can contribute right-sidebar surfaces
- plugin views can be rendered in the document right sidebar
- plugin runtime can update view state, refresh views, and reveal items

Relevant current files:

- `CURRENT-STATE.md`
- `PLUGIN-ARCHITECTURE.md`
- `src/stores/extensions.js`
- `src/components/extensions/ExtensionSidebarPanel.vue`
- `src/components/sidebar/DocumentPluginsPanel.vue`
- `src/components/sidebar/DocumentDock.vue`
- `src/stores/workspace.js`

What is already formalized:

- Settings is a management surface, not the primary plugin work surface
- every normal plugin maps to one right-sidebar tab/container, and manifest validation now enforces a single activitybar container per plugin
- PDF actions, command invocations, capability invocations, and view reveal requests already route into the matching plugin tab by default

What still needs tightening:

- plugin panel semantics still need to be tightened so the platform speaks in one consistent vocabulary
- long-running task UX still needs deeper productization beyond the example plugin path

## 5. Target UX Contract

The platform should converge on the following contract.

### 5.1 Settings Role

The Settings extensions screen should only handle:

- plugin discovery
- plugin install source visibility
- enable / disable
- status and runtime metadata
- permissions and capability visibility
- plugin-owned settings schema and values

The Settings screen should not be treated as the primary place to operate plugin workflows.

### 5.2 Right Sidebar Role

The document right sidebar should be the primary extension workspace.

Each plugin should have:

- one right-sidebar container or tab identity
- one or more plugin-owned views inside that container
- plugin-owned runtime state, status, and actions surfaced there

The right sidebar is where the user should:

- inspect the plugin’s current document context
- see task progress
- view plugin-generated structure or tree data
- access preview-oriented outputs
- re-run, refresh, or continue plugin workflows

### 5.3 Document-Coupled Entry

Plugin usage should be document-coupled by default.

That means:

- PDF preview actions should open or focus the relevant plugin container
- reference-related context should flow into the plugin runtime
- plugin views should resolve against the active document / reference / PDF context

This is especially important for document tools such as:

- PDF translation
- citation assistance
- reference enrichment
- annotation extraction
- OCR-driven document workflows

## 6. Platform Rule For PDF Translation Plugins

For a PDF translation plugin such as a future `retain-pdf`-style integration, the correct UX shape is:

- Settings stores provider configuration and translation defaults
- a PDF action sends the current PDF context into the translation plugin
- the right sidebar opens the translation plugin tab
- the plugin tab shows task state, provider status, source context, and result entry points
- translated output is previewed or linked from the right sidebar, not driven from Settings

The Settings page should not host:

- translation task execution
- task progress monitoring
- result preview
- document-bound interaction

## 7. Architecture Contract

To make the UX rule enforceable, the architecture should use the following boundary.

### 7.1 Rust Responsibilities

Rust remains authority for:

- plugin discovery
- manifest validation
- enabled state persistence
- plugin host startup
- command execution
- task state
- artifact access
- filesystem and workspace security
- PDF/reference context enforcement

### 7.2 Vue Responsibilities

Vue remains responsible for:

- rendering right-sidebar plugin containers
- switching and focusing plugin tabs
- rendering plugin tree and status surfaces
- mapping host events into visible right-sidebar state

### 7.3 Plugin Runtime Responsibilities

Plugin runtime owns:

- plugin commands
- plugin view registration
- plugin refresh behavior
- plugin task orchestration triggers
- plugin-local interpretation of settings
- plugin-specific right-sidebar state and semantics

## 8. Required UX Normalization

The following product rules should be made explicit in code and docs.

### Rule A

Every normal plugin feature must be usable without opening Settings after initial setup.

### Rule B

Settings may configure a plugin, but should not be the operational surface of the plugin.

### Rule C

Document actions should route the user into the plugin’s right-sidebar surface instead of spawning plugin-specific special UI in core code.

### Rule D

Plugin containers should feel parallel to existing document-side workflows such as references, not like detached admin pages.

## 9. Implementation Phases

### Phase 1: Freeze The Product Contract

Goal:

- write the right-sidebar-first plugin UX into project docs
- make the contract explicit enough that future extension work stops drifting back into Settings-first usage

Tasks:

- update plugin architecture docs to state that Settings is management-only
- update current-state docs so the right sidebar is described as the primary plugin surface
- define “plugin container/tab” language consistently across docs

Primary files:

- `PLUGIN-ARCHITECTURE.md`
- `CURRENT-STATE.md`
- `Plugin.md`

Acceptance:

- docs clearly distinguish plugin management from plugin usage
- docs explicitly describe the right sidebar as the main plugin usage surface

### Phase 2: Normalize Core Frontend Vocabulary

Goal:

- make the frontend use one consistent model for plugin right-sidebar tabs, containers, and views

Tasks:

- audit naming around `panel`, `container`, `view`, and `tab`
- settle one canonical mapping
- plugin container = right-sidebar tab identity
- plugin view = runtime-rendered sub-surface inside the plugin container
- plugin target summary = shared presentation output for active path/reference context
- remove ambiguous naming where it causes UI confusion or accidental architecture drift

Primary files:

- `src/stores/extensions.js`
- `src/domains/extensions/extensionTargetPresentation.js`
- `src/domains/extensions/extensionContributionRegistry.js`
- `src/components/sidebar/DocumentPluginsPanel.vue`
- `src/components/extensions/ExtensionSidebarPanel.vue`
- `src/stores/workspace.js`

Acceptance:

- a plugin’s container identity maps cleanly to one right-sidebar tab
- a plugin’s views render inside that tab without extra plugin-specific core branching

### Phase 3: Route Usage Into The Right Sidebar

Goal:

- make plugin execution flows land in the plugin’s right-sidebar surface by default

Tasks:

- when a PDF preview action invokes a plugin, focus or open the matching plugin tab
- make document context, PDF context, and reference context available to the opened plugin surface
- ensure plugin refresh or reveal events can move the user into the relevant plugin state without extra manual navigation

Primary files:

- `src/components/extensions/ExtensionActionButtons.vue`
- `src/components/sidebar/DocumentPluginsPanel.vue`
- `src/components/sidebar/DocumentDock.vue`
- `src/stores/extensions.js`
- `src/stores/workspace.js`
- `src/services/extensions/*`

Acceptance:

- clicking a plugin-owned PDF action opens or focuses the correct plugin tab
- the plugin tab resolves the active PDF/reference context immediately
- document-action plugin tabs use the same container header, target summary, and host runtime diagnostic surface as normal plugin tabs

### Phase 4: Add Plugin-Grade Preview Patterns

Goal:

- make the right sidebar strong enough for real document tools, not only tree lists

Tasks:

- define standard sidebar sections
- context summary
- task status
- action row
- result summary
- preview / artifact entry points
- extend plugin view state contracts if current tree-only surfaces are too weak
- avoid hardcoding per-plugin UI in core; add general runtime APIs when truly needed

Primary files:

- `src/components/extensions/ExtensionSidebarPanel.vue`
- `src/stores/extensions.js`
- `src-tauri/resources/extension-host/extension-host.mjs`
- `src-tauri/src/extension_host.rs`

Acceptance:

- a non-trivial plugin can show more than a plain tree
- plugin right-sidebar surfaces can host status and preview-oriented UX without core plugin special cases

### Phase 5: Prepare For PDF Translation Plugin Integration

Goal:

- make the platform ready for a `retain-pdf`-style plugin that uses external OCR and LLM services

Tasks:

- decide the boundary between plugin runtime and sidecar worker
- define plugin settings for provider defaults and non-secret configuration
- define how task state and output PDF links show up in the right sidebar
- declare API keys and tokens with `secureStorage: true` so secure host-managed keychain storage remains the production credential path

Primary files:

- `Plugin.md`
- `PLUGIN-ARCHITECTURE.md`
- `src-tauri/src/extension_host.rs`
- `src/components/extensions/ExtensionTaskPanel.vue`
- future plugin example files

Acceptance:

- the platform can host a right-sidebar-first PDF translation plugin without using Settings as its work surface
- sidecar or process-driven execution fits the current host boundary cleanly

## 10. File Touch Map

These are the most likely files to change when executing this plan.

Product / architecture docs:

- `PLUGIN-ARCHITECTURE.md`
- `Plugin.md`
- `CURRENT-STATE.md`
- `README.md`

Frontend shell and plugin docking:

- `src/components/sidebar/DocumentDock.vue`
- `src/components/sidebar/DocumentPluginsPanel.vue`
- `src/components/extensions/ExtensionSidebarPanel.vue`
- `src/components/extensions/ExtensionActionButtons.vue`
- `src/components/extensions/ExtensionTaskPanel.vue`
- `src/stores/extensions.js`
- `src/stores/workspace.js`
- `src/domains/extensions/extensionContributionRegistry.js`

Runtime host bridge:

- `src-tauri/resources/extension-host/extension-host.mjs`
- `src-tauri/src/extension_host.rs`

## 11. Validation Strategy

Every execution round should validate both architecture and behavior.

Baseline verification:

- `npm run verify`

Behavior verification:

- enable a local example plugin
- confirm the plugin appears in the right sidebar
- trigger a PDF-related plugin action
- confirm the right sidebar focuses the matching plugin container
- confirm the plugin receives active PDF/reference context
- confirm plugin settings remain in Settings and operational workflow remains outside Settings

## 12. Risks

### Risk 1

The current tree-view-first sidebar surface may be too weak for richer preview UX.

Implication:

- a future plugin may force ad hoc core UI unless a more general runtime view contract is added

### Risk 2

Without secure credential storage, external-service plugins may end up with weak key handling.

Implication:

- a `retain-pdf`-style plugin may need env-based or sidecar-managed secrets first

### Risk 3

If tab/container semantics remain fuzzy, future plugin work may drift into duplicated routing logic.

Implication:

- the platform will feel inconsistent and plugin-specific branching will creep back in

## 13. Recommended Execution Order

If this plan is implemented in a new thread, the recommended order is:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5

Do not start with the PDF translation plugin itself.

First lock the right-sidebar-first contract, then normalize shell behavior, then let the plugin land on top of that platform shape.

## 14. Done Standard

This plan is considered fulfilled when:

- Settings is clearly a management/configuration surface for plugins
- plugin usage flows live in the right sidebar by default
- each normal plugin maps to a right-sidebar tab/container
- plugin actions route users into plugin-owned sidebar surfaces
- core app code does not need one-off UI logic for normal plugin workflows
- a future PDF translation plugin can fit this shape naturally
