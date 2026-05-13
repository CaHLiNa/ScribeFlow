use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};

use crate::document_workflow::get_document_workflow_kind;
use crate::latex::LatexError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowUiResolveParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub preview_state: Value,
    #[serde(default)]
    pub markdown_state: Value,
    #[serde(default)]
    pub latex_state: Value,
    #[serde(default)]
    pub python_state: Value,
    #[serde(default)]
    pub queue_state: Value,
    #[serde(default)]
    pub artifact_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexProblemsResolveParams {
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub state: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPythonProblemsResolveParams {
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub state: Value,
}

fn payload_field<'a>(params: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    let object = params.as_object()?;
    keys.iter().find_map(|key| object.get(*key))
}

fn string_payload_field(params: &Value, keys: &[&str]) -> String {
    payload_field(params, keys)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn value_payload_field(params: &Value, keys: &[&str], default: Value) -> Value {
    payload_field(params, keys).cloned().unwrap_or(default)
}

fn objectish_payload_field(params: &Value, keys: &[&str]) -> Value {
    match payload_field(params, keys) {
        Some(value @ (Value::Object(_) | Value::Array(_))) => value.clone(),
        _ => Value::Object(Default::default()),
    }
}

fn document_workflow_ui_params_from_payload(params: Value) -> DocumentWorkflowUiResolveParams {
    DocumentWorkflowUiResolveParams {
        file_path: string_payload_field(&params, &["filePath", "file_path"]),
        preview_state: value_payload_field(&params, &["previewState", "preview_state"], Value::Null),
        markdown_state: value_payload_field(&params, &["markdownState", "markdown_state"], Value::Null),
        latex_state: value_payload_field(&params, &["latexState", "latex_state"], Value::Null),
        python_state: value_payload_field(&params, &["pythonState", "python_state"], Value::Null),
        queue_state: value_payload_field(&params, &["queueState", "queue_state"], Value::Null),
        artifact_path: string_payload_field(&params, &["artifactPath", "artifact_path"]),
    }
}

fn document_workflow_latex_problems_params_from_payload(
    params: Value,
) -> DocumentWorkflowLatexProblemsResolveParams {
    DocumentWorkflowLatexProblemsResolveParams {
        source_path: string_payload_field(&params, &["sourcePath", "source_path"]),
        state: objectish_payload_field(&params, &["state"]),
    }
}

fn document_workflow_python_problems_params_from_payload(
    params: Value,
) -> DocumentWorkflowPythonProblemsResolveParams {
    DocumentWorkflowPythonProblemsResolveParams {
        source_path: string_payload_field(&params, &["sourcePath", "source_path"]),
        state: objectish_payload_field(&params, &["state"]),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowProblem {
    pub id: String,
    pub source_path: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub severity: String,
    pub message: String,
    pub origin: String,
    pub actionable: bool,
    pub raw: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRuntimeIssue {
    pub line: Option<u32>,
    pub column: Option<u32>,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub raw: String,
}

fn array_len(value: Option<&Value>) -> usize {
    value
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0)
}

fn count_markdown_problems(markdown_state: &Value) -> (usize, usize) {
    let problems = markdown_state
        .get("problems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    problems
        .iter()
        .fold((0usize, 0usize), |(errors, warnings), problem| {
            let severity = problem
                .get("severity")
                .and_then(Value::as_str)
                .unwrap_or("error");
            if severity == "warning" {
                (errors, warnings + 1)
            } else {
                (errors + 1, warnings)
            }
        })
}

fn bool_at(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn string_at<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn normalize_fs_path(value: &str) -> String {
    value.trim().replace('\\', "/")
}

fn is_absolute_fs_path(value: &str) -> bool {
    let normalized = normalize_fs_path(value);
    normalized.starts_with('/')
        || (normalized.len() >= 3
            && normalized.as_bytes()[1] == b':'
            && normalized.as_bytes()[2] == b'/'
            && normalized
                .as_bytes()
                .first()
                .map(|byte| byte.is_ascii_alphabetic())
                .unwrap_or(false))
}

fn normalize_path_components(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                let _ = normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
        }
    }
    normalized
}

fn dirname_path(value: &str) -> String {
    let normalized = normalize_fs_path(value);
    if normalized.is_empty() {
        return ".".to_string();
    }
    if normalized == "/" {
        return "/".to_string();
    }
    if normalized.len() == 2 && normalized.as_bytes()[1] == b':' {
        return format!("{normalized}/");
    }

    let trimmed = normalized.trim_end_matches('/');
    if trimmed.len() == 2 && trimmed.as_bytes()[1] == b':' {
        return format!("{trimmed}/");
    }

    match trimmed.rfind('/') {
        None => ".".to_string(),
        Some(0) => "/".to_string(),
        Some(index) => {
            let head = &trimmed[..index];
            if head.len() == 2 && head.as_bytes()[1] == b':' {
                format!("{head}/")
            } else {
                head.to_string()
            }
        }
    }
}

fn resolve_relative_path(base_dir: &str, target: &str) -> String {
    let normalized_target = normalize_fs_path(target);
    if normalized_target.is_empty() || is_absolute_fs_path(&normalized_target) {
        return normalized_target;
    }

    let base = normalize_fs_path(base_dir);
    let joined = if base.is_empty() {
        PathBuf::from(normalized_target)
    } else {
        Path::new(&base).join(normalized_target)
    };
    normalize_fs_path(&normalize_path_components(&joined).to_string_lossy())
}

fn resolve_latex_problem_source_path(
    problem: &LatexError,
    fallback_source_path: &str,
    state: &Value,
) -> String {
    let fallback_source_path = normalize_fs_path(fallback_source_path);
    let reported_path = normalize_fs_path(
        problem
            .file
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(&fallback_source_path),
    );
    if reported_path.is_empty() {
        return fallback_source_path;
    }
    if is_absolute_fs_path(&reported_path) {
        return reported_path;
    }

    let base_path = first_non_empty(vec![
        normalize_fs_path(string_at(state, "compileTargetPath")),
        normalize_fs_path(string_at(state, "projectRootPath")),
        fallback_source_path.clone(),
    ]);
    if base_path.is_empty() {
        return reported_path;
    }

    resolve_relative_path(&dirname_path(&base_path), &reported_path)
}

fn first_non_empty(values: Vec<String>) -> String {
    values
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default()
}

fn latex_issues_at(state: &Value, key: &str) -> Vec<LatexError> {
    state
        .get(key)
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<LatexError>>(value).ok())
        .unwrap_or_default()
}

fn build_latex_workflow_problem(
    source_path: &str,
    state: &Value,
    severity: &str,
    problem: &LatexError,
    index: usize,
) -> DocumentWorkflowProblem {
    let problem_source_path = resolve_latex_problem_source_path(problem, source_path, state);
    DocumentWorkflowProblem {
        id: format!("latex:{severity}:{problem_source_path}:{index}"),
        source_path: problem_source_path,
        line: problem.line,
        column: problem.column,
        severity: severity.to_string(),
        message: problem.message.clone(),
        origin: "compile".to_string(),
        actionable: true,
        raw: problem
            .raw
            .clone()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| problem.message.clone()),
    }
}

pub fn resolve_latex_workflow_problems(
    params: &DocumentWorkflowLatexProblemsResolveParams,
) -> Vec<DocumentWorkflowProblem> {
    let source_path = normalize_fs_path(&params.source_path);
    let errors = latex_issues_at(&params.state, "errors");
    let warnings = latex_issues_at(&params.state, "warnings");

    errors
        .iter()
        .enumerate()
        .map(|(index, problem)| {
            build_latex_workflow_problem(&source_path, &params.state, "error", problem, index)
        })
        .chain(warnings.iter().enumerate().map(|(index, problem)| {
            build_latex_workflow_problem(&source_path, &params.state, "warning", problem, index)
        }))
        .collect()
}

fn runtime_issues_at(state: &Value, key: &str) -> Vec<WorkflowRuntimeIssue> {
    state
        .get(key)
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<WorkflowRuntimeIssue>>(value).ok())
        .unwrap_or_default()
}

