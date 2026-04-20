use serde::Deserialize;
use serde_json::{json, Value};
use tokio::process::Command;

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(Value::as_str) {
            let normalized = trim(entry);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    String::new()
}

fn normalize_codex_cli_config(config: &Value) -> Value {
    let command_path = string_field(config, &["commandPath", "command"]);
    let resolved_command_path = if command_path.is_empty() {
        "codex".to_string()
    } else {
        command_path
    };
    json!({
        "commandPath": resolved_command_path,
        "model": string_field(config, &["model"]),
    })
}

async fn resolve_command_state(command_path: &str) -> (bool, String, String) {
    let normalized = if command_path.trim().is_empty() {
        "codex"
    } else {
        command_path.trim()
    };
    match Command::new(normalized).arg("--version").output().await {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let version = if stdout.is_empty() {
                stderr.clone()
            } else {
                stdout
            };
            (output.status.success(), version, stderr)
        }
        Err(error) => (false, String::new(), error.to_string()),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliStateResolveParams {
    #[serde(default)]
    pub config: Value,
}

#[tauri::command]
pub async fn codex_cli_state_resolve(params: CodexCliStateResolveParams) -> Result<Value, String> {
    let normalized = normalize_codex_cli_config(&params.config);
    let command_path = string_field(&normalized, &["commandPath"]);
    let (installed, version, error) = resolve_command_state(&command_path).await;
    let model = string_field(&normalized, &["model"]);

    Ok(json!({
        "installed": installed,
        "ready": installed,
        "commandPath": command_path,
        "version": version,
        "error": if installed { String::new() } else { error },
        "model": model,
        "displayModel": if !model.is_empty() { model } else { "Codex defaults".to_string() },
    }))
}
