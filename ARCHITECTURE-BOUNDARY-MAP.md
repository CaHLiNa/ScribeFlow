# ScribeFlow Architecture Boundary Map

> Snapshot date: 2026-05-18.
> Purpose: make current mixed responsibilities visible before deeper runtime/module cleanup.

## Target Layer Contract

| Layer | Owns | Must Not Own |
| --- | --- | --- |
| Vue components | UI rendering, form drafts, local interaction state, loading/error/empty presentation | Tauri calls, filesystem authority, persisted schema decisions, runtime execution policy |
| Composables | UI interaction helpers, component-level event wiring, and action workflow coordination through stores/services | Direct Tauri API imports, backend policy, persisted state normalization, DOM shell ownership |
| Pinia stores | Screen state, orchestration, loading/error lifecycle, calls into services | Filesystem validation, reference merge policy, runtime execution, persisted schema authority |
| `src/domains` | Pure display rules, sorting, labels, deterministic UI state derivation | Tauri calls, service/store imports, persistence, process or filesystem authority |
| `src/services` | Tauri/plugin bridge, native event subscription, DTO mapping | Long-lived business state, backend policy, duplicate frontend backend centers |
| `src-tauri/src` | Filesystem, workspace access, persistence, normalization, imports, runtime execution, plugins, security | UI rendering and transient screen layout state |

Canonical layer shorthand used in repository docs:

| Layer | Responsibility |
| --- | --- |
| Vue UI | render surfaces, receive props, emit user intent, show loading/error/empty states |
| JS bridge | `src/services` wraps Tauri commands, plugins, native events and DTO compatibility |
| Pinia coordination | `src/stores` owns screen state, orchestration, loading/error lifecycle and service calls |
| JS domains | `src/domains` owns pure presentation rules, labels, sorting and deterministic state derivation |
| Rust runtime | `src-tauri/src` owns filesystem, workspace state, references, runtime execution, persistence, plugins and security |

Allowed/disallowed examples:

- Allowed: `ReferenceDetailPanel.vue` maintains local draft fields and emits save intent; `src/stores/references.js` calls `referenceRuntime.applyMutation`; Rust validates, normalizes and persists the resulting reference.
- Disallowed: Vue components write normalized reference records directly.
- Allowed: a service wrapper invokes a Rust command such as `references_mutation_apply` and maps frontend camelCase DTO fields to the command payload.
- Disallowed: a service wrapper owns reference merge policy, workspace security, plugin host lifecycle, or persisted settings schema decisions.
- Allowed: a store performs optimistic UI updates only when Rust returns a normalized final state afterward.
- Disallowed: a store parses files, validates filesystem authority, executes LaTeX/Python runtime work, or becomes a replacement backend.

Command contract:

- Tauri command name, parameter shape, response JSON shape, store action contract, and persisted state shape are compatibility boundaries.
- Any command payload shape change must update Rust command handling, JS bridge DTO mapping, store call sites, and regression verification in the same commit.
- Existing command names should not be renamed during cleanup unless a dedicated compatibility phase is added.
- Compatibility shims must be explicit and scheduled for removal when they are not required by persisted data or stable bridge contracts.

## Editor Freeze

These files are frozen during global module reorganization unless a separate editor phase is explicitly approved:

- `src/editor/**`
- `src/components/editor/TextEditor.vue`
- `src/components/editor/EditorPane.vue`
- `src/components/editor/EditorTextRouteSurface.vue`
- `src/components/editor/EditorTextWorkspaceSurface.vue`
- `src/components/editor/PaneContainer.vue`
- `src/composables/useTextEditorBridges.js`
- `src/stores/editor.js`
- `src/services/editorPersistence.js`
- `src-tauri/src/editor_session_runtime.rs`

Allowed work around the editor boundary:

- Read frozen files to understand contracts.
- Preserve editor-facing props, events, store actions, and persistence payloads.
- Add external guards or docs that protect editor imports.

Blocked work:

- CodeMirror extension changes.
- Cursor, selection, reveal, scroll, fold, autocomplete, snippet, citation insertion, or text interaction changes.
- Editor saved session shape or event timing changes.

## Native Bridge Import Inventory

Current scan result: all direct `@tauri-apps/**` imports are inside `src/services/**`.

Service files with direct Tauri or plugin usage:

- `src/services/appDirs.js`
- `src/services/appUpdater.js`
- `src/services/documentOutline/runtime.js`
- `src/services/documentWorkflow/invokeBridge.js`
- `src/services/editorPersistence.js`
- `src/services/extensions/extensionArtifacts.js`
- `src/services/extensions/extensionCommands.js`
- `src/services/extensions/extensionHost.js`
- `src/services/extensions/extensionHostEvents.js`
- `src/services/extensions/extensionRegistry.js`
- `src/services/extensions/extensionTasks.js`
- `src/services/extensions/extensionViews.js`
- `src/services/extensions/extensionWindowUi.js`
- `src/services/externalLinks.js`
- `src/services/fileStoreIO.js`
- `src/services/fileTreeSystem.js`
- `src/services/i18nRuntime.js`
- `src/services/imagePreview.js`
- `src/services/latex/latexWorkshopSynctex.js`
- `src/services/latex/projectGraph.js`
- `src/services/latex/runtime.js`
- `src/services/latexPreferences.js`
- `src/services/localFileOpen.js`
- `src/services/markdown/runtimeBridge.js`
- `src/services/nativeClipboard.js`
- `src/services/nativeDialog.js`
- `src/services/nativeWindow.js`
- `src/services/pathStatus.js`
- `src/services/pdf/artifactPreview.js`
- `src/services/pythonPreferences.js`
- `src/services/pythonRuntime.js`
- `src/services/references/bibtexExport.js`
- `src/services/references/citationFormatter.js`
- `src/services/references/crossref.js`
- `src/services/references/pdfMetadata.js`
- `src/services/references/referenceAssets.js`
- `src/services/references/referenceImport.js`
- `src/services/references/referenceLibraryIO.js`
- `src/services/references/referenceRuntime.js`
- `src/services/references/zoteroSync.js`
- `src/services/transientOverlayBus.js`
- `src/services/workbenchDockPages.js`
- `src/services/workbenchLayout.js`
- `src/services/workspacePermissions.js`
- `src/services/workspacePreferences.js`
- `src/services/workspaceRecents.js`

Guard status:

- `scripts/check-ui-bridges.mjs` fails if any non-service frontend file imports Tauri APIs or Tauri plugins.
- `scripts/check-js-layer-boundaries.mjs` fails if any `src/domains/**` module imports service/store modules or Tauri APIs.

## Domain Boundary Debt

No `src/domains/**` file currently imports `src/services/**`, `src/stores/**`, or `@tauri-apps/**` directly.

## Service Inventory

Current snapshot: no `src/services/**/*.js` or `src/services/**/*.mjs` file exceeds the 150-line bridge-thinning review threshold.

## Large Vue Component Inventory

Components over 500 lines:

