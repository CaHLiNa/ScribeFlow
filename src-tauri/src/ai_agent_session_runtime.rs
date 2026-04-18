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
    let kind = string_field(skill, &["kind"]);
    if kind == "filesystem-skill" {
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

fn merge_tool_parts(existing_parts: &[Value], event: &Value) -> Vec<Value> {
    let Some(next_event) = normalize_tool_event(event) else {
        return existing_parts.to_vec();
    };
    let tool_id = string_field(&next_event, &["toolId"]);
    let mut parts = existing_parts.to_vec();
    if let Some(index) = parts.iter().position(|part| {
        string_field(part, &["type"]) == "tool" && string_field(part, &["toolId"]) == tool_id
    }) {
        let previous = parts[index].as_object().cloned().unwrap_or_default();
        let next = next_event.as_object().cloned().unwrap_or_default();
        parts[index] = Value::Object(previous.into_iter().chain(next).collect());
        return parts;
    }
    parts.push(next_event);
    parts
}

fn replace_or_append_stream_part(
    existing_parts: &[Value],
    target_type: &str,
    next_part: Value,
    preferred_after_types: &[&str],
) -> Vec<Value> {
    let mut parts = existing_parts.to_vec();
    if let Some(index) = parts.iter().position(|part| {
        string_field(part, &["type"]) == target_type
            && part
                .get("isStreaming")
                .and_then(Value::as_bool)
                .unwrap_or(false)
    }) {
        let previous = parts[index].as_object().cloned().unwrap_or_default();
        let next = next_part.as_object().cloned().unwrap_or_default();
        parts[index] = Value::Object(previous.into_iter().chain(next).collect());
        return parts;
    }

    let insert_after = parts
        .iter()
        .enumerate()
        .filter(|(_, part)| preferred_after_types.contains(&string_field(part, &["type"]).as_str()))
        .map(|(index, _)| index)
        .last();

    if let Some(index) = insert_after {
        parts.insert(index + 1, next_part);
        return parts;
    }

    parts.push(next_part);
    parts
}

fn apply_conversation_event_to_message(message: &Value, event: &Value) -> Value {
    if !message.is_object() || !event.is_object() {
        return message.clone();
    }

    if event.get("eventType").and_then(Value::as_str) == Some("tool")
        || event.get("toolId").is_some()
    {
        let parts = merge_tool_parts(
            message
                .get("parts")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            event,
        );
        let mut next = message.clone();
        next["parts"] = Value::Array(parts);
        return next;
    }

    if event.get("eventType").and_then(Value::as_str) == Some("assistant-content") {
        let text = string_field(event, &["text"]);
        if text.is_empty() {
            return message.clone();
        }
        let parts = replace_or_append_stream_part(
            message
                .get("parts")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            "text",
            json!({
                "type": "text",
                "text": text,
                "isStreaming": true,
            }),
            &["tool", "status"],
        );
        let mut next = message.clone();
        next["content"] = Value::String(text);
        next["parts"] = Value::Array(parts);
        return next;
    }

    if event.get("eventType").and_then(Value::as_str) == Some("assistant-reasoning") {
        let text = string_field(event, &["text"]);
        if text.is_empty() {
            return message.clone();
        }
        let parts = replace_or_append_stream_part(
            message
                .get("parts")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]),
            "support",
            json!({
                "type": "support",
                "label": "Reasoning",
                "text": text,
                "isStreaming": true,
            }),
            &["status"],
        );
        let mut next = message.clone();
        next["parts"] = Value::Array(parts);
        return next;
    }

    message.clone()
}

