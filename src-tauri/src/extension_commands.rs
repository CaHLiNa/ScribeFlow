use crate::extension_artifacts::ExtensionArtifact;
use crate::extension_capability_contract::{
    manifest_capability_by_id, validate_capability_inputs, validate_capability_outputs,
};
use crate::extension_host::{
    activate_extension, build_extension_invocation_envelope, invoke_extension_host,
    ExtensionHostActivationResult, ExtensionHostRequest, ExtensionHostResponse,
    ExtensionHostResultEntry,
};
use crate::extension_manifest::ExtensionManifest;
use crate::extension_outputs::ExtensionCapabilityOutput;
use crate::extension_permissions::validate_manifest_permissions;
use crate::extension_registry::find_extension_entry;
use crate::extension_tasks::{
    create_command_task, get_task, mark_task_cancelled_with_results, mark_task_failed,
    mark_task_failed_with_results, mark_task_queued, mark_task_running,
    mark_task_running_with_progress, mark_task_succeeded, ExtensionTask, ExtensionTaskTarget,
};
use crate::security::WorkspaceScopeState;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCommandExecuteParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub target: ExtensionTaskTarget,
    #[serde(default)]
    pub settings: Value,
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub item_handle: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCommandExecutionResult {
    pub task: ExtensionTask,
    #[serde(default)]
    pub changed_views: Vec<String>,
    #[serde(default)]
    pub result_entries: Vec<ExtensionHostResultEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionCapabilityInvokeParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub capability_id: String,
    #[serde(default)]
    pub target: ExtensionTaskTarget,
    #[serde(default)]
    pub settings: Value,
    #[serde(default)]
    pub item_id: String,
    #[serde(default)]
    pub item_handle: String,
}

fn command_param_string(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn command_param_object(params: &Value, camel_key: &str, snake_key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}))
}

fn target_string_field(target: &Value, camel_key: &str, snake_key: &str) -> String {
    target
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn command_param_target(params: &Value) -> ExtensionTaskTarget {
    let target = params
        .as_object()
        .and_then(|object| object.get("target"))
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));

    ExtensionTaskTarget {
        kind: target_string_field(&target, "kind", "kind"),
        reference_id: target_string_field(&target, "referenceId", "reference_id"),
        path: target_string_field(&target, "path", "path"),
    }
}

fn extension_command_execute_params_from_payload(params: Value) -> ExtensionCommandExecuteParams {
    ExtensionCommandExecuteParams {
        global_config_dir: command_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: command_param_string(&params, "workspaceRoot", "workspace_root"),
        extension_id: command_param_string(&params, "extensionId", "extension_id"),
        command_id: command_param_string(&params, "commandId", "command_id"),
        target: command_param_target(&params),
        settings: command_param_object(&params, "settings", "settings"),
        item_id: command_param_string(&params, "itemId", "item_id"),
        item_handle: command_param_string(&params, "itemHandle", "item_handle"),
    }
}

fn extension_capability_invoke_params_from_payload(
    params: Value,
) -> ExtensionCapabilityInvokeParams {
    ExtensionCapabilityInvokeParams {
        global_config_dir: command_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: command_param_string(&params, "workspaceRoot", "workspace_root"),
        extension_id: command_param_string(&params, "extensionId", "extension_id"),
        capability_id: command_param_string(&params, "capabilityId", "capability_id"),
        target: command_param_target(&params),
        settings: command_param_object(&params, "settings", "settings"),
        item_id: command_param_string(&params, "itemId", "item_id"),
        item_handle: command_param_string(&params, "itemHandle", "item_handle"),
    }
}

