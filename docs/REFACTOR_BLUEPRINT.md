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

- No active slice recorded. Update this section when the next refactor slice starts.

## Completed

- March 26, 2026: reworked the conversion-surface left sidebar into PDF-translation-first chrome with dedicated `PDF Translation`, `Recent tasks`, and `Project files` panels, so the document conversion workbench no longer reuses the generic workspace files/references sidebar on that surface.
- March 26, 2026: extracted lightweight chat session state so the app shell, editor routing, and workspace lifecycle no longer need a root-level static dependency on the heavy AI chat store just to create or focus chat tabs, which also split a dedicated `chat-*.js` chunk out of the main app bundle.
- March 26, 2026: split LaTeX citation parsing out of the CodeMirror decoration module and lazy-loaded citation insertion plus comment-scroll editor helpers, reducing editor-only dependencies that were previously leaking into shell-adjacent startup paths even when no editor surface was active yet.
- March 26, 2026: moved PDF text extraction in the file and reference stores behind lazy `pdfMetadata` imports, which removes `vendor-pdf` from the app shell's initial preload path and keeps PDF parsing code on demand instead of startup-critical.
- March 26, 2026: converted `environmentPreflight` and `texTypFixer` callers onto explicit lazy imports at the actual user-action boundary, which removed the remaining ineffective Vite dynamic-import warnings without forcing legacy environment-store modules into every startup path.
- March 26, 2026: moved `@tauri-apps/plugin-shell` command loading behind the actual opencode and Tinymist process-launch paths, so shell process support now loads on demand instead of keeping a mixed static/dynamic plugin boundary.
- March 26, 2026: restored the missing root `AGENTS.md` contract so the repository-level agent hierarchy matches the enforced docs audit again, instead of leaving the test suite green only for nested scopes.
- March 26, 2026: rewired `src/stores/aiWorkflowRuns.js` to receive `chat`, `toast`, and AI workbench stores through explicit app bootstrap configuration instead of runtime `import()` fallbacks, which removes a noisy ineffective chunk-splitting path and makes the workflow store boundary more honest.
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
- March 25, 2026: replaced the fixed sidebar width ceilings/floors in `useAppShellLayout` with viewport-adaptive width rules and resize-time re-clamping, so smaller app windows no longer let left/right sidebars consume a disproportionate share of the shell.
- March 25, 2026: extended the frontend baseline into `TabBar`, `ReferenceList`, `NotebookEditor`, and the top-level `PdfViewer` chrome by replacing many raw toolbar/menu controls with shared UI primitives and token-based classes instead of continuing local button/input skins.
- March 25, 2026: extracted `src/services/ai/workbenchTaskLaunchers.js` so editor/sidebar components can launch notebook and reference AI flows through named seams instead of importing `launchAiTask(...)` directly from presentation code.
- March 25, 2026: expanded the scoped lint/format baseline from `settings/shared` into the highest-traffic editor/sidebar entry points, while still keeping the broader legacy repository out of mandatory lint coverage for now.
- March 25, 2026: updated the AI launch boundary audit to match the new workbench launcher seam truth, so the repository now explicitly asserts that `NotebookEditor` and `ReferenceList` launch notebook/reference AI flows through named service seams instead of direct `launchAiTask(...)` calls.
- March 25, 2026: extended the shared UI baseline one step further into `DocumentWorkflowBar`, `WorkbenchRail`, `SyncPopover`, and `ToastContainer`, replacing more high-frequency raw buttons with `UiButton` and removing another hardcoded toast-layer z-index.
- March 25, 2026: upgraded `shellResizeSignals` from a single boolean into a multi-source shared resize state, then reused that same path for PDF-sensitive sidebar open/close pulses so drag resize and sidebar toggles no longer fight over the embedded viewer's throttling path.
- March 25, 2026: added a first-render readiness handshake plus one-shot self-recovery path in `PdfViewer`, which waits for the embedded viewer app to settle, nudges resize/render once, and retries a stalled open before surfacing a blank PDF pane to the user.
- March 25, 2026: tightened sidebar chrome geometry so the left and right sidebar separator lines now align with the tab bar baseline instead of sitting on a taller chrome row.
- March 25, 2026: compressed sidebar chrome further with a new compact `icon-xs` button size, smaller sidebar icons, and a shorter strip height so the sidebar top rule reads closer to the editor tab-bar baseline instead of feeling visually lower.
- March 25, 2026: compressed sidebar chrome one more step by moving the strip down to 26px with a 20px icon-button footprint, because the previous 28px row still read visually lower than the editor tab baseline in dense workspace layouts.
- March 25, 2026: compressed the AI workbench sidebar header to the same 26px shell row height, reducing its legacy padded top bar so AI recent-chat chrome no longer sits visibly taller than the compact sidebars.
- March 25, 2026: hardened `PdfViewer` open recovery by requiring a non-zero `pagesCount` before treating the embedded viewer as render-ready, delaying `pdfUi.ready` until the document actually opens, and recreating the iframe on stalled first-render retries instead of reusing a half-initialized pdf.js shell.
- March 25, 2026: added `PdfViewer` activation recovery for cached workspace surfaces, so returning from the library or AI workbench now health-checks the cached pdf.js iframe and rebuilds it when the restored viewer comes back with `pagesCount = 0` or a blank first page.
- March 25, 2026: tightened `TabBar` overflow handling so the tab strip no longer picks up an unwanted vertical scrollbar while still preserving the intended horizontal tab scrollbar for crowded editor panes.
- March 25, 2026: fixed the async `VersionHistory` first-open path by moving its visibility/file reload decision into a small view runtime and making the modal load immediately on first visible mount, so file version history no longer opens to a false empty state after the app lazy-loads that component.
- March 25, 2026: added an explicit `Add save point` action inside the workspace saved-versions browser and routed it through the existing workspace snapshot action seam, so manual save-point creation now refreshes the browser without inventing a second history path.
- March 25, 2026: taught manual workspace save-point creation to fall back to a local-only save point when there are no file changes, so the saved-versions browser can add an explicit restore point without forcing Git to create an empty history milestone.
- March 25, 2026: moved manual save-point feedback out of the footer and into the saved-versions browser itself, so creating a workspace save point from that surface now returns a modal-local result notice instead of an easy-to-miss footer message.
- March 25, 2026: added a local hidden-history index plus explicit delete actions for workspace saved versions and file version history, so users can remove entries from Altals history surfaces without rewriting Git history or collapsing local save points into Git semantics.
- March 25, 2026: hardened `.github/workflows/release.yml` so release dispatches now distinguish between a safe rerun of an existing tag on the same commit and an invalid attempt to reuse the same version tag on a newer commit, with explicit version-bump guidance instead of a generic tag-exists failure.
- March 26, 2026: expanded the shared UI primitive baseline into `ReferenceView`, `NotebookCell`, `FileTree`, and `AddReferenceDialog`, removing raw form controls from those high-traffic editor/sidebar surfaces and replacing their header/form/dialog chrome with `UiButton` / `UiInput` / `UiSelect` / `UiTextarea` / `UiModalShell`.
- March 26, 2026: extended `workbenchTaskLaunchers` with a named reference-audit launch seam and rewired `ReferenceView` to use it, so the reference detail surface no longer launches AI directly from presentation code.
- March 26, 2026: added a focused frontend baseline audit that locks those newly migrated editor/sidebar files against regressing back to raw `button` / `input` / `select` / `textarea` controls, then expanded scoped lint/format coverage to include them.
- March 26, 2026: continued the same baseline into `FileTreeItem`, `ReferenceImportPreviewDialog`, and `ReferenceMergeDialog`, so the file-tree inline rename flow and reference-import review/merge dialogs now share the same modal/button/input primitives instead of keeping a second local UI skin.
- March 26, 2026: extended the frontend baseline into `GlobalLibraryWorkbench` and `LibraryReferenceEditor`, adding a shared `UiCheckbox` primitive so the global-library search/sort/batch controls, reference metadata editor, and table selection flow no longer depend on raw `button` / `input` / `select` / `textarea` / checkbox controls.
- March 26, 2026: continued the same library-facing baseline into `LibraryInspectorSidebar`, `LibrarySidebar`, and `ReferenceItem`, replacing their remaining raw buttons and fixed inline color styles with shared `UiButton` usage so the reference/library side surfaces now speak the same compact control language as the workbench and global-library shell.
- March 26, 2026: extended the baseline across `WorkspaceStarter`, `ExecutionResultCard`, `ReviewBar`, `NotebookReviewBar`, and `ResearchNoteCard`, replacing another cluster of editor-facing raw buttons, raw textareas, and inline chrome styles with shared primitives so starter/review/result helper surfaces no longer carry a parallel local control skin.
- March 26, 2026: continued the baseline into `AiLauncher`, `CitationPalette`, `ImageViewer`, and `AiWorkbenchSidebar`, replacing their remaining raw buttons/inputs/textareas with shared primitives and tokenized shell styles so AI launcher surfaces, citation popovers, and the image viewer toolbar no longer keep separate control skins or hardcoded popup chrome.
- March 26, 2026: finished the remaining raw-form-control cleanup inside `PdfViewer` by adding shared `UiColorInput` and `UiRangeInput`, migrating the PDF toolbar/search/page/scale/tool-popover controls onto shared primitives, and extending the frontend baseline audit so the main editor/sidebar/library path now has zero raw `button` / `input` / `select` / `textarea` controls outside shared primitive implementations.
- March 26, 2026: continued the viewer-helper baseline across `CsvEditor`, `DocumentPdfViewer`, `LatexPdfViewer`, `TypstPdfViewer`, `TypstNativePreview`, and `TextEditor`, moving their static status/tool chrome off fixed inline styles and behind tokenized scoped CSS plus a focused inline-style audit.
- March 26, 2026: continued the same inline-style cleanup into `ReferenceList` and `EditorContextMenu`, moving selected-state/menu chrome and shortcut/meta text off template-level static inline styles, then extended the inline-style audit so those richer menu surfaces are now pinned to tokenized scoped CSS too.
- March 26, 2026: normalized `NotebookEditor` status-chip popover chrome one step further by replacing composable-emitted kernel status style objects with explicit tone classes and tokenized badge/popover styling, so notebook surface state chrome now follows the same class-plus-token baseline as the surrounding workbench.
- March 26, 2026: removed the last template-level static `style="..."` usage from `EditorPane` and cleaned the stale `TabBar` comment that still carried an inline style attribute, so the audited editor/sidebar/library main templates now only retain programmatic style strings in runtime renderers such as `CellOutput`.
- March 26, 2026: extracted ANSI rich-output formatting from `CellOutput` into `src/domains/editor/cellOutputAnsiRuntime.js`, replaced runtime-generated `<span style="...">` output with class-based spans, and added focused tests so notebook/output renderer styling now follows the same tokenized CSS path as the rest of the baselined frontend.
- March 26, 2026: replaced the project-file search toggle with a persistent file-tree search field, so the file sidebar now matches the calmer always-available reference-search pattern while keeping keyboard focus shortcuts and filtered tree highlighting intact.
- March 26, 2026: tightened the persistent file-tree search styling by removing the extra shell-class binding and reducing the input text size, so the project-file search field now sits closer to the reference-search surface instead of reading larger or visually offset.

