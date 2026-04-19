use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Runtime};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::sleep;
use url::Url;

use super::approvals::request_permission;
use super::events::emit_runtime_event;
use super::protocol::{
    ItemKind, RuntimePermissionRequestParams, RuntimeProviderConfig, RuntimeTurnRunParams,
    RuntimeTurnRunResponse, ThreadStatus, TurnStatus,
};
use super::state::{CodexRuntimeHandle, CodexRuntimeState};
use super::storage::persist_runtime_state;
use super::tools::{
    build_apply_patch_result, build_exec_command_result, execute_prepared_apply_patch,
    execute_prepared_exec_command, execute_prepared_write_stdin,
    execute_runtime_tool_call_with_context, is_apply_patch_tool_call, is_exec_command_tool_call,
    is_write_stdin_tool_call, poll_exec_session_updates, prepare_apply_patch_tool_call,
    prepare_exec_command_tool_call, prepare_write_stdin_tool_call,
    resolve_runtime_tool_definitions_with_context, RuntimeToolCall, RuntimeToolResult,
};
use super::turns::{build_runtime_item, start_turn};

type RuntimeTaskMap = Mutex<HashMap<String, JoinHandle<()>>>;
pub(crate) const MAX_TOOL_ROUNDS: usize = 6;

static RUNTIME_TURN_TASKS: OnceLock<RuntimeTaskMap> = OnceLock::new();

fn runtime_turn_tasks() -> &'static RuntimeTaskMap {
    RUNTIME_TURN_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn normalize_openai_base_url(base_url: &str) -> String {
    base_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches("/chat/completions")
        .to_string()
}

fn normalize_anthropic_base_url(base_url: &str) -> String {
    let mut url = base_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches("/messages")
        .to_string();
    if !url.ends_with("/v1") {
        url = format!("{url}/v1");
    }
    url
}

fn normalize_google_base_url(base_url: &str) -> String {
    base_url
        .trim()
        .trim_end_matches('/')
        .trim_end_matches("/v1beta/openai")
        .trim_end_matches("/v1beta")
        .to_string()
}

fn build_headers(values: &[(&str, String)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (key, value) in values {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|error| format!("Invalid header name {key}: {error}"))?;
        let value = HeaderValue::from_str(value)
            .map_err(|error| format!("Invalid header value for {key}: {error}"))?;
        map.insert(name, value);
    }
    Ok(map)
}

#[derive(Debug, Clone)]
pub(crate) enum RuntimeContinuationMessage {
    Assistant {
        content: String,
        tool_calls: Vec<RuntimeToolCall>,
    },
    ToolResults {
        results: Vec<RuntimeToolResult>,
    },
}

#[derive(Debug, Clone)]
pub(crate) enum RuntimeProviderEvent {
    AssistantDelta(String),
    ReasoningDelta(String),
    ToolCallStart {
        tool_call_id: String,
        tool_name: String,
    },
    ToolCallDelta {
        tool_call_id: String,
        arguments_delta: String,
    },
    StopReason(String),
}

#[derive(Debug, Clone)]
pub(crate) struct PendingToolCall {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments: String,
}

