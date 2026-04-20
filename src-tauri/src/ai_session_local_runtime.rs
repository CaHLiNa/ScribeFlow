use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionLocalMutationParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionStateNormalizeParams {
    #[serde(default)]
    pub sessions: Vec<Value>,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub fallback_title: String,
}

fn string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn bool_field(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn number_field(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(0)
}

fn array_entries(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn normalize_background_task_status(status: &str) -> &'static str {
    match status.trim().to_lowercase().as_str() {
        "failed" | "error" => "error",
        "done" | "completed" | "stopped" => "done",
        _ => "running",
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn normalize_mode(mode: &str) -> &'static str {
    if mode.trim() == "chat" {
        "chat"
    } else {
        "agent"
    }
}

fn normalize_permission_mode(value: &str) -> &'static str {
    match value.trim() {
        "plan" => "plan",
        "acceptEdits" | "accept-edits" | "per-tool" => "accept-edits",
        "bypassPermissions" | "bypass-permissions" | "auto" => "bypass-permissions",
        _ => "accept-edits",
    }
}

fn create_session_id() -> String {
    format!("ai-session:{}", Uuid::new_v4())
}

fn normalize_plan_mode(value: &Value) -> Value {
    json!({
        "active": bool_field(value, "active"),
        "summary": string_field(value, "summary").trim(),
        "note": string_field(value, "note").trim(),
    })
}

fn normalize_research_task(task: &Value) -> Value {
    if !task.is_object() {
        return Value::Null;
    }

    let id = string_field(task, "id");
    let title = string_field(task, "title");
    if id.trim().is_empty() && title.trim().is_empty() {
        return Value::Null;
    }

    json!({
        "id": id.trim(),
        "kind": string_field(task, "kind").trim(),
        "title": title.trim(),
        "goal": string_field(task, "goal").trim(),
        "status": string_field(task, "status").trim(),
        "phase": string_field(task, "phase").trim(),
        "artifactIds": task.get("artifactIds").cloned().unwrap_or(Value::Array(Vec::new())),
        "evidenceIds": task.get("evidenceIds").cloned().unwrap_or(Value::Array(Vec::new())),
        "referenceIds": task.get("referenceIds").cloned().unwrap_or(Value::Array(Vec::new())),
        "verificationVerdict": string_field(task, "verificationVerdict").trim(),
        "verificationSummary": string_field(task, "verificationSummary").trim(),
        "blockedReason": string_field(task, "blockedReason").trim(),
        "resumeHint": string_field(task, "resumeHint").trim(),
        "runtimeThreadId": string_field(task, "runtimeThreadId").trim(),
    })
}

fn normalize_research_evidence(entries: &Value) -> Value {
    let evidence = entries
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let id = string_field(&entry, "id");
            let label = string_field(&entry, "label");
            if id.trim().is_empty() && label.trim().is_empty() {
                return None;
            }
            Some(json!({
                "id": id.trim(),
                "taskId": string_field(&entry, "taskId").trim(),
                "sourceType": string_field(&entry, "sourceType").trim(),
                "label": label.trim(),
                "sourcePath": string_field(&entry, "sourcePath").trim(),
                "sourceRange": string_field(&entry, "sourceRange").trim(),
                "referenceId": string_field(&entry, "referenceId").trim(),
                "citationKey": string_field(&entry, "citationKey").trim(),
                "excerpt": string_field(&entry, "excerpt").trim(),
                "confidence": entry.get("confidence").and_then(Value::as_f64).unwrap_or(0.0),
                "whyRelevant": string_field(&entry, "whyRelevant").trim(),
                "updatedAt": number_field(&entry, "updatedAt"),
            }))
        })
        .collect::<Vec<_>>();
    Value::Array(evidence)
}

fn normalize_research_verifications(entries: &Value) -> Value {
    let verifications = entries
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let id = string_field(&entry, "id");
            let summary = string_field(&entry, "summary");
            if id.trim().is_empty() && summary.trim().is_empty() {
                return None;
            }
            Some(json!({
                "id": id.trim(),
                "taskId": string_field(&entry, "taskId").trim(),
                "artifactId": string_field(&entry, "artifactId").trim(),
                "kind": string_field(&entry, "kind").trim(),
                "status": string_field(&entry, "status").trim(),
                "summary": summary.trim(),
                "details": entry.get("details").cloned().unwrap_or(Value::Array(Vec::new())),
                "blocking": bool_field(&entry, "blocking"),
                "updatedAt": number_field(&entry, "updatedAt"),
            }))
        })
        .collect::<Vec<_>>();
    Value::Array(verifications)
}

