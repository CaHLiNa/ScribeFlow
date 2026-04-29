# Plugin Host Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Keep the plugin host contract stable before wiring specific plugins. Every task must leave the desktop main path buildable and must use `npm run verify` before final handoff.

**Goal:** Build a durable ScribeFlow plugin host so external capabilities such as PDF translation, OCR, local LLM tools and reference enrichment can be added without embedding third-party project source into the main app.

**Architecture:** Rust owns plugin discovery, manifest validation, permissions, process execution, job state and artifact writes. Vue owns settings, user intent, progress display and result navigation. `src/services` remains the only Tauri bridge layer.

**Tech Stack:** Tauri v2, Rust, Vue 3, Pinia, JSON manifest files, CLI process execution through existing process utilities, existing app data root under `~/.scribeflow`.

---

## 1. Product Decision

The plugin system is not a marketplace and not an arbitrary code injection runtime in v1. It is a local capability host.

The first real proving plugin is `pdf2zh` / PDFMathTranslate for `pdf.translate`, but the system must not be hard-coded around PDF translation. The PDF translator is an integration test for the host contract.

ScribeFlow responsibilities:

- discover installed plugin manifests
- validate plugin shape and permission declarations
- show installed capabilities in settings
- let users enable or disable plugins
- detect missing external commands
- run approved plugin jobs
- stream progress and logs
- cancel long-running jobs
- write artifacts into ScribeFlow-controlled output locations
- attach artifacts to reference, document or workspace records

Plugin responsibilities:

- declare capabilities
- declare runtime backend
- declare inputs and outputs
- provide executable command or endpoint details
- write outputs only to ScribeFlow-provided paths

## 2. Non-Goals For v1

- No online plugin store.
- No automatic third-party plugin update.
- No bundled third-party source trees.
- No arbitrary JavaScript UI injection.
- No dynamic Rust library loading.
- No plugin access to Pinia stores or Vue component internals.
- No plugin-managed files outside approved artifact roots.
- No silent network access.
- No automatic data migration from old plugin experiments.

## 3. Plugin Directory Model

Use two roots from day one:

```text
~/.scribeflow/plugins/
<workspace>/.scribeflow/plugins/
```

Global plugins are installed for the user and treated as read-only manifests by the app UI. Workspace plugins are project-specific and can be created or edited by ScribeFlow later.

Each plugin lives in its own directory:

```text
~/.scribeflow/plugins/pdfmathtranslate/
  plugin.json
  README.md
```

Workspace plugins use the same shape:

```text
<workspace>/.scribeflow/plugins/pdfmathtranslate/
  plugin.json
  README.md
```

The app must show source scope explicitly:

- `global`
- `workspace`

If the same plugin id exists in both scopes, workspace scope wins for that workspace. The registry must surface an override warning so the user can see which manifest is active.

## 4. Manifest Contract

Manifest file name:

```text
plugin.json
```

Schema version:

```json
{
  "schemaVersion": 1
}
```

Required fields:

```json
{
  "schemaVersion": 1,
  "id": "pdfmathtranslate",
  "name": "PDFMathTranslate",
  "version": "1.0.0",
  "description": "Translate scientific PDFs through the local pdf2zh CLI.",
  "capabilities": ["pdf.translate"],
  "runtime": {
    "type": "cli",
    "command": "pdf2zh"
  },
  "permissions": {
    "readWorkspaceFiles": true,
    "readReferenceLibrary": true,
    "writeArtifacts": true,
    "writeReferenceMetadata": false,
    "spawnProcess": true,
    "network": "optional"
  },
  "settingsSchema": {
    "targetLanguage": {
      "type": "string",
      "default": "zh",
      "label": "Target language"
    },
    "bilingual": {
      "type": "boolean",
      "default": true,
      "label": "Generate bilingual PDF"
    }
  },
  "inputs": {
    "pdfPath": {
      "type": "file",
      "required": true,
      "extensions": ["pdf"]
    }
  },
  "outputs": {
    "translatedPdf": {
      "type": "artifact",
      "mediaType": "application/pdf",
      "required": false
    },
    "bilingualPdf": {
      "type": "artifact",
      "mediaType": "application/pdf",
      "required": false
    },
    "log": {
      "type": "artifact",
      "mediaType": "text/plain",
      "required": true
    }
  }
}
```

