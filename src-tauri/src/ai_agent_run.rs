use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, State};
use uuid::Uuid;

use crate::ai_agent_execute::{ai_agent_execute, AiAgentExecuteParams};
use crate::ai_agent_prompt::{ai_agent_build_prompt, AiAgentPromptParams};
use crate::ai_agent_session_runtime::{
    ai_agent_session_complete, ai_agent_session_fail, ai_agent_session_finalize,
    ai_agent_session_interrupt, ai_agent_session_start, AiAgentSessionCompleteParams,
    AiAgentSessionFailParams, AiAgentSessionFinalizeParams, AiAgentSessionInterruptParams,
    AiAgentSessionStartParams,
};
use crate::ai_runtime_turn_wait::run_turn_and_wait;
use crate::codex_runtime::{
    protocol::{RuntimeProviderConfig, RuntimeThreadStartParams, RuntimeTurnRunParams},
    storage::persist_runtime_state,
    threads::start_thread,
    CodexRuntimeHandle,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunParams {
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub config: Value,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub user_instruction: String,
    #[serde(default)]
    pub conversation: Vec<Value>,
    #[serde(default)]
    pub altals_skills: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub referenced_files: Vec<Value>,
    #[serde(default)]
    pub requested_tools: Vec<Value>,
    #[serde(default)]
    pub runtime_intent: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunResponse {
    pub skill: Value,
    pub behavior_id: String,
    pub events: Vec<Value>,
    pub transport: String,
    pub content: String,
    pub payload: Value,
    pub artifact: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunStartedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub altals_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub cwd: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunPreparedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub altals_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub user_message_id: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub fallback_title: String,
    #[serde(default)]
    pub cwd: String,
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

fn bool_available(section: &Value) -> bool {
    section
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_bool))
        .unwrap_or(false)
}

fn array_field(value: &Value, keys: &[&str]) -> Vec<Value> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn build_doc_patch_artifact(payload: &Value, context_bundle: &Value) -> Option<Value> {
    let replacement_text = {
        let text = string_field(
            payload,
            &["replacement_text", "revised_paragraph", "paragraph"],
        );
        if text.is_empty() {
            return None;
        }
        text
    };
    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    let document = context_bundle.get("document").unwrap_or(&Value::Null);
    if !bool_available(selection) || !bool_available(document) {
        return None;
    }
    let title = {
        let title = string_field(payload, &["title"]);
        if title.is_empty() {
            "Document patch".to_string()
        } else {
            title
        }
    };

    Some(json!({
        "type": "doc_patch",
        "capabilityToolId": "apply-document-patch",
        "capabilityLabelKey": "Apply to draft",
        "filePath": string_field(document, &["filePath", "file_path"]),
        "from": selection.get("from").cloned().unwrap_or(Value::Null),
        "to": selection.get("to").cloned().unwrap_or(Value::Null),
        "originalText": string_field(selection, &["text"]),
        "replacementText": replacement_text,
        "title": title,
        "rationale": string_field(payload, &["rationale"]),
        "citationSuggestion": string_field(payload, &["citation_suggestion"]),
    }))
}

fn build_note_draft_artifact(payload: &Value, context_bundle: &Value) -> Option<Value> {
    let content = string_field(
        payload,
        &["note_markdown", "content", "summary_markdown", "paragraph"],
    );
    if content.is_empty() {
        return None;
    }
    let title = {
        let title = string_field(payload, &["title"]);
        if title.is_empty() {
            "AI note".to_string()
        } else {
            title
        }
    };
    let slug = {
        let value = slugify(&title);
        if value.is_empty() {
            "ai-note".to_string()
        } else {
            value
        }
    };
    let rationale = string_field(payload, &["rationale", "takeaway"]);
    Some(json!({
        "type": "note_draft",
        "capabilityToolId": "open-note-draft",
        "capabilityLabelKey": "Open as draft",
        "title": title,
        "suggestedName": format!("{slug}.md"),
        "content": content,
        "sourceFilePath": string_field(context_bundle.get("document").unwrap_or(&Value::Null), &["filePath", "file_path"]),
        "rationale": rationale,
    }))
}

fn normalize_artifact(behavior_id: &str, payload: &Value, context_bundle: &Value) -> Option<Value> {
    match behavior_id {
        "revise-with-citations" => build_doc_patch_artifact(payload, context_bundle),
        "draft-related-work" => {
            let selection_available =
                bool_available(context_bundle.get("selection").unwrap_or(&Value::Null));
            if selection_available {
                build_doc_patch_artifact(payload, context_bundle)
                    .or_else(|| build_note_draft_artifact(payload, context_bundle))
            } else {
                build_note_draft_artifact(payload, context_bundle)
            }
        }
        "summarize-selection" => build_note_draft_artifact(payload, context_bundle),
        "find-supporting-references" => None,
        _ => None,
    }
}

fn build_artifact_record(skill_id: &str, artifact: Option<Value>) -> Option<Value> {
    let Some(artifact) = artifact else {
        return None;
    };
    let Some(mut object) = artifact.as_object().cloned() else {
        return None;
    };
    object.insert(
        "id".to_string(),
        Value::String(format!("artifact:{}", Uuid::new_v4().simple())),
    );
    object.insert(
        "skillId".to_string(),
        Value::String(skill_id.trim().to_string()),
    );
    object.insert("status".to_string(), Value::String("pending".to_string()));
    object.insert("createdAt".to_string(), Value::Number(now_ms().into()));
    Some(Value::Object(object))
}

fn should_use_codex_runtime_run(prepared_run: &Value) -> bool {
    if !bool_field(prepared_run, &["ok"]) {
        return false;
    }
    if string_field(prepared_run, &["runtimeIntent"]) != "agent" {
        return false;
    }
    let config = prepared_run.get("config").unwrap_or(&Value::Null);
    if string_field(prepared_run, &["providerId"]) == "anthropic" {
        let sdk = config.get("sdk").unwrap_or(&Value::Null);
        if string_field(sdk, &["runtimeMode", "runtime_mode"]) == "sdk" {
            return false;
        }
    }
    true
}

fn build_runtime_provider_config(provider_id: &str, config: &Value, api_key: &str, system_prompt: &str) -> RuntimeProviderConfig {
    RuntimeProviderConfig {
        provider_id: provider_id.to_string(),
        base_url: config
            .get("baseUrl")
            .or_else(|| config.get("base_url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        api_key: api_key.to_string(),
        model: config
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        system_prompt: system_prompt.to_string(),
        temperature: config.get("temperature").and_then(Value::as_f64).map(|value| value as f32),
        max_tokens: config
            .get("maxTokens")
            .or_else(|| config.get("max_tokens"))
            .and_then(Value::as_u64)
            .map(|value| value as u32),
    }
}

async fn ensure_runtime_thread(
    runtime_handle: &CodexRuntimeHandle,
    session: &Value,
    fallback_title: &str,
    cwd: &str,
) -> Result<String, String> {
    let existing_thread_id = string_field(session, &["runtimeThreadId", "runtime_thread_id"]);
    if !existing_thread_id.is_empty() {
        return Ok(existing_thread_id);
    }

    let mut runtime = runtime_handle.inner.lock().await;
    let thread = start_thread(
        &mut runtime,
        RuntimeThreadStartParams {
            title: {
                let current_title = string_field(session, &["title"]);
                if current_title.is_empty() {
                    fallback_title.trim().to_string()
                } else {
                    current_title
                }
            },
            cwd: if cwd.trim().is_empty() {
                None
            } else {
                Some(cwd.trim().to_string())
            },
        },
    );
    persist_runtime_state(&runtime)?;
    Ok(thread.id)
}

fn response_with_session(
    ok: bool,
    stopped: bool,
    error: String,
    session: Value,
    assistant_message: Option<Value>,
    artifact: Option<Value>,
) -> AiAgentRunStartedSessionResponse {
    AiAgentRunStartedSessionResponse {
        ok,
        stopped,
        error,
        session,
        assistant_message,
        artifact,
    }
}

async fn ai_agent_run(params: AiAgentRunParams) -> Result<AiAgentRunResponse, String> {
    let enabled_tool_ids = params
        .config
        .get("enabledTools")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let prompt = ai_agent_build_prompt(AiAgentPromptParams {
        skill: params.skill.clone(),
        context_bundle: params.context_bundle.clone(),
        user_instruction: params.user_instruction.clone(),
        conversation: params.conversation.clone(),
        altals_skills: params.altals_skills.clone(),
        support_files: Vec::new(),
        attachments: params.attachments.clone(),
        referenced_files: params.referenced_files.clone(),
        requested_tools: params.requested_tools.clone(),
        enabled_tool_ids: enabled_tool_ids.clone(),
        runtime_intent: params.runtime_intent.clone(),
    })
    .await?;

    let executed = ai_agent_execute(AiAgentExecuteParams {
        provider_id: params
            .config
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or("openai")
            .to_string(),
        skill: params.skill.clone(),
        config: params.config.clone(),
        api_key: params.api_key.clone(),
        conversation: params.conversation.clone(),
        user_prompt: prompt.user_prompt.clone(),
        system_prompt: prompt.system_prompt.clone(),
        context_bundle: params.context_bundle.clone(),
        support_files: Vec::new(),
        enabled_tool_ids: prompt.enabled_tool_ids.clone(),
        workspace_path: string_field(
            params
                .context_bundle
                .get("workspace")
                .unwrap_or(&Value::Null),
            &["path"],
        ),
    })
    .await?;

    let artifact = normalize_artifact(
        &prompt.behavior_id,
        &executed.payload,
        &params.context_bundle,
    );

    Ok(AiAgentRunResponse {
        skill: params.skill,
        behavior_id: prompt.behavior_id,
        events: executed.events,
        transport: executed.transport,
        content: executed.content,
        payload: executed.payload,
        artifact,
    })
}

async fn ai_agent_run_started_session<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiAgentRunStartedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run;
    let mut session = params.session;
    let skill = prepared_run.get("skill").cloned().unwrap_or(Value::Null);
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let context_bundle = prepared_run
        .get("contextBundle")
        .cloned()
        .unwrap_or(Value::Null);
    let provider_id = string_field(&prepared_run, &["providerId"]);
    let config = prepared_run.get("config").cloned().unwrap_or(Value::Null);
    let api_key = string_field(&prepared_run, &["apiKey"]);
    let user_instruction = string_field(&prepared_run, &["userInstruction"]);
    let runtime_intent = string_field(&prepared_run, &["runtimeIntent"]);
    let prior_conversation = array_field(&prepared_run, &["priorConversation"]);
    let attachments = array_field(&prepared_run, &["attachments"]);
    let referenced_files = array_field(&prepared_run, &["referencedFiles"]);
    let requested_tools = array_field(&prepared_run, &["requestedTools"]);

    let execution_result: Result<(Value, Option<Value>, Option<Value>), String> = async {
        if should_use_codex_runtime_run(&prepared_run) {
            let runtime_handle = runtime_state.inner().clone();
            let runtime_thread_id = ensure_runtime_thread(
                &runtime_handle,
                &session,
                &string_field(&session, &["title"]),
                &params.cwd,
            )
            .await?;
            session["runtimeThreadId"] = Value::String(runtime_thread_id.clone());
            session["runtimeProviderId"] = Value::String(provider_id.clone());
            session["runtimeTransport"] = Value::String("codex-runtime".to_string());

            let enabled_tool_ids = config
                .get("enabledTools")
                .and_then(Value::as_array)
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let prompt = ai_agent_build_prompt(AiAgentPromptParams {
                skill: skill.clone(),
                context_bundle: context_bundle.clone(),
                user_instruction: user_instruction.clone(),
                conversation: prior_conversation.clone(),
                altals_skills: params.altals_skills.clone(),
                support_files: Vec::new(),
                attachments: attachments.clone(),
                referenced_files: referenced_files.clone(),
                requested_tools: requested_tools.clone(),
                enabled_tool_ids,
                runtime_intent: runtime_intent.clone(),
            })
            .await?;

            let runtime_result = run_turn_and_wait(
                app,
                runtime_handle,
                RuntimeTurnRunParams {
                    thread_id: runtime_thread_id,
                    user_text: prompt.user_prompt,
                    provider: build_runtime_provider_config(
                        &provider_id,
                        &config,
                        &api_key,
                        &prompt.system_prompt,
                    ),
                    workspace_path: string_field(
                        context_bundle.get("workspace").unwrap_or(&Value::Null),
                        &["path"],
                    ),
                    enabled_tool_ids: prompt.enabled_tool_ids,
                },
            )
            .await?;

            session["runtimeTurnId"] = Value::String(runtime_result.turn_id.clone());
            let result = json!({
                "content": runtime_result.content,
                "reasoning": runtime_result.reasoning,
                "payload": Value::Object(Default::default()),
                "transport": runtime_result.transport,
            });

            Ok((result, None, None))
        } else {
            let response = ai_agent_run(AiAgentRunParams {
                skill: skill.clone(),
                context_bundle: context_bundle.clone(),
                config: config.clone(),
                api_key: api_key.clone(),
                user_instruction: user_instruction.clone(),
                conversation: prior_conversation.clone(),
                altals_skills: params.altals_skills.clone(),
                attachments: attachments.clone(),
                referenced_files: referenced_files.clone(),
                requested_tools: requested_tools.clone(),
                runtime_intent: runtime_intent.clone(),
            })
            .await?;

            let result = json!({
                "content": response.content,
                "reasoning": "",
                "payload": response.payload,
                "transport": response.transport,
            });
            Ok((result, response.artifact, Some(response.skill)))
        }
    }
    .await;

    match execution_result {
        Ok((result, raw_artifact, response_skill)) => {
            let artifact = build_artifact_record(
                &string_field(response_skill.as_ref().unwrap_or(&skill), &["id"]),
                raw_artifact,
            );
            let completed = ai_agent_session_complete(AiAgentSessionCompleteParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
                skill: response_skill.unwrap_or(skill),
                result,
                artifact: artifact.clone().unwrap_or(Value::Null),
                provider_state,
                context_bundle,
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
                artifact,
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
                None,
            ))
        }
        Err(error) => {
            let failed = ai_agent_session_fail(AiAgentSessionFailParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
                skill,
                error: error.clone(),
                provider_state,
                context_bundle,
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
                None,
            ))
        }
    }
}

#[tauri::command]
pub async fn ai_agent_run_prepared_session<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiAgentRunPreparedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run.clone();
    let skill = prepared_run.get("skill").cloned().unwrap_or(Value::Null);
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let context_bundle = prepared_run
        .get("contextBundle")
        .cloned()
        .unwrap_or(Value::Null);
    let user_instruction = string_field(&prepared_run, &["userInstruction"]);
    let prompt_draft = string_field(&prepared_run, &["promptDraft"]);
    let effective_permission_mode = string_field(&prepared_run, &["effectivePermissionMode"]);

    let started = ai_agent_session_start(AiAgentSessionStartParams {
        session: params.session,
        skill,
        provider_state,
        context_bundle,
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
        runtime_state,
        AiAgentRunStartedSessionParams {
            session: started.session,
            prepared_run: params.prepared_run,
            altals_skills: params.altals_skills,
            pending_assistant_id: params.pending_assistant_id,
            created_at: params.created_at,
            cwd: params.cwd,
        },
    )
    .await
}