fn normalize_active_turn(turn: &Value) -> Value {
    if !turn.is_object() {
        return Value::Null;
    }

    let id = string_field(turn, "id");
    let status = string_field(turn, "status");
    if id.trim().is_empty() && status.trim().is_empty() {
        return Value::Null;
    }

    json!({
        "id": id.trim(),
        "threadId": string_field(turn, "threadId").trim(),
        "runtimeTurnId": string_field(turn, "runtimeTurnId").trim(),
        "status": status.trim(),
        "phase": string_field(turn, "phase").trim(),
        "label": string_field(turn, "label").trim(),
        "summary": string_field(turn, "summary").trim(),
        "userInstruction": string_field(turn, "userInstruction").trim(),
        "pendingAssistantId": string_field(turn, "pendingAssistantId").trim(),
        "pendingRequestKind": string_field(turn, "pendingRequestKind").trim(),
        "pendingRequestId": string_field(turn, "pendingRequestId").trim(),
        "pendingRequestCount": number_field(turn, "pendingRequestCount").max(0),
        "lastToolName": string_field(turn, "lastToolName").trim(),
        "transport": string_field(turn, "transport").trim(),
        "route": turn.get("route").cloned().unwrap_or(Value::Null),
        "startedAt": number_field(turn, "startedAt").max(0),
        "updatedAt": number_field(turn, "updatedAt").max(0),
    })
}

fn normalize_session(session: &Value, fallback_title: &str) -> Value {
    let fallback = if fallback_title.trim().is_empty() {
        "New session"
    } else {
        fallback_title.trim()
    };
    let created_at = {
        let value = number_field(session, "createdAt");
        if value > 0 {
            value
        } else {
            now_ms()
        }
    };
    let updated_at = {
        let value = number_field(session, "updatedAt");
        if value > 0 {
            value
        } else {
            created_at
        }
    };
    let title = {
        let value = string_field(session, "title");
        if value.trim().is_empty() {
            fallback.to_string()
        } else {
            value.trim().to_string()
        }
    };
    let session_id = {
        let value = string_field(session, "id");
        if value.trim().is_empty() {
            create_session_id()
        } else {
            value.trim().to_string()
        }
    };
    let permission_mode = {
        let permission_mode = string_field(session, "permissionMode");
        if permission_mode.is_empty() {
            let runtime_permission_mode = string_field(session, "runtimePermissionMode");
            if runtime_permission_mode.is_empty() {
                string_field(session, "approvalMode")
            } else {
                runtime_permission_mode
            }
        } else {
            permission_mode
        }
    };

    json!({
        "id": session_id,
        "mode": normalize_mode(&string_field(session, "mode")),
        "permissionMode": normalize_permission_mode(&permission_mode),
        "runtimeThreadId": string_field(session, "runtimeThreadId").trim(),
        "runtimeTurnId": string_field(session, "runtimeTurnId").trim(),
        "runtimeProviderId": string_field(session, "runtimeProviderId").trim(),
        "runtimeTransport": string_field(session, "runtimeTransport").trim(),
        "title": title,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "promptDraft": string_field(session, "promptDraft"),
        "queuedPromptDraft": string_field(session, "queuedPromptDraft"),
        "messages": session.get("messages").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "artifacts": session.get("artifacts").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "attachments": session.get("attachments").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "queuedAttachments": session.get("queuedAttachments").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "permissionRequests": session.get("permissionRequests").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "askUserRequests": session.get("askUserRequests").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "exitPlanRequests": session.get("exitPlanRequests").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "backgroundTasks": session.get("backgroundTasks").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "isCompacting": bool_field(session, "isCompacting"),
        "lastCompactAt": number_field(session, "lastCompactAt").max(0),
        "waitingResume": bool_field(session, "waitingResume"),
        "waitingResumeMessage": string_field(session, "waitingResumeMessage"),
        "planMode": normalize_plan_mode(session.get("planMode").unwrap_or(&Value::Null)),
        "activeTurn": normalize_active_turn(session.get("activeTurn").unwrap_or(&Value::Null)),
        "researchTask": normalize_research_task(session.get("researchTask").unwrap_or(&Value::Null)),
        "researchEvidence": normalize_research_evidence(session.get("researchEvidence").unwrap_or(&Value::Null)),
        "researchVerifications": normalize_research_verifications(session.get("researchVerifications").unwrap_or(&Value::Null)),
        "isRunning": bool_field(session, "isRunning"),
        "lastError": string_field(session, "lastError"),
    })
}