Supported runtime types in v1:

- `cli`

Reserved runtime types:

- `http`
- `mcp`
- `builtin`

The manifest parser must accept only `cli` in v1 and return a typed unsupported-runtime error for the reserved types. This prevents accidental partial implementations while preserving the schema path.

## 5. Capability Registry

Capabilities are product contracts, not plugin names.

Initial allowed capabilities:

```text
pdf.translate
pdf.ocr
pdf.extractText
reference.enrich
reference.import
document.summarize
document.transform
workspace.index
llm.chat
```

Only `pdf.translate` needs a full v1 end-to-end path. The others can be registered as known capability ids so the manifest contract does not need to change later.

Capability rules:

- A plugin may declare multiple capabilities.
- A UI surface must request a capability, not a specific plugin id.
- If multiple enabled plugins provide one capability, the user chooses a default provider.
- Capability invocation receives a typed input envelope and returns a job id.

Example invocation envelope:

```json
{
  "capability": "pdf.translate",
  "pluginId": "pdfmathtranslate",
  "target": {
    "kind": "referencePdf",
    "referenceId": "ref-123",
    "path": "/absolute/path/paper.pdf"
  },
  "settings": {
    "targetLanguage": "zh",
    "bilingual": true
  }
}
```

## 6. Permission Model

Permissions are visible and enforced by Rust.

Manifest permission fields:

```json
{
  "readWorkspaceFiles": true,
  "readReferenceLibrary": false,
  "writeArtifacts": true,
  "writeReferenceMetadata": false,
  "spawnProcess": true,
  "network": "none"
}
```

`network` values:

- `none`
- `optional`
- `required`

Runtime enforcement:

- `cli` plugins require `spawnProcess: true`.
- File input paths must pass existing workspace or registered external-path checks.
- Output paths are generated by ScribeFlow, not by the plugin manifest.
- The runner passes output directory as an argument or environment variable.
- The runner rejects relative executable names containing separators.
- A plugin cannot request arbitrary shell command strings in v1.

User-facing permission states:

- `available`: manifest is valid and runtime is detected
- `missingRuntime`: command not found or version check failed
- `disabled`: user disabled this plugin
- `blocked`: manifest requests unsupported permission
- `invalid`: schema or validation failed

## 7. Job Runtime

Plugin execution is always a job.

Job states:

```text
queued
running
succeeded
failed
cancelled
```

Job fields:

```json
{
  "id": "plugin-job-uuid",
  "pluginId": "pdfmathtranslate",
  "capability": "pdf.translate",
  "state": "running",
  "createdAt": "2026-04-30T00:00:00Z",
  "startedAt": "2026-04-30T00:00:01Z",
  "finishedAt": "",
  "target": {
    "kind": "referencePdf",
    "referenceId": "ref-123",
    "path": "/absolute/path/paper.pdf"
  },
  "progress": {
    "label": "Translating PDF",
    "current": 3,
    "total": 12
  },
  "artifacts": [],
  "error": "",
  "logPath": "/absolute/path/to/job.log"
}
```

Persistence location:

```text
~/.scribeflow/plugin-jobs/jobs.json
~/.scribeflow/plugin-jobs/<job-id>/job.log
```

The job registry must survive app restart. On startup, jobs previously marked `running` become `failed` with error `Interrupted by application shutdown`.

Cancellation:

- Store child process handle in memory while running.
- `plugin_job_cancel` kills the child process.
- Mark job `cancelled`.
- Keep logs and partial artifacts.

## 8. Artifact Contract

Artifacts are first-class ScribeFlow outputs.

Global artifact root:

```text
~/.scribeflow/artifacts/plugins/<plugin-id>/<job-id>/
```

Workspace artifact root:

```text
<workspace>/.scribeflow/artifacts/plugins/<plugin-id>/<job-id>/
```

Use workspace artifact root when the input target belongs to a workspace and the workspace is writable. Use global artifact root for global reference library artifacts or external PDFs.

Artifact metadata:

