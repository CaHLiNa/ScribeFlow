use crate::extension_artifacts::ExtensionArtifact;
use crate::extension_manifest::{
    ExtensionCapabilityContribution, ExtensionManifest, ExtensionPermissions,
};
use crate::extension_outputs::ExtensionCapabilityOutput;
use crate::extension_registry::{find_extension_entry, ExtensionRegistryEntry};
use crate::extension_settings::load_extension_runtime_state_snapshot;
use crate::extension_settings::load_extension_settings;
use crate::extension_settings::save_extension_runtime_state_snapshot;
#[cfg(not(test))]
use crate::extension_tasks::ExtensionTaskRuntimeState;
use crate::security::canonicalize_for_scope;
use serde::{Deserialize, Serialize};
#[cfg(not(test))]
use serde_json::json;
use serde_json::Value;
#[cfg(not(test))]
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::process::{Child, ChildStdin, ChildStdout};
use std::sync::{Arc, Mutex};
#[cfg(not(test))]
use std::time::{Duration, Instant};
#[cfg(not(test))]
use tauri::Emitter;

#[cfg(not(test))]
use crate::app_dirs;
#[cfg(not(test))]
use crate::process_utils::background_command;
#[cfg(not(test))]
use std::process::Stdio;

const EXTENSION_HOST_ARG: &str = "--extension-host";
#[cfg(not(test))]
pub const EXTENSION_VIEW_CHANGED_EVENT: &str = "extension-view-changed";
#[cfg(not(test))]
pub const EXTENSION_VIEW_STATE_CHANGED_EVENT: &str = "extension-view-state-changed";
#[cfg(not(test))]
pub const EXTENSION_VIEW_REVEAL_REQUESTED_EVENT: &str = "extension-view-reveal-requested";
#[cfg(not(test))]
pub const EXTENSION_WINDOW_MESSAGE_EVENT: &str = "extension-window-message";
#[cfg(not(test))]
pub const EXTENSION_HOST_INTERRUPTED_EVENT: &str = "extension-host-interrupted";
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

