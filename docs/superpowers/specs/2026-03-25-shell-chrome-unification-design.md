# Shell Chrome Unification Design

## Goal

Unify Header and sidebar chrome so the Header only keeps one left sidebar toggle and one right sidebar toggle, while both left and right panel-switching controls move into shared sidebar chrome inside their respective sidebars.

## Constraints

- Reuse existing sidebar state and panel normalization logic in `workspace` store and `src/shared/workbench*Panels.js`.
- Keep the left Header button aligned with the existing macOS traffic-light safe area rules.
- Put the right Header button at the far right edge of the Header.
- Use one shared button component and one shared sidebar chrome component instead of duplicating button markup and styles.
- Reduce shell-level layout churn by removing the old Header panel-button geometry dependency from sidebar width calculations.

## Design

### 1. Shared metadata

Move workbench panel entry metadata out of `Header.vue` into a shared runtime so Header and sidebars can consume the same entry definitions.

- Left/sidebar entries continue to derive from the normalized workbench surface:
  - workspace: `files`, `references`
  - library: `library-views`, `library-tags`
  - ai: `ai-chats`
- Right/inspector entries continue to derive from the normalized workbench surface:
  - workspace: `outline`, `backlinks`
  - library: `library-details`
  - ai: none

### 2. Shared chrome components

Add:

- `ShellChromeButton.vue`
  - One visual button primitive for Header toggles and sidebar panel tabs.
- `SidebarChrome.vue`
  - Shared strip that renders panel entries using `ShellChromeButton`.

### 3. Header behavior

`Header.vue` becomes responsible only for:

- left sidebar toggle
- right sidebar toggle
- search palette
- macOS safe-area positioning for the left toggle

The left toggle stays anchored by traffic-light geometry. The right toggle is fixed to the Header’s far right instead of following sidebar width.

### 4. Sidebar behavior

`LeftSidebar.vue` and `RightSidebar.vue` gain a shared `SidebarChrome` at the top.

- Left sidebar chrome switches left sidebar panels with existing store actions.
- Right sidebar chrome switches inspector panels with existing store actions and opens the right sidebar when needed.
- Content panes remain focused on content rendering only.

### 5. Layout and performance

Remove the old `useAppShellLayout` minimum-width dependency on Header panel-button DOM measurements.

- Left sidebar minimum width falls back to a stable static minimum.
- Right sidebar minimum width falls back to a stable static minimum.
- Header no longer animates panel groups that track sidebar width.
- App-shell sidebar width transitions are removed so heavy panes like PDF viewers stop relayouting continuously during open/close animations.

## Files

- Modify: `src/components/layout/Header.vue`
- Modify: `src/components/sidebar/LeftSidebar.vue`
- Modify: `src/components/sidebar/RightSidebar.vue`
- Modify: `src/composables/useAppShellLayout.js`
- Modify: `src/shared/headerChromeGeometry.js`
- Add: `src/shared/workbenchChromeEntries.js`
- Add: `src/components/shared/ShellChromeButton.vue`
- Add: `src/components/shared/SidebarChrome.vue`
- Modify: `tests/headerChromeGeometry.test.mjs`
- Modify: `tests/appShellLayout.test.mjs`
- Add: `tests/workbenchChromeEntries.test.mjs`
- Modify: `docs/REFACTOR_BLUEPRINT.md`

## Risks

- Existing local edits already touch shell/sidebar files, so implementation must preserve current visual refinements.
- Removing width-transition assumptions changes both behavior and tests together; the tests must be updated in the same slice.

## Validation

- Targeted tests for shared entry metadata and updated shell geometry/layout helpers.
- `node --test tests/*.test.mjs`
- `npm run build`
