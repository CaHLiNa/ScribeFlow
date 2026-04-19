use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
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
use crate::ai_skill_support::load_skill_supporting_files;
use crate::codex_runtime::{
    protocol::{RuntimeProviderConfig, RuntimeThreadStartParams, RuntimeTurnRunParams},
    storage::persist_runtime_state,
    threads::start_thread,
    CodexRuntimeHandle,
};
use crate::research_evidence_runtime::{
    ensure_context_bundle_evidence, list_research_evidence_for_task,
};
use crate::research_task_runtime::{
    ensure_research_task_for_thread, sync_research_task_context_for_thread,
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
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub referenced_files: Vec<Value>,
    #[serde(default)]
    pub requested_tools: Vec<Value>,
    #[serde(default)]
    pub requested_tool_mentions: Vec<String>,
    #[serde(default)]
    pub runtime_intent: String,
    #[serde(default)]
    pub invocation: Value,
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
    pub scribeflow_skills: Vec<Value>,
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
    pub scribeflow_skills: Vec<Value>,
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

fn normalize_string_entries(values: Vec<String>) -> Vec<String> {
    let mut entries = values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    entries.sort();
    entries.dedup();
    entries
}

fn infer_research_task_kind(skill: &Value, user_instruction: &str) -> String {
    let skill_haystack = [
        string_field(skill, &["id"]),
        string_field(skill, &["slug"]),
        string_field(skill, &["name"]),
        user_instruction.trim().to_lowercase(),
    ]
    .join(" ")
    .to_lowercase();

    if skill_haystack.contains("citation") || skill_haystack.contains("reference") {
        return "revise-with-citations".to_string();
    }
    if skill_haystack.contains("related-work") || skill_haystack.contains("related work") {
        return "draft-related-work".to_string();
    }
    if skill_haystack.contains("summary") || skill_haystack.contains("summarize") {
        return "summarize-paper".to_string();
    }
    "general-research".to_string()
}

fn hydrate_research_context_for_session(
    mut session: Value,
    skill: &Value,
    context_bundle: &Value,
    user_instruction: &str,
) -> Result<Value, String> {
    let workspace_path = string_field(
        context_bundle.get("workspace").unwrap_or(&Value::Null),
        &["path"],
    );
    let runtime_thread_id = string_field(&session, &["runtimeThreadId"]);
    if workspace_path.is_empty() || runtime_thread_id.is_empty() {
        return Ok(session);
    }

    let task_title = {
        let current = string_field(&session, &["title"]);
        if current.is_empty() {
            let instruction = user_instruction.trim();
            if instruction.is_empty() {
                "研究任务".to_string()
            } else {
                truncate_text(instruction, 64)
            }
        } else {
            current
        }
    };
    let task_goal = if user_instruction.trim().is_empty() {
        format!("完成研究任务：{}", task_title)
    } else {
        user_instruction.trim().to_string()
    };
    let task_kind = infer_research_task_kind(skill, user_instruction);
    let active_document_paths = {
        let document = context_bundle.get("document").unwrap_or(&Value::Null);
        let path = string_field(document, &["filePath", "file_path"]);
        normalize_string_entries(if path.is_empty() {
            Vec::new()
        } else {
            vec![path]
        })
    };

    let task = ensure_research_task_for_thread(
        &workspace_path,
        &runtime_thread_id,
        &task_title,
        &task_goal,
        &task_kind,
        active_document_paths.clone(),
    )?;
    let evidence = ensure_context_bundle_evidence(&workspace_path, &task.id, context_bundle)?;
    let evidence_ids = evidence
        .iter()
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    let reference_ids = normalize_string_entries(
        evidence
            .iter()
            .filter_map(|entry| {
                if entry.reference_id.is_empty() {
                    None
                } else {
                    Some(entry.reference_id.clone())
                }
            })
            .collect(),
    );
    let task = sync_research_task_context_for_thread(
        &workspace_path,
        &runtime_thread_id,
        evidence_ids,
        active_document_paths,
        reference_ids,
    )?
    .unwrap_or(task);
    let evidence = list_research_evidence_for_task(&workspace_path, &task.id)?;

    session["researchTask"] = serde_json::to_value(task).unwrap_or(Value::Null);
    session["researchEvidence"] = serde_json::to_value(evidence).unwrap_or(Value::Array(vec![]));
    Ok(session)
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

fn should_use_native_runtime_inputs(provider_id: &str, runtime_intent: &str) -> bool {
    if runtime_intent.trim() != "agent" {
        return false;
    }
    let normalized = provider_id.trim().to_lowercase();
    normalized != "anthropic" && normalized != "google"
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let normalized = value.trim();
    if normalized.chars().count() <= max_chars {
        return normalized.to_string();
    }
    format!(
        "{}…",
        normalized
            .chars()
            .take(max_chars)
            .collect::<String>()
            .trim_end()
    )
}

fn build_native_text_input_item(text: String) -> Option<Value> {
    let normalized = text.trim().to_string();
    if normalized.is_empty() {
        return None;
    }
    Some(json!({
        "type": "message",
        "role": "user",
        "content": [{
            "type": "input_text",
            "text": normalized,
        }],
    }))
}

fn build_native_attachment_input_items(attachments: &[Value]) -> Vec<Value> {
    attachments
        .iter()
        .filter_map(|attachment| {
            let name = string_field(attachment, &["name"]);
            let path = string_field(attachment, &["path"]);
            let relative_path = string_field(attachment, &["relativePath", "relative_path"]);
            let display_path = if relative_path.is_empty() {
                path.clone()
            } else {
                relative_path
            };
            let media_type = string_field(attachment, &["mediaType", "media_type"]);

            if media_type.starts_with("image/") && !path.is_empty() {
                match fs::read(&path) {
                    Ok(bytes) => Some(json!({
                        "type": "message",
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": format!(
                                    "Attached image: {}{}",
                                    if name.is_empty() { "image".to_string() } else { name.clone() },
                                    if display_path.is_empty() {
                                        String::new()
                                    } else {
                                        format!(" ({display_path})")
                                    }
                                ),
                            },
                            {
                                "type": "input_image",
                                "image_url": format!(
                                    "data:{};base64,{}",
                                    media_type,
                                    BASE64_STANDARD.encode(bytes)
                                ),
                            }
                        ],
                    })),
                    Err(error) => Some(json!({
                        "type": "message",
                        "role": "user",
                        "content": [{
                            "type": "input_text",
                            "text": format!(
                                "Attached image could not be read: {}{}: {}",
                                if name.is_empty() { "image".to_string() } else { name.clone() },
                                if display_path.is_empty() {
                                    String::new()
                                } else {
                                    format!(" ({display_path})")
                                },
                                error
                            ),
                        }],
                    })),
                }
            } else {
                let read_error = string_field(attachment, &["readError", "read_error"]);
                let content = string_field(attachment, &["content"]);
                if !read_error.is_empty() {
                    return Some(json!({
                        "type": "message",
                        "role": "user",
                        "content": [{
                            "type": "input_text",
                            "text": format!(
                                "Attached file could not be read: {}{}: {}",
                                if name.is_empty() { "file".to_string() } else { name.clone() },
                                if display_path.is_empty() {
                                    String::new()
                                } else {
                                    format!(" ({display_path})")
                                },
                                read_error
                            ),
                        }],
                    }));
                }
                if content.is_empty() {
                    return None;
                }
                Some(json!({
                    "type": "message",
                    "role": "user",
                    "content": [{
                        "type": "input_text",
                        "text": format!(
                            "Attached file: {}{} ({})\n\n{}",
                            if name.is_empty() { "file".to_string() } else { name.clone() },
                            if display_path.is_empty() {
                                String::new()
                            } else {
                                format!(" ({display_path})")
                            },
                            if media_type.is_empty() { "unknown".to_string() } else { media_type },
                            content
                        ),
                    }],
                }))
            }
        })
        .collect()
}

