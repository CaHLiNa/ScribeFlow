use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::ChildStdin;
use tokio::sync::{oneshot, Mutex};

use crate::process_utils::background_tokio_command;

const AI_AGENT_STREAM_EVENT: &str = "ai-agent-stream";
const CODEX_ACP_NPM_PACKAGE: &str = "@zed-industries/codex-acp";

#[derive(Default)]
pub struct CodexAcpRuntimeHandle {
    sessions: Arc<Mutex<HashMap<String, CodexAcpSessionHandle>>>,
}

#[derive(Clone)]
struct CodexAcpSessionHandle {
    overlay_session_id: String,
    workspace_path: String,
    stdin: Arc<Mutex<ChildStdin>>,
    pending_requests: Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    open_permission_requests: Arc<Mutex<HashSet<u64>>>,
    runtime_session_id: Arc<Mutex<String>>,
    next_request_id: Arc<AtomicU64>,
    pid: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpEnsureSessionParams {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub runtime_session_id: String,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub config: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpEnsureSessionResponse {
    pub ok: bool,
    pub session_id: String,
    pub runtime_session_id: String,
    pub transport: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpPromptStartParams {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub pending_assistant_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpPromptStartResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpCancelParams {
    #[serde(default)]
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpCancelResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpPermissionRespondParams {
    #[serde(default)]
    pub session_id: String,
    pub request_id: u64,
    #[serde(default)]
    pub option_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpPermissionRespondResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAcpCloseSessionParams {
    #[serde(default)]
    pub session_id: String,
}

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(Value::as_str) {
            let normalized = trim(entry);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    String::new()
}

fn object_field<'a>(value: &'a Value, key: &str) -> Option<&'a serde_json::Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

fn array_field(value: &Value, key: &str) -> Vec<Value> {
    value.get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn runtime_session_id_from_response(response: &Value, fallback: &str) -> String {
    let runtime_session_id = string_field(response, &["sessionId", "session_id"]);
    if runtime_session_id.is_empty() {
        trim(fallback)
    } else {
        runtime_session_id
    }
}

fn prepend_path_dir(existing_path: Option<String>, dir: &Path) -> Option<String> {
    let dir_string = dir.to_string_lossy().to_string();
    if dir_string.trim().is_empty() {
        return existing_path;
    }

    let separator = if cfg!(windows) { ";" } else { ":" };
    match existing_path {
        Some(path) if !path.trim().is_empty() => Some(format!("{dir_string}{separator}{path}")),
        _ => Some(dir_string),
    }
}

fn local_codex_acp_bin_candidates(workspace_path: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let workspace = trim(workspace_path);
    if !workspace.is_empty() {
        let root = PathBuf::from(&workspace);
        candidates.push(root.join("node_modules").join(".bin").join("codex-acp"));
        #[cfg(windows)]
        candidates.push(root.join("node_modules").join(".bin").join("codex-acp.cmd"));
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("node_modules").join(".bin").join("codex-acp"));
        #[cfg(windows)]
        candidates.push(current_dir.join("node_modules").join(".bin").join("codex-acp.cmd"));
    }

    candidates
}

fn codex_acp_command_candidates(workspace_path: &str) -> Vec<(String, Vec<String>)> {
    let mut commands = local_codex_acp_bin_candidates(workspace_path)
        .into_iter()
        .filter(|path| path.exists())
        .map(|path| (path.to_string_lossy().to_string(), Vec::<String>::new()))
        .collect::<Vec<_>>();

    commands.push((
        "npx".to_string(),
        vec!["-y".to_string(), CODEX_ACP_NPM_PACKAGE.to_string()],
    ));

    commands
}

fn acp_client_capabilities() -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": {
                "readTextFile": true,
                "writeTextFile": true,
            }
        }
    })
}

fn emit_ai_agent_event<R: Runtime>(app: &AppHandle<R>, payload: Value) {
    let _ = app.emit(AI_AGENT_STREAM_EVENT, payload);
}

