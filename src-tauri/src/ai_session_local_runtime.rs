use serde::Deserialize;
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

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

    next
}

#[tauri::command]
pub async fn ai_session_local_mutate(
    params: AiSessionLocalMutationParams,
) -> Result<Value, String> {
    Ok(json!({
        "session": mutate_session(&params.session, &params.kind, &params.payload),
    }))
}