fn extension_dir_from_manifest_path(path: &str) -> String {
    Path::new(path)
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn locale_for_extension_call(global_config_dir: &str) -> String {
    crate::workspace_preferences::read_workspace_preferences(global_config_dir)
        .ok()
        .flatten()
        .map(|preferences| preferences.preferred_locale)
        .map(|preference| crate::i18n_runtime::resolve_effective_locale(&preference))
        .unwrap_or_else(|| crate::i18n_runtime::resolve_effective_locale("system"))
}

fn write_task_log(task: &ExtensionTask, message: &str) {
    let _ = fs::write(&task.log_path, message);
}

fn manifest_declares_command(manifest: &ExtensionManifest, command_id: &str) -> bool {
    let normalized_command_id = command_id.trim();
    if normalized_command_id.is_empty() {
        return false;
    }
    manifest
        .contributes
        .commands
        .iter()
        .any(|command| command.command.trim() == normalized_command_id)
}

fn manifest_declares_capability(manifest: &ExtensionManifest, capability_id: &str) -> bool {
    let normalized_capability_id = capability_id.trim();
    if normalized_capability_id.is_empty() {
        return false;
    }
    manifest
        .contributes
        .capabilities
        .iter()
        .any(|capability| capability.id.trim() == normalized_capability_id)
        || manifest
            .capabilities
            .iter()
            .any(|capability| capability.trim() == normalized_capability_id)
}

fn activation_result_registers_command(
    activation_result: &ExtensionHostActivationResult,
    command_id: &str,
) -> bool {
    let normalized_command_id = command_id.trim();
    if normalized_command_id.is_empty() {
        return false;
    }
    activation_result
        .registered_commands
        .iter()
        .any(|command| command.trim() == normalized_command_id)
        || activation_result
            .registered_command_details
            .iter()
            .any(|command| command.command_id.trim() == normalized_command_id)
}

fn activation_result_registers_capability(
    activation_result: &ExtensionHostActivationResult,
    capability_id: &str,
) -> bool {
    let normalized_capability_id = capability_id.trim();
    if normalized_capability_id.is_empty() {
        return false;
    }
    activation_result
        .registered_capabilities
        .iter()
        .any(|capability| capability.trim() == normalized_capability_id)
}

fn command_is_available_for_execution(
    manifest: &ExtensionManifest,
    activation_result: &ExtensionHostActivationResult,
    command_id: &str,
) -> bool {
    let runtime_declared_any_commands = !activation_result.registered_commands.is_empty()
        || !activation_result.registered_command_details.is_empty();

    if runtime_declared_any_commands {
        activation_result_registers_command(activation_result, command_id)
    } else {
        manifest_declares_command(manifest, command_id)
    }
}

fn capability_is_available_for_execution(
    manifest: &ExtensionManifest,
    activation_result: &ExtensionHostActivationResult,
    capability_id: &str,
) -> bool {
    let runtime_declared_any_capabilities = !activation_result.registered_capabilities.is_empty();

    if runtime_declared_any_capabilities {
        activation_result_registers_capability(activation_result, capability_id)
    } else {
        manifest_declares_capability(manifest, capability_id)
    }
}

fn normalize_artifacts(artifacts: Vec<ExtensionArtifact>) -> Vec<ExtensionArtifact> {
    artifacts
        .into_iter()
        .filter(|artifact| !artifact.path.trim().is_empty())
        .collect()
}

fn normalize_outputs(outputs: Vec<ExtensionCapabilityOutput>) -> Vec<ExtensionCapabilityOutput> {
    outputs
        .into_iter()
        .filter(|output| {
            !output.id.trim().is_empty()
                || !output.output_type.trim().is_empty()
                || !output.media_type.trim().is_empty()
                || !output.text.trim().is_empty()
        })
        .collect()
}

fn normalize_task_state(value: &str) -> &str {
    match value.trim().to_ascii_lowercase().as_str() {
        "queued" => "queued",
        "running" => "running",
        "cancelled" => "cancelled",
        "failed" => "failed",
        _ => "succeeded",
    }
}

fn record_extension_result(
    task: &ExtensionTask,
    capability_contract: Option<&crate::extension_manifest::ExtensionCapabilityContribution>,
    result: crate::extension_host::ExtensionHostCapabilityResult,
    task_runtime_state: &crate::extension_tasks::ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<ExtensionCommandExecutionResult, String> {
    let artifacts = normalize_artifacts(result.artifacts);
    let outputs = normalize_outputs(result.outputs);
    if let Some(contract) = capability_contract {
        validate_capability_outputs(contract, &artifacts, &outputs)
            .map_err(|error| format!("Failed to record extension result: {error}"))?;
    }
    let normalized_state = normalize_task_state(&result.task_state);
    let recorded = match normalized_state {
        "queued" => mark_task_queued(
            &task.id,
            &result.progress_label,
            artifacts.clone(),
            outputs.clone(),
        ),
        "running" => mark_task_running_with_progress(
            &task.id,
            &result.progress_label,
            artifacts.clone(),
            outputs.clone(),
        ),
        "cancelled" => {
            mark_task_cancelled_with_results(&task.id, artifacts, outputs, &result.progress_label)
        }
        "failed" => mark_task_failed_with_results(
            &task.id,
            if result.message.trim().is_empty() {
                "Extension execution failed"
            } else {
                &result.message
            },
            artifacts,
            outputs,
            &result.progress_label,
        ),
        _ => mark_task_succeeded(&task.id, artifacts, outputs, &result.progress_label),
    }
    .map_err(|error| format!("Failed to record extension result: {error}"))?;
    if let Some(pid) = task_runtime_state.unregister_pid(&recorded.id)? {
        let _ = crate::extension_host::reap_spawned_process(extension_host_state, pid, false);
    }
    task_runtime_state.emit_task_changed(&recorded);
    write_task_log(&recorded, &result.message);
    let task = get_task(&task.id)?;
    Ok(ExtensionCommandExecutionResult {
        task,
        changed_views: result.changed_views,
        result_entries: result.result_entries,
    })
}

#[cfg_attr(test, allow(dead_code))]
pub fn record_extension_result_for_probe(
    task: &ExtensionTask,
    result: crate::extension_host::ExtensionHostCapabilityResult,
    task_runtime_state: &crate::extension_tasks::ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<ExtensionCommandExecutionResult, String> {
    record_extension_result(task, None, result, task_runtime_state, extension_host_state)
}

#[tauri::command]
pub async fn extension_command_execute(
    params: Value,
    _scope_state: tauri::State<'_, WorkspaceScopeState>,
    task_runtime_state: tauri::State<'_, crate::extension_tasks::ExtensionTaskRuntimeState>,
    extension_host_state: tauri::State<'_, crate::extension_host::ExtensionHostState>,
) -> Result<ExtensionCommandExecutionResult, String> {
    let params = extension_command_execute_params_from_payload(params);
    let command_id = params.command_id.trim().to_string();
    if command_id.is_empty() {
        return Err("Extension command id is required".to_string());
    }

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
    if entry.status == "invalid" || entry.status == "blocked" {
        return Err(format!("Extension is not runnable: {}", entry.status));
    }
    validate_manifest_permissions(manifest)?;
    if manifest.runtime.runtime_type != "extensionHost" {
        return Err(format!(
            "Only extensionHost runtime is supported: {}",
            manifest.runtime.runtime_type
        ));
    }
    let activation_event = format!("onCommand:{command_id}");
    let task = create_command_task(
        &entry.id,
        &params.workspace_root,
        &command_id,
        params.target.clone(),
        params.settings.clone(),
    )?;
    task_runtime_state.emit_task_changed(&task);
    let running = mark_task_running(&task.id)?;
    task_runtime_state.emit_task_changed(&running);
    let activated = activate_extension(
        extension_host_state.inner(),
        &params.global_config_dir,
        &params.workspace_root,
        &entry,
        &activation_event,
    );
    let activated = match activated {
        Ok(activation_result) => activation_result,
        Err(error) => {
            let failed = mark_task_failed(&task.id, &error)?;
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &error);
            return Err(error);
        }
    };
    if !command_is_available_for_execution(manifest, &activated, &command_id) {
        let message = format!(
            "Extension {} does not register command {} at runtime",
            entry.id, command_id
        );
        let failed = mark_task_failed(&task.id, &message)?;
        task_runtime_state.emit_task_changed(&failed);
        write_task_log(&failed, &message);
        return Err(message);
    }

    let envelope = build_extension_invocation_envelope(
        &task.id,
        &entry.id,
        &params.workspace_root,
        &command_id,
        &params.item_id,
        &params.item_handle,
        &params.target.reference_id,
        "",
        &params.target.kind,
        &params.target.path,
        &params.settings,
        &locale_for_extension_call(&params.global_config_dir),
    );
    let response = invoke_extension_host(
        extension_host_state.inner(),
        Some(task_runtime_state.inner()),
        ExtensionHostRequest::ExecuteCommand {
            activation_event,
            extension_path: extension_dir_from_manifest_path(&entry.path),
            manifest_path: entry.path.clone(),
            main_entry: manifest.main.clone(),
            command_id,
            envelope,
        },
    );

    match response {
        Ok(ExtensionHostResponse::ExecuteCommand(result)) => record_extension_result(
            &task,
            None,
            result,
            task_runtime_state.inner(),
            extension_host_state.inner(),
        ),
        Ok(ExtensionHostResponse::Error { message }) => {
            let failed = mark_task_failed(&task.id, &message)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &message);
            Err(message)
        }
        Ok(_) => {
            let message = "Unexpected extension host response for command execution".to_string();
            let failed = mark_task_failed(&task.id, &message)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &message);
            Err(message)
        }
        Err(error) => {
            let failed = mark_task_failed(&task.id, &error)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &error);
            Err(format!("Extension host command execution failed: {error}"))
        }
    }
}

