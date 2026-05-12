# ScribeFlow Final Plugin Architecture

Last updated: 2026-05-02

## 1. Decision

ScribeFlow plugins follow an Obsidian-style runtime model, not a full VS Code contribution platform.

The target shape is:

- local folder installed plugins
- canonical `package.json` manifest
- one runtime entrypoint (`main`)
- plugin code registers behavior at runtime through host APIs
- Rust remains system authority
- Vue remains UI rendering layer
- static manifest contributions are reduced to bootstrap metadata, not the primary product model

This is the final direction for ScribeFlow unless product goals change.

## 2. Product Goal

The plugin system exists to let ScribeFlow load self-contained optional features without moving their business logic into the core app.

The plugin system is not designed for:

- public third-party marketplace scale
- arbitrary untrusted code without permission boundaries
- reproducing the full VS Code workbench model

The plugin system is designed for:

- owner-authored plugins
- GitHub-downloaded plugin folders
- local-first desktop workflows
- plugin-specific settings, commands, sidebar views, and document actions
- plugins that call ScribeFlow runtime capabilities instead of patching core source

## 3. Installation Model

Plugin roots:

```text
~/.scribeflow/extensions/
<workspace>/.scribeflow/extensions/
```

Each plugin lives in its own directory:

```text
<plugin-root>/<plugin-id>/
  package.json
  dist/extension.js
  styles.css (optional)
```

Workspace plugins override global plugins with the same `id`.

Users install plugins by downloading a plugin folder and placing it into one of the plugin roots.

## 4. Manifest Role

`package.json` remains the canonical manifest.

The manifest is a bootstrap contract, not the primary behavior contract.

The manifest should keep only:

- `name`
- `displayName`
- `version`
- `main`
- `engines.scribeflow`
- `permissions`
- `configuration`
- optional minimal UI bootstrap metadata

The `permissions` field should describe only host capabilities that ScribeFlow actually enforces at runtime.
Capability ids and capability IO metadata are optional bootstrap metadata, not a required manifest surface for every plugin.

Recommended minimal UI bootstrap metadata:

- plugin settings presence
- sidebar view identity
- optional default command metadata

The manifest should not become the main place where plugin behavior is modeled.

If a capability needs complicated UI or behavior, that behavior belongs in plugin runtime code.

## 5. Runtime Model

Plugin runtime entrypoint:

- `activate(context)`
- optional `deactivate()`

Plugin runtime code is the primary place to define behavior.

Plugins should register behavior directly through runtime APIs such as:

- `context.commands.registerCommand(...)`
- `context.views.registerTreeDataProvider(...)`
- `context.views.createTreeView(...)`
- `context.window.showQuickPick(...)`
- `context.window.showInputBox(...)`
- `context.window.showInformationMessage(...)`
- `context.workspaceState`
- future `context.settings`, `context.toolbar`, `context.menus`, `context.statusBar`

Static declaration is allowed for bootstrap, discovery, permissions, and defaults.
Runtime registration is the main execution model.

Quick input contract note:

- `context.window.showQuickPick(...)` must preserve both single-select and `canPickMany: true` multi-select result shapes
- picked defaults belong to the runtime request contract, not ad hoc frontend-only behavior
- request fields such as `title`, `placeholder`, and default picked items must survive host serialization, and cancel must stay distinct from a concrete selection result
- `context.window.showInformationMessage(...)`, `showWarningMessage(...)`, and `showErrorMessage(...)` must preserve severity semantics through the host event bridge
- `context.window.showInputBox(...)` must preserve request fields (`title`, `prompt`, `placeholder`, `value`, `password`) and keep cancel distinct from confirmed text entry

Tree-view controller contract note:

- `context.views.createTreeView(...).onDidChangeSelection(...)` should receive the runtime tree elements that were resolved for the selected handles, not only frontend-normalized labels
- selection events should preserve selected handles alongside the element payload so plugin runtime code can correlate state without re-resolving the tree
- controller `reveal(...)` should emit root-to-leaf `parentHandles` ordering and preserve both default and explicit `focus`, `select`, and `expand` semantics

Settings change contract note:

- activated plugin runtime should treat host-driven settings updates as an authoritative snapshot, not as a merge that keeps removed keys alive
- `event.keys` should include both updated keys and keys that disappeared from the new snapshot
- `event.values` should reflect the post-update settings snapshot only, with removed keys absent
- no-op settings snapshots should not emit extra runtime change events