#[cfg(not(test))]
fn reset_extension_host_process(process: &mut ExtensionHostProcess) {
    process.stdin = None;
    process.stdout = None;

    if let Some(mut child) = process.child.take() {
        match child.try_wait() {
            Ok(Some(_)) => {}
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(Clone)]
pub struct ExtensionHostState {
    activated_extensions: Arc<Mutex<HashSet<ExtensionWorkspaceKey>>>,
    ui_requests: Arc<Mutex<HashMap<String, ExtensionHostUiRequestStatus>>>,
    host_calls: Arc<Mutex<HashMap<String, ExtensionHostCallStatus>>>,
    activation_context: Arc<Mutex<HashMap<ExtensionWorkspaceKey, (String, String)>>>,
    #[cfg(not(test))]
    request_lock: Arc<Mutex<()>>,
    #[cfg(not(test))]
    spawned_processes: Arc<Mutex<HashMap<u32, Child>>>,
    #[cfg(not(test))]
    process: Arc<Mutex<ExtensionHostProcess>>,
    #[cfg(not(test))]
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ExtensionWorkspaceKey {
    extension_id: String,
    workspace_root: String,
}

fn normalize_extension_workspace_key(
    extension_id: &str,
    workspace_root: &str,
) -> ExtensionWorkspaceKey {
    ExtensionWorkspaceKey {
        extension_id: extension_id.trim().to_ascii_lowercase(),
        workspace_root: workspace_root.trim().to_string(),
    }
}

impl Default for ExtensionHostState {
    fn default() -> Self {
        Self {
            activated_extensions: Arc::new(Mutex::new(HashSet::new())),
            ui_requests: Arc::new(Mutex::new(HashMap::new())),
            host_calls: Arc::new(Mutex::new(HashMap::new())),
            activation_context: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(not(test))]
            request_lock: Arc::new(Mutex::new(())),
            #[cfg(not(test))]
            spawned_processes: Arc::new(Mutex::new(HashMap::new())),
            #[cfg(not(test))]
            process: Arc::new(Mutex::new(ExtensionHostProcess::default())),
            #[cfg(not(test))]
            app_handle: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum ExtensionHostUiRequestStatus {
    #[cfg_attr(test, allow(dead_code))]
    Pending {
        extension_id: String,
        workspace_root: String,
    },
    Completed {
        cancelled: bool,
        result: Value,
    },
    #[cfg_attr(test, allow(dead_code))]
    Interrupted {
        error: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
enum ExtensionHostCallStatus {
    #[cfg_attr(test, allow(dead_code))]
    Pending,
    Completed {
        accepted: bool,
        result: Value,
        error: String,
    },
    #[cfg_attr(test, allow(dead_code))]
    Interrupted { error: String },
}

#[cfg(not(test))]
thread_local! {
    static EXTENSION_HOST_INVOKE_DEPTH: Cell<usize> = const { Cell::new(0) };
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostSummary {
    pub available: bool,
    pub runtime: String,
    pub activated_extensions: Vec<String>,
    #[serde(default)]
    pub active_runtime_slots: Vec<ExtensionHostRuntimeSlot>,
    #[serde(default)]
    pub pending_prompt_owner: Option<ExtensionHostPendingPromptOwner>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRuntimeSlot {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostPendingPromptOwner {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostActivationResult {
    pub extension_id: String,
    pub activated: bool,
    pub reason: String,
    pub registered_commands: Vec<String>,
    pub registered_capabilities: Vec<String>,
    pub registered_views: Vec<String>,
    #[serde(default)]
    pub registered_command_details: Vec<ExtensionHostRegisteredCommand>,
    #[serde(default)]
    pub registered_menu_actions: Vec<ExtensionHostRegisteredMenuAction>,
    #[serde(default)]
    pub registered_view_details: Vec<ExtensionHostRegisteredView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRegisteredCommand {
    pub command_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub when: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRegisteredView {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub when: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRegisteredMenuAction {
    pub command_id: String,
    pub surface: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub when: String,
    #[serde(default)]
    pub group: String,
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

fn host_param_string(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn host_param_object(params: &Value, camel_key: &str, snake_key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()))
}

fn host_param_value(params: &Value, camel_key: &str, snake_key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .cloned()
        .unwrap_or(Value::Null)
}

fn host_param_accepted_default_true(params: &Value) -> bool {
    !matches!(
        params
            .as_object()
            .and_then(|object| object.get("accepted"))
            .and_then(Value::as_bool),
        Some(false)
    )
}

fn extension_host_activate_params_from_payload(params: Value) -> ExtensionHostActivateParams {
    ExtensionHostActivateParams {
        global_config_dir: host_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: host_param_string(&params, "workspaceRoot", "workspace_root"),
        extension_id: host_param_string(&params, "extensionId", "extension_id"),
        activation_event: host_param_string(&params, "activationEvent", "activation_event"),
    }
}

fn extension_host_deactivate_params_from_payload(params: Value) -> ExtensionHostDeactivateParams {
    ExtensionHostDeactivateParams {
        extension_id: host_param_string(&params, "extensionId", "extension_id"),
        workspace_root: host_param_string(&params, "workspaceRoot", "workspace_root"),
    }
}

fn extension_host_cancel_window_inputs_params_from_payload(
    params: Value,
) -> ExtensionHostCancelWindowInputsParams {
    ExtensionHostCancelWindowInputsParams {
        extension_id: host_param_string(&params, "extensionId", "extension_id"),
        workspace_root: host_param_string(&params, "workspaceRoot", "workspace_root"),
    }
}

fn extension_host_update_settings_params_from_payload(
    params: Value,
) -> ExtensionHostUpdateSettingsParams {
    ExtensionHostUpdateSettingsParams {
        global_config_dir: host_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: host_param_string(&params, "workspaceRoot", "workspace_root"),
        extension_id: host_param_string(&params, "extensionId", "extension_id"),
        settings: host_param_object(&params, "settings", "settings"),
    }
}

fn extension_host_resolve_host_call_params_from_payload(
    params: Value,
) -> ExtensionHostResolveHostCallParams {
    ExtensionHostResolveHostCallParams {
        request_id: host_param_string(&params, "requestId", "request_id"),
        accepted: host_param_accepted_default_true(&params),
        result: host_param_value(&params, "result", "result"),
        error: host_param_string(&params, "error", "error"),
    }
}

fn extension_host_respond_ui_request_params_from_payload(
    params: Value,
) -> ExtensionHostRespondUiRequestParams {
    ExtensionHostRespondUiRequestParams {
        request_id: host_param_string(&params, "requestId", "request_id"),
        cancelled: params
            .as_object()
            .and_then(|object| object.get("cancelled"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        result: host_param_value(&params, "result", "result"),
    }
}

fn extension_host_notify_view_selection_params_from_payload(
    params: Value,
) -> ExtensionHostNotifyViewSelectionParams {
    ExtensionHostNotifyViewSelectionParams {
        extension_id: host_param_string(&params, "extensionId", "extension_id"),
        workspace_root: host_param_string(&params, "workspaceRoot", "workspace_root"),
        view_id: host_param_string(&params, "viewId", "view_id"),
        item_handle: host_param_string(&params, "itemHandle", "item_handle"),
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostActivationState {
    #[serde(default)]
    pub settings: Value,
    #[serde(default)]
    pub global_state: Value,
    #[serde(default)]
    pub workspace_state: Value,
    #[serde(default)]
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostInvocationEnvelope {
    pub task_id: String,
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub item_handle: String,
    #[serde(default)]
    pub reference_id: String,
    pub capability: String,
    pub target_kind: String,
    pub target_path: String,
    pub settings_json: String,
    #[serde(default)]
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    rename_all = "PascalCase",
    rename_all_fields = "camelCase",
    tag = "method",
    content = "params"
)]
pub enum ExtensionHostRequest {
    Activate {
        extension_id: String,
        #[serde(default)]
        workspace_root: String,
        activation_event: String,
        extension_path: String,
        manifest_path: String,
        main_entry: String,
        permissions: ExtensionPermissions,
        #[serde(default)]
        capabilities: Vec<ExtensionCapabilityContribution>,
        #[serde(default)]
        activation_state: ExtensionHostActivationState,
    },
    Deactivate {
        extension_id: String,
        #[serde(default)]
        workspace_root: String,
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
        #[serde(default)]
        parent_item_id: String,
        envelope: ExtensionHostInvocationEnvelope,
    },
    RespondUiRequest {
        request_id: String,
        #[serde(default)]
        cancelled: bool,
        #[serde(default)]
        result: Value,
    },
    ResolveHostCall {
        request_id: String,
        #[serde(default)]
        accepted: bool,
        #[serde(default)]
        result: Value,
        #[serde(default)]
        error: String,
    },
    UpdateSettings {
        extension_id: String,
        #[serde(default)]
        workspace_root: String,
        #[serde(default)]
        settings: Value,
    },
    NotifyViewSelection {
        extension_id: String,
        #[serde(default)]
        workspace_root: String,
        view_id: String,
        #[serde(default)]
        item_handle: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCapabilityResult {
    pub accepted: bool,
    pub message: String,
    pub progress_label: String,
    #[serde(default)]
    pub task_state: String,
    #[serde(default)]
    pub changed_views: Vec<String>,
    #[serde(default)]
    pub result_entries: Vec<ExtensionHostResultEntry>,
    #[serde(default)]
    pub artifacts: Vec<ExtensionArtifact>,
    #[serde(default)]
    pub outputs: Vec<ExtensionCapabilityOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewItem {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub handle: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tooltip: String,
    #[serde(default)]
    pub context_value: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub command_arguments: Vec<Value>,
    #[serde(default)]
    pub collapsible_state: String,
    #[serde(default)]
    pub children: Vec<ExtensionHostViewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostSidebarSection {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub tone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewPresentationTarget {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub empty_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewPresentationAction {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewPresentationProgress {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub current: u32,
    #[serde(default)]
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewPresentation {
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub target: ExtensionHostViewPresentationTarget,
    #[serde(default)]
    pub action: ExtensionHostViewPresentationAction,
    #[serde(default)]
    pub progress: ExtensionHostViewPresentationProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostResultEntry {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub reference_id: String,
    #[serde(default)]
    pub target_kind: String,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub preview_mode: String,
    #[serde(default)]
    pub preview_path: String,
    #[serde(default)]
    pub preview_title: String,
    #[serde(default)]
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewResolveResult {
    pub view_id: String,
    #[serde(default)]
    pub parent_item_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub badge_value: Option<u32>,
    #[serde(default)]
    pub badge_tooltip: String,
    #[serde(default)]
    pub status_label: String,
    #[serde(default)]
    pub status_tone: String,
    #[serde(default)]
    pub action_label: String,
    #[serde(default)]
    pub presentation: ExtensionHostViewPresentation,
    #[serde(default)]
    pub sections: Vec<ExtensionHostSidebarSection>,
    #[serde(default)]
    pub result_entries: Vec<ExtensionHostResultEntry>,
    #[serde(default)]
    pub artifacts: Vec<ExtensionArtifact>,
    #[serde(default)]
    pub outputs: Vec<ExtensionCapabilityOutput>,
    #[serde(default)]
    pub items: Vec<ExtensionHostViewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewChangedEvent {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub view_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewStateChangedEvent {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub view_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub badge_value: Option<u32>,
    #[serde(default)]
    pub badge_tooltip: String,
    #[serde(default)]
    pub status_label: String,
    #[serde(default)]
    pub status_tone: String,
    #[serde(default)]
    pub action_label: String,
    #[serde(default)]
    pub presentation: ExtensionHostViewPresentation,
    #[serde(default)]
    pub sections: Vec<ExtensionHostSidebarSection>,
    #[serde(default)]
    pub result_entries: Vec<ExtensionHostResultEntry>,
    #[serde(default)]
    pub artifacts: Vec<ExtensionArtifact>,
    #[serde(default)]
    pub outputs: Vec<ExtensionCapabilityOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewRevealRequestedEvent {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub view_id: String,
    pub item_handle: String,
    #[serde(default)]
    pub parent_handles: Vec<String>,
    #[serde(default)]
    pub focus: bool,
    #[serde(default)]
    pub select: bool,
    #[serde(default)]
    pub expand: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostQuickPickItem {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub picked: bool,
    #[serde(default)]
    pub value: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostWindowInputRequestedEvent {
    pub request_id: String,
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub kind: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub placeholder: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub password: bool,
    #[serde(default)]
    pub can_pick_many: bool,
    #[serde(default)]
    pub items: Vec<ExtensionHostQuickPickItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostUiRequestAcknowledgement {
    pub request_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCallRequestedEvent {
    pub request_id: String,
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub kind: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostResolveHostCallParams {
    #[serde(default)]
    pub request_id: String,
    #[serde(default)]
    pub accepted: bool,
    #[serde(default)]
    pub result: Value,
    #[serde(default)]
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCallAcknowledgement {
    pub request_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostUpdateSettingsParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub settings: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostSettingsUpdateAcknowledgement {
    pub extension_id: String,
    pub accepted: bool,
    #[serde(default)]
    pub changed_keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostDeactivateParams {
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostDeactivationAcknowledgement {
    pub extension_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCancelWindowInputsParams {
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostCancelWindowInputsResult {
    pub extension_id: String,
    pub accepted: bool,
    #[serde(default)]
    pub cancelled_request_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRespondUiRequestParams {
    #[serde(default)]
    pub request_id: String,
    #[serde(default)]
    pub cancelled: bool,
    #[serde(default)]
    pub result: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostRespondUiRequestResult {
    pub request_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostNotifyViewSelectionParams {
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub view_id: String,
    #[serde(default)]
    pub item_handle: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostViewSelectionAcknowledgement {
    pub extension_id: String,
    pub view_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostWindowMessageEvent {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub severity: String,
    pub message: String,
}

#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostInterruptedEvent {
    #[serde(default)]
    pub request_id: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionHostStateChangedEvent {
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub global_state: Value,
    #[serde(default)]
    pub workspace_state: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", tag = "kind", content = "payload")]
pub enum ExtensionHostResponse {
    Activate(ExtensionHostActivationResult),
    AcknowledgeDeactivation(ExtensionHostDeactivationAcknowledgement),
    InvokeCapability(ExtensionHostCapabilityResult),
    ExecuteCommand(ExtensionHostCapabilityResult),
    ResolveView(ExtensionHostViewResolveResult),
    ViewChanged(ExtensionHostViewChangedEvent),
    ViewStateChanged(ExtensionHostViewStateChangedEvent),
    ViewRevealRequested(ExtensionHostViewRevealRequestedEvent),
    WindowInputRequested(ExtensionHostWindowInputRequestedEvent),
    AcknowledgeUiRequest(ExtensionHostUiRequestAcknowledgement),
    HostCallRequested(ExtensionHostCallRequestedEvent),
    AcknowledgeHostCall(ExtensionHostCallAcknowledgement),
    AcknowledgeSettingsUpdate(ExtensionHostSettingsUpdateAcknowledgement),
    AcknowledgeViewSelection(ExtensionHostViewSelectionAcknowledgement),
    StateChanged(ExtensionHostStateChangedEvent),
    WindowMessage(ExtensionHostWindowMessageEvent),
    Error { message: String },
}

fn resolve_extension_path(entry: &ExtensionRegistryEntry) -> Result<PathBuf, String> {
    Path::new(&entry.path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Extension manifest has no parent directory".to_string())
}

fn path_is_within_root(path: &Path, root: &Path) -> bool {
    path == root || path.starts_with(root)
}

fn reference_library_asset_roots(global_config_dir: &str) -> Vec<PathBuf> {
    if global_config_dir.trim().is_empty() {
        return Vec::new();
    }
    let root = Path::new(global_config_dir).join("references");
    vec![root.join("pdfs"), root.join("fulltext")]
}

fn ensure_extension_pdf_path_allowed(
    workspace_root: &str,
    global_config_dir: &str,
    manifest: &ExtensionManifest,
    file_path: &str,
) -> Result<PathBuf, String> {
    let canonical_path = canonicalize_for_scope(Path::new(file_path))?;
    let allowed_by_workspace = manifest.permissions.read_workspace_files
        && !workspace_root.trim().is_empty()
        && path_is_within_root(
            &canonical_path,
            &canonicalize_for_scope(Path::new(workspace_root))?,
        );

    let allowed_by_reference_library = manifest.permissions.read_reference_library
        && reference_library_asset_roots(global_config_dir)
            .into_iter()
            .filter_map(|root| canonicalize_for_scope(&root).ok())
            .any(|root| path_is_within_root(&canonical_path, &root));

    if allowed_by_workspace || allowed_by_reference_library {
        Ok(canonical_path)
    } else {
        Err(format!(
            "Extension {} is not allowed to inspect PDF path: {}",
            manifest.id,
            canonical_path.display()
        ))
    }
}

#[cfg(not(test))]
fn resolve_builtin_node_host_script() -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(BUILTIN_NODE_HOST_RELATIVE_PATH));
        candidates.push(current_dir.join("resources/extension-host/extension-host.mjs"));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        for ancestor in current_exe.ancestors() {
            candidates.push(ancestor.join(BUILTIN_NODE_HOST_RELATIVE_PATH));
            candidates.push(ancestor.join("resources/extension-host/extension-host.mjs"));
        }
    }

    candidates.push(
        app_dirs::data_root_dir()?
            .join("resources")
            .join("extension-host")
            .join("extension-host.mjs"),
    );

    for candidate in candidates {
        if candidate.exists() {
            return Ok(candidate);
        }
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
    let active_runtime_slots = activated
        .iter()
        .map(|key| ExtensionHostRuntimeSlot {
            extension_id: key.extension_id.clone(),
            workspace_root: key.workspace_root.clone(),
        })
        .collect::<Vec<_>>();
    let pending_prompt_owner = pending_ui_request_owner(state).ok().flatten();
    Ok(ExtensionHostSummary {
        available: true,
        runtime: "node-extension-host-persistent".to_string(),
        activated_extensions: activated
            .iter()
            .map(|key| key.extension_id.clone())
            .collect(),
        active_runtime_slots,
        pending_prompt_owner,
    })
}

pub fn activate_extension(
    state: &ExtensionHostState,
    global_config_dir: &str,
    workspace_root: &str,
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
    if !should_activate_for_event(manifest, activation_event) {
        return Err(format!(
            "Extension {} does not declare activation event {}",
            entry.id,
            activation_event.trim()
        ));
    }

    let extension_path = resolve_extension_path(entry)?;
    let extension_settings = load_extension_settings(global_config_dir, workspace_root)?
        .extension_config
        .get(&entry.id)
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    let runtime_state =
        load_extension_runtime_state_snapshot(global_config_dir, workspace_root, &entry.id)?;
    let locale = crate::workspace_preferences::read_workspace_preferences(global_config_dir)
        .ok()
        .flatten()
        .map(|preferences| preferences.preferred_locale)
        .map(|preference| crate::i18n_runtime::resolve_effective_locale(&preference))
        .unwrap_or_else(|| crate::i18n_runtime::resolve_effective_locale("system"));
    let request = ExtensionHostRequest::Activate {
        extension_id: entry.id.clone(),
        workspace_root: workspace_root.to_string(),
        activation_event: activation_event.trim().to_string(),
        extension_path: extension_path.to_string_lossy().to_string(),
        manifest_path: entry.path.clone(),
        main_entry: manifest.main.clone(),
        permissions: manifest.permissions.clone(),
        capabilities: manifest.contributes.capabilities.clone(),
        activation_state: ExtensionHostActivationState {
            settings: extension_settings,
            global_state: runtime_state.global_state,
            workspace_state: runtime_state.workspace_state,
            locale,
        },
    };
    let response = invoke_extension_host(state, None, request)?;
    let ExtensionHostResponse::Activate(result) = response else {
        return Err("Unexpected extension host activation response".to_string());
    };

    let mut activated = state
        .activated_extensions
        .lock()
        .map_err(|_| "Failed to access extension host state".to_string())?;
    let activation_key = normalize_extension_workspace_key(&entry.id, workspace_root);
    if result.activated {
        activated.insert(activation_key.clone());
    }
    if let Ok(mut contexts) = state.activation_context.lock() {
        contexts.insert(
            activation_key,
            (global_config_dir.to_string(), workspace_root.to_string()),
        );
    }

    Ok(result)
}

pub fn activate_extension_by_id_for_probe(
    state: &ExtensionHostState,
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
    activation_event: &str,
) -> Result<ExtensionHostActivationResult, String> {
    let entry = find_extension_entry(global_config_dir, workspace_root, extension_id)?;
    activate_extension(
        state,
        global_config_dir,
        workspace_root,
        &entry,
        activation_event,
    )
}

pub fn deactivate_extension_for_probe(
    state: &ExtensionHostState,
    extension_id: &str,
    workspace_root: &str,
) -> Result<ExtensionHostDeactivationAcknowledgement, String> {
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    let normalized_workspace_root = workspace_root.trim().to_string();
    if normalized_extension_id.is_empty() {
        return Err("Extension id is required".to_string());
    }
    let result = match invoke_extension_host(
        state,
        None,
        ExtensionHostRequest::Deactivate {
            extension_id: normalized_extension_id.clone(),
            workspace_root: normalized_workspace_root.clone(),
        },
    )? {
        ExtensionHostResponse::AcknowledgeDeactivation(result) => result,
        _ => return Err("Unexpected extension host response for deactivation".to_string()),
    };
    if result.accepted {
        let activation_key =
            normalize_extension_workspace_key(&normalized_extension_id, &normalized_workspace_root);
        if let Ok(mut activated) = state.activated_extensions.lock() {
            activated.remove(&activation_key);
        }
        if let Ok(mut contexts) = state.activation_context.lock() {
            contexts.remove(&activation_key);
        }
    }
    Ok(result)
}

pub fn cancel_window_inputs_for_extension_for_probe(
    _state: &ExtensionHostState,
    extension_id: &str,
    workspace_root: &str,
) -> Result<ExtensionHostCancelWindowInputsResult, String> {
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    #[cfg(not(test))]
    let normalized_workspace_root = workspace_root.trim().to_string();
    #[cfg(test)]
    let _ = workspace_root;
    if normalized_extension_id.is_empty() {
        return Err("Extension id is required".to_string());
    }
    #[cfg(test)]
    let cancelled_request_ids = Vec::new();
    #[cfg(not(test))]
    let cancelled_request_ids = complete_pending_ui_requests_for_extension(
        _state,
        &normalized_extension_id,
        &normalized_workspace_root,
        true,
        Value::Null,
    )?;
    Ok(ExtensionHostCancelWindowInputsResult {
        extension_id: normalized_extension_id,
        accepted: true,
        cancelled_request_ids,
    })
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
    workspace_root: &str,
    command_id: &str,
    item_id: &str,
    item_handle: &str,
    reference_id: &str,
    capability: &str,
    target_kind: &str,
    target_path: &str,
    settings: &Value,
    locale: &str,
) -> ExtensionHostInvocationEnvelope {
    ExtensionHostInvocationEnvelope {
        task_id: task_id.to_string(),
        extension_id: extension_id.to_string(),
        workspace_root: workspace_root.to_string(),
        command_id: command_id.to_string(),
        item_id: item_id.to_string(),
        item_handle: item_handle.to_string(),
        reference_id: reference_id.to_string(),
        capability: capability.to_string(),
        target_kind: target_kind.to_string(),
        target_path: target_path.to_string(),
        settings_json: settings.to_string(),
        locale: locale.to_string(),
    }
}

#[cfg(not(test))]
fn task_id_for_host_call_event(event: &ExtensionHostCallRequestedEvent) -> String {
    event
        .payload
        .get("taskId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

#[cfg(not(test))]
fn register_spawned_process(
    state: &ExtensionHostState,
    pid: u32,
    child: Child,
) -> Result<(), String> {
    let mut processes = state
        .spawned_processes
        .lock()
        .map_err(|_| "Failed to access spawned process state".to_string())?;
    if let Some(mut existing) = processes.insert(pid, child) {
        let _ = existing.kill();
        let _ = existing.wait();
    }
    Ok(())
}

#[cfg(not(test))]
fn take_spawned_process(state: &ExtensionHostState, pid: u32) -> Result<Option<Child>, String> {
    let mut processes = state
        .spawned_processes
        .lock()
        .map_err(|_| "Failed to access spawned process state".to_string())?;
    Ok(processes.remove(&pid))
}

#[cfg(not(test))]
fn wait_for_spawned_process(state: &ExtensionHostState, pid: u32) -> Result<Value, String> {
    let Some(mut child) = take_spawned_process(state, pid)? else {
        return Err(format!("Spawned process not found: {pid}"));
    };
    let status = child
        .wait()
        .map_err(|error| format!("Failed to wait for spawned process {pid}: {error}"))?;
    Ok(json!({
        "ok": status.success(),
        "pid": pid,
        "code": status.code(),
    }))
}

#[cfg(not(test))]
pub fn reap_spawned_process(
    state: &ExtensionHostState,
    pid: u32,
    terminate: bool,
) -> Result<(), String> {
    let Some(mut child) = take_spawned_process(state, pid)? else {
        return Ok(());
    };
    std::thread::spawn(move || {
        if terminate {
            let _ = child.kill();
        }
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
pub fn reap_spawned_process(
    _state: &ExtensionHostState,
    _pid: u32,
    _terminate: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(test))]
fn ensure_extension_host_process(
    state: &ExtensionHostState,
) -> Result<std::sync::MutexGuard<'_, ExtensionHostProcess>, String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Failed to access extension host process state".to_string())?;

    if let Some(child) = process.child.as_mut() {
        let child_exited = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect extension host process state: {error}"))?;
        if child_exited.is_some() {
            process.stdin = None;
            process.stdout = None;
            process.child = None;
        } else if process.stdin.is_none() || process.stdout.is_none() {
            reset_extension_host_process(&mut process);
        }
    }

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

#[cfg(not(test))]
fn reset_extension_host_process_state(state: &ExtensionHostState) -> Result<(), String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Failed to access extension host process state".to_string())?;
    reset_extension_host_process(&mut process);
    Ok(())
}

#[cfg(not(test))]
fn mark_pending_ui_requests_interrupted(
    state: &ExtensionHostState,
    error: &str,
) -> Result<Vec<String>, String> {
    let mut ui_requests = state
        .ui_requests
        .lock()
        .map_err(|_| "Failed to access extension host UI request state".to_string())?;
    let interrupted = ui_requests
        .iter()
        .filter_map(|(request_id, status)| match status {
            ExtensionHostUiRequestStatus::Pending { .. } => Some(request_id.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    for request_id in &interrupted {
        ui_requests.insert(
            request_id.clone(),
            ExtensionHostUiRequestStatus::Interrupted {
                error: error.to_string(),
            },
        );
    }
    Ok(interrupted)
}

#[cfg(not(test))]
fn complete_pending_ui_requests_for_extension(
    state: &ExtensionHostState,
    extension_id: &str,
    workspace_root: &str,
    cancelled: bool,
    result: Value,
) -> Result<Vec<String>, String> {
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    let normalized_workspace_root = workspace_root.trim().to_string();
    if normalized_extension_id.is_empty() {
        return Ok(Vec::new());
    }
    let mut ui_requests = state
        .ui_requests
        .lock()
        .map_err(|_| "Failed to access extension host UI request state".to_string())?;
    let matching = ui_requests
        .iter()
        .filter_map(|(request_id, status)| match status {
            ExtensionHostUiRequestStatus::Pending {
                extension_id,
                workspace_root,
            } if extension_id.eq_ignore_ascii_case(&normalized_extension_id)
                && workspace_root.trim() == normalized_workspace_root =>
            {
                Some(request_id.clone())
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    for request_id in &matching {
        ui_requests.insert(
            request_id.clone(),
            ExtensionHostUiRequestStatus::Completed {
                cancelled,
                result: result.clone(),
            },
        );
    }
    Ok(matching)
}

#[cfg(not(test))]
fn format_pending_prompt_owner(owner: &ExtensionHostPendingPromptOwner) -> String {
    format!("{}@{}", owner.extension_id, owner.workspace_root)
}

fn pending_ui_request_owner(
    state: &ExtensionHostState,
) -> Result<Option<ExtensionHostPendingPromptOwner>, String> {
    let ui_requests = state
        .ui_requests
        .lock()
        .map_err(|_| "Failed to access extension host UI request state".to_string())?;
    Ok(ui_requests.values().find_map(|status| match status {
        ExtensionHostUiRequestStatus::Pending {
            extension_id,
            workspace_root,
        } => Some(ExtensionHostPendingPromptOwner {
            extension_id: extension_id.trim().to_ascii_lowercase(),
            workspace_root: workspace_root.trim().to_string(),
        }),
        _ => None,
    }))
}

#[cfg(not(test))]
fn request_extension_key(request: &ExtensionHostRequest) -> String {
    match request {
        ExtensionHostRequest::Activate { .. } => String::new(),
        ExtensionHostRequest::Deactivate {
            extension_id,
            workspace_root,
        }
        | ExtensionHostRequest::UpdateSettings {
            extension_id,
            workspace_root,
            ..
        }
        | ExtensionHostRequest::NotifyViewSelection {
            extension_id,
            workspace_root,
            ..
        } => format!(
            "{}@{}",
            extension_id.trim().to_ascii_lowercase(),
            workspace_root.trim()
        ),
        ExtensionHostRequest::InvokeCapability { envelope, .. }
        | ExtensionHostRequest::ExecuteCommand { envelope, .. }
        | ExtensionHostRequest::ResolveView { envelope, .. } => format!(
            "{}@{}",
            envelope.extension_id.trim().to_ascii_lowercase(),
            envelope.workspace_root.trim()
        ),
        ExtensionHostRequest::RespondUiRequest { .. }
        | ExtensionHostRequest::ResolveHostCall { .. } => String::new(),
    }
}

#[cfg(not(test))]
fn mark_pending_host_calls_interrupted(
    state: &ExtensionHostState,
    error: &str,
) -> Result<Vec<String>, String> {
    let mut host_calls = state
        .host_calls
        .lock()
        .map_err(|_| "Failed to access extension host call state".to_string())?;
    let interrupted = host_calls
        .iter()
        .filter_map(|(request_id, status)| match status {
            ExtensionHostCallStatus::Pending => Some(request_id.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    for request_id in &interrupted {
        host_calls.insert(
            request_id.clone(),
            ExtensionHostCallStatus::Interrupted {
                error: error.to_string(),
            },
        );
    }
    Ok(interrupted)
}

#[cfg(not(test))]
fn emit_extension_host_interrupted(
    state: &ExtensionHostState,
    event: &ExtensionHostInterruptedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit(EXTENSION_HOST_INTERRUPTED_EVENT, event.clone())
            .map_err(|error| format!("Failed to emit extension host interrupted event: {error}"))?;
    }
    Ok(())
}

#[cfg(not(test))]
fn notify_extension_host_interrupted(
    state: &ExtensionHostState,
    error: &str,
) -> Result<(), String> {
    let interrupted_ui_requests = mark_pending_ui_requests_interrupted(state, error)?;
    for request_id in interrupted_ui_requests {
        let _ = emit_extension_host_interrupted(
            state,
            &ExtensionHostInterruptedEvent {
                request_id,
                kind: "windowInput".to_string(),
                message: error.to_string(),
            },
        );
    }

    let interrupted_host_calls = mark_pending_host_calls_interrupted(state, error)?;
    for request_id in interrupted_host_calls {
        let _ = emit_extension_host_interrupted(
            state,
            &ExtensionHostInterruptedEvent {
                request_id,
                kind: "hostCall".to_string(),
                message: error.to_string(),
            },
        );
    }

    Ok(())
}

#[cfg(not(test))]
fn extension_host_process_running(state: &ExtensionHostState) -> Result<bool, String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Failed to access extension host process state".to_string())?;
    let Some(child) = process.child.as_mut() else {
        return Ok(false);
    };
    match child.try_wait() {
        Ok(Some(_)) => {
            process.stdin = None;
            process.stdout = None;
            process.child = None;
            Ok(false)
        }
        Ok(None) => Ok(process.stdin.is_some() && process.stdout.is_some()),
        Err(error) => Err(format!(
            "Failed to inspect extension host process while waiting: {error}"
        )),
    }
}

#[cfg(not(test))]
fn send_extension_host_request(
    state: &ExtensionHostState,
    serialized_request: &str,
) -> Result<(), String> {
    let result = (|| {
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
        Ok(())
    })();

    if result.is_err() {
        let _ = reset_extension_host_process_state(state);
        let error = result
            .as_ref()
            .err()
            .cloned()
            .unwrap_or_else(|| "Extension host request failed".to_string());
        let _ = notify_extension_host_interrupted(state, &error);
    }

    result
}

#[cfg(not(test))]
fn read_extension_host_response_line(state: &ExtensionHostState) -> Result<String, String> {
    let result = (|| {
        let mut response_line = String::new();
        let bytes_read = {
            let mut process = ensure_extension_host_process(state)?;
            let stdout = process
                .stdout
                .as_mut()
                .ok_or_else(|| "Extension host stdout is unavailable".to_string())?;
            stdout
                .read_line(&mut response_line)
                .map_err(|error| format!("Failed to read extension host response: {error}"))?
        };

        if bytes_read == 0 {
            return Err("Extension host closed its response stream".to_string());
        }

        Ok(response_line)
    })();

    if result.is_err() {
        let _ = reset_extension_host_process_state(state);
        let error = result
            .as_ref()
            .err()
            .cloned()
            .unwrap_or_else(|| "Extension host response failed".to_string());
        let _ = notify_extension_host_interrupted(state, &error);
    }

    result
}

#[cfg(not(test))]
pub fn bind_extension_host_app_handle(state: &ExtensionHostState, app: tauri::AppHandle) {
    if let Ok(mut handle) = state.app_handle.lock() {
        *handle = Some(app);
    }
}

#[cfg(test)]
pub fn bind_extension_host_app_handle(_state: &ExtensionHostState, _app: tauri::AppHandle) {}

#[cfg(not(test))]
fn emit_extension_host_view_changed(
    state: &ExtensionHostState,
    event: &ExtensionHostViewChangedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit(EXTENSION_VIEW_CHANGED_EVENT, event.clone())
            .map_err(|error| format!("Failed to emit extension view change event: {error}"))?;
    }
    Ok(())
}

#[cfg(not(test))]
fn emit_extension_host_view_state_changed(
    state: &ExtensionHostState,
    event: &ExtensionHostViewStateChangedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit(EXTENSION_VIEW_STATE_CHANGED_EVENT, event.clone())
            .map_err(|error| {
                format!("Failed to emit extension view state change event: {error}")
            })?;
    }
    Ok(())
}

#[cfg(not(test))]
fn emit_extension_host_view_reveal_requested(
    state: &ExtensionHostState,
    event: &ExtensionHostViewRevealRequestedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit(EXTENSION_VIEW_REVEAL_REQUESTED_EVENT, event.clone())
            .map_err(|error| {
                format!("Failed to emit extension view reveal request event: {error}")
            })?;
    }
    Ok(())
}

#[cfg(not(test))]
fn emit_extension_host_window_input_requested(
    state: &ExtensionHostState,
    event: &ExtensionHostWindowInputRequestedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit("extension-window-input-requested", event.clone())
            .map_err(|error| {
                format!("Failed to emit extension window input request event: {error}")
            })?;
    }
    Ok(())
}

#[cfg(not(test))]
fn emit_extension_host_window_message(
    state: &ExtensionHostState,
    event: &ExtensionHostWindowMessageEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit(EXTENSION_WINDOW_MESSAGE_EVENT, event.clone())
            .map_err(|error| format!("Failed to emit extension window message event: {error}"))?;
    }
    Ok(())
}

#[cfg(not(test))]
fn emit_extension_host_call_requested(
    state: &ExtensionHostState,
    event: &ExtensionHostCallRequestedEvent,
) -> Result<(), String> {
    let handle = state
        .app_handle
        .lock()
        .map_err(|_| "Failed to access extension host app handle".to_string())?;
    if let Some(app) = handle.as_ref() {
        app.emit("extension-host-call-requested", event.clone())
            .map_err(|error| {
                format!("Failed to emit extension host call request event: {error}")
            })?;
    }
    Ok(())
}

#[cfg(not(test))]
fn mark_ui_request_pending(
    state: &ExtensionHostState,
    request_id: &str,
    extension_id: &str,
    workspace_root: &str,
) -> Result<(), String> {
    let mut ui_requests = state
        .ui_requests
        .lock()
        .map_err(|_| "Failed to access extension host UI request state".to_string())?;
    ui_requests.insert(
        request_id.to_string(),
        ExtensionHostUiRequestStatus::Pending {
            extension_id: extension_id.trim().to_ascii_lowercase(),
            workspace_root: workspace_root.trim().to_string(),
        },
    );
    Ok(())
}

#[cfg(not(test))]
fn mark_host_call_pending(state: &ExtensionHostState, request_id: &str) -> Result<(), String> {
    let mut host_calls = state
        .host_calls
        .lock()
        .map_err(|_| "Failed to access extension host call state".to_string())?;
    host_calls.insert(request_id.to_string(), ExtensionHostCallStatus::Pending);
    Ok(())
}

#[cfg(not(test))]
fn wait_for_ui_request_completion(
    state: &ExtensionHostState,
    request_id: &str,
) -> Result<ExtensionHostRespondUiRequestParams, String> {
    let started = Instant::now();
    let timeout = Duration::from_secs(300);
    loop {
        {
            let mut ui_requests = state
                .ui_requests
                .lock()
                .map_err(|_| "Failed to access extension host UI request state".to_string())?;
            if let Some(ExtensionHostUiRequestStatus::Completed { cancelled, result }) =
                ui_requests.get(request_id).cloned()
            {
                ui_requests.remove(request_id);
                return Ok(ExtensionHostRespondUiRequestParams {
                    request_id: request_id.to_string(),
                    cancelled,
                    result,
                });
            }
            if let Some(ExtensionHostUiRequestStatus::Interrupted { error }) =
                ui_requests.get(request_id).cloned()
            {
                ui_requests.remove(request_id);
                return Err(error);
            }
        }
        if started.elapsed() >= timeout {
            let mut ui_requests = state
                .ui_requests
                .lock()
                .map_err(|_| "Failed to access extension host UI request state".to_string())?;
            ui_requests.remove(request_id);
            return Err(format!("Extension UI request timed out: {request_id}"));
        }
        if !extension_host_process_running(state)? {
            let error = format!(
                "Extension host stopped while waiting for UI request completion: {request_id}"
            );
            let _ = notify_extension_host_interrupted(state, &error);
            continue;
        }
        std::thread::sleep(Duration::from_millis(16));
    }
}

#[cfg(not(test))]
fn wait_for_host_call_completion(
    state: &ExtensionHostState,
    request_id: &str,
) -> Result<ExtensionHostResolveHostCallParams, String> {
    let started = Instant::now();
    let timeout = Duration::from_secs(300);
    loop {
        {
            let mut host_calls = state
                .host_calls
                .lock()
                .map_err(|_| "Failed to access extension host call state".to_string())?;
            if let Some(ExtensionHostCallStatus::Completed {
                accepted,
                result,
                error,
            }) = host_calls.get(request_id).cloned()
            {
                host_calls.remove(request_id);
                return Ok(ExtensionHostResolveHostCallParams {
                    request_id: request_id.to_string(),
                    accepted,
                    result,
                    error,
                });
            }
            if let Some(ExtensionHostCallStatus::Interrupted { error }) =
                host_calls.get(request_id).cloned()
            {
                host_calls.remove(request_id);
                return Err(error);
            }
        }
        if started.elapsed() >= timeout {
            let mut host_calls = state
                .host_calls
                .lock()
                .map_err(|_| "Failed to access extension host call state".to_string())?;
            host_calls.remove(request_id);
            return Err(format!("Extension host call timed out: {request_id}"));
        }
        if !extension_host_process_running(state)? {
            let error = format!(
                "Extension host stopped while waiting for host call completion: {request_id}"
            );
            let _ = notify_extension_host_interrupted(state, &error);
            continue;
        }
        std::thread::sleep(Duration::from_millis(16));
    }
}

pub fn respond_extension_host_ui_request(
    state: &ExtensionHostState,
    params: ExtensionHostRespondUiRequestParams,
) -> Result<ExtensionHostRespondUiRequestResult, String> {
    let request_id = params.request_id.trim().to_string();
    if request_id.is_empty() {
        return Err("Extension UI request id is required".to_string());
    }
    let mut ui_requests = state
        .ui_requests
        .lock()
        .map_err(|_| "Failed to access extension host UI request state".to_string())?;
    let Some(status) = ui_requests.get_mut(&request_id) else {
        return Err(format!(
            "Pending extension UI request not found: {request_id}"
        ));
    };
    *status = ExtensionHostUiRequestStatus::Completed {
        cancelled: params.cancelled,
        result: params.result,
    };
    Ok(ExtensionHostRespondUiRequestResult {
        request_id,
        accepted: true,
    })
}

pub fn resolve_extension_host_call(
    state: &ExtensionHostState,
    params: ExtensionHostResolveHostCallParams,
) -> Result<ExtensionHostCallAcknowledgement, String> {
    let request_id = params.request_id.trim().to_string();
    if request_id.is_empty() {
        return Err("Extension host call request id is required".to_string());
    }
    let mut host_calls = state
        .host_calls
        .lock()
        .map_err(|_| "Failed to access extension host call state".to_string())?;
    let Some(status) = host_calls.get_mut(&request_id) else {
        return Err(format!(
            "Pending extension host call not found: {request_id}"
        ));
    };
    *status = ExtensionHostCallStatus::Completed {
        accepted: params.accepted,
        result: params.result,
        error: params.error,
    };
    Ok(ExtensionHostCallAcknowledgement {
        request_id,
        accepted: true,
    })
}

#[cfg_attr(test, allow(dead_code))]
fn persist_extension_host_state_changed_event(
    state: &ExtensionHostState,
    event: &ExtensionHostStateChangedEvent,
) -> Result<(), String> {
    let activation_key =
        normalize_extension_workspace_key(&event.extension_id, &event.workspace_root);
    let global_config_dir = state
        .activation_context
        .lock()
        .map_err(|_| "Failed to access extension host activation context".to_string())?
        .get(&activation_key)
        .map(|(global_config_dir, _)| global_config_dir.clone())
        .unwrap_or_default();
    let snapshot = crate::extension_settings::ExtensionRuntimeStateSnapshot {
        global_state: event.global_state.clone(),
        workspace_state: event.workspace_state.clone(),
    };
    save_extension_runtime_state_snapshot(
        &global_config_dir,
        &event.workspace_root,
        &event.extension_id,
        snapshot,
    )?;
    Ok(())
}

#[cfg(not(test))]
fn activation_context_for_extension(
    state: &ExtensionHostState,
    extension_id: &str,
    workspace_root: &str,
) -> Result<(String, String), String> {
    let activation_key = normalize_extension_workspace_key(extension_id, workspace_root);
    state
        .activation_context
        .lock()
        .map_err(|_| "Failed to access extension host activation context".to_string())?
        .get(&activation_key)
        .cloned()
        .ok_or_else(|| {
            format!(
                "Extension activation context not found: {}@{}",
                extension_id, workspace_root
            )
        })
}

#[cfg(not(test))]
fn resolve_process_call_working_dir(
    workspace_root: &str,
    payload: &Value,
) -> Result<Option<PathBuf>, String> {
    let requested = payload
        .get("cwd")
        .and_then(Value::as_str)
        .unwrap_or(workspace_root)
        .trim()
        .to_string();
    if requested.is_empty() {
        return Ok(None);
    }
    let cwd = Path::new(&requested)
        .canonicalize()
        .map_err(|error| format!("Failed to resolve process cwd: {error}"))?;
    if !workspace_root.trim().is_empty() {
        let canonical_workspace_root = Path::new(workspace_root)
            .canonicalize()
            .map_err(|error| format!("Failed to resolve workspace root: {error}"))?;
        if !cwd.starts_with(&canonical_workspace_root) {
            return Err(format!(
                "Process cwd is outside the active workspace: {}",
                cwd.display()
            ));
        }
    }
    Ok(Some(cwd))
}

#[cfg(not(test))]
fn handle_extension_host_process_call(
    state: &ExtensionHostState,
    task_runtime_state: Option<&ExtensionTaskRuntimeState>,
    event: &ExtensionHostCallRequestedEvent,
) -> Result<ExtensionHostResolveHostCallParams, String> {
    let (global_config_dir, workspace_root) =
        activation_context_for_extension(state, &event.extension_id, &event.workspace_root)?;
    let entry = find_extension_entry(&global_config_dir, &workspace_root, &event.extension_id)?;
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!("Extension manifest is invalid: {}", entry.id));
    };
    if !manifest.permissions.spawn_process {
        return Err(format!(
            "Extension {} is not allowed to spawn local processes",
            entry.id
        ));
    }

    let payload = if event.payload.is_object() {
        event.payload.as_object().cloned().unwrap_or_default()
    } else {
        Default::default()
    };
    let args = payload
        .get("args")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|value| match value {
            Value::String(text) => text,
            other => other.to_string(),
        })
        .collect::<Vec<_>>();
    let env_map = payload
        .get("env")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let task_id = task_id_for_host_call_event(event);

    let result = match event.kind.as_str() {
        "process.exec" => {
            let command_name = payload
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if command_name.is_empty() {
                return Err("Process command is required".to_string());
            }
            let mut command = background_command(&command_name);
            command.args(&args);
            if let Some(cwd) =
                resolve_process_call_working_dir(&workspace_root, &Value::Object(payload.clone()))?
            {
                command.current_dir(cwd);
            }
            for (key, value) in env_map.clone() {
                let normalized_key = key.trim();
                if normalized_key.is_empty() {
                    continue;
                }
                let normalized_value = match value {
                    Value::String(text) => text,
                    other => other.to_string(),
                };
                command.env(normalized_key, normalized_value);
            }
            command.stdin(Stdio::null());
            command.stdout(Stdio::piped());
            command.stderr(Stdio::piped());
            let output = command
                .output()
                .map_err(|error| format!("Failed to execute process: {error}"))?;
            json!({
                "ok": output.status.success(),
                "code": output.status.code(),
                "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
                "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
            })
        }
        "process.spawn" => {
            let command_name = payload
                .get("command")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            if command_name.is_empty() {
                return Err("Process command is required".to_string());
            }
            let mut command = background_command(&command_name);
            command.args(&args);
            if let Some(cwd) =
                resolve_process_call_working_dir(&workspace_root, &Value::Object(payload.clone()))?
            {
                command.current_dir(cwd);
            }
            for (key, value) in env_map.clone() {
                let normalized_key = key.trim();
                if normalized_key.is_empty() {
                    continue;
                }
                let normalized_value = match value {
                    Value::String(text) => text,
                    other => other.to_string(),
                };
                command.env(normalized_key, normalized_value);
            }
            command.stdin(Stdio::null());
            command.stdout(Stdio::null());
            command.stderr(Stdio::null());
            let child = command
                .spawn()
                .map_err(|error| format!("Failed to spawn process: {error}"))?;
            let pid = child.id();
            if let Some(runtime_state) = task_runtime_state {
                runtime_state.register_pid(&task_id, pid)?;
            }
            register_spawned_process(state, pid, child)?;
            json!({
                "ok": true,
                "pid": pid,
            })
        }
        "process.wait" => {
            let pid = payload
                .get("pid")
                .and_then(Value::as_u64)
                .or_else(|| {
                    payload
                        .get("pid")
                        .and_then(Value::as_str)
                        .and_then(|value| value.trim().parse::<u64>().ok())
                })
                .ok_or_else(|| "Process pid is required for process.wait".to_string())?;
            wait_for_spawned_process(state, pid as u32)?
        }
        other => {
            return Err(format!("Unsupported extension host call kind: {other}"));
        }
    };

    Ok(ExtensionHostResolveHostCallParams {
        request_id: event.request_id.clone(),
        accepted: true,
        result,
        error: String::new(),
    })
}

#[cfg(not(test))]
fn handle_extension_host_reference_call(
    state: &ExtensionHostState,
    event: &ExtensionHostCallRequestedEvent,
) -> Result<ExtensionHostResolveHostCallParams, String> {
    let (global_config_dir, workspace_root) =
        activation_context_for_extension(state, &event.extension_id, &event.workspace_root)?;
    let entry = find_extension_entry(&global_config_dir, &workspace_root, &event.extension_id)?;
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!("Extension manifest is invalid: {}", entry.id));
    };
    if !manifest.permissions.read_reference_library {
        return Err(format!(
            "Extension {} is not allowed to read the reference library",
            entry.id
        ));
    }
    let result = match event.kind.as_str() {
        "references.readCurrentLibrary" => {
            crate::references_backend::load_reference_library_snapshot(&global_config_dir)?
        }
        other => {
            return Err(format!("Unsupported reference host call kind: {other}"));
        }
    };
    Ok(ExtensionHostResolveHostCallParams {
        request_id: event.request_id.clone(),
        accepted: true,
        result,
        error: String::new(),
    })
}

#[cfg(not(test))]
fn handle_extension_host_task_call(
    state: &ExtensionHostState,
    task_runtime_state: Option<&crate::extension_tasks::ExtensionTaskRuntimeState>,
    event: &ExtensionHostCallRequestedEvent,
) -> Result<ExtensionHostResolveHostCallParams, String> {
    let task_id = task_id_for_host_call_event(event);
    if task_id.is_empty() {
        return Err("Task update requires taskId".to_string());
    }
    let patch = serde_json::from_value::<crate::extension_tasks::ExtensionTaskUpdatePatch>(
        event.payload.clone(),
    )
    .map_err(|error| format!("Invalid task update payload: {error}"))?;
    let task = crate::extension_tasks::apply_task_update(&event.extension_id, &task_id, patch)?;
    if let Some(runtime_state) = task_runtime_state {
        if matches!(task.state.as_str(), "succeeded" | "failed" | "cancelled") {
            if let Some(pid) = runtime_state.unregister_pid(&task.id)? {
                let _ = reap_spawned_process(state, pid, false);
            }
        }
        runtime_state.emit_task_changed(&task);
    }
    Ok(ExtensionHostResolveHostCallParams {
        request_id: event.request_id.clone(),
        accepted: true,
        result: serde_json::to_value(task)
            .map_err(|error| format!("Failed to serialize task update result: {error}"))?,
        error: String::new(),
    })
}

#[cfg(not(test))]
fn handle_extension_host_pdf_call(
    state: &ExtensionHostState,
    event: &ExtensionHostCallRequestedEvent,
) -> Result<ExtensionHostResolveHostCallParams, String> {
    let (global_config_dir, workspace_root) =
        activation_context_for_extension(state, &event.extension_id, &event.workspace_root)?;
    let entry = find_extension_entry(&global_config_dir, &workspace_root, &event.extension_id)?;
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!("Extension manifest is invalid: {}", entry.id));
    };
    if !manifest.permissions.read_workspace_files && !manifest.permissions.read_reference_library {
        return Err(format!(
            "Extension {} is not allowed to inspect PDF content",
            entry.id
        ));
    }
    let file_path = event
        .payload
        .get("filePath")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if file_path.is_empty() {
        return Err("PDF filePath is required".to_string());
    }
    let canonical_path = ensure_extension_pdf_path_allowed(
        &workspace_root,
        &global_config_dir,
        manifest,
        &file_path,
    )?;
    let result = match event.kind.as_str() {
        "pdf.extractText" => Value::String(crate::references_pdf::extract_reference_pdf_text(
            &canonical_path,
        )?),
        "pdf.extractMetadata" => {
            crate::references_pdf::extract_reference_pdf_metadata(&canonical_path)?
        }
        other => {
            return Err(format!("Unsupported PDF host call kind: {other}"));
        }
    };
    Ok(ExtensionHostResolveHostCallParams {
        request_id: event.request_id.clone(),
        accepted: true,
        result,
        error: String::new(),
    })
}

pub fn invoke_extension_host(
    state: &ExtensionHostState,
    task_runtime_state: Option<&crate::extension_tasks::ExtensionTaskRuntimeState>,
    request: ExtensionHostRequest,
) -> Result<ExtensionHostResponse, String> {
    #[cfg(test)]
    let _ = (state, task_runtime_state);

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
        EXTENSION_HOST_INVOKE_DEPTH.with(|depth| {
            let current_depth = depth.get();
            if current_depth > 0 {
                depth.set(current_depth + 1);
                let response = invoke_extension_host_serialized(state, task_runtime_state, request);
                depth.set(current_depth);
                response
            } else {
                if !matches!(request, ExtensionHostRequest::RespondUiRequest { .. }) {
                    if let Some(owner) = pending_ui_request_owner(state)? {
                        let _request_extension_key = request_extension_key(&request);
                        return Err(format!(
                            "Extension host is waiting for UI input from {}; complete or cancel that prompt before sending another top-level request",
                            format_pending_prompt_owner(&owner)
                        ));
                    }
                }
                let _guard = state
                    .request_lock
                    .lock()
                    .map_err(|_| "Failed to access extension host request lock".to_string())?;
                depth.set(1);
                let response = invoke_extension_host_serialized(state, task_runtime_state, request);
                depth.set(0);
                response
            }
        })
    }
}

#[cfg(not(test))]
fn invoke_extension_host_serialized(
    state: &ExtensionHostState,
    task_runtime_state: Option<&crate::extension_tasks::ExtensionTaskRuntimeState>,
    request: ExtensionHostRequest,
) -> Result<ExtensionHostResponse, String> {
    let serialized_request = serde_json::to_string(&request)
        .map_err(|error| format!("Failed to serialize extension host request: {error}"))?;
    send_extension_host_request(state, &serialized_request)?;

    loop {
        let response_line = read_extension_host_response_line(state)?;
        if response_line.trim().is_empty() {
            continue;
        }

        let response = serde_json::from_str::<ExtensionHostResponse>(response_line.trim())
            .map_err(|error| format!("Failed to parse extension host response: {error}"))?;
        match &response {
            ExtensionHostResponse::ViewChanged(event) => {
                emit_extension_host_view_changed(state, event)?;
                continue;
            }
            ExtensionHostResponse::ViewStateChanged(event) => {
                emit_extension_host_view_state_changed(state, event)?;
                continue;
            }
            ExtensionHostResponse::ViewRevealRequested(event) => {
                emit_extension_host_view_reveal_requested(state, event)?;
                continue;
            }
            ExtensionHostResponse::WindowInputRequested(event) => {
                mark_ui_request_pending(
                    state,
                    &event.request_id,
                    &event.extension_id,
                    &event.workspace_root,
                )?;
                emit_extension_host_window_input_requested(state, event)?;
                let request_id = event.request_id.clone();
                let completed = wait_for_ui_request_completion(state, &request_id)?;
                let response = invoke_extension_host(
                    state,
                    task_runtime_state,
                    ExtensionHostRequest::RespondUiRequest {
                        request_id: completed.request_id,
                        cancelled: completed.cancelled,
                        result: completed.result,
                    },
                )?;
                match response {
                    ExtensionHostResponse::AcknowledgeUiRequest(_) => continue,
                    ExtensionHostResponse::Error { message } => return Err(message),
                    other => return Ok(other),
                }
            }
            ExtensionHostResponse::HostCallRequested(event) => {
                let completed = match event.kind.as_str() {
                    "process.exec" | "process.spawn" | "process.wait" => Some(
                        handle_extension_host_process_call(state, task_runtime_state, event)
                            .unwrap_or_else(|error| ExtensionHostResolveHostCallParams {
                                request_id: event.request_id.clone(),
                                accepted: false,
                                result: Value::Null,
                                error,
                            }),
                    ),
                    "tasks.update" => Some(
                        handle_extension_host_task_call(state, task_runtime_state, event)
                            .unwrap_or_else(|error| ExtensionHostResolveHostCallParams {
                                request_id: event.request_id.clone(),
                                accepted: false,
                                result: Value::Null,
                                error,
                            }),
                    ),
                    "references.readCurrentLibrary" => Some(
                        handle_extension_host_reference_call(state, event).unwrap_or_else(
                            |error| ExtensionHostResolveHostCallParams {
                                request_id: event.request_id.clone(),
                                accepted: false,
                                result: Value::Null,
                                error,
                            },
                        ),
                    ),
                    "pdf.extractText" | "pdf.extractMetadata" => Some(
                        handle_extension_host_pdf_call(state, event).unwrap_or_else(|error| {
                            ExtensionHostResolveHostCallParams {
                                request_id: event.request_id.clone(),
                                accepted: false,
                                result: Value::Null,
                                error,
                            }
                        }),
                    ),
                    _ => None,
                };
                if let Some(completed) = completed {
                    let response = invoke_extension_host(
                        state,
                        task_runtime_state,
                        ExtensionHostRequest::ResolveHostCall {
                            request_id: completed.request_id,
                            accepted: completed.accepted,
                            result: completed.result,
                            error: completed.error,
                        },
                    )?;
                    match response {
                        ExtensionHostResponse::AcknowledgeHostCall(_) => continue,
                        ExtensionHostResponse::Error { message } => return Err(message),
                        other => return Ok(other),
                    }
                }
                mark_host_call_pending(state, &event.request_id)?;
                emit_extension_host_call_requested(state, event)?;
                let request_id = event.request_id.clone();
                let completed = wait_for_host_call_completion(state, &request_id)?;
                let response = invoke_extension_host(
                    state,
                    task_runtime_state,
                    ExtensionHostRequest::ResolveHostCall {
                        request_id: completed.request_id,
                        accepted: completed.accepted,
                        result: completed.result,
                        error: completed.error,
                    },
                )?;
                match response {
                    ExtensionHostResponse::AcknowledgeHostCall(_) => continue,
                    ExtensionHostResponse::Error { message } => return Err(message),
                    other => return Ok(other),
                }
            }
            ExtensionHostResponse::StateChanged(event) => {
                persist_extension_host_state_changed_event(state, event)?;
                continue;
            }
            ExtensionHostResponse::WindowMessage(event) => {
                emit_extension_host_window_message(state, event)?;
                continue;
            }
            ExtensionHostResponse::Error { message } => return Err(message.clone()),
            _ => return Ok(response),
        }
    }
}

pub fn invoke_extension_host_for_probe(
    state: &ExtensionHostState,
    request: ExtensionHostRequest,
) -> Result<ExtensionHostResponse, String> {
    invoke_extension_host(state, None, request)
}

pub fn invoke_extension_host_with_task_runtime_for_probe(
    state: &ExtensionHostState,
    request: ExtensionHostRequest,
) -> Result<ExtensionHostResponse, String> {
    let runtime_state = crate::extension_tasks::ExtensionTaskRuntimeState::default();
    invoke_extension_host(state, Some(&runtime_state), request)
}

#[cfg(not(test))]
pub fn spawned_process_count_for_probe(state: &ExtensionHostState) -> Result<usize, String> {
    let processes = state
        .spawned_processes
        .lock()
        .map_err(|_| "Failed to access spawned process state".to_string())?;
    Ok(processes.len())
}

#[cfg(test)]
pub fn spawned_process_count_for_probe(_state: &ExtensionHostState) -> Result<usize, String> {
    Ok(0)
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
            registered_views: Vec::new(),
            registered_command_details: Vec::new(),
            registered_menu_actions: Vec::new(),
            registered_view_details: Vec::new(),
        }),
        ExtensionHostRequest::Deactivate { extension_id, .. } => {
            ExtensionHostResponse::AcknowledgeDeactivation(
                ExtensionHostDeactivationAcknowledgement {
                    extension_id,
                    accepted: true,
                },
            )
        }
        ExtensionHostRequest::InvokeCapability { envelope, .. } => {
            ExtensionHostResponse::InvokeCapability(ExtensionHostCapabilityResult {
                accepted: true,
                message: format!(
                    "Extension host accepted {} for {}",
                    envelope.capability, envelope.extension_id
                ),
                progress_label: "Accepted by extension host".to_string(),
                task_state: "succeeded".to_string(),
                changed_views: Vec::new(),
                result_entries: Vec::new(),
                artifacts: Vec::new(),
                outputs: Vec::new(),
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
            task_state: "succeeded".to_string(),
            changed_views: Vec::new(),
            result_entries: Vec::new(),
            artifacts: Vec::new(),
            outputs: Vec::new(),
        }),
        ExtensionHostRequest::ResolveView {
            view_id,
            parent_item_id,
            envelope,
            ..
        } => ExtensionHostResponse::ResolveView(ExtensionHostViewResolveResult {
            view_id,
            parent_item_id,
            title: envelope.extension_id.clone(),
            description: String::new(),
            message: String::new(),
            badge_value: None,
            badge_tooltip: String::new(),
            status_label: String::new(),
            status_tone: String::new(),
            action_label: String::new(),
            presentation: ExtensionHostViewPresentation::default(),
            sections: Vec::new(),
            result_entries: Vec::new(),
            artifacts: Vec::new(),
            outputs: Vec::new(),
            items: Vec::new(),
        }),
        ExtensionHostRequest::RespondUiRequest { request_id, .. } => {
            ExtensionHostResponse::AcknowledgeUiRequest(ExtensionHostUiRequestAcknowledgement {
                request_id,
                accepted: true,
            })
        }
        ExtensionHostRequest::ResolveHostCall {
            request_id,
            accepted,
            ..
        } => ExtensionHostResponse::AcknowledgeHostCall(ExtensionHostCallAcknowledgement {
            request_id,
            accepted,
        }),
        ExtensionHostRequest::UpdateSettings { extension_id, .. } => {
            ExtensionHostResponse::AcknowledgeSettingsUpdate(
                ExtensionHostSettingsUpdateAcknowledgement {
                    extension_id,
                    accepted: true,
                    changed_keys: Vec::new(),
                },
            )
        }
        ExtensionHostRequest::NotifyViewSelection {
            extension_id,
            view_id,
            ..
        } => ExtensionHostResponse::AcknowledgeViewSelection(
            ExtensionHostViewSelectionAcknowledgement {
                extension_id,
                view_id,
                accepted: true,
            },
        ),
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
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostActivationResult, String> {
    let params = extension_host_activate_params_from_payload(params);
    let entry = find_extension_entry(
        &params.global_config_dir,
        &params.workspace_root,
        &params.extension_id,
    )?;
    activate_extension(
        state.inner(),
        &params.global_config_dir,
        &params.workspace_root,
        &entry,
        &params.activation_event,
    )
}

#[tauri::command]
pub async fn extension_host_deactivate(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostDeactivationAcknowledgement, String> {
    let params = extension_host_deactivate_params_from_payload(params);
    let extension_id = params.extension_id.trim().to_ascii_lowercase();
    let workspace_root = params.workspace_root.trim().to_string();
    if extension_id.is_empty() {
        return Err("Extension id is required".to_string());
    }
    let result = match invoke_extension_host(
        state.inner(),
        None,
        ExtensionHostRequest::Deactivate {
            extension_id: extension_id.clone(),
            workspace_root: workspace_root.clone(),
        },
    )? {
        ExtensionHostResponse::AcknowledgeDeactivation(result) => result,
        _ => return Err("Unexpected extension host response for deactivation".to_string()),
    };
    if result.accepted {
        let activation_key = normalize_extension_workspace_key(&extension_id, &workspace_root);
        if let Ok(mut activated) = state.activated_extensions.lock() {
            activated.remove(&activation_key);
        }
        if let Ok(mut contexts) = state.activation_context.lock() {
            contexts.remove(&activation_key);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn extension_host_cancel_window_inputs(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostCancelWindowInputsResult, String> {
    let params = extension_host_cancel_window_inputs_params_from_payload(params);
    cancel_window_inputs_for_extension_for_probe(
        state.inner(),
        &params.extension_id,
        &params.workspace_root,
    )
}

#[tauri::command]
pub async fn extension_host_respond_ui_request(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostRespondUiRequestResult, String> {
    let params = extension_host_respond_ui_request_params_from_payload(params);
    respond_extension_host_ui_request(state.inner(), params)
}

#[tauri::command]
pub async fn extension_host_resolve_host_call(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostCallAcknowledgement, String> {
    let params = extension_host_resolve_host_call_params_from_payload(params);
    resolve_extension_host_call(state.inner(), params)
}

#[tauri::command]
pub async fn extension_host_update_settings(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostSettingsUpdateAcknowledgement, String> {
    let params = extension_host_update_settings_params_from_payload(params);
    let extension_id = params.extension_id.trim().to_ascii_lowercase();
    if extension_id.is_empty() {
        return Err("Extension id is required".to_string());
    }
    let normalized_settings = if params.settings.is_object() {
        params.settings
    } else {
        Value::Object(Default::default())
    };
    let entry = find_extension_entry(
        &params.global_config_dir,
        &params.workspace_root,
        &extension_id,
    )?;
    let Some(manifest) = entry.manifest.as_ref() else {
        return Err(format!("Extension manifest is invalid: {}", entry.id));
    };
    let changed_keys = normalized_settings
        .as_object()
        .map(|map| map.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    match invoke_extension_host(
        state.inner(),
        None,
        ExtensionHostRequest::UpdateSettings {
            extension_id: extension_id.clone(),
            workspace_root: params.workspace_root.clone(),
            settings: normalized_settings,
        },
    )? {
        ExtensionHostResponse::AcknowledgeSettingsUpdate(result) => Ok(result),
        ExtensionHostResponse::Activate(_) => Ok(ExtensionHostSettingsUpdateAcknowledgement {
            extension_id: extension_id.clone(),
            accepted: true,
            changed_keys,
        }),
        _ if manifest.runtime.runtime_type == "extensionHost" => {
            Ok(ExtensionHostSettingsUpdateAcknowledgement {
                extension_id,
                accepted: true,
                changed_keys,
            })
        }
        _ => Err("Unexpected extension host response for settings update".to_string()),
    }
}

#[tauri::command]
pub async fn extension_host_notify_view_selection(
    params: Value,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostViewSelectionAcknowledgement, String> {
    let params = extension_host_notify_view_selection_params_from_payload(params);
    let extension_id = params.extension_id.trim().to_string();
    let view_id = params.view_id.trim().to_string();
    if extension_id.is_empty() || view_id.is_empty() {
        return Err("Extension id and view id are required".to_string());
    }
    match invoke_extension_host(
        state.inner(),
        None,
        ExtensionHostRequest::NotifyViewSelection {
            extension_id: extension_id.clone(),
            workspace_root: params.workspace_root.clone(),
            view_id: view_id.clone(),
            item_handle: params.item_handle.trim().to_string(),
        },
    )? {
        ExtensionHostResponse::AcknowledgeViewSelection(result) => Ok(result),
        _ => Err("Unexpected extension host response for view selection".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        activate_extension, build_extension_invocation_envelope, ensure_extension_pdf_path_allowed,
        extension_host_activate_params_from_payload,
        extension_host_cancel_window_inputs_params_from_payload,
        extension_host_deactivate_params_from_payload,
        extension_host_notify_view_selection_params_from_payload,
        extension_host_resolve_host_call_params_from_payload,
        extension_host_respond_ui_request_params_from_payload,
        extension_host_update_settings_params_from_payload, handle_extension_host_request,
        should_activate_for_event, ExtensionHostRequest, ExtensionHostResponse, ExtensionHostState,
    };
    use crate::extension_manifest::{
        parse_extension_manifest_str, ExtensionManifest, CANONICAL_EXTENSION_MANIFEST_FILENAME,
    };
    use crate::extension_registry::ExtensionRegistryEntry;
    use std::fs;

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
                    }]
                },
                "permissions": {
                    "readWorkspaceFiles": true,
                    "spawnProcess": true
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
    fn extension_host_params_normalize_raw_payloads() {
        let activate = extension_host_activate_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "extensionId": " example-pdf-extension ",
            "activationEvent": " onCommand:scribeflow.pdf.translate "
        }));
        assert_eq!(activate.global_config_dir, "/tmp/global-config");
        assert_eq!(activate.workspace_root, "/tmp/workspace");
        assert_eq!(activate.extension_id, "example-pdf-extension");
        assert_eq!(
            activate.activation_event,
            "onCommand:scribeflow.pdf.translate"
        );

        let snake_activate = extension_host_activate_params_from_payload(serde_json::json!({
            "global_config_dir": " /tmp/global-snake ",
            "workspace_root": " /tmp/workspace-snake ",
            "extension_id": " example-markdown-extension ",
            "activation_event": " onCommand:document.summarize "
        }));
        assert_eq!(snake_activate.global_config_dir, "/tmp/global-snake");
        assert_eq!(snake_activate.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_activate.extension_id, "example-markdown-extension");
        assert_eq!(
            snake_activate.activation_event,
            "onCommand:document.summarize"
        );

        let fallback_activate = extension_host_activate_params_from_payload(serde_json::json!({
            "globalConfigDir": 42,
            "workspaceRoot": null,
            "extensionId": false,
            "activationEvent": ["not", "a", "string"]
        }));
        assert_eq!(fallback_activate.global_config_dir, "");
        assert_eq!(fallback_activate.workspace_root, "");
        assert_eq!(fallback_activate.extension_id, "");
        assert_eq!(fallback_activate.activation_event, "");

        let deactivate = extension_host_deactivate_params_from_payload(serde_json::json!({
            "extensionId": " Example-PDF-Extension ",
            "workspaceRoot": " /tmp/workspace "
        }));
        assert_eq!(deactivate.extension_id, "Example-PDF-Extension");
        assert_eq!(deactivate.workspace_root, "/tmp/workspace");

        let cancel_inputs =
            extension_host_cancel_window_inputs_params_from_payload(serde_json::json!({
                "extension_id": " example-pdf-extension ",
                "workspace_root": " /tmp/workspace "
            }));
        assert_eq!(cancel_inputs.extension_id, "example-pdf-extension");
        assert_eq!(cancel_inputs.workspace_root, "/tmp/workspace");

        let settings = extension_host_update_settings_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "extensionId": " example-pdf-extension ",
            "settings": {
                "targetLang": "zh-CN"
            }
        }));
        assert_eq!(settings.global_config_dir, "/tmp/global-config");
        assert_eq!(settings.workspace_root, "/tmp/workspace");
        assert_eq!(settings.extension_id, "example-pdf-extension");
        assert_eq!(settings.settings["targetLang"], "zh-CN");

        let invalid_settings =
            extension_host_update_settings_params_from_payload(serde_json::json!({
                "settings": ["not", "an", "object"]
            }));
        assert_eq!(invalid_settings.settings, serde_json::json!({}));

        let selection =
            extension_host_notify_view_selection_params_from_payload(serde_json::json!({
                "extensionId": " example-pdf-extension ",
                "workspaceRoot": " /tmp/workspace ",
                "viewId": " examplePdfExtension.tools ",
                "itemHandle": 42
            }));
        assert_eq!(selection.extension_id, "example-pdf-extension");
        assert_eq!(selection.workspace_root, "/tmp/workspace");
        assert_eq!(selection.view_id, "examplePdfExtension.tools");
        assert_eq!(selection.item_handle, "");

        let snake_selection =
            extension_host_notify_view_selection_params_from_payload(serde_json::json!({
                "extension_id": " example-markdown-extension ",
                "workspace_root": " /tmp/workspace-snake ",
                "view_id": " exampleMarkdownExtension.notes ",
                "item_handle": " item-1 "
            }));
        assert_eq!(snake_selection.extension_id, "example-markdown-extension");
        assert_eq!(snake_selection.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_selection.view_id, "exampleMarkdownExtension.notes");
        assert_eq!(snake_selection.item_handle, "item-1");
    }

    #[test]
    fn extension_host_call_resolution_params_preserve_default_acceptance() {
        let default_accept =
            extension_host_resolve_host_call_params_from_payload(serde_json::json!({
                "requestId": " request-1 ",
                "result": {
                    "ok": true
                },
                "error": false
            }));
        assert_eq!(default_accept.request_id, "request-1");
        assert!(default_accept.accepted);
        assert_eq!(default_accept.result["ok"], true);
        assert_eq!(default_accept.error, "");

        let explicit_reject =
            extension_host_resolve_host_call_params_from_payload(serde_json::json!({
                "request_id": " request-2 ",
                "accepted": false,
                "result": null,
                "error": " denied "
            }));
        assert_eq!(explicit_reject.request_id, "request-2");
        assert!(!explicit_reject.accepted);
        assert!(explicit_reject.result.is_null());
        assert_eq!(explicit_reject.error, "denied");

        let non_object =
            extension_host_resolve_host_call_params_from_payload(serde_json::json!(false));
        assert_eq!(non_object.request_id, "");
        assert!(non_object.accepted);
        assert!(non_object.result.is_null());
        assert_eq!(non_object.error, "");
    }

    #[test]
    fn extension_host_ui_response_params_normalize_raw_payloads() {
        let confirmed = extension_host_respond_ui_request_params_from_payload(serde_json::json!({
            "requestId": " request-ui-1 ",
            "cancelled": false,
            "result": {
                "selected": "alpha"
            }
        }));
        assert_eq!(confirmed.request_id, "request-ui-1");
        assert!(!confirmed.cancelled);
        assert_eq!(confirmed.result["selected"], "alpha");

        let cancelled = extension_host_respond_ui_request_params_from_payload(serde_json::json!({
            "request_id": " request-ui-2 ",
            "cancelled": true,
            "result": ["alpha", "beta"]
        }));
        assert_eq!(cancelled.request_id, "request-ui-2");
        assert!(cancelled.cancelled);
        assert_eq!(cancelled.result[0], "alpha");

        let fallback = extension_host_respond_ui_request_params_from_payload(serde_json::json!({
            "requestId": 42,
            "cancelled": "true"
        }));
        assert_eq!(fallback.request_id, "");
        assert!(!fallback.cancelled);
        assert!(fallback.result.is_null());

        let non_object =
            extension_host_respond_ui_request_params_from_payload(serde_json::json!(false));
        assert_eq!(non_object.request_id, "");
        assert!(!non_object.cancelled);
        assert!(non_object.result.is_null());
    }

    #[test]
    fn activates_extension_host_entry() {
        let state = ExtensionHostState::default();
        let entry = canonical_entry();
        let activated =
            activate_extension(&state, "", "", &entry, "onCommand:scribeflow.pdf.translate")
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
        assert!(!should_activate_for_event(
            &manifest,
            "onCapability:pdf.translate"
        ));
    }

    #[test]
    fn activation_runtime_rejects_undeclared_events() {
        let state = ExtensionHostState::default();
        let entry = canonical_entry();

        let denied_command = activate_extension(
            &state,
            "",
            "",
            &entry,
            "onCommand:examplePdfExtension.captureContext",
        )
        .expect_err("undeclared command activation must fail");
        assert!(denied_command.contains("does not declare activation event"));

        let denied_view = activate_extension(
            &state,
            "",
            "",
            &entry,
            "onView:examplePdfExtension.hiddenView",
        )
        .expect_err("undeclared view activation must fail");
        assert!(denied_view.contains("does not declare activation event"));

        let allowed =
            activate_extension(&state, "", "", &entry, "onCommand:scribeflow.pdf.translate")
                .expect("declared activation should pass");
        assert!(allowed.activated);
    }

    #[test]
    fn builds_invocation_envelope() {
        let envelope = build_extension_invocation_envelope(
            "task-1",
            "extension-1",
            "/tmp/workspace",
            "scribeflow.pdf.translate",
            "",
            "",
            "ref-123",
            "pdf.translate",
            "referencePdf",
            "/tmp/paper.pdf",
            &serde_json::json!({"targetLang": "zh-CN"}),
            "zh-CN",
        );
        assert_eq!(envelope.task_id, "task-1");
        assert_eq!(envelope.extension_id, "extension-1");
        assert_eq!(envelope.workspace_root, "/tmp/workspace");
        assert!(envelope.settings_json.contains("targetLang"));
        assert_eq!(envelope.locale, "zh-CN");
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
                "/tmp/workspace",
                "scribeflow.pdf.translate",
                "",
                "",
                "ref-123",
                "pdf.translate",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
                "zh-CN",
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
                "/tmp/workspace",
                "scribeflow.pdf.translate",
                "",
                "",
                "ref-123",
                "",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
                "zh-CN",
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
            parent_item_id: "".to_string(),
            envelope: build_extension_invocation_envelope(
                "",
                "extension-1",
                "/tmp/workspace",
                "",
                "",
                "",
                "ref-123",
                "",
                "referencePdf",
                "/tmp/paper.pdf",
                &serde_json::json!({"targetLang": "zh-CN"}),
                "zh-CN",
            ),
        });
        match response {
            ExtensionHostResponse::ResolveView(result) => {
                assert_eq!(result.view_id, "examplePdfExtension.translateView");
            }
            _ => panic!("unexpected response"),
        }
    }

    #[test]
    fn sidecar_request_handler_acknowledges_host_call_resolution() {
        let response = handle_extension_host_request(ExtensionHostRequest::ResolveHostCall {
            request_id: "example-pdf-extension:host:1".to_string(),
            accepted: true,
            result: serde_json::json!({
                "ok": true,
                "pid": 4242,
                "code": 0
            }),
            error: String::new(),
        });
        match response {
            ExtensionHostResponse::AcknowledgeHostCall(result) => {
                assert_eq!(result.request_id, "example-pdf-extension:host:1");
                assert!(result.accepted);
            }
            _ => panic!("unexpected response"),
        }
    }

    fn manifest_with_permissions(
        read_workspace_files: bool,
        read_reference_library: bool,
    ) -> ExtensionManifest {
        parse_extension_manifest_str(
            &serde_json::json!({
                "name": "example-pdf-extension",
                "displayName": "Example PDF Extension",
                "version": "0.1.0",
                "main": "./dist/extension.js",
                "contributes": {
                    "capabilities": [{
                        "id": "pdf.translate"
                    }]
                },
                "permissions": {
                    "readWorkspaceFiles": read_workspace_files,
                    "readReferenceLibrary": read_reference_library
                }
            })
            .to_string(),
            CANONICAL_EXTENSION_MANIFEST_FILENAME,
        )
        .expect("manifest parse")
        .manifest
    }

    #[test]
    fn pdf_permission_allows_workspace_pdf_when_workspace_read_is_enabled() {
        let workspace_root = std::env::temp_dir().join(format!(
            "scribeflow-extension-workspace-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_root).expect("workspace root");
        let pdf_path = workspace_root.join("paper.pdf");
        fs::write(&pdf_path, b"%PDF-1.4\n").expect("write pdf");

        let manifest = manifest_with_permissions(true, false);
        let resolved = ensure_extension_pdf_path_allowed(
            &workspace_root.to_string_lossy(),
            "",
            &manifest,
            &pdf_path.to_string_lossy(),
        )
        .expect("workspace pdf should be allowed");

        assert_eq!(
            resolved,
            crate::security::canonicalize_for_scope(&pdf_path).expect("canonical")
        );
        fs::remove_dir_all(workspace_root).ok();
    }

    #[test]
    fn pdf_permission_restricts_reference_library_reads_to_reference_assets() {
        let global_root = std::env::temp_dir().join(format!(
            "scribeflow-extension-global-{}",
            uuid::Uuid::new_v4()
        ));
        let reference_pdf_dir = global_root.join("references").join("pdfs");
        fs::create_dir_all(&reference_pdf_dir).expect("reference pdf dir");
        let allowed_pdf = reference_pdf_dir.join("paper.pdf");
        fs::write(&allowed_pdf, b"%PDF-1.4\n").expect("write allowed pdf");

        let outside_pdf = global_root.join("other.pdf");
        fs::write(&outside_pdf, b"%PDF-1.4\n").expect("write outside pdf");

        let manifest = manifest_with_permissions(false, true);
        ensure_extension_pdf_path_allowed(
            "",
            &global_root.to_string_lossy(),
            &manifest,
            &allowed_pdf.to_string_lossy(),
        )
        .expect("reference asset pdf should be allowed");

        let error = ensure_extension_pdf_path_allowed(
            "",
            &global_root.to_string_lossy(),
            &manifest,
            &outside_pdf.to_string_lossy(),
        )
        .expect_err("non-reference pdf should be rejected");
        assert!(error.contains("is not allowed to inspect PDF path"));

        fs::remove_dir_all(global_root).ok();
    }
}