pub(crate) fn build_provider_request(
    provider: &RuntimeProviderConfig,
    history: &[(String, String)],
    user_text: &str,
    tool_definitions: &[super::tools::RuntimeToolDefinition],
    continuation_messages: &[RuntimeContinuationMessage],
) -> Result<(Url, HeaderMap, String), String> {
    let provider_id = provider.provider_id.trim().to_lowercase();
    let encoded_api_key = url::form_urlencoded::byte_serialize(provider.api_key.trim().as_bytes())
        .collect::<String>();
    let url = match provider_id.as_str() {
        "anthropic" => format!(
            "{}/messages",
            normalize_anthropic_base_url(&provider.base_url)
        ),
        "google" => format!(
            "{}/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            normalize_google_base_url(&provider.base_url),
            provider.model.trim(),
            encoded_api_key
        ),
        _ => format!(
            "{}/chat/completions",
            normalize_openai_base_url(&provider.base_url)
        ),
    };

    let parsed_url = Url::parse(&url).map_err(|error| format!("Invalid provider URL: {error}"))?;
    let body = match provider_id.as_str() {
        "anthropic" => {
            let mut messages = history
                .iter()
                .map(|(role, content)| {
                    json!({
                        "role": if role == "assistant" { "assistant" } else { "user" },
                        "content": content,
                    })
                })
                .collect::<Vec<_>>();
            messages.push(json!({
                "role": "user",
                "content": user_text,
            }));
            for message in continuation_messages {
                match message {
                    RuntimeContinuationMessage::Assistant {
                        content,
                        tool_calls,
                    } => {
                        let mut blocks = Vec::new();
                        if !content.trim().is_empty() {
                            blocks.push(json!({
                                "type": "text",
                                "text": content,
                            }));
                        }
                        for tool_call in tool_calls {
                            blocks.push(json!({
                                "type": "tool_use",
                                "id": tool_call.id,
                                "name": tool_call.name,
                                "input": tool_call.arguments,
                            }));
                        }
                        messages.push(json!({
                            "role": "assistant",
                            "content": blocks,
                        }));
                    }
                    RuntimeContinuationMessage::ToolResults { results } => {
                        messages.push(json!({
                            "role": "user",
                            "content": results
                                .iter()
                                .map(|result| json!({
                                    "type": "tool_result",
                                    "tool_use_id": result.tool_call_id,
                                    "content": result.content,
                                    "is_error": result.is_error,
                                }))
                                .collect::<Vec<_>>(),
                        }));
                    }
                }
            }

            let mut payload = json!({
                "model": provider.model.trim(),
                "max_tokens": provider.max_tokens.unwrap_or(4096),
                "messages": messages,
                "stream": true,
            });
            if !provider.system_prompt.trim().is_empty() {
                payload["system"] = Value::String(provider.system_prompt.trim().to_string());
            }
            if !tool_definitions.is_empty() {
                payload["tools"] = Value::Array(
                    tool_definitions
                        .iter()
                        .map(|tool| {
                            json!({
                                "name": tool.name,
                                "description": tool.description,
                                "input_schema": tool.parameters,
                            })
                        })
                        .collect(),
                );
            }
            serde_json::to_string(&payload)
                .map_err(|error| format!("Failed to serialize Anthropic payload: {error}"))?
        }
        "google" => {
            let mut contents = history
                .iter()
                .map(|(role, content)| {
                    json!({
                        "role": if role == "assistant" { "model" } else { "user" },
                        "parts": [{ "text": content }],
                    })
                })
                .collect::<Vec<_>>();
            contents.push(json!({
                "role": "user",
                "parts": [{ "text": user_text }],
            }));

            let mut payload = json!({
                "contents": contents
            });
            if !provider.system_prompt.trim().is_empty() {
                payload["systemInstruction"] = json!({
                    "parts": [{ "text": provider.system_prompt.trim() }]
                });
            }
            serde_json::to_string(&payload)
                .map_err(|error| format!("Failed to serialize Google payload: {error}"))?
        }
        _ => {
            let mut messages = history
                .iter()
                .map(|(role, content)| {
                    json!({
                        "role": role,
                        "content": content,
                    })
                })
                .collect::<Vec<_>>();
            messages.push(json!({
                "role": "user",
                "content": user_text,
            }));
            for message in continuation_messages {
                match message {
                    RuntimeContinuationMessage::Assistant {
                        content,
                        tool_calls,
                    } => {
                        messages.push(json!({
                            "role": "assistant",
                            "content": if content.trim().is_empty() { Value::Null } else { Value::String(content.clone()) },
                            "tool_calls": tool_calls
                                .iter()
                                .map(|tool_call| json!({
                                    "id": tool_call.id,
                                    "type": "function",
                                    "function": {
                                        "name": tool_call.name,
                                        "arguments": tool_call.arguments,
                                    }
                                }))
                                .collect::<Vec<_>>(),
                        }));
                    }
                    RuntimeContinuationMessage::ToolResults { results } => {
                        for result in results {
                            messages.push(json!({
                                "role": "tool",
                                "content": result.content,
                                "tool_call_id": result.tool_call_id,
                            }));
                        }
                    }
                }
            }

            let mut payload = json!({
                "model": provider.model.trim(),
                "messages": messages,
                "stream": true,
                "temperature": provider.temperature.unwrap_or(0.2),
            });
            if !tool_definitions.is_empty() {
                payload["tools"] = Value::Array(
                    tool_definitions
                        .iter()
                        .map(|tool| {
                            json!({
                                "type": "function",
                                "function": {
                                    "name": tool.name,
                                    "description": tool.description,
                                    "parameters": tool.parameters,
                                }
                            })
                        })
                        .collect(),
                );
            }
            if !provider.system_prompt.trim().is_empty() {
                let mut system_messages = vec![json!({
                    "role": "system",
                    "content": provider.system_prompt.trim(),
                })];
                system_messages.extend(payload["messages"].as_array().cloned().unwrap_or_default());
                payload["messages"] = Value::Array(system_messages);
            }
            serde_json::to_string(&payload)
                .map_err(|error| format!("Failed to serialize OpenAI payload: {error}"))?
        }
    };

    let headers = match provider_id.as_str() {
        "anthropic" => build_headers(&[
            ("x-api-key", provider.api_key.trim().to_string()),
            (
                "authorization",
                format!("Bearer {}", provider.api_key.trim()),
            ),
            ("anthropic-version", "2023-06-01".to_string()),
            ("content-type", "application/json".to_string()),
        ])?,
        "google" => build_headers(&[("content-type", "application/json".to_string())])?,
        _ => build_headers(&[
            (
                "authorization",
                format!("Bearer {}", provider.api_key.trim()),
            ),
            ("content-type", "application/json".to_string()),
        ])?,
    };

    Ok((parsed_url, headers, body))
}

fn collect_history_messages(
    state: &CodexRuntimeState,
    thread_id: &str,
    current_turn_id: &str,
) -> Vec<(String, String)> {
    let Some(thread) = state.threads.get(thread_id) else {
        return Vec::new();
    };

    let mut history = Vec::new();
    for turn_id in &thread.turn_ids {
        if turn_id == current_turn_id {
            continue;
        }
        let Some(turn) = state.turns.get(turn_id) else {
            continue;
        };

        let mut user_text = String::new();
        let mut assistant_text = String::new();
        for item_id in &turn.item_ids {
            let Some(item) = state.items.get(item_id) else {
                continue;
            };
            match item.kind {
                ItemKind::UserMessage if !item.text.trim().is_empty() => {
                    user_text = item.text.trim().to_string();
                }
                ItemKind::AgentMessage if !item.text.trim().is_empty() => {
                    assistant_text = item.text.trim().to_string();
                }
                _ => {}
            }
        }

        if !user_text.is_empty() {
            history.push(("user".to_string(), user_text));
        }
        if !assistant_text.is_empty() {
            history.push(("assistant".to_string(), assistant_text));
        }
    }

    history
}