fn build_native_context_bundle_input_items(context_bundle: &Value) -> Vec<Value> {
    let workspace = context_bundle.get("workspace").unwrap_or(&Value::Null);
    let document = context_bundle.get("document").unwrap_or(&Value::Null);
    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    let reference = context_bundle.get("reference").unwrap_or(&Value::Null);

    let selection_text = {
        let preview = string_field(selection, &["preview"]);
        if preview.is_empty() {
            string_field(selection, &["text"])
        } else {
            preview
        }
    };
    let reference_bits = [
        string_field(reference, &["citationKey", "citation_key"]),
        string_field(reference, &["title"]),
    ]
    .into_iter()
    .filter(|entry| !entry.is_empty())
    .collect::<Vec<_>>()
    .join(" · ");

    let context_text = [
        "Runtime context:".to_string(),
        format!("- Workspace: {}", {
            let path = string_field(workspace, &["path"]);
            if path.is_empty() {
                "Unavailable".to_string()
            } else {
                path
            }
        }),
        format!("- Active document: {}", {
            let path = string_field(document, &["filePath", "file_path"]);
            if path.is_empty() {
                "Unavailable".to_string()
            } else {
                path
            }
        }),
        format!(
            "- Selection: {}",
            if selection_text.is_empty() {
                "Unavailable".to_string()
            } else {
                truncate_text(&selection_text, 4000)
            }
        ),
        format!(
            "- Reference: {}",
            if reference_bits.is_empty() {
                "Unavailable".to_string()
            } else {
                reference_bits
            }
        ),
    ]
    .join("\n");

    build_native_text_input_item(context_text)
        .into_iter()
        .collect()
}