```json
{
  "id": "artifact-uuid",
  "pluginId": "pdfmathtranslate",
  "jobId": "plugin-job-uuid",
  "capability": "pdf.translate",
  "kind": "bilingualPdf",
  "mediaType": "application/pdf",
  "path": "/absolute/path/dual.pdf",
  "sourcePath": "/absolute/path/paper.pdf",
  "sourceHash": "sha256:...",
  "createdAt": "2026-04-30T00:00:00Z"
}
```

Reference attachment in v1:

- A translated PDF artifact can be shown from the reference detail surface.
- It must not overwrite the source `pdfPath`.
- It should be stored as a related artifact list, not as the primary PDF path.

Document attachment in v1:

- A plugin artifact may be revealed in file manager.
- It may be opened in the existing PDF preview surface if media type is PDF.

## 9. Rust File Plan

Create:

- `src-tauri/src/plugin_manifest.rs`
  - Manifest structs.
  - Capability enum normalization.
  - Permission structs.
  - Runtime structs.
  - Validation errors.
  - Unit tests for valid, invalid and unsupported manifests.

- `src-tauri/src/plugin_registry.rs`
  - Discover global and workspace plugin roots.
  - Load `plugin.json`.
  - Resolve duplicate plugin ids by scope.
  - Return registry entries with status.
  - Unit tests using temp directories.

- `src-tauri/src/plugin_permissions.rs`
  - Enforce permission rules.
  - Validate command shape.
  - Validate file input scope with existing security helpers.
  - Unit tests for blocked permission combinations.

- `src-tauri/src/plugin_jobs.rs`
  - Job structs and persistence.
  - Start, read, list, cancel transitions.
  - Restart recovery for interrupted jobs.
  - Unit tests for state transitions.

- `src-tauri/src/plugin_runner.rs`
  - CLI runner.
  - Command detection.
  - Spawn process through `process_utils::background_tokio_command`.
  - Capture stdout and stderr into job log.
  - Write artifact metadata.
  - Unit tests for command construction without running external tools.

- `src-tauri/src/plugin_artifacts.rs`
  - Artifact root resolution.
  - Artifact metadata normalization.
  - Source file hashing.
  - Unit tests for workspace and global artifact paths.

Modify:

- `src-tauri/src/lib.rs`
  - Add modules.
  - Register Tauri commands.

- `src-tauri/src/app_dirs.rs`
  - Add helpers for global plugin, job and artifact roots.

- `src-tauri/src/security.rs`
  - Reuse existing workspace path checks.
  - Add helper only if current functions cannot express plugin input validation.

Tauri commands:

```text
plugin_registry_list
plugin_registry_validate_manifest
plugin_runtime_detect
plugin_job_start
plugin_job_list
plugin_job_get
plugin_job_cancel
plugin_artifact_open
plugin_artifact_reveal
```

## 10. Frontend File Plan

Create:

- `src/services/plugins/pluginRegistry.js`
  - `listPlugins(globalConfigDir, workspaceRoot)`
  - `validatePluginManifest(manifest)`
  - `detectPluginRuntime(pluginId)`

- `src/services/plugins/pluginJobs.js`
  - `startPluginJob(payload)`
  - `listPluginJobs()`
  - `getPluginJob(jobId)`
  - `cancelPluginJob(jobId)`

- `src/services/plugins/pluginArtifacts.js`
  - `openPluginArtifact(artifact)`
  - `revealPluginArtifact(artifact)`

- `src/stores/plugins.js`
  - Registry state.
  - Enabled plugin ids.
  - Default provider per capability.
  - Active and recent jobs.

- `src/components/settings/SettingsPlugins.vue`
  - Installed plugin list.
  - Permission summary.
  - Runtime status.
  - Enable or disable switch.
  - Default provider selector.

- `src/components/plugins/PluginJobPanel.vue`
  - Job progress, logs, cancel button and artifact links.

- `src/components/plugins/PluginCapabilityButton.vue`
  - Reusable action button for a capability on a target.

Modify:

- `src/components/settings/settingsSections.js`
  - Add `plugins` settings section.

