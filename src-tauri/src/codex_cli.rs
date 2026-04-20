use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::app_dirs;
#[cfg(windows)]
use crate::process_utils::background_command;

static RUNNING_CODEX_CLI_SESSIONS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();
static INTERRUPTED_CODEX_CLI_SESSIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static CODEX_EXEC_SEARCH_FLAG_SUPPORT: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

fn running_sessions() -> &'static Mutex<HashMap<String, u32>> {
    RUNNING_CODEX_CLI_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn interrupted_sessions() -> &'static Mutex<HashSet<String>> {
    INTERRUPTED_CODEX_CLI_SESSIONS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn search_flag_support_cache() -> &'static Mutex<HashMap<String, bool>> {
    CODEX_EXEC_SEARCH_FLAG_SUPPORT.get_or_init(|| Mutex::new(HashMap::new()))
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

fn bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_bool))
        .unwrap_or(false)
}

fn normalize_codex_cli_config(config: &Value) -> Value {
    let command_path = string_field(config, &["commandPath", "command"]);
    let sandbox_mode = match string_field(config, &["sandboxMode", "sandbox"]).as_str() {
        "read-only" => "read-only",
        "danger-full-access" => "danger-full-access",
        "workspace-write" => "workspace-write",
        _ => "workspace-write",
    };
    let resolved_command_path = if command_path.is_empty() {
        "codex".to_string()
    } else {
        command_path
    };
    json!({
        "commandPath": resolved_command_path,
        "model": string_field(config, &["model"]),
        "profile": string_field(config, &["profile"]),
        "sandboxMode": sandbox_mode,
        "webSearch": bool_field(config, &["webSearch"]),
        "useAsciiWorkspaceAlias": config
            .get("useAsciiWorkspaceAlias")
            .and_then(Value::as_bool)
            .unwrap_or(true),
    })
}

fn preview_text(value: &str, max_chars: usize) -> String {
    let normalized = trim(value);
    if normalized.is_empty() {
        return normalized;
    }
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    normalized
        .chars()
        .take(max_chars)
        .collect::<String>()
        .trim_end()
        .to_string()
        + "…"
}

fn resolve_ascii_workspace_alias(workspace_path: &str) -> Result<String, String> {
    let normalized = trim(workspace_path);
    if normalized.is_empty() {
        return Ok(String::new());
    }

    if normalized.is_ascii() {
        return Ok(normalized);
    }

    let alias_key = URL_SAFE_NO_PAD.encode(normalized.as_bytes());
    let alias_parent = app_dirs::data_root_dir()?.join("workspaces").join(alias_key);
    fs::create_dir_all(&alias_parent).map_err(|error| error.to_string())?;
    let alias_path = alias_parent.join("codex-root");
    let target = PathBuf::from(&normalized);

    if alias_path.exists() {
        if fs::canonicalize(&alias_path).ok() == fs::canonicalize(&target).ok() {
            return Ok(alias_path.to_string_lossy().to_string());
        }
        let _ = fs::remove_file(&alias_path);
        let _ = fs::remove_dir_all(&alias_path);
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&target, &alias_path).map_err(|error| error.to_string())?;
    }

    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(&target, &alias_path)
            .map_err(|error| error.to_string())?;
    }

    Ok(alias_path.to_string_lossy().to_string())
}

async fn resolve_command_state(command_path: &str) -> (bool, String, String) {
    let normalized = if command_path.trim().is_empty() {
        "codex"
    } else {
        command_path.trim()
    };
    match Command::new(normalized)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let version = if stdout.is_empty() { stderr.clone() } else { stdout };
            (output.status.success(), version, stderr)
        }
        Err(error) => (false, String::new(), error.to_string()),
    }
}

async fn codex_exec_supports_search_flag(command_path: &str) -> bool {
    let normalized = if command_path.trim().is_empty() {
        "codex".to_string()
    } else {
        command_path.trim().to_string()
    };

    if let Some(cached) = search_flag_support_cache()
        .lock()
        .await
        .get(&normalized)
        .copied()
    {
        return cached;
    }

    let supported = match Command::new(&normalized)
        .arg("exec")
        .arg("--help")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            stdout.contains("--search") || stderr.contains("--search")
        }
        Err(_) => false,
    };

    search_flag_support_cache()
        .lock()
        .await
        .insert(normalized, supported);
    supported
}

fn parse_codex_jsonl_event(line: &str) -> Option<Value> {
    let trimmed = line.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    serde_json::from_str::<Value>(trimmed).ok()
}