fn parse_openai_sse_line(line: &str) -> Vec<RuntimeProviderEvent> {
    let Ok(parsed) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    let mut events = Vec::new();
    if let Some(delta) = parsed
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("delta"))
    {
        if let Some(text) = delta.get("content").and_then(|value| value.as_str()) {
            if !text.is_empty() {
                events.push(RuntimeProviderEvent::AssistantDelta(text.to_string()));
            }
        }
        if let Some(text) = delta
            .get("reasoning_content")
            .and_then(|value| value.as_str())
        {
            if !text.is_empty() {
                events.push(RuntimeProviderEvent::ReasoningDelta(text.to_string()));
            }
        }
        if let Some(tool_calls) = delta.get("tool_calls").and_then(|value| value.as_array()) {
            for tool_call in tool_calls {
                let tool_call_id = tool_call
                    .get("id")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string();
                if let Some(name) = tool_call
                    .get("function")
                    .and_then(|value| value.get("name"))
                    .and_then(|value| value.as_str())
                {
                    events.push(RuntimeProviderEvent::ToolCallStart {
                        tool_call_id: tool_call_id.clone(),
                        tool_name: name.to_string(),
                    });
                }
                if let Some(arguments) = tool_call
                    .get("function")
                    .and_then(|value| value.get("arguments"))
                    .and_then(|value| value.as_str())
                {
                    events.push(RuntimeProviderEvent::ToolCallDelta {
                        tool_call_id: tool_call_id.clone(),
                        arguments_delta: arguments.to_string(),
                    });
                }
            }
        }
    }
    if let Some(finish_reason) = parsed
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(|value| value.as_str())
    {
        if !finish_reason.is_empty() {
            events.push(RuntimeProviderEvent::StopReason(finish_reason.to_string()));
        }
    }
    events
}

