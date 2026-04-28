use serde::Deserialize;
use serde_json::{json, Value};

use crate::document_workflow::get_document_workflow_kind;
use crate::latex_project_graph::{resolve_graph_value, LatexProjectGraphParams};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowStateResolveParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub preview_state: Value,
    #[serde(default)]
    pub markdown_state: Value,
    #[serde(default)]
    pub markdown_draft_problems: Value,
    #[serde(default)]
    pub latex_state: Value,
    #[serde(default)]
    pub latex_lint_diagnostics: Value,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub source_content: String,
    #[serde(default)]
    pub python_state: Value,
    #[serde(default)]
    pub queue_state: Value,
    #[serde(default)]
    pub artifact_path: String,
}

#[derive(Debug, Clone)]
struct WorkflowProblem {
    id: String,
    source_path: String,
    line: Option<u64>,
    column: Option<u64>,
    severity: String,
    message: String,
    origin: String,
    actionable: bool,
    raw: String,
}

impl WorkflowProblem {
    fn severity_rank(&self) -> u8 {
        if self.severity == "error" {
            0
        } else {
            1
        }
    }

    fn signature(&self) -> String {
        [
            self.source_path.clone(),
            self.line.map(|value| value.to_string()).unwrap_or_default(),
            self.column.map(|value| value.to_string()).unwrap_or_default(),
            self.severity.clone(),
            self.origin.clone(),
            self.message.clone(),
        ]
        .join("::")
    }

    fn into_value(self) -> Value {
        json!({
            "id": self.id,
            "sourcePath": self.source_path,
            "line": self.line,
            "column": self.column,
            "severity": self.severity,
            "message": self.message,
            "origin": self.origin,
            "actionable": self.actionable,
            "raw": self.raw,
        })
    }
}

fn bool_at(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn string_at<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn u64_at(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn normalize_severity(value: &Value, default: &str) -> String {
    let severity = value
        .get("severity")
        .and_then(Value::as_str)
        .unwrap_or(default);
    if severity == "warning" {
        "warning".to_string()
    } else {
        "error".to_string()
    }
}

fn normalize_line(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64).filter(|line| *line > 0)
}

fn normalize_problem(
    value: &Value,
    defaults: ProblemDefaults<'_>,
) -> Option<WorkflowProblem> {
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or(defaults.message)
        .trim()
        .to_string();
    if message.is_empty() {
        return None;
    }

    let raw = value
        .get("raw")
        .and_then(Value::as_str)
        .unwrap_or(message.as_str())
        .trim()
        .to_string();

    Some(WorkflowProblem {
        id: value
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or(defaults.id)
            .to_string(),
        source_path: value
            .get("sourcePath")
            .and_then(Value::as_str)
            .or_else(|| value.get("file").and_then(Value::as_str))
            .unwrap_or(defaults.source_path)
            .to_string(),
        line: normalize_line(value, "line").or(defaults.line),
        column: normalize_line(value, "column").or(defaults.column),
        severity: normalize_severity(value, defaults.severity),
        message,
        origin: value
            .get("origin")
            .and_then(Value::as_str)
            .unwrap_or(defaults.origin)
            .to_string(),
        actionable: value
            .get("actionable")
            .and_then(Value::as_bool)
            .unwrap_or(defaults.actionable),
        raw,
    })
}

#[derive(Debug, Clone, Copy)]
struct ProblemDefaults<'a> {
    id: &'a str,
    source_path: &'a str,
    line: Option<u64>,
    column: Option<u64>,
    severity: &'a str,
    message: &'a str,
    origin: &'a str,
    actionable: bool,
}

fn push_problem(problems: &mut Vec<WorkflowProblem>, value: &Value, defaults: ProblemDefaults<'_>) {
    if let Some(problem) = normalize_problem(value, defaults) {
        problems.push(problem);
    }
}

