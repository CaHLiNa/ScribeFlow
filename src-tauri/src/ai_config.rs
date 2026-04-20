use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

use crate::app_dirs;

const AI_CONFIG_VERSION: i64 = 9;

fn normalize_codex_cli_config(value: &Value) -> Value {
    let command_path = value
        .get("commandPath")
        .or_else(|| value.get("command"))
        .and_then(Value::as_str)
        .unwrap_or("codex")
        .trim();
    let sandbox_mode = match value
        .get("sandboxMode")
        .or_else(|| value.get("sandbox"))
        .and_then(Value::as_str)
        .unwrap_or("workspace-write")
        .trim()
    {
        "read-only" => "read-only",
        "danger-full-access" => "danger-full-access",
        _ => "workspace-write",
    };

    json!({
        "commandPath": if command_path.is_empty() { "codex" } else { command_path },
        "model": value.get("model").and_then(Value::as_str).unwrap_or("").trim(),
        "profile": value.get("profile").and_then(Value::as_str).unwrap_or("").trim(),
        "sandboxMode": sandbox_mode,
        "webSearch": value.get("webSearch").and_then(Value::as_bool).unwrap_or(false),
        "useAsciiWorkspaceAlias": value
            .get("useAsciiWorkspaceAlias")
            .and_then(Value::as_bool)
            .unwrap_or(true),
    })
}

fn ai_config_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?.join("ai.json"))
}

fn normalize_research_defaults(value: &Value) -> Value {
    let default_citation_style = value
        .get("defaultCitationStyle")
        .and_then(Value::as_str)
        .unwrap_or("apa")
        .trim();
    let evidence_strategy = match value
        .get("evidenceStrategy")
        .and_then(Value::as_str)
        .unwrap_or("balanced")
        .trim()
    {
        "strict" => "strict",
        "focused" => "focused",
        _ => "balanced",
    };
    let completion_threshold = match value
        .get("taskCompletionThreshold")
        .and_then(Value::as_str)
        .unwrap_or("strict")
        .trim()
    {
        "fast" => "fast",
        "balanced" => "balanced",
        _ => "strict",
    };

    json!({
        "defaultCitationStyle": if default_citation_style.is_empty() {
            "apa"
        } else {
            default_citation_style
        },
        "evidenceStrategy": evidence_strategy,
        "taskCompletionThreshold": completion_threshold,
    })
}

pub(crate) fn normalize_ai_config(raw_config: Option<&Value>) -> Value {
    let raw_config = raw_config.unwrap_or(&Value::Null);

    json!({
        "version": AI_CONFIG_VERSION,
        "runtimeBackend": "codex-acp",
        "codexCli": normalize_codex_cli_config(raw_config.get("codexCli").unwrap_or(&Value::Null)),
        "researchDefaults": normalize_research_defaults(raw_config.get("researchDefaults").unwrap_or(&Value::Null)),
    })
}

fn sanitize_public_ai_config(config: &Value) -> Value {
    let normalized = normalize_ai_config(Some(config));
    json!({
        "version": normalized
            .get("version")
            .cloned()
            .unwrap_or(Value::Number(AI_CONFIG_VERSION.into())),
        "runtimeBackend": Value::String("codex-acp".to_string()),
        "codexCli": normalized
            .get("codexCli")
            .cloned()
            .unwrap_or_else(|| normalize_codex_cli_config(&Value::Null)),
        "researchDefaults": normalized
            .get("researchDefaults")
            .cloned()
            .unwrap_or_else(|| normalize_research_defaults(&Value::Null)),
    })
}

pub(crate) fn read_ai_config_raw() -> Result<Option<Value>, String> {
    let path = ai_config_path()?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Failed to read AI config: {error}")),
    };
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("Failed to parse AI config: {error}"))
}

pub(crate) fn write_ai_config_raw(config: Option<&Value>) -> Result<(), String> {
    let path = ai_config_path()?;
    if config.is_none() {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to delete AI config: {error}"))?;
        }
        return Ok(());
    }
    let content = serde_json::to_string_pretty(config.unwrap())
        .map_err(|error| format!("Failed to serialize AI config: {error}"))?;
    fs::write(&path, content).map_err(|error| format!("Failed to write AI config: {error}"))
}

#[tauri::command]
pub async fn ai_config_load() -> Result<Value, String> {
    let normalized = normalize_ai_config(read_ai_config_raw()?.as_ref());
    Ok(sanitize_public_ai_config(&normalized))
}

#[tauri::command]
pub async fn ai_config_load_internal() -> Result<Value, String> {
    Ok(normalize_ai_config(read_ai_config_raw()?.as_ref()))
}

#[tauri::command]
pub async fn ai_config_save(config: Value) -> Result<Value, String> {
    let sanitized = sanitize_public_ai_config(&config);
    write_ai_config_raw(Some(&sanitized))?;
    Ok(sanitized)
}

#[tauri::command]
pub async fn ai_config_save_internal(config: Value) -> Result<Value, String> {
    let normalized = normalize_ai_config(Some(&config));
    write_ai_config_raw(Some(&normalized))?;
    Ok(normalized)
}
