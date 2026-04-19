use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::codex_runtime::state::CodexRuntimeHandle;
use crate::codex_runtime::threads::{list_threads, read_thread};
use crate::research_task_runtime::find_research_task_by_thread_id;

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

fn build_default_session_title(count: usize) -> String {
    format!("Run {count}")
}

fn ensure_session_shape(session: &Value, fallback_title: &str) -> Value {
    let fallback = if fallback_title.trim().is_empty() {
        "New session".to_string()
    } else {
        fallback_title.trim().to_string()
    };
    let title = {
        let title = string_field(session, &["title"]);
        if title.is_empty() {
            fallback.clone()
        } else {
            title
        }
    };
    let id = {
        let id = string_field(session, &["id"]);
        if id.is_empty() {
            format!("runtime-session:{fallback}")
        } else {
            id
        }
    };
    let mode = {
        let mode = string_field(session, &["mode"]);
        if mode == "chat" {
            "chat".to_string()
        } else {
            "agent".to_string()
        }
    };
    let permission_mode = {
        let mode = string_field(session, &["permissionMode"]);
        if mode.is_empty() {
            "accept-edits".to_string()
        } else {
            mode
        }
    };
    let runtime_transport = {
        let transport = string_field(session, &["runtimeTransport"]);
        if transport.is_empty() {
            "codex-runtime".to_string()
        } else {
            transport
        }
    };
    let default_plan_mode = json!({
        "active": false,
        "summary": "",
        "note": "",
    });

    json!({
        "id": id,
        "mode": mode,
        "permissionMode": permission_mode,
        "runtimeThreadId": string_field(session, &["runtimeThreadId"]),
        "runtimeTurnId": string_field(session, &["runtimeTurnId"]),
        "runtimeProviderId": string_field(session, &["runtimeProviderId"]),
        "runtimeTransport": runtime_transport,
        "title": title,
        "createdAt": session.get("createdAt").cloned().unwrap_or(Value::Number(chrono::Utc::now().timestamp_millis().into())),
        "updatedAt": session.get("updatedAt").cloned().unwrap_or(Value::Number(chrono::Utc::now().timestamp_millis().into())),
        "promptDraft": session.get("promptDraft").cloned().unwrap_or(Value::String(String::new())),
        "queuedPromptDraft": session.get("queuedPromptDraft").cloned().unwrap_or(Value::String(String::new())),
        "messages": session.get("messages").cloned().unwrap_or(Value::Array(vec![])),
        "artifacts": session.get("artifacts").cloned().unwrap_or(Value::Array(vec![])),
        "attachments": session.get("attachments").cloned().unwrap_or(Value::Array(vec![])),
        "queuedAttachments": session.get("queuedAttachments").cloned().unwrap_or(Value::Array(vec![])),
        "permissionRequests": session.get("permissionRequests").cloned().unwrap_or(Value::Array(vec![])),
        "askUserRequests": session.get("askUserRequests").cloned().unwrap_or(Value::Array(vec![])),
        "exitPlanRequests": session.get("exitPlanRequests").cloned().unwrap_or(Value::Array(vec![])),
        "backgroundTasks": session.get("backgroundTasks").cloned().unwrap_or(Value::Array(vec![])),
        "isCompacting": session.get("isCompacting").cloned().unwrap_or(Value::Bool(false)),
        "lastCompactAt": session.get("lastCompactAt").cloned().unwrap_or(Value::Number(0.into())),
        "waitingResume": session.get("waitingResume").cloned().unwrap_or(Value::Bool(false)),
        "waitingResumeMessage": session.get("waitingResumeMessage").cloned().unwrap_or(Value::String(String::new())),
        "planMode": session.get("planMode").cloned().unwrap_or(default_plan_mode),
        "researchTask": session.get("researchTask").cloned().unwrap_or(Value::Null),
        "isRunning": session.get("isRunning").cloned().unwrap_or(Value::Bool(false)),
        "lastError": session.get("lastError").cloned().unwrap_or(Value::String(String::new())),
    })
}

fn apply_snapshot_to_session(
    base_session: &Value,
    snapshot: &Value,
    workspace_path: &str,
) -> Value {
    let thread = snapshot.get("thread").cloned().unwrap_or(Value::Null);
    let current_title = string_field(base_session, &["title"]);

    let mut session = ensure_session_shape(base_session, &current_title);
    session["title"] = Value::String({
        let title = string_field(&thread, &["title"]);
        if title.is_empty() {
            current_title
        } else {
            title
        }
    });
    session["runtimeThreadId"] = Value::String(string_field(&thread, &["id"]));
    session["runtimeTurnId"] = Value::String(string_field(&thread, &["activeTurnId"]));
    session["runtimeTransport"] = Value::String("codex-runtime".to_string());
    session["isRunning"] = Value::Bool(string_field(&thread, &["status"]) == "running");
    session =
        crate::ai_runtime_thread_client::map_runtime_thread_snapshot_to_session(&session, snapshot);
    let runtime_thread_id = string_field(&thread, &["id"]);
    session["researchTask"] = find_research_task_by_thread_id(workspace_path, &runtime_thread_id)
        .ok()
        .flatten()
        .and_then(|task| serde_json::to_value(task).ok())
        .unwrap_or(Value::Null);
    session
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeSessionRailReconcileParams {
    #[serde(default)]
    pub sessions: Vec<Value>,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub fallback_title: String,
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeSessionRailReconcileResponse {
    pub sessions: Vec<Value>,
    pub current_session_id: String,
}

#[tauri::command]
pub async fn ai_runtime_session_rail_reconcile(
    state: State<'_, CodexRuntimeHandle>,
    params: AiRuntimeSessionRailReconcileParams,
) -> Result<AiRuntimeSessionRailReconcileResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let runtime = handle.inner.lock().await;
    let runtime_threads = list_threads(&runtime);
    let mut runtime_thread_map = runtime_threads
        .iter()
        .map(|thread| (thread.id.clone(), thread.clone()))
        .collect::<std::collections::HashMap<_, _>>();

    let mut filtered_sessions = params
        .sessions
        .iter()
        .filter(|session| {
            let runtime_thread_id = string_field(session, &["runtimeThreadId"]);
            runtime_thread_id.is_empty() || runtime_thread_map.contains_key(&runtime_thread_id)
        })
        .cloned()
        .collect::<Vec<_>>();

    for index in 0..filtered_sessions.len() {
        let session = filtered_sessions[index].clone();
        let runtime_thread_id = string_field(&session, &["runtimeThreadId"]);
        if runtime_thread_id.is_empty() {
            continue;
        }
        let Some(thread) = runtime_thread_map.remove(&runtime_thread_id) else {
            continue;
        };
        let snapshot = read_thread(&runtime, &thread.id)?.snapshot;
        filtered_sessions[index] =
            apply_snapshot_to_session(&session, &json!(snapshot), &params.workspace_path);
    }

    if filtered_sessions.is_empty() {
        filtered_sessions.push(ensure_session_shape(&json!({}), &{
            let title = if params.fallback_title.trim().is_empty() {
                build_default_session_title(1)
            } else {
                params.fallback_title.clone()
            };
            title
        }));
    }

    let current_session_id = {
        let requested = trim(&params.current_session_id);
        if filtered_sessions
            .iter()
            .any(|session| string_field(session, &["id"]) == requested)
        {
            requested
        } else {
            string_field(&filtered_sessions[0], &["id"])
        }
    };

    Ok(AiRuntimeSessionRailReconcileResponse {
        sessions: filtered_sessions,
        current_session_id,
    })
}
