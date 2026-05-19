# ScribeFlow Current State

Last updated: 2026-05-19

## Product

ScribeFlow is a local-first Tauri desktop workbench for academic writing and research.

Current desktop paths:

- open, close and reopen local workspaces
- browse and mutate the workspace file tree
- restore editor tabs, document dock tabs and recent files
- edit Markdown, LaTeX and Python documents
- preview Markdown, compile LaTeX, inspect PDF output and run Python
- manage references from BibTeX, PDF metadata and Zotero
- insert Markdown and LaTeX citations
- sync selected document references into LaTeX bibliography files
- inspect where references are cited in the workspace
- configure editor, workspace, PDF, citation, environment, Zotero, extensions and update settings
- discover local plugin packages, enable or disable them, and configure host-managed plugin settings in Settings
- activate enabled plugins immediately so runtime-only commands, menus, and views become available without waiting for a later user action
- deactivate disabled plugins through the host runtime so plugin-local `deactivate()` logic can release resources instead of relying only on frontend state cleanup
- restart the persistent extension host automatically after a host-process crash so the next activation or command request can recover without restarting the desktop app
- render plugin surfaces as document right sidebar tabs, resolve tree roots and child nodes from the plugin host, support reveal and selection events, and surface host-rendered quick input flows for plugins
- enforce one activitybar view container per plugin so each normal plugin maps to one document right sidebar tab/container
- route PDF actions, command invocations, capability invocations and view reveal requests into the matching plugin-owned right sidebar tab by default
- keep document-action plugin tasks visible inside that same right sidebar tab so running progress, cancellation and result entries stay reachable after an action starts
- split the right-sidebar task surface into a parent timeline/orchestration shell plus row and truncated-history footer presentation components with scoped style ownership guarded by a focused probe
- expose thicker runtime APIs for plugins through `context.workspace`, `context.documents`, `context.invocation`, `context.references`, `context.pdf` and `context.process`
- allow process-driven plugins to `spawn` local workers and explicitly `wait` for completion through the Rust-backed host bridge
- support `context.window.showQuickPick(..., { canPickMany: true })` end-to-end so plugin quick-pick flows can return multi-select arrays instead of only single values
- support `context.window.showQuickPick(...)` end-to-end with stable title/placeholder/picked-default request fields plus explicit confirm and cancel result semantics
- persist plugin `globalState` and `workspaceState` through the Rust runtime and restore both scopes on later activation
- surface `context.window.showInformationMessage`, `showWarningMessage`, and `showErrorMessage` through host window-message events with stable severity payloads
- support `context.window.showInputBox(...)` end-to-end with stable title/prompt/placeholder/value/password request fields plus explicit confirm and cancel result semantics
- propagate host-managed extension setting changes into activated plugins through `context.settings.onDidChange(...)`
- store schema-declared secure plugin settings in secure host-managed keychain storage instead of plain `extension-settings.json`, while legacy secret-like keys still use a compatibility fallback until plugin manifests declare `secureStorage`
- prefer runtime-registered plugin actions for command palette, PDF preview actions, view title actions and view item actions
- expose reference-aware and PDF-aware runtime context through `context.references` and `context.pdf`
- allow plugins to query the current reference library, inspect PDF metadata/text, and run permission-gated local processes through the Rust-backed host bridge

## Architecture

- `src/app`: desktop lifecycle and shell orchestration
- `src/components`: Vue UI surfaces
- `src/composables`: UI composition and interaction helpers
- `src/domains`: frontend pure rules and state transitions
- `src/services`: Tauri bridge and side-effect boundary
- `src/stores`: Pinia coordination state
- `src-tauri/src`: Rust runtime authority for filesystem, workspace access, sessions, preferences, references, LaTeX, Python, extensions and updates

Canonical layer table:

| Layer | Responsibility |
| --- | --- |
| Vue UI | render product surfaces, receive props, emit user intent, show loading/error/empty states |
| JS bridge | `src/services` wraps Tauri commands, plugins, native events and DTO compatibility |
| Pinia coordination | `src/stores` owns screen state, orchestration, loading/error lifecycle and service calls |
| JS domains | `src/domains` owns pure presentation rules, labels, sorting and deterministic state derivation |
| Rust runtime | `src-tauri/src` owns filesystem, workspace state, references, runtime execution, persistence, plugins and security |

Boundary rules:

- Vue components, stores, domains and composables do not import Tauri APIs directly.
- Tauri `invoke`, Tauri plugin calls and event bridges belong in `src/services`.
- Rust owns filesystem authority, persisted app state, reference normalization, compile/runtime execution and workspace-scoped security checks.
- Rust owns plugin discovery, manifest validation, plugin host startup, command execution, task state and artifact access.
- Rust manifest validation enforces the single-container right-sidebar contract for normal plugins.
- Vue owns plugin prompt rendering, plugin sidebar rendering, command palette integration and runtime event presentation through the `src/services` bridge.
- JS remains a thin bridge and UI coordination layer, not a second backend.
- `src/domains` must not gain native bridge, persistence, filesystem or process authority; existing document/editor domain service imports are recorded as cleanup debt in `ARCHITECTURE-BOUNDARY-MAP.md`.
- Tauri command payload shape changes must update Rust command handling, JS bridge DTO mapping, store call sites and regression verification in the same commit.
- Editor core changes require a separate editor-specific phase; global module cleanup must not alter cursor, selection, reveal, scroll, CodeMirror behavior, editor session payloads or editor event timing.

Current reference authority direction:

- Reference cleanup is Rust-first: Rust owns reference truth, filesystem authority, persistence, mutation/result normalization, citation/render targets, imports, PDF assets and Zotero sync.
- `src/domains/references/referenceStoreState.js` now contains only UI state/display helpers; Rust query DTO readers live separately in `src/domains/references/referenceResolvedQueryDto.js`.
- Future reference work should shrink JS to UI presentation, DTO compatibility, Tauri bridge wrappers and short-term Pinia coordination.
- `REFERENCE-AUTHORITY-RUSTIFICATION-CHECKPOINT.md` records which helpers may remain UI-only, which are transitional, and which should migrate back to Rust runtime contracts.