| File | Lines | Classification |
| --- | ---: | --- |
| `src/components/editor/CitationPalette.vue` | 714 | Editor-adjacent UI; avoid during global cleanup unless citation UI phase is opened. |
| `src/components/editor/EditorPane.vue` | 1085 | Frozen editor file. |
| `src/components/editor/MarkdownPreview.vue` | 859 | Preview UI with document runtime wiring; Phase 6/8 candidate. |
| `src/components/editor/PdfEmbedDocumentSurface.vue` | 2030 | PDF/document runtime UI; Phase 8 extracted toolbar/search chrome while retaining embedpdf runtime authority. |
| `src/components/editor/PdfEmbedToolbar.vue` | 531 | PDF toolbar/search presentation; emits zoom/page/search/spread intent to parent. |
| `src/components/editor/TextEditor.vue` | 1961 | Frozen editor file. |
| `src/components/editor/WorkspaceStarter.vue` | 73 | Workspace starter coordinator; Phase 8 extracted empty-state hero and template grid presentation. |
| `src/components/editor/WorkspaceStarterEmptyState.vue` | 414 | No-workspace hero presentation; emits open-folder intent. |
| `src/components/editor/WorkspaceTemplateGrid.vue` | 310 | Current-workspace template card presentation; emits create-template intent. |
| `src/components/extensions/ExtensionSidebarPanel.vue` | 497 | Extension panel orchestration shell; header and per-view rendering now live in child presentation components. |
| `src/components/extensions/ExtensionSidebarHeader.vue` | 84 | Extension sidebar header presentation and refresh/action chrome. |
| `src/components/extensions/ExtensionSidebarViewSection.vue` | 232 | Extension view section presentation for status, results, preview, and tree root. |
| `src/components/extensions/ExtensionTaskPanel.vue` | 263 | Extension task timeline/store orchestration and expansion state; row/detail/result/footer chrome moved into child presentation components. |
| `src/components/extensions/ExtensionTaskRow.vue` | 424 | Extension task row presentation for facts, details, progress, result preview, and quick actions. |
| `src/components/extensions/ExtensionTaskHistoryFooter.vue` | 68 | Extension truncated-history footer presentation and expand/collapse affordance. |
| `src/components/layout/WorkbenchRail.vue` | 378 | Layout UI; native fullscreen sync, window dragging, outside-click lifecycle, and emitted shell intent stay in the coordinator while title/menu chrome lives in `WorkbenchRailTitleArea.vue`. |
| `src/components/layout/WorkbenchRailTitleArea.vue` | 304 | Workbench rail center title slot, reference mode menu, inline document title, and title/menu scoped presentation. |
| `src/components/layout/AppShellFrame.vue` | 391 | App shell frame presentation; owns topbar/left-sidebar/main-card/resize slot DOM and scoped shell styles while emitting layout/workbench intent to `App.vue`. |
| `src/components/panel/ReferenceDetailPanel.vue` | 466 | Reference detail draft/save orchestration; presentation, pure draft helpers, PDF action workflow, and token action workflow now live outside the coordinator. |
| `src/components/panel/ReferenceDetailContentSection.vue` | 132 | Reference abstract and notes disclosure presentation. |
| `src/components/panel/ReferenceDetailHero.vue` | 164 | Reference detail title/save hero presentation. |
| `src/components/panel/ReferenceDetailMetadataSection.vue` | 391 | Reference metadata, tags, collections, and file action presentation. |
| `src/components/references/ReferenceLibraryWorkbench.vue` | 372 | Reference workbench coordinator; main-list/detail-dock presentation, deterministic workbench helpers, context-menu presentation groups, and action side-effect workflows now live outside the coordinator. |
| `src/composables/references/useReferenceLibraryActions.js` | 339 | Reference action workflow composable; owns native import/export dialogs, clipboard copy, toast/status feedback, context-menu action binding, and store action dispatch for reference library actions. |
| `src/components/references/ReferenceLibraryDetailDock.vue` | 135 | Reference workbench detail dock presentation for inline dock frame, tabbar, active page render slot, empty state, and scoped tab styles. |
| `src/components/references/ReferenceLibraryMain.vue` | 105 | Reference library toolbar, status, empty state, and table composition presentation; emits user intent to the workbench coordinator. |
| `src/components/references/ReferenceLibraryTable.vue` | 237 | Reference library table presentation and sort header events. |
| `src/components/references/ReferenceLibraryToolbar.vue` | 131 | Reference library toolbar presentation. |
| `src/composables/references/useReferenceDetailActions.js` | 65 | Reference detail PDF action workflow composable; owns preview/open/reveal/attach side effects through stores/services without draft/save or DOM authority. |
| `src/composables/references/useReferenceDetailTokenActions.js` | 103 | Reference detail token action workflow composable; owns tag input, tag removal, collection removal, and label resolution through callback-based save wiring without store/native authority. |
| `src/components/settings/Settings.vue` | 51 | Settings section coordinator; active section routing stays domain-derived while shell/content chrome moved into `SettingsSurface.vue`. |
| `src/components/settings/SettingsSurface.vue` | 261 | Settings surface/header/content presentation plus settings-wide row/group/control styling. |
| `src/components/settings/SettingsExtensions.vue` | 382 | Extension settings shell; Phase 8 extracted list/options UI, pure settings grouping, secure setting draft derivation, and child scoped style ownership. |
| `src/components/settings/SettingsExtensionList.vue` | 324 | Extension loaded-list presentation and scoped card/header/control styling. |
| `src/components/settings/SettingsExtensionOptions.vue` | 352 | Extension settings/action form presentation and scoped option/action control styling. |
| `src/components/sidebar/FileTree.vue` | 455 | File tree coordinator; header/footer/body/overlay chrome, deterministic presentation helpers, and action side-effect workflows now live outside the coordinator. |
| `src/composables/files/useFileTreeActions.js` | 299 | File tree action workflow composable; owns inline create/rename/duplicate/delete/reveal/document-dock side effects and file/workspace/editor store dispatch. |
| `src/components/sidebar/FileTreeBody.vue` | 196 | File tree scroll body presentation for virtual rows, root inline create, empty state, and drop indicator; exposes the real scroll container to parent orchestration. |
| `src/components/sidebar/FileTreeFooter.vue` | 117 | File tree footer controls. |
| `src/components/sidebar/FileTreeHeader.vue` | 94 | File tree header controls. |
| `src/components/sidebar/FileTreeNewMenu.vue` | 93 | File tree document-template create menu. |
| `src/components/sidebar/FileTreeOverlays.vue` | 101 | File tree overlay presentation for context menu, workspace menu, new menu, and drag ghost; exposes menu elements for parent positioning/listener orchestration. |
| `src/components/sidebar/FileTreeWorkspaceMenu.vue` | 108 | File tree workspace actions menu. |
| `src/App.vue` | 431 | App shell coordinator; store/workspace/extension/editor orchestration stays here while shell frame DOM and scoped styles live in `AppShellFrame.vue`. |

## Store Responsibility Snapshot

| Store | Lines | Current role | Boundary risk |
| --- | ---: | --- | --- |
| `src/stores/documentWorkflow.js` | 323 | Document workflow UI state and runtime orchestration | Needs store/domain/service separation after runtime contracts settle. |
| `src/stores/editor.js` | 596 | Frozen editor shell/session state | Do not edit during this reorganization. |
| `src/stores/extensionWindowUi.js` | 81 | Extension prompt window UI state | Low; keep UI-only. |
| `src/stores/extensions.js` | 1165 | Extension registry, host state, tasks, prompts, views, commands | Medium; Phase 7 extracted deterministic presentation/state helpers and kept host authority in Rust. |
| `src/stores/files.js` | 933 | File tree, watcher lifecycle calls, mutation orchestration, draft files | High; Phase 3 should keep path/mutation authority Rust-owned and store UI-only orchestration. |
| `src/stores/latex.js` | 907 | LaTeX preferences, build scheduling, compile state, logs | High; Phase 6 should keep compile planning/execution Rust-owned. |
| `src/stores/links.js` | 215 | Markdown heading/link index and backlinks | Medium; decide whether parsing/indexing is UI helper or Rust document intelligence. |
| `src/stores/python.js` | 225 | Python preferences, environment error state, and compile/run state | Medium; runtime resolution should remain Rust-owned. |
| `src/stores/references.js` | 980 | Reference selection, collections, import, persistence, mutation orchestration | High; Phase 5 should keep normalization/merge/persistence Rust-owned. |
| `src/stores/toast.js` | 47 | Toast UI | Low. |
| `src/stores/utils.js` | 9 | Store utilities | Low. |
| `src/stores/uxStatus.js` | 77 | Status/toast UI | Low. |
| `src/stores/workspace.js` | 688 | Workspace lifecycle, preferences, layout, settings, shell state | High; Phase 3/4 should keep lifecycle and persisted settings Rust-owned. |

