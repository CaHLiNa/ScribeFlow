use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub use crate::document_workflow_preview_binding::DocumentWorkflowPreviewBinding;
use crate::document_workflow_preview_binding::{
    normalize_preview_binding, normalize_preview_binding_set,
};

const DOCUMENT_WORKFLOW_SESSION_VERSION: u32 = 3;
const DEFAULT_SESSION_STATE: &str = "inactive";
const PREF_KIND_MARKDOWN: &str = "markdown";
const PREVIEW_KIND_HTML: &str = "html";
const PREVIEW_KIND_PDF: &str = "pdf";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPreviewPreference {
    #[serde(default)]
    pub preferred_preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowSession {
    #[serde(default)]
    pub active_file: String,
    #[serde(default)]
    pub active_kind: String,
    #[serde(default)]
    pub source_pane_id: String,
    #[serde(default)]
    pub preview_pane_id: String,
    #[serde(default)]
    pub preview_kind: String,
    #[serde(default)]
    pub preview_source_path: String,
    #[serde(default = "default_session_state")]
    pub state: String,
    #[serde(default)]
    pub detached_sources: HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexPreviewState {
    #[serde(default)]
    pub artifact_path: String,
    #[serde(default)]
    pub synctex_path: String,
    #[serde(default)]
    pub compile_target_path: String,
    #[serde(default)]
    pub last_compiled: u64,
    #[serde(default)]
    pub source_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPersistentState {
    #[serde(default)]
    pub preview_prefs: HashMap<String, DocumentWorkflowPreviewPreference>,
    #[serde(default)]
    pub session: DocumentWorkflowSession,
    #[serde(default)]
    pub preview_bindings: Vec<DocumentWorkflowPreviewBinding>,
    #[serde(default)]
    pub workspace_preview_visibility: HashMap<String, String>,
    #[serde(default)]
    pub workspace_preview_requests: HashMap<String, String>,
    #[serde(default)]
    pub latex_artifact_paths: HashMap<String, String>,
    #[serde(default)]
    pub latex_preview_states: HashMap<String, DocumentWorkflowLatexPreviewState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentWorkflowPersistentStateFile {
    #[serde(default = "default_document_workflow_session_version")]
    version: u32,
    #[serde(flatten)]
    state: DocumentWorkflowPersistentState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPersistentStateLoadParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub legacy_state: DocumentWorkflowPersistentState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(test), allow(dead_code))]
pub struct DocumentWorkflowPersistentStateSaveParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPersistentStateMutateParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
    #[serde(default)]
    pub mutation: String,
    #[serde(default)]
    pub payload: Value,
}

fn default_document_workflow_session_version() -> u32 {
    DOCUMENT_WORKFLOW_SESSION_VERSION
}

fn default_session_state() -> String {
    DEFAULT_SESSION_STATE.to_string()
}

impl Default for DocumentWorkflowSession {
    fn default() -> Self {
        Self {
            active_file: String::new(),
            active_kind: String::new(),
            source_pane_id: String::new(),
            preview_pane_id: String::new(),
            preview_kind: String::new(),
            preview_source_path: String::new(),
            state: default_session_state(),
            detached_sources: HashMap::new(),
        }
    }
}

impl Default for DocumentWorkflowPersistentState {
    fn default() -> Self {
        let mut preview_prefs = HashMap::new();
        preview_prefs.insert(
            PREF_KIND_MARKDOWN.to_string(),
            DocumentWorkflowPreviewPreference {
                preferred_preview: PREVIEW_KIND_HTML.to_string(),
            },
        );

        Self {
            preview_prefs,
            session: DocumentWorkflowSession::default(),
            preview_bindings: Vec::new(),
            workspace_preview_visibility: HashMap::new(),
            workspace_preview_requests: HashMap::new(),
            latex_artifact_paths: HashMap::new(),
            latex_preview_states: HashMap::new(),
        }
    }
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn document_workflow_session_path(workspace_data_dir: &str) -> Option<PathBuf> {
    let root = normalize_root(workspace_data_dir);
    if root.is_empty() {
        return None;
    }
    Some(Path::new(&root).join("document-workflow-state.json"))
}

fn read_document_workflow_session_state(
    workspace_data_dir: &str,
) -> Result<Option<DocumentWorkflowPersistentState>, String> {
    let Some(path) = document_workflow_session_path(workspace_data_dir) else {
        return Ok(None);
    };

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<DocumentWorkflowPersistentStateFile>(&content) {
        return Ok(Some(parsed.state));
    }

    let parsed = serde_json::from_str::<DocumentWorkflowPersistentState>(&content)
        .map_err(|error| format!("Failed to parse document workflow session state: {error}"))?;
    Ok(Some(parsed))
}

fn write_document_workflow_session_state(
    workspace_data_dir: &str,
    state: &DocumentWorkflowPersistentState,
) -> Result<(), String> {
    let Some(path) = document_workflow_session_path(workspace_data_dir) else {
        return Ok(());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = DocumentWorkflowPersistentStateFile {
        version: DOCUMENT_WORKFLOW_SESSION_VERSION,
        state: state.clone(),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize document workflow session state: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn normalize_path(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_workflow_kind(value: &str) -> String {
    match value.trim() {
        "markdown" => "markdown".to_string(),
        "latex" => "latex".to_string(),
        "python" => "python".to_string(),
        _ => String::new(),
    }
}

fn normalize_preview_kind(value: &str) -> String {
    match value.trim() {
        PREVIEW_KIND_HTML => PREVIEW_KIND_HTML.to_string(),
        PREVIEW_KIND_PDF => PREVIEW_KIND_PDF.to_string(),
        "terminal" => "terminal".to_string(),
        _ => String::new(),
    }
}

fn normalize_session_state_name(value: &str) -> String {
    match value.trim() {
        "source-only" => "source-only".to_string(),
        "workspace-preview" => "workspace-preview".to_string(),
        "ready" => "ready".to_string(),
        "detached-by-user" => "detached-by-user".to_string(),
        _ => DEFAULT_SESSION_STATE.to_string(),
    }
}

fn normalize_preview_preference(
    kind: &str,
    pref: &DocumentWorkflowPreviewPreference,
) -> Option<DocumentWorkflowPreviewPreference> {
    match kind {
        PREF_KIND_MARKDOWN => Some(DocumentWorkflowPreviewPreference {
            preferred_preview: PREVIEW_KIND_HTML.to_string(),
        }),
        "latex" => {
            let normalized = normalize_preview_kind(&pref.preferred_preview);
            if normalized.is_empty() {
                None
            } else {
                Some(DocumentWorkflowPreviewPreference {
                    preferred_preview: normalized,
                })
            }
        }
        _ => None,
    }
}

fn normalize_preview_prefs(
    prefs: HashMap<String, DocumentWorkflowPreviewPreference>,
) -> HashMap<String, DocumentWorkflowPreviewPreference> {
    let mut normalized = DocumentWorkflowPersistentState::default().preview_prefs;

    for (kind, pref) in prefs {
        if let Some(next_pref) = normalize_preview_preference(kind.trim(), &pref) {
            normalized.insert(kind.trim().to_string(), next_pref);
        }
    }

    normalized
}

fn normalize_detached_sources(values: HashMap<String, bool>) -> HashMap<String, bool> {
    values
        .into_iter()
        .filter_map(|(path, detached)| {
            let normalized_path = normalize_path(&path);
            if normalized_path.is_empty() || !detached {
                None
            } else {
                Some((normalized_path, true))
            }
        })
        .collect()
}

fn normalize_session(session: DocumentWorkflowSession) -> DocumentWorkflowSession {
    DocumentWorkflowSession {
        active_file: normalize_path(&session.active_file),
        active_kind: normalize_workflow_kind(&session.active_kind),
        source_pane_id: normalize_path(&session.source_pane_id),
        preview_pane_id: normalize_path(&session.preview_pane_id),
        preview_kind: normalize_preview_kind(&session.preview_kind),
        preview_source_path: normalize_path(&session.preview_source_path),
        state: normalize_session_state_name(&session.state),
        detached_sources: normalize_detached_sources(session.detached_sources),
    }
}

fn normalize_workspace_preview_visibility(
    values: HashMap<String, String>,
) -> HashMap<String, String> {
    values
        .into_iter()
        .filter_map(|(path, visibility)| {
            let normalized_path = normalize_path(&path);
            let normalized_visibility = match visibility.trim() {
                "hidden" => "hidden",
                "visible" => "visible",
                _ => "",
            };

            if normalized_path.is_empty() || normalized_visibility.is_empty() {
                None
            } else {
                Some((normalized_path, normalized_visibility.to_string()))
            }
        })
        .collect()
}

fn normalize_workspace_preview_requests(
    values: HashMap<String, String>,
) -> HashMap<String, String> {
    values
        .into_iter()
        .filter_map(|(path, preview_kind)| {
            let normalized_path = normalize_path(&path);
            let normalized_preview_kind = normalize_preview_kind(&preview_kind);
            if normalized_path.is_empty() || normalized_preview_kind.is_empty() {
                None
            } else {
                Some((normalized_path, normalized_preview_kind))
            }
        })
        .collect()
}

fn normalize_latex_artifact_paths(values: HashMap<String, String>) -> HashMap<String, String> {
    values
        .into_iter()
        .filter_map(|(path, artifact_path)| {
            let normalized_path = normalize_path(&path);
            let normalized_artifact_path = normalize_path(&artifact_path);
            if normalized_path.is_empty() || normalized_artifact_path.is_empty() {
                None
            } else {
                Some((normalized_path, normalized_artifact_path))
            }
        })
        .collect()
}

fn normalize_latex_preview_states(
    values: HashMap<String, DocumentWorkflowLatexPreviewState>,
) -> HashMap<String, DocumentWorkflowLatexPreviewState> {
    values
        .into_iter()
        .filter_map(|(path, state)| {
            let normalized_path = normalize_path(&path);
            if normalized_path.is_empty() {
                return None;
            }

            let normalized_state = DocumentWorkflowLatexPreviewState {
                artifact_path: normalize_path(&state.artifact_path),
                synctex_path: normalize_path(&state.synctex_path),
                compile_target_path: normalize_path(&state.compile_target_path),
                last_compiled: state.last_compiled,
                source_fingerprint: normalize_path(&state.source_fingerprint),
            };

            if normalized_state.artifact_path.is_empty()
                && normalized_state.synctex_path.is_empty()
                && normalized_state.compile_target_path.is_empty()
                && normalized_state.last_compiled == 0
                && normalized_state.source_fingerprint.is_empty()
            {
                None
            } else {
                Some((normalized_path, normalized_state))
            }
        })
        .collect()
}

fn value_as_u64(value: Option<&Value>) -> u64 {
    value
        .and_then(Value::as_u64)
        .or_else(|| {
            value
                .and_then(Value::as_f64)
                .filter(|entry| entry.is_finite() && *entry > 0.0)
                .map(|entry| entry as u64)
        })
        .unwrap_or(0)
}

fn has_latex_preview_state(state: &DocumentWorkflowLatexPreviewState) -> bool {
    !state.artifact_path.is_empty()
        || !state.synctex_path.is_empty()
        || !state.compile_target_path.is_empty()
        || state.last_compiled > 0
        || !state.source_fingerprint.is_empty()
}

fn update_latex_preview_state(
    state: &mut DocumentWorkflowPersistentState,
    file_path: &str,
    next_state: DocumentWorkflowLatexPreviewState,
) {
    let normalized_file_path = normalize_path(file_path);
    if normalized_file_path.is_empty() {
        return;
    }

    let normalized_state = DocumentWorkflowLatexPreviewState {
        artifact_path: normalize_path(&next_state.artifact_path),
        synctex_path: normalize_path(&next_state.synctex_path),
        compile_target_path: normalize_path(&next_state.compile_target_path),
        last_compiled: next_state.last_compiled,
        source_fingerprint: normalize_path(&next_state.source_fingerprint),
    };

    if !has_latex_preview_state(&normalized_state) {
        state.latex_artifact_paths.remove(&normalized_file_path);
        state.latex_preview_states.remove(&normalized_file_path);
        return;
    }

    if normalized_state.artifact_path.is_empty() {
        state.latex_artifact_paths.remove(&normalized_file_path);
    } else {
        state.latex_artifact_paths.insert(
            normalized_file_path.clone(),
            normalized_state.artifact_path.clone(),
        );
    }
    state
        .latex_preview_states
        .insert(normalized_file_path, normalized_state);
}

fn reconcile_document_workflow_persistent_state_paths(
    mut state: DocumentWorkflowPersistentState,
) -> DocumentWorkflowPersistentState {
    let mut next_artifact_paths = HashMap::new();
    let mut next_preview_states = HashMap::new();
    let source_paths = state
        .latex_artifact_paths
        .keys()
        .chain(state.latex_preview_states.keys())
        .cloned()
        .collect::<std::collections::HashSet<_>>();

    for source_path in source_paths {
        let preview_state = state.latex_preview_states.get(&source_path).cloned();
        let artifact_path = normalize_path(
            preview_state
                .as_ref()
                .map(|entry| entry.artifact_path.as_str())
                .or_else(|| {
                    state
                        .latex_artifact_paths
                        .get(&source_path)
                        .map(String::as_str)
                })
                .unwrap_or_default(),
        );

        if artifact_path.is_empty() || !Path::new(&artifact_path).exists() {
            continue;
        }

        let synctex_path = normalize_path(
            preview_state
                .as_ref()
                .map(|entry| entry.synctex_path.as_str())
                .unwrap_or_default(),
        );
        let compile_target_path = normalize_path(
            preview_state
                .as_ref()
                .map(|entry| entry.compile_target_path.as_str())
                .unwrap_or_default(),
        );
        let source_fingerprint = normalize_path(
            preview_state
                .as_ref()
                .map(|entry| entry.source_fingerprint.as_str())
                .unwrap_or_default(),
        );
        let last_compiled = preview_state
            .as_ref()
            .map(|entry| entry.last_compiled)
            .unwrap_or(0);

        next_artifact_paths.insert(source_path.clone(), artifact_path.clone());
        next_preview_states.insert(
            source_path,
            DocumentWorkflowLatexPreviewState {
                artifact_path,
                synctex_path: if synctex_path.is_empty() || Path::new(&synctex_path).exists() {
                    synctex_path
                } else {
                    String::new()
                },
                compile_target_path,
                last_compiled,
                source_fingerprint,
            },
        );
    }

    state.latex_artifact_paths = next_artifact_paths;
    state.latex_preview_states = next_preview_states;
    normalize_document_workflow_persistent_state(state)
}

fn apply_preview_preference_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let kind = payload
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if kind.is_empty() {
        return;
    }

    let preferred_preview = payload
        .get("previewKind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    state.preview_prefs.insert(
        kind.to_string(),
        DocumentWorkflowPreviewPreference { preferred_preview },
    );
}

fn apply_bind_preview_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let Ok(binding) = serde_json::from_value::<DocumentWorkflowPreviewBinding>(payload.clone())
    else {
        return;
    };
    let normalized_preview_path = normalize_path(&binding.preview_path);
    if normalized_preview_path.is_empty() {
        return;
    }

    state
        .preview_bindings
        .retain(|entry| entry.preview_path != normalized_preview_path);
    if let Some(normalized_binding) = normalize_preview_binding(binding) {
        state.preview_bindings.push(normalized_binding);
    }
}

fn apply_unbind_preview_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let preview_path = payload
        .get("previewPath")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let normalized_preview_path = normalize_path(preview_path);
    if normalized_preview_path.is_empty() {
        return;
    }
    state
        .preview_bindings
        .retain(|entry| entry.preview_path != normalized_preview_path);
}

fn apply_mark_detached_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let source_path = normalize_path(
        payload
            .get("sourcePath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if source_path.is_empty() {
        return;
    }

    state
        .session
        .detached_sources
        .insert(source_path.clone(), true);
    if state.session.preview_source_path == source_path {
        state.session.state = "detached-by-user".to_string();
    }
}

fn apply_clear_detached_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let source_path = normalize_path(
        payload
            .get("sourcePath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if source_path.is_empty() {
        return;
    }
    state.session.detached_sources.remove(&source_path);
}

fn apply_workspace_preview_visibility_mutation(
    state: &mut DocumentWorkflowPersistentState,
    payload: &Value,
) {
    let file_path = normalize_path(
        payload
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if file_path.is_empty() {
        return;
    }

    let visibility = match payload
        .get("visibility")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
    {
        "hidden" => "hidden",
        _ => "visible",
    };
    state
        .workspace_preview_visibility
        .insert(file_path, visibility.to_string());
}

fn apply_workspace_preview_request_mutation(
    state: &mut DocumentWorkflowPersistentState,
    payload: &Value,
) {
    let file_path = normalize_path(
        payload
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if file_path.is_empty() {
        return;
    }

    let preview_kind = normalize_preview_kind(
        payload
            .get("previewKind")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if preview_kind.is_empty() {
        state.workspace_preview_requests.remove(&file_path);
    } else {
        state
            .workspace_preview_requests
            .insert(file_path, preview_kind);
    }
}

fn apply_session_state_mutation(state: &mut DocumentWorkflowPersistentState, payload: &Value) {
    let Some(payload) = payload.as_object() else {
        return;
    };

    if let Some(value) = payload.get("activeFile").and_then(Value::as_str) {
        state.session.active_file = value.to_string();
    }
    if let Some(value) = payload.get("activeKind").and_then(Value::as_str) {
        state.session.active_kind = value.to_string();
    }
    if let Some(value) = payload.get("sourcePaneId").and_then(Value::as_str) {
        state.session.source_pane_id = value.to_string();
    }
    if let Some(value) = payload.get("previewPaneId").and_then(Value::as_str) {
        state.session.preview_pane_id = value.to_string();
    }
    if let Some(value) = payload.get("previewKind").and_then(Value::as_str) {
        state.session.preview_kind = value.to_string();
    }
    if let Some(value) = payload.get("previewSourcePath").and_then(Value::as_str) {
        state.session.preview_source_path = value.to_string();
    }
    if let Some(value) = payload.get("state").and_then(Value::as_str) {
        state.session.state = value.to_string();
    }
    if let Some(detached_sources) = payload.get("detachedSources").and_then(Value::as_object) {
        state.session.detached_sources = detached_sources
            .iter()
            .filter_map(|(path, detached)| {
                if detached.as_bool() == Some(true) {
                    Some((path.to_string(), true))
                } else {
                    None
                }
            })
            .collect();
    }
}

fn apply_latex_preview_state_mutation(
    state: &mut DocumentWorkflowPersistentState,
    payload: &Value,
) {
    let file_path = normalize_path(
        payload
            .get("filePath")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    if file_path.is_empty() {
        return;
    }

    let preview_state_payload = payload.get("state").unwrap_or(&Value::Null);
    let preview_state = DocumentWorkflowLatexPreviewState {
        artifact_path: preview_state_payload
            .get("artifactPath")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        synctex_path: preview_state_payload
            .get("synctexPath")
            .or_else(|| preview_state_payload.get("synctex_path"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        compile_target_path: preview_state_payload
            .get("compileTargetPath")
            .or_else(|| preview_state_payload.get("compile_target_path"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        last_compiled: value_as_u64(
            preview_state_payload
                .get("lastCompiled")
                .or_else(|| preview_state_payload.get("last_compiled")),
        ),
        source_fingerprint: preview_state_payload
            .get("sourceFingerprint")
            .or_else(|| preview_state_payload.get("source_fingerprint"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    };
    update_latex_preview_state(state, &file_path, preview_state);
}

fn apply_latex_compile_result_mutation(
    state: &mut DocumentWorkflowPersistentState,
    payload: &Value,
) {
    let source_path = normalize_path(
        payload
            .get("sourcePath")
            .or_else(|| payload.get("texPath"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    let target_path = normalize_path(
        payload
            .get("targetPath")
            .or_else(|| payload.get("compileTargetPath"))
            .or_else(|| payload.get("compile_target_path"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    let artifact_path = normalize_path(
        payload
            .get("artifactPath")
            .or_else(|| payload.get("previewPath"))
            .or_else(|| payload.get("pdfPath"))
            .or_else(|| payload.get("pdf_path"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    );
    let preview_state = DocumentWorkflowLatexPreviewState {
        artifact_path,
        synctex_path: normalize_path(
            payload
                .get("synctexPath")
                .or_else(|| payload.get("synctex_path"))
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
        compile_target_path: target_path.clone(),
        last_compiled: value_as_u64(
            payload
                .get("lastCompiled")
                .or_else(|| payload.get("last_compiled")),
        ),
        source_fingerprint: normalize_path(
            payload
                .get("sourceFingerprint")
                .or_else(|| payload.get("source_fingerprint"))
                .and_then(Value::as_str)
                .unwrap_or_default(),
        ),
    };

    if !source_path.is_empty() {
        update_latex_preview_state(state, &source_path, preview_state.clone());
    }
    if !target_path.is_empty() && target_path != source_path {
        update_latex_preview_state(state, &target_path, preview_state);
    }
}

fn mutate_document_workflow_persistent_state(
    state: DocumentWorkflowPersistentState,
    mutation: &str,
    payload: &Value,
) -> DocumentWorkflowPersistentState {
    let mut state = normalize_document_workflow_persistent_state(state);

    match mutation.trim() {
        "set-preview-preference" => apply_preview_preference_mutation(&mut state, payload),
        "bind-preview" => apply_bind_preview_mutation(&mut state, payload),
        "unbind-preview" => apply_unbind_preview_mutation(&mut state, payload),
        "mark-detached" => apply_mark_detached_mutation(&mut state, payload),
        "clear-detached" => apply_clear_detached_mutation(&mut state, payload),
        "set-workspace-preview-visibility" => {
            apply_workspace_preview_visibility_mutation(&mut state, payload)
        }
        "set-workspace-preview-request" => {
            apply_workspace_preview_request_mutation(&mut state, payload)
        }
        "set-session-state" => apply_session_state_mutation(&mut state, payload),
        "set-latex-preview-state" => apply_latex_preview_state_mutation(&mut state, payload),
        "apply-latex-compile-result" => apply_latex_compile_result_mutation(&mut state, payload),
        _ => {}
    }

    normalize_document_workflow_persistent_state(state)
}

pub fn normalize_document_workflow_persistent_state(
    state: DocumentWorkflowPersistentState,
) -> DocumentWorkflowPersistentState {
    let latex_artifact_paths = normalize_latex_artifact_paths(state.latex_artifact_paths);
    let mut latex_preview_states = normalize_latex_preview_states(state.latex_preview_states);

    for (source_path, artifact_path) in &latex_artifact_paths {
        latex_preview_states
            .entry(source_path.clone())
            .or_insert_with(|| DocumentWorkflowLatexPreviewState {
                artifact_path: artifact_path.clone(),
                synctex_path: String::new(),
                compile_target_path: String::new(),
                last_compiled: 0,
                source_fingerprint: String::new(),
            });
    }

    DocumentWorkflowPersistentState {
        preview_prefs: normalize_preview_prefs(state.preview_prefs),
        session: normalize_session(state.session),
        preview_bindings: normalize_preview_binding_set(state.preview_bindings),
        workspace_preview_visibility: normalize_workspace_preview_visibility(
            state.workspace_preview_visibility,
        ),
        workspace_preview_requests: normalize_workspace_preview_requests(
            state.workspace_preview_requests,
        ),
        latex_artifact_paths,
        latex_preview_states,
    }
}

#[tauri::command]
pub async fn document_workflow_session_load(
    params: DocumentWorkflowPersistentStateLoadParams,
) -> Result<DocumentWorkflowPersistentState, String> {
    if let Some(current) = read_document_workflow_session_state(&params.workspace_data_dir)? {
        let normalized = reconcile_document_workflow_persistent_state_paths(
            normalize_document_workflow_persistent_state(current),
        );
        write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
        return Ok(normalized);
    }

    let normalized = normalize_document_workflow_persistent_state(params.legacy_state);
    write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
#[cfg_attr(not(test), allow(dead_code))]
pub async fn document_workflow_session_save(
    params: DocumentWorkflowPersistentStateSaveParams,
) -> Result<DocumentWorkflowPersistentState, String> {
    let normalized = normalize_document_workflow_persistent_state(params.state);
    write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn document_workflow_session_mutate(
    params: DocumentWorkflowPersistentStateMutateParams,
) -> Result<DocumentWorkflowPersistentState, String> {
    let normalized =
        mutate_document_workflow_persistent_state(params.state, &params.mutation, &params.payload);
    write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        document_workflow_session_load, document_workflow_session_mutate,
        document_workflow_session_save, mutate_document_workflow_persistent_state,
        normalize_document_workflow_persistent_state, DocumentWorkflowLatexPreviewState,
        DocumentWorkflowPersistentState, DocumentWorkflowPersistentStateLoadParams,
        DocumentWorkflowPersistentStateMutateParams, DocumentWorkflowPersistentStateSaveParams,
        DocumentWorkflowPreviewBinding, DocumentWorkflowPreviewPreference, DocumentWorkflowSession,
    };
    use serde_json::json;
    use std::collections::HashMap;
    use std::fs;

    #[test]
    fn normalizes_preview_prefs_and_bindings() {
        let mut preview_prefs = HashMap::new();
        preview_prefs.insert(
            "markdown".to_string(),
            DocumentWorkflowPreviewPreference {
                preferred_preview: "pdf".to_string(),
            },
        );
        preview_prefs.insert(
            "latex".to_string(),
            DocumentWorkflowPreviewPreference {
                preferred_preview: "pdf".to_string(),
            },
        );

        let normalized =
            normalize_document_workflow_persistent_state(DocumentWorkflowPersistentState {
                preview_prefs,
                session: DocumentWorkflowSession::default(),
                preview_bindings: vec![
                    DocumentWorkflowPreviewBinding {
                        preview_path: "preview:/tmp/demo.md".to_string(),
                        source_path: "/tmp/demo.md".to_string(),
                        preview_kind: "html".to_string(),
                        kind: "markdown".to_string(),
                        pane_id: "pane-1".to_string(),
                        detach_on_close: true,
                    },
                    DocumentWorkflowPreviewBinding {
                        preview_path: "preview:/tmp/demo.md".to_string(),
                        source_path: "/tmp/demo.md".to_string(),
                        preview_kind: "html".to_string(),
                        kind: "markdown".to_string(),
                        pane_id: "pane-2".to_string(),
                        detach_on_close: true,
                    },
                ],
                workspace_preview_visibility: HashMap::new(),
                workspace_preview_requests: HashMap::new(),
                latex_artifact_paths: HashMap::new(),
                latex_preview_states: HashMap::new(),
            });

        assert_eq!(
            normalized
                .preview_prefs
                .get("markdown")
                .map(|value| value.preferred_preview.as_str()),
            Some("html")
        );
        assert_eq!(
            normalized
                .preview_prefs
                .get("latex")
                .map(|value| value.preferred_preview.as_str()),
            Some("pdf")
        );
        assert_eq!(normalized.preview_bindings.len(), 1);
    }

    #[test]
    fn migrates_legacy_latex_artifact_paths_into_preview_states() {
        let normalized =
            normalize_document_workflow_persistent_state(DocumentWorkflowPersistentState {
                preview_prefs: HashMap::new(),
                session: DocumentWorkflowSession::default(),
                preview_bindings: Vec::new(),
                workspace_preview_visibility: HashMap::new(),
                workspace_preview_requests: HashMap::new(),
                latex_artifact_paths: HashMap::from([(
                    "/tmp/main.tex".to_string(),
                    "/tmp/main.pdf".to_string(),
                )]),
                latex_preview_states: HashMap::new(),
            });

        assert_eq!(
            normalized
                .latex_preview_states
                .get("/tmp/main.tex")
                .map(|value| value.artifact_path.as_str()),
            Some("/tmp/main.pdf")
        );
    }

    #[tokio::test]
    async fn loads_and_saves_document_workflow_state() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let artifact_path = temp_dir.join("main.pdf");
        let synctex_path = temp_dir.join("main.synctex.gz");
        fs::write(&artifact_path, b"pdf").expect("write artifact");
        fs::write(&synctex_path, b"synctex").expect("write synctex");

        let saved = document_workflow_session_save(DocumentWorkflowPersistentStateSaveParams {
            workspace_data_dir: temp_dir.to_string_lossy().to_string(),
            state: DocumentWorkflowPersistentState {
                preview_prefs: HashMap::from([(
                    "markdown".to_string(),
                    DocumentWorkflowPreviewPreference {
                        preferred_preview: "html".to_string(),
                    },
                )]),
                session: DocumentWorkflowSession {
                    active_file: "/tmp/demo.md".to_string(),
                    active_kind: "markdown".to_string(),
                    source_pane_id: "pane-1".to_string(),
                    preview_pane_id: "pane-2".to_string(),
                    preview_kind: "html".to_string(),
                    preview_source_path: "/tmp/demo.md".to_string(),
                    state: "ready".to_string(),
                    detached_sources: HashMap::new(),
                },
                preview_bindings: vec![DocumentWorkflowPreviewBinding {
                    preview_path: "preview:/tmp/demo.md".to_string(),
                    source_path: "/tmp/demo.md".to_string(),
                    preview_kind: "html".to_string(),
                    kind: "markdown".to_string(),
                    pane_id: "pane-2".to_string(),
                    detach_on_close: true,
                }],
                workspace_preview_visibility: HashMap::from([(
                    "/tmp/demo.md".to_string(),
                    "visible".to_string(),
                )]),
                workspace_preview_requests: HashMap::from([(
                    "/tmp/demo.md".to_string(),
                    "html".to_string(),
                )]),
                latex_artifact_paths: HashMap::from([(
                    "/tmp/main.tex".to_string(),
                    artifact_path.to_string_lossy().to_string(),
                )]),
                latex_preview_states: HashMap::from([(
                    "/tmp/main.tex".to_string(),
                    DocumentWorkflowLatexPreviewState {
                        artifact_path: artifact_path.to_string_lossy().to_string(),
                        synctex_path: synctex_path.to_string_lossy().to_string(),
                        compile_target_path: "/tmp/main.tex".to_string(),
                        last_compiled: 42,
                        source_fingerprint: "fp:123".to_string(),
                    },
                )]),
            },
        })
        .await
        .expect("save document workflow session");

        let loaded = document_workflow_session_load(DocumentWorkflowPersistentStateLoadParams {
            workspace_data_dir: temp_dir.to_string_lossy().to_string(),
            legacy_state: DocumentWorkflowPersistentState::default(),
        })
        .await
        .expect("load document workflow session");

        assert_eq!(saved, loaded);
        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn mutates_preview_bindings_and_session_state_in_rust() {
        let mutated = mutate_document_workflow_persistent_state(
            DocumentWorkflowPersistentState::default(),
            "bind-preview",
            &json!({
                "previewPath": " preview:/tmp/demo.md ",
                "sourcePath": " /tmp/demo.md ",
                "previewKind": "html",
                "kind": "markdown",
                "paneId": "pane-2",
                "detachOnClose": true
            }),
        );
        let mutated = mutate_document_workflow_persistent_state(
            mutated,
            "set-session-state",
            &json!({
                "activeFile": " /tmp/demo.md ",
                "activeKind": "markdown",
                "previewKind": "html",
                "previewSourcePath": "/tmp/demo.md",
                "state": "ready"
            }),
        );

        assert_eq!(mutated.preview_bindings.len(), 1);
        assert_eq!(
            mutated.preview_bindings[0].preview_path,
            "preview:/tmp/demo.md"
        );
        assert_eq!(mutated.session.active_file, "/tmp/demo.md");
        assert_eq!(mutated.session.state, "ready");
    }

    #[tokio::test]
    async fn load_reconciles_missing_latex_artifact_paths() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-reconcile-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        document_workflow_session_save(DocumentWorkflowPersistentStateSaveParams {
            workspace_data_dir: temp_dir.to_string_lossy().to_string(),
            state: DocumentWorkflowPersistentState {
                latex_artifact_paths: HashMap::from([(
                    "/tmp/main.tex".to_string(),
                    temp_dir.join("missing.pdf").to_string_lossy().to_string(),
                )]),
                latex_preview_states: HashMap::new(),
                ..DocumentWorkflowPersistentState::default()
            },
        })
        .await
        .expect("save document workflow session");

        let loaded = document_workflow_session_load(DocumentWorkflowPersistentStateLoadParams {
            workspace_data_dir: temp_dir.to_string_lossy().to_string(),
            legacy_state: DocumentWorkflowPersistentState::default(),
        })
        .await
        .expect("load document workflow session");

        assert!(loaded.latex_artifact_paths.is_empty());
        assert!(loaded.latex_preview_states.is_empty());
        fs::remove_dir_all(temp_dir).ok();
    }

    #[tokio::test]
    async fn mutate_applies_latex_compile_result_for_source_and_target() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-mutate-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let artifact_path = temp_dir.join("main.pdf");
        let synctex_path = temp_dir.join("main.synctex.gz");
        fs::write(&artifact_path, b"pdf").expect("write artifact");
        fs::write(&synctex_path, b"synctex").expect("write synctex");

        let mutated =
            document_workflow_session_mutate(DocumentWorkflowPersistentStateMutateParams {
                workspace_data_dir: temp_dir.to_string_lossy().to_string(),
                state: DocumentWorkflowPersistentState::default(),
                mutation: "apply-latex-compile-result".to_string(),
                payload: json!({
                    "sourcePath": "/tmp/source.tex",
                    "targetPath": "/tmp/root.tex",
                    "previewPath": artifact_path.to_string_lossy().to_string(),
                    "synctexPath": synctex_path.to_string_lossy().to_string(),
                    "lastCompiled": 42,
                    "sourceFingerprint": "fp:123"
                }),
            })
            .await
            .expect("mutate document workflow session");

        assert_eq!(
            mutated
                .latex_preview_states
                .get("/tmp/source.tex")
                .map(|value| value.artifact_path.as_str()),
            Some(artifact_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            mutated
                .latex_preview_states
                .get("/tmp/root.tex")
                .map(|value| value.compile_target_path.as_str()),
            Some("/tmp/root.tex")
        );
        fs::remove_dir_all(temp_dir).ok();
    }
}