Process contract note:

- `context.process.exec(...)` should default `cwd` to the active workspace root when the caller does not provide one
- `context.process.spawn(...).wait()` should preserve the spawned pid and return a stable `{ ok, pid, code }` shape from the Rust bridge
- env values should cross the Rust bridge as strings without requiring plugin-specific shell wrappers
- failing process executions should preserve non-zero exit codes and stderr text
- requested `cwd` values must stay inside the active workspace; outside-workspace requests should fail instead of silently escaping the scope boundary

Reference and PDF contract note:

- `context.references.current` and `context.pdf.current` should preserve the invocation `referenceId`, active PDF path, and derived filename without forcing plugin code to reconstruct them from the envelope
- `context.references.readCurrentLibrary()` should return the normalized reference snapshot shape from the Rust bridge, not a plugin-local cache
- `context.pdf.extractMetadata()` and `context.pdf.extractText()` should resolve the active PDF by default when the caller omits `filePath`
- PDF inspection should obey workspace/reference-library path boundaries and surface an explicit runtime error for out-of-scope paths

Workspace, documents, and invocation contract note:

- `context.workspace.rootPath` and `context.workspace.current` should expose the active workspace root directly, while preserving an explicit empty-state shape when no workspace is open
- `context.documents.resource` should preserve the host-derived resource kind, filename, dirname, extension, and language-derived booleans for the active target
- `context.documents.target` should preserve the invocation target payload exactly enough for plugin code to reason about `kind`, `referenceId`, and `path`
- `context.invocation.current` should surface the same stable task, command, reference, target, and resource context that the host used for the current request, instead of requiring plugins to infer or cache it elsewhere

Commands and menus contract note:

- `context.commands.executeCommand(...)` should resolve runtime-registered commands by id and preserve the callee's returned task payload instead of collapsing it into a fire-and-forget side effect
- nested `context.commands.executeCommand(...)` should preserve the callee's `changedViews` union, including both explicit `changedViews` entries and host-tracked `views.refresh(...)` requests, so outer command flows can surface the full refresh set
- nested `context.commands.executeCommand(...)` should surface runtime command failures and missing-command errors as catchable exceptions inside plugin code rather than collapsing them into host-level timeouts
- `context.menus.registerAction(...)` should preserve per-surface runtime metadata such as `surface`, `commandId`, `title`, and `when`
- disposed runtime menu actions should disappear from subsequent activation snapshots rather than leaking stale action metadata
- runtime-registered command palette actions should stay authoritative over manifest fallbacks once runtime menu data exists

Capability invoke contract note:

- nested `context.capabilities.invoke(...)` should preserve the callee result payload instead of collapsing into a host-local side effect
- nested `context.capabilities.invoke(...)` should surface runtime capability failures and missing-provider errors as catchable exceptions inside plugin code
- nested `context.capabilities.invoke(...)` should preserve the callee's `changedViews` union, including both explicit `changedViews` entries and host-tracked `views.refresh(...)` requests, so capability orchestration stays symmetric with nested commands
- top-level capability execution should propagate that aggregated `changedViews` set back through the host response so Rust task orchestration and frontend view invalidation consume the same refresh contract
- a capability provider should also be free to mix `tasks.update(...)`, `views.updateView(...)`, and `views.refresh(...)` in one orchestration flow, with the host preserving the running task snapshot, pushed view state, and returned `changedViews` without requiring plugin-specific glue

Task update contract note:

- `context.tasks.update(...)` should preserve non-terminal task ownership so a spawned worker can still complete `spawn(...).wait()` after intermediate `running` progress updates
- terminal task updates should reap spawned-process ownership from the Rust runtime without deleting the persisted task record
- `artifacts` and `outputs` on task updates should follow replace-on-present semantics: omitted fields keep the current value, while provided arrays replace the persisted snapshot, including explicit empty arrays
- intermediate and final task updates should preserve structured `outputs` through the Rust bridge instead of dropping them at the task patch boundary
- the formal task-cancel path should also reap spawned-process ownership, preserve the task's persisted terminal state as `cancelled`, and avoid erasing the last running snapshot while cancellation is being recorded
- frontend task timelines should consume that cancel result without extra reconciliation glue: a cancelled task should leave the running bucket, appear in recent history, and keep its last meaningful output snapshot available for inspection
- cancelled terminal task results should preserve the same structured result channels as success and failed paths: cancel-specific artifacts, inline outputs, and custom progress labels must survive persistence instead of collapsing into only `state=cancelled`
- failed terminal task results should preserve the same structured result channels as success paths: failure artifacts, inline outputs, and failure-specific progress labels must survive persistence instead of collapsing into a bare error string
- frontend result-entry generation and follow-up actions should stay symmetric for failed tasks too: once a failed task lands in recent history, its failure summary, log artifact, and rerun action should remain available through the same preview/action pipeline as success paths