fn parse_anthropic_sse_line(line: &str) -> Vec<RuntimeProviderEvent> {
    let Ok(parsed) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    let mut events = Vec::new();
    if parsed.get("type").and_then(|value| value.as_str()) == Some("content_block_start") {
        if parsed
            .get("content_block")
            .and_then(|value| value.get("type"))
            .and_then(|value| value.as_str())
            == Some("tool_use")
        {
            events.push(RuntimeProviderEvent::ToolCallStart {
                tool_call_id: parsed
                    .get("content_block")
                    .and_then(|value| value.get("id"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
                tool_name: parsed
                    .get("content_block")
                    .and_then(|value| value.get("name"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
            });
        }
    }
    if let Some(delta) = parsed.get("delta") {
        if let Some(text) = delta.get("text").and_then(|value| value.as_str()) {
            if !text.is_empty() {
                events.push(RuntimeProviderEvent::AssistantDelta(text.to_string()));
            }
        }
        if let Some(text) = delta.get("thinking").and_then(|value| value.as_str()) {
            if !text.is_empty() {
                events.push(RuntimeProviderEvent::ReasoningDelta(text.to_string()));
            }
        }
        if let Some(partial_json) = delta.get("partial_json").and_then(|value| value.as_str()) {
            if !partial_json.is_empty() {
                events.push(RuntimeProviderEvent::ToolCallDelta {
                    tool_call_id: String::new(),
                    arguments_delta: partial_json.to_string(),
                });
            }
        }
    }
    if let Some(stop_reason) = parsed
        .get("delta")
        .and_then(|value| value.get("stop_reason"))
        .and_then(|value| value.as_str())
    {
        if !stop_reason.is_empty() {
            events.push(RuntimeProviderEvent::StopReason(stop_reason.to_string()));
        }
    }
    events
}

fn parse_google_sse_line(line: &str) -> Vec<RuntimeProviderEvent> {
    let Ok(parsed) = serde_json::from_str::<Value>(line) else {
        return vec![];
    };
    let mut events = Vec::new();
    if let Some(parts) = parsed
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
    {
        for part in parts {
            if let Some(text) = part.get("text").and_then(|value| value.as_str()) {
                if !text.is_empty() {
                    let kind =
                        if part.get("thought").and_then(|value| value.as_bool()) == Some(true) {
                            RuntimeProviderEvent::ReasoningDelta(text.to_string())
                        } else {
                            RuntimeProviderEvent::AssistantDelta(text.to_string())
                        };
                    events.push(kind);
                }
            }
        }
    }
    if let Some(finish_reason) = parsed
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("finishReason"))
        .and_then(|value| value.as_str())
    {
        if !finish_reason.is_empty() {
            events.push(RuntimeProviderEvent::StopReason(finish_reason.to_string()));
        }
    }
    events
}

pub(crate) fn parse_sse_line(provider_id: &str, line: &str) -> Vec<RuntimeProviderEvent> {
    match provider_id {
        "anthropic" => parse_anthropic_sse_line(line),
        "google" => parse_google_sse_line(line),
        _ => parse_openai_sse_line(line),
    }
}

pub(crate) fn collect_pending_tool_calls(
    pending_tool_calls: &HashMap<String, PendingToolCall>,
) -> Vec<RuntimeToolCall> {
    pending_tool_calls
        .values()
        .map(|tool_call| RuntimeToolCall {
            id: tool_call.id.clone(),
            name: tool_call.name.clone(),
            arguments: serde_json::from_str(&tool_call.arguments).unwrap_or_else(|_| json!({})),
        })
        .collect()
}

fn runtime_tool_status(status: TurnStatus) -> &'static str {
    match status {
        TurnStatus::Running => "running",
        TurnStatus::Failed => "error",
        _ => "done",
    }
}

fn tool_call_item_text(tool_call: &RuntimeToolCall) -> String {
    serde_json::to_string_pretty(&json!({
        "kind": "toolCall",
        "toolCallId": tool_call.id,
        "toolName": tool_call.name,
        "arguments": tool_call.arguments,
    }))
    .unwrap_or_else(|_| format!("{} {}", tool_call.name, tool_call.arguments))
}

fn parse_tool_result_content(content: &str) -> Value {
    serde_json::from_str(content).unwrap_or_else(|_| Value::String(content.to_string()))
}

fn tool_result_item_text(
    tool_call: &RuntimeToolCall,
    result: &RuntimeToolResult,
    status: TurnStatus,
) -> String {
    serde_json::to_string_pretty(&json!({
        "kind": "toolResult",
        "toolCallId": result.tool_call_id,
        "toolName": tool_call.name,
        "status": runtime_tool_status(status),
        "isError": result.is_error,
        "result": parse_tool_result_content(&result.content),
    }))
    .unwrap_or_else(|_| result.content.clone())
}

#[derive(Debug, Clone)]
struct RuntimeToolItemPair {
    tool_call: RuntimeToolCall,
    tool_result: RuntimeToolResult,
    tool_call_item_id: String,
    tool_result_item_id: String,
}

async fn apply_item_delta<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
    delta: &str,
) {
    let mut state = runtime.inner.lock().await;
    let thread = state.threads.get(thread_id).cloned();
    let turn = state.turns.get(turn_id).cloned();
    let item_snapshot = if let Some(item) = state.items.get_mut(item_id) {
        item.text.push_str(delta);
        item.updated_at = chrono::Utc::now().timestamp();
        Some(item.clone())
    } else {
        None
    };
    if let Some(item_snapshot) = item_snapshot {
        let _ = persist_runtime_state(&state);
        emit_runtime_event(
            app,
            "itemDelta",
            thread,
            turn,
            Some(item_snapshot),
            None,
            None,
            None,
            None,
            Some(delta.to_string()),
            None,
        );
    }
}

async fn append_runtime_tool_items<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    tool_calls: &[RuntimeToolCall],
    tool_results: &[RuntimeToolResult],
) -> Vec<RuntimeToolItemPair> {
    let mut state = runtime.inner.lock().await;
    let now = chrono::Utc::now().timestamp();
    let thread = state.threads.get(thread_id).cloned();
    let turn = state.turns.get(turn_id).cloned();
    let mut item_pairs = Vec::new();

    for tool_call in tool_calls {
        let item = build_runtime_item(
            thread_id,
            turn_id,
            ItemKind::ToolCall,
            TurnStatus::Completed,
            &tool_call_item_text(tool_call),
            now,
        );
        if let Some(turn_state) = state.turns.get_mut(turn_id) {
            turn_state.item_ids.push(item.id.clone());
        }
        state.items.insert(item.id.clone(), item.clone());
        emit_runtime_event(
            app,
            "itemCompleted",
            thread.clone(),
            turn.clone(),
            Some(item.clone()),
            None,
            None,
            None,
            None,
            None,
            None,
        );
        item_pairs.push(RuntimeToolItemPair {
            tool_call: tool_call.clone(),
            tool_result: RuntimeToolResult {
                tool_call_id: tool_call.id.clone(),
                content: String::new(),
                is_error: false,
            },
            tool_call_item_id: item.id.clone(),
            tool_result_item_id: String::new(),
        });
    }

    for (index, result) in tool_results.iter().enumerate() {
        let tool_call = tool_calls.get(index).cloned().unwrap_or(RuntimeToolCall {
            id: result.tool_call_id.clone(),
            name: "tool".to_string(),
            arguments: Value::Null,
        });
        let item_status = if result.content.contains("\"sessionId\":")
            && !result.content.contains("\"sessionId\": null")
            && !result.content.contains("\"done\": true")
        {
            TurnStatus::Running
        } else if result.is_error {
            TurnStatus::Failed
        } else {
            TurnStatus::Completed
        };
        let item = build_runtime_item(
            thread_id,
            turn_id,
            ItemKind::ToolResult,
            item_status.clone(),
            &tool_result_item_text(&tool_call, result, item_status.clone()),
            now,
        );
        if let Some(turn_state) = state.turns.get_mut(turn_id) {
            turn_state.item_ids.push(item.id.clone());
        }
        state.items.insert(item.id.clone(), item.clone());
        emit_runtime_event(
            app,
            if item_status == TurnStatus::Running {
                "itemDelta"
            } else {
                "itemCompleted"
            },
            thread.clone(),
            turn.clone(),
            Some(item.clone()),
            None,
            None,
            None,
            None,
            None,
            None,
        );
        if let Some(entry) = item_pairs.get_mut(index) {
            entry.tool_result = result.clone();
            entry.tool_result_item_id = item.id.clone();
        } else {
            item_pairs.push(RuntimeToolItemPair {
                tool_call,
                tool_result: result.clone(),
                tool_call_item_id: String::new(),
                tool_result_item_id: item.id.clone(),
            });
        }
    }

    let _ = persist_runtime_state(&state);

    item_pairs
}

fn tool_result_is_running(result: &RuntimeToolResult) -> bool {
    let Ok(parsed) = serde_json::from_str::<Value>(&result.content) else {
        return false;
    };
    parsed
        .get("sessionId")
        .map(|value| !value.is_null())
        .unwrap_or(false)
        && !parsed.get("done").and_then(Value::as_bool).unwrap_or(false)
}