Allowed/disallowed examples:

- Allowed: `ReferenceDetailPanel.vue` edits local draft state, `references.js` sends one mutation request through `referenceRuntime`, and Rust validates, normalizes and persists the reference.
- Disallowed: Vue components write normalized reference records directly or duplicate Rust-owned merge policy.
- Allowed: a service wrapper invokes a Tauri command and maps camelCase DTOs.
- Disallowed: a service wrapper becomes the policy owner for workspace security, reference merging, plugin host lifecycle or persisted settings schema.

Plugin architecture direction:

- runtime registration first
- manifest as bootstrap metadata
- Obsidian-style plugin model with Rust authority retained
- current platform contract is runtime-first for local owner-authored plugins; remaining work is additive host API growth rather than a direction reset

Current editor stability contract:

- external file-content sync is guarded by request version, active editor view identity, current store content and unchanged editor document text before applying an async text-diff patch
- local editor cache updates invalidate pending external sync patches so delayed file-content watcher work cannot replay over newer cursor, selection or typed document state
- restored editor session state is normalized before mounting panes or document dock tabs: stale active pane ids, duplicate dock tabs, invalid active dock tabs and out-of-surface `lastContextPath` values fall back to mounted editor/dock context
- Markdown preview sync timers are lifecycle-scoped: pending selection timeouts and viewport animation frames are invalidated on editor deactivate/unmount and superseded by later cursor/scroll changes before dispatching preview sync events
- Markdown pending forward-sync locations are source-scoped and cleared when a preview surface unmounts, so later remounts cannot consume stale reveal/scroll intent
- Markdown preview renders are lifecycle-versioned: delayed render timers, async file reads and async preview renders cannot commit HTML, preview status or pending scroll sync after unmount or after a newer render request supersedes them
- Markdown preview-to-source reveal requests are lifecycle-versioned: stale double-click/context-menu reveals and unmounted preview surfaces cannot finish a delayed editor-view wait by stealing focus or selection after a newer reveal request
- LaTeX PDF-to-source reveal requests are lifecycle-versioned: stale reverse-sync requests and deactivated editor runtimes cannot finish a delayed editor-view wait by stealing focus or selection after the PDF preview revision changes or a newer reveal request supersedes them
- LaTeX source-to-PDF forward-sync requests are lifecycle-versioned: stale source cursor requests and remounted PDF documents cannot finish delayed scroll/highlight frame waits by writing obsolete overlay or queued sync state after a newer forward-sync request supersedes them
- PDF restore requests are lifecycle-versioned: stale restore-state requests and remounted PDF documents cannot finish delayed frame waits by writing obsolete scroll position, view-state emissions or initial paint refresh after the document id or restore payload changes
- editor context-menu selection restore is lifecycle-scoped: delayed frame/timeout selection restores are cancelled by newer context-menu gestures, menu close, editor deactivation and editor unmount, so an old context-menu request cannot write stale cursor or selection after a newer event
- editor reveal highlight clearing is lifecycle-scoped: delayed highlight-clear timers are superseded by newer highlights and cancelled on editor runtime deactivation or CodeMirror view destroy, so a closed pane cannot receive a stale decoration clear dispatch
- outline-to-editor focus retries are lifecycle-scoped: pending delayed retries are superseded by newer outline navigation, cancelled when the active file changes away from the pending target, and disposed on panel unmount, so stale outline clicks cannot focus or highlight a later editor view
- reference cited-in source focus retries are lifecycle-scoped: pending delayed retries are superseded by newer source clicks, cancelled when the citation key, workspace or active tab changes away from the pending target, and disposed on panel unmount, so stale reference clicks cannot focus or highlight a later editor view
- diagnostics problem-to-source reveals are lifecycle-scoped: pending delayed source-view waits are superseded by newer problem clicks, cancelled when the document or active tab changes away from the pending target, and disposed on panel unmount, so stale diagnostics clicks cannot focus a later problem or editor view
- citation palette actions are lifecycle-scoped: pending async document-scope reference adds, imports and delayed autofocus are superseded by newer palette actions, prop changes, close and unmount, so stale palette promises cannot emit insert/update, surface import errors or focus closed inputs
- these are timing and restore-state guards only; they do not restore cursor/selection, change session payload shape, or introduce automatic reveal/scroll behavior

Current plugin result contract:

- plugin runtime can return `resultEntries`, `artifacts`, and `outputs` from task, capability, and view flows
- frontend merges host-generated default preview entries from `artifacts` and `outputs` only when explicit `resultEntries` leave gaps
- task-owned artifact metadata is anchored to the host invocation envelope
- direct view and pushed view-state artifacts may preserve explicit plugin metadata when they represent view-owned state instead of task-owned execution state

Current plugin lifecycle contract:

