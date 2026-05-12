use crate::process_utils::background_tokio_command;
use regex_lite::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
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
    pub interpreter: PythonRuntimeInfo,
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

fn string_payload_field(params: &Value, key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn python_runtime_list_params_from_payload(params: Value) -> PythonRuntimeListParams {
    PythonRuntimeListParams {
        interpreter_path: string_payload_field(&params, "interpreterPath"),
    }
}

fn python_compile_params_from_payload(params: Value) -> PythonCompileParams {
    PythonCompileParams {
        file_path: string_payload_field(&params, "filePath"),
        interpreter_path: string_payload_field(&params, "interpreterPath"),
    }
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

fn normalize_runtime_info(runtime: Option<PythonRuntimeInfo>) -> PythonRuntimeInfo {
    runtime
        .map(|runtime| PythonRuntimeInfo {
            found: runtime.found,
            path: runtime.path.trim().to_string(),
            version: runtime.version.trim().to_string(),
            source: runtime.source.trim().to_string(),
        })
        .unwrap_or_else(not_found_runtime)
}

fn normalize_compile_issue(issue: PythonCompileIssue) -> PythonCompileIssue {
    PythonCompileIssue {
        line: issue.line,
        column: issue.column,
        message: issue.message.trim().to_string(),
        raw: issue.raw.trim().to_string(),
    }
}

fn normalize_runtime_list_result(result: PythonRuntimeListResult) -> PythonRuntimeListResult {
    PythonRuntimeListResult {
        interpreters: result
            .interpreters
            .into_iter()
            .map(|runtime| normalize_runtime_info(Some(runtime)))
            .collect(),
        selected_interpreter: Some(normalize_runtime_info(result.selected_interpreter)),
        resolved_interpreter: Some(normalize_runtime_info(result.resolved_interpreter)),
        selection_valid: result.selection_valid,
    }
}

fn normalize_compile_result(result: PythonCompileResult) -> PythonCompileResult {
    let interpreter = normalize_runtime_info(Some(result.interpreter));
    PythonCompileResult {
        success: result.success,
        interpreter_path: interpreter.path.clone(),
        interpreter_version: interpreter.version.clone(),
        interpreter,
        command_preview: result.command_preview,
        duration_ms: result.duration_ms,
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
        errors: result
            .errors
            .into_iter()
            .map(normalize_compile_issue)
            .collect(),
        warnings: result
            .warnings
            .into_iter()
            .map(normalize_compile_issue)
            .collect(),
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
    Ok(normalize_runtime_info(
        resolve_python_runtime_list("auto")
            .await
            .resolved_interpreter,
    ))
}

#[tauri::command]
pub async fn python_runtime_list(params: Value) -> Result<PythonRuntimeListResult, String> {
    let params = python_runtime_list_params_from_payload(params);
    Ok(normalize_runtime_list_result(
        resolve_python_runtime_list(&params.interpreter_path).await,
    ))
}

#[tauri::command]
pub async fn python_runtime_compile(params: Value) -> Result<PythonCompileResult, String> {
    let params = python_compile_params_from_payload(params);
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

    Ok(normalize_compile_result(PythonCompileResult {
        success,
        interpreter: info,
        interpreter_path: String::new(),
        interpreter_version: String::new(),
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
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        merge_selected_runtime, normalize_compile_issue, normalize_compile_result,
        normalize_interpreter_request, normalize_runtime_info, normalize_runtime_list_result,
        not_found_runtime, python_compile_params_from_payload,
        python_runtime_list_params_from_payload, PythonCompileIssue, PythonCompileResult,
        PythonRuntimeInfo, PythonRuntimeListResult,
    };
    use serde_json::json;

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
    fn python_runtime_params_normalize_raw_payloads() {
        let list_params = python_runtime_list_params_from_payload(json!({
            "interpreterPath": 42
        }));
        assert_eq!(list_params.interpreter_path, "");

        let list_params = python_runtime_list_params_from_payload(json!({
            "interpreterPath": " /opt/homebrew/bin/python3 "
        }));
        assert_eq!(list_params.interpreter_path, " /opt/homebrew/bin/python3 ");

        let compile_params = python_compile_params_from_payload(json!({
            "filePath": 42,
            "interpreterPath": null
        }));
        assert_eq!(compile_params.file_path, "");
        assert_eq!(compile_params.interpreter_path, "");

        let compile_params = python_compile_params_from_payload(json!({
            "filePath": "/tmp/script.py",
            "interpreterPath": "/usr/bin/python3"
        }));
        assert_eq!(compile_params.file_path, "/tmp/script.py");
        assert_eq!(compile_params.interpreter_path, "/usr/bin/python3");
    }

    #[test]
    fn merges_missing_selected_runtime_into_front_of_list() {
        let mut runtimes = vec![runtime("/usr/bin/python3", "3.9.6")];
        let selected = runtime("/opt/homebrew/bin/python3.13", "3.13.2");

        merge_selected_runtime(&mut runtimes, &selected);

        assert_eq!(runtimes.first(), Some(&selected));
        assert_eq!(runtimes.len(), 2);
    }

    #[test]
    fn python_runtime_result_normalization_stays_in_rust() {
        assert_eq!(normalize_runtime_info(None), not_found_runtime());
        assert_eq!(
            normalize_runtime_info(Some(PythonRuntimeInfo {
                found: true,
                path: " /usr/bin/python3 ".to_string(),
                version: " 3.13.0 ".to_string(),
                source: " python3 ".to_string(),
            })),
            PythonRuntimeInfo {
                found: true,
                path: "/usr/bin/python3".to_string(),
                version: "3.13.0".to_string(),
                source: "python3".to_string(),
            }
        );

        let list_result = normalize_runtime_list_result(PythonRuntimeListResult {
            interpreters: vec![PythonRuntimeInfo {
                found: true,
                path: " /usr/bin/python3 ".to_string(),
                version: " 3.13.0 ".to_string(),
                source: " python3 ".to_string(),
            }],
            selected_interpreter: None,
            resolved_interpreter: None,
            selection_valid: false,
        });

        assert_eq!(list_result.interpreters[0].path, "/usr/bin/python3");
        assert_eq!(list_result.selected_interpreter, Some(not_found_runtime()));
        assert_eq!(list_result.resolved_interpreter, Some(not_found_runtime()));

        assert_eq!(
            normalize_compile_issue(PythonCompileIssue {
                line: Some(12),
                column: None,
                message: " SyntaxError ".to_string(),
                raw: " raw stderr ".to_string(),
            }),
            PythonCompileIssue {
                line: Some(12),
                column: None,
                message: "SyntaxError".to_string(),
                raw: "raw stderr".to_string(),
            }
        );

        let compile_result = normalize_compile_result(PythonCompileResult {
            success: true,
            interpreter: PythonRuntimeInfo {
                found: true,
                path: " /usr/bin/python3 ".to_string(),
                version: " 3.13.0 ".to_string(),
                source: " python3 ".to_string(),
            },
            interpreter_path: " stale ".to_string(),
            interpreter_version: " stale ".to_string(),
            command_preview: "python3 script.py".to_string(),
            duration_ms: 7,
            stdout: "ok".to_string(),
            stderr: String::new(),
            exit_code: 0,
            errors: vec![PythonCompileIssue {
                line: None,
                column: None,
                message: " warning ".to_string(),
                raw: " raw ".to_string(),
            }],
            warnings: vec![],
        });

        assert_eq!(compile_result.interpreter.path, "/usr/bin/python3");
        assert_eq!(compile_result.interpreter_path, "/usr/bin/python3");
        assert_eq!(compile_result.interpreter_version, "3.13.0");
        assert_eq!(compile_result.errors[0].message, "warning");
    }
}
