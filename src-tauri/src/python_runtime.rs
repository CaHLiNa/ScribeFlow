use crate::process_utils::background_tokio_command;
use regex_lite::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonRuntimeInfo {
    pub found: bool,
    pub path: String,
    pub version: String,
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
}

#[derive(Debug, Clone)]
struct PythonInvocation {
    program: String,
    args: Vec<String>,
    display_path: String,
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
    command.arg("--version");

    let output = command.output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    let raw = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let version_re = Regex::new(r"Python\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)").ok()?;
    let version = version_re
        .captures(&raw)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
        .unwrap_or_default();

    Some(PythonRuntimeInfo {
        found: true,
        path: invocation.display_path.clone(),
        version,
    })
}

async fn resolve_python_runtime() -> Option<(PythonInvocation, PythonRuntimeInfo)> {
    for candidate in build_python_candidates() {
        if let Some(info) = probe_python(&candidate).await {
            return Some((candidate, info));
        }
    }
    None
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
    Ok(resolve_python_runtime()
        .await
        .map(|(_, info)| info)
        .unwrap_or(PythonRuntimeInfo {
            found: false,
            path: String::new(),
            version: String::new(),
        }))
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

    let Some((invocation, info)) = resolve_python_runtime().await else {
        return Err("Python interpreter not found in PATH.".to_string());
    };

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
        interpreter_path: info.path,
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
