# ScribeFlow Plugin Platform

Last updated: 2026-05-01

This document describes the current plugin platform implementation.

For the final architecture direction, read:

- [PLUGIN-ARCHITECTURE.md](/Users/math173sr/Documents/GitHub/ScribeFlow/PLUGIN-ARCHITECTURE.md)

## 1. Current Position

ScribeFlow already has a working plugin runtime:

- local plugin folder discovery
- canonical `package.json` manifest
- `activate(context)`
- persistent Node plugin host
- Rust authority for secure system capabilities
- Vue-rendered plugin UI surfaces

The platform currently still contains some VS Code-style contribution concepts, but those are now transitional bootstrap mechanisms, not the long-term architectural center.

## 2. Current Folder Model

Plugin roots:

```text
~/.scribeflow/extensions/
<workspace>/.scribeflow/extensions/
```

Example:

```text
.scribeflow/extensions/example-pdf-extension/
  package.json
  dist/extension.js
```

## 3. Current Runtime Capabilities

Plugins can already use:

- `commands.registerCommand(...)`
- `commands.executeCommand(...)`
- `menus.registerAction(...)`
- `views.registerTreeDataProvider(...)`
- `views.createTreeView(viewId)`
- `views.reveal(...)`
- `views.updateView(...)`
- `window.showInformationMessage(...)`
- `window.showWarningMessage(...)`
- `window.showErrorMessage(...)`
- `window.showQuickPick(...)`
- `window.showInputBox(...)`
- `workspace.rootPath`
- `workspace.hasWorkspace`
- `documents.resource`
- `documents.target`
- `references.current`
- `references.readCurrentLibrary()`
- `pdf.current`
- `pdf.extractText(filePath?)`
- `pdf.extractMetadata(filePath?)`
- `process.exec(command, options?)`
- `process.spawn(command, options?)`
- `process.wait(pid)`
- `tasks.current`
- `tasks.update(patch)`
- `invocation.current`
- `settings.onDidChange(...)`
- `workspaceState`

Runtime command behavior now follows the host registry first:

- plugins may register runtime-only commands inside `activate(context)` without mirroring every internal command in manifest bootstrap metadata
- command execution is accepted when the host runtime registry reports the command, even if the command is omitted from `contributes.commands`
- command palette visibility still follows explicit menu registration, so internal runtime commands do not leak into top-level UI by default

Tree view support already includes:

- host-resolved root and child items
- reveal / expand / select
- selection change events

Runtime action registration already covers:

- `commandPalette`
- `pdf.preview.actions`
- `view/title`
- `view/item/context`

Runtime result delivery follows one canonical shape:

- `resultEntries`: explicit user-facing actions or previews declared by plugin runtime code
- `artifacts`: file-backed outputs that the host can open, reveal, route, and derive default preview entries from
- `outputs`: structured inline payloads such as `inlineText` and `inlineHtml` that the host can also derive default preview entries from

Current precedence and ownership contract:

- explicit `resultEntries` always win when ids collide
- host-generated default entries from `artifacts` and `outputs` only fill missing gaps
- task result artifacts are host-owned metadata and are anchored to the runtime invocation envelope
- view-owned artifacts returned from `ResolveView` or pushed through `views.updateView(...)` may preserve explicit plugin metadata such as `taskId` and `capability`

This contract is probe-backed, not just descriptive prose.

Task progress delivery also has a probe-backed runtime contract:

- plugins may push intermediate task state through `tasks.update(...)` without losing ownership of a still-running spawned worker
- terminal task updates remain responsible for cleaning up spawned worker ownership in the Rust runtime
- task `artifacts` and `outputs` are replace-on-present snapshots, so plugin code can either keep existing values by omitting a field or replace the persisted value by sending a new array, including an explicit empty array
- the formal cancel path now has its own contract too: cancelling a running task preserves the persisted `cancelled` state and clears spawned worker ownership from the runtime instead of leaving the process registry dirty
- plugin runtime may also return `taskState: cancelled` with structured terminal results, and those cancel-specific artifacts/outputs/progress labels now survive persistence instead of collapsing into only the cancelled state
- the frontend task panel/store flow is now covered too: once cancel completes, the task timeline moves that task out of Running into Recent while preserving the last output snapshot for follow-up inspection
- failed task completions now preserve structured failure results too: when plugin runtime returns `taskState: failed`, the persisted task keeps failure artifacts, inline outputs, and the failure progress label instead of collapsing into only `error`
- failed task results now stay actionable in the frontend too: recent failed tasks still expose previewable result entries plus rerun/log actions through the same task-panel preview flow

View-state delivery also has a probe-backed runtime contract:

