use crate::content_fingerprint::sha256_hex;
use crate::path_utils::{dirname_path, normalize_path};

#[tauri::command]
pub async fn workspace_paths_hash(value: String) -> Result<String, String> {
    Ok(sha256_hex(&value))
}

#[tauri::command]
pub async fn workspace_paths_resolve_data_dir(
    global_config_dir: String,
    workspace_id: String,
) -> Result<String, String> {
    if global_config_dir.is_empty() || workspace_id.is_empty() {
        return Ok(String::new());
    }
    Ok(format!("{}/workspaces/{}", global_config_dir, workspace_id))
}

#[tauri::command]
pub async fn workspace_paths_resolve_claude_config_dir(
    global_config_dir: String,
) -> Result<String, String> {
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
pub async fn workspace_paths_resolve_skill_path(
    project_dir: String,
    raw_path: String,
) -> Result<String, String> {
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
pub async fn workspace_paths_normalize_value(value: String) -> Result<String, String> {
    let normalized = normalize_path(&value)
        .trim_end_matches('/')
        .to_string();
    if normalized.is_empty() {
        return Ok("/".to_string());
    }
    Ok(normalized)
}
