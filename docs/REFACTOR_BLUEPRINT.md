# Refactor Blueprint

## Overview

This blueprint tracks the current refactor truth for Altals as a local-first, project-directory-centered research and academic operating system. It records the smallest validated slices that improve product clarity, workflow stability, and architectural boundaries without pretending unfinished architecture has already landed.

## Product Direction

- Keep the product centered on the local research loop: open, browse, draft, compute, build, review, and optionally sync.
- Preserve explicit safety boundaries between autosave, snapshots, Git history, remote sync, and AI mutation.
- Prefer operational clarity over feature count, especially in document, notebook, PDF, and review flows.

## Architectural Principles

- `src/app` composes shell-facing orchestration.
- `src/domains/*` owns reusable workflow/runtime decisions.
- `src/services/*` wraps effectful integrations and adapters.
- Components and composables stay thinner over time.
- Refactor in small, validated slices instead of broad rewrites.

## Current State Assessment

- The frontend is the strongest landed surface and already exposes meaningful seams across app, domain, service, and store layers.
- The document-heavy loop is stable enough to refine, but performance hot spots remain around large preview surfaces such as PDF workflows.
- The repository now has a restored docs baseline again, but many of those docs are still intentionally concise and should grow only with real code truth.
- The backend remains flatter than the frontend and still needs boundary extraction over time.

## Phase Plan

1. Stabilize the core research workflow surfaces with small runtime and UI performance fixes.
2. Continue thinning shell and store logic by moving reusable decisions into domain runtimes.
3. Rebuild the missing docs baseline so repo policy audits reflect current truth instead of drift.

## Task Backlog

- Reduce residual PDF and preview-surface resize cost inside viewer boundaries.
- Continue splitting large frontend surfaces where orchestration and rendering are still mixed.
- Expand newly restored docs as code boundaries become clearer.
- Improve validation confidence around workspace, history, and preview operations.

## In Progress

- No active slice is currently in progress.

## Completed

- March 24, 2026: restored the missing refactor blueprint file so future slices can update a live execution log instead of referring to a missing path.
- March 24, 2026: reduced sidebar-toggle jank for visible PDF panes by disabling app-shell sidebar width transitions while a PDF pane is on screen, which avoids repeated PDF viewer relayout during left/right sidebar open-close animations.
- March 24, 2026: added a focused pane-tree runtime helper and tests that detect whether a visible PDF pane is present from the active tabs in the current pane tree.
- March 25, 2026: unified shell chrome so Header now only owns fixed left and right sidebar toggles while shared panel-switching chrome lives inside the left and right sidebars.
- March 25, 2026: extracted shared workbench chrome metadata plus shared `ShellChromeButton` and `SidebarChrome` components so Header and sidebars reuse one button primitive and one panel-entry source.
- March 25, 2026: removed old Header panel DOM measurement coupling from `useAppShellLayout`, simplified sidebar minimum-width rules, and removed shell width animations to avoid repeated relayout during sidebar open/close.
- March 25, 2026: restored the required docs baseline under `docs/` and added `docs/AGENTS.md`, which brings the repo policy docs audit back into line with the current repository contract.
- March 25, 2026: traced remaining sidebar drag jank to PDF viewer work during continuous shell resize, then added shared shell-resize signals so the PDF viewer can defer toolbar/UI sync and temporarily veil the iframe until drag end instead of redoing expensive work every frame.
- March 25, 2026: tightened sidebar width constraints so left and right sidebars now clamp to more deliberate minimum and maximum widths instead of allowing very narrow or overly wide drag states.
- March 25, 2026: established a first frontend UI baseline by adding semantic design tokens, a shared `ui.css` layer, and shared `UiButton` / `UiInput` / `UiModalShell` / `UiSwitch` primitives instead of continuing to grow page-local button, input, and dialog styles.
- March 25, 2026: moved the main shell chrome, key settings sections, and confirmation/history dialogs toward the new UI baseline, reducing several high-traffic `inline style` cases and replacing duplicated controls with shared primitives where the flow is stable enough.
- March 25, 2026: added `docs/FRONTEND_SPEC.md` plus spec/plan documents for this slice so the repository now has a concrete frontend baseline to reference instead of only ad hoc page-local conventions.
- March 25, 2026: removed the shared button hover translate effect after it conflicted with Header's absolute centering transform, and tightened sidebar chrome density so panel switch buttons behave like compact secondary controls instead of oversized primary actions.
- March 25, 2026: migrated the remaining settings-heavy legacy controls in `SettingsPdfTranslate`, `SettingsGitHub`, and `SettingsUpdates` onto shared `UiButton` / `UiInput` / `UiSwitch` primitives instead of leaving older local toggle and button patterns in the new settings baseline.
- March 25, 2026: added a first repository lint/format baseline with `eslint.config.js`, Prettier config, and npm scripts, but scoped lint coverage to the new frontend baseline surfaces so the repo gains enforceable standards without pretending the legacy codebase is already clean.
- March 25, 2026: finished the settings-form baseline by adding shared `UiSelect` and `UiTextarea`, migrating `SettingsEnvironment` plus the remaining `select`/`textarea` usage in `SettingsModels` and `SettingsPdfTranslate`, and deleting the unused legacy settings form-shell CSS that those pages no longer need.
- March 25, 2026: finished the settings-control baseline by extending `UiButton` for active/raw-content usage, then migrating settings navigation, choice cards, segmented toggles, disclosure rows, and dropdown items so `src/components/settings` no longer contains raw `button` elements either.
- March 25, 2026: fixed the immediate settings-baseline regressions by restoring normal switch sizing in `SettingsPdfTranslate`, moving the usage inline helper copy off the shared negative-margin `settings-hint` style, and restoring column layout for theme preview cards after the shared-button migration.
- March 25, 2026: restored the PDF translation settings surface to an intentional two-column layout by keeping dual columns but giving each toggle row a dedicated text column plus a fixed switch column so long labels wrap instead of collapsing the switch space.
- March 25, 2026: audited literal `t('...')` usage across `src/` and filled the missing `ZH_MESSAGES` entries, bringing the current missing-key scan for the Chinese language pack down to zero.
- March 25, 2026: extended the i18n audit to dynamic settings keys such as `labelKey`, `hintKey`, and `placeholderKey`, which caught the remaining untranslated PDF translation option copy and brought that scan to zero as well.