fn ensure_sessions_state(
    sessions: &[Value],
    current_session_id: &str,
    fallback_title: &str,
) -> Value {
    let normalized_sessions = sessions
        .iter()
        .filter(|session| {
            !string_field(session, "id")
                .trim()
                .starts_with("runtime-session:")
        })
        .map(|session| normalize_session(session, fallback_title))
        .collect::<Vec<_>>();

    if normalized_sessions.is_empty() {
        let initial = normalize_session(&json!({}), fallback_title);
        let current_session_id = string_field(&initial, "id");
        return json!({
            "currentSessionId": current_session_id,
            "sessions": [initial],
        });
    }

    let normalized_current_session_id = current_session_id.trim().to_string();
    let resolved_current_session_id = if normalized_sessions
        .iter()
        .any(|session| string_field(session, "id") == normalized_current_session_id)
    {
        normalized_current_session_id
    } else {
        normalized_sessions
            .first()
            .map(|session| string_field(session, "id"))
            .unwrap_or_default()
    };

    json!({
        "currentSessionId": resolved_current_session_id,
        "sessions": normalized_sessions,
    })
}

fn find_background_task_index(tasks: &[Value], task: &Value) -> Option<usize> {
    let normalized_id = string_field(task, "id");
    let normalized_task_id = string_field(task, "taskId");
    let normalized_tool_use_id = {
        let tool_use_id = string_field(task, "toolUseId");
        if tool_use_id.is_empty() {
            let tool_id = string_field(task, "toolId");
            if tool_id.is_empty() {
                string_field(task, "id")
            } else {
                tool_id
            }
        } else {
            tool_use_id
        }
    };

    tasks.iter().position(|entry| {
        (!normalized_task_id.is_empty() && string_field(entry, "taskId") == normalized_task_id)
            || (!normalized_tool_use_id.is_empty()
                && string_field(entry, "toolUseId") == normalized_tool_use_id)
            || (!normalized_id.is_empty() && string_field(entry, "id") == normalized_id)
    })
}