- disabling an extension is a real authority boundary, not only a UI toggle
- disabled extensions cannot execute commands, invoke capabilities, resolve views, or receive view-selection callbacks
- disabling an activated extension requests host-side runtime deactivation and then clears frontend runtime/view/controller state
- enabling an extension immediately re-activates its runtime registration so runtime-only commands and menus are visible again
- direct host deactivation is now probe-backed: `Activate -> Deactivate -> Reactivate` succeeds and plugin `deactivate()` state can be observed
- workspace transition teardown is now probe-backed: switching or closing a workspace deactivates host runtime slots owned by the old workspace before frontend session state resets, so stale activation state does not leak into the next workspace
- host-process crash recovery is now probe-backed: a crashing command tears down the dead process handle, and the next host request respawns the persistent runtime and succeeds
- host interruption during a pending window prompt is now probe-backed: waiting prompt flows fail fast when the host dies, the pending UI request is interrupted immediately, and the frontend prompt is cleared instead of lingering until timeout
- tree-view controller contract is now probe-backed: `createTreeView(...).onDidChangeSelection(...)` receives runtime element payload plus selected handles, and controller `reveal(...)` preserves ordered parent handles together with default and explicit `focus/select/expand` flags
- quick-pick multi-select is now probe-backed: picked defaults hydrate into the prompt, UI selection can accumulate multiple items, and the host roundtrip preserves an array result payload
- quick-pick request and result semantics are now probe-backed: host request payload fields stay stable, picked defaults survive request serialization, confirm returns the selected value, and cancel resolves back to `undefined`
- settings change contract is now probe-backed: host updates replace the runtime settings snapshot instead of merging stale keys, `changedKeys` includes updates plus removals, `event.values` reflects the post-update snapshot, and no-op snapshots do not emit extra runtime changes
- process bridge contract is now probe-backed: `context.process.exec(...)` inherits the workspace root as default cwd, `spawn(...).wait()` preserves pid and exit result shape, env vars cross the Rust bridge, failing execs keep stderr plus non-zero codes, and cwd requests outside the active workspace are rejected
- references/pdf bridge contract is now probe-backed: `context.references.current` and `context.pdf.current` preserve invocation `referenceId` and active PDF path, `readCurrentLibrary()` returns the normalized snapshot through the Rust bridge, `extractMetadata()`/`extractText()` resolve the active PDF, and out-of-scope PDF paths reject with a surfaced runtime error
- workspace/documents/invocation contract is now probe-backed: `context.workspace`, `context.documents`, and `context.invocation` preserve the active workspace root, derived resource metadata, target payload, and empty-state defaults without requiring plugins to reconstruct the envelope manually
- commands/menu registration contract is now probe-backed: `context.commands.executeCommand(...)` can synchronously route into another runtime-registered command and preserve its result payload, while `context.menus.registerAction(...)` preserves runtime action metadata per surface and cleans up disposed actions from subsequent activation snapshots
- task update contract is now probe-backed: `context.tasks.update(...)` preserves spawned-process ownership across intermediate `running` updates so `spawn(...).wait()` still resolves, terminal updates reap runtime pid ownership without deleting the persisted task record, and task `artifacts` / `outputs` follow replace-on-present semantics through the Rust bridge
- view state contract is now probe-backed: `context.views.updateView(...)` for normal view providers survives later `ResolveView` refreshes as an overlay, pushed fields stay authoritative, and untouched fields continue refreshing from the latest provider baseline
- nested command contract is now probe-backed: `context.commands.executeCommand(...)` preserves the callee result payload, surfaces nested runtime failures as catchable plugin exceptions, and unions nested `changedViews` with host-tracked `views.refresh(...)` requests
- lifecycle state contract is now probe-backed: persisted extension settings, `globalState`, and same-workspace `workspaceState` survive through `deactivate -> reactivate -> host crash recovery`, while `workspaceState` remains isolated across workspace roots
- nested capability contract is now probe-backed: `context.capabilities.invoke(...)` preserves the callee result payload, surfaces nested capability failures as catchable plugin exceptions, unions nested `changedViews` with host-tracked `views.refresh(...)` requests, and now propagates that aggregated refresh set through the top-level capability invocation result
- capability orchestration is now probe-backed as a first-class runtime contract: one capability provider can combine `tasks.update(...)`, `views.updateView(...)`, and `views.refresh(...)` in the same request, and the host preserves the running-task snapshot, pushed view state, and top-level `changedViews` refresh set together
- top-level capability invocations now share the command-style right-sidebar routing contract: the matching plugin tab is opened and focused with the active PDF/reference target before host activation and capability invocation, and changed views still refresh the opened sidebar surface
- extension task cancellation is now probe-backed as a first-class runtime contract: cancelling a running extension task reuses the formal task API, preserves the persisted `cancelled` terminal state, and clears spawned-process ownership from the runtime registry
- extension task cancellation is also probe-backed at the store/UI contract layer: after a cancel response returns, the frontend timeline moves the task out of the running bucket, preserves the `cancelled` terminal snapshot in recent tasks, and keeps the last running output payload visible
- disabling an extension now also closes its task contract instead of only removing execution entrypoints: active `running`/`queued` tasks for that extension are cancelled through the Rust runtime, spawned-process ownership is reaped, persisted `cancelled` snapshots remain inspectable, and unrelated extensions keep their task ownership untouched
- disabling an extension now also closes extension-scoped window input flows instead of leaving prompt waits hanging: pending `showQuickPick(...)` / `showInputBox(...)` requests for that extension are cancelled through the host bridge, the frontend prompt clears immediately, and the rest of the disable flow can proceed without waiting for manual prompt dismissal
- cross-extension prompt isolation is now probe-backed too: if one extension currently owns a pending host prompt, another extension's top-level request fails immediately with a clear owner-specific error instead of silently blocking behind the prompt wait
- same-extension prompt reentry is now probe-backed too: once an extension owns a pending host prompt, that extension still cannot start a second top-level host request until the prompt is resolved, so prompt waits remain single-flight instead of recursively deadlocking the shared host channel
- prompt recovery at the frontend consumption layer is now probe-backed too: if `resolveView(...)` or `notifyViewSelection(...)` fast-fails because a prompt currently owns the host channel, the request is deferred in the store and replayed automatically after the prompt closes instead of being lost forever, replay itself is non-lossy when a later host-side transport error interrupts the queue mid-flush, and stale deferred requests from an old workspace are discarded instead of replaying into a later workspace
- prompt recovery descriptor presentation is now probe-backed too: cancel affordances for settings, document-plugin diagnostics, and command-palette recovery all derive the same owner-aware label/title contract from one shared descriptor instead of re-assembling prompt-owner copy per surface
- workspace transition handling is now probe-backed at the frontend extension-session layer too: closing or switching workspaces resets frontend extension session state, reopening a workspace forces workspace-scoped extension settings and registry data to reload, and workspace-only plugin discovery/enabled ids follow the active workspace instead of leaking across transitions
- workspace-scoped extension task visibility is now probe-backed too: persisted extension tasks retain their originating `workspaceRoot`, and document-plugin task panels only surface tasks for the active workspace instead of mixing same-extension history from other workspaces into the current sidebar
- workspace-scoped extension task querying is now probe-backed at the Rust authority boundary too: frontend task refreshes ask the backend for the active `workspaceRoot`, and the backend only returns tasks for that workspace instead of relying on frontend-only filtering after a global task load
- workspace-scoped extension host runtime isolation is now probe-backed at the host authority boundary too: persistent host state is keyed by `extensionId + workspaceRoot`, so deactivation, pending prompts, settings updates, treeview selection, and same-extension task cancellation only affect the active workspace slot instead of leaking across sibling workspaces
- workspace-scoped host observability is now probe-backed at the frontend store layer too: `extension_host_status` exposes structured `activeRuntimeSlots` and `pendingPromptOwner`, prompt open/resolve flows resync that snapshot in real time, and both settings plus document plugin surfaces can inspect host runtime occupancy directly instead of reverse-parsing prompt-owner details from freeform error strings
- host runtime restart from frontend settings is now probe-backed too: restarting one active runtime slot explicitly deactivates that slot through the host bridge, reactivates it in the same workspace, and refreshes store-level host occupancy so the runtime card can trust the updated slot snapshot
- command-level host blocking UX is now centralized too: command buttons and the command palette both derive blocked/waiting state from shared host diagnostics before dispatch, show owner-aware status labels inline, and stop sending users into avoidable top-level command errors when the host is already prompt-blocked
- command dispatch preflight is now enforced at the store boundary too: keybindings, sidebar actions, and result-entry reruns all consult the same host blocked/waiting snapshot before activation or execution, emit structured warning-grade errors for UI surfaces, and avoid sending doomed top-level command requests into the shared host
- capability dispatch now follows the same host preflight model too: settings-surface capability runs consult the same blocked/waiting snapshot before activation or invocation, reuse the shared warning/error descriptor path, and stop sending capability requests into the host when a prompt already owns the channel
- document-plugin action surfaces are now blocked-aware too: sidebar header actions, tree item commands, and result-entry rerun actions derive disabled state from the shared runtime block descriptor, keep expandable tree groups interactive when they do not dispatch a command, and surface blocked/waiting labels inline instead of only after a toast path
- host-status surface presentation is now shared too: settings runtime cards, document-plugin diagnostics, and command-palette recovery copy all derive badge/title/description/tone/recovery-owner fields from one shared host-status descriptor instead of each surface maintaining its own blocked-versus-waiting wording
- host-status surface translation/recovery orchestration is now shared too: settings runtime cards, document-plugin diagnostics, and command-palette recovery now all derive translated badge/title/description/summary text plus prompt-recovery owner wiring from one shared presentation/composable layer instead of each surface hand-assembling summary strings and recovery bindings
- host-status recovery action contract is now probe-backed too: those same surfaces also consume the same `available/busy/label/title/trigger` recovery action shape, so cancel-prompt affordances no longer reassemble button state and trigger wiring independently per surface
- host-status UI shell is now shared too: settings runtime cards, document-plugin diagnostics, and command-palette recovery now render through one shared host-status surface component with compact/full variants and slot-based extension points instead of maintaining three separate DOM/CSS shells
- runtime-block action presentation is now shared too: command buttons, sidebar header actions, tree-item actions, result-preview actions, and command-palette row pills all derive the same blocked/waiting label and message rendering from one shared presentation helper instead of each surface manually translating `labelKey/messageKey`
- runtime-block action button shell is now shared too: command buttons, sidebar header actions, and result-preview actions now render through one shared blocked-action button component, so blocked label/message/disabled/title behavior no longer requires each surface to hand-assemble its own button markup
- runtime-block status chip is now shared too: command-palette status pills and tree primary blocked labels now render through one shared blocked-status chip component, so blocked/waiting tone and compact-vs-regular label treatment no longer drift between those surfaces
- tree primary blocked shell is now shared too: extension sidebar tree items no longer hand-assemble selected/focused/blocked card chrome inline, and instead render through one shared tree-primary button component that owns the blocked chip placement and disabled/title contract
- sidebar panel status and summary shells are now shared too: view status pills and summary cards no longer keep their own local DOM/CSS contracts, and instead render through shared status-pill and summary-card components
- extension count badges are now shared too: document-plugin page headers and sidebar view badges no longer keep separate count-badge chrome, and instead render through one shared count-badge component
- plugin container presentation is now shared too: document-dock plugin tabs and document-plugin page headers now derive label/title/description/badge data from one shared container-presentation helper instead of separately reading first-view state and recomputing title-plus-badge strings
- extension sidebar surface ownership is now split at the Vue component boundary: `ExtensionSidebarPanel.vue` keeps refresh/controller/result-action orchestration, `ExtensionSidebarHeader.vue` owns header action/refresh DOM and CSS, and `ExtensionSidebarViewSection.vue` owns section/result/tree DOM and CSS
- plugin target summary presentation is now shared too: document-plugin page headers derive path/reference target copy from one pure presentation helper, keeping right-sidebar context wording probe-backed and outside component-local branching
- document-action plugin panels now share that same right-sidebar header contract too: PDF action panels render the plugin container title, active target summary, and host runtime diagnostic surface before the action/task body instead of using a one-off button-only panel shape
- extension task presentation is now shared too: right-sidebar task rows derive title, status tone, row tone, group counts, group tone, timeline density copy, detail collapse defaults, progress copy, progressbar metadata, target facts, result counts, artifact counts, preview/action result groups, and quick action affordances from pure presentation helpers instead of duplicating running/recent UI branches
- extension task timelines now expose visible/hidden recent counts as a domain contract: document-plugin task panels render the newest recent tasks with a compact older-task footer when history is truncated, let users expand or collapse older task history in place, and keep action panels plus task rows on the same workspace-scoped timeline instead of drifting across separate recent-task slices
- extension task surface ownership is now split at the Vue component boundary: `ExtensionTaskPanel.vue` keeps timeline/store orchestration and expansion/selection state, `ExtensionTaskRow.vue` owns row/detail/progress/result/action DOM and CSS, and `ExtensionTaskHistoryFooter.vue` owns truncated-history footer DOM and CSS
- workbench rail title ownership is now split at the Vue component boundary: `WorkbenchRail.vue` keeps native fullscreen sync, window dragging, outside-click/Escape lifecycle, menu open state, and emitted shell intent, while `WorkbenchRailTitleArea.vue` owns center title slot, reference mode menu, inline document title, and title/menu scoped CSS
- settings surface ownership is now split at the Vue component boundary: `Settings.vue` keeps active-section orchestration, `SettingsSurface.vue` owns the guarded settings shell/header/content slot and the shared settings row/group/control CSS, and duplicate settings-wide style blocks have been collapsed into one owner
- app shell frame ownership is now split at the Vue component boundary: `App.vue` keeps store, workspace lifecycle, active workbench selection, extension prompt/palette orchestration, zen-mode listeners, and teardown/event bridges, while `AppShellFrame.vue` owns root shell/topbar/left-sidebar/main-card/resize-slot DOM and scoped shell CSS
- file tree body ownership is now split at the Vue component boundary: `FileTree.vue` keeps keyboard, drag/drop, context-menu, mutation, and store orchestration, while `FileTreeBody.vue` owns scroll-body DOM, virtual row rendering, root inline-create input, drop/empty state chrome, and body scoped CSS
- file tree overlay ownership is now split at the Vue component boundary too: `FileTree.vue` keeps menu state, positioning, document listeners, file mutation, and workspace/editor orchestration, while `FileTreeOverlays.vue` owns context-menu/workspace-menu/new-menu/drag-ghost composition and exposes only menu DOM accessors back to the coordinator
- file tree action workflow ownership is now split from the file-tree coordinator: `FileTree.vue` keeps menu positioning, overlay lifecycle, virtual row wiring, keyboard dispatch, and drag/drop wiring, while `useFileTreeActions.js` owns inline create/rename/duplicate/delete/reveal/document-dock side effects and file/workspace/editor store dispatch
- reference workbench detail dock ownership is now split at the Vue component boundary: `ReferenceLibraryWorkbench.vue` keeps reference selection, page activation, tab fallback, resize, import/export, and context-menu orchestration, while `ReferenceLibraryDetailDock.vue` owns the inline dock frame, tabbar, active page render slot, empty state, and detail tab scoped CSS
- reference workbench main-list ownership is now split at the Vue component boundary too: `ReferenceLibraryWorkbench.vue` keeps import/export, selected-reference, context-menu, sort, and dock orchestration, while `ReferenceLibraryMain.vue` owns toolbar/status/empty/table composition and main-list scoped CSS
- reference action workflow ownership is now split from the workbench coordinator: `ReferenceLibraryWorkbench.vue` keeps selection, dock page activation, resize/layout reconciliation, and shell composition, while `useReferenceLibraryActions.js` owns native import/export dialogs, clipboard copy, toast/status feedback, context-menu action binding, and reference store action dispatch
- reference detail PDF action workflow ownership is now split from the detail coordinator: `ReferenceDetailPanel.vue` keeps draft lifecycle and save orchestration, while `useReferenceDetailActions.js` owns PDF preview/open/reveal/attach action side effects through the existing store/service boundary
- reference detail token workflow ownership is now split from the detail coordinator too: `ReferenceDetailPanel.vue` keeps the draft/save queue, while `useReferenceDetailTokenActions.js` owns tag input, tag removal, collection removal, and collection label resolution through callback-based save wiring
- reference imported-reference commit workflow is now shared inside `src/stores/references.js`: BibTeX/file imports and resolved-text imports reuse the same snapshot commit/result mapping helper, while Rust `references_mutation_apply` remains the merge and duplicate policy authority
- reference mutation outcome is now Rust-returned for import/add/update/remove/collection/document-reference/toggle flows: `references_mutation_apply` accepts the current `selectedReferenceId`, returns changed/removed/toggled flags, collection payloads, selected reference payloads and preferred selection hints, while `src/stores/references.js` commits the returned snapshot and consumes `mutation.result` directly without `referenceStoreState.js` result reconstruction
- reference import input preflight is now Rust-owned too: `mergeImportedReferences` accepts raw imported payload intent, treats non-array/empty imports as empty in Rust, returns `emptyImport`, empty result shape and preferred selection, and JS skips snapshot commit when Rust returns the empty-import outcome
- reference metadata refresh target state is now Rust-owned too: `src/stores/references.js` passes the current references snapshot plus `referenceId` through the thin Crossref bridge, while `references_runtime.rs` resolves the target reference, preserves missing-target null semantics, performs backend metadata lookup and returns a normalized refreshed record
- reference PDF asset target resolution is now Rust-owned too: attach/rename actions pass the current references snapshot plus `referenceId` through the thin `referenceAssets` bridge, while `references_backend.rs` selects the target reference, preserves missing-target null semantics, and performs asset store/rename filesystem work
- reference removal target and Zotero delete side-effect target state are now Rust-owned too: `removeReference()` sends the raw `referenceId` through `references_mutation_apply`, while Rust resolves the removed reference, returns `removedReference`, `zoteroDeleteReference`, removed flag and preferred selection, and JS only calls Zotero delete when Rust returns a delete target
- reference update mutation changed gating and commit preferred-selection fallback now come from the Rust mutation outcome
- reference PDF import target/result state is now Rust-owned too: `references_mutation_apply(importPdfReference)` returns the imported snapshot, selected reference id, selected reference payload and preferred selection, while `importReferencePdf()` sends that snapshot/id to `references_asset_store` and consumes the Rust update mutation result without `referenceStoreState.js` target/result helpers
- reference collection/document-reference/toggle mutation state now comes directly from Rust: create/rename collection, remove collection, set/add/remove document reference ids, and toggle collection actions consume `mutation.result` without JS result wrappers or JS document-reference mutation preflight
- reference citation-style state is now domain-derived too: citation-style id fallback and workspace style-list fallback live in `referenceStoreState.js`, while `src/stores/references.js` keeps style registry lookups, workspace scanning, and user-style registry side effects in the service/store boundary
- reference Zotero sync result state is now Rust-owned too: `references_zotero_sync_persist_with_account` returns skipped state, counts, selected reference id, snapshot, sync status and last-sync timestamp as frontend-ready fields, while `src/stores/references.js` only applies snapshots and assigns the returned UI state
- reference citation formatting target lookup is now Rust-owned: `src/stores/references.js` passes `referenceId`, the current `references` snapshot and workspace path through the thin `formatReferenceCitationById` bridge, while `references_citation.rs` resolves the target, preserves missing-id empty output semantics, and renders from the Rust-selected reference
- reference mutation snapshot commit workflow is now shared inside `src/stores/references.js`: collection, document-reference, reference-record, and PDF-asset update mutations reuse `commitReferenceMutationSnapshot()` for snapshot fallback plus commit options, while Rust `references_mutation_apply` remains the mutation policy authority
- reference citation usage key derivation is now domain-derived too: cited-key set creation from the citation usage index lives in `referenceStoreState.js`, while `src/stores/references.js` keeps the public getter surface
- reference selected target lookup is now Rust-query-owned too: `references_query_resolve` returns selected reference, selected collection/tag, reference lookup maps, and search index, while `src/stores/references.js` only reads those DTOs through `referenceResolvedQueryDto.js` for public getters/actions
- reference document selection lookup and available-reference targets are now Rust-query-owned too: `references_query_resolve` receives `documentReferenceSelections`, returns per-document selected ids/references/key lookup plus available-reference lists/search index, and `referenceResolvedQueryDto.js` only adapts those Rust DTOs for existing synchronous editor/citation APIs
- reference search filtering is now Rust-query-owned too: `references_query_search` receives the current reference snapshot, document-reference selections, TeX path, query and sort key, returns matching library/document/available reference DTOs, and CitationPalette/DocumentReferencesPanel consume those async results instead of rebuilding search haystacks in JS
- reference generated BibTeX sync target resolution is now Rust-owned too: `syncBibFileForTex()` passes the full reference snapshot plus `documentReferenceSelections` to `references_write_bib_file`, and Rust resolves the TeX document's selected references before writing the generated `.bib`
- reference export target resolution is now Rust-owned too: BibTeX export and JSON export actions pass the current references snapshot plus `referenceIds`/`referenceId` through the thin `bibtexExport` bridge, while `references_import.rs` performs ordered id filtering, missing-id skip semantics for BibTeX, JSON target validation, and exported-count reporting
- reference exact-id lookup for synchronous reference/query surfaces now comes from Rust query DTOs: `referenceResolvedQueryDto.js` only reads Rust-returned lookup maps for existing synchronous store APIs; the extra `hasReferenceById` DTO helper is gone, and PDF dock stale-tab pruning uses the Rust-normalized snapshot already passed to the UI dock helper
- reference sidebar/sort selection guards are now Rust-query-owned too: `setSelectedSection()`, `setSelectedSource()`, `setSelectedCollection()`, `setSelectedTag()`, and `setSortKey()` store raw user intent and then let `references_query_resolve` return canonical section/source/collection/tag/sort keys
- reference resolved-query hydration is now Rust-backed too: `src/stores/references.js` no longer builds a pending/default query DTO in JS; `referenceResolvedQueryDto.js` only accepts Rust-returned query DTOs, maps returned fields back to store selection state, and no longer falls back to prior Pinia query state, current selected-reference id, or the first filtered row
- reference sidebar selection reconciliation no longer pre-validates in JS: `src/stores/references.js` clears mutually exclusive UI filters, sends the raw selected key through the query bridge, and hydrates the normalized query result from Rust
- reference document-reference mutation derivation is now Rust-owned too: `setDocumentReferenceIds()`, `addDocumentReference()`, and `removeDocumentReference()` pass raw TeX path/reference id intent to `references_mutation_apply`, while Rust handles TeX path normalization, non-array id fallback, valid reference pruning, duplicate guards, next-id-list calculation and `changed` gating before JS commits the returned snapshot
- reference PDF dock tab state is now domain-derived too: selected-tab checks, open/close/reset state, stale PDF tab pruning, and post-snapshot details fallback decisions live in `referenceStoreState.js`, while `src/stores/references.js` only applies the derived dock state and performs the workspace page switch side effect
- reference cleanup/reset is now Rust-backed too: `referencesStore.cleanup()` clears transient UI flags, then applies an empty snapshot through `references_store_state_build`; workspace close awaits that cleanup before closing the workspace
- reference store bootstrap shell is now Rust-backed: `referenceStoreState.js` only builds the synchronous Pinia UI shell, `references_store_state_build` returns canonical library/source sections, normalized snapshot fields, selected filter keys, sort key and initial resolved query DTO, and app startup hydrates those defaults before workspace reopen
- reference snapshot apply normalization is now Rust-owned too: `applyLibrarySnapshot()` sends raw snapshots through `references_store_state_build`, which combines snapshot normalization and `references_query_resolve` hydration; JS only applies the returned state fields and keeps PDF dock reconciliation as a UI helper
- reference mutation commit selection is now Rust-returned for update/remove/import/add: `src/stores/references.js` passes current selection into `references_mutation_apply` and commits with the returned `preferredSelectedReferenceId`
- extension result preview presentation is now shared too: result preview surfaces derive preview mode, toolbar actions, blocked-action copy, busy keys and action-only empty states from one pure presentation helper instead of keeping action branching inside the Vue preview component
- settings capability cards now consume shared status pieces too: blocked capability badges render through the shared blocked-status chip, blocked capability run actions render through the shared blocked-action button, and ready/unavailable capability states now render through the shared status-pill component instead of keeping a local fifth status shell
- failed extension tasks now keep structured results as a first-class runtime contract: if a command/capability ends with `taskState: failed`, persisted task records still retain the failure artifact/output snapshot and the failure-specific progress label instead of collapsing to error text only
- failed extension tasks are now probe-backed at the frontend result-flow layer too: recent failed tasks still generate previewable result entries, preserve the failure summary card, and keep generic rerun/log follow-up actions wired through the store even when the plugin did not explicitly return those entries
- cancelled extension tasks now keep structured terminal results too: if plugin runtime returns `taskState: cancelled`, persisted task records still preserve cancel-specific artifacts, inline outputs, custom progress labels, task-log previews, and rerun actions instead of collapsing to a bare cancelled state
- runtime state persistence is now probe-backed: plugin `globalState` survives across later host activations and spans workspaces, while `workspaceState` restores only within the originating workspace root
- window message severity is now probe-backed: runtime info/warning/error calls preserve ordering, message text, and severity classification through the host event bridge
- input box request and result semantics are now probe-backed: host request payload fields stay stable, confirm returns the typed value, and cancel resolves back to `undefined`

