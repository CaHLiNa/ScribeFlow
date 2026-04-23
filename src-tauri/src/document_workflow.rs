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
    pub pane_tree: Value,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub preview_prefs: Value,
    #[serde(default)]
    pub detached_sources: Value,
    #[serde(default)]
    pub preview_bindings: Vec<Value>,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub preview_kind_override: String,
    #[serde(default)]
    pub allow_legacy_pane_result: bool,
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

pub(crate) fn infer_workflow_preview_kind(
    source_path: &str,
    preview_path: &str,
) -> Option<&'static str> {
    if preview_path == format!("preview:{source_path}") {
        Some("html")
    } else {
        None
    }
}

fn get_leaves(node: &Value, leaves: &mut Vec<Value>) {
    if node.is_null() {
        return;
    }
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        leaves.push(node.clone());
        return;
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            get_leaves(child, leaves);
        }
    }
}

pub(crate) fn find_right_neighbor_leaf(node: &Value, pane_id: &str) -> Option<Value> {
    if node.get("type").and_then(Value::as_str) != Some("split")
        || node.get("direction").and_then(Value::as_str) != Some("vertical")
    {
        return None;
    }
    let children = node.get("children").and_then(Value::as_array)?;
    let left = children.first()?;
    let right = children.get(1)?;
    if left.get("id").and_then(Value::as_str) == Some(pane_id) {
        return find_first_leaf(right);
    }
    None
}

pub(crate) fn find_first_leaf(node: &Value) -> Option<Value> {
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        return Some(node.clone());
    }
    node.get("children")
        .and_then(Value::as_array)
        .and_then(|children| children.iter().find_map(find_first_leaf))
}

fn is_preview_capable_leaf(leaf: &Value) -> bool {
    let active_tab = leaf
        .get("activeTab")
        .and_then(Value::as_str)
        .unwrap_or_default();
    active_tab.is_empty() || is_preview_path(active_tab)
}

pub(crate) fn matches_preview_binding(
    tab_path: &str,
    source_path: &str,
    preferred_preview: Option<&str>,
    preview_bindings: &[Value],
) -> bool {
    if let Some(binding) = preview_bindings
        .iter()
        .find(|binding| binding.get("previewPath").and_then(Value::as_str) == Some(tab_path))
    {
        if binding.get("sourcePath").and_then(Value::as_str) == Some(source_path) {
            let binding_kind = binding
                .get("previewKind")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if preferred_preview.is_none() || preferred_preview == Some(binding_kind) {
                return true;
            }
        }
    }
    let inferred = infer_workflow_preview_kind(source_path, tab_path);
    inferred.is_some() && (preferred_preview.is_none() || inferred == preferred_preview)
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
    let is_detached = params
        .detached_sources
        .get(&source_path)
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if params.allow_legacy_pane_result && is_detached && !params.force {
        return json!({
            "type": "detached",
            "kind": kind,
            "sourcePath": source_path,
            "previewKind": preferred_preview,
            "previewPath": preview_path,
            "sourcePaneId": params.active_pane_id,
            "previewPaneId": null,
            "trigger": trigger,
            "state": "detached-by-user",
        });
    }

    let mut matched_legacy_preview: Option<(String, String)> = None;
    let mut leaves = Vec::new();
    get_leaves(&params.pane_tree, &mut leaves);
    'outer: for leaf in &leaves {
        let pane_id = leaf
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if let Some(tabs) = leaf.get("tabs").and_then(Value::as_array) {
            for tab in tabs {
                let tab_path = tab.as_str().unwrap_or_default();
                if matches_preview_binding(
                    tab_path,
                    &source_path,
                    preferred_preview,
                    &params.preview_bindings,
                ) {
                    matched_legacy_preview = Some((tab_path.to_string(), pane_id));
                    break 'outer;
                }
            }
        }
    }

    if !params.allow_legacy_pane_result && kind == "markdown" {
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
            "preserveOpenLegacy": matched_legacy_preview.is_some(),
            "legacyReadOnly": false,
            "legacyPreviewPath": matched_legacy_preview.as_ref().map(|value| value.0.clone()).unwrap_or_default(),
            "legacyPreviewPaneId": matched_legacy_preview.as_ref().map(|value| value.1.clone()),
        });
    }

    if preferred_preview.is_none() || preview_path.is_none() {
        return json!({
            "type": "source-only",
            "kind": kind,
            "sourcePath": source_path,
            "previewKind": preferred_preview,
            "previewPath": preview_path,
            "sourcePaneId": params.active_pane_id,
            "trigger": trigger,
            "previewPaneId": null,
            "state": "source-only",
        });
    }

    if let Some((matched_path, matched_pane_id)) = matched_legacy_preview {
        return json!({
            "type": "ready-existing",
            "kind": kind,
            "sourcePath": source_path,
            "previewKind": preferred_preview,
            "previewPath": matched_path,
            "sourcePaneId": params.active_pane_id,
            "trigger": trigger,
            "previewPaneId": matched_pane_id,
            "state": "ready",
        });
    }

    if !params.force {
        return json!({
            "type": "source-only",
            "kind": kind,
            "sourcePath": source_path,
            "previewKind": preferred_preview,
            "previewPath": preview_path,
            "sourcePaneId": params.active_pane_id,
            "trigger": trigger,
            "previewPaneId": null,
            "state": "source-only",
        });
    }

    if let Some(neighbor) = find_right_neighbor_leaf(&params.pane_tree, &params.active_pane_id) {
        if is_preview_capable_leaf(&neighbor) {
            return json!({
                "type": "open-neighbor",
                "kind": kind,
                "sourcePath": source_path,
                "previewKind": preferred_preview,
                "previewPath": preview_path,
                "sourcePaneId": params.active_pane_id,
                "trigger": trigger,
                "previewPaneId": neighbor.get("id").and_then(Value::as_str),
                "state": "needs-preview",
            });
        }
    }

    json!({
        "type": "split-right",
        "kind": kind,
        "sourcePath": source_path,
        "previewKind": preferred_preview,
        "previewPath": preview_path,
        "sourcePaneId": params.active_pane_id,
        "trigger": trigger,
        "previewPaneId": null,
        "state": "needs-preview",
    })
}

#[tauri::command]
pub async fn document_workflow_reconcile(
    params: DocumentWorkflowReconcileParams,
) -> Result<Value, String> {
    Ok(document_workflow_reconcile_value(params))
}
