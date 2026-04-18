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

fn to_ms(timestamp: Option<i64>) -> i64 {
    let numeric = timestamp.unwrap_or_default();
    if numeric > 0 {
        numeric * 1000
    } else {
        chrono::Utc::now().timestamp_millis()
    }
}

fn normalize_runtime_request(request: &Value, extra: Value) -> Option<Value> {
    let request_id = string_field(request, &["requestId", "request_id"]);
    if request_id.is_empty() {
        return None;
    }

    let mut value = json!({
        "requestId": request_id,
        "streamId": "",
        "runtimeManaged": true,
    });
    if let Some(extra_map) = extra.as_object() {
        for (key, entry) in extra_map {
            value[key] = entry.clone();
        }
    }
    Some(value)
}

fn build_user_message(item: &Value) -> Value {
    let text = string_field(item, &["text"]);
    json!({
        "id": format!(
            "runtime:{}:user",
            string_field(item, &["turnId", "turn_id"]).trim().to_string()
        ),
        "role": "user",
        "createdAt": to_ms(
            item.get("createdAt")
                .and_then(Value::as_i64)
                .or_else(|| item.get("created_at").and_then(Value::as_i64))
        ),
        "content": text,
        "parts": if text.is_empty() {
            Value::Array(vec![])
        } else {
            json!([{ "type": "text", "text": text }])
        },
        "metadata": {
            "skillId": "",
            "skillLabel": "",
            "contextChips": [],
        }
    })
}

fn build_assistant_message(
    turn: &Value,
    assistant_item: Option<&Value>,
    reasoning_item: Option<&Value>,
) -> Value {
    let assistant_text = assistant_item
        .map(|value| string_field(value, &["text"]))
        .unwrap_or_default();
    let reasoning_text = reasoning_item
        .map(|value| string_field(value, &["text"]))
        .unwrap_or_default();
    let status = string_field(turn, &["status"]);
    let mut parts = Vec::new();

    if !reasoning_text.is_empty() {
        parts.push(json!({
            "type": "support",
            "label": "Reasoning",
            "text": reasoning_text,
        }));
    }
    if !assistant_text.is_empty() {
        parts.push(json!({
            "type": "text",
            "text": assistant_text,
        }));
    }
    if assistant_text.is_empty() && status == "failed" {
        parts.push(json!({
            "type": "error",
            "text": "AI execution failed.",
        }));
    }
    json!({
        "id": format!("runtime:{}:assistant", string_field(turn, &["id"])),
        "role": "assistant",
        "createdAt": to_ms(
            assistant_item
                .and_then(|value| value.get("createdAt").and_then(Value::as_i64))
                .or_else(|| assistant_item.and_then(|value| value.get("created_at").and_then(Value::as_i64)))
                .or_else(|| turn.get("createdAt").and_then(Value::as_i64))
        ),
        "content": if !assistant_text.is_empty() {
            assistant_text
        } else if status == "failed" {
            "AI execution failed.".to_string()
        } else {
            String::new()
        },
        "parts": parts,
        "metadata": {
            "skillId": "",
            "skillLabel": "",
            "providerSummary": "",
            "contextChips": [],
        }
    })
}

fn build_session_messages_from_runtime_snapshot(snapshot: &Value) -> Vec<Value> {
    let turns = snapshot
        .get("turns")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let items = snapshot
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut messages = Vec::new();
    for turn in turns {
        let turn_id = string_field(&turn, &["id"]);
        if turn_id.is_empty() {
            continue;
        }
        let turn_items = items
            .iter()
            .filter(|item| string_field(item, &["turnId", "turn_id"]) == turn_id)
            .cloned()
            .collect::<Vec<_>>();
        let user_item = turn_items
            .iter()
            .find(|item| string_field(item, &["kind"]) == "userMessage");
        let assistant_item = turn_items
            .iter()
            .find(|item| string_field(item, &["kind"]) == "agentMessage");
        let reasoning_item = turn_items
            .iter()
            .find(|item| string_field(item, &["kind"]) == "reasoning");

        if let Some(user_item) = user_item {
            messages.push(build_user_message(user_item));
        }

        let status = string_field(&turn, &["status"]);
        if assistant_item.is_some() || reasoning_item.is_some() || status == "failed" {
            messages.push(build_assistant_message(
                &turn,
                assistant_item,
                reasoning_item,
            ));
        }
    }

    messages
}