## Primary Store Responsibility Notes

`src/stores/files.js` owns the frontend file tree screen state: tree cache, expanded directories, draft file cache, transient created-file bookkeeping, loading/reconcile flags, watcher lifecycle coordination, and user-facing file operation feedback for failed file operations. It may call `src/services/fileStoreIO.js`, `src/services/fileTreeSystem.js`, and pure `src/domains/files/**` helpers, but path authorization, mutation acceptance, hidden-file policy enforcement, and persisted workspace tree state belong to Rust.

`src/stores/workspace.js` owns app shell and workspace UI coordination: active workspace path/id metadata, settings surface state, dock/sidebar layout state, hydrated preference snapshots, recent-workspace lifecycle state, and applying normalized preference results to DOM-facing helpers. It may orchestrate open/close/bootstrap flows through workspace services, but persisted defaults, lifecycle pruning, workspace identity, config paths, and preference normalization remain Rust/service contract authority.

`src/stores/references.js` owns reference library UI coordination: current filters, selected reference, collection/tag selection state, import/export/loading flags, reference dock PDF state, citation style selection, user-visible async reference/Zotero error state, and applying normalized library snapshots returned from backend services. It may call reference services and update UI state from returned snapshots, but record normalization, duplicate/merge policy, document-reference pruning, asset storage, Zotero mutation semantics, and library persistence rules remain backend/service authority.

`src/stores/latex.js` owns LaTeX-facing UI state: preference hydration, selected compiler/engine options, compile progress/status, per-file diagnostics presented to the UI, terminal log dispatch, stream listener setup, and PDF artifact refresh coordination. It may resolve compile requests through `src/services/latex/**` and update UI state from returned DTOs, but compile target planning, process execution, diagnostics extraction, tool discovery, SyncTeX parsing, and persisted preference normalization remain Rust/service authority.

`src/stores/python.js` owns Python-facing UI state: interpreter preference hydration, detected interpreter display state, available interpreter list, checking flags, user-visible preference/runtime error state, and per-file compile/run result state. It may call Python runtime/preference services and present their adapted DTOs, but interpreter discovery, runtime execution, command normalization, and persisted preference schema remain Rust/service authority.

`src/stores/documentWorkflow.js` owns cross-document workflow coordination for the UI: preview preferences, session/preview bindings, workspace preview visibility, workflow UI state caches, artifact path state, and actions that bridge editor, file, LaTeX, Python, reference, and workspace stores. It may create store-local runtime coordinators and call document workflow services, but document kind policy, build/preview resolution DTOs, persisted session schema, and native/open-file effects must stay in services or Rust-backed contracts.

`src/stores/extensions.js` owns extension platform UI coordination: registry/task/view state, enabled extension ids, extension settings snapshots, runtime registry presentation state, host summary display, registry/task loading and error state, deferred view requests, prompt recovery state, command/capability dispatch orchestration, and sidebar target selection. Deterministic menu/view/task shaping belongs in `src/domains/extensions/**`; host lifecycle, task execution, command invocation, artifact access, and settings persistence remain service/Rust authority.

`src/stores/links.js` owns the current frontend Markdown link index used by UI panels: forward links, backlinks, heading lists, file-name map, scan generation, and incremental update triggers after file changes. It may read Markdown content through services and use pure file/domain helpers, but large-scale parsing policy, workspace file authority, and future document-intelligence indexing should move to Rust if the feature becomes more than a UI helper.

`src/stores/uxStatus.js` owns transient global status presentation: the current status entry, auto-clear timer, one-shot cooldown tracking, and convenience helpers for success/warning/error messages. It must remain UI-only and should not call bridge services or encode backend policy.

## Workspace/File Authority Cleanup Log

- 2026-05-02: `src/stores/files.js` no longer decides whether a Save Draft As target path is inside the active workspace with frontend string-prefix checks. The selected path is sent through the normal `workspace_write_text_file` bridge, and Rust `ensure_allowed_mutation_path` remains the authority for accepting or rejecting the mutation. The store only reports the failed save as UI feedback.
- 2026-05-03: File creation/mutation runtime callbacks no longer rely on `console.error` for duplicate, create-folder, copy, rename, move, delete, or save failures. `src/stores/files.js` now routes those failures through the existing toast/status path via `formatFileError`, while Rust remains the mutation acceptance authority.
- 2026-05-02: `src/services/workspaceRecents.js` no longer carries stale frontend recent-workspace normalization or record-opened policy. Lifecycle normalization, pruning, record-opened ordering, and max recent count remain owned by `src-tauri/src/workspace_lifecycle.rs` and its Rust tests.
- 2026-05-18: `FileTree.vue` no longer owns deterministic workspace label fallback, recent-workspace display slicing, menu style math, typed-file candidate naming, extension append rules, or rename-state object construction inline. `src/domains/files/fileTreePresentation.js` now owns those pure presentation rules, while the component keeps DOM rect reads, event listener lifecycle, Pinia orchestration, `workspacePathExists` checks, and filesystem mutation calls.
- 2026-05-18: File tree body component ownership is split too: `FileTree.vue` keeps keyboard, drag/drop, context-menu, mutation, and store orchestration, while `FileTreeBody.vue` owns the scroll container DOM, virtual row rendering, root inline-create input, external drop/empty states, and body scoped styles. `scripts/probe-file-tree-body-style-ownership.mjs` guards that the body stays presentation-only while still handing the real scroll element back to parent orchestration.
- 2026-05-18: File tree overlay component ownership is split too: `FileTree.vue` keeps context/workspace/new-menu state, menu positioning, document listeners, file mutation, workspace/editor orchestration, and drag state, while `FileTreeOverlays.vue` owns context-menu, workspace-menu, new-menu, and drag-ghost composition. `scripts/probe-file-tree-overlay-style-ownership.mjs` guards that overlay presentation stays out of store/service authority and only exposes menu DOM accessors to the coordinator.
- 2026-05-18: File tree action workflow ownership is split from the coordinator. `FileTree.vue` keeps menu positioning, overlay lifecycle, virtual row wiring, keyboard dispatch, and drag/drop wiring, while `src/composables/files/useFileTreeActions.js` owns inline create/rename/duplicate/delete/reveal/document-dock side effects and file/workspace/editor store dispatch. `scripts/probe-file-tree-actions-boundary.mjs` guards that action side effects stay out of the file-tree component and that the composable does not take over DOM composition, overlay positioning, row virtualization, or drag authority.

## Preferences/Settings Authority Cleanup Log

