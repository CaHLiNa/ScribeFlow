use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkspacePreviewMutateParams {
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub preview_kind: String,
    #[serde(default)]
    pub preferred_preview_kind: String,
    #[serde(default = "default_persist_preference")]
    pub persist_preference: bool,
    #[serde(default)]
    pub source_pane_id: String,
    #[serde(default)]
    pub current_session: Value,
}

fn default_persist_preference() -> bool {
    true
}

fn null_if_empty(value: &str) -> Value {
    let normalized = value.trim();
    if normalized.is_empty() {
        Value::Null
    } else {
        Value::String(normalized.to_string())
    }
}

fn resolve_source_pane_id(params: &DocumentWorkspacePreviewMutateParams) -> Value {
    if !params.source_pane_id.trim().is_empty() {
        return Value::String(params.source_pane_id.trim().to_string());
    }
    params
        .current_session
        .get("sourcePaneId")
        .cloned()
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub async fn document_workspace_preview_mutate(
    params: DocumentWorkspacePreviewMutateParams,
) -> Result<Value, String> {
    let file_path = params.file_path.trim();
    if file_path.is_empty() {
        return Ok(Value::Null);
    }

    match params.intent.trim() {
        "show" => {
            let preview_kind = params.preview_kind.trim();
            if params.kind.trim().is_empty() || preview_kind.is_empty() {
                return Ok(Value::Null);
            }

            let request_value = if preview_kind != params.preferred_preview_kind.trim() {
                Value::String(preview_kind.to_string())
            } else {
                Value::Null
            };

            Ok(json!({
                "result": {
                    "type": "workspace-preview",
                    "filePath": file_path,
                    "previewKind": preview_kind,
                },
                "requestValue": request_value,
                "visibility": "visible",
                "clearDetachedSourcePath": file_path,
                "persistedPreviewKind": if params.persist_preference { null_if_empty(preview_kind) } else { Value::Null },
                "sessionState": {
                    "activeFile": file_path,
                    "activeKind": params.kind.trim(),
                    "sourcePaneId": resolve_source_pane_id(&params),
                    "previewPaneId": Value::Null,
                    "previewKind": preview_kind,
                    "previewSourcePath": file_path,
                    "state": "workspace-preview",
                }
            }))
        }
        "hide" => Ok(json!({
            "result": {
                "type": "workspace-preview-hidden",
                "filePath": file_path,
            },
            "requestValue": Value::Null,
            "visibility": "hidden",
            "clearDetachedSourcePath": Value::Null,
            "persistedPreviewKind": Value::Null,
            "sessionState": Value::Null,
        })),
        _ => Ok(Value::Null),
    }
}
