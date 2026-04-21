use serde::Deserialize;
use serde_json::{json, Value};

use crate::document_workflow::get_document_workflow_kind;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowActionResolveParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub preview_delivery: String,
    #[serde(default)]
    pub ui_state: Value,
    #[serde(default)]
    pub preview_state: Value,
    #[serde(default)]
    pub artifact_path: String,
}

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
    pub queue_state: Value,
    #[serde(default)]
    pub artifact_path: String,
}

fn normalize_mode(preview_kind: &str) -> Option<&'static str> {
    match preview_kind {
        "html" => Some("markdown"),
        "pdf" => Some("pdf-artifact"),
        _ => None,
    }
}

fn uses_legacy_preview(preview_delivery: &str) -> bool {
    preview_delivery == "legacy-pane"
}

fn resolve_ui_kind(ui_state: &Value) -> String {
    ui_state
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn resolve_ui_preview_kind(ui_state: &Value) -> String {
    ui_state
        .get("previewKind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn preview_visible(preview_state: &Value) -> bool {
    preview_state
        .get("previewVisible")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn preview_mode(preview_state: &Value) -> String {
    preview_state
        .get("previewMode")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn build_legacy_toggle(preview_kind: &str, jump: bool) -> Value {
    json!({
        "actionType": "legacy-toggle-preview",
        "previewKind": preview_kind,
        "jump": jump,
    })
}

fn build_workspace_show(preview_kind: &str, persist_preference: bool) -> Value {
    json!({
        "actionType": "show-workspace-preview",
        "previewKind": preview_kind,
        "persistPreference": persist_preference,
    })
}

fn build_workspace_hide() -> Value {
    json!({
        "actionType": "hide-workspace-preview",
    })
}

fn build_external_output(artifact_path: &str) -> Value {
    json!({
        "actionType": "open-external-output",
        "artifactPath": artifact_path,
    })
}

fn build_run_build() -> Value {
    json!({
        "actionType": "run-build",
    })
}

fn build_run_build_with_follow_up(follow_up_action: Value) -> Value {
    json!({
        "actionType": "run-build",
        "followUpAction": follow_up_action,
    })
}

fn build_noop() -> Value {
    json!({
        "actionType": "noop",
    })
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

fn resolve_markdown_action(intent: &str, preview_delivery: &str, preview_state: &Value) -> Value {
    let current_visible = preview_visible(preview_state);
    let current_mode = preview_mode(preview_state);
    let current_is_markdown = current_visible && current_mode == "markdown";

    match intent {
        "primary-action" | "reveal-preview" | "toggle-markdown-preview" => {
            if uses_legacy_preview(preview_delivery) {
                return build_legacy_toggle("html", intent == "reveal-preview");
            }
            if current_is_markdown {
                return build_workspace_hide();
            }
            build_workspace_show("html", true)
        }
        _ => build_noop(),
    }
}

fn resolve_latex_action(
    intent: &str,
    preview_delivery: &str,
    ui_state: &Value,
    preview_state: &Value,
    artifact_path: &str,
) -> Value {
    let requested_preview_kind = resolve_ui_preview_kind(ui_state);
    let current_visible = preview_visible(preview_state);
    let current_mode = preview_mode(preview_state);
    let expected_mode = normalize_mode(&requested_preview_kind).unwrap_or_default();
    let artifact_ready = !artifact_path.trim().is_empty();

    match intent {
        "primary-action" => build_run_build(),
        "open-output" => {
            if artifact_ready {
                build_external_output(artifact_path)
            } else {
                build_run_build_with_follow_up(build_external_output(artifact_path))
            }
        }
        "toggle-pdf-preview" | "reveal-pdf" => {
            if current_visible && current_mode == "pdf-artifact" {
                return build_workspace_hide();
            }
            if artifact_ready {
                return build_workspace_show("pdf", false);
            }
            build_run_build_with_follow_up(build_workspace_show("pdf", false))
        }
        "reveal-preview" => {
            if requested_preview_kind.is_empty() {
                return build_noop();
            }
            if uses_legacy_preview(preview_delivery) {
                return build_legacy_toggle(&requested_preview_kind, true);
            }
            if current_visible && current_mode == expected_mode {
                return build_workspace_hide();
            }
            if requested_preview_kind == "pdf" && !artifact_ready {
                return build_external_output(artifact_path);
            }
            build_workspace_show(&requested_preview_kind, requested_preview_kind != "pdf")
        }
        _ => build_noop(),
    }
}

#[tauri::command]
pub async fn document_workflow_action_resolve(
    params: DocumentWorkflowActionResolveParams,
) -> Result<Value, String> {
    if params.file_path.trim().is_empty() {
        return Ok(build_noop());
    }

    let ui_kind = resolve_ui_kind(&params.ui_state);
    if ui_kind.is_empty() || ui_kind == "text" {
        return Ok(build_noop());
    }

    let plan = match ui_kind.as_str() {
        "markdown" => resolve_markdown_action(
            &params.intent,
            &params.preview_delivery,
            &params.preview_state,
        ),
        "latex" => resolve_latex_action(
            &params.intent,
            &params.preview_delivery,
            &params.ui_state,
            &params.preview_state,
            &params.artifact_path,
        ),
        _ => build_noop(),
    };

    Ok(plan)
}

#[tauri::command]
pub async fn document_workflow_ui_resolve(
    params: DocumentWorkflowUiResolveParams,
) -> Result<Value, String> {
    let file_path = params.file_path.trim();
    if file_path.is_empty() {
        return Ok(Value::Null);
    }

    let Some(kind) = get_document_workflow_kind(file_path) else {
        return Ok(Value::Null);
    };

    let ui_state = match kind {
        "markdown" => resolve_markdown_ui_state(&params),
        "latex" => resolve_latex_ui_state(&params),
        _ => Value::Null,
    };

    Ok(ui_state)
}

#[cfg(test)]
mod tests {
    use super::{
        document_workflow_action_resolve, document_workflow_ui_resolve,
        DocumentWorkflowActionResolveParams, DocumentWorkflowUiResolveParams,
    };
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
    async fn resolves_latex_pdf_preview_to_build_then_reveal_when_artifact_missing() {
        let value = document_workflow_action_resolve(DocumentWorkflowActionResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            intent: "reveal-pdf".to_string(),
            preview_delivery: "workspace".to_string(),
            ui_state: json!({
                "kind": "latex",
                "previewKind": "pdf",
            }),
            preview_state: json!({
                "previewVisible": false,
                "previewMode": "",
            }),
            artifact_path: String::new(),
        })
        .await
        .expect("resolve latex action");

        assert_eq!(
            value.get("actionType").and_then(Value::as_str),
            Some("run-build")
        );
        assert_eq!(
            value
                .get("followUpAction")
                .and_then(|follow_up| follow_up.get("actionType"))
                .and_then(Value::as_str),
            Some("show-workspace-preview")
        );
        assert_eq!(
            value
                .get("followUpAction")
                .and_then(|follow_up| follow_up.get("previewKind"))
                .and_then(Value::as_str),
            Some("pdf")
        );
    }

    #[tokio::test]
    async fn resolves_latex_open_output_to_build_then_open_when_artifact_missing() {
        let value = document_workflow_action_resolve(DocumentWorkflowActionResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            intent: "open-output".to_string(),
            preview_delivery: "workspace".to_string(),
            ui_state: json!({
                "kind": "latex",
                "previewKind": "pdf",
            }),
            preview_state: Value::Null,
            artifact_path: String::new(),
        })
        .await
        .expect("resolve latex open output action");

        assert_eq!(
            value.get("actionType").and_then(Value::as_str),
            Some("run-build")
        );
        assert_eq!(
            value
                .get("followUpAction")
                .and_then(|follow_up| follow_up.get("actionType"))
                .and_then(Value::as_str),
            Some("open-external-output")
        );
    }
}