View state contract note:

- `context.views.updateView(...)` for normal view providers should remain authoritative across a later `ResolveView` refresh instead of reverting immediately to the provider baseline
- pushed view-state fields should overlay only the fields the plugin actually patched; untouched fields should continue to refresh from the latest provider baseline on subsequent `ResolveView` calls
- pushed `resultEntries`, `artifacts`, and `outputs` should survive later refreshes until the plugin replaces them with another pushed snapshot
- tree-view refresh should keep consuming the stored host view state, while normal view providers should merge the latest provider baseline with the stored pushed patch

Lifecycle state contract note:

- persisted extension `settings` from the Rust settings store should still hydrate into the next activation after a host crash, not only after a clean deactivate/reactivate cycle
- runtime-owned `globalState` should survive across deactivate, reactivate, and crash-recovery activation for the same extension id
- runtime-owned `workspaceState` should survive the same lifecycle within one workspace root but stay isolated across different workspace roots
- process-local plugin counters may reset after a host crash, but persisted state channels and saved settings must recover on the next activation

## 6. Host Boundary

Rust remains runtime authority for:

- filesystem access
- workspace scope enforcement
- process spawning
- reference library mutation
- PDF and document runtime capabilities
- persistence
- plugin security and permission enforcement

The Node plugin host remains runtime execution surface for:

- plugin code loading
- `activate(context)`
- runtime API objects
- plugin event dispatch
- plugin-local state and subscriptions

Vue remains presentation layer for:

- rendering plugin-owned surfaces
- showing prompts, toasts, and plugin panels
- translating user interaction back to host events

Plugins should not need to understand Rust/Tauri internals to build normal features.

Result contract rule:

- task execution, capability execution, direct views, and pushed view state all flow through the same `resultEntries + artifacts + outputs` model
- `resultEntries` are the explicit plugin-authored UI contract
- `artifacts` and `outputs` are the canonical machine-facing result channels the host may turn into default preview entries
- explicit `resultEntries` win over host-generated defaults with the same id
- task artifacts are envelope-authoritative and cannot spoof `taskId`, `capability`, or `extensionId`
- direct view artifacts and pushed view-state artifacts may intentionally preserve explicit metadata because they describe view-owned state rather than task-owned execution records
- persistent host recovery is part of the runtime contract: if the Node extension host crashes, Rust must detect the dead process, clear broken stdio handles, and let the next request respawn the host instead of leaving the platform in a broken-pipe state
- pending prompt waits must be interruption-aware: if the host dies after requesting UI, Rust should fail the wait immediately instead of relying on long timeouts, and frontend prompt state should clear on the interruption event

## 7. API Philosophy

ScribeFlow should expose a thick host API instead of a large static contribution schema.

The long-term top-level runtime API families should be:

- `context.commands`
- `context.window`
- `context.views`
- `context.workspace`
- `context.documents`
- `context.pdf`
- `context.references`
- `context.storage`
- `context.process`

This is the core architectural difference from the earlier VS Code-heavy direction.

## 8. UI Extension Points

The first-class UI extension points should be limited and explicit:

- command palette
- toolbar / action buttons
- document right sidebar tabs and plugin-owned views inside those tabs
- item context actions
- settings section / settings tab
- modal / prompt surfaces

Product rule:

- Settings is a plugin management surface, not the normal operational work surface
- a normal plugin should map to one document right-sidebar tab/container
- document and PDF actions should route users into that plugin-owned sidebar tab instead of into Settings
- right-sidebar context copy, including active file/reference target summaries, should come from shared presentation contracts rather than per-component string branching

