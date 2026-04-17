use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;

use crate::ai_skill_support::load_skill_supporting_files;
use crate::codex_runtime::providers::{
    build_provider_request, collect_pending_tool_calls, parse_sse_line, PendingToolCall,
    RuntimeContinuationMessage, RuntimeProviderEvent, MAX_TOOL_ROUNDS,
};
use crate::codex_runtime::tools::{
    execute_runtime_tool_calls_with_context, resolve_runtime_tool_definitions_with_context,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentExecuteParams {
    #[serde(default)]
    pub provider_id: String,
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub config: Value,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub conversation: Vec<Value>,
    #[serde(default)]
    pub user_prompt: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub support_files: Vec<Value>,
    #[serde(default)]
    pub enabled_tool_ids: Vec<String>,
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentExecuteResponse {
    pub content: String,
    pub reasoning: String,
    pub transport: String,
    pub payload: Value,
    pub events: Vec<Value>,
}

fn build_provider_config(
    params: &AiAgentExecuteParams,
) -> crate::codex_runtime::protocol::RuntimeProviderConfig {
    crate::codex_runtime::protocol::RuntimeProviderConfig {
        provider_id: params.provider_id.clone(),
        base_url: params
            .config
            .get("baseUrl")
            .or_else(|| params.config.get("base_url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        api_key: params.api_key.clone(),
        model: params
            .config
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        system_prompt: params.system_prompt.clone(),
        temperature: params
            .config
            .get("temperature")
            .and_then(Value::as_f64)
            .map(|value| value as f32),
        max_tokens: params
            .config
            .get("maxTokens")
            .or_else(|| params.config.get("max_tokens"))
            .and_then(Value::as_u64)
            .map(|value| value as u32),
    }
}

fn normalize_history(messages: &[Value]) -> Vec<(String, String)> {
    messages
        .iter()
        .filter_map(|message| {
            let role = message
                .get("role")
                .and_then(Value::as_str)?
                .trim()
                .to_string();
            if role != "user" && role != "assistant" {
                return None;
            }
            let content = message
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            if content.is_empty() {
                return None;
            }
            Some((role, content))
        })
        .collect()
}

fn extract_json_payload(raw_text: &str) -> Option<Value> {
    let normalized = raw_text.trim();
    if normalized.is_empty() {
        return None;
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(normalized) {
        if parsed.is_object() {
            return Some(parsed);
        }
    }
    if let Some(start) = normalized.find("```") {
        if let Some(end) = normalized[start + 3..].find("```") {
            let inner = &normalized[start + 3..start + 3 + end];
            let cleaned = inner.trim_start_matches("json").trim();
            if let Ok(parsed) = serde_json::from_str::<Value>(cleaned) {
                if parsed.is_object() {
                    return Some(parsed);
                }
            }
        }
    }
    if let (Some(first), Some(last)) = (normalized.find('{'), normalized.rfind('}')) {
        if last > first {
            if let Ok(parsed) = serde_json::from_str::<Value>(&normalized[first..=last]) {
                if parsed.is_object() {
                    return Some(parsed);
                }
            }
        }
    }
    None
}

fn fallback_payload(content: &str, reasoning: &str) -> Value {
    json!({
        "answer": content,
        "rationale": reasoning,
    })
}

#[tauri::command]
pub async fn ai_agent_execute(
    params: AiAgentExecuteParams,
) -> Result<AiAgentExecuteResponse, String> {
    let mut params = params;
    if params.support_files.is_empty()
        && params
            .skill
            .get("kind")
            .and_then(Value::as_str)
            .unwrap_or_default()
            == "filesystem-skill"
        && params
            .enabled_tool_ids
            .iter()
            .any(|tool_id| tool_id.trim() == "load-skill-support-files")
    {
        params.support_files = load_skill_supporting_files(&params.skill);
    }
    let provider = build_provider_config(&params);
    let history = normalize_history(&params.conversation);
    let tool_definitions = resolve_runtime_tool_definitions_with_context(
        &params.enabled_tool_ids,
        &params.context_bundle,
        &params.support_files,
    );
    let client = Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("Failed to build runtime provider client: {error}"))?;

    let provider_id = provider.provider_id.trim().to_lowercase();
    let mut continuation_messages = Vec::new();
    let mut final_content = String::new();
    let mut final_reasoning = String::new();
    let mut events = Vec::new();

    for _round in 0..MAX_TOOL_ROUNDS {
        let (url, headers, body) = build_provider_request(
            &provider,
            &history,
            &params.user_prompt,
            &tool_definitions,
            &continuation_messages,
        )?;

        let response = client
            .post(url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|error| format!("Runtime provider request failed: {error}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown provider error".to_string());
            return Err(format!("Runtime provider returned HTTP {status}: {body}"));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut pending_tool_calls: HashMap<String, PendingToolCall> = HashMap::new();
        let mut current_tool_call_id = String::new();
        let mut stop_reason = String::new();
        let mut assistant_text = String::new();
        let mut reasoning_text = String::new();

        while let Some(chunk_result) = stream.next().await {
            let bytes =
                chunk_result.map_err(|error| format!("Runtime provider stream failed: {error}"))?;
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
                        }
                        RuntimeProviderEvent::ReasoningDelta(delta) => {
                            reasoning_text.push_str(&delta);
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

        final_content = assistant_text.clone();
        if !reasoning_text.is_empty() {
            final_reasoning = reasoning_text.clone();
        }
        let tool_calls = collect_pending_tool_calls(&pending_tool_calls);
        let should_continue_with_tools = !tool_calls.is_empty()
            && matches!(
                stop_reason.as_str(),
                "tool_calls" | "tool_use" | "TOOL_CALL" | "STOP_REASON_TOOL_CALL"
            )
            && !params.workspace_path.trim().is_empty();

        if should_continue_with_tools {
            let tool_results = execute_runtime_tool_calls_with_context(
                &params.workspace_path,
                &tool_calls,
                &params.context_bundle,
                &params.support_files,
            );
            events.extend(tool_calls.iter().map(|tool_call| {
                json!({
                    "eventType": "tool",
                    "toolId": format!("runtime:{}", tool_call.id),
                    "status": "done",
                    "label": tool_call.name,
                    "detail": tool_results
                        .iter()
                        .find(|result| result.tool_call_id == tool_call.id)
                        .map(|result| result.content.chars().take(220).collect::<String>())
                        .unwrap_or_default(),
                })
            }));
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

    let transport = "rust-runtime".to_string();
    let payload = extract_json_payload(&final_content)
        .unwrap_or_else(|| fallback_payload(&final_content, &final_reasoning));

    Ok(AiAgentExecuteResponse {
        content: final_content,
        reasoning: final_reasoning,
        transport,
        payload,
        events,
    })
}