## Verification

Use one local engineering gate:

```sh
npm run verify
```

It runs:

- `npm run verify:quick`
- `npm run verify:extensions`
- `npm run verify:build`
- `npm run verify:rust`

The quick gate includes:

- `npm run guard:ui-bridges`
- `npm run guard:js-layer-boundaries`
- `npm run guard:pdf-runtime`
- `npm run guard:textmate-runtime`
- `npm run probe:desktop-main-path-runtime-contract`
- `npm run probe:settings-surface-style-ownership`
- `npm run probe:app-shell-frame-style-ownership`
- `npm run probe:workbench-rail-title-style-ownership`
- `npm run probe:file-tree-body-style-ownership`
- `npm run probe:file-tree-overlay-style-ownership`
- `npm run probe:file-tree-actions-boundary`
- `npm run probe:reference-store-state-contract`
- `npm run probe:reference-store-import-workflow-contract`
- `npm run probe:reference-store-mutation-commit-contract`
- `npm run probe:reference-store-export-workflow-contract`
- `npm run probe:reference-detail-actions-boundary`
- `npm run probe:reference-detail-token-actions-boundary`
- `npm run probe:reference-workbench-detail-dock-style-ownership`
- `npm run probe:reference-workbench-main-style-ownership`
- `npm run probe:reference-library-actions-boundary`

