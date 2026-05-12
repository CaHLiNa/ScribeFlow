use crate::fs_commands;
use crate::fs_io::read_text_file_with_limit;
use crate::process_utils::background_command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

const DEFAULT_ARTIFACT_TEXT_MAX_BYTES: u64 = 4000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionArtifact {
    pub id: String,
    pub extension_id: String,
    pub task_id: String,
    pub capability: String,
    pub kind: String,
    pub media_type: String,
    pub path: String,
    pub source_path: String,
    pub source_hash: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionArtifactActionParams {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionArtifactReadTextParams {
    #[serde(default)]
    pub path: String,
    pub max_bytes: Option<u64>,
}

fn string_field(params: &Value, key: &str) -> String {
    params
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn optional_u64_field(params: &Value, key: &str, fallback_key: &str) -> Option<u64> {
    let Some(value) = params.get(key).or_else(|| params.get(fallback_key)) else {
        return Some(DEFAULT_ARTIFACT_TEXT_MAX_BYTES);
    };

    match value {
        Value::Null => None,
        Value::Number(number) => number.as_u64().or(Some(DEFAULT_ARTIFACT_TEXT_MAX_BYTES)),
        Value::String(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                trimmed
                    .parse::<u64>()
                    .ok()
                    .or(Some(DEFAULT_ARTIFACT_TEXT_MAX_BYTES))
            }
        }
        _ => Some(DEFAULT_ARTIFACT_TEXT_MAX_BYTES),
    }
}

fn action_params_from_payload(params: Value) -> ExtensionArtifactActionParams {
    ExtensionArtifactActionParams {
        path: string_field(&params, "path"),
    }
}

fn read_text_params_from_payload(params: Value) -> ExtensionArtifactReadTextParams {
    ExtensionArtifactReadTextParams {
        path: string_field(&params, "path"),
        max_bytes: optional_u64_field(&params, "maxBytes", "max_bytes"),
    }
}

fn require_artifact_path(path: &str) -> Result<&Path, String> {
    if path.trim().is_empty() {
        return Err("Artifact path is required".to_string());
    }
    Ok(Path::new(path))
}

fn open_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("Artifact path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    let status = background_command("open").arg(path).status();

    #[cfg(target_os = "windows")]
    let status = background_command("cmd")
        .args(["/C", "start", "", &path.to_string_lossy()])
        .status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = background_command("xdg-open").arg(path).status();

    status
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("Open artifact failed: {status}"))
            }
        })
}

#[tauri::command]
pub async fn extension_artifact_open(params: Value) -> Result<(), String> {
    let params = action_params_from_payload(params);
    open_path(require_artifact_path(&params.path)?)
}

#[tauri::command]
pub async fn extension_artifact_reveal(params: Value) -> Result<(), String> {
    let params = action_params_from_payload(params);
    fs_commands::reveal_in_file_manager_blocking(require_artifact_path(&params.path)?)
}

#[tauri::command]
pub async fn extension_artifact_read_text(params: Value) -> Result<String, String> {
    let params = read_text_params_from_payload(params);
    let path = require_artifact_path(&params.path)?;
    if !path.exists() {
        return Err(format!("Artifact path does not exist: {}", path.display()));
    }
    read_text_file_with_limit(path, params.max_bytes)
}

#[cfg(test)]
mod tests {
    use super::{
        action_params_from_payload, extension_artifact_read_text, read_text_params_from_payload,
    };
    use serde_json::json;
    use std::fs;

    #[test]
    fn extension_artifact_params_normalize_raw_payloads() {
        let action_params = action_params_from_payload(json!({
            "path": " /tmp/scribeflow-artifact.txt "
        }));
        assert_eq!(action_params.path, "/tmp/scribeflow-artifact.txt");

        let missing_action_params = action_params_from_payload(json!({
            "path": 42
        }));
        assert_eq!(missing_action_params.path, "");

        let default_read_params = read_text_params_from_payload(json!({
            "path": " /tmp/scribeflow-artifact.txt "
        }));
        assert_eq!(default_read_params.path, "/tmp/scribeflow-artifact.txt");
        assert_eq!(default_read_params.max_bytes, Some(4000));

        let string_limit_params = read_text_params_from_payload(json!({
            "path": " /tmp/scribeflow-artifact.txt ",
            "maxBytes": "64"
        }));
        assert_eq!(string_limit_params.max_bytes, Some(64));

        let null_limit_params = read_text_params_from_payload(json!({
            "path": " /tmp/scribeflow-artifact.txt ",
            "maxBytes": null
        }));
        assert_eq!(null_limit_params.max_bytes, None);

        let snake_case_limit_params = read_text_params_from_payload(json!({
            "path": " /tmp/scribeflow-artifact.txt ",
            "max_bytes": 128
        }));
        assert_eq!(snake_case_limit_params.max_bytes, Some(128));
    }

    #[tokio::test]
    async fn reads_extension_artifact_text_with_limit() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-artifact-read-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        let artifact = root.join("translation.txt");
        fs::write(&artifact, "translated content").expect("artifact write");

        let content = extension_artifact_read_text(json!({
            "path": artifact.to_string_lossy(),
            "maxBytes": 64,
        }))
        .await
        .expect("read artifact text");
        assert_eq!(content, "translated content");

        let error = extension_artifact_read_text(json!({
            "path": artifact.to_string_lossy(),
            "maxBytes": 4,
        }))
        .await
        .expect_err("size limit should fail");
        assert!(error.starts_with("FILE_TOO_LARGE:4:"));

        fs::remove_dir_all(root).ok();
    }

    #[tokio::test]
    async fn rejects_missing_extension_artifact_text_path() {
        let empty_path_error = extension_artifact_read_text(json!({
            "path": "   ",
            "maxBytes": 64,
        }))
        .await
        .expect_err("empty artifact path should fail");
        assert_eq!(empty_path_error, "Artifact path is required");

        let error = extension_artifact_read_text(json!({
            "path": "/tmp/scribeflow-missing-artifact.txt",
            "maxBytes": 64,
        }))
        .await
        .expect_err("missing artifact should fail");
        assert!(error.starts_with("Artifact path does not exist:"));
    }
}
