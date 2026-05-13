use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowActionResolveParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub ui_state: Value,
    #[serde(default)]
    pub preview_state: Value,
    #[serde(default)]
    pub artifact_path: String,
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

fn document_workflow_action_params_from_payload(
    params: Value,
) -> DocumentWorkflowActionResolveParams {
    DocumentWorkflowActionResolveParams {
        file_path: string_payload_field(&params, &["filePath", "file_path"]),
        intent: string_payload_field(&params, &["intent"]),
        ui_state: value_payload_field(&params, &["uiState", "ui_state"], Value::Null),
        preview_state: value_payload_field(
            &params,
            &["previewState", "preview_state"],
            Value::Null,
        ),
        artifact_path: string_payload_field(&params, &["artifactPath", "artifact_path"]),
    }
}

fn normalize_mode(preview_kind: &str) -> Option<&'static str> {
    match preview_kind {
        "html" => Some("markdown"),
        "pdf" => Some("pdf-artifact"),
        "terminal" => Some("terminal-output"),
        _ => None,
    }
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

fn resolve_markdown_action(intent: &str, preview_state: &Value) -> Value {
    let current_visible = preview_visible(preview_state);
    let current_mode = preview_mode(preview_state);
    let current_is_markdown = current_visible && current_mode == "markdown";

    match intent {
        "primary-action" | "reveal-preview" | "toggle-markdown-preview" => {
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

fn resolve_python_action(intent: &str, preview_state: &Value) -> Value {
    let current_visible = preview_visible(preview_state);
    let current_mode = preview_mode(preview_state);

    match intent {
        "primary-action" => build_run_build_with_follow_up(build_workspace_show("terminal", false)),
        "reveal-preview" => {
            if current_visible && current_mode == "terminal-output" {
                return build_workspace_hide();
            }
            build_workspace_show("terminal", false)
        }
        _ => build_noop(),
    }
}

#[tauri::command]
pub async fn document_workflow_action_resolve(params: Value) -> Result<Value, String> {
    let params = document_workflow_action_params_from_payload(params);
    Ok(resolve_document_workflow_action(&params))
}

pub fn resolve_document_workflow_action(params: &DocumentWorkflowActionResolveParams) -> Value {
    if params.file_path.trim().is_empty() {
        return build_noop();
    }

    let ui_kind = resolve_ui_kind(&params.ui_state);
    if ui_kind.is_empty() || ui_kind == "text" {
        return build_noop();
    }

    match ui_kind.as_str() {
        "markdown" => resolve_markdown_action(&params.intent, &params.preview_state),
        "latex" => resolve_latex_action(
            &params.intent,
            &params.ui_state,
            &params.preview_state,
            &params.artifact_path,
        ),
        "python" => resolve_python_action(&params.intent, &params.preview_state),
        _ => build_noop(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        document_workflow_action_params_from_payload, document_workflow_action_resolve,
        resolve_document_workflow_action, DocumentWorkflowActionResolveParams,
    };
    use serde_json::{json, Value};

    #[test]
    fn document_workflow_action_params_normalize_raw_payloads() {
        let params = document_workflow_action_params_from_payload(json!({
            "file_path": "/tmp/raw.tex",
            "intent": "reveal-pdf",
            "ui_state": {
                "kind": "latex"
            },
            "previewState": false,
            "artifact_path": "/tmp/raw.pdf"
        }));

        assert_eq!(params.file_path, "/tmp/raw.tex");
        assert_eq!(params.intent, "reveal-pdf");
        assert_eq!(
            params.ui_state.get("kind").and_then(Value::as_str),
            Some("latex")
        );
        assert_eq!(params.preview_state, Value::Bool(false));
        assert_eq!(params.artifact_path, "/tmp/raw.pdf");

        let invalid = document_workflow_action_params_from_payload(json!(false));
        assert!(invalid.file_path.is_empty());
        assert!(invalid.intent.is_empty());
        assert_eq!(invalid.ui_state, Value::Null);
        assert_eq!(invalid.preview_state, Value::Null);
    }

    #[tokio::test]
    async fn document_workflow_action_command_accepts_raw_payloads() {
        let value = document_workflow_action_resolve(json!({
            "file_path": "/tmp/test.py",
            "intent": "primary-action",
            "ui_state": {
                "kind": "python"
            },
            "preview_state": false
        }))
        .await
        .expect("resolve raw action payload");

        assert_eq!(
            value.get("actionType").and_then(Value::as_str),
            Some("run-build")
        );

        let invalid = document_workflow_action_resolve(json!(null))
            .await
            .expect("resolve invalid action payload");

        assert_eq!(
            invalid.get("actionType").and_then(Value::as_str),
            Some("noop")
        );
    }

    #[test]
    fn resolves_latex_pdf_preview_to_build_then_reveal_when_artifact_missing() {
        let value = resolve_document_workflow_action(&DocumentWorkflowActionResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            intent: "reveal-pdf".to_string(),
            ui_state: json!({
                "kind": "latex",
                "previewKind": "pdf",
            }),
            preview_state: json!({
                "previewVisible": false,
                "previewMode": "",
            }),
            artifact_path: String::new(),
        });

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

    #[test]
    fn resolves_latex_open_output_to_build_then_open_when_artifact_missing() {
        let value = resolve_document_workflow_action(&DocumentWorkflowActionResolveParams {
            file_path: "/tmp/test.tex".to_string(),
            intent: "open-output".to_string(),
            ui_state: json!({
                "kind": "latex",
                "previewKind": "pdf",
            }),
            preview_state: Value::Null,
            artifact_path: String::new(),
        });

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

    #[test]
    fn resolves_python_primary_action_to_build() {
        let value = resolve_document_workflow_action(&DocumentWorkflowActionResolveParams {
            file_path: "/tmp/test.py".to_string(),
            intent: "primary-action".to_string(),
            ui_state: json!({
                "kind": "python",
                "phase": "idle",
            }),
            preview_state: Value::Null,
            artifact_path: String::new(),
        });

        assert_eq!(
            value.get("actionType").and_then(Value::as_str),
            Some("run-build")
        );
    }
}