async fn send_json_message(stdin: &Arc<Mutex<ChildStdin>>, payload: &Value) -> Result<(), String> {
    let mut writer = stdin.lock().await;
    let serialized = serde_json::to_string(payload).map_err(|error| error.to_string())?;
    writer
        .write_all(serialized.as_bytes())
        .await
        .map_err(|error| error.to_string())?;
    writer
        .write_all(b"\n")
        .await
        .map_err(|error| error.to_string())?;
    writer.flush().await.map_err(|error| error.to_string())
}

async fn send_request(
    session: &CodexAcpSessionHandle,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let request_id = session.next_request_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = oneshot::channel::<Result<Value, String>>();
    session.pending_requests.lock().await.insert(request_id, tx);

    let payload = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    });

    if let Err(error) = send_json_message(&session.stdin, &payload).await {
        if let Some(sender) = session.pending_requests.lock().await.remove(&request_id) {
            let _ = sender.send(Err(error.clone()));
        }
        return Err(error);
    }

    match rx.await {
        Ok(result) => result,
        Err(_) => Err(format!("ACP request failed: {method}")),
    }
}

async fn send_response(
    session: &CodexAcpSessionHandle,
    request_id: u64,
    result: Value,
) -> Result<(), String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "result": result,
    });
    send_json_message(&session.stdin, &payload).await
}

async fn send_error_response(
    session: &CodexAcpSessionHandle,
    request_id: u64,
    message: &str,
) -> Result<(), String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {
            "code": -32603,
            "message": trim(message),
        }
    });
    send_json_message(&session.stdin, &payload).await
}

async fn handle_fs_read_request<R: Runtime>(
    app: &AppHandle<R>,
    session: &CodexAcpSessionHandle,
    request_id: u64,
    params: &Value,
) {
    let path = string_field(params, &["path"]);
    let session_path = if Path::new(&path).is_absolute() || path.trim().is_empty() {
        path
    } else {
        PathBuf::from(&session.workspace_path)
            .join(path)
            .to_string_lossy()
            .to_string()
    };

    match fs::read_to_string(&session_path).await {
        Ok(content) => {
            let _ = send_response(session, request_id, json!({ "content": content })).await;
        }
        Err(error) => {
            let message = format!("Failed to read file {session_path}: {error}");
            let _ = send_error_response(session, request_id, &message).await;
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "runtime-note",
                    "sessionId": session.overlay_session_id,
                    "level": "error",
                    "text": message,
                }),
            );
        }
    }
}

async fn handle_fs_write_request<R: Runtime>(
    app: &AppHandle<R>,
    session: &CodexAcpSessionHandle,
    request_id: u64,
    params: &Value,
) {
    let path = string_field(params, &["path"]);
    let content = string_field(params, &["content"]);
    let session_path = if Path::new(&path).is_absolute() || path.trim().is_empty() {
        path
    } else {
        PathBuf::from(&session.workspace_path)
            .join(path)
            .to_string_lossy()
            .to_string()
    };

    let write_result = async {
        if let Some(parent) = Path::new(&session_path).parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|error| error.to_string())?;
        }
        fs::write(&session_path, content.as_bytes())
            .await
            .map_err(|error| error.to_string())
    }
    .await;

    match write_result {
        Ok(_) => {
            let _ = send_response(session, request_id, Value::Null).await;
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "file-written",
                    "sessionId": session.overlay_session_id,
                    "path": session_path,
                    "content": content,
                }),
            );
        }
        Err(error) => {
            let message = format!("Failed to write file {session_path}: {error}");
            let _ = send_error_response(session, request_id, &message).await;
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "runtime-note",
                    "sessionId": session.overlay_session_id,
                    "level": "error",
                    "text": message,
                }),
            );
        }
    }
}