- 2026-05-02: `src/stores/workspace.js` now sends persisted setting patch values to `workspace_preferences_save` without pre-normalizing wrap, booleans, file tree modes, PDF modes, citation settings, or locale in JS. Rust `workspace_preferences.rs` remains the persisted schema/default/normalization authority, and the store consumes the normalized preferences returned by Rust. `src/services/workspacePreferences.js` keeps DOM/UI helpers for font, theme, and PDF preview display normalization only.
- 2026-05-03: Workspace preference defaults, font presets, system-font encoding, PDF viewer display normalization, and font-stack helpers moved from `src/services/workspacePreferences.js` into `src/domains/settings/workspacePreferencePresentation.js`. DOM font variable side effects now live in `src/services/workspaceFonts.js`, theme class/listener side effects live in `src/services/workspaceTheme.js`, and `workspacePreferences.js` stays below the 150-line review threshold as a Tauri preference/workbench bridge plus system-font listing surface.
- 2026-05-18: Settings section definitions and route fallback policy moved from component-local `src/components/settings/settingsSections.js` into `src/domains/settings/settingsSections.js`. `Settings.vue` and `SettingsSidebar.vue` now derive section labels/active state through the domain helper while keeping async component registry and Tabler icon registry in Vue. `src/stores/workspace.js` also uses the same domain fallback so legacy `environment` settings actions resolve to the canonical `system` section instead of relying on UI fallback.
- 2026-05-18: Settings surface component ownership is split too: `Settings.vue` now keeps only active section orchestration and async component selection, while `SettingsSurface.vue` owns the guarded surface root, header/content slots, and settings-wide row/group/control styling. The previous duplicate global settings style blocks were collapsed into a single settings-wide style block, and `scripts/probe-settings-surface-style-ownership.mjs` guards that shell/style ownership stays out of the coordinator.

## Reference Authority Cleanup Log