fn build_background_task_record(task: &Value, previous: Option<&Value>) -> Value {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let task_id = {
        let value = string_field(task, "taskId");
        if value.is_empty() {
            previous
                .map(|entry| string_field(entry, "taskId"))
                .unwrap_or_default()
        } else {
            value
        }
    };
    let tool_use_id = {
        let direct = string_field(task, "toolUseId");
        if !direct.is_empty() {
            direct
        } else {
            let fallback = string_field(task, "toolId");
            if !fallback.is_empty() {
                fallback
            } else {
                previous
                    .map(|entry| string_field(entry, "toolUseId"))
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| string_field(task, "id"))
            }
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
        let direct = string_field(task, "detail");
        if !direct.is_empty() {
            direct
        } else {
            let fallback = string_field(task, "description");
            if !fallback.is_empty() {
                fallback
            } else {
                let summary = string_field(task, "summary");
                if !summary.is_empty() {
                    summary
                } else {
                    previous
                        .map(|entry| string_field(entry, "detail"))
                        .unwrap_or_default()
                }
            }
        }
    };
    let usage = task
        .get("usage")
        .filter(|value| value.is_object())
        .cloned()
        .or_else(|| previous.and_then(|entry| entry.get("usage").cloned()))
        .unwrap_or(Value::Null);
    let elapsed_seconds = task
        .get("elapsedSeconds")
        .and_then(Value::as_i64)
        .or_else(|| previous.and_then(|entry| entry.get("elapsedSeconds").and_then(Value::as_i64)))
        .unwrap_or(0)
        .max(0);
    let label = {
        let direct = string_field(task, "label");
        if !direct.is_empty() {
            direct
        } else {
            let title = string_field(task, "title");
            if !title.is_empty() {
                title
            } else {
                let prev = previous
                    .map(|entry| string_field(entry, "label"))
                    .unwrap_or_default();
                if !prev.is_empty() {
                    prev
                } else {
                    let last_tool_name = string_field(task, "lastToolName");
                    if !last_tool_name.is_empty() {
                        last_tool_name
                    } else {
                        let task_type = string_field(task, "taskType");
                        if !task_type.is_empty() {
                            task_type
                        } else if !tool_use_id.is_empty() {
                            tool_use_id.clone()
                        } else if !task_id.is_empty() {
                            task_id.clone()
                        } else {
                            "Background task".to_string()
                        }
                    }
                }
            }
        }
    };
    let status_source = {
        let direct = string_field(task, "status");
        if !direct.is_empty() {
            direct
        } else if let Some(previous) = previous {
            string_field(previous, "status")
        } else {
            "running".to_string()
        }
    };
    let task_type = {
        let direct = string_field(task, "taskType");
        if !direct.is_empty() {
            direct
        } else {
            previous
                .map(|entry| string_field(entry, "taskType"))
                .unwrap_or_default()
        }
    };
    let last_tool_name = {
        let direct = string_field(task, "lastToolName");
        if !direct.is_empty() {
            direct
        } else {
            previous
                .map(|entry| string_field(entry, "lastToolName"))
                .unwrap_or_default()
        }
    };
    let output_file = {
        let direct = string_field(task, "outputFile");
        if !direct.is_empty() {
            direct
        } else {
            previous
                .map(|entry| string_field(entry, "outputFile"))
                .unwrap_or_default()
        }
    };

    json!({
        "id": record_id,
        "taskId": task_id,
        "toolUseId": tool_use_id,
        "label": label,
        "status": normalize_background_task_status(&status_source),
        "detail": detail,
        "taskType": task_type,
        "lastToolName": last_tool_name,
        "outputFile": output_file,
        "elapsedSeconds": elapsed_seconds,
        "usage": usage,
        "updatedAt": now_ms,
    })
}