fn acp_tool_kind(value: &Value) -> String {
    let kind = string_field(value, &["kind"]);
    if kind.is_empty() {
        "execute".to_string()
    } else {
        kind
    }
}

fn acp_tool_status(value: &Value) -> String {
    let status = string_field(value, &["status"]);
    if status.is_empty() {
        "pending".to_string()
    } else {
        status
    }
}

fn is_transport_warning_text(text: &str) -> bool {
    let normalized = trim(text);
    normalized.starts_with("Falling back from WebSockets to HTTPS transport.")
}

async fn handle_session_update<R: Runtime>(
    app: &AppHandle<R>,
    session: &CodexAcpSessionHandle,
    params: &Value,
) {
    let update = params.get("update").cloned().unwrap_or(Value::Null);
    let update_kind = string_field(&update, &["sessionUpdate"]);

    match update_kind.as_str() {
        "agent_message_chunk" => {
            let content = update.get("content").cloned().unwrap_or(Value::Null);
            let text = string_field(&content, &["text"]);
            if !text.is_empty() {
                if is_transport_warning_text(&text) {
                    emit_ai_agent_event(
                        app,
                        json!({
                            "kind": "runtime-note",
                            "sessionId": session.overlay_session_id,
                            "level": "warning",
                            "text": text,
                        }),
                    );
                    return;
                }
                emit_ai_agent_event(
                    app,
                    json!({
                        "kind": "assistant-delta",
                        "sessionId": session.overlay_session_id,
                        "text": text,
                    }),
                );
            }
        }
        "agent_thought_chunk" => {
            let content = update.get("content").cloned().unwrap_or(Value::Null);
            let text = string_field(&content, &["text"]);
            if !text.is_empty() {
                emit_ai_agent_event(
                    app,
                    json!({
                        "kind": "thinking-delta",
                        "sessionId": session.overlay_session_id,
                        "text": text,
                    }),
                );
            }
        }
        "tool_call" | "tool_call_update" => {
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "tool-update",
                    "sessionId": session.overlay_session_id,
                    "toolCallId": string_field(&update, &["toolCallId"]),
                    "title": string_field(&update, &["title"]),
                    "status": acp_tool_status(&update),
                    "toolKind": acp_tool_kind(&update),
                    "rawInput": update.get("rawInput").cloned().unwrap_or(Value::Null),
                    "locations": update.get("locations").cloned().unwrap_or(Value::Array(Vec::new())),
                    "content": update.get("content").cloned().unwrap_or(Value::Array(Vec::new())),
                }),
            );
        }
        "plan" => {
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "plan-update",
                    "sessionId": session.overlay_session_id,
                    "entries": update.get("entries").cloned().unwrap_or(Value::Array(Vec::new())),
                }),
            );
        }
        "config_option_update" => {
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "config-options",
                    "sessionId": session.overlay_session_id,
                    "configOptions": update.get("configOptions").cloned().unwrap_or(Value::Array(Vec::new())),
                }),
            );
        }
        "usage_update" => {
            emit_ai_agent_event(
                app,
                json!({
                    "kind": "usage-update",
                    "sessionId": session.overlay_session_id,
                    "used": update.get("used").cloned().unwrap_or(Value::Null),
                    "size": update.get("size").cloned().unwrap_or(Value::Null),
                }),
            );
        }
        _ => {}
    }
}

async fn handle_permission_request<R: Runtime>(
    app: &AppHandle<R>,
    session: &CodexAcpSessionHandle,
    request_id: u64,
    params: &Value,
) {
    session.open_permission_requests.lock().await.insert(request_id);
    let options = array_field(params, "options");
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let raw_input = tool_call.get("rawInput").cloned().unwrap_or(Value::Null);
    let input_preview = if raw_input.is_null() {
        String::new()
    } else {
        serde_json::to_string_pretty(&raw_input)
            .unwrap_or_else(|_| raw_input.to_string())
    };

    emit_ai_agent_event(
        app,
        json!({
            "kind": "permission-request",
            "sessionId": session.overlay_session_id,
            "requestId": request_id,
            "options": options,
            "toolCall": tool_call,
            "inputPreview": input_preview,
        }),
    );
}

