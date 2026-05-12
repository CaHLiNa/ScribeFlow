use crate::content_fingerprint::sha256_hex;
use crate::path_utils::{dirname_path, normalize_path};
use serde_json::Value;

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn string_payload_field(params: &Value, key: &str) -> String {
    payload_field(params, key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn workspace_paths_hash_value_from_payload(params: Value) -> String {
    string_payload_field(&params, "value")
}

fn workspace_paths_data_dir_params_from_payload(params: Value) -> (String, String) {
    (
        string_payload_field(&params, "globalConfigDir"),
        string_payload_field(&params, "workspaceId"),
    )
}

fn workspace_paths_claude_config_dir_from_payload(params: Value) -> String {
    string_payload_field(&params, "globalConfigDir")
}

fn workspace_paths_skill_path_params_from_payload(params: Value) -> (String, String) {
    (
        string_payload_field(&params, "projectDir"),
        string_payload_field(&params, "rawPath"),
    )
}

fn workspace_paths_normalize_value_from_payload(params: Value) -> String {
    string_payload_field(&params, "value")
}

#[tauri::command]
pub async fn workspace_paths_hash(params: Value) -> Result<String, String> {
    let value = workspace_paths_hash_value_from_payload(params);
    Ok(sha256_hex(&value))
}

#[tauri::command]
pub async fn workspace_paths_resolve_data_dir(params: Value) -> Result<String, String> {
    let (global_config_dir, workspace_id) = workspace_paths_data_dir_params_from_payload(params);
    if global_config_dir.is_empty() || workspace_id.is_empty() {
        return Ok(String::new());
    }
    Ok(format!("{}/workspaces/{}", global_config_dir, workspace_id))
}

#[tauri::command]
pub async fn workspace_paths_resolve_claude_config_dir(params: Value) -> Result<String, String> {
    let global_config_dir = workspace_paths_claude_config_dir_from_payload(params);
    let normalized = normalize_path(&global_config_dir)
        .trim_end_matches('/')
        .to_string();
    if normalized.is_empty() {
        return Ok(String::new());
    }
    let parent = dirname_path(&normalized);
    if parent.is_empty() || parent == "." {
        return Ok(String::new());
    }
    Ok(format!("{}/.claude", parent))
}

#[tauri::command]
pub async fn workspace_paths_resolve_skill_path(params: Value) -> Result<String, String> {
    let (project_dir, raw_path) = workspace_paths_skill_path_params_from_payload(params);
    let value = raw_path.trim().to_string();
    if project_dir.is_empty() || value.is_empty() {
        return Ok(value);
    }
    if value.starts_with('/') {
        return Ok(value);
    }
    if let Some(rest) = value.strip_prefix(".project/") {
        return Ok(format!("{}/{}", project_dir, rest));
    }
    let cleaned = value.strip_prefix("./").unwrap_or(&value);
    Ok(format!("{}/{}", project_dir, cleaned))
}

#[tauri::command]
pub async fn workspace_paths_normalize_value(params: Value) -> Result<String, String> {
    let value = workspace_paths_normalize_value_from_payload(params);
    let normalized = normalize_path(&value).trim_end_matches('/').to_string();
    if normalized.is_empty() {
        return Ok("/".to_string());
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        workspace_paths_claude_config_dir_from_payload,
        workspace_paths_data_dir_params_from_payload, workspace_paths_hash_value_from_payload,
        workspace_paths_normalize_value_from_payload,
        workspace_paths_skill_path_params_from_payload,
    };
    use serde_json::json;

    #[test]
    fn workspace_paths_params_normalize_raw_payloads() {
        assert_eq!(
            workspace_paths_hash_value_from_payload(json!({
                "value": "  /tmp/workspace  "
            })),
            "  /tmp/workspace  "
        );

        let (global_config_dir, workspace_id) =
            workspace_paths_data_dir_params_from_payload(json!({
                "globalConfigDir": " /tmp/config ",
                "workspaceId": 42
            }));
        assert_eq!(global_config_dir, " /tmp/config ");
        assert_eq!(workspace_id, "");

        assert_eq!(
            workspace_paths_claude_config_dir_from_payload(json!({
                "globalConfigDir": " /tmp/config/scribeflow "
            })),
            " /tmp/config/scribeflow "
        );

        let (project_dir, raw_path) = workspace_paths_skill_path_params_from_payload(json!({
            "projectDir": false,
            "rawPath": " .project/skills/demo "
        }));
        assert_eq!(project_dir, "");
        assert_eq!(raw_path, " .project/skills/demo ");

        assert_eq!(
            workspace_paths_normalize_value_from_payload(json!({
                "value": " /tmp/demo/// "
            })),
            " /tmp/demo/// "
        );

        let (missing_project_dir, missing_raw_path) =
            workspace_paths_skill_path_params_from_payload(json!(null));
        assert_eq!(missing_project_dir, "");
        assert_eq!(missing_raw_path, "");
    }
}