- 2026-05-18: First Rust-first mutation/import slice landed: `references_mutation_apply` now returns import/add outcome payloads with selected reference and preferred selection, `src/stores/references.js` consumes that Rust `mutation.result` directly, and the import/add result helper trio was removed from `src/domains/references/referenceStoreState.js`. `scripts/probe-reference-store-state-contract.mjs`, `scripts/probe-reference-store-import-workflow-contract.mjs`, and Rust mutation tests guard that JS no longer reconstructs import/add mutation outcomes.
- 2026-05-18: The next reference mutation outcome slice moved update/remove/collection/document-reference/toggle result handling back to Rust. `references_mutation_apply` now accepts `selectedReferenceId` and returns preferred-selection hints plus changed/removed/toggled/collection outcomes; `src/stores/references.js` consumes those Rust outcomes directly, and the corresponding mutation result/commit helpers were removed from `src/domains/references/referenceStoreState.js`. Focused store probes and Rust mutation tests guard against JS result reconstruction returning.
- 2026-05-18: Citation formatting target lookup moved back to Rust. `src/stores/references.js` now calls the thin `formatReferenceCitationById` bridge with `referenceId`, the current references snapshot, and workspace path; `src-tauri/src/references_citation.rs` resolves the target reference, returns an empty string for missing ids to preserve prior UI semantics, and renders from the Rust-selected record. `buildReferenceCitationFormatTargetState` was removed from `referenceStoreState.js`, and focused bridge/store probes plus Rust citation tests guard that JS does not regain the target lookup.
- 2026-05-18: Added `REFERENCE-AUTHORITY-RUSTIFICATION-CHECKPOINT.md` as the reference authority route-correction checkpoint. `src/domains/references/referenceStoreState.js` is now treated as an inventory to split, not the default destination for new reference rules: UI-only dock/sidebar helpers may remain in JS, transitional DTO/default helpers should shrink, and mutation/import/citation/PDF asset/Zotero/persisted snapshot authority should move back to Rust runtime contracts.
- 2026-05-02: `src/services/references/referenceLibraryIO.js` no longer re-normalizes reference library snapshots in JavaScript after Rust `references_snapshot_normalize`, `references_library_load_workspace`, or `references_library_write` returns. Snapshot shape, document reference selection pruning, collection/tag registry cleanup, record normalization, rating removal, and library persistence normalization remain owned by `src-tauri/src/references_snapshot.rs` and `src-tauri/src/references_backend.rs`; the JS service now only bridges commands and provides an empty fallback when no storage root is available.
- 2026-05-02: `src/stores/references.js` no longer filters, deduplicates, or clears `documentReferenceSelections` directly when a document's reference ids change or when applying a Rust-loaded library snapshot. The store now dispatches `setDocumentReferenceIds` through `references_mutation_apply`, and `src-tauri/src/references_mutation.rs` plus `src-tauri/src/references_snapshot.rs` own the mutation, id pruning, deduplication, and empty-selection cleanup.
- 2026-05-02: `src/services/references/citationFormatter.js` no longer imports the workspace Pinia store to discover workspace path. Workspace context is passed by callers as a DTO field, keeping citation services as Rust bridge wrappers around `references_citation_render` instead of hidden store-aware orchestration.
- 2026-05-18: Reference workbench detail dock ownership is now split at the Vue component boundary. `ReferenceLibraryWorkbench.vue` keeps selection, page activation, tab fallback, resize, import/export, context-menu, and store orchestration, while `ReferenceLibraryDetailDock.vue` owns the inline dock frame, tabbar, active page dynamic component slot, empty state, and scoped tab styles. `scripts/probe-reference-workbench-detail-dock-style-ownership.mjs` guards that the detail dock stays presentation-only and out of store/service authority.
- 2026-05-18: Reference workbench main-list ownership is now split too. `ReferenceLibraryWorkbench.vue` keeps import/export, selected-reference, sort, context-menu, dock, and store orchestration, while `ReferenceLibraryMain.vue` owns toolbar/status/empty/table composition and main-list scoped styles. `scripts/probe-reference-workbench-main-style-ownership.mjs` guards that the main list stays presentation-only and does not import stores or native dialog services.
- 2026-05-18: Reference action workflow ownership is now split from the workbench coordinator. `ReferenceLibraryWorkbench.vue` keeps selection, reference dock page activation, resize/layout reconciliation, and shell composition, while `src/composables/references/useReferenceLibraryActions.js` owns native import/export dialogs, clipboard copy, toast/status feedback, context-menu action binding, and reference store action dispatch. `scripts/probe-reference-library-actions-boundary.mjs` guards that action side effects stay out of the workbench component and that the composable does not take over dock/resize or DOM composition authority.
- 2026-05-03: Reference removal still commits the local library snapshot first, but best-effort Zotero remote delete failures are no longer swallowed. `src/services/references/zoteroSync.js` propagates delete invoke failures, `src/stores/references.js` records them in `zoteroMutationError`, and `ReferenceLibraryWorkbench.vue` surfaces them through the existing reference workbench status area.
- 2026-05-18: PDF reference import no longer performs duplicate add-or-attach policy in `src/stores/references.js`. The store asks Rust `references_mutation_apply` for `importPdfReference`, lets `src-tauri/src/references_mutation.rs` choose the canonical new-or-duplicate reference id, then stores the PDF asset against that canonical record and writes the normalized update through the existing `updateReference` mutation. `scripts/probe-reference-pdf-import-authority-contract.mjs` guards that the store does not call the legacy duplicate/merge service path for PDF import.
- 2026-05-18: Reference detail draft snapshot creation, editable field list, authors/tags/collection normalization, hero meta derivation, PDF action-target shaping, draft comparison, and dirty update derivation moved from `ReferenceDetailPanel.vue` into `src/domains/references/referenceDetailDraft.js`. The panel still owns local draft lifecycle, blur/save timing, queued store updates, and toast save-error presentation.
- 2026-05-18: Reference detail PDF action workflow ownership is now split from the detail coordinator. `ReferenceDetailPanel.vue` receives PDF action state and handlers from `src/composables/references/useReferenceDetailActions.js`, while the composable owns PDF preview emission, editor open, native reveal, attach dialog, and reference store dispatch through existing store/service boundaries. `scripts/probe-reference-detail-actions-boundary.mjs` guards that action side effects stay out of the detail panel and that the composable does not take over draft/save or DOM authority.
- 2026-05-18: Reference detail token workflow ownership is now split from the detail coordinator too. `ReferenceDetailPanel.vue` keeps draft lifecycle, save queue, and update callback authority, while `src/composables/references/useReferenceDetailTokenActions.js` owns tag input, comma/blur add behavior, tag removal, collection removal, and collection label resolution. `scripts/probe-reference-detail-token-actions-boundary.mjs` guards that token workflow stays out of the detail panel and that the composable does not import stores, native services, DOM components, or own the save queue.
- 2026-05-18: Reference store selection/query fallback helpers moved from `src/stores/references.js` into `src/domains/references/referenceStoreState.js`. Pinia still owns async service orchestration, workspace-aware storage-root fallback, loading/error lifecycle, and snapshot application, while deterministic collection/tag matching, document-reference selection shape fallback, and default resolved-query state now live in a pure domain module. `scripts/probe-reference-store-state-contract.mjs` guards both the helper behavior and the store/domain boundary.
- 2026-05-18: Reference store imported-reference commit workflow now uses shared `commitImportedReferences()` orchestration. `importParsedReferences()` and `importResolvedReferenceText()` no longer duplicate selected-reference result mapping or snapshot commit wiring inline; Rust `references_mutation_apply` remains the `mergeImportedReferences` merge/duplicate policy authority. `scripts/probe-reference-store-import-workflow-contract.mjs` guards that this store helper stays orchestration-only and does not regain local merge, dedupe, or persistence policy.
- 2026-05-18: Reference store document-reference lookup and search rules moved into `src/domains/references/referenceStoreState.js`. Store methods such as `getByKey()`, `documentReferencesForTex()`, `getDocumentReferenceByKey()`, `isReferenceSelectedForTex()`, `searchAvailableReferencesForDocument()`, and `searchRefs()` keep their public API for editor/citation surfaces, but deterministic selected-id resolution, citation-key matching, free-text search, and available-reference filtering are now pure domain helpers. `scripts/probe-reference-store-state-contract.mjs` guards both the domain behavior and that the store does not reintroduce inline selection/search rules.
- 2026-05-18: Reference store mutation snapshot commit wiring now uses shared `commitReferenceMutationSnapshot()` orchestration. Collection, document-reference, reference-record, and PDF-asset update actions no longer duplicate `mutation.snapshot` fallback or `commitLibrarySnapshot` option wiring inline; Rust `references_mutation_apply` remains the mutation, merge, dedupe, and persistence-policy authority. `scripts/probe-reference-store-mutation-commit-contract.mjs` guards that the helper stays orchestration-only.
- 2026-05-18: Reference export target resolution moved back to Rust. `exportBibTeXAsync()`, `writeBibTeXExportFile()`, and `writeReferenceJsonExportFile()` keep their public store API for reference workbench actions, but `src/services/references/bibtexExport.js` now sends `referenceIds`/`referenceId` and the current snapshot to `references_import.rs`, which owns ordered export-list filtering, JSON target validation, missing-id behavior, and exported-count reporting. `resolveReferencesForExport` and `buildReferenceJsonExportTargetState` were removed from `referenceStoreState.js`, and `scripts/probe-reference-store-export-workflow-contract.mjs` guards that JS does not regain export selection rules.
- 2026-05-18: Reference PDF asset attach/rename target resolution moved back to Rust. `attachReferencePdf()` and `renameReferencePdfAsset()` now pass the current references snapshot plus `referenceId` through `src/services/references/referenceAssets.js`, while `src-tauri/src/references_backend.rs` resolves the target reference, preserves missing-target `Reference not found` semantics, and performs the filesystem asset store/rename. `buildReferencePdfAssetTargetState` and `buildReferencePdfAssetResultState` were removed from `referenceStoreState.js`, and `scripts/probe-reference-store-pdf-asset-workflow-contract.mjs` is part of `npm run verify`.
- 2026-05-18: Reference PDF import target/result shaping moved back to Rust. `references_mutation_apply(importPdfReference)` now returns the imported snapshot, selected reference id, selected reference payload and preferred selection; `importReferencePdf()` passes that snapshot plus selected id to `references_asset_store`, letting Rust resolve the asset target before the update mutation. `buildReferencePdfImportTargetState` and `buildReferencePdfImportResultState` were removed from `referenceStoreState.js`, and `scripts/probe-reference-store-pdf-import-workflow-contract.mjs` is part of `npm run verify`.
- 2026-05-18: Reference Zotero sync skipped/success result classification moved back to Rust. `references_zotero_sync_persist_with_account` now returns frontend-ready `skipped`, `zoteroSyncStatus`, `zoteroSyncLastSyncTime`, `counts`, `snapshot`, and `selectedReferenceId` fields while retaining legacy count fields; `syncZoteroNow()` only applies snapshots and assigns the returned state. `buildReferenceZoteroSyncResultState` was removed from `referenceStoreState.js`, and `scripts/probe-reference-store-zotero-sync-workflow-contract.mjs` is part of `npm run verify`.
- 2026-05-18: Reference metadata refresh target lookup moved back to Rust. `refreshReferenceMetadata()` now passes the current references snapshot plus `referenceId` through `src/services/references/crossref.js`, while `src-tauri/src/references_runtime.rs` resolves the target reference, keeps missing-target `null` semantics, and performs Crossref/DOI refresh against the Rust-selected record. `buildReferenceMetadataRefreshTargetState` was removed from `referenceStoreState.js`, and `scripts/probe-reference-metadata-rust-normalization.mjs` plus `scripts/probe-reference-store-state-contract.mjs` guard the boundary.
- 2026-05-18: Reference removal target lookup and Zotero delete side-effect gating moved back to Rust. `removeReference()` now passes raw `referenceId` to `references_mutation_apply`; `src-tauri/src/references_mutation.rs` resolves the removed reference, returns `removedReference`, `zoteroDeleteReference`, removed flag and preferred selection, and JS only invokes Zotero delete for Rust-returned delete targets. `buildReferenceRemoveTargetState` was removed from `referenceStoreState.js`, and `scripts/probe-reference-store-state-contract.mjs` plus `scripts/probe-reference-store-mutation-commit-contract.mjs` guard that JS does not regain target lookup or `_pushedByApp`/`_zoteroKey` gating.
- 2026-05-18: Reference sidebar/sort selection validity moved back to Rust query. `setSelectedSection()`, `setSelectedSource()`, `setSelectedCollection()`, `setSelectedTag()`, and `setSortKey()` now store raw user intent, clear incompatible UI filters, and call `references_query_resolve`; `src-tauri/src/references_query.rs` returns the canonical section/source/collection/tag/sort keys and selected reference. The old JS sidebar/sort selection helper exports were removed, and `scripts/probe-reference-store-state-contract.mjs` guards that the store no longer pre-validates selection intent before Rust query normalization.
- 2026-05-18: Reference document-reference mutation derivation moved back to Rust. `setDocumentReferenceIds()`, `addDocumentReference()`, and `removeDocumentReference()` now pass raw TeX path/reference id intent to `references_mutation_apply`; `src-tauri/src/references_mutation.rs` owns path normalization, non-array id fallback, valid-reference pruning, dedupe, add/remove duplicate guards, next-id-list calculation and `changed` gating. `buildDocumentReferenceIdsMutationState`, `buildAddDocumentReferenceMutationState`, and `buildRemoveDocumentReferenceMutationState` were removed from `referenceStoreState.js`; store probes guard that JS does not regain document-reference mutation derivation.
- 2026-05-18: Reference import input preflight moved back to Rust. `commitImportedReferences()` now sends raw imported payload intent to `references_mutation_apply(mergeImportedReferences)`; `src-tauri/src/references_mutation.rs` treats non-array or empty imported payloads as an empty import, returns `emptyImport` plus the empty result shape, and JS skips snapshot commit when Rust reports that outcome. `buildReferenceImportInputState` and `buildReferenceEmptyImportResult` were removed from `referenceStoreState.js`; import workflow probes guard that JS does not regain empty-import/result reconstruction.
- 2026-05-18: Reference query target lookup moved back to Rust. `references_query_resolve` now accepts `documentReferenceSelections` and returns selected reference/collection/tag targets, library lookup maps, Rust-built search indexes, and per-document selected/available reference DTOs. `src/stores/references.js` keeps the existing synchronous editor/citation API but reads from `resolvedQueryState`; `referenceStoreState.js` no longer scans library arrays for key/id/document-reference lookup or constructs search haystacks. `scripts/probe-reference-query-rust-normalization.mjs` and `scripts/probe-reference-store-state-contract.mjs` guard the query DTO boundary.