`probe:desktop-main-path-runtime-contract` creates an isolated temporary workspace and runs a Rust-backed main-path contract through workspace open/bootstrap, scoped file tree loading, Markdown heading extraction, Markdown preview action/state resolution, LaTeX graph/preview planning, Python file execution, reference library mutation/persistence/query/citation rendering, workspace extension discovery, and workspace close scope cleanup. It is a runtime contract smoke, not a replacement for user-judged desktop visual or interaction review.

The extension gate includes:

- `npm run probe:extension-host`
- `npm run probe:extension-markdown-host`
- `npm run probe:extension-view-result-entries`
- `npm run probe:extension-pdf-view-result-entries`
- `npm run probe:extension-direct-view-host`
- `npm run probe:extension-view-state-contract`
- `npm run probe:extension-execute-command-contract`
- `npm run probe:extension-capability-execution`
- `npm run probe:extension-capability-schema`
- `npm run probe:extension-activation-guards`
- `npm run probe:extension-permission-guards`
- `npm run probe:extension-disable-guards`
- `npm run probe:extension-disable-cancels-running-task-contract`
- `npm run probe:extension-disable-cancels-running-task-store-contract`
- `npm run probe:extension-disable-window-input-contract`
- `npm run probe:extension-disable-window-input-store-contract`
- `npm run probe:extension-cross-extension-prompt-isolation-contract`
- `npm run probe:extension-same-extension-prompt-reentry-contract`
- `npm run probe:extension-prompt-recovery-store-contract`
- `npm run probe:extension-prompt-recovery-workspace-scope-contract`
- `npm run probe:extension-prompt-recovery-descriptor-contract`
- `npm run probe:extension-host-status-surface-contract`
- `npm run probe:extension-host-status-presentation-contract`
- `npm run probe:extension-host-status-recovery-action-contract`
- `npm run probe:extension-host-status-surface-component-contract`
- `npm run probe:extension-runtime-block-presentation-contract`
- `npm run probe:extension-blocked-action-button-contract`
- `npm run probe:extension-blocked-status-chip-contract`
- `npm run probe:extension-tree-primary-button-contract`
- `npm run probe:extension-sidebar-panel-status-contract`
- `npm run probe:extension-count-badge-contract`
- `npm run probe:extension-plugin-container-presentation-contract`
- `npm run probe:settings-extensions-capability-card-contract`
- `npm run probe:extension-workspace-switch-refresh-contract`
- `npm run probe:extension-enable-activation`
- `npm run probe:extension-deactivation-host`
- `npm run probe:extension-runtime-restart-store-contract`
- `npm run probe:extension-host-status-store-contract`
- `npm run probe:extension-command-host-state-contract`
- `npm run probe:extension-command-dispatch-preflight-store-contract`
- `npm run probe:extension-capability-dispatch-preflight-store-contract`
- `npm run probe:extension-action-surface-state-contract`
- `npm run probe:extension-secure-settings-bridge`
- `npm run probe:extension-settings-change-contract`
- `npm run probe:extension-process-contract`
- `npm run probe:extension-reference-pdf-contract`
- `npm run probe:extension-invocation-contract`
- `npm run probe:extension-command-menu-contract`
- `npm run probe:extension-task-contract`
- `npm run probe:extension-task-workspace-scope-contract`
- `npm run probe:extension-task-backend-workspace-scope-contract`
- `npm run probe:extension-task-cancel-contract`
- `npm run probe:extension-task-cancel-store-contract`
- `npm run probe:extension-task-cancelled-result-contract`
- `npm run probe:extension-task-failed-result-contract`
- `npm run probe:extension-task-failed-store-preview-contract`
- `npm run probe:extension-lifecycle-state-contract`
- `npm run probe:extension-capability-invoke-contract`
- `npm run probe:extension-capability-orchestration-contract`
- `npm run probe:extension-capability-sidebar-routing`
- `npm run probe:extension-sidebar-routing`
- `npm run probe:extension-document-action-task-surface`
- `npm run probe:extension-sidebar-surface-style-ownership`
- `npm run probe:extension-task-surface-style-ownership`
- `npm run probe:extension-text-preview-fallback`
- `npm run probe:extension-artifact-preview-entries`
- `npm run probe:extension-task-timeline`
- `npm run probe:extension-host-recovery`
- `npm run probe:extension-window-interruption`
- `npm run probe:extension-host-ui-interruption`
- `npm run probe:extension-treeview-contract`
- `npm run probe:extension-quickpick-multiselect`
- `npm run probe:extension-window-prompt-multiselect`
- `npm run probe:extension-quickpick-host-multiselect`
- `npm run probe:extension-quickpick-contract`
- `npm run probe:extension-host-state-persistence`
- `npm run probe:extension-window-message-severity`
- `npm run probe:extension-inputbox-contract`
- `npm run build`
- `npm run check:bundle`
- `npm run check:rust`
- `npm run test:rust`

