use serde::Deserialize;
use serde_json::{json, Value};

use crate::document_workflow::{
    create_workflow_preview_path, document_workflow_reconcile_value, get_document_workflow_kind,
    preferred_preview_kind, DocumentWorkflowReconcileParams,
};
use crate::document_workflow_preview_binding::{
    find_open_preview_path_value, find_preview_binding_value,
};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowControllerParams {
    #[serde(default)]
    pub operation: String,
    #[serde(default)]
    pub active_file: String,
    #[serde(default)]
    pub active_pane_id: String,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub preview_prefs: Value,
    #[serde(default)]
    pub preview_bindings: Vec<Value>,
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub preview_kind_override: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub preview_kind: String,
    #[serde(default)]
    pub source_pane_id: String,
    #[serde(default)]
    pub activate_preview: bool,
    #[serde(default = "default_reconcile_after_close")]
    pub reconcile_after_close: bool,
}

fn default_reconcile_after_close() -> bool {
    true
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

fn bool_payload_field(params: &Value, keys: &[&str], default: bool) -> bool {
    payload_field(params, keys)
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn objectish_payload_field(params: &Value, keys: &[&str]) -> Value {
    match payload_field(params, keys) {
        Some(value @ Value::Object(_)) => value.clone(),
        _ => Value::Object(Default::default()),
    }
}

fn value_array_payload_field(params: &Value, keys: &[&str]) -> Vec<Value> {
    payload_field(params, keys)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn document_workflow_controller_params_from_payload(
    params: Value,
) -> DocumentWorkflowControllerParams {
    DocumentWorkflowControllerParams {
        operation: string_payload_field(&params, &["operation"]),
        active_file: string_payload_field(&params, &["activeFile", "active_file"]),
        active_pane_id: string_payload_field(&params, &["activePaneId", "active_pane_id"]),
        trigger: string_payload_field(&params, &["trigger"]),
        preview_prefs: objectish_payload_field(&params, &["previewPrefs", "preview_prefs"]),
        preview_bindings: value_array_payload_field(
            &params,
            &["previewBindings", "preview_bindings"],
        ),
        session: objectish_payload_field(&params, &["session"]),
        force: bool_payload_field(&params, &["force"], false),
        preview_kind_override: string_payload_field(
            &params,
            &["previewKindOverride", "preview_kind_override"],
        ),
        source_path: string_payload_field(&params, &["sourcePath", "source_path"]),
        preview_kind: string_payload_field(&params, &["previewKind", "preview_kind"]),
        source_pane_id: string_payload_field(&params, &["sourcePaneId", "source_pane_id"]),
        activate_preview: bool_payload_field(&params, &["activatePreview", "activate_preview"], false),
        reconcile_after_close: bool_payload_field(
            &params,
            &["reconcileAfterClose", "reconcile_after_close"],
            true,
        ),
    }
}

fn normalize_path(path: &str) -> String {
    path.trim().to_string()
}

fn null_if_empty(value: &str) -> Value {
    let normalized = value.trim();
    if normalized.is_empty() {
        Value::Null
    } else {
        Value::String(normalized.to_string())
    }
}

fn session_preview_pane_id(session: &Value) -> Option<String> {
    session
        .get("previewPaneId")
        .and_then(Value::as_str)
        .map(|value| value.to_string())
}

fn session_preview_source_path(session: &Value) -> String {
    session
        .get("previewSourcePath")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn session_preview_kind(session: &Value) -> String {
    session
        .get("previewKind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn find_preview_binding(preview_bindings: &[Value], preview_path: &str) -> Option<Value> {
    find_preview_binding_value(preview_bindings, preview_path)
}

fn find_open_preview_path(
    source_path: &str,
    preview_kind: &str,
    preview_bindings: &[Value],
    session: &Value,
) -> Option<String> {
    if let Some(preview_path) =
        find_open_preview_path_value(preview_bindings, source_path, preview_kind)
    {
        return Some(preview_path);
    }

    if session_preview_source_path(session) == source_path
        && session_preview_pane_id(session).is_some()
        && (preview_kind.is_empty() || session_preview_kind(session) == preview_kind)
    {
        let kind = get_document_workflow_kind(source_path)?;
        return create_workflow_preview_path(source_path, kind, Some(preview_kind))
            .map(|value| value.to_string());
    }

    None
}

fn build_session_state(result: &Value, fallback_pane_id: &str) -> Option<Value> {
    let result_type = result
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match result_type {
        "inactive" => Some(json!({
            "activeFile": Value::Null,
            "activeKind": Value::Null,
            "sourcePaneId": null_if_empty(fallback_pane_id),
            "previewPaneId": Value::Null,
            "previewKind": Value::Null,
            "previewSourcePath": Value::Null,
            "state": "inactive",
        })),
        "source-only" => Some(json!({
            "activeFile": result.get("sourcePath").cloned().unwrap_or(Value::Null),
            "activeKind": result.get("kind").cloned().unwrap_or(Value::Null),
            "sourcePaneId": result.get("sourcePaneId").cloned().unwrap_or(Value::Null),
            "previewPaneId": Value::Null,
            "previewKind": result.get("previewKind").cloned().unwrap_or(Value::Null),
            "previewSourcePath": result.get("sourcePath").cloned().unwrap_or(Value::Null),
            "state": "source-only",
        })),
        "workspace-preview" => Some(json!({
            "activeFile": result.get("sourcePath").or_else(|| result.get("filePath")).cloned().unwrap_or(Value::Null),
            "activeKind": result.get("kind").cloned().unwrap_or(Value::Null),
            "sourcePaneId": result.get("sourcePaneId").cloned().unwrap_or(Value::Null),
            "previewPaneId": Value::Null,
            "previewKind": result.get("previewKind").cloned().unwrap_or(Value::Null),
            "previewSourcePath": result.get("sourcePath").or_else(|| result.get("filePath")).cloned().unwrap_or(Value::Null),
            "state": "workspace-preview",
        })),
        _ => None,
    }
}

fn build_reconcile_plan(
    result: Value,
    fallback_pane_id: &str,
    _force: bool,
    _preview_kind_override: &str,
) -> Value {
    let session_state = build_session_state(&result, fallback_pane_id);

    json!({
        "result": result,
        "sessionState": session_state,
        "bindPreview": Value::Null,
        "paneAction": Value::Null,
        "followupRequest": Value::Null,
    })
}

fn execute_reconcile(params: &DocumentWorkflowControllerParams) -> Value {
    let reconcile = document_workflow_reconcile_value(DocumentWorkflowReconcileParams {
        active_file: params.active_file.clone(),
        active_pane_id: params.active_pane_id.clone(),
        trigger: params.trigger.clone(),
        preview_prefs: params.preview_prefs.clone(),
        preview_kind_override: params.preview_kind_override.clone(),
    });
    build_reconcile_plan(
        reconcile,
        &params.active_pane_id,
        params.force,
        &params.preview_kind_override,
    )
}

fn execute_close(params: &DocumentWorkflowControllerParams) -> Value {
    let source_path = normalize_path(&params.source_path);
    if source_path.is_empty() {
        return Value::Null;
    }

    let kind = match get_document_workflow_kind(&source_path) {
        Some(kind) => kind,
        None => return Value::Null,
    };
    let preview_kind = if !params.preview_kind.trim().is_empty() {
        params.preview_kind.trim().to_string()
    } else {
        preferred_preview_kind(kind, &params.preview_prefs)
            .unwrap_or_default()
            .to_string()
    };

    let Some(preview_path) = find_open_preview_path(
        &source_path,
        &preview_kind,
        &params.preview_bindings,
        &params.session,
    ) else {
        return Value::Null;
    };

    let binding = find_preview_binding(&params.preview_bindings, &preview_path);
    let mark_detached = binding
        .as_ref()
        .and_then(|value| value.get("detachOnClose"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    json!({
        "result": {
            "type": "closed-preview",
            "kind": kind,
            "sourcePath": source_path,
            "previewKind": preview_kind,
            "previewPath": preview_path,
        },
        "closePreviewPath": preview_path,
        "unbindPreviewPath": preview_path,
        "markDetachedSourcePath": if mark_detached { Value::String(source_path.clone()) } else { Value::Null },
        "followupRequest": if params.reconcile_after_close {
            json!({
                "operation": "reconcile",
                "trigger": if params.trigger.trim().is_empty() { "close-preview" } else { params.trigger.trim() },
                "force": false,
                "previewKindOverride": preview_kind,
            })
        } else {
            Value::Null
        },
    })
}

fn execute_ensure_or_reveal(params: &DocumentWorkflowControllerParams) -> Value {
    let source_path = normalize_path(&params.source_path);
    if source_path.is_empty() {
        return Value::Null;
    }

    let kind = match get_document_workflow_kind(&source_path) {
        Some(kind) => kind,
        None => return Value::Null,
    };
    let preview_kind = if !params.preview_kind.trim().is_empty() {
        params.preview_kind.trim().to_string()
    } else {
        preferred_preview_kind(kind, &params.preview_prefs)
            .unwrap_or_default()
            .to_string()
    };

    let active_pane_id = if !params.source_pane_id.trim().is_empty() {
        params.source_pane_id.clone()
    } else {
        params.active_pane_id.clone()
    };
    let trigger = if params.trigger.trim().is_empty() {
        if params.activate_preview {
            "reveal-preview".to_string()
        } else {
            "manual-open-preview".to_string()
        }
    } else {
        params.trigger.trim().to_string()
    };

    let reconcile = document_workflow_reconcile_value(DocumentWorkflowReconcileParams {
        active_file: source_path.clone(),
        active_pane_id: active_pane_id.clone(),
        trigger,
        preview_prefs: params.preview_prefs.clone(),
        preview_kind_override: preview_kind.clone(),
    });

    let mut plan = build_reconcile_plan(reconcile, &active_pane_id, true, &preview_kind);
    if let Some(obj) = plan.as_object_mut() {
        obj.insert(
            "clearDetachedSourcePath".to_string(),
            Value::String(source_path),
        );
        obj.insert(
            "restorePreviousSelection".to_string(),
            Value::Bool(!params.activate_preview),
        );
        obj.insert(
            "activateResolvedPreview".to_string(),
            Value::Bool(params.activate_preview),
        );
    }
    plan
}

#[tauri::command]
pub async fn document_workflow_controller_execute(params: Value) -> Result<Value, String> {
    let params = document_workflow_controller_params_from_payload(params);
    let operation = params.operation.trim();
    let result = match operation {
        "reconcile" => execute_reconcile(&params),
        "close-preview" => execute_close(&params),
        "ensure-preview" | "reveal-preview" => execute_ensure_or_reveal(&params),
        _ => Value::Null,
    };
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{document_workflow_controller_execute, document_workflow_controller_params_from_payload};
    use serde_json::{json, Value};

    #[test]
    fn controller_params_normalize_raw_payloads() {
        let params = document_workflow_controller_params_from_payload(json!({
            "operation": "close-preview",
            "active_file": "/tmp/active.md",
            "activePaneId": "pane-active",
            "trigger": "manual",
            "preview_prefs": {
                "markdown": {
                    "preferredPreview": "html"
                }
            },
            "previewBindings": [
                {
                    "previewPath": "preview:/tmp/demo.md",
                    "sourcePath": "/tmp/demo.md"
                },
                false
            ],
            "session": {
                "previewSourcePath": "/tmp/demo.md"
            },
            "force": true,
            "previewKindOverride": "html",
            "source_path": "/tmp/demo.md",
            "preview_kind": "html",
            "sourcePaneId": "pane-source",
            "activate_preview": true,
            "reconcileAfterClose": false
        }));

        assert_eq!(params.operation, "close-preview");
        assert_eq!(params.active_file, "/tmp/active.md");
        assert_eq!(params.active_pane_id, "pane-active");
        assert_eq!(params.trigger, "manual");
        assert_eq!(
            params
                .preview_prefs
                .get("markdown")
                .and_then(|value| value.get("preferredPreview"))
                .and_then(Value::as_str),
            Some("html")
        );
        assert_eq!(params.preview_bindings.len(), 2);
        assert_eq!(
            params.session.get("previewSourcePath").and_then(Value::as_str),
            Some("/tmp/demo.md")
        );
        assert!(params.force);
        assert_eq!(params.preview_kind_override, "html");
        assert_eq!(params.source_path, "/tmp/demo.md");
        assert_eq!(params.preview_kind, "html");
        assert_eq!(params.source_pane_id, "pane-source");
        assert!(params.activate_preview);
        assert!(!params.reconcile_after_close);

        let invalid = document_workflow_controller_params_from_payload(json!(false));
        assert!(invalid.operation.is_empty());
        assert!(invalid.active_file.is_empty());
        assert_eq!(invalid.preview_prefs, Value::Object(Default::default()));
        assert!(invalid.preview_bindings.is_empty());
        assert_eq!(invalid.session, Value::Object(Default::default()));
        assert!(!invalid.force);
        assert!(!invalid.activate_preview);
        assert!(invalid.reconcile_after_close);
    }

    #[tokio::test]
    async fn preview_close_marks_detached_when_binding_requires_it() {
        let plan = document_workflow_controller_execute(json!({
            "operation": "close-preview",
            "source_path": "/tmp/demo.md",
            "preview_kind": "html",
            "previewBindings": [{
                "previewPath": "preview:/tmp/demo.md",
                "sourcePath": "/tmp/demo.md",
                "previewKind": "html",
                "kind": "markdown",
                "paneId": "pane-2",
                "detachOnClose": true,
            }],
            "reconcileAfterClose": false
        }))
        .await
        .expect("execute close preview");

        assert_eq!(
            plan.get("closePreviewPath").and_then(Value::as_str),
            Some("preview:/tmp/demo.md")
        );
        assert_eq!(
            plan.get("markDetachedSourcePath").and_then(Value::as_str),
            Some("/tmp/demo.md")
        );
    }

    #[tokio::test]
    async fn detached_preview_reopen_clears_detached_source() {
        let plan = document_workflow_controller_execute(json!({
            "operation": "ensure-preview",
            "sourcePath": "/tmp/demo.md",
            "source_pane_id": "pane-1",
            "previewKind": "html"
        }))
        .await
        .expect("execute ensure preview");

        assert_eq!(
            plan.get("clearDetachedSourcePath").and_then(Value::as_str),
            Some("/tmp/demo.md")
        );
    }
}