async fn handle_message_line<R: Runtime>(
    app: &AppHandle<R>,
    session: &CodexAcpSessionHandle,
    line: &str,
) {
    let Ok(message) = serde_json::from_str::<Value>(line) else {
        return;
    };

    if let Some(id) = message.get("id").and_then(Value::as_u64) {
        if let Some(method) = message.get("method").and_then(Value::as_str) {
            let params = message.get("params").cloned().unwrap_or(Value::Null);
            match method {
                "session/request_permission" => {
                    handle_permission_request(app, session, id, &params).await;
                }
                "fs/read_text_file" => {
                    handle_fs_read_request(app, session, id, &params).await;
                }
                "fs/write_text_file" => {
                    handle_fs_write_request(app, session, id, &params).await;
                }
                _ => {}
            }
            return;
        }

        if let Some(sender) = session.pending_requests.lock().await.remove(&id) {
            if let Some(error) = object_field(&message, "error") {
                let error_message = error
                    .get("message")
                    .and_then(Value::as_str)
                    .map(trim)
                    .unwrap_or_else(|| "ACP request failed.".to_string());
                let _ = sender.send(Err(error_message));
            } else {
                let _ = sender.send(Ok(message.get("result").cloned().unwrap_or(Value::Null)));
            }
        }
        return;
    }

    if let Some(method) = message.get("method").and_then(Value::as_str) {
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        if method == "session/update" {
            handle_session_update(app, session, &params).await;
        }
    }
}

fn resolve_codex_acp_command(
    workspace_path: &str,
) -> (String, Vec<String>) {
    codex_acp_command_candidates(workspace_path)
        .into_iter()
        .next()
        .unwrap_or_else(|| ("npx".to_string(), vec!["-y".to_string(), CODEX_ACP_NPM_PACKAGE.to_string()]))
}

async fn spawn_codex_acp_session<R: Runtime>(
    app: AppHandle<R>,
    sessions_registry: Arc<Mutex<HashMap<String, CodexAcpSessionHandle>>>,
    overlay_session_id: &str,
    workspace_path: &str,
    config: &Value,
) -> Result<CodexAcpSessionHandle, String> {
    let (program, args) = resolve_codex_acp_command(workspace_path);
    let mut command = background_tokio_command(program);
    command.args(args);
    command.current_dir(if workspace_path.trim().is_empty() {
        "."
    } else {
        workspace_path.trim()
    });
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    if let Some(command_path) = config
        .get("commandPath")
        .and_then(Value::as_str)
        .map(trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(parent) = Path::new(&command_path).parent() {
            let path = prepend_path_dir(env::var("PATH").ok(), parent);
            if let Some(next_path) = path {
                command.env("PATH", next_path);
            }
        }
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch Codex ACP bridge: {error}"))?;

    let pid = child.id().unwrap_or_default();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to capture Codex ACP stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture Codex ACP stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture Codex ACP stderr.".to_string())?;

    let session = CodexAcpSessionHandle {
        overlay_session_id: overlay_session_id.to_string(),
        workspace_path: workspace_path.to_string(),
        stdin: Arc::new(Mutex::new(stdin)),
        pending_requests: Arc::new(Mutex::new(HashMap::new())),
        open_permission_requests: Arc::new(Mutex::new(HashSet::new())),
        runtime_session_id: Arc::new(Mutex::new(String::new())),
        next_request_id: Arc::new(AtomicU64::new(1)),
        pid,
    };

    let stdout_session = session.clone();
    let stdout_app = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => handle_message_line(&stdout_app, &stdout_session, &line).await,
                Ok(None) => break,
                Err(error) => {
                    emit_ai_agent_event(
                        &stdout_app,
                        json!({
                            "kind": "runtime-note",
                            "sessionId": stdout_session.overlay_session_id,
                            "level": "error",
                            "text": format!("ACP stdout closed unexpectedly: {error}"),
                        }),
                    );
                    break;
                }
            }
        }
    });

    let stderr_session = session.clone();
    let stderr_app = app.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let normalized = trim(&line);
                    if normalized.is_empty() {
                        continue;
                    }
                    emit_ai_agent_event(
                        &stderr_app,
                        json!({
                            "kind": "runtime-stderr",
                            "sessionId": stderr_session.overlay_session_id,
                            "text": normalized,
                        }),
                    );
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }
    });

    let wait_sessions = session.clone();
    let wait_app = app.clone();
    let wait_registry = sessions_registry.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        let message = match status {
            Ok(exit) => format!("Codex ACP exited: {}", exit),
            Err(error) => format!("Codex ACP exited unexpectedly: {error}"),
        };
        wait_registry
            .lock()
            .await
            .remove(&wait_sessions.overlay_session_id);
        for (_, sender) in wait_sessions.pending_requests.lock().await.drain() {
            let _ = sender.send(Err(message.clone()));
        }
        emit_ai_agent_event(
            &wait_app,
            json!({
                "kind": "session-exit",
                "sessionId": wait_sessions.overlay_session_id,
                "text": message,
            }),
        );
    });

    let initialize_response = send_request(&session, "initialize", acp_client_capabilities()).await?;
    if initialize_response.is_null() {
        return Err("Codex ACP initialize returned empty response.".to_string());
    }

    Ok(session)
}

