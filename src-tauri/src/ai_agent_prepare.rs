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

fn build_codex_cli_provider_state(config: &Value) -> Value {
    json!({
        "providerId": "codex-cli",
        "label": "Codex CLI",
        "ready": true,
        "requiresApiKey": false,
        "baseUrl": string_field(config, &["openai_base_url", "openaiBaseUrl", "baseUrl"]),
        "model": string_field(config, &["model"]),
        "runtimeBackend": "codex-cli",
        "enabledToolIds": Value::Array(Vec::new()),
    })
}

fn build_minimal_codex_cli_prepared_run(
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
        "providerId": "codex-cli",
        "config": provider_config,
        "effectivePermissionMode": "accept-edits",
        "enabledToolIds": Value::Array(Vec::new()),
        "contextBundle": Value::Null,
        "turnRoute": Value::Null,
        "resolvedTask": Value::Null,
        "requiredEvidence": Value::Array(Vec::new()),
        "selectedArtifacts": Value::Array(Vec::new()),
        "verificationPlan": Value::Array(Vec::new()),
        "researchContextGraph": Value::Null,
        "researchConfig": Value::Null,
        "runtimeIntent": "agent",
        "invocation": Value::Null,
        "requestedToolMentions": Value::Array(Vec::new()),
        "referencedFiles": Value::Array(Vec::new()),
        "priorConversation": Value::Array(Vec::new()),
        "attachments": session
            .get("attachments")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())),
        "requestedTools": Value::Array(Vec::new()),
        "workspacePath": workspace_path.trim(),
        "rawCodexCli": true,
    })
}

#[tauri::command]
pub async fn ai_agent_prepare_current_config(
    params: AiAgentPrepareCurrentConfigParams,
) -> Result<Value, String> {
    let config = ai_config_load_internal().await?;
    let provider_config = config.get("codexCli").cloned().unwrap_or(Value::Null);
    let provider_state = build_codex_cli_provider_state(&provider_config);

    Ok(build_minimal_codex_cli_prepared_run(
        params.active_session,
        &params.workspace_path,
        provider_config,
        provider_state,
    ))
}