## Blocked / Risks

- Residual PDF lag, if any remains, is now more likely to come from viewer-internal resize/event churn than shell chrome movement.
- The new drag-time PDF veil is a deliberate tradeoff: smoother shell resize over live PDF redraw during drag.
- The newly restored docs baseline is intentionally high level; it should only gain detail when backed by current code truth.
- Backend boundary work still lags behind the frontend direction.
- The frontend baseline is still partial: deeper editor-heavy surfaces, Notebook cell internals, and PDF viewer-local form controls still use older styling and interaction patterns.
- Deeper child surfaces under the newly migrated reference/file/notebook flows still retain legacy structure, especially notebook cell internals beyond the local toolbar, more reference/library subviews, and PDF viewer-local controls.
- The main global-library workbench and reference editor now share the baseline, but deeper library descendants and editor-local reference surfaces still carry older local skins and should be migrated before widening lint to the rest of the repo.
- The core library sidebar/inspector/reference row path now shares the baseline too, so the highest-value remaining frontend debt is concentrated in notebook renderer-local controls, PDF viewer-local forms/toolbars, and heavier editor descendants.
- The highest-value remaining frontend debt is now concentrated even more narrowly in notebook renderer-local internals and the remaining heavier editor descendants that still own their own inline-style skins or presentation-local layout chrome.
- The highest-value remaining frontend debt is now concentrated even more narrowly in notebook renderer-local internals, deeper PDF viewer-local subpanels, and the remaining heavier editor descendants that still own dense inline-style or runtime-injected presentation chrome.
- Template-level static inline style debt on the audited editor/sidebar/library path is now effectively cleared; the remaining styling debt is mostly deeper notebook/PDF descendant surfaces and any renderer paths that still encode presentation locally.
- The embedded PDF viewer is more resilient now, but it still depends on pdf.js iframe behavior; deeper viewer-internal render cost and occasional upstream viewer edge cases remain a risk area.
- The embedded PDF viewer no longer accepts a `pagesCount = 0` shell as "ready", but upstream pdf.js iframe timing can still produce new edge cases that may need deeper event-level instrumentation if blank states continue.
- Cached workspace surfaces now actively revalidate embedded PDF iframes on re-entry, but pdf.js lifecycle timing inside `KeepAlive` remains a risk area if future viewer updates change what "initialized but blank" looks like.
- History deletion in Altals is now intentionally UI-local visibility control: removing an entry from saved versions or file history hides it through a workspace-local index, but does not rewrite the underlying Git commit graph.
- Lint/format enforcement now reaches the main settings/shared surfaces plus the highest-traffic editor/sidebar entry points, but the scope is still intentionally narrower than the full repository.
- Release automation is still intentionally version-driven: rerunning the workflow on a newer `main` commit without bumping the checked-in version will now fail with clearer guidance, but it still requires an explicit version-bump commit before a new release can be tagged.

