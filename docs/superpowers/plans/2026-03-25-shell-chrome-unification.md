# Shell Chrome Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sidebar panel switching into shared sidebar chrome, reduce Header to left/right toggle buttons, and simplify shell layout geometry to cut redundant layout churn.

**Architecture:** Reuse existing workspace sidebar state and shared panel normalization rules, extract shared panel entry metadata plus shared chrome UI primitives, then update Header and sidebars to consume them. Remove old Header panel measurement dependencies from shell width calculations so the shell no longer couples sidebar sizing to Header chrome placement.

**Tech Stack:** Vue 3, Pinia, shared runtime helpers in `src/shared`, node:test, Vite

---

### Task 1: Shared workbench chrome metadata

**Files:**
- Create: `src/shared/workbenchChromeEntries.js`
- Test: `tests/workbenchChromeEntries.test.mjs`

- [ ] Add shared left/right panel entry builders keyed by normalized workbench surface.
- [ ] Reuse existing panel normalization modules instead of duplicating allowed-panel logic.
- [ ] Write focused tests that verify workspace, library, and AI surfaces expose the expected entries.

### Task 2: Shared shell chrome components

**Files:**
- Create: `src/components/shared/ShellChromeButton.vue`
- Create: `src/components/shared/SidebarChrome.vue`

- [ ] Add a single button primitive used by Header toggles and sidebar panel tabs.
- [ ] Add a shared sidebar chrome strip that renders entry arrays via the shared button primitive.
- [ ] Keep the API narrow: entries, active key, select handler, and optional alignment/title props.

### Task 3: Move panel switching out of Header

**Files:**
- Modify: `src/components/layout/Header.vue`
- Modify: `src/shared/headerChromeGeometry.js`
- Test: `tests/headerChromeGeometry.test.mjs`

- [ ] Remove left/right panel-tab rendering from Header.
- [ ] Keep only left and right toggle buttons, with the left one still honoring traffic-light-safe placement.
- [ ] Fix right toggle placement to the far right edge.
- [ ] Update geometry helpers and tests to reflect the simplified Header chrome contract.

### Task 4: Add unified sidebar chrome

**Files:**
- Modify: `src/components/sidebar/LeftSidebar.vue`
- Modify: `src/components/sidebar/RightSidebar.vue`

- [ ] Add `SidebarChrome` to the top of both sidebar shells.
- [ ] Wire left panel switching through `workspace.setLeftSidebarPanel(...)`.
- [ ] Wire right panel switching through `workspace.setRightSidebarPanel(...)` and keep right sidebar opening behavior explicit.
- [ ] Preserve existing sidebar content routing and current visual refinements.

### Task 5: Simplify shell width logic and remove shell width transitions

**Files:**
- Modify: `src/App.vue`
- Modify: `src/composables/useAppShellLayout.js`
- Test: `tests/appShellLayout.test.mjs`

- [ ] Remove Header panel-button DOM measurement dependencies from sidebar minimum-width calculations.
- [ ] Replace those calculations with stable minimum-width behavior that no longer depends on Header panel groups.
- [ ] Remove app-shell sidebar width transitions so open/close happens without animated continuous relayout.
- [ ] Update layout tests to match the simplified width rules.

### Task 6: Validation and blueprint update

**Files:**
- Modify: `docs/REFACTOR_BLUEPRINT.md`

- [ ] Run targeted tests for the new shared metadata and updated geometry/layout helpers.
- [ ] Run `node --test tests/*.test.mjs`.
- [ ] Run `npm run build`.
- [ ] Record any pre-existing failures that remain outside this slice in the blueprint.
