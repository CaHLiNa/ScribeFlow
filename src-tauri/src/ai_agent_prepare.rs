use serde::Deserialize;
use serde_json::{json, Value};

use crate::ai_config::ai_config_load_internal;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPrepareCurrentConfigParams {
    pub active_session: Value,
    #[serde(default)]
    pub workspace_path: String,
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(Value::as_str) {
            let normalized = entry.trim();
            if !normalized.is_empty() {
                return normalized.to_string();
            }
        }
    }
    String::new()
}

fn build_codex_acp_runtime_state(config: &Value) -> Value {
    json!({
        "providerId": "codex-acp",
        "label": "Codex ACP",
        "ready": true,
        "model": string_field(config, &["model"]),
        "profile": string_field(config, &["profile"]),
        "sandboxMode": string_field(config, &["sandboxMode", "sandbox"]),
        "webSearch": config
            .get("webSearch")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "runtimeBackend": "codex-acp",
    })
}

fn build_minimal_codex_acp_prepared_run(
    session: Value,
    workspace_path: &str,
    provider_config: Value,
    provider_state: Value,
) -> Value {
    let prompt_draft = string_field(&session, &["promptDraft", "prompt_draft"]);

    json!({
        "ok": true,
        "session": session.clone(),
        "sessionMode": "agent",
        "isAgentSession": true,
        "promptDraft": prompt_draft.clone(),
        "userInstruction": prompt_draft,
        "providerState": provider_state,
        "providerId": "codex-acp",
        "config": provider_config,
        "effectivePermissionMode": "accept-edits",
        "runtimeIntent": "agent",
        "attachments": session
            .get("attachments")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())),
        "workspacePath": workspace_path.trim(),
        "runtimeTransport": "codex-acp",
    })
}

#[tauri::command]
pub async fn ai_agent_prepare_current_config(
    params: AiAgentPrepareCurrentConfigParams,
) -> Result<Value, String> {
    let config = ai_config_load_internal().await?;
    let provider_config = config.get("codexCli").cloned().unwrap_or(Value::Null);
    let provider_state = build_codex_acp_runtime_state(&provider_config);

    Ok(build_minimal_codex_acp_prepared_run(
        params.active_session,
        &params.workspace_path,
        provider_config,
        provider_state,
    ))
}
