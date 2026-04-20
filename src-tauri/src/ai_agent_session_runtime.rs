use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(|entry| entry.as_str()) {
            let normalized = trim(entry);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    String::new()
}

fn bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|entry| entry.as_bool()))
        .unwrap_or(false)
}

fn array_entries(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn preview_text(value: &str, max_chars: usize) -> String {
    let normalized = trim(value);
    if normalized.is_empty() || normalized.chars().count() <= max_chars {
        return normalized;
    }
    normalized
        .chars()
        .take(max_chars)
        .collect::<String>()
        .trim_end()
        .to_string()
        + "…"
}

fn skill_label(skill: &Value) -> String {
    if string_field(skill, &["kind"]) == "codex-skill" {
        let label = string_field(skill, &["name", "slug"]);
        if !label.is_empty() {
            return label;
        }
        return "Unnamed skill".to_string();
    }
    let label = string_field(skill, &["titleKey", "id"]);
    if !label.is_empty() {
        return label;
    }
    "Agent".to_string()
}

fn runtime_transport_label(transport: &str) -> String {
    let normalized = trim(transport).to_lowercase();
    if normalized.is_empty() {
        return String::new();
    }
    if normalized == "anthropic-sdk" {
        return "SDK".to_string();
    }
    if normalized == "http" {
        return "HTTP".to_string();
    }
    normalized.replace('-', " ").to_uppercase()
}

fn provider_summary(provider_state: &Value, transport: &str) -> String {
    let label = string_field(provider_state, &["currentProviderLabel"]);
    let model = string_field(provider_state, &["model"]);
    let transport_label = runtime_transport_label(transport);
    [label, model, transport_label]
        .into_iter()
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

fn active_turn_route(prepared_run: &Value) -> Value {
    prepared_run
        .get("turnRoute")
        .cloned()
        .unwrap_or(Value::Null)
}

fn active_turn_label(route: &Value) -> String {
    let label = string_field(route, &["label"]);
    if !label.is_empty() {
        return label;
    }
    "Agent turn".to_string()
}

fn active_turn_summary(route: &Value) -> String {
    string_field(route, &["summary"])
}

fn build_active_turn_from_prepared_run(
    prepared_run: &Value,
    pending_assistant_id: &str,
    created_at: i64,
) -> Value {
    let route = active_turn_route(prepared_run);
    json!({
        "id": string_field(prepared_run, &["turnId"]),
        "threadId": string_field(prepared_run, &["runtimeThreadId"]),
        "runtimeTurnId": string_field(prepared_run, &["turnId"]),
        "status": "starting",
        "phase": "dispatch",
        "label": active_turn_label(&route),
        "summary": active_turn_summary(&route),
        "userInstruction": string_field(prepared_run, &["userInstruction", "promptDraft"]),
        "pendingAssistantId": trim(pending_assistant_id),
        "pendingRequestKind": "",
        "pendingRequestId": "",
        "pendingRequestCount": 0,
        "lastToolName": "",
        "transport": string_field(prepared_run, &["runtimeTransport"]),
        "route": route,
        "startedAt": created_at,
        "updatedAt": created_at,
    })
}

fn with_cleared_active_turn(mut session: Value) -> Value {
    session["activeTurn"] = Value::Null;
    session
}

fn build_context_chips(context_bundle: &Value) -> Vec<Value> {
    let mut chips = Vec::new();

    if bool_field(
        context_bundle.get("workspace").unwrap_or(&Value::Null),
        &["available"],
    ) {
        let workspace = context_bundle.get("workspace").unwrap_or(&Value::Null);
        let value = {
            let label = string_field(workspace, &["label", "path"]);
            if label.is_empty() {
                string_field(workspace, &["path"])
            } else {
                label
            }
        };
        if !value.is_empty() {
            chips.push(json!({
                "kind": "workspace",
                "label": "Folder",
                "value": value,
            }));
        }
    }

    if bool_field(
        context_bundle.get("document").unwrap_or(&Value::Null),
        &["available"],
    ) {
        let document = context_bundle.get("document").unwrap_or(&Value::Null);
        let value = {
            let label = string_field(document, &["label", "filePath"]);
            if label.is_empty() {
                string_field(document, &["filePath"])
            } else {
                label
            }
        };
        if !value.is_empty() {
            chips.push(json!({
                "kind": "document",
                "label": "Document",
                "value": value,
            }));
        }
    }

    if bool_field(
        context_bundle.get("selection").unwrap_or(&Value::Null),
        &["available"],
    ) {
        let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
        let value = {
            let preview = string_field(selection, &["preview", "text"]);
            if preview.is_empty() {
                string_field(selection, &["text"])
            } else {
                preview
            }
        };
        if !value.is_empty() {
            chips.push(json!({
                "kind": "selection",
                "label": "Selection",
                "value": value,
            }));
        }
    }

    if bool_field(
        context_bundle.get("reference").unwrap_or(&Value::Null),
        &["available"],
    ) {
        let reference = context_bundle.get("reference").unwrap_or(&Value::Null);
        let citation_key = string_field(reference, &["citationKey"]);
        let title = string_field(reference, &["title"]);
        let value = if !citation_key.is_empty() {
            if title.is_empty() {
                citation_key
            } else {
                format!("{citation_key} · {title}")
            }
        } else {
            title
        };
        if !value.is_empty() {
            chips.push(json!({
                "kind": "reference",
                "label": "Reference",
                "value": value,
            }));
        }
    }

    chips
}

fn normalize_tool_event(event: &Value) -> Option<Value> {
    let tool_id = string_field(event, &["toolId", "id"]);
    if tool_id.is_empty() {
        return None;
    }
    let status = {
        let status = string_field(event, &["status"]);
        if status.is_empty() {
            "done".to_string()
        } else {
            status
        }
    };
    let label = {
        let label = string_field(event, &["label"]);
        if label.is_empty() {
            string_field(event, &["toolId", "id"])
        } else {
            label
        }
    };

    Some(json!({
        "type": "tool",
        "toolId": tool_id,
        "status": status,
        "label": label,
        "context": string_field(event, &["context"]),
        "detail": string_field(event, &["detail"]),
        "payload": event.get("payload").cloned().unwrap_or(Value::Null),
    }))
}

fn artifact_preview(artifact: &Value) -> String {
    match string_field(artifact, &["type"]).as_str() {
        "doc_patch" => preview_text(&string_field(artifact, &["replacementText"]), 180),
        "note_draft"
        | "related_work_outline"
        | "reading_note_bundle"
        | "claim_evidence_map"
        | "compile_fix"
        | "comparison_table" => preview_text(&string_field(artifact, &["content"]), 180),
        "citation_insert" => preview_text(
            &[
                string_field(artifact, &["citationKey"]),
                string_field(artifact, &["citationSuggestion"]),
                string_field(artifact, &["rationale"]),
            ]
            .into_iter()
            .filter(|entry| !entry.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
            180,
        ),
        "reference_patch" => preview_text(
            &artifact
                .get("updates")
                .and_then(Value::as_object)
                .map(|entries| {
                    entries
                        .iter()
                        .map(|(key, value)| {
                            format!("{key}: {}", value.as_str().unwrap_or_default())
                        })
                        .collect::<Vec<_>>()
                        .join(" · ")
                })
                .unwrap_or_default(),
            180,
        ),
        "evidence_bundle" => preview_text(
            &[
                string_field(artifact, &["content"]),
                string_field(artifact, &["selectionPreview"]),
                string_field(artifact, &["rationale"]),
            ]
            .into_iter()
            .filter(|entry| !entry.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
            180,
        ),
        _ => preview_text(
            &{
                let content = string_field(artifact, &["content", "rationale"]);
                content
            },
            180,
        ),
    }
}

fn build_user_message(
    id: &str,
    skill: &Value,
    user_instruction: &str,
    context_bundle: &Value,
    created_at: i64,
) -> Value {
    let text = {
        let instruction = trim(user_instruction);
        if instruction.is_empty() {
            skill_label(skill)
        } else {
            instruction
        }
    };

    json!({
        "id": id,
        "role": "user",
        "createdAt": created_at,
        "content": text,
        "parts": [
            {
                "type": "text",
                "text": text,
            }
        ],
        "metadata": {
            "skillId": string_field(skill, &["id"]),
            "skillLabel": skill_label(skill),
            "contextChips": build_context_chips(context_bundle),
        }
    })
}

fn build_pending_assistant_message(
    id: &str,
    skill: &Value,
    provider_state: &Value,
    context_bundle: &Value,
    created_at: i64,
) -> Value {
    json!({
        "id": id,
        "role": "assistant",
        "createdAt": created_at,
        "content": "",
        "parts": [],
        "metadata": {
            "skillId": string_field(skill, &["id"]),
            "skillLabel": skill_label(skill),
            "providerSummary": provider_summary(provider_state, ""),
            "contextChips": build_context_chips(context_bundle),
        }
    })
}

fn strip_internal_prompt_echo(text: &str) -> String {
    let normalized = trim(text);
    if normalized.is_empty() {
        return String::new();
    }
    let markers = [
        "Research defaults:",
        "Turn route:",
        "Resolved research task:",
        "Required evidence:",
        "Preferred artifacts:",
        "Verification plan:",
        "Research context graph:",
        "Workspace context:",
        "## Skills",
        "Selection precedence:",
    ];
    if markers
        .iter()
        .filter(|marker| normalized.contains(**marker))
        .count()
        < 3
    {
        return normalized;
    }

    let filtered = normalized
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
                && !trimmed.starts_with("Current task:")
                && !trimmed.starts_with("Research defaults:")
                && !trimmed.starts_with("- Citation style:")
                && !trimmed.starts_with("- Evidence strategy:")
                && !trimmed.starts_with("- Completion threshold:")
                && !trimmed.starts_with("Turn route:")
                && !trimmed.starts_with("- Label:")
                && !trimmed.starts_with("- Runtime intent:")
                && !trimmed.starts_with("- Summary:")
                && !trimmed.starts_with("- Capability plan:")
                && !trimmed.starts_with("- Allowed tools:")
                && !trimmed.starts_with("- Approval preflight:")
                && !trimmed.starts_with("Resolved research task:")
                && !trimmed.starts_with("Required evidence:")
                && !trimmed.starts_with("Preferred artifacts:")
                && !trimmed.starts_with("Verification plan:")
                && !trimmed.starts_with("Research context graph:")
                && !trimmed.starts_with("- Nodes:")
                && !trimmed.starts_with("- Edges:")
                && !trimmed.starts_with("Workspace context:")
                && !trimmed.starts_with("## Skills")
                && !trimmed.starts_with("### Available skills")
                && !trimmed.starts_with("Selection precedence:")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if filtered.is_empty() {
        normalized
    } else {
        filtered
    }
}

fn build_assistant_message(
    id: &str,
    skill: &Value,
    result: &Value,
    artifact: &Value,
    provider_state: &Value,
    context_bundle: &Value,
    created_at: i64,
) -> Value {
    let payload = result.get("payload").cloned().unwrap_or(Value::Null);
    let artifact_type = string_field(artifact, &["type"]);
    let main_text = if artifact_type == "doc_patch" {
        string_field(artifact, &["replacementText"])
    } else if artifact_type == "citation_insert" {
        let suggestion = string_field(artifact, &["citationSuggestion"]);
        if suggestion.is_empty() {
            string_field(artifact, &["citationKey"])
        } else {
            suggestion
        }
    } else if artifact_type == "note_draft"
        || artifact_type == "related_work_outline"
        || artifact_type == "reading_note_bundle"
        || artifact_type == "evidence_bundle"
        || artifact_type == "claim_evidence_map"
        || artifact_type == "compile_fix"
        || artifact_type == "comparison_table"
    {
        string_field(artifact, &["content"])
    } else if artifact_type == "reference_patch" {
        artifact
            .get("updates")
            .and_then(Value::as_object)
            .map(|entries| {
                entries
                    .iter()
                    .map(|(key, value)| format!("{key}: {}", value.as_str().unwrap_or_default()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default()
    } else {
        let text = string_field(artifact, &["content"]);
        if !text.is_empty() {
            text
        } else {
            let answer = string_field(&payload, &["answer", "summary", "paragraph"]);
            if !answer.is_empty() {
                answer
            } else {
                strip_internal_prompt_echo(&string_field(result, &["content"]))
            }
        }
    };
    let rationale = {
        let rationale = string_field(&payload, &["rationale"]);
        if rationale.is_empty() {
            string_field(artifact, &["rationale"])
        } else {
            rationale
        }
    };
    let citation_suggestion = {
        let suggestion = string_field(&payload, &["citation_suggestion"]);
        if suggestion.is_empty() {
            string_field(artifact, &["citationSuggestion"])
        } else {
            suggestion
        }
    };

    let mut parts = Vec::new();
    for event in array_entries(result, "events") {
        if let Some(part) = normalize_tool_event(&event) {
            parts.push(part);
        }
    }
    if !rationale.is_empty() {
        parts.push(json!({
            "type": "support",
            "label": "Grounding note",
            "text": rationale,
        }));
    }
    if !main_text.is_empty() {
        parts.push(json!({
            "type": "text",
            "text": main_text,
        }));
    }
    if !citation_suggestion.is_empty() {
        parts.push(json!({
            "type": "note",
            "label": "Citation suggestion",
            "text": citation_suggestion,
        }));
    }
    if artifact.is_object() {
        let artifact_title = string_field(artifact, &["title", "type"]);
        parts.push(json!({
            "type": "artifact",
            "artifactId": string_field(artifact, &["id"]),
            "title": artifact_title,
            "artifactType": artifact_type,
            "preview": artifact_preview(artifact),
        }));
    }

    json!({
        "id": id,
        "role": "assistant",
        "createdAt": created_at,
        "content": if !main_text.is_empty() {
            main_text.clone()
        } else if !rationale.is_empty() {
            rationale.clone()
        } else {
            strip_internal_prompt_echo(&string_field(result, &["content"]))
        },
        "parts": parts,
        "metadata": {
            "skillId": string_field(skill, &["id"]),
            "skillLabel": skill_label(skill),
            "providerSummary": provider_summary(provider_state, &string_field(result, &["transport"])),
            "contextChips": build_context_chips(context_bundle),
        }
    })
}

fn build_failed_assistant_message(
    id: &str,
    skill: &Value,
    error: &str,
    transport: &str,
    provider_state: &Value,
    context_bundle: &Value,
    events: &[Value],
    created_at: i64,
) -> Value {
    let message = {
        let value = trim(error);
        if value.is_empty() {
            "AI execution failed.".to_string()
        } else {
            value
        }
    };
    let mut parts = Vec::new();
    for event in events {
        if let Some(part) = normalize_tool_event(event) {
            parts.push(part);
        }
    }
    parts.push(json!({
        "type": "error",
        "text": message,
    }));
    json!({
        "id": id,
        "role": "assistant",
        "createdAt": created_at,
        "content": message,
        "parts": parts,
        "metadata": {
            "skillId": string_field(skill, &["id"]),
            "skillLabel": skill_label(skill),
            "providerSummary": provider_summary(provider_state, transport),
            "contextChips": build_context_chips(context_bundle),
        }
    })
}


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionStartParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub provider_state: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub user_instruction: String,
    #[serde(default)]
    pub prompt_draft: String,
    #[serde(default)]
    pub effective_permission_mode: String,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub user_message_id: String,
    #[serde(default = "now_ms")]
    pub created_at: i64,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionCompleteParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub result: Value,
    #[serde(default)]
    pub artifact: Value,
    #[serde(default)]
    pub provider_state: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default = "now_ms")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionFailParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub error: String,
    #[serde(default)]
    pub provider_state: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub events: Vec<Value>,
    #[serde(default = "now_ms")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionFinalizeParams {
    #[serde(default)]
    pub session: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionInterruptParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub pending_assistant_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionMutationResponse {
    pub session: Value,
    pub assistant_message: Option<Value>,
    pub user_message: Option<Value>,
    pub failed_assistant_message: Option<Value>,
}

fn remove_streaming_marker(part: &Value) -> Value {
    let Some(object) = part.as_object() else {
        return part.clone();
    };

    let mut next = object.clone();
    next.remove("isStreaming");
    Value::Object(next)
}

fn part_has_visible_content(part: &Value) -> bool {
    let part_type = string_field(part, &["type"]);
    if part_type == "text" || part_type == "support" || part_type == "note" || part_type == "error"
    {
        return !string_field(part, &["text"]).is_empty();
    }

    part.is_object()
}

pub async fn ai_agent_session_start(
    params: AiAgentSessionStartParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let current_session = params.session;
    let current_messages = array_entries(&current_session, "messages");
    let fallback_title = {
        let title = trim(&params.fallback_title);
        if title.is_empty() {
            "New session".to_string()
        } else {
            title
        }
    };
    let title = if current_messages.is_empty() {
        let instruction = {
            let instruction = trim(&params.user_instruction);
            if instruction.is_empty() {
                trim(&params.prompt_draft)
            } else {
                instruction
            }
        };
        if instruction.is_empty() {
            fallback_title
        } else if instruction.chars().count() <= 48 {
            instruction
        } else {
            instruction
                .chars()
                .take(48)
                .collect::<String>()
                .trim_end()
                .to_string()
                + "…"
        }
    } else {
        string_field(&current_session, &["title"])
    };
    let user_message = build_user_message(
        &params.user_message_id,
        &params.skill,
        &params.user_instruction,
        &params.context_bundle,
        params.created_at,
    );
    let assistant_message = build_pending_assistant_message(
        &params.pending_assistant_id,
        &params.skill,
        &params.provider_state,
        &params.context_bundle,
        params.created_at + 1,
    );
    let mut messages = current_messages;
    messages.push(user_message.clone());
    messages.push(assistant_message.clone());

    let mut session = current_session;
    session["title"] = Value::String(title);
    session["messages"] = Value::Array(messages);
    session["isRunning"] = Value::Bool(true);
    session["lastError"] = Value::String(String::new());
    session["promptDraft"] = Value::String(String::new());
    session["attachments"] = Value::Array(Vec::new());
    session["waitingResume"] = Value::Bool(false);
    session["waitingResumeMessage"] = Value::String(String::new());
    session["activeTurn"] = build_active_turn_from_prepared_run(
        &params.prepared_run,
        &params.pending_assistant_id,
        params.created_at,
    );
    if trim(&params.effective_permission_mode) != "chat" {
        session["permissionMode"] = Value::String(trim(&params.effective_permission_mode));
    }

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: Some(assistant_message),
        user_message: Some(user_message),
        failed_assistant_message: None,
    })
}

pub async fn ai_agent_session_complete(
    params: AiAgentSessionCompleteParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let assistant_message = build_assistant_message(
        &params.pending_assistant_id,
        &params.skill,
        &params.result,
        &params.artifact,
        &params.provider_state,
        &params.context_bundle,
        params.created_at,
    );
    let mut messages = array_entries(&params.session, "messages");
    for message in &mut messages {
        if string_field(message, &["id"]) == trim(&params.pending_assistant_id) {
            *message = assistant_message.clone();
        }
    }

    let mut artifacts = array_entries(&params.session, "artifacts");
    if params.artifact.is_object() {
        artifacts.insert(0, params.artifact.clone());
    }

    let mut session = params.session;
    session["runtimeTransport"] = Value::String({
        let transport = string_field(&params.result, &["transport"]);
        if transport.is_empty() {
            string_field(&session, &["runtimeTransport"])
        } else {
            transport
        }
    });
    session["messages"] = Value::Array(messages);
    session["artifacts"] = Value::Array(artifacts);
    session["attachments"] = Value::Array(Vec::new());
    session["promptDraft"] = Value::String(String::new());
    if session
        .get("activeTurn")
        .and_then(Value::as_object)
        .is_some()
    {
        session["activeTurn"]["status"] = Value::String("completed".to_string());
        session["activeTurn"]["phase"] = Value::String("completed".to_string());
        session["activeTurn"]["pendingRequestKind"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestId"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestCount"] = Value::Number(0.into());
        session["activeTurn"]["updatedAt"] = Value::Number(now_ms().into());
        session["activeTurn"]["transport"] =
            Value::String(string_field(&params.result, &["transport"]));
    }

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: Some(assistant_message),
        user_message: None,
        failed_assistant_message: None,
    })
}

pub async fn ai_agent_session_fail(
    params: AiAgentSessionFailParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let failed_assistant_message = build_failed_assistant_message(
        &params.pending_assistant_id,
        &params.skill,
        &params.error,
        &string_field(&params.session, &["runtimeTransport"]),
        &params.provider_state,
        &params.context_bundle,
        &params.events,
        params.created_at,
    );
    let mut messages = array_entries(&params.session, "messages");
    for message in &mut messages {
        if string_field(message, &["id"]) == trim(&params.pending_assistant_id) {
            *message = failed_assistant_message.clone();
        }
    }

    let mut session = params.session;
    session["lastError"] = Value::String({
        let error = trim(&params.error);
        if error.is_empty() {
            "AI execution failed.".to_string()
        } else {
            error
        }
    });
    session["messages"] = Value::Array(messages);
    if session
        .get("activeTurn")
        .and_then(Value::as_object)
        .is_some()
    {
        session["activeTurn"]["status"] = Value::String("failed".to_string());
        session["activeTurn"]["phase"] = Value::String("failed".to_string());
        session["activeTurn"]["pendingRequestKind"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestId"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestCount"] = Value::Number(0.into());
        session["activeTurn"]["summary"] = Value::String(trim(&params.error));
        session["activeTurn"]["updatedAt"] = Value::Number(now_ms().into());
    }

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: Some(failed_assistant_message),
    })
}

pub async fn ai_agent_session_finalize(
    params: AiAgentSessionFinalizeParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let mut session = with_cleared_active_turn(params.session);
    session["isRunning"] = Value::Bool(false);
    session["permissionRequests"] = Value::Array(Vec::new());
    session["askUserRequests"] = Value::Array(Vec::new());
    session["exitPlanRequests"] = Value::Array(Vec::new());
    session["waitingResume"] = Value::Bool(false);
    session["waitingResumeMessage"] = Value::String(String::new());
    session["isCompacting"] = Value::Bool(false);

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: None,
    })
}

