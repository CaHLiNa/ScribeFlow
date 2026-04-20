use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, State};

use crate::ai_agent_session_runtime::{
    ai_agent_session_apply_event, AiAgentSessionApplyEventParams,
};
use crate::codex_runtime::{
    protocol::RuntimeTurnInterruptParams,
    runtime_turn_interrupt,
    state::{CodexRuntimeHandle, CodexRuntimeState},
};

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
    let text = normalize_runtime_user_text(&string_field(item, &["text"]));
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

fn normalize_runtime_user_text(text: &str) -> String {
    let normalized = text.trim();
    if normalized.is_empty() {
        return String::new();
    }

    let current_task_prefix = "Current task:";
    if let Some(task_start) = normalized.find(current_task_prefix) {
        let task_body = &normalized[task_start + current_task_prefix.len()..];
        let section_markers = [
            "\n\nTurn route:",
            "\n\nExecution context:",
            "\n\nResearch defaults:",
            "\n\nResolved research task:",
            "\n\nRequired evidence:",
            "\n\nPreferred artifacts:",
            "\n\nVerification plan:",
            "\n\nResearch context graph:",
            "\n\nWorkspace context:",
            "\n\nReferenced files:",
            "\n\nAttached files:",
            "\n\nRecent conversation:",
            "\n\n## Skills",
            "\n\nSelection precedence:",
        ];
        let task_body = section_markers
            .iter()
            .filter_map(|marker| task_body.find(marker))
            .min()
            .map(|index| &task_body[..index])
            .unwrap_or(task_body);
        let task_body = task_body.trim();
        if !task_body.is_empty() {
            return task_body.to_string();
        }
    }

    normalized.to_string()
}

