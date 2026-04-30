use crate::extension_manifest::ExtensionManifest;
use crate::extension_registry::{find_extension_entry, ExtensionRegistryEntry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::process::{Child, ChildStdin, ChildStdout};
use std::sync::{Arc, Mutex};

#[cfg(not(test))]
use crate::app_dirs;
#[cfg(not(test))]
use crate::process_utils::background_command;
#[cfg(not(test))]
use std::process::Stdio;

const EXTENSION_HOST_ARG: &str = "--extension-host";
#[cfg(not(test))]
const BUILTIN_NODE_HOST_RELATIVE_PATH: &str =
    "src-tauri/resources/extension-host/extension-host.mjs";

#[cfg(not(test))]
#[derive(Default)]
struct ExtensionHostProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
}

#[derive(Clone)]
pub struct ExtensionHostState {
    activated_extensions: Arc<Mutex<HashSet<String>>>,
    #[cfg(not(test))]
    process: Arc<Mutex<ExtensionHostProcess>>,
}

impl Default for ExtensionHostState {
    fn default() -> Self {
        Self {
            activated_extensions: Arc::new(Mutex::new(HashSet::new())),
            #[cfg(not(test))]
            process: Arc::new(Mutex::new(ExtensionHostProcess::default())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostSummary {
    pub available: bool,
    pub runtime: String,
    pub activated_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostActivationResult {
    pub extension_id: String,
    pub activated: bool,
    pub reason: String,
    pub registered_commands: Vec<String>,
    pub registered_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostActivateParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub activation_event: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostInvocationEnvelope {
    pub task_id: String,
    pub extension_id: String,
    #[serde(default)]
    pub command_id: String,
    pub capability: String,
    pub target_kind: String,
    pub target_path: String,
    pub settings_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "method", content = "params")]
pub enum ExtensionHostRequest {
    Activate {
        extension_id: String,
        activation_event: String,
        extension_path: String,
        manifest_path: String,
        main_entry: String,
    },
    InvokeCapability {
        activation_event: String,
        extension_path: String,
        manifest_path: String,
        main_entry: String,
        envelope: ExtensionHostInvocationEnvelope,
    },
    ExecuteCommand {
        activation_event: String,
        extension_path: String,
        manifest_path: String,
        main_entry: String,
        command_id: String,
        envelope: ExtensionHostInvocationEnvelope,
    },
    ResolveView {
        activation_event: String,
        extension_path: String,
        manifest_path: String,
        main_entry: String,
        view_id: String,
        envelope: ExtensionHostInvocationEnvelope,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCapabilityResult {
    pub accepted: bool,
    pub message: String,
    pub progress_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewItem {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub command_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewResolveResult {
    pub view_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub items: Vec<ExtensionHostViewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind", content = "payload")]
pub enum ExtensionHostResponse {
    Activate(ExtensionHostActivationResult),
    InvokeCapability(ExtensionHostCapabilityResult),
    ExecuteCommand(ExtensionHostCapabilityResult),
    ResolveView(ExtensionHostViewResolveResult),
    Error { message: String },
}

fn resolve_extension_path(entry: &ExtensionRegistryEntry) -> Result<PathBuf, String> {
    Path::new(&entry.path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Extension manifest has no parent directory".to_string())
}

#[cfg(not(test))]
fn resolve_builtin_node_host_script() -> Result<PathBuf, String> {
    let cwd_candidate = std::env::current_dir()
        .map_err(|error| format!("Failed to read current directory: {error}"))?
        .join(BUILTIN_NODE_HOST_RELATIVE_PATH);
    if cwd_candidate.exists() {
        return Ok(cwd_candidate);
    }

    let data_root_candidate = app_dirs::data_root_dir()?
        .join("resources")
        .join("extension-host")
        .join("extension-host.mjs");
    if data_root_candidate.exists() {
        return Ok(data_root_candidate);
    }

    Err(format!(
        "Built-in extension host script not found: {}",
        BUILTIN_NODE_HOST_RELATIVE_PATH
    ))
}

pub fn extension_host_summary(state: &ExtensionHostState) -> Result<ExtensionHostSummary, String> {
    let activated = state
        .activated_extensions
        .lock()
        .map_err(|_| "Failed to access extension host state".to_string())?;
    Ok(ExtensionHostSummary {
        available: true,
        runtime: "node-extension-host-persistent".to_string(),
        activated_extensions: activated.iter().cloned().collect(),
    })
}

pub fn activate_extension(
    state: &ExtensionHostState,
    entry: &ExtensionRegistryEntry,
    activation_event: &str,
) -> Result<ExtensionHostActivationResult, String> {
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!("Extension manifest is invalid: {}", entry.id));
    };
    if manifest.runtime.runtime_type != "extensionHost" {
        return Err(format!(
            "Extension {} does not use extensionHost runtime",
            entry.id
        ));
    }

    let extension_path = resolve_extension_path(entry)?;
    let request = ExtensionHostRequest::Activate {
        extension_id: entry.id.clone(),
        activation_event: activation_event.trim().to_string(),
        extension_path: extension_path.to_string_lossy().to_string(),
        manifest_path: entry.path.clone(),
        main_entry: manifest.main.clone(),
    };
    let response = invoke_extension_host(state, request)?;
    let ExtensionHostResponse::Activate(result) = response else {
        return Err("Unexpected extension host activation response".to_string());
    };

    let mut activated = state
        .activated_extensions
        .lock()
        .map_err(|_| "Failed to access extension host state".to_string())?;
    if result.activated {
        activated.insert(entry.id.clone());
    }

    Ok(result)
}

pub fn should_activate_for_event(manifest: &ExtensionManifest, activation_event: &str) -> bool {
    let target = activation_event.trim();
    if target.is_empty() {
        return true;
    }
    if manifest
        .activation_events
        .iter()
        .any(|event| event.trim() == "*" || event.trim() == target)
    {
        return true;
    }
    if let Some(command) = target.strip_prefix("onCommand:") {
        return manifest
            .contributes
            .commands
            .iter()
            .any(|contribution| contribution.command.trim() == command);
    }
    if let Some(capability) = target.strip_prefix("onCapability:") {
        return manifest
            .contributes
            .capabilities
            .iter()
            .any(|contribution| contribution.id.trim() == capability);
    }
    false
}

pub fn build_extension_invocation_envelope(
    task_id: &str,
    extension_id: &str,
    command_id: &str,
    capability: &str,
    target_kind: &str,
    target_path: &str,
    settings: &Value,
) -> ExtensionHostInvocationEnvelope {
    ExtensionHostInvocationEnvelope {
        task_id: task_id.to_string(),
        extension_id: extension_id.to_string(),
        command_id: command_id.to_string(),
        capability: capability.to_string(),
        target_kind: target_kind.to_string(),
        target_path: target_path.to_string(),
        settings_json: settings.to_string(),
    }
}

#[cfg(not(test))]
fn ensure_extension_host_process(
    state: &ExtensionHostState,
) -> Result<std::sync::MutexGuard<'_, ExtensionHostProcess>, String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Failed to access extension host process state".to_string())?;

    if process.child.is_none() {
        let node_host_script = resolve_builtin_node_host_script()?;
        let mut command = background_command("node");
        command.arg(node_host_script);
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let mut child = command
            .spawn()
            .map_err(|error| format!("Failed to start extension host process: {error}"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Extension host stdin is unavailable".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Extension host stdout is unavailable".to_string())?;
        process.stdin = Some(stdin);
        process.stdout = Some(BufReader::new(stdout));
        process.child = Some(child);
    }

    Ok(process)
}

pub fn invoke_extension_host(
    state: &ExtensionHostState,
    request: ExtensionHostRequest,
) -> Result<ExtensionHostResponse, String> {
    #[cfg(test)]
    let _ = state;

    #[cfg(test)]
    {
        let response = handle_extension_host_request(request);
        return match &response {
            ExtensionHostResponse::Error { message } => Err(message.clone()),
            _ => Ok(response),
        };
    }

    #[cfg(not(test))]
    {
        let serialized_request = serde_json::to_string(&request)
            .map_err(|error| format!("Failed to serialize extension host request: {error}"))?;

        let mut process = ensure_extension_host_process(state)?;
        let stdin = process
            .stdin
            .as_mut()
            .ok_or_else(|| "Extension host stdin is unavailable".to_string())?;
        stdin
            .write_all(serialized_request.as_bytes())
            .map_err(|error| format!("Failed to write extension host request: {error}"))?;
        stdin
            .write_all(b"\n")
            .map_err(|error| format!("Failed to finalize extension host request: {error}"))?;
        stdin
            .flush()
            .map_err(|error| format!("Failed to flush extension host request: {error}"))?;

        let stdout = process
            .stdout
            .as_mut()
            .ok_or_else(|| "Extension host stdout is unavailable".to_string())?;
        let mut response_line = String::new();
        stdout
            .read_line(&mut response_line)
            .map_err(|error| format!("Failed to read extension host response: {error}"))?;

        let response = serde_json::from_str::<ExtensionHostResponse>(response_line.trim())
            .map_err(|error| format!("Failed to parse extension host response: {error}"))?;
        match &response {
            ExtensionHostResponse::Error { message } => Err(message.clone()),
            _ => Ok(response),
        }
    }
}

pub fn run_extension_host_stdio_loop() -> Result<(), String> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| format!("Failed to read extension host input: {error}"))?;
    let request = serde_json::from_str::<ExtensionHostRequest>(line.trim())
        .map_err(|error| format!("Failed to parse extension host request: {error}"))?;
    let response = handle_extension_host_request(request);
    let serialized = serde_json::to_string(&response)
        .map_err(|error| format!("Failed to serialize extension host response: {error}"))?;
    let mut handle = stdout.lock();
    handle
        .write_all(serialized.as_bytes())
        .map_err(|error| format!("Failed to write extension host response: {error}"))?;
    handle
        .write_all(b"\n")
        .map_err(|error| format!("Failed to finalize extension host response: {error}"))?;
    handle
        .flush()
        .map_err(|error| format!("Failed to flush extension host response: {error}"))?;
    Ok(())
}

pub fn is_extension_host_mode() -> bool {
    std::env::args().any(|arg| arg == EXTENSION_HOST_ARG)
}

fn handle_extension_host_request(request: ExtensionHostRequest) -> ExtensionHostResponse {
    match request {
        ExtensionHostRequest::Activate {
            extension_id,
            activation_event,
            ..
        } => ExtensionHostResponse::Activate(ExtensionHostActivationResult {
            extension_id: extension_id,
            activated: true,
            reason: if activation_event.trim().is_empty() {
                "Activated by host".to_string()
            } else {
                format!("Activated by {}", activation_event.trim())
            },
            registered_commands: Vec::new(),
            registered_capabilities: Vec::new(),
        }),
        ExtensionHostRequest::InvokeCapability { envelope, .. } => {
            ExtensionHostResponse::InvokeCapability(ExtensionHostCapabilityResult {
                accepted: true,
                message: format!(
                    "Extension host accepted {} for {}",
                    envelope.capability, envelope.extension_id
                ),
                progress_label: "Accepted by extension host".to_string(),
            })
        }
        ExtensionHostRequest::ExecuteCommand {
            command_id,
            envelope,
            ..
        } => ExtensionHostResponse::ExecuteCommand(ExtensionHostCapabilityResult {
            accepted: true,
            message: format!(
                "Extension host executed {} for {}",
                command_id, envelope.extension_id
            ),
            progress_label: "Accepted by extension host".to_string(),
        }),
        ExtensionHostRequest::ResolveView {
            view_id, envelope, ..
        } => ExtensionHostResponse::ResolveView(ExtensionHostViewResolveResult {
            view_id,
            title: envelope.extension_id.clone(),
            items: Vec::new(),
        }),
    }
}

#[tauri::command]
pub async fn extension_host_status(
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostSummary, String> {
    extension_host_summary(state.inner())
}

#[tauri::command]
pub async fn extension_host_activate(
    params: ExtensionHostActivateParams,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostActivationResult, String> {
    let entry = find_extension_entry(
        &params.global_config_dir,
        &params.workspace_root,
        &params.extension_id,
    )?;
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!(
            "Extension manifest is invalid: {}",
            params.extension_id
        ));
    };
    if !should_activate_for_event(manifest, &params.activation_event) {
        return Err(format!(
            "Extension {} does not activate on {}",
            entry.id, params.activation_event
        ));
    }
    activate_extension(state.inner(), &entry, &params.activation_event)
}

#[cfg(test)]
mod tests {
    use super::{
        activate_extension, build_extension_invocation_envelope, handle_extension_host_request,
        should_activate_for_event, ExtensionHostRequest, ExtensionHostResponse, ExtensionHostState,
    };
    use crate::extension_manifest::{
        parse_extension_manifest_str, CANONICAL_EXTENSION_MANIFEST_FILENAME,
    };
    use crate::extension_registry::ExtensionRegistryEntry;

    fn canonical_entry() -> ExtensionRegistryEntry {
        let manifest = parse_extension_manifest_str(
            &serde_json::json!({
                "name": "scribeflow-pdf2zh",
                "displayName": "PDF Translator",
                "version": "0.1.0",
                "description": "Translate PDFs through a extension-local toolchain.",
                "engines": {
                    "scribeflow": "^1.1.0"
                },
                "main": "./dist/extension.js",
                "extensionKind": ["workspace"],
                "activationEvents": ["onCommand:scribeflow.pdf.translate"],
                "contributes": {
                    "commands": [{
                        "command": "scribeflow.pdf.translate",
                        "title": "Translate"
                    }],
                    "capabilities": [{
                        "id": "pdf.translate"
                    }]
                },
                "permissions": {
                    "readWorkspaceFiles": true,
                    "writeArtifacts": true,
                    "spawnProcess": true,
                    "network": "optional"
                }
            })
            .to_string(),
            CANONICAL_EXTENSION_MANIFEST_FILENAME,
        )
        .expect("canonical parse")
        .manifest;

        ExtensionRegistryEntry {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version.clone(),
            description: manifest.description.clone(),
            capabilities: manifest.capabilities.clone(),
            runtime: manifest.runtime.clone(),
            permissions: manifest.permissions.clone(),
            scope: "global".to_string(),
            path: "/tmp/package.json".to_string(),
            status: "available".to_string(),
            warnings: Vec::new(),
            errors: Vec::new(),
            manifest: Some(manifest),
            manifest_format: "package.json".to_string(),
        }
    }

    #[test]
    fn activates_extension_host_entry() {
        let state = ExtensionHostState::default();
        let entry = canonical_entry();
        let activated = activate_extension(&state, &entry, "onCommand:scribeflow.pdf.translate")
            .expect("activate");
        assert!(activated.activated);
        assert_eq!(activated.extension_id, entry.id);
    }

    #[test]
    fn activation_event_matches_explicit_and_contributed_events() {
        let entry = canonical_entry();
        let mut manifest = entry.manifest.expect("manifest");
        assert!(should_activate_for_event(
            &manifest,
            "onCommand:scribeflow.pdf.translate"
        ));
        assert!(!should_activate_for_event(
            &manifest,
            "onSurface:pdf.preview.actions"
        ));
        manifest.activation_events.clear();
        assert!(should_activate_for_event(
            &manifest,
            "onCommand:scribeflow.pdf.translate"
        ));
        assert!(should_activate_for_event(
            &manifest,
            "onCapability:pdf.translate"
        ));
    }

    #[test]
    fn builds_invocation_envelope() {
        let envelope = build_extension_invocation_envelope(
            "task-1",
            "extension-1",
            "scribeflow.pdf.translate",
            "pdf.translate",
            "referencePdf",
            "/tmp/paper.pdf",
            &serde_json::json!({"targetLang": "zh-CN"}),
        );
        assert_eq!(envelope.task_id, "task-1");
        assert_eq!(envelope.extension_id, "extension-1");
        assert!(envelope.settings_json.contains("targetLang"));
    }

    #[test]
    fn sidecar_request_handler_accepts_capability_invocation() {
        let response = handle_extension_host_request(ExtensionHostRequest::InvokeCapability {
            activation_event: "onCapability:pdf.translate".to_string(),
            extension_path: "/tmp/ext".to_string(),
            manifest_path: "/tmp/ext/package.json".to_string(),
            main_entry: "./dist/extension.js".to_string(),
            envelope: build_extension_invocation_envelope(
                "task-1",
                "extension-1",
                "scribeflow.pdf.translate",
                "pdf.translate",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
            ),
        });
        match response {
            ExtensionHostResponse::InvokeCapability(result) => {
                assert!(result.accepted);
                assert!(result.message.contains("pdf.translate"));
            }
            _ => panic!("unexpected response"),
        }
    }

    #[test]
    fn sidecar_request_handler_accepts_command_execution() {
        let response = handle_extension_host_request(ExtensionHostRequest::ExecuteCommand {
            activation_event: "onCommand:scribeflow.pdf.translate".to_string(),
            extension_path: "/tmp/ext".to_string(),
            manifest_path: "/tmp/ext/package.json".to_string(),
            main_entry: "./dist/extension.js".to_string(),
            command_id: "scribeflow.pdf.translate".to_string(),
            envelope: build_extension_invocation_envelope(
                "task-1",
                "extension-1",
                "scribeflow.pdf.translate",
                "",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
            ),
        });
        match response {
            ExtensionHostResponse::ExecuteCommand(result) => {
                assert!(result.accepted);
                assert!(result.message.contains("scribeflow.pdf.translate"));
            }
            _ => panic!("unexpected response"),
        }
    }

    #[test]
    fn sidecar_request_handler_accepts_view_resolution() {
        let response = handle_extension_host_request(ExtensionHostRequest::ResolveView {
            activation_event: "onView:examplePdfExtension.translateView".to_string(),
            extension_path: "/tmp/ext".to_string(),
            manifest_path: "/tmp/ext/package.json".to_string(),
            main_entry: "./dist/extension.js".to_string(),
            view_id: "examplePdfExtension.translateView".to_string(),
            envelope: build_extension_invocation_envelope(
                "",
                "extension-1",
                "",
                "",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
            ),
        });
        match response {
            ExtensionHostResponse::ResolveView(result) => {
                assert_eq!(result.view_id, "examplePdfExtension.translateView");
            }
            _ => panic!("unexpected response"),
        }
    }
}