fn build_session_permission_requests_from_runtime_snapshot(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("permissionRequests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|request| {
            normalize_runtime_request(
                &request,
                json!({
                    "toolName": string_field(&request, &["toolName"]),
                    "displayName": string_field(&request, &["displayName", "toolName"]),
                    "title": string_field(&request, &["title"]),
                    "description": string_field(&request, &["description"]),
                    "decisionReason": string_field(&request, &["decisionReason"]),
                    "inputPreview": string_field(&request, &["inputPreview"]),
                }),
            )
        })
        .collect()
}

fn build_session_ask_user_requests_from_runtime_snapshot(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("askUserRequests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|request| {
            normalize_runtime_request(
                &request,
                json!({
                    "title": string_field(&request, &["title"]),
                    "prompt": string_field(&request, &["prompt", "question"]),
                    "description": string_field(&request, &["description"]),
                    "questions": request.get("questions").cloned().unwrap_or(Value::Array(vec![])),
                }),
            )
        })
        .collect()
}

fn build_session_exit_plan_requests_from_runtime_snapshot(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("exitPlanRequests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|request| {
            normalize_runtime_request(
                &request,
                json!({
                    "toolUseId": string_field(&request, &["turnId", "turn_id"]),
                    "title": string_field(&request, &["title"]),
                    "allowedPrompts": request.get("allowedPrompts").cloned().unwrap_or(Value::Array(vec![])),
                }),
            )
        })
        .collect()
}

fn build_session_plan_mode_from_runtime_snapshot(snapshot: &Value) -> Value {
    json!({
        "active": snapshot
            .get("planMode")
            .and_then(|value| value.get("active"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        "summary": string_field(snapshot.get("planMode").unwrap_or(&Value::Null), &["summary"]),
        "note": string_field(snapshot.get("planMode").unwrap_or(&Value::Null), &["note"]),
    })
}

pub fn map_runtime_thread_snapshot_to_session(session: &Value, snapshot: &Value) -> Value {
    let mut next_session = session.clone();
    let thread = snapshot.get("thread").cloned().unwrap_or(Value::Null);

    if !thread.is_object() {
        return next_session;
    }

    let current_title = string_field(&next_session, &["title"]);
    next_session["title"] = Value::String({
        let title = string_field(&thread, &["title"]);
        if title.is_empty() {
            current_title
        } else {
            title
        }
    });
    next_session["runtimeThreadId"] = Value::String(string_field(&thread, &["id"]));
    next_session["runtimeTurnId"] = Value::String(string_field(&thread, &["activeTurnId"]));
    next_session["isRunning"] = Value::Bool(string_field(&thread, &["status"]) == "running");
    let existing_messages = session
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    next_session["messages"] = if existing_messages.is_empty() {
        Value::Array(build_session_messages_from_runtime_snapshot(snapshot))
    } else {
        Value::Array(existing_messages)
    };
    next_session["permissionRequests"] = Value::Array(
        build_session_permission_requests_from_runtime_snapshot(snapshot),
    );
    next_session["askUserRequests"] = Value::Array(
        build_session_ask_user_requests_from_runtime_snapshot(snapshot),
    );
    next_session["exitPlanRequests"] = Value::Array(
        build_session_exit_plan_requests_from_runtime_snapshot(snapshot),
    );
    next_session["planMode"] = build_session_plan_mode_from_runtime_snapshot(snapshot);
    next_session
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeThreadSnapshotToSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub snapshot: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeThreadSnapshotToSessionResponse {
    pub session: Value,
}

#[tauri::command]
pub async fn ai_runtime_thread_snapshot_to_session(
    params: AiRuntimeThreadSnapshotToSessionParams,
) -> Result<AiRuntimeThreadSnapshotToSessionResponse, String> {
    Ok(AiRuntimeThreadSnapshotToSessionResponse {
        session: map_runtime_thread_snapshot_to_session(&params.session, &params.snapshot),
    })
}
