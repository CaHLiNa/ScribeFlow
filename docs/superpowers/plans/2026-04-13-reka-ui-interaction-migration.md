# Altals Reka UI Interaction Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Altals' custom dialog, menu, select, and quick-open interaction scaffolding with Reka UI primitives while preserving the current desktop-first visual design and workbench structure.

**Architecture:** Keep Altals' shell, editor, preview, sidebar, and settings surfaces visually intact. Move only the headless interaction layer to Reka UI: `Dialog` for modal shells, `Select` for settings controls, `DropdownMenu` for anchored and coordinate-based menus, and `Combobox` for quick open. Reuse existing CSS class names where possible so the migration changes behavior and accessibility, not product character.

**Tech Stack:** Vue 3.5, Pinia, Tauri, Reka UI 2.9.5

---

## File Map

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/shared/ui/UiModalShell.vue`
- Modify: `src/components/shared/ui/UiSelect.vue`
- Modify: `src/components/SetupWizard.vue`
- Modify: `src/components/layout/WorkspaceQuickOpen.vue`
- Modify: `src/components/editor/EditorContextMenu.vue`
- Modify: `src/components/shared/SurfaceContextMenu.vue`
- Modify: `src/components/sidebar/ContextMenu.vue`
- Modify: `src/components/sidebar/FileTree.vue`
- Modify: `src/components/editor/EditorPane.vue`

### Task 1: Foundation Primitives

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/components/shared/ui/UiModalShell.vue`
- Modify: `src/components/shared/ui/UiSelect.vue`

- [ ] **Step 1: Add the headless dependency**

```bash
npm install reka-ui@2.9.5
```

Expected: `package.json` and `package-lock.json` gain `reka-ui`.

- [ ] **Step 2: Move modal shell to Reka Dialog**

Use `DialogRoot`, `DialogPortal`, `DialogOverlay`, and `DialogContent` while preserving the current `visible`, `closeOnBackdrop`, `size`, `position`, `bodyPadding`, and class passthrough API so existing Altals surfaces do not need a behavioral rewrite.

- [ ] **Step 3: Move select control to Reka Select**

Use `SelectRoot`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectViewport`, `SelectItem`, `SelectItemText`, and `SelectItemIndicator`, but keep the current `UiSelect` prop surface and class names (`ui-select-shell`, `ui-select-trigger`, `ui-select-menu`, `ui-select-option`) so the settings pages keep their current styling hooks.

- [ ] **Step 4: Verify the primitive layer still builds**

Run:

```bash
npm run build
```

Expected: build passes after the primitive refactor.

### Task 2: Menu Migration

**Files:**
- Modify: `src/components/editor/EditorContextMenu.vue`
- Modify: `src/components/shared/SurfaceContextMenu.vue`
- Modify: `src/components/sidebar/ContextMenu.vue`
- Modify: `src/components/sidebar/FileTree.vue`
- Modify: `src/components/editor/EditorPane.vue`

- [ ] **Step 1: Replace coordinate-based menus with controlled Reka DropdownMenu content**

Use `DropdownMenuRoot` with controlled `open` state and `DropdownMenuContent` positioned from either:

- a virtual point reference for right-click menus
- a DOM element reference for anchored menus such as file tree header menus and document-tab menus

- [ ] **Step 2: Keep current menu items and side effects intact**

Preserve existing commands for:

- editor cut/copy/paste and formatting
- preview surface actions
- file tree create/rename/duplicate/delete/reveal actions
- workspace footer actions
- document tab switching and close/new-tab actions

- [ ] **Step 3: Preserve Altals styling hooks**

Continue to use the existing menu class family (`context-menu`, `context-menu-item`, `context-menu-section`, `context-menu-separator`) so the migration does not visually shift the desktop shell toward generic web-admin UI.

Run:

```bash
```

Expected: shared preview/editor menu contracts still pass.

### Task 3: Dialog and Command Palette Migration

**Files:**
- Modify: `src/components/SetupWizard.vue`
- Modify: `src/components/layout/WorkspaceQuickOpen.vue`

- [ ] **Step 1: Rebase setup wizard on the shared Reka-backed modal shell**

Keep the current wizard copy, theme-card layout, and startup flow, but render it through the new dialog foundation instead of a custom fullscreen overlay.

- [ ] **Step 2: Rebuild quick open on Reka Combobox inside a modal shell**

Use `ComboboxRoot`, `ComboboxInput`, and `ComboboxItem` so the quick-open surface gets accessible active-item and keyboard behavior without changing its current file-search role or styling direction.

- [ ] **Step 3: Preserve current Altals shortcuts and selection behavior**

Keep:

- `Cmd/Ctrl+P` open behavior
- `Escape` close behavior
- recent-files fallback when query is empty
- opening the selected file into the current workspace surface

### Task 4: Contract Coverage and Verification

**Files:**

Assert that:

- `UiSelect.vue` imports and uses Reka Select primitives
- `UiModalShell.vue` imports and uses Reka Dialog primitives
- `WorkspaceQuickOpen.vue` imports and uses Reka Combobox primitives
- menu components import and use Reka DropdownMenu primitives

- [ ] **Step 2: Run the targeted verification slice**

Run:

```bash
npm run build
```

Expected: contracts pass and the frontend builds.

- [ ] **Step 3: Run the required postflight audit**

Run:

```bash
npm run agent:codex-postflight -- --plan docs/superpowers/plans/2026-04-13-reka-ui-interaction-migration.md
```

Expected: the postflight report maps the branch state back to this plan.

## Migration List

### Migrate now to Reka UI

- `src/components/shared/ui/UiModalShell.vue`
- `src/components/shared/ui/UiSelect.vue`
- `src/components/SetupWizard.vue`
- `src/components/layout/WorkspaceQuickOpen.vue`
- `src/components/editor/EditorContextMenu.vue`
- `src/components/shared/SurfaceContextMenu.vue`
- `src/components/sidebar/ContextMenu.vue`
- `src/components/sidebar/FileTree.vue`
- `src/components/editor/EditorPane.vue`

### Not in this slice

- `src/components/sidebar/FileTree.vue` tree virtualization or PrimeVue replacement
- PrimeVue-based settings controls
- any shell/editor/preview visual redesign
- reintroducing a removed unsaved-changes dialog without a separate approved behavior change