fn artifact_preview(artifact: &Value) -> String {
    match string_field(artifact, &["type"]).as_str() {
        "doc_patch" => preview_text(&string_field(artifact, &["replacementText"]), 180),
        "note_draft" => preview_text(&string_field(artifact, &["content"]), 180),
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
    } else if artifact_type == "note_draft" {
        string_field(artifact, &["content"])
    } else {
        let text = string_field(artifact, &["content"]);
        if !text.is_empty() {
            text
        } else {
            let answer = string_field(&payload, &["answer", "summary", "paragraph"]);
            if !answer.is_empty() {
                answer
            } else {
                string_field(result, &["content"])
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
        "content": if !main_text.is_empty() { main_text.clone() } else if !rationale.is_empty() { rationale.clone() } else { string_field(result, &["content"]) },
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

fn remove_request(requests: &[Value], request_id: &str) -> Vec<Value> {
    let normalized = trim(request_id);
    requests
        .iter()
        .filter(|request| string_field(request, &["requestId"]) != normalized)
        .cloned()
        .collect()
}

fn upsert_request(requests: &[Value], next_request: Value) -> Vec<Value> {
    let request_id = string_field(&next_request, &["requestId"]);
    if request_id.is_empty() {
        return requests.to_vec();
    }

    let mut entries = remove_request(requests, &request_id);
    entries.push(next_request);
    entries
}

fn normalize_background_task_status(status: &str) -> String {
    match trim(status).to_lowercase().as_str() {
        "failed" | "error" => "error".to_string(),
        "done" | "completed" | "stopped" => "done".to_string(),
        _ => "running".to_string(),
    }
}

fn find_background_task_index(tasks: &[Value], event: &Value) -> Option<usize> {
    let normalized_id = string_field(event, &["id"]);
    let normalized_task_id = string_field(event, &["taskId"]);
    let normalized_tool_use_id = {
        let tool_use_id = string_field(event, &["toolUseId", "toolId"]);
        if tool_use_id.is_empty() {
            string_field(event, &["id"])
        } else {
            tool_use_id
        }
    };
    tasks.iter().position(|entry| {
        (!normalized_task_id.is_empty() && string_field(entry, &["taskId"]) == normalized_task_id)
            || (!normalized_tool_use_id.is_empty()
                && string_field(entry, &["toolUseId"]) == normalized_tool_use_id)
            || (!normalized_id.is_empty() && string_field(entry, &["id"]) == normalized_id)
    })
}

fn build_background_task_record(event: &Value, previous: Option<&Value>) -> Value {
    let task_id = {
        let task_id = string_field(event, &["taskId"]);
        if task_id.is_empty() {
            string_field(previous.unwrap_or(&Value::Null), &["taskId"])
        } else {
            task_id
        }
    };
    let tool_use_id = {
        let tool_use_id = string_field(event, &["toolUseId", "toolId"]);
        if tool_use_id.is_empty() {
            let previous_id = string_field(previous.unwrap_or(&Value::Null), &["toolUseId"]);
            if previous_id.is_empty() {
                string_field(event, &["id"])
            } else {
                previous_id
            }
        } else {
            tool_use_id
        }
    };
    let record_id = if !task_id.is_empty() {
        format!("task:{task_id}")
    } else if !tool_use_id.is_empty() {
        format!("tool:{tool_use_id}")
    } else {
        String::new()
    };
    let detail = {
        let detail = string_field(event, &["detail", "description", "summary"]);
        if detail.is_empty() {
            string_field(previous.unwrap_or(&Value::Null), &["detail"])
        } else {
            detail
        }
    };
    let label = {
        let label = string_field(
            event,
            &[
                "label",
                "title",
                "lastToolName",
                "taskType",
                "toolUseId",
                "taskId",
            ],
        );
        if label.is_empty() {
            let previous_label = string_field(previous.unwrap_or(&Value::Null), &["label"]);
            if previous_label.is_empty() {
                "Background task".to_string()
            } else {
                previous_label
            }
        } else {
            label
        }
    };
    let elapsed_seconds = event
        .get("elapsedSeconds")
        .and_then(Value::as_i64)
        .map(|value| value.max(0))
        .or_else(|| {
            previous
                .and_then(|entry| entry.get("elapsedSeconds"))
                .and_then(Value::as_i64)
        })
        .unwrap_or(0);
    let task_type = {
        let task_type = string_field(event, &["taskType"]);
        if task_type.is_empty() {
            string_field(previous.unwrap_or(&Value::Null), &["taskType"])
        } else {
            task_type
        }
    };
    let last_tool_name = {
        let last_tool_name = string_field(event, &["lastToolName"]);
        if last_tool_name.is_empty() {
            string_field(previous.unwrap_or(&Value::Null), &["lastToolName"])
        } else {
            last_tool_name
        }
    };
    let output_file = {
        let output_file = string_field(event, &["outputFile"]);
        if output_file.is_empty() {
            string_field(previous.unwrap_or(&Value::Null), &["outputFile"])
        } else {
            output_file
        }
    };
    let usage = event
        .get("usage")
        .cloned()
        .or_else(|| previous.and_then(|entry| entry.get("usage")).cloned())
        .unwrap_or(Value::Null);

    json!({
        "id": record_id,
        "taskId": task_id,
        "toolUseId": tool_use_id,
        "label": label,
        "status": normalize_background_task_status(&string_field(event, &["status"])),
        "detail": detail,
        "taskType": task_type,
        "lastToolName": last_tool_name,
        "outputFile": output_file,
        "elapsedSeconds": elapsed_seconds,
        "usage": usage,
        "updatedAt": now_ms(),
    })
}

fn apply_background_task_event(session: &Value, event: &Value) -> Value {
    let mut entries = array_entries(session, "backgroundTasks");
    let existing_index = find_background_task_index(&entries, event);
    let previous = existing_index.and_then(|index| entries.get(index));
    let next_task = build_background_task_record(event, previous);

    if !string_field(&next_task, &["id"]).is_empty() {
        if let Some(index) = existing_index {
            entries[index] = next_task;
        } else {
            entries.push(next_task);
        }
    }

    entries.sort_by_key(|entry| -(entry.get("updatedAt").and_then(Value::as_i64).unwrap_or(0)));
    entries.truncate(12);

    let mut next = session.clone();
    next["backgroundTasks"] = Value::Array(entries);
    next
}

fn apply_pending_assistant_event(
    messages: &[Value],
    pending_assistant_id: &str,
    event: &Value,
) -> Vec<Value> {
    let normalized = trim(pending_assistant_id);
    if normalized.is_empty() {
        return messages.to_vec();
    }
    messages
        .iter()
        .map(|message| {
            if string_field(message, &["id"]) == normalized {
                apply_conversation_event_to_message(message, event)
            } else {
                message.clone()
            }
        })
        .collect()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionStartParams {
    #[serde(default)]
    pub session: Value,
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
pub struct AiAgentSessionApplyEventParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub event: Value,
    #[serde(default)]
    pub pending_assistant_id: String,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentToolEventsMergeParams {
    #[serde(default)]
    pub events: Vec<Value>,
    #[serde(default)]
    pub event: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSessionMutationResponse {
    pub session: Value,
    pub assistant_message: Option<Value>,
    pub user_message: Option<Value>,
    pub failed_assistant_message: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentToolEventsMergeResponse {
    pub events: Vec<Value>,
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

#[tauri::command]
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

#[tauri::command]
pub async fn ai_agent_session_apply_event(
    params: AiAgentSessionApplyEventParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let current_session = params.session;
    let current_event = params.event;
    let mut next_session = current_session.clone();

    let transport = string_field(&current_event, &["transport"]);
    if !transport.is_empty() {
        next_session["runtimeTransport"] = Value::String(transport);
    }

    match current_event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
    {
        "permission_request" => {
            let display_name = string_field(&current_event, &["displayName", "toolName"]);
            let requests = upsert_request(
                &array_entries(&current_session, "permissionRequests"),
                json!({
                    "requestId": string_field(&current_event, &["requestId", "toolUseId"]),
                    "streamId": string_field(&current_event, &["streamId"]),
                    "toolName": string_field(&current_event, &["toolName"]),
                    "displayName": display_name,
                    "title": string_field(&current_event, &["title"]),
                    "description": string_field(&current_event, &["description"]),
                    "decisionReason": string_field(&current_event, &["decisionReason"]),
                    "inputPreview": string_field(&current_event, &["inputPreview"]),
                }),
            );
            next_session["permissionRequests"] = Value::Array(requests);
        }
        "permission_resolved" => {
            next_session["permissionRequests"] = Value::Array(remove_request(
                &array_entries(&next_session, "permissionRequests"),
                &string_field(&current_event, &["requestId", "toolUseId"]),
            ));
        }
        "ask_user_request" => {
            let requests = upsert_request(
                &array_entries(&current_session, "askUserRequests"),
                json!({
                    "requestId": string_field(&current_event, &["requestId"]),
                    "streamId": string_field(&current_event, &["streamId"]),
                    "title": string_field(&current_event, &["title"]),
                    "prompt": string_field(&current_event, &["prompt", "question"]),
                    "description": string_field(&current_event, &["description"]),
                    "questions": array_entries(&current_event, "questions"),
                }),
            );
            next_session["askUserRequests"] = Value::Array(requests);
        }
        "ask_user_resolved" => {
            next_session["askUserRequests"] = Value::Array(remove_request(
                &array_entries(&next_session, "askUserRequests"),
                &string_field(&current_event, &["requestId"]),
            ));
        }
        "exit_plan_mode_request" => {
            let requests = upsert_request(
                &array_entries(&current_session, "exitPlanRequests"),
                json!({
                    "requestId": string_field(&current_event, &["requestId"]),
                    "streamId": string_field(&current_event, &["streamId"]),
                    "toolUseId": string_field(&current_event, &["toolUseId"]),
                    "title": string_field(&current_event, &["title"]),
                    "allowedPrompts": array_entries(&current_event, "allowedPrompts"),
                }),
            );
            next_session["exitPlanRequests"] = Value::Array(requests);
        }
        "exit_plan_mode_resolved" => {
            next_session["exitPlanRequests"] = Value::Array(remove_request(
                &array_entries(&next_session, "exitPlanRequests"),
                &string_field(&current_event, &["requestId"]),
            ));
        }
        "permission_mode_changed" => {
            next_session["permissionMode"] = Value::String(string_field(&current_event, &["mode"]));
        }
        "plan_mode_start" => {
            next_session["planMode"] = json!({
                "active": true,
                "summary": string_field(&current_event, &["summary"]),
                "note": string_field(&current_event, &["note"]),
            });
        }
        "plan_mode_end" => {
            next_session["planMode"] = json!({
                "active": false,
                "summary": "",
                "note": "",
            });
        }
        "compacting" => {
            next_session["isCompacting"] = Value::Bool(true);
        }
        "compact_complete" => {
            next_session["isCompacting"] = Value::Bool(false);
            next_session["lastCompactAt"] = Value::Number(now_ms().into());
        }
        "waiting_resume" => {
            next_session["waitingResume"] = Value::Bool(true);
            next_session["waitingResumeMessage"] =
                Value::String(string_field(&current_event, &["message"]));
        }
        "resume_start" => {
            next_session["waitingResume"] = Value::Bool(false);
            next_session["waitingResumeMessage"] = Value::String(String::new());
        }
        "background_task" => {
            next_session = apply_background_task_event(&next_session, &current_event);
        }
        "task_started" => {
            next_session = apply_background_task_event(
                &next_session,
                &json!({
                    "taskId": string_field(&current_event, &["taskId"]),
                    "toolUseId": string_field(&current_event, &["toolUseId"]),
                    "taskType": string_field(&current_event, &["taskType"]),
                    "label": string_field(&current_event, &["description"]),
                    "description": string_field(&current_event, &["description"]),
                    "status": "running",
                }),
            );
        }
        "task_progress" => {
            let detail = string_field(&current_event, &["description", "lastToolName"]);
            next_session = apply_background_task_event(
                &next_session,
                &json!({
                    "taskId": string_field(&current_event, &["taskId"]),
                    "toolUseId": string_field(&current_event, &["toolUseId"]),
                    "lastToolName": string_field(&current_event, &["lastToolName"]),
                    "detail": detail,
                    "elapsedSeconds": current_event.get("elapsedSeconds").cloned().unwrap_or(Value::Null),
                    "usage": current_event.get("usage").cloned().unwrap_or(Value::Null),
                    "status": "running",
                }),
            );
        }
        "task_notification" => {
            next_session = apply_background_task_event(
                &next_session,
                &json!({
                    "taskId": string_field(&current_event, &["taskId"]),
                    "toolUseId": string_field(&current_event, &["toolUseId"]),
                    "summary": string_field(&current_event, &["summary"]),
                    "outputFile": string_field(&current_event, &["outputFile"]),
                    "usage": current_event.get("usage").cloned().unwrap_or(Value::Null),
                    "status": string_field(&current_event, &["status"]),
                }),
            );
        }
        _ => {}
    }

    if current_event.get("eventType").and_then(Value::as_str) == Some("tool")
        || current_event.get("toolId").is_some()
    {
        let payload = current_event.get("payload").cloned().unwrap_or(Value::Null);
        let payload_event_type = string_field(&payload, &["eventType"]);
        let payload_tool_name = {
            let tool_name = string_field(&payload, &["toolName"]);
            if tool_name.is_empty() {
                string_field(&current_event, &["label"])
            } else {
                tool_name
            }
        };

        if payload_event_type == "tool_call_start" && payload_tool_name == "EnterPlanMode" {
            next_session["planMode"] = json!({
                "active": true,
                "summary": "The agent is currently drafting a plan.",
                "note": "Plan mode stays visible until the runtime exits it.",
            });
        }

        if payload_event_type == "tool_call_done" && payload_tool_name == "ExitPlanMode" {
            next_session["planMode"] = json!({
                "active": false,
                "summary": "",
                "note": "",
            });
        }
    }

    next_session["messages"] = Value::Array(apply_pending_assistant_event(
        &array_entries(&next_session, "messages"),
        &params.pending_assistant_id,
        &current_event,
    ));

    Ok(AiAgentSessionMutationResponse {
        session: next_session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: None,
    })
}

#[tauri::command]
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

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: Some(assistant_message),
        user_message: None,
        failed_assistant_message: None,
    })
}

#[tauri::command]
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

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: Some(failed_assistant_message),
    })
}

#[tauri::command]
pub async fn ai_agent_session_finalize(
    params: AiAgentSessionFinalizeParams,
) -> Result<AiAgentSessionMutationResponse, String> {
    let mut session = params.session;
    session["isRunning"] = Value::Bool(false);
    session["permissionRequests"] = Value::Array(Vec::new());
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

#[tauri::command]
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

    Ok(AiAgentSessionMutationResponse {
        session,
        assistant_message: None,
        user_message: None,
        failed_assistant_message: None,
    })
}

#[tauri::command]
pub async fn ai_agent_tool_events_merge(
    params: AiAgentToolEventsMergeParams,
) -> Result<AiAgentToolEventsMergeResponse, String> {
    let next_event = params.event;
    let tool_id = string_field(&next_event, &["toolId", "id"]);
    if tool_id.is_empty() {
        return Ok(AiAgentToolEventsMergeResponse {
            events: params.events,
        });
    }

    let mut events = params.events;
    if let Some(index) = events
        .iter()
        .position(|event| string_field(event, &["toolId"]) == tool_id)
    {
        let previous = events[index].as_object().cloned().unwrap_or_default();
        let next = next_event.as_object().cloned().unwrap_or_default();
        events[index] = Value::Object(previous.into_iter().chain(next).collect());
    } else {
        events.push(next_event);
    }

    Ok(AiAgentToolEventsMergeResponse { events })
}