pub async fn ai_agent_session_interrupt(
    params: AiAgentSessionInterruptParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let pending_id = trim(&params.pending_assistant_id);
    let mut messages = Vec::new();

    for message in array_entries(&params.session, "messages") {
        if string_field(&message, &["id"]) != pending_id {
            messages.push(message);
            continue;
        }

        let normalized_parts = array_entries(&message, "parts")
            .into_iter()
            .map(|part| remove_streaming_marker(&part))
            .filter(part_has_visible_content)
            .collect::<Vec<_>>();
        let content = string_field(&message, &["content"]);

        if content.is_empty() && normalized_parts.is_empty() {
            continue;
        }

        let mut next_message = message.clone();
        next_message["parts"] = Value::Array(normalized_parts);
        next_message["content"] = Value::String(content);
        messages.push(next_message);
    }

    let mut session = params.session;
    session["messages"] = Value::Array(messages);
    session["lastError"] = Value::String(String::new());
    if session
        .get("activeTurn")
        .and_then(Value::as_object)
        .is_some()
    {
        session["activeTurn"]["status"] = Value::String("interrupted".to_string());
        session["activeTurn"]["phase"] = Value::String("interrupted".to_string());
        session["activeTurn"]["pendingRequestKind"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestId"] = Value::String(String::new());
        session["activeTurn"]["pendingRequestCount"] = Value::Number(0.into());
        session["activeTurn"]["updatedAt"] = Value::Number(now_ms().into());
    }

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: None,
    })
}