fn finalize_problems(mut problems: Vec<WorkflowProblem>) -> Vec<Value> {
    problems.sort_by(|left, right| {
        left.source_path
            .cmp(&right.source_path)
            .then_with(|| {
                left.line
                    .unwrap_or(u64::MAX)
                    .cmp(&right.line.unwrap_or(u64::MAX))
            })
            .then_with(|| left.severity_rank().cmp(&right.severity_rank()))
            .then_with(|| left.message.cmp(&right.message))
    });

    let mut seen = std::collections::HashSet::new();
    problems
        .into_iter()
        .filter(|problem| seen.insert(problem.signature()))
        .map(WorkflowProblem::into_value)
        .collect()
}

fn count_problems(problems: &[Value]) -> (usize, usize) {
    problems.iter().fold((0usize, 0usize), |(errors, warnings), problem| {
        if problem
            .get("severity")
            .and_then(Value::as_str)
            .unwrap_or("error")
            == "warning"
        {
            (errors, warnings + 1)
        } else {
            (errors + 1, warnings)
        }
    })
}

fn resolve_markdown_problems(
    file_path: &str,
    markdown_state: &Value,
    markdown_draft_problems: &Value,
) -> Vec<Value> {
    let mut problems = Vec::new();

    for problem in markdown_draft_problems
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        push_problem(
            &mut problems,
            &problem,
            ProblemDefaults {
                id: "",
                source_path: file_path,
                line: None,
                column: None,
                severity: "warning",
                message: "",
                origin: "draft",
                actionable: true,
            },
        );
    }

    for (index, problem) in markdown_state
        .get("problems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
    {
        let default_id = format!("markdown:{file_path}:{index}");
        push_problem(
            &mut problems,
            &problem,
            ProblemDefaults {
                id: &default_id,
                source_path: file_path,
                line: None,
                column: None,
                severity: "error",
                message: "",
                origin: "preview",
                actionable: true,
            },
        );
    }

    finalize_problems(problems)
}

fn resolve_latex_artifact_path(params: &DocumentWorkflowStateResolveParams) -> String {
    let explicit = params.artifact_path.trim();
    if !explicit.is_empty() {
        return explicit.to_string();
    }

    let preview_path = string_at(&params.latex_state, "previewPath").trim();
    if !preview_path.is_empty() {
        return preview_path.to_string();
    }

    let pdf_path = string_at(&params.latex_state, "pdfPath").trim();
    if !pdf_path.is_empty() {
        return pdf_path.to_string();
    }

    String::new()
}

fn resolve_latex_project_graph(
    file_path: &str,
    params: &DocumentWorkflowStateResolveParams,
) -> Value {
    let source_content = params.source_content.trim();
    let content_overrides = if source_content.is_empty() {
        std::collections::HashMap::new()
    } else {
        std::collections::HashMap::from([(file_path.to_string(), source_content.to_string())])
    };

    resolve_graph_value(&LatexProjectGraphParams {
        source_path: file_path.to_string(),
        workspace_path: params.workspace_path.clone(),
        flat_files: Vec::new(),
        include_hidden: true,
        content_overrides,
    })
    .unwrap_or(Value::Null)
}