## Next Recommended Slice

- Continue migrating deeper PDF viewer controls, notebook cell-local UI, and additional editor/sidebar surfaces onto the shared UI baseline.
- Continue migrating deeper child surfaces under references/files/notebooks, especially notebook renderer-local controls and more reference/library subviews, now that the file-tree rows and reference import dialogs are also on shared primitives.
- Continue from the newly migrated global-library shell into deeper library descendants, keeping `UiCheckbox`/`UiButton`/`UiInput`/`UiSelect`/`UiTextarea` as the only allowed path for new library-facing controls.
- With the main library sidebar/inspector path now normalized, prioritize notebook renderer-local controls and PDF viewer-local controls next unless another library child view still shows raw form controls or fixed inline visual styling.
- With editor helper surfaces now normalized too, the next highest-value slice is the remaining notebook renderer-local controls or citation/PDF-local popover surfaces, because those still contain the densest concentration of raw form controls and inline visual styling.
- With `AiLauncher`, `CitationPalette`, `ImageViewer`, and `AiWorkbenchSidebar` now normalized too, the next highest-value slice is the remaining notebook renderer-local controls and PDF-local viewer forms/toolbars, because those now contain the densest concentration of raw form controls and inline visual styling.
- With `PdfViewer` now normalized too, the next highest-value slice is notebook renderer-local controls plus the remaining editor descendants that still carry dense inline visual styling, because the main editor/sidebar/library raw-form-control debt has been cleared from the audited path.
- With the helper viewers and richer reference/editor menu surfaces now off static inline styles too, the next highest-value slice is notebook renderer-local UI plus deeper PDF/reference child popovers that still carry the heaviest concentration of inline visual styling and local presentation chrome.
- With `EditorPane`, `TabBar`, and `CellOutput` cleaned too, the next highest-value slice is notebook renderer-local UI plus deeper PDF/reference child surfaces where styling and chrome are still embedded lower in renderer logic instead of declared through shared classes.
- If PDF lag is still noticeable after this slice, profile viewer-internal event churn next, especially repeated `syncPdfUi()` triggers around scale/search/sidebar events and any expensive annotation overlay work.
- Prioritize deeper PDF/notebook sub-surfaces plus remaining reference/library child views next, because the main file-tree and reference import child shells have now been normalized but the heavier editor-facing descendants still carry the densest cluster of local legacy skins.
- Expand lint coverage outward from the current settings/shared/editor entry-point baseline once the next batch of legacy frontend rule violations is worth fixing instead of ignoring.

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
- Updated app-shell layout tests to cover viewport-adaptive sidebar minimum/maximum widths instead of only fixed pixel clamps.
- Added a focused launcher-seam test for notebook and reference workbench task launches so component-facing AI entry points can be validated without importing the full live launch runtime.
- Updated the AI launch boundary audit so the full suite now checks the new named workbench launcher seam instead of the older presentation-layer direct launcher pattern.
- Verified the newly normalized editor/sidebar files with targeted ESLint before expanding the repository lint scope to include them.
- Verified the additional workbench chrome files (`DocumentWorkflowBar`, `WorkbenchRail`, `SyncPopover`, `ToastContainer`) with targeted ESLint before folding them into the scoped lint baseline.
- Added focused tests for PDF render-readiness helpers and multi-source shell resize behavior before reusing that resize path for sidebar open/close with visible PDFs.
- Tightened the PDF render-ready helper to require non-zero document pages before passing first-render checks, and verified the helper with its focused test file before rewiring the viewer retry path.
- Added a focused runtime helper test for cached PDF activation recovery so the viewer can distinguish a healthy cached iframe from a `pagesCount = 0` restored shell before deciding whether to rebuild.
- Added a focused file-version-history view-runtime test so the lazily loaded `VersionHistory` modal now explicitly covers its first-visible mount, reopen, file-switch, and hidden reset decisions instead of relying on an untested component watcher edge case.
- Extended the workspace snapshot action seam with injectable create/history handlers and verified that `createSnapshot()` now returns the downstream save-point result while allowing browser-driven manual creation to bypass the footer's label-prompt wait.
- Added a focused workspace-snapshot operations test that covers the no-file-changes manual-save path, ensuring the browser can create a local-only save point instead of silently returning `no-changes`.
- Added focused tests for the new hidden-history index and local save-point removal path, then wired snapshot runtime tests so file-history and workspace-save-point feeds explicitly cover local filtering after an entry has been deleted from Altals history surfaces.
- Added focused tests for the new reference-audit launcher seam plus a frontend-baseline audit that asserts the newly migrated editor/sidebar surfaces no longer contain raw form controls.
- Expanded the frontend-baseline audit and scoped lint/format coverage again so `FileTreeItem` plus the reference-import preview/merge dialogs are now locked against regressing back to raw form controls.
- Expanded the frontend-baseline audit and scoped lint/format coverage again so the global-library workbench and reference metadata editor now join the same no-raw-form-controls guardrail as the previously migrated editor/sidebar surfaces.
- Expanded the frontend-baseline audit and scoped lint/format coverage again so the library sidebar/inspector/reference-row surfaces now also sit behind the same no-raw-form-controls guardrail as the rest of the migrated library/editor/sidebar path.
- Expanded the frontend-baseline audit and scoped lint/format coverage again so `WorkspaceStarter`, `ExecutionResultCard`, both review bars, and `ResearchNoteCard` now also sit behind the same no-raw-form-controls guardrail as the previously migrated editor/library/sidebar path.
- Expanded the frontend-baseline audit and scoped lint/format coverage again so `AiLauncher`, `CitationPalette`, `ImageViewer`, and `AiWorkbenchSidebar` now also sit behind the same no-raw-form-controls guardrail as the previously migrated editor/library/sidebar path.
- Expanded the frontend-baseline audit again so `PdfViewer` now joins the same no-raw-form-controls guardrail, which means the audited editor/sidebar/library main path no longer contains template-level raw `button` / `input` / `select` / `textarea` usage outside shared primitives.
- Added a focused inline-style audit for the lighter viewer/helper surfaces so static status/tool chrome in `CsvEditor`, `DocumentPdfViewer`, `LatexPdfViewer`, `TypstPdfViewer`, `TypstNativePreview`, and `TextEditor` no longer regresses back to fixed inline style attributes.
- Expanded that inline-style audit again so `ReferenceList`, `EditorContextMenu`, and `NotebookEditor` also stay off template-level static inline style chrome for menus, shortcuts, and notebook status surfaces.
- Expanded the same audit one step further so `EditorPane` and `TabBar` also stay free of template-level static inline style chrome while allowing runtime-driven `:style` and renderer-generated output styling where layout or ANSI rendering still genuinely requires it.
- Added a focused ANSI runtime test plus expanded the inline-style audit again so `CellOutput` now also stays free of inline style strings, which means the current baselined editor/sidebar/library path has no remaining `style="..."` output outside approved dynamic `:style` usage.
- Corrected `TabBar` overflow handling to keep horizontal tab scrolling visible while explicitly suppressing vertical overflow, which removes the stray vertical scrollbar without deleting the intended left-right tab scrollbar.
- Tightened shell chrome geometry again by switching the editor tab strip to `border-box` sizing and matching sidebar chrome separators to the same border token, removing the 1px drift between sidebar top-strip rules and the tab-bar baseline.
- Embedded workspace sidebar views now suppress their own top divider when mounted under `SidebarChrome`, so the shell shows one aligned top separator instead of stacking a second line below the left sidebar toolbar.
- The left sidebar now renders file/reference utility actions inside the shared `SidebarChrome` trailing area and removes the old embedded `FileTree` / `ReferenceList` header row entirely, so workspace sidebars no longer consume a second top strip under the panel-switch chrome.
- The right sidebar `Backlinks` panel now also honors embedded shell mode and drops its legacy title row when mounted under `SidebarChrome`, so the visible top separator can align with the editor tab bar instead of sitting one row lower.
- Sidebar chrome now uses a denser 24px button footprint and reduced strip height, intentionally tightening the sidebars' secondary controls so their visual weight matches the compact editor tab row more closely.
- The AI workbench sidebar still has its own single-purpose header instead of shared `SidebarChrome`, but its row height and border geometry now match the compact shell baseline so the AI surface no longer stands out as a taller exception.
- `npm run lint` passes for the scoped frontend baseline surfaces.
- `npm run format:check` passes for the scoped frontend baseline files and docs.
- `node --test tests/workbenchChromeEntries.test.mjs tests/headerChromeGeometry.test.mjs tests/appShellLayout.test.mjs` passes.
- `node --test tests/shellResizeSignals.test.mjs tests/appShellLayout.test.mjs tests/headerChromeGeometry.test.mjs tests/workbenchChromeEntries.test.mjs` passes.
- `node --test tests/workbenchTaskLaunchers.test.mjs tests/aiLaunchBoundaryAudit.test.mjs tests/frontendBaselineAudit.test.mjs` passes.
- `node --test tests/*.test.mjs` passes.
- `npm run build` passes.
- Release-workflow tag handling was updated and validated with local git-state checks against the current `v1.0.1` tag/HEAD mismatch scenario plus a YAML syntax parse.
- Replaced the project-file search toggle with a persistent file-tree search field, then verified the slice with targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Tightened the persistent file-tree search styling to align it more closely with the reference-search field, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Tightened both the file-tree and reference-list search input typography again so the visible placeholder/input text now reads smaller and more consistent across the left sidebar chrome, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Unified sidebar typography across the main left/right workbench panels by introducing shared sidebar font tokens and applying them to file tree, references, AI recent chats, library sidebars, outline, and backlinks so section kickers, list items, search inputs, and supporting metadata now follow one clearer hierarchy, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Compacted the global library toolbar by turning sort/import into small square actions beside the search field, removed the redundant `Views` / `Tags` labels from the library sidebar, and tightened the file-tree/reference search field heights, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Tightened sidebar density one step further by adding shared compact row/input tokens, compressing file-tree rows, reference rows, library-sidebar items, the workspace footer action, and the global-library toolbar spacing so the left workbench surfaces now share a calmer, more consistent physical rhythm, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Moved the library tag-filter clear action out of the sidebar list area and into the shared left-sidebar top-right chrome, wiring the button to the existing selected-tag state so the library tags panel now follows the same utility-action placement as the workspace sidebar, then re-ran targeted ESLint, `node --test tests/*.test.mjs`, and `npm run build`.
- Added a dedicated right-sidebar document run panel for TeX / Typst compile workflows, rewired the document AI diagnose/fix actions to open that panel first, and changed the document workflow launcher seam to keep those runs in the document surface instead of defaulting into the AI workbench chat surface.
- Fixed the first document-run regression by restoring real hidden workflow prompt delivery, filtering hidden launch prompts out of the visible chat transcript, skipping synthetic workflow narration when deriving AI artifacts, preferring session-backed document-run results over workflow placeholder artifacts, and tightening the right-sidebar document-run button so it only appears for the currently active TeX / Typst document. Verified the slice with targeted ESLint, focused node tests for chat/workflow/artifact behavior, `node --test tests/*.test.mjs`, and `npm run build`.
- Fixed the next document-run regression by restoring the full TeX / Typst fixer preparation step on the in-place document workflow launch path, so AI diagnose/fix runs now bootstrap with compile-aware context and the fix path explicitly instructs the model to edit the source through workspace tools instead of only describing the patch. Verified with targeted ESLint, focused document-workflow runtime tests, `node --test tests/*.test.mjs`, and `npm run build`.
- Tightened the TeX / Typst in-place fix path again by propagating fix-task tool policy through session runtime config, requiring a tool-driven first step for fix sessions, and constraining those sessions to file-read/edit plus compile-verification tools so the model is pushed toward real source edits instead of prose-only repair advice. Verified with targeted ESLint, focused chat/runtime/document tests, `node --test tests/*.test.mjs`, and `npm run build`.
- Fixed the next in-place repair regression by syncing AI text-file writes back into the live editor buffer even in direct-apply mode, so a successful `edit_file` / `write_file` patch now updates the visible TeX / Typst document immediately instead of leaving the open editor stale until a later reload.
- Reworked the right-sidebar document-run panel into a sidebar-native layout with compact status blocks, condensed workflow metadata, shorter path display, and collapsed raw logs, replacing the previous full-card stacking that read like AI workbench content squeezed into a narrow inspector column.
- Reduced document-run sidebar toggle jank by only keeping right-sidebar pane content mounted while the inspector is open, limiting sidebar artifact history to the newest outputs, and lazily mounting raw compile logs only after explicit expansion instead of attaching large log DOM during every shell resize.
- Added a focused `DocumentWorkspaceTab` contract test that locks the v1 document workspace surface to a fixed split with preview-visibility-only configuration and no resize/drag affordance, then re-ran the document-workspace focused suite, `node --test tests/*.test.mjs`, and `npm run build`.
- Locked `DocumentWorkspaceTab` to the first document-workspace contract as a fixed two-pane shell with no resize props, drag handle, or draggable split affordance, then verified that contract with a focused audit test plus the full node test suite and build.


## Migration Notes

- This blueprint currently reflects the repository as it exists now, not the intended end-state architecture.
- The restored docs baseline should stay concise and truthful until deeper architectural seams land in code.
