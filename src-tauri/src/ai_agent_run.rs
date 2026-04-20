use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use crate::ai_agent_session_runtime::{
    ai_agent_session_complete, ai_agent_session_fail, ai_agent_session_finalize,
    ai_agent_session_interrupt, ai_agent_session_start, AiAgentSessionCompleteParams,
    AiAgentSessionFailParams, AiAgentSessionFinalizeParams, AiAgentSessionInterruptParams,
    AiAgentSessionStartParams,
};
use crate::codex_cli::{codex_cli_run, CodexCliRunParams};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunStartedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunPreparedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub user_message_id: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunStartedSessionResponse {
    pub ok: bool,
    pub stopped: bool,
    pub error: String,
    pub session: Value,
    pub assistant_message: Option<Value>,
    pub artifact: Option<Value>,
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(|entry| entry.as_str()) {
            let normalized = entry.trim();
            if !normalized.is_empty() {
                return normalized.to_string();
            }
        }
    }
    String::new()
}

fn response_with_session(
    ok: bool,
    stopped: bool,
    error: String,
    session: Value,
    assistant_message: Option<Value>,
) -> AiAgentRunStartedSessionResponse {
    AiAgentRunStartedSessionResponse {
        ok,
        stopped,
        error,
        session,
        assistant_message,
        artifact: None,
    }
}

fn codex_cli_session_id(session: &Value) -> String {
    let session_id = string_field(session, &["id"]);
    if !session_id.is_empty() {
        return session_id;
    }
    format!("codex-cli:{}", Uuid::new_v4())
}

async fn ai_agent_run_started_session<R: Runtime>(
    _app: AppHandle<R>,
    params: AiAgentRunStartedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run;
    let session = params.session;
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let config = prepared_run.get("config").cloned().unwrap_or(Value::Null);
    let prompt = {
        let user_instruction = string_field(&prepared_run, &["userInstruction"]);
        if user_instruction.is_empty() {
            string_field(&prepared_run, &["promptDraft"])
        } else {
            user_instruction
        }
    };
    let cwd = string_field(&prepared_run, &["workspacePath"]);

    let execution_result: Result<(Value, Value), String> = async {
        let mut execution_session = session.clone();
        let codex_result = codex_cli_run(CodexCliRunParams {
            session_id: codex_cli_session_id(&execution_session),
            prompt,
            cwd,
            config,
        })
        .await?;

        let runtime_thread_id = string_field(&codex_result, &["threadId", "thread_id"]);
        if !runtime_thread_id.is_empty() {
            execution_session["runtimeThreadId"] = Value::String(runtime_thread_id);
        }
        execution_session["runtimeProviderId"] = Value::String("codex-cli".to_string());
        execution_session["runtimeTransport"] = Value::String("codex-cli".to_string());

        let result = json!({
            "content": string_field(&codex_result, &["content"]),
            "reasoning": "",
            "payload": {
                "events": codex_result.get("events").cloned().unwrap_or(Value::Array(vec![])),
                "stderrPreview": codex_result.get("stderrPreview").cloned().unwrap_or(Value::String(String::new())),
            },
            "transport": "codex-cli",
        });

        Ok((result, execution_session))
    }
    .await;

    match execution_result {
        Ok((result, completed_session_input)) => {
            let completed = ai_agent_session_complete(AiAgentSessionCompleteParams {
                session: completed_session_input,
                pending_assistant_id: params.pending_assistant_id,
                skill: Value::Null,
                result,
                artifact: Value::Null,
                provider_state,
                context_bundle: Value::Null,
                created_at: params.created_at,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: completed.session,
            })
            .await?;

            Ok(response_with_session(
                true,
                false,
                String::new(),
                finalized.session,
                completed.assistant_message,
            ))
        }
        Err(error) if error.trim() == "AI execution stopped." => {
            let interrupted = ai_agent_session_interrupt(AiAgentSessionInterruptParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: interrupted.session,
            })
            .await?;
            Ok(response_with_session(
                false,
                true,
                error,
                finalized.session,
                None,
            ))
        }
        Err(error) => {
            let failed = ai_agent_session_fail(AiAgentSessionFailParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
                skill: Value::Null,
                error: error.clone(),
                provider_state,
                context_bundle: Value::Null,
                events: Vec::new(),
                created_at: params.created_at,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: failed.session,
            })
            .await?;
            Ok(response_with_session(
                false,
                false,
                error,
                finalized.session,
                None,
            ))
        }
    }
}

#[tauri::command]
pub async fn ai_agent_run_prepared_session<R: Runtime>(
    app: AppHandle<R>,
    params: AiAgentRunPreparedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run.clone();
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let user_instruction = string_field(&prepared_run, &["userInstruction"]);
    let prompt_draft = string_field(&prepared_run, &["promptDraft"]);
    let effective_permission_mode = string_field(&prepared_run, &["effectivePermissionMode"]);
    let started = ai_agent_session_start(AiAgentSessionStartParams {
        session: params.session,
        prepared_run: prepared_run.clone(),
        skill: Value::Null,
        provider_state,
        context_bundle: Value::Null,
        user_instruction,
        prompt_draft,
        effective_permission_mode,
        pending_assistant_id: params.pending_assistant_id.clone(),
        user_message_id: params.user_message_id,
        created_at: params.created_at,
        fallback_title: params.fallback_title,
    })
    .await?;

    ai_agent_run_started_session(
        app,
        AiAgentRunStartedSessionParams {
            session: started.session,
            prepared_run: params.prepared_run,
            scribeflow_skills: params.scribeflow_skills,
            pending_assistant_id: params.pending_assistant_id,
            created_at: params.created_at,
        },
    )
    .await
}