- `views.updateView(...)` on a normal view provider persists as a pushed overlay across later host refreshes
- pushed fields such as `message`, `statusLabel`, `resultEntries`, `artifacts`, and `outputs` stay authoritative until replaced by another pushed patch
- untouched fields such as baseline descriptions, badges, and sections still refresh from the provider on later `ResolveView` calls

Nested command delivery also has a probe-backed runtime contract:

- `commands.executeCommand(...)` can synchronously call another runtime-registered command and preserve that callee's returned payload
- nested command failures and missing-command cases remain catchable inside plugin code as normal exceptions
- nested command-triggered view refresh signals still surface through `changedViews`, including both explicit ids and host-tracked `views.refresh(...)` requests

Lifecycle-state delivery also has a probe-backed runtime contract:

- persisted extension `settings` survive clean reactivation and host-crash recovery because Rust rehydrates them into the next activation request
- `globalState` survives across deactivate, reactivate, and crash recovery for the same extension id
- `workspaceState` survives the same lifecycle only within its originating workspace root and stays isolated from other workspaces
- plugin-local in-memory counters may reset after a host crash; only persisted settings and runtime state channels are guaranteed to recover

Nested capability delivery also has a probe-backed runtime contract:

- `capabilities.invoke(...)` can synchronously call another runtime-registered capability and preserve that callee's returned payload
- nested capability failures and missing-provider cases remain catchable inside plugin code as normal exceptions
- nested capability-triggered view refresh signals still surface through `changedViews`, including both explicit ids and host-tracked `views.refresh(...)` requests
- the top-level capability invocation response now returns that same aggregated `changedViews` set, so frontend task execution can invalidate plugin views without reconstructing refresh intent from side-channel events
- capability providers may also orchestrate `tasks.update(...)` and `views.updateView(...)` in the same invocation, and the host now treats that running-task snapshot plus pushed view state as part of the same stable contract rather than as unrelated side effects

## 4. Current Manifest Use

`package.json` is still used for:

- discovery
- versioning
- entrypoint
- permissions
- settings schema
- basic command / view bootstrap metadata

In practice this means:

- keep sidebar/view identity, default user-facing command metadata, permissions, and settings schema in manifest
- keep internal helper commands, richer behavior wiring, and action registration in runtime code when they do not need standalone bootstrap UI
- treat manifest permissions as the Rust-backed host capabilities that are actually enforced today: workspace files, reference library, and local process spawning
- keep capability ids and capability IO schema in manifest only when the plugin actually benefits from that bootstrap metadata; they are not mandatory for every plugin package

But the intended direction is runtime-registration-first.

That means:

- manifest should stay small
- plugin behavior should live mainly in runtime code
- future features should prefer host APIs over more static contribution schema growth

## 5. Current UI Surfaces

Plugins can currently appear in:

- command palette
- action buttons
- document right sidebar tabs and plugin-owned views inside those tabs
- tree item context actions
- plugin settings page
- host-rendered quick input surfaces

Current usage rule:

- Settings is for discovery, lifecycle control, permissions and configuration
- normal plugin workflows should run from the document right sidebar after setup
- plugin-owned PDF/document actions should focus the matching plugin right-sidebar tab by default
- document right-sidebar target summaries are shared presentation output, so active path/reference context copy should not drift across plugin surfaces

## 6. Current Gap

The platform contract is now aligned with the intended local owner-authored runtime model.

Remaining cleanup direction:

- keep expanding thick host APIs beyond `workspace`, `documents`, `references`, `pdf`, and `process`
- make settings and registered runtime capabilities clearer in the UI
- avoid growing the workbench model just for parity with VS Code

## 7. Translation Plugin Boundary

For a future PDF translation plugin such as `retain-pdf`, the current platform boundary should be:

- Settings stores provider defaults and non-secret configuration
- the document right sidebar hosts task state, source context, result summary, and artifact entry points
- plugin runtime may orchestrate work through `context.process` when a sidecar or local worker is needed
- password-like plugin settings declared with `secureStorage: true` are redirected into secure host-managed storage instead of plain extension settings files, with legacy plaintext values migrated during load; older secret-like keys still use a compatibility fallback and should be upgraded to explicit `secureStorage`

Current production-oriented guidance:

- prefer secure host-managed plugin secrets for API keys and tokens; use env-based or sidecar-managed credentials only when the plugin needs a more complex external auth model
- keep OCR / LLM execution outside the core UI layer
- keep translated PDFs and related outputs flowing back as normal plugin tasks and artifacts

## 7. Working Rule

When adding new plugin features:

- prefer runtime API design first
- keep manifest minimal
- keep Rust as system authority
- keep plugin business logic inside plugin code
- do not add plugin-specific core-app wiring unless absolutely necessary