async fn update_runtime_item<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
    text: String,
    status: TurnStatus,
    event_type: &str,
) -> Result<(), String> {
    let mut state = runtime.inner.lock().await;
    let thread = state.threads.get(thread_id).cloned();
    let turn = state.turns.get(turn_id).cloned();
    let Some(item) = state.items.get_mut(item_id) else {
        return Err(format!("Runtime item not found: {item_id}"));
    };
    item.text = text;
    item.status = status;
    item.updated_at = chrono::Utc::now().timestamp();
    let item_snapshot = item.clone();
    persist_runtime_state(&state)?;
    emit_runtime_event(
        app,
        event_type,
        thread,
        turn,
        Some(item_snapshot),
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(())
}

fn session_id_from_tool_result(result: &RuntimeToolResult) -> Option<i32> {
    serde_json::from_str::<Value>(&result.content)
        .ok()
        .and_then(|value| value.get("sessionId").and_then(Value::as_i64))
        .map(|value| value as i32)
}

fn next_event_index_from_tool_result(result: &RuntimeToolResult) -> usize {
    serde_json::from_str::<Value>(&result.content)
        .ok()
        .and_then(|value| value.get("nextEventIndex").and_then(Value::as_u64))
        .unwrap_or_default() as usize
}

fn build_streaming_tool_result_text(
    tool_call: &RuntimeToolCall,
    update: &Value,
) -> Result<String, String> {
    serde_json::to_string_pretty(&json!({
        "kind": "toolResult",
        "toolCallId": tool_call.id,
        "toolName": tool_call.name,
        "status": if update.get("done").and_then(Value::as_bool).unwrap_or(false) {
            if update.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                "done"
            } else {
                "error"
            }
        } else {
            "running"
        },
        "isError": !update.get("ok").and_then(Value::as_bool).unwrap_or(false),
        "result": update,
    }))
    .map_err(|error| format!("Failed to serialize streaming tool result: {error}"))
}

fn spawn_exec_output_stream_task<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    tool_call: &RuntimeToolCall,
    tool_result_item_id: &str,
    session_id: i32,
    from_event_index: usize,
) {
    let app = app.clone();
    let runtime = runtime.clone();
    let thread_id = thread_id.to_string();
    let turn_id = turn_id.to_string();
    let tool_call = tool_call.clone();
    let tool_result_item_id = tool_result_item_id.to_string();
    tokio::spawn(async move {
        let mut cursor = from_event_index;
        loop {
            let update = match poll_exec_session_updates(session_id, cursor, 250, 16_000).await {
                Ok(update) => update,
                Err(_) => break,
            };
            cursor = update
                .get("nextEventIndex")
                .and_then(Value::as_u64)
                .unwrap_or(cursor as u64) as usize;

            let text = match build_streaming_tool_result_text(&tool_call, &update) {
                Ok(text) => text,
                Err(_) => break,
            };
            let status = if update.get("done").and_then(Value::as_bool).unwrap_or(false) {
                if update.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                    TurnStatus::Completed
                } else {
                    TurnStatus::Failed
                }
            } else {
                TurnStatus::Running
            };
            let event_type = if status == TurnStatus::Running {
                "itemDelta"
            } else {
                "itemCompleted"
            };
            let _ = update_runtime_item(
                &app,
                &runtime,
                &thread_id,
                &turn_id,
                &tool_result_item_id,
                text,
                status.clone(),
                event_type,
            )
            .await;

            if status != TurnStatus::Running {
                break;
            }
        }
    });
}

async fn request_runtime_tool_permission<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    tool_call: &RuntimeToolCall,
    display_name: &str,
    title: &str,
    description: &str,
    decision_reason: String,
    input_preview: String,
) -> Result<String, String> {
    let mut state = runtime.inner.lock().await;
    let response = request_permission(
        &mut state,
        RuntimePermissionRequestParams {
            thread_id: thread_id.to_string(),
            turn_id: Some(turn_id.to_string()),
            tool_name: tool_call.name.clone(),
            display_name: display_name.to_string(),
            title: title.to_string(),
            description: description.to_string(),
            decision_reason,
            input_preview,
        },
    )?;
    persist_runtime_state(&state)?;
    emit_runtime_event(
        app,
        "permissionRequest",
        state.threads.get(thread_id).cloned(),
        state.turns.get(turn_id).cloned(),
        None,
        Some(response.request.clone()),
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response.request.request_id)
}

async fn await_permission_resolution(
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    request_id: &str,
) -> String {
    loop {
        {
            let mut state = runtime.inner.lock().await;
            if let Some(response) = state.permission_resolutions.remove(request_id) {
                return response.behavior;
            }
            if state
                .turns
                .get(turn_id)
                .map(|turn| turn.status != TurnStatus::Running)
                .unwrap_or(true)
            {
                return "deny".to_string();
            }
            if state
                .threads
                .get(thread_id)
                .map(|thread| thread.status != ThreadStatus::Running)
                .unwrap_or(true)
            {
                return "deny".to_string();
            }
        }
        sleep(Duration::from_millis(80)).await;
    }
}

