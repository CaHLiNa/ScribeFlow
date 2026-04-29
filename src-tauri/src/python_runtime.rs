use crate::process_utils::background_tokio_command;
use regex_lite::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::time::Instant;

const PYTHON_PROBE_SCRIPT: &str = r#"import json, os, platform, sys; print(json.dumps({"version": platform.python_version(), "executable": os.path.realpath(sys.executable)}))"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PythonRuntimeInfo {
    pub found: bool,
    pub path: String,
    pub version: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonRuntimeListResult {
    pub interpreters: Vec<PythonRuntimeInfo>,
    pub selected_interpreter: Option<PythonRuntimeInfo>,
    pub resolved_interpreter: Option<PythonRuntimeInfo>,
    pub selection_valid: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonCompileIssue {
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonCompileResult {
    pub success: bool,
    pub interpreter_path: String,
    pub interpreter_version: String,
    pub command_preview: String,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub errors: Vec<PythonCompileIssue>,
    pub warnings: Vec<PythonCompileIssue>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonCompileParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub interpreter_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonRuntimeListParams {
    #[serde(default)]
    pub interpreter_path: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PythonProbePayload {
    #[serde(default)]
    version: String,
    #[serde(default)]
    executable: String,
}

#[derive(Debug, Clone)]
struct PythonInvocation {
    program: String,
    args: Vec<String>,
    display_path: String,
}

fn not_found_runtime() -> PythonRuntimeInfo {
    PythonRuntimeInfo {
        found: false,
        path: String::new(),
        version: String::new(),
        source: String::new(),
    }
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_default()
}

fn add_candidate(
    candidates: &mut Vec<PythonInvocation>,
    seen: &mut HashSet<String>,
    program: impl Into<String>,
    args: Vec<String>,
    display_path: impl Into<String>,
) {
    let program = program.into();
    let display_path = display_path.into();
    let key = format!("{program}::{args:?}::{display_path}");
    if seen.insert(key) {
        candidates.push(PythonInvocation {
            program,
            args,
            display_path,
        });
    }
}

fn build_python_candidates() -> Vec<PythonInvocation> {
    let home = home_dir();
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    add_candidate(&mut candidates, &mut seen, "python3", vec![], "python3");
    add_candidate(&mut candidates, &mut seen, "python", vec![], "python");

    #[cfg(windows)]
    {
        add_candidate(
            &mut candidates,
            &mut seen,
            "py",
            vec!["-3".to_string()],
            "py -3",
        );
        add_candidate(&mut candidates, &mut seen, "py", vec![], "py");
    }

    if !home.is_empty() {
        for path in [
            format!("{home}/.pyenv/shims/python3"),
            format!("{home}/.pyenv/shims/python"),
            format!("{home}/.local/bin/python3"),
            format!("{home}/.local/bin/python"),
            format!("{home}/miniconda3/bin/python"),
            format!("{home}/miniforge3/bin/python"),
            format!("{home}/anaconda3/bin/python"),
        ] {
            add_candidate(&mut candidates, &mut seen, path.clone(), vec![], path);
        }
    }

    #[cfg(target_os = "macos")]
    {
        for path in [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
            "/usr/bin/python",
        ] {
            add_candidate(
                &mut candidates,
                &mut seen,
                path.to_string(),
                vec![],
                path.to_string(),
            );
        }

        if !home.is_empty() {
            for minor in 9..=13 {
                let user_path = format!("{home}/Library/Python/3.{minor}/bin/python3");
                add_candidate(
                    &mut candidates,
                    &mut seen,
                    user_path.clone(),
                    vec![],
                    user_path,
                );

                let framework_path =
                    format!("/Library/Frameworks/Python.framework/Versions/3.{minor}/bin/python3");
                add_candidate(
                    &mut candidates,
                    &mut seen,
                    framework_path.clone(),
                    vec![],
                    framework_path,
                );
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for path in [
            "/usr/bin/python3",
            "/usr/bin/python",
            "/usr/local/bin/python3",
        ] {
            add_candidate(
                &mut candidates,
                &mut seen,
                path.to_string(),
                vec![],
                path.to_string(),
            );
        }
    }

    candidates
}

async fn probe_python(invocation: &PythonInvocation) -> Option<PythonRuntimeInfo> {
    let mut command = background_tokio_command(&invocation.program);
    command.args(&invocation.args);
    command.arg("-c");
    command.arg(PYTHON_PROBE_SCRIPT);

    let output = command.output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let payload = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<PythonProbePayload>(line.trim()).ok())?;

    let executable_path = if payload.executable.trim().is_empty() {
        invocation.display_path.trim().to_string()
    } else {
        payload.executable.trim().to_string()
    };

    Some(PythonRuntimeInfo {
        found: true,
        path: executable_path,
        version: payload.version.trim().to_string(),
        source: invocation.display_path.clone(),
    })
}

fn build_runtime_invocation(runtime: &PythonRuntimeInfo) -> PythonInvocation {
    PythonInvocation {
        program: runtime.path.clone(),
        args: vec![],
        display_path: runtime.path.clone(),
    }
}

fn normalize_interpreter_request(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
        return "auto".to_string();
    }
    trimmed.to_string()
}

fn normalize_runtime_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn matches_runtime_path(runtime: &PythonRuntimeInfo, requested_path: &str) -> bool {
    normalize_runtime_key(&runtime.path) == normalize_runtime_key(requested_path)
}

fn merge_selected_runtime(runtimes: &mut Vec<PythonRuntimeInfo>, selected: &PythonRuntimeInfo) {
    if runtimes
        .iter()
        .any(|runtime| matches_runtime_path(runtime, &selected.path))
    {
        return;
    }
    runtimes.insert(0, selected.clone());
}

async fn discover_python_runtimes() -> Vec<PythonRuntimeInfo> {
    let mut runtimes = Vec::new();
    let mut seen = HashSet::new();

    for candidate in build_python_candidates() {
        if let Some(info) = probe_python(&candidate).await {
            let key = normalize_runtime_key(&info.path);
            if seen.insert(key) {
                runtimes.push(info);
            }
        }
    }

    runtimes
}

async fn probe_explicit_python(path: &str) -> Option<PythonRuntimeInfo> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return None;
    }

    probe_python(&PythonInvocation {
        program: normalized.to_string(),
        args: vec![],
        display_path: normalized.to_string(),
    })
    .await
}

async fn resolve_python_runtime_list(requested_path: &str) -> PythonRuntimeListResult {
    let normalized_request = normalize_interpreter_request(requested_path);
    let mut interpreters = discover_python_runtimes().await;
    let is_auto = normalized_request == "auto";

    let selected_interpreter = if is_auto {
        None
    } else if let Some(runtime) = interpreters
        .iter()
        .find(|runtime| matches_runtime_path(runtime, &normalized_request))
        .cloned()
    {
        Some(runtime)
    } else if let Some(runtime) = probe_explicit_python(&normalized_request).await {
        merge_selected_runtime(&mut interpreters, &runtime);
        Some(runtime)
    } else {
        None
    };

    let resolved_interpreter = if is_auto {
        interpreters.first().cloned()
    } else {
        selected_interpreter.clone()
    };
    let selection_valid = is_auto || resolved_interpreter.is_some();

    PythonRuntimeListResult {
        interpreters,
        selected_interpreter,
        resolved_interpreter,
        selection_valid,
    }
}

async fn resolve_python_runtime(
    requested_path: &str,
) -> Result<(PythonInvocation, PythonRuntimeInfo), String> {
    let runtime_list = resolve_python_runtime_list(requested_path).await;
    let normalized_request = normalize_interpreter_request(requested_path);

    let runtime = runtime_list.resolved_interpreter.ok_or_else(|| {
        if normalized_request == "auto" {
            "Python interpreter not found in PATH.".to_string()
        } else {
            format!(
                "Selected Python interpreter is not available: {}",
                normalized_request
            )
        }
    })?;

    Ok((build_runtime_invocation(&runtime), runtime))
}

fn parse_compile_issue(stderr: &str) -> Vec<PythonCompileIssue> {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return vec![];
    }

    let line_re = Regex::new(r#"line\s+([0-9]+)"#).ok();
    let line = line_re
        .as_ref()
        .and_then(|regex| regex.captures(trimmed))
        .and_then(|captures| captures.get(1))
        .and_then(|value| value.as_str().parse::<u32>().ok());

    let message = trimmed
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
        .unwrap_or_else(|| "Python compile failed".to_string());

    vec![PythonCompileIssue {
        line,
        column: None,
        message,
        raw: trimmed.to_string(),
    }]
}

#[tauri::command]
pub async fn python_runtime_detect() -> Result<PythonRuntimeInfo, String> {
    Ok(resolve_python_runtime_list("auto")
        .await
        .resolved_interpreter
        .unwrap_or_else(not_found_runtime))
}

#[tauri::command]
pub async fn python_runtime_list(
    params: PythonRuntimeListParams,
) -> Result<PythonRuntimeListResult, String> {
    Ok(resolve_python_runtime_list(&params.interpreter_path).await)
}

#[tauri::command]
pub async fn python_runtime_compile(
    params: PythonCompileParams,
) -> Result<PythonCompileResult, String> {
    let file_path = params.file_path.trim().to_string();
    if file_path.is_empty() {
        return Err("Missing Python file path.".to_string());
    }
    if !Path::new(&file_path).exists() {
        return Err(format!("Python file does not exist: {file_path}"));
    }

    let (invocation, info) = resolve_python_runtime(&params.interpreter_path).await?;

    let started_at = Instant::now();
    let mut command = background_tokio_command(&invocation.program);
    command.args(&invocation.args);
    command.arg(&file_path);
    let output = command
        .output()
        .await
        .map_err(|error| format!("Failed to run Python file: {error}"))?;

    let duration_ms = started_at.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let success = output.status.success();
    let exit_code = output.status.code().unwrap_or(-1);
    let command_preview = format!("{} {}", invocation.display_path, file_path);

    Ok(PythonCompileResult {
        success,
        interpreter_path: info.path.clone(),
        interpreter_version: info.version,
        command_preview,
        duration_ms,
        stdout: if success { stdout } else { String::new() },
        stderr: stderr.clone(),
        exit_code,
        errors: if success {
            vec![]
        } else {
            parse_compile_issue(&stderr)
        },
        warnings: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::{merge_selected_runtime, normalize_interpreter_request, PythonRuntimeInfo};

    fn runtime(path: &str, version: &str) -> PythonRuntimeInfo {
        PythonRuntimeInfo {
            found: true,
            path: path.to_string(),
            version: version.to_string(),
            source: path.to_string(),
        }
    }

    #[test]
    fn normalizes_empty_interpreter_request_to_auto() {
        assert_eq!(normalize_interpreter_request(""), "auto");
        assert_eq!(normalize_interpreter_request("  "), "auto");
        assert_eq!(normalize_interpreter_request("AUTO"), "auto");
    }

    #[test]
    fn merges_missing_selected_runtime_into_front_of_list() {
        let mut runtimes = vec![runtime("/usr/bin/python3", "3.9.6")];
        let selected = runtime("/opt/homebrew/bin/python3.13", "3.13.2");

        merge_selected_runtime(&mut runtimes, &selected);

        assert_eq!(runtimes.first(), Some(&selected));
        assert_eq!(runtimes.len(), 2);
    }
}