Current baseline:

- UI bridge guard passes
- PDF runtime boundary guard passes
- TextMate runtime boundary guard passes
- extension host runtime probe passes
- extension markdown host probe passes
- extension view result-entry merge probe passes
- extension PDF view result-entry merge probe passes
- extension direct-view host probe passes
- extension view-state contract probe passes
- extension nested command contract probe passes
- extension capability execution probe passes
- extension capability schema probe passes
- extension activation guard probe passes
- extension permission guard probe passes
- extension disable guard probe passes
- extension disable-cancels-running-task runtime probe passes
- extension disable-cancels-running-task store contract probe passes
- extension disable-window-input runtime probe passes
- extension disable-window-input store contract probe passes
- extension cross-extension prompt isolation probe passes
- extension same-extension prompt reentry probe passes
- extension prompt recovery store contract probe passes
- extension prompt recovery workspace-scope contract probe passes
- extension prompt recovery descriptor contract probe passes
- extension host-status surface contract probe passes
- extension host-status presentation contract probe passes
- extension host-status recovery action contract probe passes
- extension host-status surface component contract probe passes
- extension runtime-block presentation contract probe passes
- extension blocked-action button contract probe passes
- extension blocked-status chip contract probe passes
- extension tree primary button contract probe passes
- extension sidebar panel status contract probe passes
- extension count badge contract probe passes
- extension plugin container presentation contract probe passes
- extension target presentation contract probe passes
- extension task presentation contract probe passes
- extension result preview presentation contract probe passes
- settings extensions capability card contract probe passes
- extension workspace switch refresh contract probe passes
- extension enable activation probe passes
- extension deactivation host probe passes
- extension runtime restart store contract probe passes
- extension host status store contract probe passes
- extension command host-state contract probe passes
- extension command dispatch preflight store contract probe passes
- extension capability dispatch preflight store contract probe passes
- extension action surface state contract probe passes
- extension secure settings bridge probe passes
- extension settings change contract probe passes
- extension process bridge contract probe passes
- extension references/pdf bridge contract probe passes
- extension workspace/documents/invocation contract probe passes
- extension commands/menu registration contract probe passes
- extension task update contract probe passes
- extension task workspace-scope contract probe passes
- extension task backend workspace-scope contract probe passes
- extension task cancel contract probe passes
- extension task cancel store contract probe passes
- extension task cancelled result contract probe passes
- extension task failed result contract probe passes
- extension task failed store preview contract probe passes
- extension lifecycle state contract probe passes
- extension nested capability contract probe passes
- extension capability orchestration contract probe passes
- extension sidebar routing probe passes
- extension text preview fallback probe passes
- extension artifact preview mapping probe passes
- extension task timeline probe passes
- extension host recovery probe passes
- extension window interruption probe passes
- extension host UI interruption probe passes
- extension tree-view controller contract probe passes
- extension quick-pick multiselect logic probe passes
- extension window prompt multiselect probe passes
- extension quick-pick host multiselect probe passes
- extension quick-pick contract probe passes
- extension host state persistence probe passes
- extension window message severity probe passes
- extension input box contract probe passes
- Vite build passes
- bundle budget passes
- Rust check passes
- Rust tests pass: 225 tests