fn build_python_workflow_problem(
    source_path: &str,
    severity: &str,
    problem: &WorkflowRuntimeIssue,
    index: usize,
) -> DocumentWorkflowProblem {
    DocumentWorkflowProblem {
        id: format!("python:{severity}:{source_path}:{index}"),
        source_path: source_path.to_string(),
        line: problem.line,
        column: problem.column,
        severity: severity.to_string(),
        message: problem.message.clone(),
        origin: "compile".to_string(),
        actionable: true,
        raw: if problem.raw.is_empty() {
            problem.message.clone()
        } else {
            problem.raw.clone()
        },
    }
}

pub fn resolve_python_workflow_problems(
    params: &DocumentWorkflowPythonProblemsResolveParams,
) -> Vec<DocumentWorkflowProblem> {
    let source_path = normalize_fs_path(&params.source_path);
    let errors = runtime_issues_at(&params.state, "errors");
    let warnings = runtime_issues_at(&params.state, "warnings");

    errors
        .iter()
        .enumerate()
        .map(|(index, problem)| {
            build_python_workflow_problem(&source_path, "error", problem, index)
        })
        .chain(warnings.iter().enumerate().map(|(index, problem)| {
            build_python_workflow_problem(&source_path, "warning", problem, index)
        }))
        .collect()
}