async fn create_or_load_runtime_session(
    session: &CodexAcpSessionHandle,
    cwd: &str,
    requested_runtime_session_id: &str,
) -> Result<String, String> {
    let normalized_cwd = {
        let trimmed_cwd = trim(cwd);
        if trimmed_cwd.is_empty() {
            PathBuf::from(&session.workspace_path).to_string_lossy().to_string()
        } else if Path::new(&trimmed_cwd).is_absolute() {
            trimmed_cwd
        } else {
            PathBuf::from(&session.workspace_path)
                .join(trimmed_cwd)
                .to_string_lossy()
                .to_string()
        }
    };

    let normalized_runtime_session_id = trim(requested_runtime_session_id);
    let response = if normalized_runtime_session_id.is_empty() {
        send_request(
            session,
            "session/new",
            json!({
                "cwd": normalized_cwd,
                "mcpServers": Vec::<Value>::new(),
            }),
        )
        .await?
    } else {
        match send_request(
            session,
            "session/load",
            json!({
                "sessionId": normalized_runtime_session_id,
                "cwd": normalized_cwd,
                "mcpServers": Vec::<Value>::new(),
            }),
        )
        .await
        {
            Ok(response) => response,
            Err(_) => {
                send_request(
                    session,
                    "session/new",
                    json!({
                        "cwd": normalized_cwd,
                        "resumeSessionId": normalized_runtime_session_id,
                        "mcpServers": Vec::<Value>::new(),
                    }),
                )
                .await?
            }
        }
    };

    let runtime_session_id = runtime_session_id_from_response(&response, &normalized_runtime_session_id);
    if runtime_session_id.is_empty() {
        return Err("Codex ACP session did not return a session id.".to_string());
    }

    *session.runtime_session_id.lock().await = runtime_session_id.clone();
    Ok(runtime_session_id)
}

async fn try_apply_model(
    session: &CodexAcpSessionHandle,
    config: &Value,
) {
    let model = string_field(config, &["model"]);
    if model.is_empty() {
        return;
    }

    let runtime_session_id = session.runtime_session_id.lock().await.clone();
    if runtime_session_id.is_empty() {
        return;
    }

    let _ = send_request(
        session,
        "session/set_model",
        json!({
            "sessionId": runtime_session_id,
            "modelId": model,
        }),
    )
    .await;
}