- `src/components/settings/Settings.vue`
  - Route settings section to `SettingsPlugins.vue`.

- `src/components/panel/ReferenceDetailPanel.vue`
  - Add `pdf.translate` action only when a reference has a PDF and at least one enabled provider.

- `src/components/editor/PdfArtifactPreview.vue`
  - Add a translate action for currently opened PDFs after registry state exists.

- `src/services/references/referenceAssets.js`
  - Add read-only helpers for related plugin artifacts only if reference artifact linking is stored in reference metadata.

## 11. Manifest Validation Rules

Validation must reject:

- missing `schemaVersion`
- `schemaVersion` other than `1`
- empty `id`
- id containing path separators
- id not matching `^[a-z0-9][a-z0-9._-]{1,63}$`
- empty `name`
- empty `version`
- unknown runtime type
- `cli` runtime without `command`
- `cli.command` containing `/`, `\`, `&&`, `|`, `;`, newline or leading/trailing spaces
- unknown capability
- empty capability list
- `spawnProcess: false` with `runtime.type = "cli"`
- `writeArtifacts: false` for capabilities that produce artifacts
- input file extension lists containing empty extensions

Validation should warn but not reject:

- no `README.md`
- unknown optional settings field type
- network set to `optional`
- duplicate provider for a capability

## 12. CLI Runner Contract

The runner must not use shell string execution.

Command shape:

```rust
Command::new("pdf2zh")
  .arg(input_pdf)
  .arg("-lo")
  .arg(target_language)
  .arg("-o")
  .arg(output_dir)
```

Runner input comes from capability adapter, not raw user text.

For `pdf.translate`, define an internal adapter:

```text
capability: pdf.translate
runtime: cli
arguments:
  - input PDF path
  - target language
  - output directory