fn build_assistant_message(
    turn: &Value,
    assistant_item: Option<&Value>,
    reasoning_item: Option<&Value>,
    tool_parts: &[Value],
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
    parts.extend(tool_parts.iter().cloned());
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

fn parse_runtime_tool_payload(item: &Value) -> Value {
    serde_json::from_str(&string_field(item, &["text"])).unwrap_or(Value::Null)
}

fn tool_status_from_runtime_item(item: &Value, payload: &Value) -> String {
    let payload_status = string_field(payload, &["status"]);
    if !payload_status.is_empty() {
        return payload_status;
    }
    match string_field(item, &["status"]).as_str() {
        "running" => "running".to_string(),
        "failed" => "error".to_string(),
        _ => "done".to_string(),
    }
}

fn runtime_tool_part_from_item(item: &Value) -> Option<Value> {
    let kind = string_field(item, &["kind"]);
    if kind != "toolCall" && kind != "toolResult" {
        return None;
    }

    let payload = parse_runtime_tool_payload(item);
    let tool_name = string_field(&payload, &["toolName"]);
    let label = if tool_name.is_empty() {
        if kind == "toolCall" {
            "tool".to_string()
        } else {
            "result".to_string()
        }
    } else {
        tool_name
    };
    let detail = if kind == "toolCall" {
        let args = payload.get("arguments").cloned().unwrap_or(Value::Null);
        serde_json::to_string_pretty(&args).unwrap_or_default()
    } else {
        let result = payload.get("result").cloned().unwrap_or(Value::Null);
        if let Some(error) = result.get("error").and_then(Value::as_str) {
            error.to_string()
        } else if let Some(output) = result.get("outputFull").and_then(Value::as_str) {
            output.to_string()
        } else if let Some(output) = result.get("output").and_then(Value::as_str) {
            output.to_string()
        } else {
            String::new()
        }
    };
    let context = if kind == "toolCall" {
        if let Some(workdir) = payload
            .get("arguments")
            .and_then(|args| args.get("workdir"))
            .and_then(Value::as_str)
        {
            workdir.to_string()
        } else if let Some(path) = payload
            .get("arguments")
            .and_then(|args| args.get("path"))
            .and_then(Value::as_str)
        {
            path.to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let payload_tool_call_id = string_field(&payload, &["toolCallId", "tool_call_id"]);
    Some(json!({
        "type": "tool",
        "toolId": if payload_tool_call_id.is_empty() {
            string_field(item, &["id"])
        } else {
            payload_tool_call_id
        },
        "status": tool_status_from_runtime_item(item, &payload),
        "label": label,
        "context": context,
        "detail": detail,
        "payload": payload,
    }))
}

fn merge_runtime_tool_parts(existing_parts: &[Value], next_part: &Value) -> Vec<Value> {
    let tool_id = string_field(next_part, &["toolId"]);
    if tool_id.is_empty() {
        let mut parts = existing_parts.to_vec();
        parts.push(next_part.clone());
        return parts;
    }

    let mut parts = existing_parts.to_vec();
    if let Some(index) = parts
        .iter()
        .position(|part| string_field(part, &["toolId"]) == tool_id)
    {
        let previous = parts[index].as_object().cloned().unwrap_or_default();
        let next = next_part.as_object().cloned().unwrap_or_default();
        parts[index] = Value::Object(previous.into_iter().chain(next).collect());
        return parts;
    }
    parts.push(next_part.clone());
    parts
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
        let tool_parts = turn_items
            .iter()
            .filter_map(runtime_tool_part_from_item)
            .fold(Vec::new(), |parts, part| {
                merge_runtime_tool_parts(&parts, &part)
            });

        if let Some(user_item) = user_item {
            messages.push(build_user_message(user_item));
        }

        let status = string_field(&turn, &["status"]);
        if assistant_item.is_some()
            || reasoning_item.is_some()
            || !tool_parts.is_empty()
            || status == "failed"
        {
            messages.push(build_assistant_message(
                &turn,
                assistant_item,
                reasoning_item,
                &tool_parts,
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
        "items": snapshot
            .get("planMode")
            .and_then(|value| value.get("items"))
            .cloned()
            .unwrap_or(Value::Array(vec![])),
    })
}

fn build_session_active_turn_from_runtime_snapshot(snapshot: &Value, session: &Value) -> Value {
    let thread = snapshot.get("thread").unwrap_or(&Value::Null);
    let active_turn_id = string_field(thread, &["activeTurnId"]);
    if active_turn_id.is_empty() || string_field(thread, &["status"]) != "running" {
        return Value::Null;
    }
    let turns = snapshot
        .get("turns")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let active_turn = turns
        .into_iter()
        .find(|turn| string_field(turn, &["id"]) == active_turn_id)
        .unwrap_or(Value::Null);
    let existing_active_turn = session.get("activeTurn").cloned().unwrap_or(Value::Null);
    let permission_requests = snapshot
        .get("permissionRequests")
        .and_then(Value::as_array)
        .map(|entries| entries.len())
        .unwrap_or(0);
    let ask_user_requests = snapshot
        .get("askUserRequests")
        .and_then(Value::as_array)
        .map(|entries| entries.len())
        .unwrap_or(0);
    let exit_plan_requests = snapshot
        .get("exitPlanRequests")
        .and_then(Value::as_array)
        .map(|entries| entries.len())
        .unwrap_or(0);
    let pending_request_count = permission_requests + ask_user_requests + exit_plan_requests;
    let pending_request_kind = if permission_requests > 0 {
        "permission"
    } else if ask_user_requests > 0 {
        "ask-user"
    } else if exit_plan_requests > 0 {
        "exit-plan"
    } else {
        ""
    };
    let phase = if snapshot
        .get("planMode")
        .and_then(|value| value.get("active"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "plan"
    } else if pending_request_count > 0 {
        "approval"
    } else {
        "executing"
    };
    let label = {
        let label = string_field(&existing_active_turn, &["label"]);
        if label.is_empty() {
            "Runtime turn".to_string()
        } else {
            label
        }
    };
    json!({
        "id": active_turn_id,
        "threadId": string_field(thread, &["id"]),
        "runtimeTurnId": active_turn_id,
        "status": if pending_request_count > 0 { "awaiting-input" } else { "running" },
        "phase": phase,
        "label": label,
        "summary": string_field(&existing_active_turn, &["summary"]),
        "userInstruction": string_field(&existing_active_turn, &["userInstruction"]),
        "pendingAssistantId": string_field(&existing_active_turn, &["pendingAssistantId"]),
        "pendingRequestKind": pending_request_kind,
        "pendingRequestId": string_field(&existing_active_turn, &["pendingRequestId"]),
        "pendingRequestCount": pending_request_count,
        "lastToolName": string_field(&existing_active_turn, &["lastToolName"]),
        "transport": "codex-runtime",
        "route": existing_active_turn.get("route").cloned().unwrap_or(Value::Null),
        "startedAt": active_turn
            .get("createdAt")
            .or_else(|| active_turn.get("created_at"))
            .and_then(Value::as_i64)
            .unwrap_or_default(),
        "updatedAt": chrono::Utc::now().timestamp_millis(),
    })
}

fn build_runtime_snapshot_value(runtime: &CodexRuntimeState, thread_id: &str) -> Option<Value> {
    let thread = runtime.threads.get(thread_id)?.clone();
    let turns = thread
        .turn_ids
        .iter()
        .filter_map(|turn_id| runtime.turns.get(turn_id).cloned())
        .collect::<Vec<_>>();
    let items = turns
        .iter()
        .flat_map(|turn| turn.item_ids.iter())
        .filter_map(|item_id| runtime.items.get(item_id).cloned())
        .collect::<Vec<_>>();
    let permission_requests = runtime
        .permission_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();
    let ask_user_requests = runtime
        .ask_user_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();
    let exit_plan_requests = runtime
        .exit_plan_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();
    let plan_mode = runtime.plan_modes.get(&thread.id).cloned();

    Some(json!({
        "thread": thread,
        "turns": turns,
        "items": items,
        "permissionRequests": permission_requests,
        "askUserRequests": ask_user_requests,
        "exitPlanRequests": exit_plan_requests,
        "planMode": plan_mode,
    }))
}

fn event_type(payload: &Value) -> String {
    string_field(payload, &["eventType", "event_type"])
}

fn runtime_thread_id_from_event(payload: &Value) -> String {
    let thread = payload.get("thread").unwrap_or(&Value::Null);
    let item = payload.get("item").unwrap_or(&Value::Null);
    let thread_id = string_field(thread, &["id"]);
    if !thread_id.is_empty() {
        return thread_id;
    }
    string_field(item, &["threadId", "thread_id"])
}

fn runtime_turn_id_from_event(payload: &Value) -> String {
    let turn = payload.get("turn").unwrap_or(&Value::Null);
    let item = payload.get("item").unwrap_or(&Value::Null);
    let turn_id = string_field(turn, &["id"]);
    if !turn_id.is_empty() {
        return turn_id;
    }
    string_field(item, &["turnId", "turn_id"])
}

fn should_sync_session_from_runtime(event_type: &str, payload: &Value) -> bool {
    match event_type {
        "threadRenamed" | "permissionRequest" | "askUserRequest" | "exitPlanRequest"
        | "planModeStart" | "planModeEnd" | "turnCompleted" | "turnFailed" | "turnInterrupted" => {
            true
        }
        _ => {
            payload.get("permissionRequest").is_some()
                || payload.get("askUserRequest").is_some()
                || payload.get("exitPlanRequest").is_some()
        }
    }
}

fn runtime_tool_event_from_item(item: &Value) -> Option<Value> {
    let part = runtime_tool_part_from_item(item)?;
    Some(json!({
        "eventType": "tool",
        "toolId": string_field(&part, &["toolId"]),
        "label": string_field(&part, &["label"]),
        "status": string_field(&part, &["status"]),
        "context": string_field(&part, &["context"]),
        "detail": string_field(&part, &["detail"]),
        "payload": part.get("payload").cloned().unwrap_or(Value::Null),
        "transport": "codex-runtime",
    }))
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
    let runtime_messages = build_session_messages_from_runtime_snapshot(snapshot);
    next_session["messages"] = if runtime_messages.is_empty() {
        Value::Array(existing_messages)
    } else {
        Value::Array(runtime_messages)
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
    next_session["activeTurn"] = build_session_active_turn_from_runtime_snapshot(snapshot, session);
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeInterruptSessionParams {
    #[serde(default)]
    pub session: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeInterruptSessionResponse {
    pub interrupted: bool,
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeEventReduceParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub pending_assistant_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeEventReduceResponse {
    pub handled: bool,
    pub delete_session: bool,
    pub session: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimePendingSessionState {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub stop_requested: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeEventRouteParams {
    #[serde(default)]
    pub sessions: Vec<Value>,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub pending_sessions: Vec<AiRuntimePendingSessionState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeEventRouteResponse {
    pub handled: bool,
    pub delete_session_id: String,
    pub target_session_id: String,
    pub stop_requested: bool,
    pub session: Option<Value>,
}

fn find_session_by_runtime_thread_id(sessions: &[Value], thread_id: &str) -> Option<Value> {
    let normalized_thread_id = trim(thread_id);
    if normalized_thread_id.is_empty() {
        return None;
    }
    sessions
        .iter()
        .find(|session| {
            string_field(session, &["runtimeThreadId", "runtime_thread_id"]) == normalized_thread_id
        })
        .cloned()
}

#[tauri::command]
pub async fn ai_runtime_thread_snapshot_to_session(
    params: AiRuntimeThreadSnapshotToSessionParams,
) -> Result<AiRuntimeThreadSnapshotToSessionResponse, String> {
    Ok(AiRuntimeThreadSnapshotToSessionResponse {
        session: map_runtime_thread_snapshot_to_session(&params.session, &params.snapshot),
    })
}

#[tauri::command]
pub async fn ai_runtime_interrupt_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: AiRuntimeInterruptSessionParams,
) -> Result<AiRuntimeInterruptSessionResponse, String> {
    let session = params.session;
    let thread_id = string_field(&session, &["runtimeThreadId", "runtime_thread_id"]);
    if thread_id.is_empty() {
        return Ok(AiRuntimeInterruptSessionResponse {
            interrupted: false,
            thread_id,
            turn_id: String::new(),
        });
    }

    let session_turn_id = string_field(&session, &["runtimeTurnId", "runtime_turn_id"]);
    let active_turn_id = {
        let handle = state.inner().clone();
        let runtime = handle.inner.lock().await;
        runtime
            .threads
            .get(&thread_id)
            .and_then(|thread| thread.active_turn_id.clone())
            .unwrap_or_default()
    };
    let turn_id = if active_turn_id.is_empty() {
        session_turn_id
    } else {
        active_turn_id
    };
    if turn_id.is_empty() {
        return Ok(AiRuntimeInterruptSessionResponse {
            interrupted: false,
            thread_id,
            turn_id,
        });
    }

    runtime_turn_interrupt(
        app,
        state,
        RuntimeTurnInterruptParams {
            thread_id: thread_id.clone(),
            turn_id: turn_id.clone(),
        },
    )
    .await?;

    Ok(AiRuntimeInterruptSessionResponse {
        interrupted: true,
        thread_id,
        turn_id,
    })
}

async fn ai_runtime_event_reduce(
    state: State<'_, CodexRuntimeHandle>,
    params: AiRuntimeEventReduceParams,
) -> Result<AiRuntimeEventReduceResponse, String> {
    let session = params.session;
    let payload = params.payload;
    let event_type = event_type(&payload);
    let thread_id = runtime_thread_id_from_event(&payload);
    let turn_id = runtime_turn_id_from_event(&payload);

    if event_type == "threadArchived" && !thread_id.is_empty() {
        return Ok(AiRuntimeEventReduceResponse {
            handled: true,
            delete_session: true,
            session,
        });
    }

    if should_sync_session_from_runtime(&event_type, &payload) && !thread_id.is_empty() {
        let handle = CodexRuntimeHandle::from_state(state);
        let runtime = handle.inner.lock().await;
        if let Some(snapshot) = build_runtime_snapshot_value(&runtime, &thread_id) {
            return Ok(AiRuntimeEventReduceResponse {
                handled: true,
                delete_session: false,
                session: map_runtime_thread_snapshot_to_session(&session, &snapshot),
            });
        }
    }

    if event_type == "turnStarted" && !thread_id.is_empty() && !turn_id.is_empty() {
        let mut next_session = session.clone();
        next_session["runtimeThreadId"] = Value::String(thread_id);
        next_session["runtimeTurnId"] = Value::String(turn_id.clone());
        next_session["runtimeTransport"] = Value::String("codex-runtime".to_string());
        if next_session
            .get("activeTurn")
            .and_then(Value::as_object)
            .is_some()
        {
            next_session["activeTurn"]["id"] = Value::String(turn_id.clone());
            next_session["activeTurn"]["threadId"] =
                Value::String(string_field(&next_session, &["runtimeThreadId"]));
            next_session["activeTurn"]["runtimeTurnId"] = Value::String(turn_id);
            next_session["activeTurn"]["status"] = Value::String("running".to_string());
            next_session["activeTurn"]["phase"] = Value::String("executing".to_string());
            next_session["activeTurn"]["transport"] = Value::String("codex-runtime".to_string());
            next_session["activeTurn"]["updatedAt"] =
                Value::Number(chrono::Utc::now().timestamp_millis().into());
        }
        return Ok(AiRuntimeEventReduceResponse {
            handled: true,
            delete_session: false,
            session: next_session,
        });
    }

    if (event_type == "itemDelta"
        || event_type == "itemCompleted"
        || event_type == "commandOutputDelta")
        && !trim(&params.pending_assistant_id).is_empty()
    {
        let item = payload.get("item").cloned().unwrap_or(Value::Null);
        let kind = string_field(&item, &["kind"]);
        if kind == "toolCall" || kind == "toolResult" {
            if let Some(event) = runtime_tool_event_from_item(&item) {
                let response = ai_agent_session_apply_event(AiAgentSessionApplyEventParams {
                    session,
                    event,
                    pending_assistant_id: params.pending_assistant_id,
                })
                .await?;
                return Ok(AiRuntimeEventReduceResponse {
                    handled: true,
                    delete_session: false,
                    session: response.session,
                });
            }
        }
    }

    if event_type == "itemDelta" && !trim(&params.pending_assistant_id).is_empty() {
        let item = payload.get("item").cloned().unwrap_or(Value::Null);
        let kind = string_field(&item, &["kind"]);
        let text = string_field(&item, &["text"]);
        if kind == "agentMessage" || kind == "reasoning" {
            let event = json!({
                "eventType": if kind == "agentMessage" {
                    "assistant-content"
                } else {
                    "assistant-reasoning"
                },
                "text": text,
                "transport": "codex-runtime",
            });
            let response = ai_agent_session_apply_event(AiAgentSessionApplyEventParams {
                session,
                event,
                pending_assistant_id: params.pending_assistant_id,
            })
            .await?;
            return Ok(AiRuntimeEventReduceResponse {
                handled: true,
                delete_session: false,
                session: response.session,
            });
        }
    }

    Ok(AiRuntimeEventReduceResponse {
        handled: false,
        delete_session: false,
        session,
    })
}

#[tauri::command]
pub async fn ai_runtime_event_route(
    state: State<'_, CodexRuntimeHandle>,
    params: AiRuntimeEventRouteParams,
) -> Result<AiRuntimeEventRouteResponse, String> {
    let payload = params.payload;
    let event_type = event_type(&payload);
    let thread_id = runtime_thread_id_from_event(&payload);
    let Some(session) = find_session_by_runtime_thread_id(&params.sessions, &thread_id) else {
        return Ok(AiRuntimeEventRouteResponse {
            handled: false,
            delete_session_id: String::new(),
            target_session_id: String::new(),
            stop_requested: false,
            session: None,
        });
    };
    let target_session_id = string_field(&session, &["id"]);
    if target_session_id.is_empty() {
        return Ok(AiRuntimeEventRouteResponse {
            handled: false,
            delete_session_id: String::new(),
            target_session_id: String::new(),
            stop_requested: false,
            session: None,
        });
    }

    let pending_state = params
        .pending_sessions
        .iter()
        .find(|entry| trim(&entry.session_id) == target_session_id)
        .cloned();
    let reduced = ai_runtime_event_reduce(
        state,
        AiRuntimeEventReduceParams {
            session: session.clone(),
            payload,
            pending_assistant_id: pending_state
                .as_ref()
                .map(|entry| entry.pending_assistant_id.clone())
                .unwrap_or_default(),
        },
    )
    .await?;

    if reduced.handled != true {
        return Ok(AiRuntimeEventRouteResponse {
            handled: false,
            delete_session_id: String::new(),
            target_session_id,
            stop_requested: false,
            session: None,
        });
    }

    Ok(AiRuntimeEventRouteResponse {
        handled: true,
        delete_session_id: if reduced.delete_session {
            target_session_id.clone()
        } else {
            String::new()
        },
        target_session_id,
        stop_requested: event_type == "turnStarted"
            && pending_state
                .as_ref()
                .map(|entry| entry.stop_requested)
                .unwrap_or(false),
        session: if reduced.delete_session {
            None
        } else {
            Some(reduced.session)
        },
    })
}