#[tauri::command]
pub async fn codex_acp_session_ensure<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: State<'_, CodexAcpRuntimeHandle>,
    params: CodexAcpEnsureSessionParams,
) -> Result<CodexAcpEnsureSessionResponse, String> {
    let overlay_session_id = trim(&params.session_id);
    if overlay_session_id.is_empty() {
        return Err("Session id is required.".to_string());
    }

    if let Some(existing) = runtime_state
        .sessions
        .lock()
        .await
        .get(&overlay_session_id)
        .cloned()
    {
        try_apply_model(&existing, &params.config).await;
        let runtime_session_id = existing.runtime_session_id.lock().await.clone();
        emit_ai_agent_event(
            &app,
            json!({
                "kind": "session-ready",
                "sessionId": overlay_session_id,
                "runtimeSessionId": runtime_session_id,
                "transport": "codex-acp",
            }),
        );
        return Ok(CodexAcpEnsureSessionResponse {
            ok: true,
            session_id: overlay_session_id,
            runtime_session_id,
            transport: "codex-acp".to_string(),
        });
    }

    let session = spawn_codex_acp_session(
        app.clone(),
        runtime_state.sessions.clone(),
        &overlay_session_id,
        &params.workspace_path,
        &params.config,
    )
    .await?;
    let runtime_session_id =
        create_or_load_runtime_session(&session, &params.cwd, &params.runtime_session_id).await?;
    try_apply_model(&session, &params.config).await;

    runtime_state
        .sessions
        .lock()
        .await
        .insert(overlay_session_id.clone(), session);

    emit_ai_agent_event(
        &app,
        json!({
            "kind": "session-ready",
            "sessionId": overlay_session_id,
            "runtimeSessionId": runtime_session_id,
            "transport": "codex-acp",
        }),
    );

    Ok(CodexAcpEnsureSessionResponse {
        ok: true,
        session_id: trim(&params.session_id),
        runtime_session_id: runtime_session_id_from_response(
            &json!({"sessionId": runtime_session_id}),
            "",
        ),
        transport: "codex-acp".to_string(),
    })
}

#[tauri::command]
pub async fn codex_acp_prompt_start<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: State<'_, CodexAcpRuntimeHandle>,
    params: CodexAcpPromptStartParams,
) -> Result<CodexAcpPromptStartResponse, String> {
    let overlay_session_id = trim(&params.session_id);
    if overlay_session_id.is_empty() {
        return Err("Session id is required.".to_string());
    }
    let prompt = trim(&params.prompt);
    if prompt.is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let session = runtime_state
        .sessions
        .lock()
        .await
        .get(&overlay_session_id)
        .cloned()
        .ok_or_else(|| "Codex ACP session is unavailable.".to_string())?;
    let runtime_session_id = session.runtime_session_id.lock().await.clone();
    if runtime_session_id.is_empty() {
        return Err("Codex ACP runtime session is unavailable.".to_string());
    }

    emit_ai_agent_event(
        &app,
        json!({
            "kind": "prompt-started",
            "sessionId": overlay_session_id,
            "pendingAssistantId": trim(&params.pending_assistant_id),
        }),
    );

    let prompt_session = session.clone();
    let prompt_app = app.clone();
    let prompt_text = prompt.clone();
    let prompt_overlay_session_id = overlay_session_id.clone();
    tokio::spawn(async move {
        let result = send_request(
            &prompt_session,
            "session/prompt",
            json!({
                "sessionId": runtime_session_id,
                "prompt": [{
                    "type": "text",
                    "text": prompt_text,
                }],
            }),
        )
        .await;

        match result {
            Ok(response) => {
                emit_ai_agent_event(
                    &prompt_app,
                    json!({
                        "kind": "prompt-finished",
                        "sessionId": prompt_overlay_session_id,
                        "stopReason": string_field(&response, &["stopReason"]),
                        "usage": response.get("usage").cloned().unwrap_or(Value::Null),
                    }),
                );
            }
            Err(error) => {
                emit_ai_agent_event(
                    &prompt_app,
                    json!({
                        "kind": "prompt-error",
                        "sessionId": prompt_overlay_session_id,
                        "error": error,
                    }),
                );
            }
        }
    });

    Ok(CodexAcpPromptStartResponse { ok: true })
}

