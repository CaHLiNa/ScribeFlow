use serde::Deserialize;
use serde_json::{json, Value};

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

pub(crate) fn preferred_preview_kind(kind: &str, prefs: &Value) -> Option<&'static str> {
    let preferred = prefs
        .get(kind)
        .and_then(|value| value.get("preferredPreview"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    match kind {
        "markdown" => {
            if preferred == "html" || preferred.is_empty() {
                Some("html")
            } else {
                Some("html")
            }
        }
        "latex" => None,
        "python" => None,
        _ => None,
    }
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
