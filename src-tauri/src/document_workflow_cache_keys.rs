use crate::content_fingerprint::fnv1a;
use serde_json::Value;

#[tauri::command]
pub async fn document_workflow_build_resolved_state_key(
    kind: String,
    request: Value,
) -> Result<String, String> {
    let key = match kind.as_str() {
        "markdown" => build_markdown_key(&request),
        "latex" => build_latex_key(&request),
        "python" => build_python_key(&request),
        "preview" => build_preview_key(&request),
        "ui" => build_ui_key(&request),
        _ => return Err(format!("unknown cache key kind: {}", kind)),
    };
    Ok(key)
}

fn str_val(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn build_markdown_key(request: &Value) -> String {
    let source_path = str_val(request, "sourcePath");
    let content = str_val(request, "content");
    let fingerprint = fnv1a(&content);
    serde_json::json!({
        "sourcePath": source_path,
        "fingerprint": fingerprint,
    })
    .to_string()
}

fn build_latex_key(request: &Value) -> String {
    let source_path = str_val(request, "sourcePath");
    let state = request.get("state").cloned().unwrap_or(Value::Null);
    serde_json::json!({
        "sourcePath": source_path,
        "state": state,
    })
    .to_string()
}

fn build_python_key(request: &Value) -> String {
    let source_path = str_val(request, "sourcePath");
    let state = request.get("state").cloned().unwrap_or(Value::Null);
    serde_json::json!({
        "sourcePath": source_path,
        "state": state,
    })
    .to_string()
}

fn build_preview_key(request: &Value) -> String {
    let state = request
        .get("state")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    let session = state
        .get("session")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));

    serde_json::json!({
        "path": str_val(request, "path"),
        "sourcePath": str_val(request, "sourcePath"),
        "workflowKind": str_val(request, "workflowKind"),
        "previewKind": str_val(request, "previewKind"),
        "workspacePreviewRequest": str_val(request, "workspacePreviewRequest"),
        "resolvedTargetPath": str_val(request, "resolvedTargetPath"),
        "artifactPath": str_val(request, "artifactPath"),
        "hiddenByUser": request.get("hiddenByUser").and_then(|v| v.as_bool()).unwrap_or(false),
        "previewRequested": request.get("previewRequested").and_then(|v| v.as_bool()).unwrap_or(false),
        "session": {
            "activeFile": str_val(&session, "activeFile"),
            "previewKind": str_val(&session, "previewKind"),
            "previewSourcePath": str_val(&session, "previewSourcePath"),
            "state": str_val(&session, "state"),
        },
        "workspacePreviewVisibility": state.get("workspacePreviewVisibility").cloned().unwrap_or_else(|| Value::Object(Default::default())),
        "workspacePreviewRequests": state.get("workspacePreviewRequests").cloned().unwrap_or_else(|| Value::Object(Default::default())),
    })
    .to_string()
}

fn build_ui_key(request: &Value) -> String {
    serde_json::json!({
        "filePath": str_val(request, "filePath"),
        "artifactPath": str_val(request, "artifactPath"),
        "previewState": request.get("previewState").cloned().unwrap_or(Value::Null),
        "markdownState": request.get("markdownState").cloned().unwrap_or(Value::Null),
        "latexState": request.get("latexState").cloned().unwrap_or(Value::Null),
        "pythonState": request.get("pythonState").cloned().unwrap_or(Value::Null),
        "queueState": request.get("queueState").cloned().unwrap_or(Value::Null),
    })
    .to_string()
}