async fn execute_runtime_tool_calls_with_approvals<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
) -> Vec<RuntimeToolResult> {
    let mut results = Vec::with_capacity(tool_calls.len());
    for tool_call in tool_calls {
        if is_apply_patch_tool_call(tool_call) {
            let prepared = match prepare_apply_patch_tool_call(workspace_path, tool_call) {
                Ok(prepared) => prepared,
                Err(error) => {
                    results.push(RuntimeToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::to_string_pretty(&json!({
                            "tool": tool_call.name,
                            "error": error,
                        }))
                        .unwrap_or_else(|_| {
                            "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                        }),
                        is_error: true,
                    });
                    continue;
                }
            };

            let permission_payload = build_apply_patch_result(workspace_path, &prepared);
            let request_id = match request_runtime_tool_permission(
                app,
                runtime,
                thread_id,
                turn_id,
                tool_call,
                "apply_patch",
                "Approve patch application",
                "The agent wants to modify files in the current workspace.",
                format!(
                    "{} file change(s) requested.",
                    permission_payload
                        .get("files")
                        .and_then(Value::as_array)
                        .map(|entries| entries.len())
                        .unwrap_or_default()
                ),
                permission_payload
                    .get("preview")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            )
            .await
            {
                Ok(request_id) => request_id,
                Err(error) => {
                    results.push(RuntimeToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::to_string_pretty(&json!({
                            "tool": tool_call.name,
                            "error": error,
                        }))
                        .unwrap_or_else(|_| {
                            "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                        }),
                        is_error: true,
                    });
                    continue;
                }
            };

            let behavior =
                await_permission_resolution(runtime, thread_id, turn_id, &request_id).await;
            if behavior.trim() != "allow" {
                results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&json!({
                        "tool": tool_call.name,
                        "error": "Patch application was denied by the user.",
                    }))
                    .unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: true,
                });
                continue;
            }

            match execute_prepared_apply_patch(workspace_path, &prepared) {
                Ok(content) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&content).unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: false,
                }),
                Err(error) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&json!({
                        "tool": tool_call.name,
                        "error": error,
                    }))
                    .unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: true,
                }),
            }
            continue;
        }

        if is_exec_command_tool_call(tool_call) {
            let prepared = match prepare_exec_command_tool_call(workspace_path, tool_call) {
                Ok(prepared) => prepared,
                Err(error) => {
                    results.push(RuntimeToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::to_string_pretty(&json!({
                            "tool": tool_call.name,
                            "error": error,
                        }))
                        .unwrap_or_else(|_| {
                            "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                        }),
                        is_error: true,
                    });
                    continue;
                }
            };

            let permission_payload = build_exec_command_result(&prepared);
            let request_id = match request_runtime_tool_permission(
                app,
                runtime,
                thread_id,
                turn_id,
                tool_call,
                "exec_command",
                "Approve command execution",
                "The agent wants to run a shell command in the current workspace.",
                format!("Command will run in {}.", prepared.workdir),
                format!(
                    "{}\n{}",
                    prepared.command,
                    permission_payload
                        .get("shell")
                        .and_then(Value::as_str)
                        .map(|shell| format!("shell: {shell}"))
                        .unwrap_or_default()
                )
                .trim()
                .to_string(),
            )
            .await
            {
                Ok(request_id) => request_id,
                Err(error) => {
                    results.push(RuntimeToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::to_string_pretty(&json!({
                            "tool": tool_call.name,
                            "error": error,
                        }))
                        .unwrap_or_else(|_| {
                            "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                        }),
                        is_error: true,
                    });
                    continue;
                }
            };

            let behavior =
                await_permission_resolution(runtime, thread_id, turn_id, &request_id).await;
            if behavior.trim() != "allow" {
                results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&json!({
                        "tool": tool_call.name,
                        "error": "Command execution was denied by the user.",
                    }))
                    .unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: true,
                });
                continue;
            }

            match execute_prepared_exec_command(&prepared).await {
                Ok(content) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&content).unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: !content.get("ok").and_then(Value::as_bool).unwrap_or(false),
                }),
                Err(error) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&json!({
                        "tool": tool_call.name,
                        "error": error,
                    }))
                    .unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: true,
                }),
            }
            continue;
        }

        if is_write_stdin_tool_call(tool_call) {
            let prepared = match prepare_write_stdin_tool_call(tool_call) {
                Ok(prepared) => prepared,
                Err(error) => {
                    results.push(RuntimeToolResult {
                        tool_call_id: tool_call.id.clone(),
                        content: serde_json::to_string_pretty(&json!({
                            "tool": tool_call.name,
                            "error": error,
                        }))
                        .unwrap_or_else(|_| {
                            "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                        }),
                        is_error: true,
                    });
                    continue;
                }
            };

            match execute_prepared_write_stdin(&prepared).await {
                Ok(content) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&content).unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: false,
                }),
                Err(error) => results.push(RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: serde_json::to_string_pretty(&json!({
                        "tool": tool_call.name,
                        "error": error,
                    }))
                    .unwrap_or_else(|_| {
                        "{\"error\":\"Failed to serialize tool result.\"}".to_string()
                    }),
                    is_error: true,
                }),
            }
            continue;
        }

        results.push(execute_runtime_tool_call_with_context(
            workspace_path,
            tool_call,
            &Value::Null,
            &[],
        ));
    }
    results
}

async fn finish_turn_success<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    item_ids: &[String],
) {
    let mut state = runtime.inner.lock().await;
    let now = chrono::Utc::now().timestamp();

    if let Some(turn) = state.turns.get_mut(turn_id) {
        turn.status = TurnStatus::Completed;
        turn.updated_at = now;
        turn.completed_at = Some(now);
    }
    if let Some(thread) = state.threads.get_mut(thread_id) {
        thread.status = ThreadStatus::Idle;
        thread.updated_at = now;
        thread.active_turn_id = None;
    }

    let thread = state.threads.get(thread_id).cloned();
    let turn = state.turns.get(turn_id).cloned();
    for item_id in item_ids {
        if let Some(item) = state.items.get_mut(item_id) {
            if item.kind == ItemKind::ToolResult && item.status == TurnStatus::Running {
                continue;
            }
            item.status = TurnStatus::Completed;
            item.updated_at = now;
            emit_runtime_event(
                app,
                "itemCompleted",
                thread.clone(),
                turn.clone(),
                Some(item.clone()),
                None,
                None,
                None,
                None,
                None,
                None,
            );
        }
    }
    let _ = persist_runtime_state(&state);

    emit_runtime_event(
        app,
        "turnCompleted",
        thread,
        turn,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
}

async fn finish_turn_failure<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &CodexRuntimeHandle,
    thread_id: &str,
    turn_id: &str,
    item_ids: &[String],
    error: &str,
) {
    let mut state = runtime.inner.lock().await;
    let now = chrono::Utc::now().timestamp();
    let normalized_error = error.trim();

    if let Some(turn) = state.turns.get_mut(turn_id) {
        turn.status = TurnStatus::Failed;
        turn.updated_at = now;
        turn.completed_at = Some(now);
    }
    if let Some(thread) = state.threads.get_mut(thread_id) {
        thread.status = ThreadStatus::Idle;
        thread.updated_at = now;
        thread.active_turn_id = None;
    }

    let thread = state.threads.get(thread_id).cloned();
    let turn = state.turns.get(turn_id).cloned();
    for item_id in item_ids {
        if let Some(item) = state.items.get_mut(item_id) {
            item.status = TurnStatus::Failed;
            item.updated_at = now;
            if item.kind == ItemKind::AgentMessage
                && item.text.trim().is_empty()
                && !normalized_error.is_empty()
            {
                item.text = normalized_error.to_string();
            }
            emit_runtime_event(
                app,
                "itemCompleted",
                thread.clone(),
                turn.clone(),
                Some(item.clone()),
                None,
                None,
                None,
                None,
                None,
                None,
            );
        }
    }
    let _ = persist_runtime_state(&state);

    emit_runtime_event(
        app,
        "turnFailed",
        thread,
        turn,
        None,
        None,
        None,
        None,
        None,
        None,
        Some(error.to_string()),
    );
}