## Blocked / Risks

- Residual PDF lag, if any remains, is now more likely to come from viewer-internal resize/event churn than shell chrome movement.
- The new drag-time PDF veil is a deliberate tradeoff: smoother shell resize over live PDF redraw during drag.
- The newly restored docs baseline is intentionally high level; it should only gain detail when backed by current code truth.
- Backend boundary work still lags behind the frontend direction.
- The frontend baseline is still partial: editor-heavy surfaces and several PDF/Notebook-adjacent controls still use older styling and interaction patterns.
- Lint/format enforcement now exists, but the lint scope is intentionally limited to the new baseline surfaces until legacy frontend debt is reduced enough to expand coverage safely.

## Next Recommended Slice

- Continue migrating editor-adjacent controls, PDF toolbars, and notebook surfaces onto the shared UI baseline.
- Expand lint coverage outward from the new settings/shared surfaces once the next batch of legacy frontend rule violations is worth fixing instead of ignoring.

## Validation Checklist

- Add or update focused tests for any extracted runtime/helper logic.
- Run targeted tests for the changed slice.
- Run `node --test tests/*.test.mjs`.
- Run `npm run build`.
- Record any pre-existing validation failures explicitly.

Validation status for the current slice:

- Added and updated focused tests for shell chrome metadata, header geometry, and app-shell width rules.
- Added focused tests for shared shell-resize signals used by layout resize handles and PDF drag-time throttling.
- Updated layout tests to cover the tighter left/right sidebar minimum and maximum width clamps.
- Added a first frontend UI baseline in code and documentation, then verified the slice with a full test suite and build instead of docs-only churn.
- Migrated the remaining settings sections onto the shared UI primitives and added scoped lint/format tooling so the new baseline has enforceable guardrails.
- Added shared `UiSelect` and `UiTextarea` primitives, then verified that the settings directory no longer contains raw `input`, `select`, or `textarea` controls.
- Extended `UiButton` with active/raw-content support and verified that the settings directory no longer contains raw `button`, `input`, `select`, or `textarea` controls.
- Re-scanned literal `t('...')` usage plus common dynamic i18n key fields across `src/` and verified the current Chinese language pack has zero missing keys for those calls.
- `npm run lint` passes for the scoped frontend baseline surfaces.
- `npm run format:check` passes for the scoped frontend baseline files and docs.
- `node --test tests/workbenchChromeEntries.test.mjs tests/headerChromeGeometry.test.mjs tests/appShellLayout.test.mjs` passes.
- `node --test tests/shellResizeSignals.test.mjs tests/appShellLayout.test.mjs tests/headerChromeGeometry.test.mjs tests/workbenchChromeEntries.test.mjs` passes.
- `node --test tests/*.test.mjs` passes.
- `npm run build` passes.

## Migration Notes

- This blueprint currently reflects the repository as it exists now, not the intended end-state architecture.
- The restored docs baseline should stay concise and truthful until deeper architectural seams land in code.
