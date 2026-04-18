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
    let workspace_context_marker = "\n\nWorkspace context:";
    if let Some(task_start) = normalized.find(current_task_prefix) {
        let task_body = &normalized[task_start + current_task_prefix.len()..];
        let task_body = if let Some(context_start) = task_body.find(workspace_context_marker) {
            &task_body[..context_start]
        } else {
            task_body
        };
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

fn build_runtime_snapshot_value(
    runtime: &CodexRuntimeState,
    thread_id: &str,
) -> Option<Value> {
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
        "threadRenamed"
        | "permissionRequest"
        | "askUserRequest"
        | "exitPlanRequest"
        | "planModeStart"
        | "planModeEnd"
        | "turnCompleted"
        | "turnFailed"
        | "turnInterrupted" => true,
        _ => payload.get("permissionRequest").is_some()
            || payload.get("askUserRequest").is_some()
            || payload.get("exitPlanRequest").is_some(),
    }
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
        .find(|session| string_field(session, &["runtimeThreadId", "runtime_thread_id"]) == normalized_thread_id)
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
        next_session["runtimeTurnId"] = Value::String(turn_id);
        next_session["runtimeTransport"] = Value::String("codex-runtime".to_string());
        return Ok(AiRuntimeEventReduceResponse {
            handled: true,
            delete_session: false,
            session: next_session,
        });
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