fn build_ui_state(
    kind: &str,
    phase: &str,
    preview_kind: Option<&str>,
    error_count: usize,
    warning_count: usize,
    can_reveal_preview: bool,
    can_open_pdf: bool,
    primary_action: &str,
) -> Value {
    let status_tone = resolve_workflow_status_tone(kind, phase);
    json!({
        "kind": kind,
        "previewKind": preview_kind,
        "phase": phase,
        "statusTone": status_tone,
        "errorCount": error_count,
        "warningCount": warning_count,
        "canShowProblems": error_count > 0 || warning_count > 0,
        "canRevealPreview": can_reveal_preview,
        "canOpenPdf": can_open_pdf,
        "forwardSync": "precise",
        "backwardSync": true,
        "primaryAction": primary_action,
    })
}

fn resolve_workflow_status_tone(kind: &str, phase: &str) -> &'static str {
    if kind == "markdown" {
        return match phase {
            "rendering" => "running",
            "error" => "error",
            "ready" => "success",
            _ => "muted",
        };
    }

    match phase {
        "running" | "compiling" | "rendering" => "running",
        "queued" => "warning",
        "error" => "error",
        "ready" => "success",
        _ => "muted",
    }
}

fn resolve_markdown_ui_state(params: &DocumentWorkflowUiResolveParams) -> Value {
    let (error_count, warning_count) = count_markdown_problems(&params.markdown_state);
    let preview_visible = bool_at(&params.preview_state, "previewVisible");
    let markdown_status = string_at(&params.markdown_state, "status");

    let phase = if markdown_status == "rendering" {
        "rendering"
    } else if markdown_status == "error" {
        "error"
    } else if preview_visible || markdown_status == "ready" {
        "ready"
    } else {
        "idle"
    };

    build_ui_state(
        "markdown",
        phase,
        Some("html"),
        error_count,
        warning_count,
        true,
        false,
        "refresh",
    )
}

fn resolve_latex_ui_state(params: &DocumentWorkflowUiResolveParams) -> Value {
    let error_count = array_len(params.latex_state.get("errors"));
    let warning_count = array_len(params.latex_state.get("warnings"));
    let artifact_ready = !params.artifact_path.trim().is_empty();
    let compile_status = string_at(&params.latex_state, "status");
    let queue_phase = string_at(&params.queue_state, "phase");
    let preview_kind = string_at(&params.preview_state, "previewKind");

    let phase = if compile_status == "compiling" {
        "compiling"
    } else if queue_phase == "scheduled" || queue_phase == "queued" {
        "queued"
    } else if compile_status == "error" {
        "error"
    } else if artifact_ready || compile_status == "success" {
        "ready"
    } else {
        "idle"
    };

    build_ui_state(
        "latex",
        phase,
        if preview_kind.is_empty() {
            None
        } else {
            Some(preview_kind)
        },
        error_count,
        warning_count,
        false,
        artifact_ready,
        "compile",
    )
}

fn resolve_python_ui_state(params: &DocumentWorkflowUiResolveParams) -> Value {
    let error_count = array_len(params.python_state.get("errors"));
    let warning_count = array_len(params.python_state.get("warnings"));
    let status = string_at(&params.python_state, "status");

    let phase = if status == "compiling" {
        "compiling"
    } else if status == "running" {
        "running"
    } else if status == "error" {
        "error"
    } else if status == "success" {
        "ready"
    } else {
        "idle"
    };

    build_ui_state(
        "python",
        phase,
        Some("terminal"),
        error_count,
        warning_count,
        true,
        false,
        "run",
    )
}

pub fn resolve_document_workflow_ui_state(params: &DocumentWorkflowUiResolveParams) -> Value {
    let file_path = params.file_path.trim();
    if file_path.is_empty() {
        return Value::Null;
    }

    let Some(kind) = get_document_workflow_kind(file_path) else {
        return Value::Null;
    };

    match kind {
        "markdown" => resolve_markdown_ui_state(params),
        "latex" => resolve_latex_ui_state(params),
        "python" => resolve_python_ui_state(params),
        _ => Value::Null,
    }
}

#[tauri::command]
pub async fn document_workflow_ui_resolve(params: Value) -> Result<Value, String> {
    let params = document_workflow_ui_params_from_payload(params);
    Ok(resolve_document_workflow_ui_state(&params))
}