#[tauri::command]
pub async fn extension_capability_invoke(
    params: Value,
    _scope_state: tauri::State<'_, WorkspaceScopeState>,
    task_runtime_state: tauri::State<'_, crate::extension_tasks::ExtensionTaskRuntimeState>,
    extension_host_state: tauri::State<'_, crate::extension_host::ExtensionHostState>,
) -> Result<ExtensionCommandExecutionResult, String> {
    let params = extension_capability_invoke_params_from_payload(params);
    let capability_id = params.capability_id.trim().to_string();
    if capability_id.is_empty() {
        return Err("Extension capability id is required".to_string());
    }

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
    if entry.status == "invalid" || entry.status == "blocked" {
        return Err(format!("Extension is not runnable: {}", entry.status));
    }
    validate_manifest_permissions(manifest)?;
    if manifest.runtime.runtime_type != "extensionHost" {
        return Err(format!(
            "Only extensionHost runtime is supported: {}",
            manifest.runtime.runtime_type
        ));
    }
    let activation_event = format!("onCapability:{capability_id}");
    let task = create_command_task(
        &entry.id,
        &params.workspace_root,
        &capability_id,
        params.target.clone(),
        params.settings.clone(),
    )?;
    task_runtime_state.emit_task_changed(&task);
    let running = mark_task_running(&task.id)?;
    task_runtime_state.emit_task_changed(&running);
    let activated = activate_extension(
        extension_host_state.inner(),
        &params.global_config_dir,
        &params.workspace_root,
        &entry,
        &activation_event,
    );
    let activated = match activated {
        Ok(activation_result) => activation_result,
        Err(error) => {
            let failed = mark_task_failed(&task.id, &error)?;
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &error);
            return Err(error);
        }
    };
    if !capability_is_available_for_execution(manifest, &activated, &capability_id) {
        let message = format!(
            "Extension {} does not register capability {} at runtime",
            entry.id, capability_id
        );
        let failed = mark_task_failed(&task.id, &message)?;
        task_runtime_state.emit_task_changed(&failed);
        write_task_log(&failed, &message);
        return Err(message);
    }
    let capability_contract = manifest_capability_by_id(manifest, &capability_id);
    if let Some(contract) = capability_contract {
        if let Err(error) = validate_capability_inputs(contract, &params.target) {
            let failed = mark_task_failed(&task.id, &error)?;
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &error);
            return Err(error);
        }
    }

    let envelope = build_extension_invocation_envelope(
        &task.id,
        &entry.id,
        &params.workspace_root,
        "",
        &params.item_id,
        &params.item_handle,
        &params.target.reference_id,
        &capability_id,
        &params.target.kind,
        &params.target.path,
        &params.settings,
        &locale_for_extension_call(&params.global_config_dir),
    );
    let response = invoke_extension_host(
        extension_host_state.inner(),
        Some(task_runtime_state.inner()),
        ExtensionHostRequest::InvokeCapability {
            activation_event,
            extension_path: extension_dir_from_manifest_path(&entry.path),
            manifest_path: entry.path.clone(),
            main_entry: manifest.main.clone(),
            envelope,
        },
    );

    match response {
        Ok(ExtensionHostResponse::InvokeCapability(result)) => record_extension_result(
            &task,
            capability_contract,
            result,
            task_runtime_state.inner(),
            extension_host_state.inner(),
        ),
        Ok(ExtensionHostResponse::Error { message }) => {
            let failed = mark_task_failed(&task.id, &message)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &message);
            Err(message)
        }
        Ok(_) => {
            let message =
                "Unexpected extension host response for capability invocation".to_string();
            let failed = mark_task_failed(&task.id, &message)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &message);
            Err(message)
        }
        Err(error) => {
            let failed = mark_task_failed(&task.id, &error)?;
            if let Some(pid) = task_runtime_state.unregister_pid(&failed.id)? {
                let _ = crate::extension_host::reap_spawned_process(
                    extension_host_state.inner(),
                    pid,
                    false,
                );
            }
            task_runtime_state.emit_task_changed(&failed);
            write_task_log(&failed, &error);
            Err(format!(
                "Extension host capability invocation failed: {error}"
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        activation_result_registers_capability, activation_result_registers_command,
        capability_is_available_for_execution, command_is_available_for_execution,
        extension_capability_invoke_params_from_payload,
        extension_command_execute_params_from_payload, manifest_declares_capability,
        manifest_declares_command, normalize_artifacts,
    };
    use crate::extension_artifacts::ExtensionArtifact;
    use crate::extension_capability_contract::{
        manifest_capability_by_id, validate_capability_inputs, validate_capability_outputs,
    };
    use crate::extension_host::{ExtensionHostActivationResult, ExtensionHostRegisteredCommand};
    use crate::extension_manifest::{
        parse_extension_manifest_str, ExtensionManifest, CANONICAL_EXTENSION_MANIFEST_FILENAME,
    };
    use crate::extension_tasks::ExtensionTaskTarget;

    fn manifest_from_json(value: serde_json::Value) -> ExtensionManifest {
        parse_extension_manifest_str(&value.to_string(), CANONICAL_EXTENSION_MANIFEST_FILENAME)
            .expect("manifest parse")
            .manifest
    }

    fn activation_result_with_commands(commands: &[&str]) -> ExtensionHostActivationResult {
        ExtensionHostActivationResult {
            extension_id: "example-pdf-extension".to_string(),
            activated: true,
            reason: "Activated by host".to_string(),
            registered_commands: commands.iter().map(|command| command.to_string()).collect(),
            registered_capabilities: Vec::new(),
            registered_views: Vec::new(),
            registered_command_details: commands
                .iter()
                .map(|command| ExtensionHostRegisteredCommand {
                    command_id: command.to_string(),
                    title: command.to_string(),
                    category: String::new(),
                    when: String::new(),
                })
                .collect(),
            registered_menu_actions: Vec::new(),
            registered_view_details: Vec::new(),
        }
    }

    #[test]
    fn extension_command_params_normalize_raw_payloads() {
        let params = extension_command_execute_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "extensionId": " example-pdf-extension ",
            "commandId": " scribeflow.pdf.translate ",
            "itemId": 42,
            "itemHandle": " handle-1 ",
            "target": {
                "kind": " workspace ",
                "referenceId": " ref-1 ",
                "path": " /tmp/paper.pdf "
            },
            "settings": {
                "targetLang": "zh"
            }
        }));

        assert_eq!(params.global_config_dir, "/tmp/global-config");
        assert_eq!(params.workspace_root, "/tmp/workspace");
        assert_eq!(params.extension_id, "example-pdf-extension");
        assert_eq!(params.command_id, "scribeflow.pdf.translate");
        assert_eq!(params.item_id, "");
        assert_eq!(params.item_handle, "handle-1");
        assert_eq!(params.target.kind, "workspace");
        assert_eq!(params.target.reference_id, "ref-1");
        assert_eq!(params.target.path, "/tmp/paper.pdf");
        assert_eq!(params.settings["targetLang"], "zh");

        let snake_params = extension_command_execute_params_from_payload(serde_json::json!({
            "global_config_dir": " /tmp/global-snake ",
            "workspace_root": " /tmp/workspace-snake ",
            "extension_id": " example-markdown-extension ",
            "command_id": " document.summarize ",
            "item_id": " item-1 ",
            "item_handle": " handle-2 ",
            "target": {
                "reference_id": " ref-2 "
            },
            "settings": ["not", "an", "object"]
        }));

        assert_eq!(snake_params.global_config_dir, "/tmp/global-snake");
        assert_eq!(snake_params.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_params.extension_id, "example-markdown-extension");
        assert_eq!(snake_params.command_id, "document.summarize");
        assert_eq!(snake_params.item_id, "item-1");
        assert_eq!(snake_params.item_handle, "handle-2");
        assert_eq!(snake_params.target.reference_id, "ref-2");
        assert_eq!(snake_params.settings, serde_json::json!({}));

        let fallback_params = extension_command_execute_params_from_payload(serde_json::json!(42));
        assert_eq!(fallback_params.command_id, "");
        assert_eq!(fallback_params.target, ExtensionTaskTarget::default());
        assert_eq!(fallback_params.settings, serde_json::json!({}));
    }

    #[test]
    fn extension_capability_params_normalize_raw_payloads() {
        let params = extension_capability_invoke_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "extensionId": " example-pdf-extension ",
            "capabilityId": " pdf.translate ",
            "itemId": " item-1 ",
            "itemHandle": null,
            "target": {
                "kind": " workspace ",
                "reference_id": " ref-1 ",
                "path": " /tmp/paper.pdf "
            },
            "settings": {
                "targetLang": "zh"
            }
        }));

        assert_eq!(params.global_config_dir, "/tmp/global-config");
        assert_eq!(params.workspace_root, "/tmp/workspace");
        assert_eq!(params.extension_id, "example-pdf-extension");
        assert_eq!(params.capability_id, "pdf.translate");
        assert_eq!(params.item_id, "item-1");
        assert_eq!(params.item_handle, "");
        assert_eq!(params.target.kind, "workspace");
        assert_eq!(params.target.reference_id, "ref-1");
        assert_eq!(params.target.path, "/tmp/paper.pdf");
        assert_eq!(params.settings["targetLang"], "zh");

        let snake_params = extension_capability_invoke_params_from_payload(serde_json::json!({
            "global_config_dir": " /tmp/global-snake ",
            "workspace_root": " /tmp/workspace-snake ",
            "extension_id": " example-markdown-extension ",
            "capability_id": " document.summarize ",
            "target": "not an object",
            "settings": "not an object"
        }));

        assert_eq!(snake_params.global_config_dir, "/tmp/global-snake");
        assert_eq!(snake_params.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_params.extension_id, "example-markdown-extension");
        assert_eq!(snake_params.capability_id, "document.summarize");
        assert_eq!(snake_params.target, ExtensionTaskTarget::default());
        assert_eq!(snake_params.settings, serde_json::json!({}));
    }

    #[test]
    fn manifest_command_lookup_respects_declared_bootstrap_commands() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "commands": [{
                    "command": "scribeflow.pdf.translate",
                    "title": "Translate"
                }]
            }
        }));
        assert!(manifest_declares_command(
            &manifest,
            "scribeflow.pdf.translate"
        ));
        assert!(!manifest_declares_command(
            &manifest,
            "examplePdfExtension.captureContext"
        ));
    }

    #[test]
    fn runtime_registered_commands_enable_runtime_only_execution() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "commands": [{
                    "command": "scribeflow.pdf.translate",
                    "title": "Translate"
                }]
            }
        }));
        let activation = activation_result_with_commands(&[
            "scribeflow.pdf.translate",
            "examplePdfExtension.captureContext",
        ]);

        assert!(activation_result_registers_command(
            &activation,
            "examplePdfExtension.captureContext"
        ));
        assert!(command_is_available_for_execution(
            &manifest,
            &activation,
            "examplePdfExtension.captureContext"
        ));
    }

    #[test]
    fn runtime_registry_outweighs_stale_manifest_command_lists() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "commands": [{
                    "command": "stale.manifest.command",
                    "title": "Stale"
                }]
            }
        }));
        let activation = activation_result_with_commands(&["scribeflow.pdf.translate"]);

        assert!(!command_is_available_for_execution(
            &manifest,
            &activation,
            "stale.manifest.command"
        ));
        assert!(command_is_available_for_execution(
            &manifest,
            &activation,
            "scribeflow.pdf.translate"
        ));
    }

    #[test]
    fn capability_registry_enables_runtime_capability_execution() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "capabilities": [{
                    "id": "pdf.translate"
                }]
            }
        }));
        let activation = ExtensionHostActivationResult {
            extension_id: "example-pdf-extension".to_string(),
            activated: true,
            reason: "Activated by host".to_string(),
            registered_commands: Vec::new(),
            registered_capabilities: vec!["pdf.translate".to_string()],
            registered_views: Vec::new(),
            registered_command_details: Vec::new(),
            registered_menu_actions: Vec::new(),
            registered_view_details: Vec::new(),
        };

        assert!(manifest_declares_capability(&manifest, "pdf.translate"));
        assert!(activation_result_registers_capability(
            &activation,
            "pdf.translate"
        ));
        assert!(capability_is_available_for_execution(
            &manifest,
            &activation,
            "pdf.translate"
        ));
        assert!(!capability_is_available_for_execution(
            &manifest,
            &activation,
            "document.summarize"
        ));
    }

    #[test]
    fn artifact_normalization_drops_entries_without_paths() {
        let artifacts = normalize_artifacts(vec![
            ExtensionArtifact {
                id: "artifact-1".to_string(),
                extension_id: "example-pdf-extension".to_string(),
                task_id: "task-1".to_string(),
                capability: "scribeflow.pdf.translate".to_string(),
                kind: "pdf".to_string(),
                media_type: "application/pdf".to_string(),
                path: "/tmp/translated.pdf".to_string(),
                source_path: "/tmp/paper.pdf".to_string(),
                source_hash: String::new(),
                created_at: "2026-05-01T00:00:00Z".to_string(),
            },
            ExtensionArtifact {
                id: "artifact-2".to_string(),
                extension_id: "example-pdf-extension".to_string(),
                task_id: "task-1".to_string(),
                capability: "scribeflow.pdf.translate".to_string(),
                kind: "pdf".to_string(),
                media_type: "application/pdf".to_string(),
                path: String::new(),
                source_path: "/tmp/paper.pdf".to_string(),
                source_hash: String::new(),
                created_at: "2026-05-01T00:00:00Z".to_string(),
            },
        ]);

        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].path, "/tmp/translated.pdf");
    }

    #[test]
    fn capability_input_contract_rejects_wrong_target_path() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "capabilities": [{
                    "id": "pdf.translate",
                    "inputs": {
                        "document": {
                            "type": "workspaceFile",
                            "required": true,
                            "extensions": [".pdf"]
                        }
                    }
                }]
            }
        }));
        let capability = manifest_capability_by_id(&manifest, "pdf.translate").expect("capability");
        let error = validate_capability_inputs(
            capability,
            &ExtensionTaskTarget {
                kind: "workspace".to_string(),
                reference_id: String::new(),
                path: "/tmp/note.md".to_string(),
            },
        )
        .expect_err("wrong extension should fail");

        assert!(error.contains("Requires one of: .pdf"));
    }

    #[test]
    fn capability_output_contract_requires_matching_artifact() {
        let manifest = manifest_from_json(serde_json::json!({
            "name": "Example PDF Extension",
            "displayName": "Example PDF Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "capabilities": [{
                    "id": "pdf.translate",
                    "outputs": {
                        "summary": {
                            "type": "artifact",
                            "mediaType": "text/plain",
                            "required": true
                        }
                    }
                }]
            }
        }));
        let capability = manifest_capability_by_id(&manifest, "pdf.translate").expect("capability");
        let error = validate_capability_outputs(capability, &[], &[])
            .expect_err("missing artifact should fail");

        assert!(error.contains("summary"));
        assert!(error.contains("text/plain"));
    }
}