```

Expected outputs for `pdf2zh`:

```text
translated.pdf
dual.pdf
job.log
```

The adapter must accept actual output names reported by the engine if predictable names differ. It should scan the output directory after process exit and classify PDFs by filename pattern:

- contains `dual` or `bilingual` -> `bilingualPdf`
- contains `trans` or `translated` -> `translatedPdf`
- otherwise -> `translatedPdf` when only one PDF exists

## 13. UI Behavior

Settings page:

- Show plugin source: `global` or `workspace`.
- Show status: available, missing runtime, disabled, blocked, invalid.
- Show capability chips.
- Show permission summary in plain language.
- Show command detection result for CLI plugins.
- Allow enable or disable.
- Allow choosing default provider for each capability.

Reference detail:

- If reference has no PDF, do not show Translate PDF.
- If no enabled provider exists, show disabled action with settings link.
- If provider is missing runtime, show disabled action with install hint.
- If provider is ready, start job with current reference PDF path.

Job panel:

- Show state, progress label, log preview and cancel button.
- On success, show artifact links.
- On failure, show error and log path.
- Do not hide failed jobs automatically.

PDF preview:

- Add Translate PDF after reference-detail path works.
- Use the same capability invocation shape.

## 14. Implementation Tasks

### Task 1: Add Rust Manifest Schema

**Files:**

- Create: `src-tauri/src/plugin_manifest.rs`
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Create manifest structs with `serde::Deserialize` and `serde::Serialize`.
- [ ] Implement `validate_plugin_manifest`.
- [ ] Add tests for valid `pdfmathtranslate`, invalid id, unsupported runtime and blocked CLI permissions.
- [ ] Register module in `src-tauri/src/lib.rs`.
- [ ] Run `npm run test:rust`.
- [ ] Commit with `feat(plugin): add plugin manifest schema`.

### Task 2: Add Plugin Discovery Registry

**Files:**

- Create: `src-tauri/src/plugin_registry.rs`
- Modify: `src-tauri/src/app_dirs.rs`
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Add `global_plugins_dir`, `plugin_jobs_dir` and `plugin_artifacts_dir` helpers.
- [ ] Implement global and workspace plugin root scanning.
- [ ] Load only `plugin.json` from direct child directories.
- [ ] Apply workspace-over-global override rule.
- [ ] Return registry entries with `scope`, `path`, `status`, `warnings` and `errors`.
- [ ] Add `plugin_registry_list` command.
- [ ] Add temp-dir tests for empty roots, valid roots, invalid manifests and duplicate ids.
- [ ] Run `npm run check:rust && npm run test:rust`.
- [ ] Commit with `feat(plugin): add plugin registry discovery`.

### Task 3: Add Permission Enforcement

**Files:**

- Create: `src-tauri/src/plugin_permissions.rs`
- Modify: `src-tauri/src/security.rs` only if a small reusable helper is required
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Implement manifest permission validation.
- [ ] Implement CLI command safety validation.
- [ ] Implement input file validation for workspace and registered external paths.
- [ ] Add tests for unsafe command strings and blocked file paths.
- [ ] Run `npm run check:rust && npm run test:rust`.
- [ ] Commit with `feat(plugin): enforce plugin permissions`.

### Task 4: Add Job Persistence

**Files:**

- Create: `src-tauri/src/plugin_jobs.rs`
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Define job state structs.
- [ ] Persist jobs to `~/.scribeflow/plugin-jobs/jobs.json`.
- [ ] Implement list, get, create and transition helpers.
- [ ] Mark interrupted running jobs as failed on load.
- [ ] Add commands `plugin_job_list` and `plugin_job_get`.
- [ ] Add tests for state transitions and restart recovery.
- [ ] Run `npm run check:rust && npm run test:rust`.
- [ ] Commit with `feat(plugin): add plugin job state`.

### Task 5: Add CLI Runner

**Files:**

- Create: `src-tauri/src/plugin_runner.rs`
- Modify: `src-tauri/src/plugin_jobs.rs`
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Implement command detection for CLI runtime.
- [ ] Implement `plugin_runtime_detect`.
- [ ] Implement `plugin_job_start` for `cli`.
- [ ] Capture stdout and stderr into job log.
- [ ] Implement `plugin_job_cancel`.
- [ ] Keep command construction shell-free.
- [ ] Add tests for command detection failure and argument construction.
- [ ] Run `npm run check:rust && npm run test:rust`.
- [ ] Commit with `feat(plugin): run cli plugin jobs`.

### Task 6: Add Artifact Contract

**Files:**

- Create: `src-tauri/src/plugin_artifacts.rs`
- Modify: `src-tauri/src/plugin_runner.rs`
- Modify: `src-tauri/src/lib.rs`

Steps:

- [ ] Resolve global and workspace artifact roots.
- [ ] Generate job output directory before process start.
- [ ] Compute source hash for file inputs.
- [ ] Write artifact metadata after job success.
- [ ] Add commands `plugin_artifact_open` and `plugin_artifact_reveal`.
- [ ] Add tests for artifact path selection and metadata normalization.
- [ ] Run `npm run check:rust && npm run test:rust`.
- [ ] Commit with `feat(plugin): add plugin artifacts`.

### Task 7: Add Frontend Plugin Services And Store

**Files:**

- Create: `src/services/plugins/pluginRegistry.js`
- Create: `src/services/plugins/pluginJobs.js`
- Create: `src/services/plugins/pluginArtifacts.js`
- Create: `src/stores/plugins.js`

Steps:

- [ ] Add service wrappers for all plugin Tauri commands.
- [ ] Keep Tauri imports only inside `src/services/plugins/*`.
- [ ] Add Pinia state for registry, enabled plugin ids, default providers and jobs.
- [ ] Add actions for refresh, enable, disable, start job, cancel job and open artifact.
- [ ] Run `npm run guard:ui-bridges && npm run build`.
- [ ] Commit with `feat(plugin): add frontend plugin state`.

### Task 8: Add Settings UI

**Files:**

- Create: `src/components/settings/SettingsPlugins.vue`
- Create: `src/components/plugins/PluginJobPanel.vue`
- Modify: `src/components/settings/settingsSections.js`
- Modify: `src/components/settings/Settings.vue`

Steps:

- [ ] Add Plugins settings section.
- [ ] Render plugin cards with status, source, capabilities and permissions.
- [ ] Render runtime detection status.
- [ ] Add enable and disable controls.
- [ ] Add default provider selector per capability.
- [ ] Add recent job panel.
- [ ] Run `npm run build`.
- [ ] Commit with `feat(plugin): add plugin settings UI`.

### Task 9: Wire PDF Translation Entry

**Files:**

- Create: `src/components/plugins/PluginCapabilityButton.vue`
- Modify: `src/components/panel/ReferenceDetailPanel.vue`
- Modify: `src/components/editor/PdfArtifactPreview.vue`

Steps:

- [ ] Add reusable capability button.
- [ ] Show Translate PDF in reference detail when a PDF exists.
- [ ] Show Translate PDF in `src/components/editor/PdfArtifactPreview.vue` when the PDF path is available.
- [ ] Start `pdf.translate` job with reference id and PDF path.
- [ ] Show job progress and artifacts.
- [ ] Open output PDF through existing PDF preview path.
- [ ] Run `npm run build`.
- [ ] Commit with `feat(plugin): add pdf translation action`.

### Task 10: Add Seed Plugin Manifest

**Files:**

- Create: `.scribeflow/plugins/pdfmathtranslate/plugin.json`
- Create: `.scribeflow/plugins/pdfmathtranslate/README.md`

Steps:

- [ ] Add a workspace seed plugin manifest for `pdf2zh`.
- [ ] Keep it disabled by default if runtime is missing.
- [ ] Include install notes in plugin README.
- [ ] Verify registry shows it as `available` or `missingRuntime`.
- [ ] Run `npm run verify`.
- [ ] Commit with `feat(plugin): add pdf2zh seed plugin`.

## 15. Test Plan

Rust tests:

```sh
npm run test:rust
```

Expected:

```text
test result: ok
```

Build and bridge guard:

```sh
npm run guard:ui-bridges
npm run build
```

Expected:

```text
UI bridge boundary check passed.
✓ built
```

Full verification:

```sh
npm run verify
```

Expected:

```text
UI bridge boundary check passed.
PDF runtime boundary check passed.
TextMate runtime boundary check passed.
Bundle budget check passed.
test result: ok
```

Manual desktop checks:

- Open Settings -> Plugins.
- Confirm invalid manifests appear as invalid, not as crashes.
- Confirm missing `pdf2zh` shows missing runtime.
- Install `pdf2zh` externally and refresh plugin status.
- Open a reference with a PDF.
- Start Translate PDF.
- Cancel once and confirm job becomes cancelled.
- Start again and confirm artifacts appear after success.
- Open generated translated or bilingual PDF.

## 16. Acceptance Criteria

The phase is acceptable when:

- Plugin manifests can be discovered from global and workspace roots.
- Invalid manifests do not crash the app.
- Plugin permissions are visible and enforced.
- CLI plugins run without shell string execution.
- Long-running jobs have stable state, logs and cancellation.
- Artifacts are written under ScribeFlow-controlled roots.
- `pdf.translate` works through a plugin provider, not hard-coded app logic.
- The UI can show missing runtime and guide the user to install the external tool.
- `npm run verify` passes.

## 17. Risk Register

Process risk:

- Long-running CLI tools can hang.
- Mitigation: job cancellation, log capture and timeout option after v1.

Security risk:

- A malicious manifest could try to execute unsafe commands.
- Mitigation: command validation, no shell execution, no path separators in command names.

Data risk:

- Plugin outputs could overwrite user files.
- Mitigation: ScribeFlow generates output directories and artifact paths.

UX risk:

- Plugin settings can become too technical.
- Mitigation: show concise status and hide raw manifest details behind an inspector.

License risk:

- Third-party tools can have restrictive licenses.
- Mitigation: do not bundle engine source in v1; document external installation and license separately per plugin.

Scope risk:

- Building marketplace features too early will delay the real capability host.
- Mitigation: v1 only supports local manifests and CLI runtime.

## 18. Future Extensions

After v1 is stable:

- Add `http` runtime for local WebUI or service plugins.
- Add `mcp` runtime for MCP servers.
- Add plugin setting persistence with per-workspace overrides.
- Add plugin artifact history in reference detail.
- Add plugin job queue concurrency limits.
- Add export/import of workspace plugin packs.
- Add trusted plugin signatures if distribution becomes necessary.
