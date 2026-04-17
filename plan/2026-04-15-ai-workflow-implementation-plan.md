# AI Workflow Implementation Plan

**Goal:** Add the first native AI workflow slice to Altals so the desktop workbench can expose grounded AI context, recommend research skills, and prepare structured execution briefs from the active draft and selected reference state.

**Architecture:** Use the existing workspace shell and right inspector area as the first AI entry point. Build a thin AI layer across `src/domains`, `src/services`, `src/stores`, and `src/components` so context assembly, skill recommendation, and UI rendering are separated cleanly. Keep this slice local-first and provider-agnostic: no model runtime yet, but no fake detached chat shell either.

---

## Scope

### Included in this slice

- AI inspector panel in the right sidebar
- grounded AI context bundle built from:
  - active document
  - current editor selection
  - selected reference
- internal AI skill registry for the first research-oriented skills
- recommended-skill logic based on available context
- prepared AI brief output for the currently selected skill
- workbench rail entry for opening the AI panel

### Not included in this slice

- model provider integration
- persistent chat history
- artifact application back into the document
- PDF selection ingestion
- multi-reference comparison state

## File Map

### New files

- `src/domains/ai/aiContextRuntime.js`
  Responsibility: normalize current AI context, derive grounded context bundle, and recommend skills.
- `src/services/ai/skillRegistry.js`
  Responsibility: define the initial native Altals AI skill catalog and prepared-brief builders.
- `src/stores/ai.js`
  Responsibility: store active editor-selection context and selected AI skill state.
- `src/components/panel/AiWorkflowPanel.vue`
  Responsibility: render current AI context, recommended skills, and prepared execution brief.
  Responsibility: verify grounded context and skill recommendation logic.

### Modified files

- `src/App.vue`
  Responsibility: initialize AI store, forward editor selection updates, and expose an AI panel entry from the workbench rail.
- `src/components/layout/WorkbenchRail.vue`
  Responsibility: add a control that opens the AI workflow panel.
- `src/components/sidebar/RightSidebar.vue`
  Responsibility: render the AI workflow panel when the AI inspector is active.
- `src/components/editor/TextEditor.vue`
  Responsibility: emit selection payloads with grounded text and offsets instead of a boolean-only selection flag.
- `src/components/editor/PaneContainer.vue`
  Responsibility: forward `selection-change` events through the pane tree.
- `src/shared/workbenchInspectorPanels.js`
  Responsibility: register the AI inspector panel.
- `src/shared/workbenchChromeEntries.js`
  Responsibility: expose an AI inspector entry in the normalized chrome metadata.
- `src/i18n/index.js`
  Responsibility: add user-facing strings for the AI workflow panel and skills.
  Responsibility: verify AI inspector panel normalization.
  Responsibility: verify normalized chrome metadata now includes the AI panel.

## Execution Tasks

### Task 1: Add AI context and skill foundations

**Files:**
- Create: `src/domains/ai/aiContextRuntime.js`
- Create: `src/services/ai/skillRegistry.js`
- Create: `src/stores/ai.js`

**Deliverable:**
- A provider-agnostic AI runtime foundation that can:
  - normalize selection payloads
  - build a grounded context bundle
  - recommend the first Altals research skills
  - generate a prepared brief for the selected skill

### Task 2: Wire editor selection into the AI store

**Files:**
- Modify: `src/components/editor/TextEditor.vue`
- Modify: `src/components/editor/PaneContainer.vue`
- Modify: `src/App.vue`

**Deliverable:**
- Editor text selection is emitted as structured payload and stored in the AI store for the active document.

### Task 3: Add the AI inspector panel

**Files:**
- Create: `src/components/panel/AiWorkflowPanel.vue`
- Modify: `src/components/sidebar/RightSidebar.vue`
- Modify: `src/components/layout/WorkbenchRail.vue`
- Modify: `src/shared/workbenchInspectorPanels.js`
- Modify: `src/shared/workbenchChromeEntries.js`
- Modify: `src/i18n/index.js`

**Deliverable:**
- Users can open an AI panel from the workbench rail and see:
  - current grounded context
  - recommended skills
  - prepared brief for the active skill

### Task 4: Verify the new AI slice

**Files:**

**Verification commands:**

## Expected Outcome After This Slice

After this plan is executed, Altals will have the first real AI workflow foundation inside the desktop shell:

- AI is visible as a first-class workbench capability
- AI is grounded in active project context instead of a detached chat surface
- the workbench can recommend research skills based on actual context
- the codebase has clear seams for future chat, provider integration, and artifact application