## Document Runtime Cleanup Log

- 2026-05-02: `src/stores/python.js` no longer normalizes raw Python runtime command DTOs itself. `src/services/pythonRuntime.js` now adapts `python_runtime_list`, `python_runtime_detect`, and `python_runtime_compile` responses into stable frontend DTOs, while Rust `src-tauri/src/python_runtime.rs` remains the runtime discovery and execution authority and the Pinia store keeps compile UI state only.
- 2026-05-03: Python environment settings now use pure presentation helpers in `src/domains/settings/pythonEnvironmentPresentation.js` for interpreter select options and diagnostics labels. `src/stores/python.js` records preference/runtime discovery failures in store state, and `SettingsEnvironment.vue` displays that state inline instead of swallowing initial environment-load failures.
- 2026-05-03: LaTeX compile execution DTO normalization moved from `src/services/latex/runtime.js` into pure domain helper `src/domains/latex/latexCompileResult.js`. The LaTeX runtime service now stays below the 150-line review threshold and remains focused on Tauri invoke/listen bridging while Rust keeps compile execution authority.
- 2026-05-03: LaTeX preview source-selection matching moved from `src/services/latex/previewSync.js` into pure domain helper `src/domains/latex/latexPreviewSelection.js`. The preview sync service now stays below the 150-line review threshold and focuses on SyncTeX target resolution, editor view waiting, and source reveal side effects.
- 2026-05-03: LaTeX document workflow presentation helpers moved from `src/services/documentWorkflow/adapters/latex.js` into pure domain helper `src/domains/document/latexWorkflowPresentation.js`. The adapter now stays below the 150-line review threshold and focuses on workflow wiring, compile readiness delegation, artifact path fallback, and problem aggregation while status text, problem DTO shaping, and workflow UI state presentation live outside the service layer.
- 2026-05-02: `src/services/latex/runtime.js` now normalizes `latex_runtime_compile_execute` responses into a stable bridge DTO with camelCase aliases while preserving Rust result fields. `src/stores/latex.js` consumes the adapted compile result for PDF refresh metadata and keeps compile UI orchestration, with compile execution and diagnostics still owned by Rust.
- 2026-05-02: Frontend PDF SyncTeX no longer reads or parses `.synctex` content through the removed LaTeXWorkshop JS fallback. `src/services/pdf/artifactPreview.js` now delegates forward/backward SyncTeX to Rust commands only, and `src-tauri/src/latex.rs` owns CLI execution plus parser fallback for SyncTeX files under the workspace scope.
- 2026-05-02: `src/domains/document/documentWorkflowResolvedStateRuntime.js` was split so pure resolved-state cache keys live in `src/domains/document/documentWorkflowResolvedStateKeys.js`, while Rust-backed Markdown/workflow/preview resolution calls and Pinia inflight cache coordination live in `src/stores/documentWorkflowResolvedStateActions.js`.
- 2026-05-02: Document workflow action execution and build operation orchestration moved from `src/domains/document` into `src/stores/documentWorkflowActionRuntime.js` and `src/stores/documentWorkflowBuildOperationRuntime.js`, keeping Rust-backed action resolution, editor save-before-build, and store mutation calls outside pure domain modules.
- 2026-05-02: Document workflow controller orchestration moved from `src/domains/document/documentWorkflowRuntime.js` to `src/stores/documentWorkflowRuntime.js`, so Rust controller invocation and editor pane mutation no longer live in the pure domain layer.
- 2026-05-02: Document workflow build context orchestration moved from `src/domains/document/documentWorkflowBuildRuntime.js` to `src/stores/documentWorkflowBuildRuntime.js`; the pure status-tone helper remains in `src/domains/document/documentWorkflowStatusTone.js`.
- 2026-05-02: Document workflow session persistence, preview binding mutation, LaTeX artifact reconciliation, and workspace preview request state moved from `src/domains/document/documentWorkflowSessionRuntime.js` to `src/stores/documentWorkflowSessionRuntime.js`. After this move, non-editor `src/domains/document/**` modules no longer import services or stores.
- 2026-05-03: Document workflow preview/workflow UI state request derivation moved from `src/stores/documentWorkflowBuildRuntime.js` into `src/domains/document/documentWorkflowBuildStateRequests.js`. The store runtime now keeps adapter resolution, store context assembly, and cache orchestration, while deterministic preview-kind, artifact-ready, native-preview, preview-state request, and workflow-ui request shaping lives in the pure domain layer.
- 2026-05-03: Markdown preview rendering was split into smaller presentation services. Syntax highlighting setup and the rehype code-block highlighter moved from `src/services/markdown/preview.js` into `src/services/markdown/highlight.js`; inline wiki-link draft decoration moved into `src/services/markdown/inlineDraftSyntax.js`. `preview.js` now stays below the 150-line review threshold and focuses on markdown processor composition, source anchors, sanitization, and the public render function.

## Extension Runtime Cleanup Log

