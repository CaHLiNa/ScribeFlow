use crate::extension_host::{
    build_extension_invocation_envelope, invoke_extension_host, ExtensionHostRequest,
    ExtensionHostResponse, ExtensionHostState, ExtensionHostViewResolveResult,
};
use crate::extension_registry::find_extension_entry;
use crate::security::WorkspaceScopeState;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionViewResolveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub view_id: String,
    #[serde(default)]
    pub parent_item_id: String,
    #[serde(default)]
    pub command_id: String,
    #[serde(default)]
    pub target_kind: String,
    #[serde(default)]
    pub reference_id: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub settings: Value,
}

fn view_param_string(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn view_param_object(params: &Value, camel_key: &str, snake_key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()))
}

fn extension_view_resolve_params_from_payload(params: Value) -> ExtensionViewResolveParams {
    ExtensionViewResolveParams {
        global_config_dir: view_param_string(&params, "globalConfigDir", "global_config_dir"),
        workspace_root: view_param_string(&params, "workspaceRoot", "workspace_root"),
        extension_id: view_param_string(&params, "extensionId", "extension_id"),
        view_id: view_param_string(&params, "viewId", "view_id"),
        parent_item_id: view_param_string(&params, "parentItemId", "parent_item_id"),
        command_id: view_param_string(&params, "commandId", "command_id"),
        target_kind: view_param_string(&params, "targetKind", "target_kind"),
        reference_id: view_param_string(&params, "referenceId", "reference_id"),
        target_path: view_param_string(&params, "targetPath", "target_path"),
        settings: view_param_object(&params, "settings", "settings"),
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

#[tauri::command]
pub async fn extension_view_resolve(
    params: Value,
    _scope_state: tauri::State<'_, WorkspaceScopeState>,
    state: tauri::State<'_, ExtensionHostState>,
) -> Result<ExtensionHostViewResolveResult, String> {
    let params = extension_view_resolve_params_from_payload(params);
    let view_id = params.view_id.trim().to_string();
    if view_id.is_empty() {
        return Err("Extension view id is required".to_string());
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
    let declared = manifest
        .contributes
        .views
        .values()
        .flat_map(|views| views.iter())
        .any(|view| view.id.trim() == view_id);
    if !declared {
        return Err(format!("Extension view is not declared: {view_id}"));
    }

    let activation_event = format!("onView:{view_id}");
    crate::extension_host::activate_extension(
        state.inner(),
        &params.global_config_dir,
        &params.workspace_root,
        &entry,
        &activation_event,
    )?;

    let envelope = build_extension_invocation_envelope(
        "",
        &entry.id,
        &params.workspace_root,
        &params.command_id,
        "",
        "",
        &params.reference_id,
        "",
        &params.target_kind,
        &params.target_path,
        &params.settings,
        &locale_for_extension_call(&params.global_config_dir),
    );
    match invoke_extension_host(
        state.inner(),
        None,
        ExtensionHostRequest::ResolveView {
            activation_event,
            extension_path: extension_dir_from_manifest_path(&entry.path),
            manifest_path: entry.path.clone(),
            main_entry: manifest.main.clone(),
            view_id,
            parent_item_id: params.parent_item_id.trim().to_string(),
            envelope,
        },
    )? {
        ExtensionHostResponse::ResolveView(result) => Ok(result),
        _ => Err("Unexpected extension host response for view resolution".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::extension_view_resolve_params_from_payload;

    #[test]
    fn extension_view_params_normalize_raw_payloads() {
        let params = extension_view_resolve_params_from_payload(serde_json::json!({
            "globalConfigDir": " /tmp/global-config ",
            "workspaceRoot": " /tmp/workspace ",
            "extensionId": " example-pdf-extension ",
            "viewId": " examplePdfExtension.tools ",
            "parentItemId": 42,
            "commandId": " scribeflow.pdf.translate ",
            "targetKind": " pdf ",
            "referenceId": " ref-123 ",
            "targetPath": " /tmp/paper.pdf ",
            "settings": {
                "targetLang": "zh-CN"
            }
        }));

        assert_eq!(params.global_config_dir, "/tmp/global-config");
        assert_eq!(params.workspace_root, "/tmp/workspace");
        assert_eq!(params.extension_id, "example-pdf-extension");
        assert_eq!(params.view_id, "examplePdfExtension.tools");
        assert_eq!(params.parent_item_id, "");
        assert_eq!(params.command_id, "scribeflow.pdf.translate");
        assert_eq!(params.target_kind, "pdf");
        assert_eq!(params.reference_id, "ref-123");
        assert_eq!(params.target_path, "/tmp/paper.pdf");
        assert_eq!(params.settings["targetLang"], "zh-CN");

        let snake_params = extension_view_resolve_params_from_payload(serde_json::json!({
            "global_config_dir": " /tmp/global-snake ",
            "workspace_root": " /tmp/workspace-snake ",
            "extension_id": " example-markdown-extension ",
            "view_id": " exampleMarkdownExtension.notes ",
            "parent_item_id": " parent-1 ",
            "command_id": " document.summarize ",
            "target_kind": " markdown ",
            "reference_id": " ref-snake ",
            "target_path": " /tmp/notes.md ",
            "settings": ["not", "an", "object"]
        }));

        assert_eq!(snake_params.global_config_dir, "/tmp/global-snake");
        assert_eq!(snake_params.workspace_root, "/tmp/workspace-snake");
        assert_eq!(snake_params.extension_id, "example-markdown-extension");
        assert_eq!(snake_params.view_id, "exampleMarkdownExtension.notes");
        assert_eq!(snake_params.parent_item_id, "parent-1");
        assert_eq!(snake_params.command_id, "document.summarize");
        assert_eq!(snake_params.target_kind, "markdown");
        assert_eq!(snake_params.reference_id, "ref-snake");
        assert_eq!(snake_params.target_path, "/tmp/notes.md");
        assert_eq!(snake_params.settings, serde_json::json!({}));

        let fallback_params = extension_view_resolve_params_from_payload(serde_json::json!(false));
        assert_eq!(fallback_params.view_id, "");
        assert_eq!(fallback_params.settings, serde_json::json!({}));
    }
}