fn resolve_latex_problems(file_path: &str, params: &DocumentWorkflowStateResolveParams) -> Vec<Value> {
    let mut problems = Vec::new();
    let latex_project_graph = resolve_latex_project_graph(file_path, params);

    for (severity, key) in [("error", "errors"), ("warning", "warnings")] {
        for (index, problem) in params
            .latex_state
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .enumerate()
        {
            let target_path = problem
                .get("file")
                .and_then(Value::as_str)
                .unwrap_or(file_path);
            let default_id = format!("latex:{severity}:{target_path}:{index}");
            push_problem(
                &mut problems,
                &problem,
                ProblemDefaults {
                    id: &default_id,
                    source_path: file_path,
                    line: None,
                    column: None,
                    severity,
                    message: "",
                    origin: "compile",
                    actionable: true,
                },
            );
        }
    }

    for (index, problem) in params
        .latex_lint_diagnostics
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
    {
        let lint_path = problem
            .get("file")
            .and_then(Value::as_str)
            .unwrap_or(file_path);
        let line = normalize_line(&problem, "line");
        let default_id = format!(
            "latex:lint:{lint_path}:{}:{index}",
            line.unwrap_or(0)
        );
        push_problem(
            &mut problems,
            &problem,
            ProblemDefaults {
                id: &default_id,
                source_path: file_path,
                line,
                column: None,
                severity: "warning",
                message: "",
                origin: "lint",
                actionable: true,
            },
        );
    }

    let unresolved_refs = latex_project_graph
        .get("unresolvedRefs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for entry in unresolved_refs {
        let entry_path = entry
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or(file_path);
        let key = entry.get("key").and_then(Value::as_str).unwrap_or_default();
        let line = normalize_line(&entry, "line");
        let default_id = format!(
            "latex:ref:{entry_path}:{key}:{}",
            line.unwrap_or(0)
        );
        push_problem(
            &mut problems,
            &json!({
                "id": default_id,
                "sourcePath": entry_path,
                "line": line,
                "severity": "warning",
                "origin": "project",
                "actionable": true,
                "message": format!("Unknown label: {key}"),
                "raw": key,
            }),
            ProblemDefaults {
                id: "",
                source_path: file_path,
                line,
                column: None,
                severity: "warning",
                message: "",
                origin: "project",
                actionable: true,
            },
        );
    }

    let unresolved_citations = latex_project_graph
        .get("unresolvedCitations")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for entry in unresolved_citations {
        let entry_path = entry
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or(file_path);
        let key = entry.get("key").and_then(Value::as_str).unwrap_or_default();
        let line = normalize_line(&entry, "line");
        let default_id = format!(
            "latex:cite:{entry_path}:{key}:{}",
            line.unwrap_or(0)
        );
        push_problem(
            &mut problems,
            &json!({
                "id": default_id,
                "sourcePath": entry_path,
                "line": line,
                "severity": "warning",
                "origin": "project",
                "actionable": true,
                "message": format!("Unknown citation key: {key}"),
                "raw": key,
            }),
            ProblemDefaults {
                id: "",
                source_path: file_path,
                line,
                column: None,
                severity: "warning",
                message: "",
                origin: "project",
                actionable: true,
            },
        );
    }

    finalize_problems(problems)
}