Do not model every UI surface through generic manifest contribution tables unless there is a strong need.

If a plugin needs a more custom surface later, add a dedicated runtime API rather than growing a generic static schema first.

## 9. State Model

Plugins should get two persistence scopes:

- `globalState`
- `workspaceState`

`workspaceState` is already the more important one for ScribeFlow.

Long-term plugin settings should be treated as host-managed configuration data, not ad hoc plugin file IO.

Persistence contract note:

- `globalState` and `workspaceState` are runtime-owned persisted channels, not in-memory conveniences
- updates emitted from plugin runtime must survive later host activations and be restored before the next `activate(context)` logic runs
- `globalState` is shared across workspaces for the same extension id, while `workspaceState` is keyed by workspace root and must stay isolated across different workspaces

## 10. Settings Model

Plugin settings remain declared in manifest schema so the host can render a settings surface without hardcoding per-plugin UI.

But settings behavior should still be runtime-oriented:

- manifest defines the keys and defaults
- manifest schema may mark secret fields with `secureStorage: true` so the host stores them in keychain-backed storage instead of plain `extension-settings.json`
- runtime reads resolved values from host APIs
- plugin logic interprets settings locally

Compatibility note:

- secret-like keys still fall back to keychain-backed storage for compatibility, but plugin manifests should declare `secureStorage: true` explicitly and the registry warns when that contract is missing

The settings page should communicate:

- install source
- runtime entrypoint
- permissions
- available runtime capabilities
- registered commands and views
- settings schema

It should not imply that manifest contributions alone define the whole plugin.

Translation-oriented boundary:

- provider defaults and non-secret knobs may live in host-managed plugin settings
- runtime task execution, progress, result summary and artifact links belong in the document right sidebar
- external OCR / LLM work should fit either a sidecar process or another local worker behind `context.process`
- password-like plugin settings declared with `secureStorage: true` already use secure host-managed storage, legacy plaintext values are migrated on load, and undeclared secret-like keys remain a compatibility fallback rather than the preferred contract

Verification-oriented note:

- plugin contracts should be treated as real only when covered by `npm run verify`
- the current gate includes host activation, capability schema, activation guards, permission guards, sidebar routing, right-sidebar target presentation, result-entry derivation, direct-view host behavior, host crash recovery, window prompt interruption cleanup, bundle budget, Rust check, and Rust tests
- the current gate includes host activation, capability schema, activation guards, permission guards, secure settings bridge behavior, runtime settings snapshot-change semantics, process bridge exec/spawn/wait semantics, reference and PDF host-call semantics, workspace/documents/invocation surface semantics, command and menu runtime registration semantics, sidebar routing, result-entry derivation, direct-view host behavior, host crash recovery, window prompt interruption cleanup, tree-view controller selection and reveal semantics, quick-pick request-result semantics, quick-pick multi-select roundtrips, state persistence restore, window message severity routing, input box request-result semantics, bundle budget, Rust check, and Rust tests
- probes should be preferred over prose whenever a contract can drift silently

## 11. Current Compatibility Rule

Current extension code already uses:

- commands
- tree views
- reveal
- selection events
- quick pick
- input box

These stay valid.

But future work should favor:

- runtime registration over more static `contributes.*` growth
- dedicated host APIs over larger contribution normalization layers
- plugin runtime ownership over core-app special casing

## 12. What To Avoid

Do not continue toward:

- full VS Code workbench parity as the main architecture
- contribution-schema-first feature design
- plugin behavior that depends on core app custom wiring for each plugin
- exposing raw Tauri implementation details to plugin authors

## 13. Migration Direction

The platform should evolve in this order:

1. Keep current manifest and host compatibility.
2. Reframe the platform as runtime-registration-first.
3. Move more surfaced behavior behind direct runtime APIs.
4. Reduce frontend dependence on normalized manifest contribution tables where runtime registrations can own the same responsibility.
5. Keep Rust authority unchanged.

## 14. Acceptance Standard

ScribeFlow plugin architecture is considered “correct” when:

- a new plugin can be added by dropping a folder into the plugin root
- the plugin can declare settings and permissions in manifest
- the plugin can register commands and views from `activate(context)`
- the plugin can call host APIs without modifying core product files
- core app code does not need plugin-specific UI logic for normal plugin features

That is the target standard for future refactors.
