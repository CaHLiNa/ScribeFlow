use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowReconcileParams {
    #[serde(default)]
    pub active_file: String,
    #[serde(default)]
    pub active_pane_id: String,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub preview_prefs: Value,
    #[serde(default)]
    pub preview_kind_override: String,
}

pub(crate) fn is_preview_path(path: &str) -> bool {
    path.starts_with("preview:")
}

pub(crate) fn is_new_tab(path: &str) -> bool {
    path.starts_with("newtab:")
}

fn is_markdown(path: &str) -> bool {
    let path = path.to_lowercase();
    path.ends_with(".md") || path.ends_with(".markdown")
}

fn is_latex(path: &str) -> bool {
    let path = path.to_lowercase();
    path.ends_with(".tex") || path.ends_with(".latex")
}

fn is_python(path: &str) -> bool {
    path.to_lowercase().ends_with(".py")
}

pub(crate) fn get_document_workflow_kind(path: &str) -> Option<&'static str> {
    if path.trim().is_empty() || is_preview_path(path) || is_new_tab(path) {
        return None;
    }
    if is_markdown(path) {
        return Some("markdown");
    }
    if is_latex(path) {
        return Some("latex");
    }
    if is_python(path) {
        return Some("python");
    }
    None
}

fn supported_preview_kinds(kind: &str) -> &'static [&'static str] {
    match kind {
        "markdown" => &["html"],
        "latex" => &["pdf"],
        "python" => &[],
        _ => &[],
    }
}

fn default_preview_kind(kind: &str) -> Option<&'static str> {
    match kind {
        "markdown" => Some("html"),
        _ => None,
    }
}

pub(crate) fn preferred_preview_kind(kind: &str, prefs: &Value) -> Option<&'static str> {
    let preferred = prefs
        .get(kind)
        .and_then(|value| value.get("preferredPreview"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let supported = supported_preview_kinds(kind);
    if !preferred.is_empty() && supported.iter().any(|k| *k == preferred) {
        return match preferred {
            "html" => Some("html"),
            "pdf" => Some("pdf"),
            _ => default_preview_kind(kind),
        };
    }
    default_preview_kind(kind)
}

pub(crate) fn create_workflow_preview_path(
    source_path: &str,
    kind: &str,
    preview_kind: Option<&str>,
) -> Option<String> {
    if source_path.trim().is_empty() {
        return None;
    }
    match (kind, preview_kind) {
        ("markdown", Some("html")) => Some(format!("preview:{source_path}")),
        _ => None,
    }
}

fn infer_workflow_preview_kind(source_path: &str, preview_path: &str) -> Option<&'static str> {
    if source_path.is_empty() || preview_path.is_empty() {
        return None;
    }
    let kind = get_document_workflow_kind(source_path)?;
    match kind {
        "markdown" => {
            let expected = format!("preview:{source_path}");
            if preview_path == expected {
                Some("html")
            } else {
                None
            }
        }
        _ => None,
    }
}

#[tauri::command]
pub fn document_workflow_policy_resolve(
    file_path: String,
    preview_prefs: HashMap<String, Value>,
) -> Result<Value, String> {
    let prefs_value = serde_json::to_value(&preview_prefs).unwrap_or_default();
    let kind = get_document_workflow_kind(&file_path);

    match kind {
        None => Ok(json!({
            "kind": null,
            "supportsPreview": false,
            "supportsCompile": false,
            "previewPath": null,
            "preferredPreviewKind": null,
            "supportedPreviewKinds": [],
            "defaultPreviewKind": null,
        })),
        Some(k) => {
            let supported = supported_preview_kinds(k);
            let preferred = preferred_preview_kind(k, &prefs_value);
            let preview_path = create_workflow_preview_path(&file_path, k, preferred);
            let supports_compile = k == "latex" || k == "python";

            Ok(json!({
                "kind": k,
                "supportsPreview": !supported.is_empty(),
                "supportsCompile": supports_compile,
                "previewPath": preview_path,
                "preferredPreviewKind": preferred,
                "supportedPreviewKinds": supported,
                "defaultPreviewKind": default_preview_kind(k),
            }))
        }
    }
}

#[tauri::command]
pub fn document_workflow_infer_preview_kind(
    source_path: String,
    preview_path: String,
) -> Result<Value, String> {
    Ok(match infer_workflow_preview_kind(&source_path, &preview_path) {
        Some(kind) => Value::String(kind.to_string()),
        None => Value::Null,
    })
}

pub(crate) fn document_workflow_reconcile_value(params: DocumentWorkflowReconcileParams) -> Value {
    let trigger = if params.trigger.trim().is_empty() {
        "manual".to_string()
    } else {
        params.trigger.trim().to_string()
    };
    let kind = get_document_workflow_kind(&params.active_file);
    if kind.is_none() {
        return json!({
            "type": "inactive",
            "trigger": trigger,
            "kind": null,
            "sourcePath": null,
            "previewPath": null,
            "previewKind": null,
            "sourcePaneId": if params.active_pane_id.trim().is_empty() { Value::Null } else { Value::String(params.active_pane_id.clone()) },
            "previewPaneId": null,
            "state": "inactive",
        });
    }

    let kind = kind.unwrap();
    let source_path = params.active_file.trim().to_string();
    let preferred_preview = if !params.preview_kind_override.trim().is_empty() {
        Some(params.preview_kind_override.trim())
    } else {
        preferred_preview_kind(kind, &params.preview_prefs)
    };
    let preview_path = create_workflow_preview_path(&source_path, kind, preferred_preview);

    if kind == "markdown" {
        return json!({
            "type": "workspace-preview",
            "kind": kind,
            "filePath": source_path,
            "sourcePath": source_path,
            "sourcePaneId": params.active_pane_id,
            "previewKind": "html",
            "previewMode": "markdown",
            "previewTargetPath": "",
            "targetResolution": "not-needed",
            "trigger": trigger,
            "state": "workspace-preview",
        });
    }

    json!({
        "type": "source-only",
        "kind": kind,
        "sourcePath": source_path,
        "previewKind": preferred_preview,
        "previewPath": preview_path,
        "sourcePaneId": params.active_pane_id,
        "trigger": trigger,
        "previewPaneId": null,
        "state": "source-only",
    })
}

#[tauri::command]
pub async fn document_workflow_reconcile(
    params: DocumentWorkflowReconcileParams,
) -> Result<Value, String> {
    Ok(document_workflow_reconcile_value(params))
}

#[cfg(test)]
mod tests {
    use super::{document_workflow_reconcile_value, DocumentWorkflowReconcileParams};
    use serde_json::{json, Value};

    #[test]
    fn resolves_markdown_preview_without_pane_result() {
        let value = document_workflow_reconcile_value(DocumentWorkflowReconcileParams {
            active_file: "/tmp/demo.md".to_string(),
            active_pane_id: "pane-1".to_string(),
            trigger: "test".to_string(),
            preview_prefs: json!({
                "markdown": { "preferredPreview": "html" }
            }),
            preview_kind_override: String::new(),
        });

        assert_eq!(
            value.get("type").and_then(Value::as_str),
            Some("workspace-preview")
        );
        assert_eq!(
            value.get("previewKind").and_then(Value::as_str),
            Some("html")
        );
    }
}