fn last_error_message(events: &[Value], stderr_text: &str, exit_code: Option<i32>) -> String {
    if let Some(message) = events.iter().rev().find_map(|event| {
        if event.get("type").and_then(Value::as_str) == Some("error") {
            event.get("message").and_then(Value::as_str).map(trim)
        } else {
            None
        }
    }) {
        return message;
    }

    let stderr_preview = preview_text(stderr_text, 4000);
    if !stderr_preview.is_empty() {
        return stderr_preview;
    }

    match exit_code {
        Some(code) => format!("Codex CLI exited with status {code}."),
        None => "Codex CLI execution failed.".to_string(),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliStateResolveParams {
    #[serde(default)]
    pub config: Value,
}

#[tauri::command]
pub async fn codex_cli_state_resolve(params: CodexCliStateResolveParams) -> Result<Value, String> {
    let normalized = normalize_codex_cli_config(&params.config);
    let command_path = string_field(&normalized, &["commandPath"]);
    let (installed, version, error) = resolve_command_state(&command_path).await;
    let supports_search_flag = if installed {
        codex_exec_supports_search_flag(&command_path).await
    } else {
        false
    };
    let model = string_field(&normalized, &["model"]);
    let profile = string_field(&normalized, &["profile"]);

    Ok(json!({
        "installed": installed,
        "ready": installed,
        "commandPath": command_path,
        "version": version,
        "error": if installed { String::new() } else { error },
        "model": model,
        "profile": profile,
        "sandboxMode": string_field(&normalized, &["sandboxMode"]),
        "webSearch": bool_field(&normalized, &["webSearch"]),
        "supportsSearchFlag": supports_search_flag,
        "useAsciiWorkspaceAlias": normalized
            .get("useAsciiWorkspaceAlias")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        "displayModel": if !model.is_empty() {
            model
        } else if !profile.is_empty() {
            format!("profile:{profile}")
        } else {
            "Codex defaults".to_string()
        },
    }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliRunParams {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub config: Value,
}

#[tauri::command]
pub async fn codex_cli_run(params: CodexCliRunParams) -> Result<Value, String> {
    let session_id = trim(&params.session_id);
    if session_id.is_empty() {
        return Err("Codex CLI session id is required.".to_string());
    }

    let prompt = trim(&params.prompt);
    if prompt.is_empty() {
        return Err("Codex CLI prompt is required.".to_string());
    }

    let normalized = normalize_codex_cli_config(&params.config);
    let command_path = string_field(&normalized, &["commandPath"]);
    let supports_search_flag = codex_exec_supports_search_flag(&command_path).await;
    let use_alias = normalized
        .get("useAsciiWorkspaceAlias")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let target_cwd = if use_alias {
        resolve_ascii_workspace_alias(&params.cwd)?
    } else {
        trim(&params.cwd)
    };

    let output_dir = app_dirs::data_root_dir()?.join("codex-cli");
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;
    let output_file = output_dir.join(format!("{session_id}.last-message.txt"));
    let _ = fs::remove_file(&output_file);

    let mut command = Command::new(&command_path);
    command
        .arg("exec")
        .arg("--json")
        .arg("--ephemeral")
        .arg("--disable")
        .arg("codex_hooks")
        .arg("--disable")
        .arg("plugins")
        .arg("--disable")
        .arg("responses_websockets")
        .arg("--disable")
        .arg("responses_websockets_v2")
        .arg("--output-last-message")
        .arg(&output_file)
        .arg("--sandbox")
        .arg(string_field(&normalized, &["sandboxMode"]))
        .arg("-");

    if !target_cwd.is_empty() {
        command.arg("-C").arg(&target_cwd);
    } else {
        command.arg("--skip-git-repo-check");
    }

    let model = string_field(&normalized, &["model"]);
    if !model.is_empty() {
        command.arg("--model").arg(model);
    }

    let profile = string_field(&normalized, &["profile"]);
    if !profile.is_empty() {
        command.arg("--profile").arg(profile);
    }

    if bool_field(&normalized, &["webSearch"]) && supports_search_flag {
        command.arg("--search");
    }

    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch Codex CLI: {error}"))?;
    if let Some(pid) = child.id() {
        running_sessions().lock().await.insert(session_id.clone(), pid);
    }

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|error| format!("Failed to write Codex CLI prompt: {error}"))?;
        stdin.shutdown().await.ok();
    }

    let stdout_pipe = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture Codex CLI stdout.".to_string())?;
    let stderr_pipe = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture Codex CLI stderr.".to_string())?;
    let mut stdout_lines = BufReader::new(stdout_pipe).lines();
    let mut stderr_lines = BufReader::new(stderr_pipe).lines();
    let mut stdout_done = false;
    let mut stderr_done = false;
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut events: Vec<Value> = Vec::new();
    let mut content = String::new();
    let mut early_terminated = false;

    while !stdout_done || !stderr_done {
        tokio::select! {
            line = stdout_lines.next_line(), if !stdout_done => {
                match line {
                    Ok(Some(line)) => {
                        stdout.push_str(&line);
                        stdout.push('\n');
                        if let Some(event) = parse_codex_jsonl_event(&line) {
                            if content.trim().is_empty()
                                && event.get("type").and_then(Value::as_str) == Some("item.completed")
                            {
                                let item = event.get("item").unwrap_or(&Value::Null);
                                if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                                    content = item
                                        .get("text")
                                        .and_then(Value::as_str)
                                        .map(trim)
                                        .unwrap_or_default();
                                }
                            }
                            events.push(event);
                        }

                        if !content.trim().is_empty() {
                            early_terminated = true;
                            break;
                        }
                    }
                    Ok(None) => stdout_done = true,
                    Err(error) => {
                        stderr.push_str(&format!("Failed to read Codex CLI stdout: {error}\n"));
                        stdout_done = true;
                    }
                }
            }
            line = stderr_lines.next_line(), if !stderr_done => {
                match line {
                    Ok(Some(line)) => {
                        stderr.push_str(&line);
                        stderr.push('\n');
                    }
                    Ok(None) => stderr_done = true,
                    Err(error) => {
                        stderr.push_str(&format!("Failed to read Codex CLI stderr: {error}\n"));
                        stderr_done = true;
                    }
                }
            }
        }
    }

    if early_terminated {
        let _ = child.kill().await;
    }

    let output_status = child
        .wait()
        .await
        .map_err(|error| format!("Codex CLI execution failed: {error}"))?;

    running_sessions().lock().await.remove(&session_id);
    let interrupted = interrupted_sessions().lock().await.remove(&session_id);

    if interrupted {
        let _ = fs::remove_file(&output_file);
        return Err("AI execution stopped.".to_string());
    }

    if content.trim().is_empty() {
        content = fs::read_to_string(&output_file).unwrap_or_default();
    }
    if content.trim().is_empty() {
        content = events
            .iter()
            .rev()
            .find_map(|event| {
                if event.get("type").and_then(Value::as_str) == Some("item.completed") {
                    let item = event.get("item").unwrap_or(&Value::Null);
                    if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                        return item.get("text").and_then(Value::as_str).map(trim);
                    }
                }
                None
            })
            .unwrap_or_default();
    }
    let _ = fs::remove_file(&output_file);

    if !output_status.success() && content.trim().is_empty() {
        return Err(last_error_message(&events, &stderr, output_status.code()));
    }

    Ok(json!({
        "transport": "codex-cli",
        "content": trim(&content),
        "threadId": events.iter().find_map(|event| {
            if event.get("type").and_then(Value::as_str) == Some("thread.started") {
                event.get("thread_id").and_then(Value::as_str).map(trim)
            } else {
                None
            }
        }).unwrap_or_default(),
        "events": events,
        "stderrPreview": preview_text(&stderr, 4000),
        "cwd": target_cwd,
        "supportsSearchFlag": supports_search_flag,
    }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliInterruptParams {
    #[serde(default)]
    pub session_id: String,
}

fn terminate_pid(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        if result == 0 {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        if error.kind() == std::io::ErrorKind::NotFound {
            return Ok(());
        }
        return Err(error.to_string());
    }

    #[cfg(windows)]
    {
        let status = background_command("taskkill")
            .arg("/PID")
            .arg(pid.to_string())
            .arg("/T")
            .arg("/F")
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("taskkill failed: {status}"));
    }
}

#[tauri::command]
pub async fn codex_cli_interrupt(params: CodexCliInterruptParams) -> Result<Value, String> {
    let session_id = trim(&params.session_id);
    if session_id.is_empty() {
        return Ok(json!({ "interrupted": false }));
    }

    let pid = running_sessions().lock().await.get(&session_id).copied();
    let Some(pid) = pid else {
        return Ok(json!({ "interrupted": false }));
    };

    interrupted_sessions().lock().await.insert(session_id);
    terminate_pid(pid)?;
    Ok(json!({ "interrupted": true }))
}
