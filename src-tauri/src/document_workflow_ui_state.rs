use serde::Deserialize;
use serde_json::{json, Value};

use crate::document_workflow::get_document_workflow_kind;

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
    json!({
        "kind": kind,
        "previewKind": preview_kind,
        "phase": phase,
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
pub async fn document_workflow_ui_resolve(
    params: DocumentWorkflowUiResolveParams,
) -> Result<Value, String> {
    Ok(resolve_document_workflow_ui_state(&params))
}

#[cfg(test)]
mod tests {
    use super::{document_workflow_ui_resolve, DocumentWorkflowUiResolveParams};
    use serde_json::{json, Value};

    #[tokio::test]
    async fn resolves_markdown_ui_state_from_preview_and_render_state() {
        let value = document_workflow_ui_resolve(DocumentWorkflowUiResolveParams {
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
        })
        .await
        .expect("resolve markdown ui");

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("markdown"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("ready"));
        assert_eq!(value.get("warningCount").and_then(Value::as_u64), Some(1));
        assert_eq!(
            value.get("canRevealPreview").and_then(Value::as_bool),
            Some(true)
        );
    }

    #[tokio::test]
    async fn resolves_latex_ui_state_from_compile_inputs() {
        let value = document_workflow_ui_resolve(DocumentWorkflowUiResolveParams {
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
        })
        .await
        .expect("resolve latex ui");

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("latex"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("ready"));
        assert_eq!(value.get("canOpenPdf").and_then(Value::as_bool), Some(true));
        assert_eq!(value.get("warningCount").and_then(Value::as_u64), Some(1));
    }

    #[tokio::test]
    async fn resolves_python_ui_state_from_compile_inputs() {
        let value = document_workflow_ui_resolve(DocumentWorkflowUiResolveParams {
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
        })
        .await
        .expect("resolve python ui");

        assert_eq!(value.get("kind").and_then(Value::as_str), Some("python"));
        assert_eq!(value.get("phase").and_then(Value::as_str), Some("error"));
        assert_eq!(value.get("errorCount").and_then(Value::as_u64), Some(1));
    }
}
