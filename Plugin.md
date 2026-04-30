# ScribeFlow Extension Platform

Last updated: 2026-04-30

## 1. Contract

ScribeFlow now treats external capability packages as extensions, not legacy plugins.

The platform model follows the VS Code direction:

- extension packages live under extension roots
- `package.json` is the canonical manifest
- `main` points to extension code
- extension code exports `activate(context)`
- activation is driven by `activationEvents`
- extensions register commands and capability providers through the host API
- command palette, contributed menus and contributed keybindings all execute extension commands
- product UI calls contributed actions/providers, not package-specific runtime code

Contributed commands and capabilities are also valid activation triggers, matching the modern VS Code behavior where command contributions do not need duplicate `onCommand:*` entries just to become runnable.

The old direct runner model is not a supported compatibility layer. If a future PDF translator, OCR tool, LLM workflow, or reference enrichment package is added, it must be shaped as a ScribeFlow extension package and run through the extension host boundary.

## 2. Directory Model

Extension roots:

```text
~/.scribeflow/extensions/
<workspace>/.scribeflow/extensions/
```

Workspace extensions are project-local. Global extensions are user-local. If the same extension id exists in both places, workspace scope should win for that workspace and the registry should surface the active source clearly.

Example package:

```text
.scribeflow/extensions/example-pdf-extension/
  package.json
  dist/extension.js
```

## 3. Canonical Manifest

Manifest filename:

```text
package.json
```

Minimum shape:

```json
{
  "name": "example-pdf-extension",
  "displayName": "Example PDF Extension",
  "version": "0.1.0",
  "main": "dist/extension.js",
  "activationEvents": ["onCapability:pdf.translate"],
  "contributes": {
    "commands": [
      {
        "command": "scribeflow.pdf.translate",
        "title": "Translate"
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "examplePdfExtension.tools",
          "title": "PDF Tools"
        }
      ]
    },
    "views": {
      "examplePdfExtension.tools": [
        {
          "id": "examplePdfExtension.translateView",
          "name": "Translate PDF",
          "when": "resourceExtname == .pdf || resource.kind == pdf"
        }
      ]
    },
    "menus": {
      "commandPalette": [
        {
          "command": "scribeflow.pdf.translate",
          "when": "resourceExtname == .pdf || resource.kind == pdf"
        }
      ],
      "pdf.preview.actions": [
        {
          "command": "scribeflow.pdf.translate",
          "when": "resource.kind == pdf"
        }
      ]
    },
    "keybindings": [
      {
        "command": "scribeflow.pdf.translate",
        "key": "mod+alt+t",
        "when": "resource.kind == pdf"
      }
    ],
    "capabilities": [
      {
        "id": "pdf.translate"
      }
    ],
    "configuration": {
      "properties": {}
    }
  },
  "permissions": {
    "readWorkspaceFiles": true,
    "writeArtifacts": true,
    "spawnProcess": false,
    "network": "none"
  }
}
```

## 4. Runtime Boundary

Rust remains the runtime authority:

- discovers extension packages
- validates manifest shape and permissions
- owns workspace security
- owns task state
- owns artifact directories
- starts and talks to the extension host process
- exposes Tauri commands to the frontend

The extension host owns extension execution:

- loads extension modules
- calls `activate(context)`
- keeps activated extensions in memory
- provides command and capability registration APIs
- invokes registered providers

Vue remains the UI layer:

- renders extension registry state
- renders contributed actions
- starts extension tasks through `src/services`
- shows task progress, logs, and artifacts
- never imports Tauri APIs outside `src/services`

## 5. Context Keys

Menus, command palette entries and keybindings share one `when` context model.

Supported context keys include:

- `resource.kind` and `resourceKind`
- `resource.path` and `resourcePath`
- `resource.extname` and `resourceExtname`
- `resource.filename` and `resourceFilename`
- `resource.langId` and `resourceLangId`
- `resource.scheme` and `resourceScheme`
- `resource.referenceId`
- `resourceIsPdf`, `resourceIsMarkdown`, `resourceIsLatex`, `resourceIsPython`
- `activeView`
- `workbench.surface`
- `workbench.panel`
- `workspaceFolder`

Supported boolean syntax currently includes `&&`, `||`, `!key`, `key == value` and `key != value`.

## 6. View Containers

Extensions can now contribute left-sidebar containers through:

- `contributes.viewsContainers.activitybar`
- `contributes.views`

Current behavior:

- each contributed container becomes a workspace sidebar target with panel id `extension:<containerId>`
- the workspace mode menu surfaces those containers beside `Document Area` and `Reference Library`
- each contributed view is filtered by the shared `when` context
- the current sidebar rendering is intentionally minimal and command-first: clicking a contributed view runs the extension's first contributed command

This is a real extension-owned navigation surface, but not yet a full VS Code `TreeView`/custom webview API.

## 7. Rust Modules

Current extension platform modules:

- `extension_manifest.rs`: canonical manifest parsing and validation
- `extension_registry.rs`: global/workspace extension discovery and registry entries
- `extension_permissions.rs`: permission validation
- `extension_host.rs`: persistent extension host process, activation, request/response protocol, and test-only in-process dispatcher
- `extension_commands.rs`: command-first execution adapter into the extension host
- `extension_tasks.rs`: host-owned long-running task state
- `extension_artifacts.rs`: host-owned artifact opening and revealing
- `extension_settings.rs`: persisted extension enablement and configuration

No ScribeFlow-owned `plugin_*` Rust modules should exist.

## 8. Frontend Modules

Current frontend extension modules:

- `src/services/extensions/extensionRegistry.js`
- `src/services/extensions/extensionCommands.js`
- `src/services/extensions/extensionTasks.js`
- `src/services/extensions/extensionArtifacts.js`
- `src/stores/extensions.js`
- `src/domains/extensions/extensionContext.js`
- `src/domains/extensions/extensionContributionRegistry.js`
- `src/domains/extensions/extensionKeybindings.js`
- `src/components/extensions/ExtensionActionButtons.vue`
- `src/components/extensions/ExtensionCommandButton.vue`
- `src/components/extensions/ExtensionCommandPalette.vue`
- `src/components/extensions/ExtensionSidebarPanel.vue`
- `src/components/extensions/ExtensionTaskPanel.vue`
- `src/components/settings/SettingsExtensions.vue`

No ScribeFlow-owned `src/services/plugins`, `src/stores/plugins.js`, or `src/components/plugins` path should exist.

## 9. Host Protocol

Rust sends camelCase request payloads to the Node host:

- `extensionId`
- `activationEvent`
- `extensionPath`
- `manifestPath`
- `mainEntry`
- `envelope`

The Node host returns typed responses:

- `Activate`
- `InvokeCapability`
- `ExecuteCommand`
- `Error`

The field name must remain `extensionId` end to end. Do not reintroduce `pluginId` aliases in the host protocol.

## 10. Test Structure

`extension_host.rs` keeps test and non-test runtime paths separated:

- non-test builds own the child process state, Node host script path, stdio process startup, and real host invocation
- test builds use the in-process dispatcher and do not compile unused child process fields
- `ExtensionHostState::default()` is hand-written so test builds do not carry dead process members

This split is intentional. It keeps the production extension host real while keeping unit tests deterministic and warning-free.

## 11. Product Language

Product-facing language is extension-first:

- Settings label: Extensions
- Registry action: Refresh Extension Registry
- Runtime operation: extension task
- Package concept: extension
- Command launcher: extension command palette
- Shortcut contribution: extension keybinding
- Sidebar contribution: extension view container

Avoid user-facing text such as plugin jobs, installed plugins, plugin action, plugin virtual environment, or plugin-local server for ScribeFlow-owned extension features.

Third-party package names and framework APIs can still contain the word `plugin`, for example:

- Tauri plugin APIs
- Vite plugin APIs
- CodeMirror `ViewPlugin`
- EmbedPDF plugin package names

Those are external API names and should not be mechanically renamed.

## 12. Verification

Primary gate:

```sh
npm run verify
```

Expected coverage:

- UI bridge boundary guard
- PDF runtime boundary guard
- TextMate runtime boundary guard
- Vite build
- bundle budget check
- Rust check
- Rust tests

Before claiming the extension platform cleanup is finished, also check:

```sh
rg -n "plugin_manifest|plugin_registry|plugin_permissions|plugin_jobs|plugin_artifacts|plugin_runner|plugin_settings|pluginId|src/services/plugins|src/components/plugins|\\.scribeflow/plugins" src src-tauri/src src-tauri/resources .scribeflow
```

Only external framework/package API names should remain when searching for the generic word `plugin`.
