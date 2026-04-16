use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

const AI_AGENT_SDK_STREAM_EVENT: &str = "ai-agent-sdk-stream";

struct ActiveAiAgentSdkStream {
    handle: JoinHandle<()>,
    stdin: Arc<Mutex<ChildStdin>>,
}

type StreamTaskMap = Mutex<HashMap<String, ActiveAiAgentSdkStream>>;

static AI_AGENT_SDK_TASKS: OnceLock<StreamTaskMap> = OnceLock::new();

fn ai_agent_sdk_tasks() -> &'static StreamTaskMap {
    AI_AGENT_SDK_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AiAnthropicSdkStreamRequest {
    pub stream_id: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub approval_mode: String,
    #[serde(default)]
    pub permission_mode: String,
    #[serde(default)]
    pub tool_policies: HashMap<String, String>,
    pub max_turns: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct AiAnthropicSdkPermissionResponse {
    pub stream_id: String,
    pub request_id: String,
    pub behavior: String,
    #[serde(default)]
    pub persist: bool,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct AiAnthropicSdkAskUserResponse {
    pub stream_id: String,
    pub request_id: String,
    #[serde(default)]
    pub answers: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct AiAnthropicSdkExitPlanResponse {
    pub stream_id: String,
    pub request_id: String,
    pub action: String,
    #[serde(default)]
    pub feedback: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiAgentSdkStreamPayload {
    pub stream_id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn emit_ai_agent_sdk_payload<R: Runtime>(app: &AppHandle<R>, payload: AiAgentSdkStreamPayload) {
    let _ = app.emit(AI_AGENT_SDK_STREAM_EVENT, payload);
}

fn resolve_anthropic_sdk_bridge_script_path<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<PathBuf, String> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("ai")
        .join("anthropicAgentBridge.mjs");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to resolve Tauri resource dir: {error}"))?;
    let candidates = [
        resource_dir.join("ai").join("anthropicAgentBridge.mjs"),
        resource_dir
            .join("resources")
            .join("ai")
            .join("anthropicAgentBridge.mjs"),
        resource_dir.join("anthropicAgentBridge.mjs"),
    ];

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "Anthropic SDK bridge script is unavailable.".to_string())
}

#[tauri::command]
pub async fn start_ai_anthropic_sdk_stream<R: Runtime>(
    app: AppHandle<R>,
    request: AiAnthropicSdkStreamRequest,
) -> Result<(), String> {
    let stream_id = request.stream_id.trim().to_string();
    if stream_id.is_empty() {
        return Err("Anthropic SDK stream id is required".to_string());
    }
    if request.api_key.trim().is_empty() {
        return Err("Anthropic API key is required".to_string());
    }
    if request.model.trim().is_empty() {
        return Err("Anthropic model is required".to_string());
    }
    if request.prompt.trim().is_empty() {
        return Err("Anthropic prompt is required".to_string());
    }

    let mut tasks = ai_agent_sdk_tasks().lock().await;
    if let Some(existing) = tasks.remove(&stream_id) {
        existing.handle.abort();
    }

    let script_path = resolve_anthropic_sdk_bridge_script_path(&app)?;
    let mut child = Command::new("node")
        .arg(&script_path)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to spawn Anthropic Agent SDK bridge: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Anthropic Agent SDK bridge stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Anthropic Agent SDK bridge stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take();

    let serialized_request = serde_json::to_string(&request)
        .map_err(|error| format!("Failed to serialize Anthropic Agent SDK request: {error}"))?;
    stdin
        .write_all(format!("{serialized_request}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to write Anthropic Agent SDK request: {error}"))?;
    stdin
        .flush()
        .await
        .map_err(|error| format!("Failed to flush Anthropic Agent SDK request: {error}"))?;

    let stdin = Arc::new(Mutex::new(stdin));
    let stdin_for_map = stdin.clone();
    let app_for_task = app.clone();
    let stream_id_for_task = stream_id.clone();

    emit_ai_agent_sdk_payload(
        &app,
        AiAgentSdkStreamPayload {
            stream_id: stream_id.clone(),
            kind: "start".to_string(),
            chunk: None,
            error: None,
        },
    );

    let handle = tokio::spawn(async move {
        let stderr_buffer = Arc::new(Mutex::new(String::new()));
        let stderr_buffer_for_task = stderr_buffer.clone();
        let stderr_task = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let mut buffer = stderr_buffer_for_task.lock().await;
                    if !buffer.is_empty() {
                        buffer.push('\n');
                    }
                    buffer.push_str(&line);
                }
            }
        });

        let mut stdout_lines = BufReader::new(stdout).lines();
        loop {
            match stdout_lines.next_line().await {
                Ok(Some(line)) => {
                    emit_ai_agent_sdk_payload(
                        &app_for_task,
                        AiAgentSdkStreamPayload {
                            stream_id: stream_id_for_task.clone(),
                            kind: "chunk".to_string(),
                            chunk: Some(format!("{line}\n")),
                            error: None,
                        },
                    );
                }
                Ok(None) => break,
                Err(error) => {
                    emit_ai_agent_sdk_payload(
                        &app_for_task,
                        AiAgentSdkStreamPayload {
                            stream_id: stream_id_for_task.clone(),
                            kind: "error".to_string(),
                            chunk: None,
                            error: Some(format!(
                                "Failed while reading Anthropic Agent SDK output: {error}"
                            )),
                        },
                    );
                    let _ = ai_agent_sdk_tasks().lock().await.remove(&stream_id_for_task);
                    return;
                }
            }
        }

        let _ = stderr_task.await;
        match child.wait().await {
            Ok(exit_status) if exit_status.success() => {
                emit_ai_agent_sdk_payload(
                    &app_for_task,
                    AiAgentSdkStreamPayload {
                        stream_id: stream_id_for_task.clone(),
                        kind: "done".to_string(),
                        chunk: None,
                        error: None,
                    },
                );
            }
            Ok(exit_status) => {
                let stderr_output = {
                    let buffer = stderr_buffer.lock().await;
                    buffer.clone()
                };
                emit_ai_agent_sdk_payload(
                    &app_for_task,
                    AiAgentSdkStreamPayload {
                        stream_id: stream_id_for_task.clone(),
                        kind: "error".to_string(),
                        chunk: None,
                        error: Some(if stderr_output.trim().is_empty() {
                            format!(
                                "Anthropic Agent SDK bridge exited with status {}.",
                                exit_status
                            )
                        } else {
                            stderr_output
                        }),
                    },
                );
            }
            Err(error) => {
                emit_ai_agent_sdk_payload(
                    &app_for_task,
                    AiAgentSdkStreamPayload {
                        stream_id: stream_id_for_task.clone(),
                        kind: "error".to_string(),
                        chunk: None,
                        error: Some(format!(
                            "Anthropic Agent SDK bridge process failed: {error}"
                        )),
                    },
                );
            }
        }

        let _ = ai_agent_sdk_tasks().lock().await.remove(&stream_id_for_task);
    });

    tasks.insert(
        stream_id,
        ActiveAiAgentSdkStream {
            handle,
            stdin: stdin_for_map,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn abort_ai_anthropic_sdk_stream(stream_id: String) -> Result<(), String> {
    let normalized_stream_id = stream_id.trim().to_string();
    if normalized_stream_id.is_empty() {
        return Ok(());
    }

    if let Some(entry) = ai_agent_sdk_tasks().lock().await.remove(&normalized_stream_id) {
        entry.handle.abort();
    }

    Ok(())
}

#[tauri::command]
pub async fn respond_ai_anthropic_sdk_permission(
    response: AiAnthropicSdkPermissionResponse,
) -> Result<(), String> {
    let normalized_stream_id = response.stream_id.trim().to_string();
    if normalized_stream_id.is_empty() {
        return Err("Anthropic permission response requires a stream id".to_string());
    }
    let normalized_request_id = response.request_id.trim().to_string();
    if normalized_request_id.is_empty() {
        return Err("Anthropic permission response requires a request id".to_string());
    }

    let stdin = {
        let tasks = ai_agent_sdk_tasks().lock().await;
        tasks
            .get(&normalized_stream_id)
            .map(|entry| entry.stdin.clone())
            .ok_or_else(|| "Anthropic Agent SDK stream is no longer active.".to_string())?
    };

    let line = serde_json::to_string(&serde_json::json!({
        "kind": "permission_response",
        "requestId": normalized_request_id,
        "behavior": if response.behavior.trim() == "allow" { "allow" } else { "deny" },
        "persist": response.persist,
        "message": response.message,
    }))
    .map_err(|error| format!("Failed to serialize permission response: {error}"))?;

    let mut stdin_guard = stdin.lock().await;
    stdin_guard
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to send permission response to the SDK bridge: {error}"))?;
    stdin_guard
        .flush()
        .await
        .map_err(|error| format!("Failed to flush permission response to the SDK bridge: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn respond_ai_anthropic_sdk_ask_user(
    response: AiAnthropicSdkAskUserResponse,
) -> Result<(), String> {
    let normalized_stream_id = response.stream_id.trim().to_string();
    if normalized_stream_id.is_empty() {
        return Err("Anthropic ask-user response requires a stream id".to_string());
    }
    let normalized_request_id = response.request_id.trim().to_string();
    if normalized_request_id.is_empty() {
        return Err("Anthropic ask-user response requires a request id".to_string());
    }

    let stdin = {
        let tasks = ai_agent_sdk_tasks().lock().await;
        tasks
            .get(&normalized_stream_id)
            .map(|entry| entry.stdin.clone())
            .ok_or_else(|| "Anthropic Agent SDK stream is no longer active.".to_string())?
    };

    let line = serde_json::to_string(&serde_json::json!({
        "kind": "ask_user_response",
        "requestId": normalized_request_id,
        "answers": response.answers,
    }))
    .map_err(|error| format!("Failed to serialize ask-user response: {error}"))?;

    let mut stdin_guard = stdin.lock().await;
    stdin_guard
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to send ask-user response to the SDK bridge: {error}"))?;
    stdin_guard
        .flush()
        .await
        .map_err(|error| format!("Failed to flush ask-user response to the SDK bridge: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn respond_ai_anthropic_sdk_exit_plan(
    response: AiAnthropicSdkExitPlanResponse,
) -> Result<(), String> {
    let normalized_stream_id = response.stream_id.trim().to_string();
    if normalized_stream_id.is_empty() {
        return Err("Anthropic exit-plan response requires a stream id".to_string());
    }
    let normalized_request_id = response.request_id.trim().to_string();
    if normalized_request_id.is_empty() {
        return Err("Anthropic exit-plan response requires a request id".to_string());
    }

    let stdin = {
        let tasks = ai_agent_sdk_tasks().lock().await;
        tasks
            .get(&normalized_stream_id)
            .map(|entry| entry.stdin.clone())
            .ok_or_else(|| "Anthropic Agent SDK stream is no longer active.".to_string())?
    };

    let line = serde_json::to_string(&serde_json::json!({
        "kind": "exit_plan_response",
        "requestId": normalized_request_id,
        "action": response.action,
        "feedback": response.feedback,
    }))
    .map_err(|error| format!("Failed to serialize exit-plan response: {error}"))?;

    let mut stdin_guard = stdin.lock().await;
    stdin_guard
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to send exit-plan response to the SDK bridge: {error}"))?;
    stdin_guard
        .flush()
        .await
        .map_err(|error| format!("Failed to flush exit-plan response to the SDK bridge: {error}"))?;

    Ok(())
}