Isolated desktop startup baseline:

- `npm run tauri:dev:isolated` starts Vite on `http://127.0.0.1:1420/`
- the Tauri process launches `target/debug/scribeflow`
- Rust app-dir logs confirm `get_global_config_dir=/private/tmp/scribeflow-tauri-dev`
- no manual workspace smoke was performed as part of this baseline refresh

Desktop feel, visual layout and interaction quality are user-owned manual checks.

## Runtime Contracts

Heavy runtime boundaries:

- PDFium / EmbedPDF stays behind PDF preview surfaces and `src/services/pdf/*`.
- TextMate / Oniguruma stays behind the LaTeX editor dynamic import path.
- Ordinary JS chunks stay below the bundle budget enforced by `scripts/check-bundle-budget.mjs`.

State contracts:

- workspace lifecycle state is stored under the global ScribeFlow config directory
- workspace-specific state is stored under the resolved workspace data directory
- reference library state is stored under global ScribeFlow references data
- old localStorage and old per-workspace migration paths are no longer part of the runtime contract

## Current Scope

Completed engineering scope:

- research-to-writing reference loop
- citation insertion and usage inspection
- leaf Rustification for read-only parsing, diagnostics, path status and resolver seams
- bundle size and heavy runtime loading guards
- cleanup of historical migration code
- rewritten current documentation and README

Not in scope:

- restoring removed `docs/` or `web/` trees
- reintroducing historical sidecar scripts
- adding automated desktop smoke, visual review or interaction QA
- continuing Rustification into editor shell, shared workflow or UI-local parser code without a new phase decision
