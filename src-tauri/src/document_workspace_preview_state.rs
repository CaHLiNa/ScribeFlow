use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkspacePreviewStateResolveParams {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub workflow_kind: String,
    #[serde(default)]
    pub workflow_preview_kind: String,
    #[serde(default)]
    pub preview_kind: String,
    #[serde(default)]
    pub resolved_target_path: String,
    #[serde(default)]
    pub target_resolution: String,
    #[serde(default)]
    pub hidden_by_user: bool,
    #[serde(default)]
    pub preview_requested: bool,
    #[serde(default)]
    pub artifact_ready: bool,
    #[serde(default)]
    pub preserve_open_legacy: bool,
    #[serde(default)]
    pub has_open_legacy_preview: bool,
}

fn normalize_path(path: &str) -> String {
    path.trim().replace('\\', "/")
}

fn is_markdown_path(path: &str) -> bool {
    let path = normalize_path(path).to_ascii_lowercase();
    path.ends_with(".md") || path.ends_with(".markdown")
}

fn is_latex_path(path: &str) -> bool {
    let path = normalize_path(path).to_ascii_lowercase();
    path.ends_with(".tex") || path.ends_with(".latex")
}

fn is_python_path(path: &str) -> bool {
    normalize_path(path).to_ascii_lowercase().ends_with(".py")
}

fn is_markdown_preview_path(path: &str) -> bool {
    normalize_path(path).starts_with("preview:")
}

fn preview_source_path_from_path(path: &str) -> String {
    normalize_path(path)
        .strip_prefix("preview:")
        .unwrap_or_default()
        .to_string()
}

fn get_workspace_document_kind(path: &str, workflow_kind: &str) -> Option<&'static str> {
    match workflow_kind.trim() {
        "markdown" => Some("markdown"),
        "latex" => Some("latex"),
        _ => {
            if is_markdown_path(path) {
                Some("markdown")
            } else if is_latex_path(path) {
                Some("latex")
            } else if is_python_path(path) {
                Some("python")
            } else {
                None
            }
        }
    }
}

fn create_preview_state(overrides: Value) -> Value {
    let mut base = json!({
        "useWorkspace": false,
        "previewVisible": false,
        "previewKind": null,
        "previewMode": null,
        "targetResolution": null,
        "reason": "unsupported-file",
        "legacyReadOnly": false,
        "allowPreviewCreation": false,
        "preserveOpenLegacy": false,
        "sourcePath": "",
        "previewTargetPath": "",
        "previewFilePath": "",
    });

    if let (Some(base_obj), Some(overrides_obj)) = (base.as_object_mut(), overrides.as_object()) {
        for (key, value) in overrides_obj {
            base_obj.insert(key.clone(), value.clone());
        }
    }
    base
}

fn hide_preview_state(state: &Value, reason: &str) -> Value {
    let mut next = state.clone();
    if let Some(obj) = next.as_object_mut() {
        obj.insert("previewVisible".to_string(), Value::Bool(false));
        obj.insert("previewMode".to_string(), Value::Null);
        obj.insert("previewFilePath".to_string(), Value::String(String::new()));
        obj.insert("reason".to_string(), Value::String(reason.to_string()));
    }
    next
}

fn resolve_preview_mode(preview_kind: &str) -> Value {
    match preview_kind {
        "html" => Value::String("markdown".to_string()),
        "pdf" => Value::String("pdf-artifact".to_string()),
        "terminal" => Value::String("terminal-output".to_string()),
        _ => Value::Null,
    }
}

fn normalize_target_resolution(value: &str, fallback: &str) -> Value {
    let normalized = value.trim();
    if normalized.is_empty() {
        Value::String(fallback.to_string())
    } else {
        Value::String(normalized.to_string())
    }
}

fn resolved_target_exists(path: &str) -> bool {
    !path.is_empty() && Path::new(path).exists()
}