fn basename_label(path: &str) -> String {
    let normalized = path.trim().replace('\\', "/");
    if normalized.is_empty() {
        return String::new();
    }
    normalized
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn resolve_python_problems(file_path: &str, python_state: &Value) -> Vec<Value> {
    let mut problems = Vec::new();

    for (severity, key) in [("error", "errors"), ("warning", "warnings")] {
        for (index, problem) in python_state
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .enumerate()
        {
            let default_id = format!("python:{severity}:{file_path}:{index}");
            push_problem(
                &mut problems,
                &problem,
                ProblemDefaults {
                    id: &default_id,
                    source_path: file_path,
                    line: None,
                    column: None,
                    severity,
                    message: "",
                    origin: "compile",
                    actionable: true,
                },
            );
        }
    }

    finalize_problems(problems)
}

fn build_resolved_state(
    ui_state: Value,
    artifact_path: String,
    problems: Vec<Value>,
    status: Value,
) -> Value {
    json!({
        "uiState": ui_state,
        "artifactPath": artifact_path,
        "problems": problems,
        "status": status,
    })
}

fn resolve_markdown_state(params: &DocumentWorkflowStateResolveParams) -> Value {
    let file_path = params.file_path.as_str();
    let problems = resolve_markdown_problems(
        file_path,
        &params.markdown_state,
        &params.markdown_draft_problems,
    );
    let (error_count, warning_count) = count_problems(&problems);
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

    build_resolved_state(
        json!({
            "kind": "markdown",
            "previewKind": "html",
            "phase": phase,
            "errorCount": error_count,
            "warningCount": warning_count,
            "canShowProblems": error_count > 0 || warning_count > 0,
            "canRevealPreview": true,
            "canOpenPdf": false,
            "forwardSync": "precise",
            "backwardSync": true,
            "primaryAction": "refresh",
        }),
        String::new(),
        problems,
        json!({
            "phase": phase,
        }),
    )
}

fn resolve_latex_state(params: &DocumentWorkflowStateResolveParams) -> Value {
    let file_path = params.file_path.as_str();
    let artifact_path = resolve_latex_artifact_path(params);
    let problems = resolve_latex_problems(file_path, params);
    let (error_count, warning_count) = count_problems(&problems);
    let compile_status = string_at(&params.latex_state, "status");
    let queue_phase = string_at(&params.queue_state, "phase");
    let preview_kind = string_at(&params.preview_state, "previewKind");

    let phase = if compile_status == "compiling" {
        "compiling"
    } else if queue_phase == "scheduled" || queue_phase == "queued" {
        "queued"
    } else if compile_status == "error" {
        "error"
    } else if !artifact_path.is_empty() || compile_status == "success" {
        "ready"
    } else {
        "idle"
    };

    build_resolved_state(
        json!({
            "kind": "latex",
            "previewKind": if preview_kind.is_empty() { Value::Null } else { Value::String(preview_kind.to_string()) },
            "phase": phase,
            "errorCount": error_count,
            "warningCount": warning_count,
            "canShowProblems": error_count > 0 || warning_count > 0,
            "canRevealPreview": false,
            "canOpenPdf": !artifact_path.is_empty(),
            "backwardSync": true,
            "primaryAction": "compile",
        }),
        artifact_path,
        problems,
        json!({
            "phase": phase,
            "durationMs": u64_at(&params.latex_state, "durationMs"),
            "pendingCount": u64_at(&params.queue_state, "pendingCount"),
            "hasCustomArgs": !string_at(&params.latex_state, "buildExtraArgs").trim().is_empty()
                || !string_at(&params.queue_state, "buildExtraArgs").trim().is_empty(),
        }),
    )
}

fn resolve_python_state(params: &DocumentWorkflowStateResolveParams) -> Value {
    let file_path = params.file_path.as_str();
    let problems = resolve_python_problems(file_path, &params.python_state);
    let (error_count, warning_count) = count_problems(&problems);
    let status = string_at(&params.python_state, "status");

    let phase = if status == "compiling" || status == "running" {
        "running"
    } else if status == "error" {
        "error"
    } else if status == "success" {
        "ready"
    } else {
        "idle"
    };

    let interpreter_version = string_at(&params.python_state, "interpreterVersion");
    let interpreter_path = string_at(&params.python_state, "interpreterPath");

    build_resolved_state(
        json!({
            "kind": "python",
            "previewKind": "terminal",
            "phase": phase,
            "errorCount": error_count,
            "warningCount": warning_count,
            "canShowProblems": error_count > 0 || warning_count > 0,
            "canRevealPreview": true,
            "canOpenPdf": false,
            "backwardSync": false,
            "primaryAction": "run",
        }),
        String::new(),
        problems,
        json!({
            "phase": phase,
            "durationMs": u64_at(&params.python_state, "durationMs"),
            "interpreterVersion": interpreter_version,
            "interpreterLabel": basename_label(interpreter_path),
        }),
    )
}

pub fn resolve_document_workflow_state(params: &DocumentWorkflowStateResolveParams) -> Value {
    let file_path = params.file_path.trim();
    if file_path.is_empty() {
        return Value::Null;
    }

    let Some(kind) = get_document_workflow_kind(file_path) else {
        return Value::Null;
    };

    match kind {
        "markdown" => resolve_markdown_state(params),
        "latex" => resolve_latex_state(params),
        "python" => resolve_python_state(params),
        _ => Value::Null,
    }
}

#[tauri::command]
pub async fn document_workflow_state_resolve(
    params: DocumentWorkflowStateResolveParams,
) -> Result<Value, String> {
    Ok(resolve_document_workflow_state(&params))
}

#[cfg(test)]
mod tests {
    use super::{document_workflow_state_resolve, DocumentWorkflowStateResolveParams};
    use serde_json::{json, Value};

    #[tokio::test]
    async fn resolves_markdown_state_from_preview_and_render_state() {
        let value = document_workflow_state_resolve(DocumentWorkflowStateResolveParams {
            file_path: "/tmp/test.md".to_string(),
            preview_state: json!({
                "previewVisible": true,
                "previewKind": "html",
            }),
            markdown_state: json!({
                "status": "ready",
                "problems": [
                    { "severity": "warning", "message": "Preview warning" }
                ]
            }),
            markdown_draft_problems: json!([
                { "severity": "error", "message": "Draft error", "line": 4 }
            ]),
            latex_state: Value::Null,
            latex_lint_diagnostics: Value::Null,
            workspace_path: String::new(),
            source_content: String::new(),
            python_state: Value::Null,
            queue_state: Value::Null,
            artifact_path: String::new(),
        })
        .await
        .expect("resolve markdown state");

        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("kind"))
                .and_then(Value::as_str),
            Some("markdown")
        );
        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("phase"))
                .and_then(Value::as_str),
            Some("ready")
        );
        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("errorCount"))
                .and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("warningCount"))
                .and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            value
                .get("problems")
                .and_then(Value::as_array)
                .map(|problems| problems.len()),
            Some(2)
        );
    }

    #[tokio::test]
    async fn resolves_latex_state_from_compile_lint_and_project_inputs() {
        let value = document_workflow_state_resolve(DocumentWorkflowStateResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            preview_state: json!({
                "previewVisible": false,
                "previewKind": "pdf",
            }),
            markdown_state: Value::Null,
            markdown_draft_problems: Value::Null,
            latex_state: json!({
                "status": "success",
                "durationMs": 1420,
                "buildExtraArgs": "--shell-escape",
                "errors": [],
                "warnings": [{ "message": "Compile warning" }],
                "previewPath": "/tmp/test.pdf",
            }),
            latex_lint_diagnostics: json!([
                { "file": "/tmp/test.tex", "line": 8, "severity": "warning", "message": "Lint warning" }
            ]),
            workspace_path: String::new(),
            source_content: "\\ref{fig:missing}\n".to_string(),
            python_state: Value::Null,
            queue_state: json!({
                "phase": "idle"
            }),
            artifact_path: String::new(),
        })
        .await
        .expect("resolve latex state");

        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("kind"))
                .and_then(Value::as_str),
            Some("latex")
        );
        assert_eq!(
            value
                .get("artifactPath")
                .and_then(Value::as_str),
            Some("/tmp/test.pdf")
        );
        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("warningCount"))
                .and_then(Value::as_u64),
            Some(3)
        );
        assert_eq!(
            value
                .get("status")
                .and_then(|status| status.get("hasCustomArgs"))
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[tokio::test]
    async fn resolves_python_state_with_warning_counts_and_runtime_meta() {
        let value = document_workflow_state_resolve(DocumentWorkflowStateResolveParams {
            file_path: "/tmp/test.py".to_string(),
            preview_state: Value::Null,
            markdown_state: Value::Null,
            markdown_draft_problems: Value::Null,
            latex_state: Value::Null,
            latex_lint_diagnostics: Value::Null,
            workspace_path: String::new(),
            source_content: String::new(),
            python_state: json!({
                "status": "success",
                "errors": [],
                "warnings": [{ "message": "Runtime warning" }],
                "durationMs": 320,
                "interpreterPath": "/usr/bin/python3",
                "interpreterVersion": "3.12.2"
            }),
            queue_state: Value::Null,
            artifact_path: String::new(),
        })
        .await
        .expect("resolve python state");

        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("kind"))
                .and_then(Value::as_str),
            Some("python")
        );
        assert_eq!(
            value
                .get("uiState")
                .and_then(|ui_state| ui_state.get("warningCount"))
                .and_then(Value::as_u64),
            Some(1)
        );
        assert_eq!(
            value
                .get("status")
                .and_then(|status| status.get("interpreterLabel"))
                .and_then(Value::as_str),
            Some("python3")
        );
    }
}