#[tauri::command]
pub async fn codex_acp_prompt_cancel<R: Runtime>(
    app: AppHandle<R>,
    runtime_state: State<'_, CodexAcpRuntimeHandle>,
    params: CodexAcpCancelParams,
) -> Result<CodexAcpCancelResponse, String> {
    let overlay_session_id = trim(&params.session_id);
    if overlay_session_id.is_empty() {
        return Err("Session id is required.".to_string());
    }
    let session = runtime_state
        .sessions
        .lock()
        .await
        .get(&overlay_session_id)
        .cloned()
        .ok_or_else(|| "Codex ACP session is unavailable.".to_string())?;
    let runtime_session_id = session.runtime_session_id.lock().await.clone();
    if runtime_session_id.is_empty() {
        return Err("Codex ACP runtime session is unavailable.".to_string());
    }

    send_json_message(
        &session.stdin,
        &json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": {
                "sessionId": runtime_session_id,
            }
        }),
    )
    .await?;

    emit_ai_agent_event(
        &app,
        json!({
            "kind": "prompt-cancelled",
            "sessionId": overlay_session_id,
        }),
    );

    Ok(CodexAcpCancelResponse { ok: true })
}

#[tauri::command]
pub async fn codex_acp_permission_respond(
    runtime_state: State<'_, CodexAcpRuntimeHandle>,
    params: CodexAcpPermissionRespondParams,
) -> Result<CodexAcpPermissionRespondResponse, String> {
    let overlay_session_id = trim(&params.session_id);
    if overlay_session_id.is_empty() {
        return Err("Session id is required.".to_string());
    }
    let option_id = trim(&params.option_id);
    if option_id.is_empty() {
        return Err("Permission option id is required.".to_string());
    }

    let session = runtime_state
        .sessions
        .lock()
        .await
        .get(&overlay_session_id)
        .cloned()
        .ok_or_else(|| "Codex ACP session is unavailable.".to_string())?;

    if !session
        .open_permission_requests
        .lock()
        .await
        .remove(&params.request_id)
    {
        return Err("Permission request is no longer pending.".to_string());
    }

    send_response(
        &session,
        params.request_id,
        json!({
            "outcome": {
                "outcome": if option_id.contains("reject") { "rejected" } else { "selected" },
                "optionId": option_id,
            }
        }),
    )
    .await?;

    Ok(CodexAcpPermissionRespondResponse { ok: true })
}

#[tauri::command]
pub async fn codex_acp_session_close(
    runtime_state: State<'_, CodexAcpRuntimeHandle>,
    params: CodexAcpCloseSessionParams,
) -> Result<Value, String> {
    let overlay_session_id = trim(&params.session_id);
    if overlay_session_id.is_empty() {
        return Ok(json!({ "ok": false }));
    }
    let Some(session) = runtime_state.sessions.lock().await.remove(&overlay_session_id) else {
        return Ok(json!({ "ok": false }));
    };

    let runtime_session_id = session.runtime_session_id.lock().await.clone();
    if !runtime_session_id.is_empty() {
        let _ = send_request(
            &session,
            "session/close",
            json!({
                "sessionId": runtime_session_id,
            }),
        )
        .await;
    }

    #[cfg(unix)]
    {
        if session.pid > 0 {
            unsafe {
                libc::kill(session.pid as i32, libc::SIGTERM);
            }
        }
    }

    #[cfg(windows)]
    {
        if session.pid > 0 {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &session.pid.to_string(), "/T", "/F"])
                .status();
        }
    }

    Ok(json!({ "ok": true }))
}