#[tauri::command]
pub async fn document_workflow_latex_problems_resolve(
    params: Value,
) -> Result<Vec<DocumentWorkflowProblem>, String> {
    let params = document_workflow_latex_problems_params_from_payload(params);
    Ok(resolve_latex_workflow_problems(&params))
}

#[tauri::command]
pub async fn document_workflow_python_problems_resolve(
    params: Value,
) -> Result<Vec<DocumentWorkflowProblem>, String> {
    let params = document_workflow_python_problems_params_from_payload(params);
    Ok(resolve_python_workflow_problems(&params))
}

#[cfg(test)]
mod tests {
    use super::{
        document_workflow_latex_problems_params_from_payload,
        document_workflow_latex_problems_resolve, document_workflow_python_problems_resolve,
        document_workflow_python_problems_params_from_payload,
        document_workflow_ui_params_from_payload, document_workflow_ui_resolve,
        resolve_document_workflow_ui_state, resolve_latex_workflow_problems,
        resolve_python_workflow_problems, resolve_workflow_status_tone,
        DocumentWorkflowLatexProblemsResolveParams, DocumentWorkflowPythonProblemsResolveParams,
        DocumentWorkflowUiResolveParams,
    };
    use serde_json::{json, Value};

    #[test]
    fn document_workflow_ui_params_normalize_raw_payloads() {
        let params = document_workflow_ui_params_from_payload(json!({
            "file_path": "/tmp/raw.py",
            "preview_state": false,
            "markdownState": "invalid",
            "latex_state": {
                "status": "success"
            },
            "pythonState": null,
            "queue_state": ["queued"],
            "artifact_path": "/tmp/raw.pdf"
        }));

        assert_eq!(params.file_path, "/tmp/raw.py");
        assert_eq!(params.preview_state, Value::Bool(false));
        assert_eq!(params.markdown_state, Value::String("invalid".to_string()));
        assert_eq!(
            params.latex_state.get("status").and_then(Value::as_str),
            Some("success")
        );
        assert_eq!(params.python_state, Value::Null);
        assert!(params.queue_state.is_array());
        assert_eq!(params.artifact_path, "/tmp/raw.pdf");

        let invalid = document_workflow_ui_params_from_payload(json!(false));
        assert!(invalid.file_path.is_empty());
        assert_eq!(invalid.preview_state, Value::Null);
        assert_eq!(invalid.markdown_state, Value::Null);
    }

    #[test]
    fn document_workflow_problem_params_normalize_raw_payloads() {
        let latex_params = document_workflow_latex_problems_params_from_payload(json!({
            "source_path": "/tmp/main.tex",
            "state": "invalid"
        }));
        assert_eq!(latex_params.source_path, "/tmp/main.tex");
        assert_eq!(latex_params.state, json!({}));

        let python_params = document_workflow_python_problems_params_from_payload(json!({
            "sourcePath": "/tmp/main.py",
            "state": [
                { "message": "kept for rust normalization" }
            ]
        }));
        assert_eq!(python_params.source_path, "/tmp/main.py");
        assert!(python_params.state.is_array());
    }