fn mutate_session(session: &Value, kind: &str, payload: &Value) -> Value {
    let mut next = session.clone();
    let object = next.as_object_mut().expect("session object");

    match kind {
        "setPromptDraft" => {
            object.insert(
                "promptDraft".to_string(),
                Value::String(string_field(payload, "value")),
            );
        }
        "clearSession" => {
            object.insert("promptDraft".to_string(), Value::String(String::new()));
            object.insert(
                "queuedPromptDraft".to_string(),
                Value::String(String::new()),
            );
            object.insert("messages".to_string(), Value::Array(Vec::new()));
            object.insert("artifacts".to_string(), Value::Array(Vec::new()));
            object.insert("attachments".to_string(), Value::Array(Vec::new()));
            object.insert("queuedAttachments".to_string(), Value::Array(Vec::new()));
            object.insert("lastError".to_string(), Value::String(String::new()));
            object.insert("isRunning".to_string(), Value::Bool(false));
            object.insert("permissionRequests".to_string(), Value::Array(Vec::new()));
            object.insert("askUserRequests".to_string(), Value::Array(Vec::new()));
            object.insert("exitPlanRequests".to_string(), Value::Array(Vec::new()));
            object.insert("backgroundTasks".to_string(), Value::Array(Vec::new()));
            object.insert("isCompacting".to_string(), Value::Bool(false));
            object.insert("lastCompactAt".to_string(), Value::from(0));
            object.insert("waitingResume".to_string(), Value::Bool(false));
            object.insert(
                "waitingResumeMessage".to_string(),
                Value::String(String::new()),
            );
            object.insert(
                "planMode".to_string(),
                json!({"active": false, "summary": "", "note": ""}),
            );
        }
        "addAttachment" => {
            let attachment = payload.get("attachment").cloned().unwrap_or(Value::Null);
            let attachment_path = string_field(&attachment, "path");
            let attachments = array_entries(session, "attachments")
                .into_iter()
                .filter(|entry| string_field(entry, "path") != attachment_path)
                .chain(std::iter::once(attachment))
                .collect::<Vec<_>>();
            object.insert("attachments".to_string(), Value::Array(attachments));
        }
        "removeAttachment" => {
            let attachment_id = string_field(payload, "attachmentId");
            let attachments = array_entries(session, "attachments")
                .into_iter()
                .filter(|entry| string_field(entry, "id") != attachment_id)
                .collect::<Vec<_>>();
            object.insert("attachments".to_string(), Value::Array(attachments));
        }
        "clearAttachments" => {
            object.insert("attachments".to_string(), Value::Array(Vec::new()));
        }
        "queueSubmission" => {
            let prompt_draft = string_field(session, "promptDraft");
            let queued_prompt_draft = string_field(session, "queuedPromptDraft");
            let attachments = array_entries(session, "attachments");
            if prompt_draft.trim().is_empty() && attachments.is_empty() {
                return next;
            }
            let merged_prompt = [queued_prompt_draft, prompt_draft]
                .into_iter()
                .filter(|value| !value.trim().is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            let mut queued_attachments = array_entries(session, "queuedAttachments");
            for attachment in attachments {
                let attachment_id = string_field(&attachment, "id");
                if !queued_attachments
                    .iter()
                    .any(|entry| string_field(entry, "id") == attachment_id)
                {
                    queued_attachments.push(attachment);
                }
            }
            object.insert("promptDraft".to_string(), Value::String(String::new()));
            object.insert("attachments".to_string(), Value::Array(Vec::new()));
            object.insert(
                "queuedPromptDraft".to_string(),
                Value::String(merged_prompt),
            );
            object.insert(
                "queuedAttachments".to_string(),
                Value::Array(queued_attachments),
            );
        }
        "dequeueSubmission" => {
            let queued_prompt_draft = string_field(session, "queuedPromptDraft");
            let queued_attachments = array_entries(session, "queuedAttachments");
            if queued_prompt_draft.trim().is_empty() && queued_attachments.is_empty() {
                return next;
            }
            object.insert(
                "promptDraft".to_string(),
                Value::String(queued_prompt_draft),
            );
            object.insert("attachments".to_string(), Value::Array(queued_attachments));
            object.insert(
                "queuedPromptDraft".to_string(),
                Value::String(String::new()),
            );
            object.insert("queuedAttachments".to_string(), Value::Array(Vec::new()));
        }
        "queueAskUserRequest" => {
            let request_id = string_field(payload, "requestId");
            if request_id.is_empty() {
                return next;
            }
            let prompt = {
                let prompt = string_field(payload, "prompt");
                if prompt.is_empty() {
                    string_field(payload, "question")
                } else {
                    prompt
                }
            };
            let next_request = json!({
                "requestId": request_id,
                "streamId": string_field(payload, "streamId"),
                "title": string_field(payload, "title"),
                "prompt": prompt,
                "description": string_field(payload, "description"),
                "questions": payload.get("questions").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
                "runtimeManaged": bool_field(payload, "runtimeManaged"),
            });
            let requests = array_entries(session, "askUserRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .chain(std::iter::once(next_request))
                .collect::<Vec<_>>();
            object.insert("askUserRequests".to_string(), Value::Array(requests));
        }
        "clearAskUserRequest" => {
            let request_id = string_field(payload, "requestId");
            let requests = array_entries(session, "askUserRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .collect::<Vec<_>>();
            object.insert("askUserRequests".to_string(), Value::Array(requests));
        }
        "queueExitPlanRequest" => {
            let request_id = string_field(payload, "requestId");
            if request_id.is_empty() {
                return next;
            }
            let next_request = json!({
                "requestId": request_id,
                "streamId": string_field(payload, "streamId"),
                "toolUseId": string_field(payload, "toolUseId"),
                "title": string_field(payload, "title"),
                "allowedPrompts": payload.get("allowedPrompts").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
                "runtimeManaged": bool_field(payload, "runtimeManaged"),
            });
            let requests = array_entries(session, "exitPlanRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .chain(std::iter::once(next_request))
                .collect::<Vec<_>>();
            object.insert("exitPlanRequests".to_string(), Value::Array(requests));
        }
        "clearExitPlanRequest" => {
            let request_id = string_field(payload, "requestId");
            let requests = array_entries(session, "exitPlanRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .collect::<Vec<_>>();
            object.insert("exitPlanRequests".to_string(), Value::Array(requests));
        }
        "setPlanModeState" => {
            object.insert(
                "planMode".to_string(),
                json!({
                    "active": bool_field(payload, "active"),
                    "summary": string_field(payload, "summary").trim(),
                    "note": string_field(payload, "note").trim(),
                }),
            );
        }
        "setWaitingResumeState" => {
            let active = bool_field(payload, "active");
            object.insert("waitingResume".to_string(), Value::Bool(active));
            object.insert(
                "waitingResumeMessage".to_string(),
                Value::String(if active {
                    string_field(payload, "message").trim().to_string()
                } else {
                    String::new()
                }),
            );
        }
        "setCompactionState" => {
            let active = bool_field(payload, "active");
            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or(0);
            object.insert("isCompacting".to_string(), Value::Bool(active));
            object.insert(
                "lastCompactAt".to_string(),
                Value::from(if active {
                    number_field(session, "lastCompactAt")
                } else {
                    now_ms
                }),
            );
        }
        "upsertBackgroundTask" => {
            let task = payload.get("task").cloned().unwrap_or(Value::Null);
            let mut entries = array_entries(session, "backgroundTasks");
            let existing_index = find_background_task_index(&entries, &task);
            let previous = existing_index.and_then(|index| entries.get(index).cloned());
            let next_task = build_background_task_record(&task, previous.as_ref());
            if string_field(&next_task, "id").is_empty() {
                return next;
            }
            if let Some(index) = existing_index {
                entries.splice(index..=index, [next_task]);
            } else {
                entries.push(next_task);
            }
            entries.sort_by(|left, right| {
                number_field(right, "updatedAt").cmp(&number_field(left, "updatedAt"))
            });
            entries.truncate(12);
            object.insert("backgroundTasks".to_string(), Value::Array(entries));
        }
        "clearBackgroundTask" => {
            let task_id = string_field(payload, "taskId");
            let entries = array_entries(session, "backgroundTasks")
                .into_iter()
                .filter(|entry| string_field(entry, "id") != task_id)
                .collect::<Vec<_>>();
            object.insert("backgroundTasks".to_string(), Value::Array(entries));
        }
        "queuePermissionRequest" => {
            let request_id = {
                let direct = string_field(payload, "requestId");
                if direct.is_empty() {
                    string_field(payload, "toolUseId")
                } else {
                    direct
                }
            };
            let stream_id = string_field(payload, "streamId");
            let runtime_managed = bool_field(payload, "runtimeManaged");
            if request_id.is_empty() || (stream_id.is_empty() && !runtime_managed) {
                return next;
            }
            let display_name = {
                let direct = string_field(payload, "displayName");
                if direct.is_empty() {
                    string_field(payload, "toolName")
                } else {
                    direct
                }
            };
            let next_request = json!({
                "requestId": request_id,
                "streamId": stream_id,
                "toolName": string_field(payload, "toolName"),
                "displayName": display_name,
                "title": string_field(payload, "title"),
                "description": string_field(payload, "description"),
                "decisionReason": string_field(payload, "decisionReason"),
                "inputPreview": string_field(payload, "inputPreview"),
                "runtimeManaged": runtime_managed,
            });
            let requests = array_entries(session, "permissionRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .chain(std::iter::once(next_request))
                .collect::<Vec<_>>();
            object.insert("permissionRequests".to_string(), Value::Array(requests));
        }
        "clearPermissionRequest" => {
            let request_id = string_field(payload, "requestId");
            let requests = array_entries(session, "permissionRequests")
                .into_iter()
                .filter(|entry| string_field(entry, "requestId") != request_id)
                .collect::<Vec<_>>();
            object.insert("permissionRequests".to_string(), Value::Array(requests));
        }
        _ => {}
    }

    normalize_session(&next, &string_field(session, "title"))
}

#[tauri::command]
pub async fn ai_session_local_mutate(
    params: AiSessionLocalMutationParams,
) -> Result<Value, String> {
    Ok(json!({
        "session": mutate_session(&params.session, &params.kind, &params.payload),
    }))
}

#[tauri::command]
pub async fn ai_session_state_normalize(
    params: AiSessionStateNormalizeParams,
) -> Result<Value, String> {
    Ok(ensure_sessions_state(
        &params.sessions,
        &params.current_session_id,
        &params.fallback_title,
    ))
}