pub async fn abort_running_turn_task(turn_id: &str) -> bool {
    if let Some(handle) = runtime_turn_tasks().lock().await.remove(turn_id) {
        handle.abort();
        return true;
    }
    false
}

pub async fn run_turn<R: Runtime>(
    app: AppHandle<R>,
    runtime: CodexRuntimeHandle,
    params: RuntimeTurnRunParams,
) -> Result<RuntimeTurnRunResponse, String> {
    let now = chrono::Utc::now().timestamp();
    let mut state = runtime.inner.lock().await;
    let started = start_turn(
        &mut state,
        super::protocol::RuntimeTurnStartParams {
            thread_id: params.thread_id.clone(),
            user_text: params.user_text.clone(),
        },
    )?;

    let assistant_item = build_runtime_item(
        &started.thread.id,
        &started.turn.id,
        ItemKind::AgentMessage,
        TurnStatus::Running,
        "",
        now,
    );
    let reasoning_item = build_runtime_item(
        &started.thread.id,
        &started.turn.id,
        ItemKind::Reasoning,
        TurnStatus::Running,
        "",
        now,
    );

    if let Some(turn) = state.turns.get_mut(&started.turn.id) {
        turn.item_ids.push(assistant_item.id.clone());
        turn.item_ids.push(reasoning_item.id.clone());
    }
    state
        .items
        .insert(assistant_item.id.clone(), assistant_item.clone());
    state
        .items
        .insert(reasoning_item.id.clone(), reasoning_item.clone());

    let thread = state
        .threads
        .get(&started.thread.id)
        .cloned()
        .ok_or_else(|| "Thread disappeared after turn start.".to_string())?;
    let turn = state
        .turns
        .get(&started.turn.id)
        .cloned()
        .ok_or_else(|| "Turn disappeared after start.".to_string())?;
    let history = collect_history_messages(&state, &thread.id, &turn.id);
    let _ = persist_runtime_state(&state);
    drop(state);

    emit_runtime_event(
        &app,
        "turnStarted",
        Some(thread.clone()),
        Some(turn.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    emit_runtime_event(
        &app,
        "itemStarted",
        Some(thread.clone()),
        Some(turn.clone()),
        Some(assistant_item.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
    );
    emit_runtime_event(
        &app,
        "itemStarted",
        Some(thread.clone()),
        Some(turn.clone()),
        Some(reasoning_item.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
    );

    let turn_id = turn.id.clone();
    let thread_id = thread.id.clone();
    let provider = params.provider.clone();
    let user_text = params.user_text.clone();
    let workspace_path = params.workspace_path.clone();
    let enabled_tool_ids = params.enabled_tool_ids.clone();
    let requested_tool_mentions = params.requested_tool_mentions.clone();
    let runtime_for_task = runtime.clone();
    let app_for_task = app.clone();
    let assistant_item_id = assistant_item.id.clone();
    let reasoning_item_id = reasoning_item.id.clone();

    let handle = tokio::spawn(async move {
        let provider_id = provider.provider_id.trim().to_lowercase();
        let tool_definitions = resolve_runtime_tool_definitions_with_context(
            &workspace_path,
            &enabled_tool_ids,
            &requested_tool_mentions,
            &Value::Null,
            &[],
        );
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                let message = format!("Failed to build runtime provider client: {error}");
                finish_turn_failure(
                    &app_for_task,
                    &runtime_for_task,
                    &thread_id,
                    &turn_id,
                    &[assistant_item_id.clone(), reasoning_item_id.clone()],
                    &message,
                )
                .await;
                let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
                return;
            }
        };

        let mut continuation_messages = Vec::new();
        let mut tracked_item_ids = vec![assistant_item_id.clone(), reasoning_item_id.clone()];

        for _round in 0..MAX_TOOL_ROUNDS {
            let request = build_provider_request(
                &provider,
                &history,
                &user_text,
                &tool_definitions,
                &continuation_messages,
            );
            let (url, headers, body) = match request {
                Ok(value) => value,
                Err(error) => {
                    finish_turn_failure(
                        &app_for_task,
                        &runtime_for_task,
                        &thread_id,
                        &turn_id,
                        &tracked_item_ids,
                        &error,
                    )
                    .await;
                    let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
                    return;
                }
            };

            let response = match client.post(url).headers(headers).body(body).send().await {
                Ok(response) => response,
                Err(error) => {
                    let message = format!("Runtime provider request failed: {error}");
                    finish_turn_failure(
                        &app_for_task,
                        &runtime_for_task,
                        &thread_id,
                        &turn_id,
                        &tracked_item_ids,
                        &message,
                    )
                    .await;
                    let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
                    return;
                }
            };

            if !response.status().is_success() {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .unwrap_or_else(|_| "Unknown provider error".to_string());
                let message = format!("Runtime provider returned HTTP {status}: {body}");
                finish_turn_failure(
                    &app_for_task,
                    &runtime_for_task,
                    &thread_id,
                    &turn_id,
                    &tracked_item_ids,
                    &message,
                )
                .await;
                let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
                return;
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            let mut pending_tool_calls: HashMap<String, PendingToolCall> = HashMap::new();
            let mut current_tool_call_id = String::new();
            let mut stop_reason = String::new();
            let mut assistant_text = String::new();

            while let Some(chunk_result) = stream.next().await {
                let bytes = match chunk_result {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        let message = format!("Runtime provider stream failed: {error}");
                        finish_turn_failure(
                            &app_for_task,
                            &runtime_for_task,
                            &thread_id,
                            &turn_id,
                            &tracked_item_ids,
                            &message,
                        )
                        .await;
                        let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
                        return;
                    }
                };

                buffer.push_str(&String::from_utf8_lossy(&bytes));
                let mut lines = buffer
                    .split('\n')
                    .map(|value| value.to_string())
                    .collect::<Vec<_>>();
                buffer = lines.pop().unwrap_or_default();

                for line in lines {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let data = if let Some(value) = trimmed.strip_prefix("data: ") {
                        value.trim()
                    } else if let Some(value) = trimmed.strip_prefix("data:") {
                        value.trim()
                    } else {
                        continue;
                    };
                    if data.is_empty() || data == "[DONE]" {
                        continue;
                    }

                    for event in parse_sse_line(&provider_id, data) {
                        match event {
                            RuntimeProviderEvent::AssistantDelta(delta) => {
                                assistant_text.push_str(&delta);
                                apply_item_delta(
                                    &app_for_task,
                                    &runtime_for_task,
                                    &thread_id,
                                    &turn_id,
                                    &assistant_item_id,
                                    &delta,
                                )
                                .await;
                            }
                            RuntimeProviderEvent::ReasoningDelta(delta) => {
                                apply_item_delta(
                                    &app_for_task,
                                    &runtime_for_task,
                                    &thread_id,
                                    &turn_id,
                                    &reasoning_item_id,
                                    &delta,
                                )
                                .await;
                            }
                            RuntimeProviderEvent::ToolCallStart {
                                tool_call_id,
                                tool_name,
                            } => {
                                current_tool_call_id = tool_call_id.clone();
                                pending_tool_calls.entry(tool_call_id.clone()).or_insert(
                                    PendingToolCall {
                                        id: tool_call_id,
                                        name: tool_name,
                                        arguments: String::new(),
                                    },
                                );
                            }
                            RuntimeProviderEvent::ToolCallDelta {
                                tool_call_id,
                                arguments_delta,
                            } => {
                                let resolved_id = if tool_call_id.trim().is_empty() {
                                    current_tool_call_id.clone()
                                } else {
                                    tool_call_id
                                };
                                if let Some(tool_call) = pending_tool_calls.get_mut(&resolved_id) {
                                    tool_call.arguments.push_str(&arguments_delta);
                                }
                            }
                            RuntimeProviderEvent::StopReason(reason) => {
                                stop_reason = reason;
                            }
                        }
                    }
                }
            }

            let tool_calls = collect_pending_tool_calls(&pending_tool_calls);
            let should_continue_with_tools = !tool_calls.is_empty()
                && matches!(
                    stop_reason.as_str(),
                    "tool_calls" | "tool_use" | "TOOL_CALL" | "STOP_REASON_TOOL_CALL"
                )
                && !workspace_path.trim().is_empty();

            if should_continue_with_tools {
                let tool_results = execute_runtime_tool_calls_with_approvals(
                    &app_for_task,
                    &runtime_for_task,
                    &thread_id,
                    &turn_id,
                    &workspace_path,
                    &tool_calls,
                )
                .await;
                let new_item_ids = append_runtime_tool_items(
                    &app_for_task,
                    &runtime_for_task,
                    &thread_id,
                    &turn_id,
                    &tool_calls,
                    &tool_results,
                )
                .await;
                for pair in &new_item_ids {
                    if !pair.tool_call_item_id.is_empty() {
                        tracked_item_ids.push(pair.tool_call_item_id.clone());
                    }
                    if !pair.tool_result_item_id.is_empty() {
                        tracked_item_ids.push(pair.tool_result_item_id.clone());
                    }
                    if tool_result_is_running(&pair.tool_result) {
                        if let Some(session_id) = session_id_from_tool_result(&pair.tool_result) {
                            spawn_exec_output_stream_task(
                                &app_for_task,
                                &runtime_for_task,
                                &thread_id,
                                &turn_id,
                                &pair.tool_call,
                                &pair.tool_result_item_id,
                                session_id,
                                next_event_index_from_tool_result(&pair.tool_result),
                            );
                        }
                    }
                }
                continuation_messages.push(RuntimeContinuationMessage::Assistant {
                    content: assistant_text,
                    tool_calls,
                });
                continuation_messages.push(RuntimeContinuationMessage::ToolResults {
                    results: tool_results,
                });
                continue;
            }

            break;
        }

        finish_turn_success(
            &app_for_task,
            &runtime_for_task,
            &thread_id,
            &turn_id,
            &tracked_item_ids,
        )
        .await;
        let _ = runtime_turn_tasks().lock().await.remove(&turn_id);
    });

    runtime_turn_tasks()
        .lock()
        .await
        .insert(turn.id.clone(), handle);

    Ok(RuntimeTurnRunResponse {
        thread,
        turn,
        user_item: started.items[0].clone(),
        assistant_item,
        reasoning_item,
    })
}