    #[tokio::test]
    async fn document_workflow_commands_accept_raw_payloads() {
        let value = document_workflow_ui_resolve(json!({
            "file_path": "/tmp/test.py",
            "python_state": {
                "status": "success",
                "errors": [],
                "warnings": []
            }
        }))
        .await
        .expect("resolve ui from raw payload");

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("python"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("ready"));

        let problems = document_workflow_python_problems_resolve(json!({
            "source_path": "/tmp/test.py",
            "state": {
                "errors": [
                    { "message": "SyntaxError", "raw": "" }
                ]
            }
        }))
        .await
        .expect("resolve problems from raw payload");

        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].id, "python:error:/tmp/test.py:0");

        let invalid_latex = document_workflow_latex_problems_resolve(json!(null))
            .await
            .expect("resolve invalid latex payload");
        assert!(invalid_latex.is_empty());
    }

    #[test]
    fn resolves_markdown_ui_state_from_preview_and_render_state() {
        let value = resolve_document_workflow_ui_state(&DocumentWorkflowUiResolveParams {
            file_path: "/tmp/test.md".to_string(),
            preview_state: json!({
                "previewVisible": true,
                "previewKind": "html",
            }),
            markdown_state: json!({
                "status": "ready",
                "problems": [
                    { "severity": "warning" }
                ]
            }),
            latex_state: Value::Null,
            python_state: Value::Null,
            queue_state: Value::Null,
            artifact_path: String::new(),
        });

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("markdown"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("ready"));
        assert_eq!(
            value.get("statusTone").and_then(Value::as_str),
            Some("success")
        );
        assert_eq!(value.get("warningCount").and_then(Value::as_u64), Some(1));
        assert_eq!(
            value.get("canRevealPreview").and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn resolves_latex_ui_state_from_compile_inputs() {
        let value = resolve_document_workflow_ui_state(&DocumentWorkflowUiResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            preview_state: json!({
                "previewVisible": false,
                "previewKind": "pdf",
            }),
            markdown_state: Value::Null,
            latex_state: json!({
                "status": "success",
                "errors": [],
                "warnings": [{ "message": "warn" }],
            }),
            python_state: Value::Null,
            queue_state: json!({
                "phase": "idle"
            }),
            artifact_path: "/tmp/test.pdf".to_string(),
        });

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("latex"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("ready"));
        assert_eq!(
            value.get("statusTone").and_then(Value::as_str),
            Some("success")
        );
        assert_eq!(value.get("canOpenPdf").and_then(Value::as_bool), Some(true));
        assert_eq!(value.get("warningCount").and_then(Value::as_u64), Some(1));
    }

    #[test]
    fn resolves_latex_compile_problems_with_source_paths() {
        let problems =
            resolve_latex_workflow_problems(&DocumentWorkflowLatexProblemsResolveParams {
                source_path: "/tmp/project/main.tex".to_string(),
                state: json!({
                    "compileTargetPath": "/tmp/project/build/main.tex",
                    "errors": [
                        {
                            "file": "../chapters/intro.tex",
                            "line": 12,
                            "column": 4,
                            "message": "Missing brace",
                            "severity": "error",
                            "raw": ""
                        }
                    ],
                    "warnings": [
                        {
                            "file": "/tmp/project/main.tex",
                            "line": 3,
                            "message": "Citation undefined",
                            "severity": "warning",
                            "raw": "LaTeX Warning"
                        }
                    ],
                }),
            });

        assert_eq!(problems.len(), 2);
        assert_eq!(
            problems[0].id,
            "latex:error:/tmp/project/chapters/intro.tex:0"
        );
        assert_eq!(problems[0].source_path, "/tmp/project/chapters/intro.tex");
        assert_eq!(problems[0].severity, "error");
        assert_eq!(problems[0].raw, "Missing brace");
        assert_eq!(problems[1].source_path, "/tmp/project/main.tex");
        assert_eq!(problems[1].raw, "LaTeX Warning");
    }

    #[test]
    fn resolves_python_ui_state_from_compile_inputs() {
        let value = resolve_document_workflow_ui_state(&DocumentWorkflowUiResolveParams {
            file_path: "/tmp/test.py".to_string(),
            preview_state: Value::Null,
            markdown_state: Value::Null,
            latex_state: Value::Null,
            python_state: json!({
                "status": "error",
                "errors": [{ "message": "SyntaxError" }],
                "warnings": [],
            }),
            queue_state: Value::Null,
            artifact_path: String::new(),
        });

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("python"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("error"));
        assert_eq!(
            value.get("statusTone").and_then(Value::as_str),
            Some("error")
        );
        assert_eq!(value.get("errorCount").and_then(Value::as_u64), Some(1));
    }

    #[test]
    fn resolves_workflow_status_tones_in_rust() {
        assert_eq!(
            resolve_workflow_status_tone("markdown", "rendering"),
            "running"
        );
        assert_eq!(resolve_workflow_status_tone("markdown", "ready"), "success");
        assert_eq!(resolve_workflow_status_tone("latex", "queued"), "warning");
        assert_eq!(resolve_workflow_status_tone("python", "running"), "running");
        assert_eq!(resolve_workflow_status_tone("python", "idle"), "muted");
    }

    #[test]
    fn resolves_python_compile_problems() {
        let problems =
            resolve_python_workflow_problems(&DocumentWorkflowPythonProblemsResolveParams {
                source_path: "/tmp/project/script.py".to_string(),
                state: json!({
                    "errors": [
                        {
                            "line": 7,
                            "column": 2,
                            "message": "SyntaxError",
                            "raw": ""
                        }
                    ],
                    "warnings": [
                        {
                            "line": 9,
                            "message": "Runtime warning",
                            "raw": "warning: detail"
                        }
                    ]
                }),
            });

        assert_eq!(problems.len(), 2);
        assert_eq!(problems[0].id, "python:error:/tmp/project/script.py:0");
        assert_eq!(problems[0].source_path, "/tmp/project/script.py");
        assert_eq!(problems[0].severity, "error");
        assert_eq!(problems[0].raw, "SyntaxError");
        assert_eq!(problems[1].severity, "warning");
        assert_eq!(problems[1].raw, "warning: detail");
    }
}