- 2026-05-02: `src/stores/extensions.js` no longer carries extension/task/view/runtime DTO normalization and deterministic task/view derivation helpers inline. The pure helpers now live in `src/domains/extensions/extensionStoreState.js`; the Pinia store keeps service orchestration, host activation, command/capability dispatch, prompt recovery, and UI state coordination.
- 2026-05-02: Extension result-entry generation and view-state shaping moved into domain helpers. `src/domains/extensions/extensionResultEntries.js` now owns deterministic artifact/output/task fallback result entries, and `buildExtensionViewState` centralizes resolved/pushed view-state presentation shaping; the temporary service compatibility re-export was removed later in Phase 7.
- 2026-05-02: Extension menu, keybinding, command palette, sidebar container, view, view-title action, and view-item action derivation moved from Pinia getters into `src/domains/extensions/extensionStoreState.js`. The store getters now pass registry, enabled ids, runtime registry, and context into pure helpers while keeping Pinia state ownership local.
- 2026-05-02: Removed the extension result-entry compatibility shims from `src/services/extensions`. Components and probes now import deterministic artifact/task/result presentation helpers from `src/domains/extensions/extensionResultEntries.js`, leaving `src/services/extensions/**` focused on Tauri command/event bridge files.
- 2026-05-03: Extension registry and task refresh sequencing is centralized in `extensionsStore.refreshRegistryAndTasks()`. `SettingsExtensions.vue` and `ExtensionActionButtons.vue` no longer duplicate registry/task service sequences, while registry/task refresh failures are recorded in store state and surfaced through existing settings toast/inline status paths.
- 2026-05-18: Extension setting draft key normalization, draft-value precedence, and persisted secure-setting display policy moved from `SettingsExtensions.vue` into pure helper `src/domains/extensions/extensionSettingDrafts.js`. The settings component still owns debounce/lifecycle timing and calls `extensionsStore.setExtensionConfigValue`, while secure storage persistence stays in the existing extension settings service/Rust bridge.
- 2026-05-18: Extension settings list/card and option/action scoped styles moved from parent shell `SettingsExtensions.vue` into `SettingsExtensionList.vue` and `SettingsExtensionOptions.vue`, matching Vue scoped CSS ownership with the DOM that actually renders those classes. `scripts/probe-settings-extension-style-ownership-contract.mjs` guards that the shell keeps only page-level spacing while child components own their own card, row, button, and control styles.
- 2026-05-18: Top-level capability invocation now uses the same right-sidebar-first routing path as commands before host activation and `extension_capability_invoke`, so PDF/reference targets focus the matching plugin tab instead of bypassing the document sidebar. `scripts/probe-extension-capability-sidebar-routing.mjs` guards target preservation, focus-before-activation ordering, and changed-view refresh ticks.
- 2026-05-18: Document-action plugin tabs now use the same document-plugin header contract as normal plugin tabs in `DocumentPluginsPanel.vue`: shared container presentation, target summary, and host runtime diagnostic surfaces render above the PDF action/task body. `scripts/probe-extension-document-action-task-surface.mjs` now guards that RetainPDF-style action panels expose those header semantics together with task progress/results.
- 2026-05-18: Extension task progress presentation now reuses `src/domains/extensions/extensionProgressPresentation.js` through `src/domains/extensions/extensionTaskPresentation.js`, so right-sidebar task rows render a semantic progressbar with stable width/tone/count metadata instead of text-only progress. `scripts/probe-extension-task-presentation-contract.mjs` and `scripts/probe-extension-document-action-task-surface.mjs` guard both the domain metadata and rendered progressbar.
- 2026-05-18: Extension task result entries now expose domain-derived preview/action groups from `src/domains/extensions/extensionTaskPresentation.js`, so right-sidebar task rows separate previewable artifacts/outputs/logs from follow-up actions without plugin-specific UI branching. `scripts/probe-extension-task-presentation-contract.mjs` guards the grouped metadata and `scripts/probe-extension-document-action-task-surface.mjs` guards the rendered sidebar sections.
- 2026-05-18: Terminal extension tasks no longer lose generic recovery affordances: `src/domains/extensions/extensionResultEntries.js` now appends fallback task-log preview and rerun entries for failed/cancelled tasks when plugins did not provide equivalent entries. `scripts/probe-extension-task-failed-store-preview-contract.mjs`, `scripts/probe-extension-task-cancel-store-contract.mjs`, and `scripts/probe-extension-task-presentation-contract.mjs` guard terminal recovery wiring.
- 2026-05-18: Extension task quick actions are now derived in `src/domains/extensions/extensionTaskPresentation.js`: running/queued rows expose a cancel affordance, and failed/cancelled rows expose direct task-log and rerun actions derived from result entries. `ExtensionTaskPanel.vue` renders only that generic action shape, while `scripts/probe-extension-task-presentation-contract.mjs` and `scripts/probe-extension-document-action-task-surface.mjs` guard the contract.
- 2026-05-18: Extension task row and group state presentation are now domain-derived too: `src/domains/extensions/extensionTaskPresentation.js` exposes row tone/active/terminal metadata plus group count/tone copy, and `ExtensionTaskPanel.vue` only renders those generic classes and labels. `scripts/probe-extension-task-presentation-contract.mjs` guards the helper output and `scripts/probe-extension-document-action-task-surface.mjs` guards the rendered running/error task affordances.
- 2026-05-18: Extension task detail density is now domain-derived too: successful recent rows default to collapsed details, active rows stay expanded when detail content exists, and failed/cancelled rows default open so log/rerun recovery remains visible. `ExtensionTaskPanel.vue` owns only local expansion overrides, while `scripts/probe-extension-task-presentation-contract.mjs` and `scripts/probe-extension-document-action-task-surface.mjs` guard the default detail behavior.
- 2026-05-18: Extension task timeline density is now domain-backed too: `src/domains/extensions/extensionStoreState.js` computes full workspace-scoped running/recent totals plus visible/hidden recent counts, and `src/domains/extensions/extensionTaskPresentation.js` derives the older-task footer copy plus expand/collapse labels. `DocumentPluginsPanel.vue` and `ExtensionTaskPanel.vue` consume the same timeline contract, while `scripts/probe-extension-task-timeline.mjs` and `scripts/probe-extension-document-action-task-surface.mjs` guard truncation, full-history expansion metadata, and footer rendering.
- 2026-05-18: Extension task surface component ownership is split too: `ExtensionTaskPanel.vue` now keeps only timeline/store orchestration and local expansion/selection state, while `ExtensionTaskRow.vue` owns row/detail/progress/result/action DOM/CSS and `ExtensionTaskHistoryFooter.vue` owns truncated-history footer DOM/CSS. `scripts/probe-extension-task-surface-style-ownership.mjs` guards that the parent shell does not regain child scoped styles.
- 2026-05-03: Phase 7 verification passed with full `npm run verify`. The only escalation needed was for `probe:retain-pdf-extension`, which writes generated runtime files under `~/.scribeflow/extensions/retain-pdf/.runtime`; no code regression was found.
- 2026-05-03: Extension sidebar tone class normalization moved from `ExtensionSidebarPanel.vue` into `src/domains/extensions/extensionToneClass.js`, keeping status/summary tone-to-class derivation as a pure extension domain helper.
- 2026-05-18: Extension sidebar panel title, extension-name fallback, view-key derivation, header action blocked labels, view presentation fields, active result-entry selection, tree expansion defaults, and result-action message/key derivation moved from `ExtensionSidebarPanel.vue` into `src/domains/extensions/extensionSidebarPresentation.js`. The panel still owns refresh watchers, controller-state application, command dispatch, toast side effects, and store orchestration.
- 2026-05-18: Extension sidebar surface component ownership is split too: `ExtensionSidebarPanel.vue` now stays below the large-component review threshold and keeps refresh/controller/result-action orchestration, while `ExtensionSidebarHeader.vue` owns header action/refresh chrome and `ExtensionSidebarViewSection.vue` owns section/result/tree scoped styles. `scripts/probe-extension-sidebar-surface-style-ownership.mjs` guards that the parent shell does not regain header or view-section scoped styles.
- 2026-05-03: Extension document action progress state, width, and tone class derivation moved from `ExtensionDocumentActionPanel.vue` into `src/domains/extensions/extensionProgressPresentation.js`.
- 2026-05-03: App update version comparison and installer asset selection moved from `src/services/appUpdater.js` into pure settings domain helper `src/domains/settings/appUpdatePresentation.js`. The updater service now stays below the 150-line review threshold and focuses on app version, GitHub fetch, Tauri download/reveal, external link, and progress event bridging.
- 2026-05-03: Reference BibTeX and detailed JSON export writes moved from `ReferenceLibraryWorkbench.vue` into `src/stores/references.js` actions, leaving the component responsible for dialog and notification orchestration only.
- 2026-05-18: Reference workbench sort toggles, PDF path fallback, cited-in file lookup, collection membership checks, detail dock resize constraints, close-reset delay, export filename fallback, and reference context-menu group presentation moved from `ReferenceLibraryWorkbench.vue` into `src/domains/references/referenceWorkbenchPresentation.js`. After the follow-up action split, the component still owns DOM width reads, dock page activation, shell composition, selection, and Pinia state consumption, while native dialogs, clipboard writes, toast/status feedback, menu action binding, and reference store dispatch live in `src/composables/references/useReferenceLibraryActions.js`.
- 2026-05-03: Zotero manual sync routing moved behind `referencesStore.syncZoteroNow()`, so `SettingsZotero.vue` no longer passes the references store into the Zotero service layer.
- 2026-05-03: Removed unused LaTeX preference setters for build extra args and custom system TeX path from `src/stores/latex.js`; persisted fields remain readable for existing runtime requests, but deleted settings no longer leave callable store entry points.
- 2026-05-03: Zotero connect/disconnect service sequences moved behind `referencesStore.connectZotero()` and `referencesStore.disconnectZotero()`, keeping `SettingsZotero.vue` focused on form state, option-tree UI, and messages.
- 2026-05-03: Zotero remote library fetch sequence moved behind `referencesStore.loadZoteroRemoteLibraries()`, leaving `SettingsZotero.vue` to build UI option labels from store-provided remote groups and collections.
- 2026-05-03: Zotero settings hydrate/save service calls moved behind `referencesStore.loadZoteroSettingsState()` and `referencesStore.saveZoteroSettingsConfig()`, removing direct Zotero service imports from `SettingsZotero.vue`.
- 2026-05-03: Zotero settings option-tree, push-target, and selected-group presentation helpers moved from `SettingsZotero.vue` into `src/domains/references/zoteroSettingsPresentation.js`.
- 2026-05-03: Zotero settings load and remote-library refresh failures now surface through the existing `SettingsZotero.vue` inline error state instead of only logging to the console.
- 2026-05-03: Zotero sync orchestration no longer passes the Pinia reference store into `src/services/references/zoteroSync.js`. The service now accepts explicit snapshot/selected-reference DTOs and returns a normalized sync result, while `src/stores/references.js` owns applying snapshots plus sync status/error UI state; `src/app/workspace/useWorkspaceLifecycle.js` routes auto-sync through `referencesStore.syncZoteroNow()`.