fn build_native_referenced_file_input_items(referenced_files: &[Value]) -> Vec<Value> {
    referenced_files
        .iter()
        .filter_map(|file| {
            let path = {
                let relative = string_field(file, &["relativePath", "relative_path"]);
                if relative.is_empty() {
                    string_field(file, &["path"])
                } else {
                    relative
                }
            };
            let content = string_field(file, &["content"]);
            let text = if content.is_empty() {
                format!("Referenced file: {path}\n(content unavailable)")
            } else {
                format!(
                    "Referenced file: {path}\n\n```text\n{}\n```",
                    truncate_text(&content, 5000)
                )
            };
            build_native_text_input_item(text)
        })
        .collect()
}

fn build_native_support_file_input_items(skill: &Value) -> Vec<Value> {
    load_skill_supporting_files(skill)
        .into_iter()
        .filter_map(|file| {
            let relative_path = string_field(&file, &["relativePath", "relative_path"]);
            let content = string_field(&file, &["content"]);
            build_native_text_input_item(format!(
                "Skill support file: {}\n\n```text\n{}\n```",
                if relative_path.is_empty() {
                    "unknown".to_string()
                } else {
                    relative_path
                },
                truncate_text(&content, 5000)
            ))
        })
        .collect()
}

fn build_native_requested_tool_input_items(requested_tools: &[Value]) -> Vec<Value> {
    let items = requested_tools
        .iter()
        .filter_map(|tool| tool.as_str().map(str::trim))
        .filter(|tool| !tool.is_empty())
        .map(|tool| format!("- {tool}"))
        .collect::<Vec<_>>();
    if items.is_empty() {
        return Vec::new();
    }
    build_native_text_input_item(format!("User-mentioned tools:\n{}", items.join("\n")))
        .into_iter()
        .collect()
}

fn build_native_runtime_input_items(
    skill: &Value,
    context_bundle: &Value,
    attachments: &[Value],
    referenced_files: &[Value],
    requested_tools: &[Value],
) -> Vec<Value> {
    let mut items = Vec::new();
    items.extend(build_native_context_bundle_input_items(context_bundle));
    items.extend(build_native_attachment_input_items(attachments));
    items.extend(build_native_referenced_file_input_items(referenced_files));
    items.extend(build_native_support_file_input_items(skill));
    items.extend(build_native_requested_tool_input_items(requested_tools));
    items
}

