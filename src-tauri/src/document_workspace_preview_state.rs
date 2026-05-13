use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;

use crate::document_workflow_session::{
    normalize_document_workflow_persistent_state, DocumentWorkflowPersistentState,
};

#[derive(Debug, Clone, Deserialize, Default)]
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
    pub default_preview_kind: String,
    #[serde(default)]
    pub preferred_preview_kind: String,
    #[serde(default)]
    pub workspace_preview_request: String,
    #[serde(default)]
    pub supported_preview_kinds: Vec<String>,
    #[serde(default)]
    pub resolved_target_path: String,
    #[serde(default)]
    pub artifact_path: String,
    #[serde(default)]
    pub target_resolution: String,
    #[serde(default)]
    pub hidden_by_user: bool,
    #[serde(default)]
    pub preview_requested: bool,
    #[serde(default)]
    pub artifact_ready: bool,
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
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

fn bool_payload_field(params: &Value, keys: &[&str]) -> bool {
    payload_field(params, keys)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn string_array_payload_field(params: &Value, keys: &[&str]) -> Vec<String> {
    payload_field(params, keys)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn state_payload_field(params: &Value, keys: &[&str]) -> DocumentWorkflowPersistentState {
    payload_field(params, keys)
        .cloned()
        .and_then(|value| serde_json::from_value::<DocumentWorkflowPersistentState>(value).ok())
        .unwrap_or_default()
}

fn document_workspace_preview_state_params_from_payload(
    params: Value,
) -> DocumentWorkspacePreviewStateResolveParams {
    DocumentWorkspacePreviewStateResolveParams {
        path: string_payload_field(&params, &["path"]),
        source_path: string_payload_field(&params, &["sourcePath", "source_path"]),
        workflow_kind: string_payload_field(&params, &["workflowKind", "workflow_kind"]),
        workflow_preview_kind: string_payload_field(
            &params,
            &["workflowPreviewKind", "workflow_preview_kind"],
        ),
        preview_kind: string_payload_field(&params, &["previewKind", "preview_kind"]),
        default_preview_kind: string_payload_field(
            &params,
            &["defaultPreviewKind", "default_preview_kind"],
        ),
        preferred_preview_kind: string_payload_field(
            &params,
            &["preferredPreviewKind", "preferred_preview_kind"],
        ),
        workspace_preview_request: string_payload_field(
            &params,
            &["workspacePreviewRequest", "workspace_preview_request"],
        ),
        supported_preview_kinds: string_array_payload_field(
            &params,
            &["supportedPreviewKinds", "supported_preview_kinds"],
        ),
        resolved_target_path: string_payload_field(
            &params,
            &["resolvedTargetPath", "resolved_target_path"],
        ),
        artifact_path: string_payload_field(&params, &["artifactPath", "artifact_path"]),
        target_resolution: string_payload_field(
            &params,
            &["targetResolution", "target_resolution"],
        ),
        hidden_by_user: bool_payload_field(&params, &["hiddenByUser", "hidden_by_user"]),
        preview_requested: bool_payload_field(&params, &["previewRequested", "preview_requested"]),
        artifact_ready: bool_payload_field(&params, &["artifactReady", "artifact_ready"]),
        state: state_payload_field(&params, &["state"]),
    }
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
        "allowPreviewCreation": false,
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

fn resolve_hidden_by_user(
    params: &DocumentWorkspacePreviewStateResolveParams,
    state: &DocumentWorkflowPersistentState,
    path: &str,
) -> bool {
    params.hidden_by_user
        || state
            .workspace_preview_visibility
            .get(path)
            .map(|visibility| visibility == "hidden")
            .unwrap_or(false)
}

fn resolve_preview_requested(
    params: &DocumentWorkspacePreviewStateResolveParams,
    state: &DocumentWorkflowPersistentState,
    path: &str,
    requested_preview_kind: &str,
) -> bool {
    if params.preview_requested {
        return true;
    }

    let active_source_path = if state.session.preview_source_path.is_empty() {
        state.session.active_file.as_str()
    } else {
        state.session.preview_source_path.as_str()
    };
    if active_source_path.is_empty()
        || active_source_path != path
        || state.session.state != "workspace-preview"
    {
        return false;
    }

    state.session.preview_kind.is_empty()
        || requested_preview_kind.is_empty()
        || state.session.preview_kind == requested_preview_kind
}

fn active_workspace_preview_source_path(state: &DocumentWorkflowPersistentState) -> &str {
    if state.session.preview_source_path.is_empty() {
        state.session.active_file.as_str()
    } else {
        state.session.preview_source_path.as_str()
    }
}

fn normalize_preview_kind(value: &str) -> String {
    match value.trim() {
        "html" => "html".to_string(),
        "pdf" => "pdf".to_string(),
        "terminal" => "terminal".to_string(),
        _ => String::new(),
    }
}

fn first_non_empty(values: Vec<String>) -> String {
    values
        .into_iter()
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default()
}

fn supported_preview_kinds_for_kind(workflow_kind: &str) -> Vec<&'static str> {
    match workflow_kind {
        "markdown" => vec!["html"],
        "latex" => vec!["pdf"],
        "python" => vec!["terminal"],
        _ => Vec::new(),
    }
}

fn normalize_supported_preview_kind(
    value: &str,
    supported_preview_kinds: &[String],
    workflow_kind: &str,
) -> String {
    let normalized = normalize_preview_kind(value);
    if normalized.is_empty() {
        return String::new();
    }

    let explicit_supported = supported_preview_kinds
        .iter()
        .map(|kind| normalize_preview_kind(kind))
        .any(|kind| kind == normalized);
    if explicit_supported {
        return normalized;
    }

    if supported_preview_kinds.is_empty()
        && supported_preview_kinds_for_kind(workflow_kind)
            .iter()
            .any(|kind| *kind == normalized)
    {
        return normalized;
    }

    String::new()
}

fn default_preview_kind_for_params(
    params: &DocumentWorkspacePreviewStateResolveParams,
    workflow_kind: &str,
) -> String {
    first_non_empty(vec![
        normalize_supported_preview_kind(
            &params.default_preview_kind,
            &params.supported_preview_kinds,
            workflow_kind,
        ),
        normalize_supported_preview_kind(
            &params.workflow_preview_kind,
            &params.supported_preview_kinds,
            workflow_kind,
        ),
        supported_preview_kinds_for_kind(workflow_kind)
            .first()
            .copied()
            .unwrap_or_default()
            .to_string(),
    ])
}

fn fallback_preview_kind_for_params(
    params: &DocumentWorkspacePreviewStateResolveParams,
    workflow_kind: &str,
) -> String {
    first_non_empty(vec![
        normalize_supported_preview_kind(
            &params.preview_kind,
            &params.supported_preview_kinds,
            workflow_kind,
        ),
        normalize_supported_preview_kind(
            &params.preferred_preview_kind,
            &params.supported_preview_kinds,
            workflow_kind,
        ),
        default_preview_kind_for_params(params, workflow_kind),
    ])
}

fn resolve_requested_preview_kind(
    params: &DocumentWorkspacePreviewStateResolveParams,
    state: &DocumentWorkflowPersistentState,
    path: &str,
    workflow_kind: &str,
) -> String {
    let fallback = fallback_preview_kind_for_params(params, workflow_kind);

    let explicit_request = normalize_supported_preview_kind(
        &params.workspace_preview_request,
        &params.supported_preview_kinds,
        workflow_kind,
    );
    if !explicit_request.is_empty() {
        return explicit_request;
    }

    if state.session.state == "workspace-preview"
        && active_workspace_preview_source_path(state) == path
    {
        let requested = state
            .workspace_preview_requests
            .get(path)
            .map(String::as_str)
            .unwrap_or_default();
        let normalized_request = normalize_supported_preview_kind(
            requested,
            &params.supported_preview_kinds,
            workflow_kind,
        );
        if !normalized_request.is_empty() {
            return normalized_request;
        }
    }

    fallback
}

#[tauri::command]
pub async fn document_workspace_preview_state_resolve(params: Value) -> Result<Value, String> {
    let params = document_workspace_preview_state_params_from_payload(params);
    Ok(resolve_document_workspace_preview_state(&params))
}

pub fn resolve_document_workspace_preview_state(
    params: &DocumentWorkspacePreviewStateResolveParams,
) -> Value {
    let path = normalize_path(&params.path);
    if path.is_empty() {
        return create_preview_state(json!({}));
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
        return create_preview_state(json!({
            "useWorkspace": false,
            "previewVisible": true,
            "previewKind": "html",
            "previewMode": "markdown",
            "targetResolution": "preview-path",
            "reason": "preview-tab",
            "allowPreviewCreation": false,
            "sourcePath": source_path,
            "previewFilePath": path,
        }));
    }

    let Some(kind) = get_workspace_document_kind(&path, &params.workflow_kind) else {
        return create_preview_state(json!({
            "sourcePath": path,
        }));
    };

    let persistent_state = normalize_document_workflow_persistent_state(params.state.clone());
    let requested_preview_kind =
        resolve_requested_preview_kind(&params, &persistent_state, &path, kind);
    let hidden_by_user = resolve_hidden_by_user(&params, &persistent_state, &path);
    let preview_requested =
        resolve_preview_requested(&params, &persistent_state, &path, &requested_preview_kind);
    let resolved_target_path = normalize_path(&params.resolved_target_path);
    let artifact_path = normalize_path(&params.artifact_path);
    let artifact_ready = params.artifact_ready
        || !artifact_path.is_empty()
        || resolved_target_exists(&artifact_path)
        || resolved_target_exists(&resolved_target_path);

    if kind == "markdown" {
        let state = create_preview_state(json!({
            "useWorkspace": true,
            "previewVisible": true,
            "previewKind": "html",
            "previewMode": "markdown",
            "targetResolution": "not-needed",
            "reason": "workspace-markdown",
            "allowPreviewCreation": true,
            "sourcePath": path,
            "previewFilePath": format!("preview:{path}"),
        }));
        return if hidden_by_user {
            hide_preview_state(&state, "hidden-by-user")
        } else {
            state
        };
    }

    if kind == "python" {
        let terminal_preview_requested = requested_preview_kind == "terminal" && preview_requested;
        let state = create_preview_state(json!({
            "useWorkspace": true,
            "previewVisible": terminal_preview_requested && !hidden_by_user,
            "previewKind": if terminal_preview_requested || hidden_by_user { Value::String("terminal".to_string()) } else { Value::Null },
            "previewMode": if terminal_preview_requested && !hidden_by_user { resolve_preview_mode("terminal") } else { Value::Null },
            "targetResolution": "not-needed",
            "reason": if hidden_by_user {
                Value::String("hidden-by-user".to_string())
            } else if terminal_preview_requested {
                Value::String("workspace-python-terminal".to_string())
            } else {
                Value::String("source-only".to_string())
            },
            "allowPreviewCreation": true,
            "sourcePath": path,
            "previewFilePath": if terminal_preview_requested && !hidden_by_user { Value::String(path.clone()) } else { Value::String(String::new()) },
        }));
        return if hidden_by_user {
            hide_preview_state(&state, "hidden-by-user")
        } else {
            state
        };
    }

    let pdf_preview_requested = requested_preview_kind == "pdf" && preview_requested;
    let state = create_preview_state(json!({
        "useWorkspace": true,
        "previewVisible": pdf_preview_requested && artifact_ready && !hidden_by_user,
        "previewKind": if pdf_preview_requested || hidden_by_user { Value::String("pdf".to_string()) } else { Value::Null },
        "previewMode": if pdf_preview_requested && artifact_ready && !hidden_by_user { resolve_preview_mode("pdf") } else { Value::Null },
        "targetResolution": normalize_target_resolution(
            &params.target_resolution,
            if !resolved_target_path.is_empty() || artifact_ready { "resolved" } else { "unresolved" }
        ),
        "reason": if hidden_by_user {
            Value::String("hidden-by-user".to_string())
        } else if pdf_preview_requested && artifact_ready {
            Value::String("workspace-latex-pdf".to_string())
        } else if artifact_ready {
            Value::String("artifact-ready-external".to_string())
        } else {
            Value::String("source-only".to_string())
        },
        "allowPreviewCreation": artifact_ready,
        "sourcePath": path,
        "previewTargetPath": if artifact_ready { Value::String(resolved_target_path.clone()) } else { Value::String(String::new()) },
        "previewFilePath": if pdf_preview_requested && artifact_ready { Value::String(resolved_target_path) } else { Value::String(String::new()) },
    }));

    if hidden_by_user {
        hide_preview_state(&state, "hidden-by-user")
    } else {
        state
    }
}

#[cfg(test)]
mod tests {
    use super::{
        document_workspace_preview_state_params_from_payload,
        document_workspace_preview_state_resolve, resolve_document_workspace_preview_state,
        DocumentWorkspacePreviewStateResolveParams,
    };
    use crate::document_workflow_session::{
        DocumentWorkflowPersistentState, DocumentWorkflowSession,
    };
    use serde_json::{json, Value};
    use std::collections::HashMap;

    #[test]
    fn workspace_preview_state_params_normalize_raw_payloads() {
        let params = document_workspace_preview_state_params_from_payload(json!({
            "path": " /tmp/raw.py ",
            "source_path": "/tmp/raw-source.py",
            "workflow_kind": "python",
            "workflowPreviewKind": "terminal",
            "preview_kind": "terminal",
            "defaultPreviewKind": "pdf",
            "preferred_preview_kind": "terminal",
            "workspace_preview_request": "terminal",
            "supportedPreviewKinds": ["terminal", false, "pdf"],
            "resolved_target_path": "/tmp/raw.out",
            "artifactPath": "/tmp/raw.pdf",
            "target_resolution": "resolved",
            "hiddenByUser": false,
            "preview_requested": true,
            "artifactReady": true,
            "state": {
                "session": {
                    "activeFile": "/tmp/raw.py",
                    "state": "workspace-preview"
                }
            }
        }));

        assert_eq!(params.path, " /tmp/raw.py ");
        assert_eq!(params.source_path, "/tmp/raw-source.py");
        assert_eq!(params.workflow_kind, "python");
        assert_eq!(params.workflow_preview_kind, "terminal");
        assert_eq!(params.preview_kind, "terminal");
        assert_eq!(params.default_preview_kind, "pdf");
        assert_eq!(params.preferred_preview_kind, "terminal");
        assert_eq!(params.workspace_preview_request, "terminal");
        assert_eq!(
            params.supported_preview_kinds,
            vec!["terminal".to_string(), "pdf".to_string()]
        );
        assert_eq!(params.resolved_target_path, "/tmp/raw.out");
        assert_eq!(params.artifact_path, "/tmp/raw.pdf");
        assert_eq!(params.target_resolution, "resolved");
        assert!(!params.hidden_by_user);
        assert!(params.preview_requested);
        assert!(params.artifact_ready);
        assert_eq!(params.state.session.active_file, "/tmp/raw.py");

        let invalid = document_workspace_preview_state_params_from_payload(json!(false));
        assert!(invalid.path.is_empty());
        assert!(!invalid.preview_requested);
        assert!(invalid.supported_preview_kinds.is_empty());
        assert_eq!(invalid.state, DocumentWorkflowPersistentState::default());
    }

    #[tokio::test]
    async fn workspace_preview_state_command_accepts_raw_payloads() {
        let state = document_workspace_preview_state_resolve(json!({
            "path": "/tmp/main.tex",
            "workflow_kind": "latex",
            "preview_kind": "pdf",
            "resolved_target_path": "/tmp/main.pdf",
            "artifact_ready": true,
            "preview_requested": true
        }))
        .await
        .expect("resolve raw workspace preview payload");

        assert_eq!(
            state.get("previewMode").and_then(Value::as_str),
            Some("pdf-artifact")
        );
        assert_eq!(
            state.get("previewFilePath").and_then(Value::as_str),
            Some("/tmp/main.pdf")
        );

        let invalid = document_workspace_preview_state_resolve(json!(null))
            .await
            .expect("resolve invalid workspace preview payload");
        assert_eq!(
            invalid.get("reason").and_then(Value::as_str),
            Some("unsupported-file")
        );
    }

    #[test]
    fn resolves_markdown_source_to_html_workspace_preview() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/demo.md".to_string(),
                workflow_kind: "markdown".to_string(),
                preview_kind: "html".to_string(),
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("useWorkspace").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            state.get("previewKind").and_then(Value::as_str),
            Some("html")
        );
        assert_eq!(
            state.get("previewMode").and_then(Value::as_str),
            Some("markdown")
        );
        assert_eq!(
            state.get("previewFilePath").and_then(Value::as_str),
            Some("preview:/tmp/demo.md")
        );
    }

    #[test]
    fn resolves_latex_source_to_pdf_workspace_preview() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/main.tex".to_string(),
                workflow_kind: "latex".to_string(),
                preview_kind: "pdf".to_string(),
                resolved_target_path: "/tmp/main.pdf".to_string(),
                artifact_ready: true,
                preview_requested: true,
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("useWorkspace").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            state.get("previewKind").and_then(Value::as_str),
            Some("pdf")
        );
        assert_eq!(
            state.get("previewMode").and_then(Value::as_str),
            Some("pdf-artifact")
        );
        assert_eq!(
            state.get("previewFilePath").and_then(Value::as_str),
            Some("/tmp/main.pdf")
        );
    }

    #[test]
    fn hides_preview_when_user_visibility_is_hidden() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/demo.md".to_string(),
                workflow_kind: "markdown".to_string(),
                preview_kind: "html".to_string(),
                hidden_by_user: true,
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("previewVisible").and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            state.get("reason").and_then(Value::as_str),
            Some("hidden-by-user")
        );
    }

    #[test]
    fn derives_workspace_preview_flags_from_persistent_state() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/main.tex".to_string(),
                workflow_kind: "latex".to_string(),
                preview_kind: "pdf".to_string(),
                resolved_target_path: "/tmp/main.pdf".to_string(),
                artifact_ready: true,
                state: DocumentWorkflowPersistentState {
                    session: DocumentWorkflowSession {
                        active_file: "/tmp/main.tex".to_string(),
                        preview_kind: "pdf".to_string(),
                        preview_source_path: "/tmp/main.tex".to_string(),
                        state: "workspace-preview".to_string(),
                        ..DocumentWorkflowSession::default()
                    },
                    ..DocumentWorkflowPersistentState::default()
                },
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("previewVisible").and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            state.get("reason").and_then(Value::as_str),
            Some("workspace-latex-pdf")
        );
    }

    #[test]
    fn persistent_hidden_visibility_hides_preview() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/demo.md".to_string(),
                workflow_kind: "markdown".to_string(),
                preview_kind: "html".to_string(),
                state: DocumentWorkflowPersistentState {
                    workspace_preview_visibility: HashMap::from([(
                        "/tmp/demo.md".to_string(),
                        "hidden".to_string(),
                    )]),
                    ..DocumentWorkflowPersistentState::default()
                },
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("previewVisible").and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            state.get("reason").and_then(Value::as_str),
            Some("hidden-by-user")
        );
    }

    #[test]
    fn persisted_preview_request_overrides_fallback_kind() {
        let state =
            resolve_document_workspace_preview_state(&DocumentWorkspacePreviewStateResolveParams {
                path: "/tmp/script.py".to_string(),
                workflow_kind: "python".to_string(),
                workflow_preview_kind: "pdf".to_string(),
                state: DocumentWorkflowPersistentState {
                    session: DocumentWorkflowSession {
                        active_file: "/tmp/script.py".to_string(),
                        preview_source_path: "/tmp/script.py".to_string(),
                        state: "workspace-preview".to_string(),
                        ..DocumentWorkflowSession::default()
                    },
                    workspace_preview_requests: HashMap::from([(
                        "/tmp/script.py".to_string(),
                        "terminal".to_string(),
                    )]),
                    ..DocumentWorkflowPersistentState::default()
                },
                ..DocumentWorkspacePreviewStateResolveParams::default()
            });

        assert_eq!(
            state.get("previewKind").and_then(Value::as_str),
            Some("terminal")
        );
        assert_eq!(
            state.get("reason").and_then(Value::as_str),
            Some("workspace-python-terminal")
        );
    }
}