## Workbench Shell Cleanup Log

- 2026-05-18: `WorkbenchRail.vue` no longer owns deterministic topbar padding/style derivation or workspace mode menu item state inline. `src/domains/workbench/workbenchRailPresentation.js` now derives macOS/fullscreen rail style and file/reference mode items, while the component keeps native window fullscreen checks, drag handling, outside-click/Escape listeners, and emitted user intent.
- 2026-05-18: Workbench rail title/menu ownership is now split at the Vue component boundary. `WorkbenchRail.vue` keeps native window fullscreen sync, drag handling, outside-click/Escape listeners, menu open state, and emitted shell intent, while `WorkbenchRailTitleArea.vue` owns the center title target, reference mode menu, inline document title, and title/menu scoped styles. `scripts/probe-workbench-rail-title-style-ownership.mjs` guards that the title area stays presentation-only and out of native/listener/store authority.
- 2026-05-18: App shell frame ownership is now split at the Vue component boundary. `App.vue` keeps store, workspace lifecycle, active workbench selection, extension prompt/palette orchestration, zen-mode listeners, and app teardown/event bridges, while `AppShellFrame.vue` owns the root shell/topbar/left-sidebar/main-card/resize-slot DOM and scoped shell styles. `scripts/probe-app-shell-frame-style-ownership.mjs` guards that the frame stays presentation-only and out of store/native/listener authority.

## Rust Runtime Cleanup Log

- 2026-05-18: Added `probe:desktop-main-path-runtime-contract`, backed by `src-tauri/src/bin/desktop-main-path-runtime-contract-probe.rs` and `src-tauri/src/desktop_main_path_runtime_probe.rs`, to keep the core desktop runtime path wired together in `npm run verify:quick`. The probe uses an isolated temporary workspace and exercises Rust-owned workspace open/bootstrap, scoped file tree loading, Markdown heading extraction, Markdown preview action/state resolution, LaTeX graph/preview planning, Python execution, reference mutation/persistence/query/citation rendering, workspace extension discovery, and workspace close scope cleanup. It is a runtime contract smoke and does not replace hand-judged desktop UI/interaction review.
- 2026-05-03: Workspace URI scheme handling moved from `src-tauri/src/lib.rs` into `src-tauri/src/workspace_protocol.rs`. `lib.rs` now only registers the `scribeflow-workspace` protocol, while request path decoding, content-type mapping, scoped path resolution, and file response construction live in the workspace protocol module with focused unit tests. No Tauri command names, URI scheme name, or frontend payload shapes changed.
- 2026-05-03: `src-tauri/src/lib.rs` command registration gained subsystem grouping comments for filesystem/app utilities, extensions, references, document/runtime commands, workspace state, and legacy LaTeX compatibility commands. The registration order and command contracts were preserved.
- 2026-05-03: `src-tauri/src/security.rs` now shares labeled allowed-root preparation helpers across workspace, data, global config, and Claude config root registration. The helper extraction keeps workspace security authority in Rust and preserves existing scoped validation error labels with a focused unit test.
- 2026-05-03: `src-tauri/src/extension_host.rs` cfg boundaries now avoid probe/test-only unused variable and formatter warnings without changing extension host runtime behavior. Full Rust tests run without the previous extension host warning noise.
- 2026-05-03: macOS menu, window vibrancy, locale-sensitive menu labels, and frontend menu-event dispatch moved from `src-tauri/src/lib.rs` into `src-tauri/src/macos_shell.rs`. The app entrypoint keeps only setup/menu hook wiring while preserving menu IDs and frontend event names.

## Compatibility Cleanup Log

- 2026-05-03: Removed obsolete frontend service compatibility exports after their canonical modules were already established. `src/services/pathExists.js` was deleted, path-status callers now import from `src/services/pathStatus.js`, and unused re-exports were removed from `appUpdater.js`, `fileTreeSystem.js`, and `latex/previewSync.js`; no persisted data shape, Tauri command, or runtime contract changed.
- 2026-05-03: Removed the remaining workspace preference compatibility export hub. Workspace preference presentation callers now import from `src/domains/settings/workspacePreferencePresentation.js`, DOM font callers import from `src/services/workspaceFonts.js`, and theme callers import from `src/services/workspaceTheme.js`; `src/services/workspacePreferences.js` no longer re-exports canonical helpers.

## Phase 1 Verification Targets

- `npm run verify:quick`
- `npm run guard:ui-bridges`
- `npm run guard:js-layer-boundaries`
- `npm run build`

Later phases must update this map as responsibility moves out of mixed modules.