#[tauri::command]
pub async fn document_workspace_preview_state_resolve(
    params: DocumentWorkspacePreviewStateResolveParams,
) -> Result<Value, String> {
    let path = normalize_path(&params.path);
    if path.is_empty() {
        return Ok(create_preview_state(json!({})));
    }

    if is_markdown_preview_path(&path) {
        let source_path = {
            let explicit = normalize_path(&params.source_path);
            if explicit.is_empty() {
                preview_source_path_from_path(&path)
            } else {
                explicit
            }
        };
        return Ok(create_preview_state(json!({
            "useWorkspace": false,
            "previewVisible": true,
            "previewKind": "html",
            "previewMode": "markdown",
            "targetResolution": "legacy",
            "reason": "legacy-preview-tab",
            "legacyReadOnly": true,
            "allowPreviewCreation": false,
            "preserveOpenLegacy": true,
            "sourcePath": source_path,
            "previewFilePath": path,
        })));
    }

    let Some(kind) = get_workspace_document_kind(&path, &params.workflow_kind) else {
        return Ok(create_preview_state(json!({
            "sourcePath": path,
            "preserveOpenLegacy": params.preserve_open_legacy || params.has_open_legacy_preview,
        })));
    };

    let preserve_open_legacy = params.preserve_open_legacy || params.has_open_legacy_preview;
    let requested_preview_kind = if !params.preview_kind.trim().is_empty() {
        params.preview_kind.trim().to_string()
    } else {
        params.workflow_preview_kind.trim().to_string()
    };
    let resolved_target_path = normalize_path(&params.resolved_target_path);
    let artifact_ready = params.artifact_ready || resolved_target_exists(&resolved_target_path);

    if kind == "markdown" {
        let state = create_preview_state(json!({
            "useWorkspace": true,
            "previewVisible": true,
            "previewKind": "html",
            "previewMode": "markdown",
            "targetResolution": "not-needed",
            "reason": "workspace-markdown",
            "legacyReadOnly": false,
            "allowPreviewCreation": true,
            "preserveOpenLegacy": preserve_open_legacy,
            "sourcePath": path,
            "previewFilePath": format!("preview:{path}"),
        }));
        return Ok(if params.hidden_by_user {
            hide_preview_state(&state, "hidden-by-user")
        } else {
            state
        });
    }

    if kind == "python" {
        let terminal_preview_requested =
            requested_preview_kind == "terminal" && params.preview_requested;
        let state = create_preview_state(json!({
            "useWorkspace": true,
            "previewVisible": terminal_preview_requested && !params.hidden_by_user,
            "previewKind": if terminal_preview_requested || params.hidden_by_user { Value::String("terminal".to_string()) } else { Value::Null },
            "previewMode": if terminal_preview_requested && !params.hidden_by_user { resolve_preview_mode("terminal") } else { Value::Null },
            "targetResolution": "not-needed",
            "reason": if params.hidden_by_user {
                Value::String("hidden-by-user".to_string())
            } else if terminal_preview_requested {
                Value::String("workspace-python-terminal".to_string())
            } else {
                Value::String("source-only".to_string())
            },
            "legacyReadOnly": false,
            "allowPreviewCreation": true,
            "preserveOpenLegacy": preserve_open_legacy,
            "sourcePath": path,
            "previewFilePath": if terminal_preview_requested && !params.hidden_by_user { Value::String(path.clone()) } else { Value::String(String::new()) },
        }));
        return Ok(if params.hidden_by_user {
            hide_preview_state(&state, "hidden-by-user")
        } else {
            state
        });
    }

    let pdf_preview_requested = requested_preview_kind == "pdf" && params.preview_requested;
    let state = create_preview_state(json!({
        "useWorkspace": true,
        "previewVisible": pdf_preview_requested && artifact_ready && !params.hidden_by_user,
        "previewKind": if pdf_preview_requested || params.hidden_by_user { Value::String("pdf".to_string()) } else { Value::Null },
        "previewMode": if pdf_preview_requested && artifact_ready && !params.hidden_by_user { resolve_preview_mode("pdf") } else { Value::Null },
        "targetResolution": normalize_target_resolution(
            &params.target_resolution,
            if !resolved_target_path.is_empty() || artifact_ready { "resolved" } else { "unresolved" }
        ),
        "reason": if params.hidden_by_user {
            Value::String("hidden-by-user".to_string())
        } else if pdf_preview_requested && artifact_ready {
            Value::String("workspace-latex-pdf".to_string())
        } else if artifact_ready {
            Value::String("artifact-ready-external".to_string())
        } else {
            Value::String("source-only".to_string())
        },
        "legacyReadOnly": false,
        "allowPreviewCreation": artifact_ready,
        "preserveOpenLegacy": preserve_open_legacy,
        "sourcePath": path,
        "previewTargetPath": if artifact_ready { Value::String(resolved_target_path.clone()) } else { Value::String(String::new()) },
        "previewFilePath": if pdf_preview_requested && artifact_ready { Value::String(resolved_target_path) } else { Value::String(String::new()) },
    }));

    Ok(if params.hidden_by_user {
        hide_preview_state(&state, "hidden-by-user")
    } else {
        state
    })
}