fn build_runtime_provider_config(
    provider_id: &str,
    config: &Value,
    api_key: &str,
    system_prompt: &str,
) -> RuntimeProviderConfig {
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
        temperature: config
            .get("temperature")
            .and_then(Value::as_f64)
            .map(|value| value as f32),
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
    let workspace_path = string_field(
        params
            .context_bundle
            .get("workspace")
            .unwrap_or(&Value::Null),
        &["path"],
    );
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
    let should_use_native_runtime_items = should_use_native_runtime_inputs(
        params
            .config
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or("openai"),
        &params.runtime_intent,
    );
    let native_runtime_inputs = if should_use_native_runtime_items {
        build_native_runtime_input_items(
            &params.skill,
            &params.context_bundle,
            &params.attachments,
            &params.referenced_files,
            &params.requested_tools,
        )
    } else {
        Vec::new()
    };

    let prompt = ai_agent_build_prompt(AiAgentPromptParams {
        skill: params.skill.clone(),
        context_bundle: params.context_bundle.clone(),
        user_instruction: params.user_instruction.clone(),
        conversation: params.conversation.clone(),
        scribeflow_skills: params.scribeflow_skills.clone(),
        support_files: Vec::new(),
        attachments: if should_use_native_runtime_items {
            Vec::new()
        } else {
            params.attachments.clone()
        },
        referenced_files: if should_use_native_runtime_items {
            Vec::new()
        } else {
            params.referenced_files.clone()
        },
        requested_tools: if should_use_native_runtime_items {
            Vec::new()
        } else {
            params.requested_tools.clone()
        },
        enabled_tool_ids: enabled_tool_ids.clone(),
        runtime_intent: params.runtime_intent.clone(),
        runtime_native_inputs: should_use_native_runtime_items,
        invocation: params.invocation.clone(),
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
        supplemental_user_items: native_runtime_inputs,
        system_prompt: prompt.system_prompt.clone(),
        context_bundle: params.context_bundle.clone(),
        support_files: Vec::new(),
        enabled_tool_ids: prompt.enabled_tool_ids.clone(),
        requested_tool_mentions: params.requested_tool_mentions.clone(),
        workspace_path,
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
    let session = params.session;
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
    let requested_tool_mentions = prepared_run
        .get("requestedToolMentions")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let invocation = prepared_run
        .get("invocation")
        .cloned()
        .unwrap_or(Value::Null);

    let execution_result: Result<(Value, Option<Value>, Option<Value>, Value), String> = async {
        let mut execution_session = session.clone();
        if should_use_codex_runtime_run(&prepared_run) {
            let runtime_handle = runtime_state.inner().clone();
            let runtime_thread_id = ensure_runtime_thread(
                &runtime_handle,
                &execution_session,
                &string_field(&execution_session, &["title"]),
                &params.cwd,
            )
            .await?;
            execution_session["runtimeThreadId"] = Value::String(runtime_thread_id.clone());
            execution_session["runtimeProviderId"] = Value::String(provider_id.clone());
            execution_session["runtimeTransport"] = Value::String("codex-runtime".to_string());
            execution_session = hydrate_research_context_for_session(
                execution_session,
                &skill,
                &context_bundle,
                &user_instruction,
            )?;

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

            let should_use_native_runtime_items =
                should_use_native_runtime_inputs(&provider_id, &runtime_intent);
            let native_runtime_inputs = if should_use_native_runtime_items {
                build_native_runtime_input_items(
                    &skill,
                    &context_bundle,
                    &attachments,
                    &referenced_files,
                    &requested_tools,
                )
            } else {
                Vec::new()
            };
            let prompt = ai_agent_build_prompt(AiAgentPromptParams {
                skill: skill.clone(),
                context_bundle: context_bundle.clone(),
                user_instruction: user_instruction.clone(),
                conversation: prior_conversation.clone(),
                scribeflow_skills: params.scribeflow_skills.clone(),
                support_files: Vec::new(),
                attachments: if should_use_native_runtime_items {
                    Vec::new()
                } else {
                    attachments.clone()
                },
                referenced_files: if should_use_native_runtime_items {
                    Vec::new()
                } else {
                    referenced_files.clone()
                },
                requested_tools: if should_use_native_runtime_items {
                    Vec::new()
                } else {
                    requested_tools.clone()
                },
                enabled_tool_ids,
                runtime_intent: runtime_intent.clone(),
                runtime_native_inputs: should_use_native_runtime_items,
                invocation: invocation.clone(),
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
                    supplemental_user_items: native_runtime_inputs,
                    enabled_tool_ids: prompt.enabled_tool_ids,
                    requested_tool_mentions: requested_tool_mentions.clone(),
                },
            )
            .await?;

            execution_session["runtimeTurnId"] = Value::String(runtime_result.turn_id.clone());
            let result = json!({
                "content": runtime_result.content,
                "reasoning": runtime_result.reasoning,
                "payload": Value::Object(Default::default()),
                "transport": runtime_result.transport,
            });

            Ok((result, None, None, execution_session))
        } else {
            execution_session = hydrate_research_context_for_session(
                execution_session,
                &skill,
                &context_bundle,
                &user_instruction,
            )?;
            let response = ai_agent_run(AiAgentRunParams {
                skill: skill.clone(),
                context_bundle: context_bundle.clone(),
                config: config.clone(),
                api_key: api_key.clone(),
                user_instruction: user_instruction.clone(),
                conversation: prior_conversation.clone(),
                scribeflow_skills: params.scribeflow_skills.clone(),
                attachments: attachments.clone(),
                referenced_files: referenced_files.clone(),
                requested_tools: requested_tools.clone(),
                requested_tool_mentions: requested_tool_mentions.clone(),
                runtime_intent: runtime_intent.clone(),
                invocation: invocation.clone(),
            })
            .await?;

            let result = json!({
                "content": response.content,
                "reasoning": "",
                "payload": response.payload,
                "transport": response.transport,
            });
            Ok((
                result,
                response.artifact,
                Some(response.skill),
                execution_session,
            ))
        }
    }
    .await;

    match execution_result {
        Ok((result, raw_artifact, response_skill, completed_session_input)) => {
            let artifact = build_artifact_record(
                &string_field(response_skill.as_ref().unwrap_or(&skill), &["id"]),
                raw_artifact,
            );
            let completed = ai_agent_session_complete(AiAgentSessionCompleteParams {
                session: completed_session_input,
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
            scribeflow_skills: params.scribeflow_skills,
            pending_assistant_id: params.pending_assistant_id,
            created_at: params.created_at,
            cwd: params.cwd,
        },
    )
    .await
}
