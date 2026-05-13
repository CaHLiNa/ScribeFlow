use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::document_workflow::get_document_workflow_kind;
pub use crate::document_workflow_preview_binding::DocumentWorkflowPreviewBinding;
use crate::document_workflow_preview_binding::{
    normalize_preview_binding, normalize_preview_binding_set,
};
use crate::security::{self, WorkspaceScopeState};

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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPersistentStateSaveParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexPreviewReconcileParams {
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexPreviewReconcileResult {
    pub state: DocumentWorkflowPersistentState,
    pub changed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexPreviewApplyParams {
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub preview_state: DocumentWorkflowLatexPreviewState,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowLatexPreviewApplyResult {
    pub state: DocumentWorkflowPersistentState,
    pub changed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPreviewBindingApplyParams {
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub binding: DocumentWorkflowPreviewBinding,
    #[serde(default)]
    pub preview_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPreviewBindingApplyResult {
    pub state: DocumentWorkflowPersistentState,
    pub changed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowSessionMutationApplyParams {
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
    #[serde(default)]
    pub intent: String,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub preview_kind: String,
    #[serde(default)]
    pub session_patch: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowSessionMutationApplyResult {
    pub state: DocumentWorkflowPersistentState,
    pub changed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowWorkspacePreviewApplyParams {
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
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
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowWorkspacePreviewApplyResult {
    pub state: DocumentWorkflowPersistentState,
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPreviewCloseEffectResolveParams {
    #[serde(default)]
    pub preview_path: String,
    #[serde(default)]
    pub preview_binding: Option<DocumentWorkflowPreviewBinding>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowPreviewCloseEffect {
    pub source_path: Option<String>,
    pub mark_detached: bool,
}

fn default_document_workflow_session_version() -> u32 {
    DOCUMENT_WORKFLOW_SESSION_VERSION
}

fn default_persist_preference() -> bool {
    true
}

fn default_session_state() -> String {
    DEFAULT_SESSION_STATE.to_string()
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

fn persistent_state_payload_field(
    params: &Value,
    keys: &[&str],
) -> DocumentWorkflowPersistentState {
    payload_field(params, keys)
        .cloned()
        .and_then(|value| serde_json::from_value::<DocumentWorkflowPersistentState>(value).ok())
        .unwrap_or_default()
}

fn document_workflow_workspace_preview_apply_params_from_payload(
    params: Value,
) -> DocumentWorkflowWorkspacePreviewApplyParams {
    DocumentWorkflowWorkspacePreviewApplyParams {
        state: persistent_state_payload_field(&params, &["state"]),
        intent: string_payload_field(&params, &["intent"]),
        file_path: string_payload_field(&params, &["filePath", "file_path"]),
        kind: string_payload_field(&params, &["kind"]),
        preview_kind: string_payload_field(&params, &["previewKind", "preview_kind"]),
        preferred_preview_kind: string_payload_field(
            &params,
            &["preferredPreviewKind", "preferred_preview_kind"],
        ),
        persist_preference: bool_payload_field(
            &params,
            &["persistPreference", "persist_preference"],
            true,
        ),
        source_pane_id: string_payload_field(&params, &["sourcePaneId", "source_pane_id"]),
    }
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

fn preview_source_path_from_path(path: &str) -> String {
    normalize_path(path)
        .strip_prefix("preview:")
        .unwrap_or_default()
        .to_string()
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

fn patch_string_field(target: &mut String, patch: &Map<String, Value>, key: &str) {
    if let Some(value) = patch.get(key) {
        *target = value.as_str().map(str::to_string).unwrap_or_default();
    }
}

fn patch_detached_sources(
    target: &mut HashMap<String, bool>,
    patch: &Map<String, Value>,
    key: &str,
) {
    let Some(value) = patch.get(key) else {
        return;
    };
    let Some(values) = value.as_object() else {
        target.clear();
        return;
    };
    *target = values
        .iter()
        .filter_map(|(path, detached)| {
            let normalized_path = normalize_path(path);
            if normalized_path.is_empty() || detached.as_bool() != Some(true) {
                None
            } else {
                Some((normalized_path, true))
            }
        })
        .collect();
}

fn apply_session_patch(
    session: DocumentWorkflowSession,
    patch: Value,
) -> (DocumentWorkflowSession, bool) {
    let mut next = session.clone();
    let Some(values) = patch.as_object() else {
        return (normalize_session(next), false);
    };

    patch_string_field(&mut next.active_file, values, "activeFile");
    patch_string_field(&mut next.active_kind, values, "activeKind");
    patch_string_field(&mut next.source_pane_id, values, "sourcePaneId");
    patch_string_field(&mut next.preview_pane_id, values, "previewPaneId");
    patch_string_field(&mut next.preview_kind, values, "previewKind");
    patch_string_field(&mut next.preview_source_path, values, "previewSourcePath");
    patch_string_field(&mut next.state, values, "state");
    patch_detached_sources(&mut next.detached_sources, values, "detachedSources");

    let normalized = normalize_session(next);
    let changed = normalized != normalize_session(session);
    (normalized, changed)
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

fn workspace_path_exists(scope_state: &WorkspaceScopeState, path: &str) -> bool {
    let normalized = normalize_path(path);
    if normalized.is_empty() {
        return false;
    }
    security::ensure_allowed_workspace_path(scope_state, Path::new(&normalized))
        .map(|resolved| resolved.exists())
        .unwrap_or(false)
}

pub fn reconcile_document_workflow_latex_preview_state(
    state: DocumentWorkflowPersistentState,
    scope_state: &WorkspaceScopeState,
) -> DocumentWorkflowPersistentState {
    let mut normalized = normalize_document_workflow_persistent_state(state);
    let source_paths = normalized
        .latex_artifact_paths
        .keys()
        .chain(normalized.latex_preview_states.keys())
        .cloned()
        .collect::<std::collections::BTreeSet<_>>();

    let mut next_artifact_paths = HashMap::new();
    let mut next_preview_states = HashMap::new();

    for source_path in source_paths {
        let Some(preview_state) = normalized.latex_preview_states.get(&source_path).cloned() else {
            continue;
        };
        let artifact_path = if preview_state.artifact_path.is_empty() {
            normalized
                .latex_artifact_paths
                .get(&source_path)
                .cloned()
                .unwrap_or_default()
        } else {
            preview_state.artifact_path.clone()
        };
        if artifact_path.is_empty() || !workspace_path_exists(scope_state, &artifact_path) {
            continue;
        }

        let synctex_path = if workspace_path_exists(scope_state, &preview_state.synctex_path) {
            preview_state.synctex_path
        } else {
            String::new()
        };

        next_artifact_paths.insert(source_path.clone(), artifact_path.clone());
        next_preview_states.insert(
            source_path,
            DocumentWorkflowLatexPreviewState {
                artifact_path,
                synctex_path,
                compile_target_path: preview_state.compile_target_path,
                last_compiled: preview_state.last_compiled,
                source_fingerprint: preview_state.source_fingerprint,
            },
        );
    }

    normalized.latex_artifact_paths = next_artifact_paths;
    normalized.latex_preview_states = next_preview_states;
    normalized
}

pub fn reconcile_document_workflow_latex_preview_state_with_change(
    state: DocumentWorkflowPersistentState,
    scope_state: &WorkspaceScopeState,
) -> DocumentWorkflowLatexPreviewReconcileResult {
    let normalized = normalize_document_workflow_persistent_state(state);
    let reconciled =
        reconcile_document_workflow_latex_preview_state(normalized.clone(), scope_state);
    let changed = normalized.latex_artifact_paths != reconciled.latex_artifact_paths
        || normalized.latex_preview_states != reconciled.latex_preview_states;

    DocumentWorkflowLatexPreviewReconcileResult {
        state: reconciled,
        changed,
    }
}

fn normalize_latex_preview_state(
    state: DocumentWorkflowLatexPreviewState,
) -> DocumentWorkflowLatexPreviewState {
    DocumentWorkflowLatexPreviewState {
        artifact_path: normalize_path(&state.artifact_path),
        synctex_path: normalize_path(&state.synctex_path),
        compile_target_path: normalize_path(&state.compile_target_path),
        last_compiled: state.last_compiled,
        source_fingerprint: normalize_path(&state.source_fingerprint),
    }
}

fn has_latex_preview_runtime_state(state: &DocumentWorkflowLatexPreviewState) -> bool {
    !state.artifact_path.is_empty()
        || !state.synctex_path.is_empty()
        || !state.compile_target_path.is_empty()
        || state.last_compiled != 0
        || !state.source_fingerprint.is_empty()
}

pub fn apply_document_workflow_latex_preview_state(
    params: DocumentWorkflowLatexPreviewApplyParams,
) -> DocumentWorkflowLatexPreviewApplyResult {
    let mut state = normalize_document_workflow_persistent_state(params.state);
    let file_path = normalize_path(&params.file_path);
    if file_path.is_empty() {
        return DocumentWorkflowLatexPreviewApplyResult {
            state,
            changed: false,
        };
    }

    let preview_state = normalize_latex_preview_state(params.preview_state);
    if !has_latex_preview_runtime_state(&preview_state) {
        let removed_artifact = state.latex_artifact_paths.remove(&file_path).is_some();
        let removed_state = state.latex_preview_states.remove(&file_path).is_some();
        return DocumentWorkflowLatexPreviewApplyResult {
            state: normalize_document_workflow_persistent_state(state),
            changed: removed_artifact || removed_state,
        };
    }

    let previous_artifact_path = state
        .latex_artifact_paths
        .get(&file_path)
        .cloned()
        .unwrap_or_default();
    let previous_state = state.latex_preview_states.get(&file_path);
    let unchanged = previous_artifact_path == preview_state.artifact_path
        && previous_state
            .map(|state| state == &preview_state)
            .unwrap_or(false);

    if unchanged {
        return DocumentWorkflowLatexPreviewApplyResult {
            state,
            changed: false,
        };
    }

    if preview_state.artifact_path.is_empty() {
        state.latex_artifact_paths.remove(&file_path);
    } else {
        state
            .latex_artifact_paths
            .insert(file_path.clone(), preview_state.artifact_path.clone());
    }
    state.latex_preview_states.insert(file_path, preview_state);

    DocumentWorkflowLatexPreviewApplyResult {
        state: normalize_document_workflow_persistent_state(state),
        changed: true,
    }
}

pub fn apply_document_workflow_preview_binding_state(
    params: DocumentWorkflowPreviewBindingApplyParams,
) -> DocumentWorkflowPreviewBindingApplyResult {
    let mut state = normalize_document_workflow_persistent_state(params.state);

    let changed = match params.intent.trim() {
        "bind" => {
            let Some(next_binding) = normalize_preview_binding(params.binding) else {
                return DocumentWorkflowPreviewBindingApplyResult {
                    state,
                    changed: false,
                };
            };

            let mut replaced = false;
            let mut changed = false;
            for binding in &mut state.preview_bindings {
                if binding.preview_path == next_binding.preview_path {
                    if binding != &next_binding {
                        *binding = next_binding.clone();
                        changed = true;
                    }
                    replaced = true;
                    break;
                }
            }

            if !replaced {
                state.preview_bindings.push(next_binding);
                changed = true;
            }
            changed
        }
        "unbind" => {
            let preview_path = normalize_path(&params.preview_path);
            if preview_path.is_empty() {
                false
            } else {
                let previous_len = state.preview_bindings.len();
                state
                    .preview_bindings
                    .retain(|binding| binding.preview_path != preview_path);
                state.preview_bindings.len() != previous_len
            }
        }
        _ => false,
    };

    DocumentWorkflowPreviewBindingApplyResult {
        state: normalize_document_workflow_persistent_state(state),
        changed,
    }
}

pub fn apply_document_workflow_session_mutation(
    params: DocumentWorkflowSessionMutationApplyParams,
) -> DocumentWorkflowSessionMutationApplyResult {
    let mut state = normalize_document_workflow_persistent_state(params.state);

    let changed = match params.intent.trim() {
        "mark-detached" => {
            let source_path = normalize_path(&params.source_path);
            if source_path.is_empty() {
                false
            } else {
                let previous_detached = state
                    .session
                    .detached_sources
                    .insert(source_path.clone(), true);
                let mut changed = previous_detached != Some(true);
                if state.session.preview_source_path == source_path
                    && state.session.state != "detached-by-user"
                {
                    state.session.state = "detached-by-user".to_string();
                    changed = true;
                }
                changed
            }
        }
        "clear-detached" => {
            let source_path = normalize_path(&params.source_path);
            if source_path.is_empty() {
                false
            } else {
                state
                    .session
                    .detached_sources
                    .remove(&source_path)
                    .is_some()
            }
        }
        "set-workspace-preview-visibility" => {
            let file_path = normalize_path(&params.file_path);
            if file_path.is_empty() {
                false
            } else {
                let visibility = if params.visibility.trim() == "hidden" {
                    "hidden".to_string()
                } else {
                    "visible".to_string()
                };
                state
                    .workspace_preview_visibility
                    .insert(file_path, visibility.clone())
                    != Some(visibility)
            }
        }
        "set-workspace-preview-request" => {
            let file_path = normalize_path(&params.file_path);
            if file_path.is_empty() {
                false
            } else {
                let preview_kind = normalize_preview_kind(&params.preview_kind);
                if preview_kind.is_empty() {
                    state
                        .workspace_preview_requests
                        .remove(&file_path)
                        .is_some()
                } else {
                    state
                        .workspace_preview_requests
                        .insert(file_path, preview_kind.clone())
                        != Some(preview_kind)
                }
            }
        }
        "set-session-state" => {
            let (next_session, changed) =
                apply_session_patch(state.session.clone(), params.session_patch);
            state.session = next_session;
            changed
        }
        _ => false,
    };

    DocumentWorkflowSessionMutationApplyResult {
        state: normalize_document_workflow_persistent_state(state),
        changed,
    }
}

pub fn apply_document_workflow_workspace_preview_state(
    params: DocumentWorkflowWorkspacePreviewApplyParams,
) -> DocumentWorkflowWorkspacePreviewApplyResult {
    let mut state = normalize_document_workflow_persistent_state(params.state);
    let file_path = normalize_path(&params.file_path);
    let kind = normalize_workflow_kind(&params.kind);
    let preview_kind = normalize_preview_kind(&params.preview_kind);

    let result = match params.intent.trim() {
        "show" if !file_path.is_empty() && !kind.is_empty() && !preview_kind.is_empty() => {
            if params.persist_preference {
                state.preview_prefs.insert(
                    kind.clone(),
                    DocumentWorkflowPreviewPreference {
                        preferred_preview: preview_kind.clone(),
                    },
                );
            }

            if preview_kind == normalize_preview_kind(&params.preferred_preview_kind) {
                state.workspace_preview_requests.remove(&file_path);
            } else {
                state
                    .workspace_preview_requests
                    .insert(file_path.clone(), preview_kind.clone());
            }

            state
                .workspace_preview_visibility
                .insert(file_path.clone(), "visible".to_string());
            state.session.detached_sources.remove(&file_path);

            let source_pane_id = if params.source_pane_id.trim().is_empty() {
                state.session.source_pane_id.clone()
            } else {
                normalize_path(&params.source_pane_id)
            };
            state.session.active_file = file_path.clone();
            state.session.active_kind = kind;
            state.session.source_pane_id = source_pane_id;
            state.session.preview_pane_id = String::new();
            state.session.preview_kind = preview_kind.clone();
            state.session.preview_source_path = file_path.clone();
            state.session.state = "workspace-preview".to_string();

            json!({
                "type": "workspace-preview",
                "filePath": file_path,
                "previewKind": preview_kind,
            })
        }
        "hide" if !file_path.is_empty() => {
            state.workspace_preview_requests.remove(&file_path);
            state
                .workspace_preview_visibility
                .insert(file_path.clone(), "hidden".to_string());

            json!({
                "type": "workspace-preview-hidden",
                "filePath": file_path,
            })
        }
        _ => Value::Null,
    };

    DocumentWorkflowWorkspacePreviewApplyResult {
        state: normalize_document_workflow_persistent_state(state),
        result,
    }
}

pub fn resolve_document_workflow_preview_close_effect(
    params: DocumentWorkflowPreviewCloseEffectResolveParams,
) -> DocumentWorkflowPreviewCloseEffect {
    let preview_path = normalize_path(&params.preview_path);
    let binding = params.preview_binding.and_then(normalize_preview_binding);
    let bound_source_path = binding
        .as_ref()
        .map(|binding| normalize_path(&binding.source_path))
        .filter(|source_path| !source_path.is_empty());
    let preview_source_path = preview_source_path_from_path(&preview_path);
    let workflow_source_path = if get_document_workflow_kind(&preview_path).is_some() {
        preview_path
    } else {
        String::new()
    };

    DocumentWorkflowPreviewCloseEffect {
        source_path: bound_source_path
            .or_else(|| {
                if preview_source_path.is_empty() {
                    None
                } else {
                    Some(preview_source_path)
                }
            })
            .or_else(|| {
                if workflow_source_path.is_empty() {
                    None
                } else {
                    Some(workflow_source_path)
                }
            }),
        mark_detached: binding
            .as_ref()
            .map(|binding| binding.detach_on_close)
            .unwrap_or(false),
    }
}

#[tauri::command]
pub async fn document_workflow_session_load(
    params: DocumentWorkflowPersistentStateLoadParams,
) -> Result<DocumentWorkflowPersistentState, String> {
    if let Some(current) = read_document_workflow_session_state(&params.workspace_data_dir)? {
        return Ok(normalize_document_workflow_persistent_state(current));
    }

    let normalized =
        normalize_document_workflow_persistent_state(DocumentWorkflowPersistentState::default());
    write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn document_workflow_session_save(
    params: DocumentWorkflowPersistentStateSaveParams,
) -> Result<DocumentWorkflowPersistentState, String> {
    let normalized = normalize_document_workflow_persistent_state(params.state);
    write_document_workflow_session_state(&params.workspace_data_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn document_workflow_latex_preview_reconcile(
    params: DocumentWorkflowLatexPreviewReconcileParams,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<DocumentWorkflowLatexPreviewReconcileResult, String> {
    Ok(reconcile_document_workflow_latex_preview_state_with_change(
        params.state,
        scope_state.inner(),
    ))
}

#[tauri::command]
pub async fn document_workflow_latex_preview_apply(
    params: DocumentWorkflowLatexPreviewApplyParams,
) -> Result<DocumentWorkflowLatexPreviewApplyResult, String> {
    Ok(apply_document_workflow_latex_preview_state(params))
}

#[tauri::command]
pub async fn document_workflow_preview_binding_apply(
    params: DocumentWorkflowPreviewBindingApplyParams,
) -> Result<DocumentWorkflowPreviewBindingApplyResult, String> {
    Ok(apply_document_workflow_preview_binding_state(params))
}

#[tauri::command]
pub async fn document_workflow_session_mutation_apply(
    params: DocumentWorkflowSessionMutationApplyParams,
) -> Result<DocumentWorkflowSessionMutationApplyResult, String> {
    Ok(apply_document_workflow_session_mutation(params))
}

#[tauri::command]
pub async fn document_workflow_workspace_preview_apply(
    params: Value,
) -> Result<DocumentWorkflowWorkspacePreviewApplyResult, String> {
    let params = document_workflow_workspace_preview_apply_params_from_payload(params);
    Ok(apply_document_workflow_workspace_preview_state(params))
}

#[tauri::command]
pub async fn document_workflow_preview_close_effect_resolve(
    params: DocumentWorkflowPreviewCloseEffectResolveParams,
) -> Result<DocumentWorkflowPreviewCloseEffect, String> {
    Ok(resolve_document_workflow_preview_close_effect(params))
}

#[cfg(test)]
mod tests {
    use super::{
        apply_document_workflow_latex_preview_state, apply_document_workflow_preview_binding_state,
        apply_document_workflow_session_mutation, apply_document_workflow_workspace_preview_state,
        document_workflow_workspace_preview_apply,
        document_workflow_workspace_preview_apply_params_from_payload,
        document_workflow_session_load, document_workflow_session_save,
        normalize_document_workflow_persistent_state,
        reconcile_document_workflow_latex_preview_state,
        reconcile_document_workflow_latex_preview_state_with_change,
        resolve_document_workflow_preview_close_effect, DocumentWorkflowLatexPreviewApplyParams,
        DocumentWorkflowLatexPreviewState, DocumentWorkflowPersistentState,
        DocumentWorkflowPersistentStateLoadParams, DocumentWorkflowPersistentStateSaveParams,
        DocumentWorkflowPreviewBinding, DocumentWorkflowPreviewBindingApplyParams,
        DocumentWorkflowPreviewCloseEffectResolveParams, DocumentWorkflowPreviewPreference,
        DocumentWorkflowSession, DocumentWorkflowSessionMutationApplyParams,
        DocumentWorkflowWorkspacePreviewApplyParams,
    };
    use crate::security::{set_allowed_roots_internal, WorkspaceScopeState};
    use serde_json::{json, Value};
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
    fn normalizes_latex_artifact_paths_into_preview_states() {
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
                    "/tmp/main.pdf".to_string(),
                )]),
                latex_preview_states: HashMap::from([(
                    "/tmp/main.tex".to_string(),
                    DocumentWorkflowLatexPreviewState {
                        artifact_path: "/tmp/main.pdf".to_string(),
                        synctex_path: "/tmp/main.synctex.gz".to_string(),
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
        })
        .await
        .expect("load document workflow session");

        assert_eq!(saved, loaded);
        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn reconciles_latex_preview_paths_against_workspace_scope() {
        let workspace_root = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-preview-{}",
            uuid::Uuid::new_v4()
        ));
        let outside_root = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-preview-outside-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_root).expect("create workspace root");
        fs::create_dir_all(&outside_root).expect("create outside root");
        let source_path = workspace_root.join("main.tex");
        let artifact_path = workspace_root.join("main.pdf");
        let missing_source_path = workspace_root.join("missing.tex");
        let missing_artifact_path = workspace_root.join("missing.pdf");
        let outside_source_path = workspace_root.join("outside.tex");
        let outside_artifact_path = outside_root.join("outside.pdf");
        fs::write(&source_path, "\\documentclass{article}").expect("write source");
        fs::write(&artifact_path, "%PDF").expect("write artifact");
        fs::write(&outside_artifact_path, "%PDF").expect("write outside artifact");

        let scope = WorkspaceScopeState::default();
        set_allowed_roots_internal(&scope, &workspace_root.to_string_lossy(), None, None, None)
            .expect("set workspace scope");

        let reconciled = reconcile_document_workflow_latex_preview_state(
            DocumentWorkflowPersistentState {
                preview_prefs: HashMap::new(),
                session: DocumentWorkflowSession::default(),
                preview_bindings: Vec::new(),
                workspace_preview_visibility: HashMap::new(),
                workspace_preview_requests: HashMap::new(),
                latex_artifact_paths: HashMap::from([
                    (
                        source_path.to_string_lossy().to_string(),
                        artifact_path.to_string_lossy().to_string(),
                    ),
                    (
                        missing_source_path.to_string_lossy().to_string(),
                        missing_artifact_path.to_string_lossy().to_string(),
                    ),
                    (
                        outside_source_path.to_string_lossy().to_string(),
                        outside_artifact_path.to_string_lossy().to_string(),
                    ),
                ]),
                latex_preview_states: HashMap::from([(
                    source_path.to_string_lossy().to_string(),
                    DocumentWorkflowLatexPreviewState {
                        artifact_path: artifact_path.to_string_lossy().to_string(),
                        synctex_path: workspace_root
                            .join("missing.synctex.gz")
                            .to_string_lossy()
                            .to_string(),
                        compile_target_path: source_path.to_string_lossy().to_string(),
                        last_compiled: 42,
                        source_fingerprint: "fp:123".to_string(),
                    },
                )]),
            },
            &scope,
        );

        assert_eq!(reconciled.latex_artifact_paths.len(), 1);
        assert_eq!(
            reconciled
                .latex_artifact_paths
                .get(&source_path.to_string_lossy().to_string())
                .map(String::as_str),
            Some(artifact_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            reconciled
                .latex_preview_states
                .get(&source_path.to_string_lossy().to_string())
                .map(|state| state.synctex_path.as_str()),
            Some("")
        );

        fs::remove_dir_all(workspace_root).ok();
        fs::remove_dir_all(outside_root).ok();
    }

    #[test]
    fn reports_latex_preview_reconcile_changed_state() {
        let workspace_root = std::env::temp_dir().join(format!(
            "scribeflow-document-workflow-preview-changed-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_root).expect("create workspace root");
        let source_path = workspace_root.join("main.tex");
        let artifact_path = workspace_root.join("main.pdf");
        let stale_source_path = workspace_root.join("stale.tex");
        let stale_artifact_path = workspace_root.join("stale.pdf");
        fs::write(&artifact_path, "%PDF").expect("write artifact");

        let scope = WorkspaceScopeState::default();
        set_allowed_roots_internal(&scope, &workspace_root.to_string_lossy(), None, None, None)
            .expect("set workspace scope");

        let reconciled = reconcile_document_workflow_latex_preview_state_with_change(
            DocumentWorkflowPersistentState {
                preview_prefs: HashMap::new(),
                session: DocumentWorkflowSession::default(),
                preview_bindings: Vec::new(),
                workspace_preview_visibility: HashMap::new(),
                workspace_preview_requests: HashMap::new(),
                latex_artifact_paths: HashMap::from([
                    (
                        source_path.to_string_lossy().to_string(),
                        artifact_path.to_string_lossy().to_string(),
                    ),
                    (
                        stale_source_path.to_string_lossy().to_string(),
                        stale_artifact_path.to_string_lossy().to_string(),
                    ),
                ]),
                latex_preview_states: HashMap::new(),
            },
            &scope,
        );

        assert!(reconciled.changed);
        assert_eq!(reconciled.state.latex_artifact_paths.len(), 1);

        let unchanged = reconcile_document_workflow_latex_preview_state_with_change(
            reconciled.state.clone(),
            &scope,
        );
        assert!(!unchanged.changed);

        fs::remove_dir_all(workspace_root).ok();
    }

    #[test]
    fn applies_latex_preview_state_to_persistent_maps() {
        let result =
            apply_document_workflow_latex_preview_state(DocumentWorkflowLatexPreviewApplyParams {
                state: DocumentWorkflowPersistentState::default(),
                file_path: " /tmp/main.tex ".to_string(),
                preview_state: DocumentWorkflowLatexPreviewState {
                    artifact_path: " /tmp/main.pdf ".to_string(),
                    synctex_path: " /tmp/main.synctex.gz ".to_string(),
                    compile_target_path: " /tmp/root.tex ".to_string(),
                    last_compiled: 42,
                    source_fingerprint: " fp:123 ".to_string(),
                },
            });

        assert!(result.changed);
        assert_eq!(
            result
                .state
                .latex_artifact_paths
                .get("/tmp/main.tex")
                .map(String::as_str),
            Some("/tmp/main.pdf")
        );
        assert_eq!(
            result
                .state
                .latex_preview_states
                .get("/tmp/main.tex")
                .map(|state| state.source_fingerprint.as_str()),
            Some("fp:123")
        );
    }

    #[test]
    fn clears_latex_preview_state_when_runtime_state_is_empty() {
        let result =
            apply_document_workflow_latex_preview_state(DocumentWorkflowLatexPreviewApplyParams {
                state: DocumentWorkflowPersistentState {
                    latex_artifact_paths: HashMap::from([(
                        "/tmp/main.tex".to_string(),
                        "/tmp/main.pdf".to_string(),
                    )]),
                    latex_preview_states: HashMap::from([(
                        "/tmp/main.tex".to_string(),
                        DocumentWorkflowLatexPreviewState {
                            artifact_path: "/tmp/main.pdf".to_string(),
                            ..DocumentWorkflowLatexPreviewState::default()
                        },
                    )]),
                    ..DocumentWorkflowPersistentState::default()
                },
                file_path: "/tmp/main.tex".to_string(),
                preview_state: DocumentWorkflowLatexPreviewState::default(),
            });

        assert!(result.changed);
        assert!(!result
            .state
            .latex_artifact_paths
            .contains_key("/tmp/main.tex"));
        assert!(!result
            .state
            .latex_preview_states
            .contains_key("/tmp/main.tex"));
    }

    #[test]
    fn applying_same_latex_preview_state_reports_unchanged() {
        let preview_state = DocumentWorkflowLatexPreviewState {
            artifact_path: "/tmp/main.pdf".to_string(),
            synctex_path: "/tmp/main.synctex.gz".to_string(),
            compile_target_path: "/tmp/root.tex".to_string(),
            last_compiled: 42,
            source_fingerprint: "fp:123".to_string(),
        };
        let result =
            apply_document_workflow_latex_preview_state(DocumentWorkflowLatexPreviewApplyParams {
                state: DocumentWorkflowPersistentState {
                    latex_artifact_paths: HashMap::from([(
                        "/tmp/main.tex".to_string(),
                        "/tmp/main.pdf".to_string(),
                    )]),
                    latex_preview_states: HashMap::from([(
                        "/tmp/main.tex".to_string(),
                        preview_state.clone(),
                    )]),
                    ..DocumentWorkflowPersistentState::default()
                },
                file_path: "/tmp/main.tex".to_string(),
                preview_state,
            });

        assert!(!result.changed);
    }

    #[test]
    fn applies_preview_binding_state_by_preview_path() {
        let result = apply_document_workflow_preview_binding_state(
            DocumentWorkflowPreviewBindingApplyParams {
                state: DocumentWorkflowPersistentState::default(),
                intent: "bind".to_string(),
                binding: DocumentWorkflowPreviewBinding {
                    preview_path: " preview:/tmp/main.md ".to_string(),
                    source_path: " /tmp/main.md ".to_string(),
                    preview_kind: "html".to_string(),
                    kind: "markdown".to_string(),
                    pane_id: " pane-preview ".to_string(),
                    detach_on_close: true,
                },
                preview_path: String::new(),
            },
        );

        assert!(result.changed);
        assert_eq!(result.state.preview_bindings.len(), 1);
        assert_eq!(
            result.state.preview_bindings[0].preview_path,
            "preview:/tmp/main.md"
        );
        assert_eq!(result.state.preview_bindings[0].source_path, "/tmp/main.md");
        assert_eq!(result.state.preview_bindings[0].pane_id, "pane-preview");
    }

    #[test]
    fn replacing_preview_binding_reports_changed_only_when_value_differs() {
        let existing = DocumentWorkflowPreviewBinding {
            preview_path: "preview:/tmp/main.md".to_string(),
            source_path: "/tmp/main.md".to_string(),
            preview_kind: "html".to_string(),
            kind: "markdown".to_string(),
            pane_id: "pane-a".to_string(),
            detach_on_close: true,
        };

        let unchanged = apply_document_workflow_preview_binding_state(
            DocumentWorkflowPreviewBindingApplyParams {
                state: DocumentWorkflowPersistentState {
                    preview_bindings: vec![existing.clone()],
                    ..DocumentWorkflowPersistentState::default()
                },
                intent: "bind".to_string(),
                binding: existing.clone(),
                preview_path: String::new(),
            },
        );
        assert!(!unchanged.changed);

        let changed = apply_document_workflow_preview_binding_state(
            DocumentWorkflowPreviewBindingApplyParams {
                state: unchanged.state,
                intent: "bind".to_string(),
                binding: DocumentWorkflowPreviewBinding {
                    pane_id: "pane-b".to_string(),
                    ..existing
                },
                preview_path: String::new(),
            },
        );
        assert!(changed.changed);
        assert_eq!(changed.state.preview_bindings.len(), 1);
        assert_eq!(changed.state.preview_bindings[0].pane_id, "pane-b");
    }

    #[test]
    fn unbinds_preview_binding_from_persistent_state() {
        let result = apply_document_workflow_preview_binding_state(
            DocumentWorkflowPreviewBindingApplyParams {
                state: DocumentWorkflowPersistentState {
                    preview_bindings: vec![
                        DocumentWorkflowPreviewBinding {
                            preview_path: "preview:/tmp/main.md".to_string(),
                            source_path: "/tmp/main.md".to_string(),
                            preview_kind: "html".to_string(),
                            kind: "markdown".to_string(),
                            pane_id: "pane-a".to_string(),
                            detach_on_close: true,
                        },
                        DocumentWorkflowPreviewBinding {
                            preview_path: "preview:/tmp/other.md".to_string(),
                            source_path: "/tmp/other.md".to_string(),
                            preview_kind: "html".to_string(),
                            kind: "markdown".to_string(),
                            pane_id: "pane-b".to_string(),
                            detach_on_close: true,
                        },
                    ],
                    ..DocumentWorkflowPersistentState::default()
                },
                intent: "unbind".to_string(),
                binding: DocumentWorkflowPreviewBinding::default(),
                preview_path: " preview:/tmp/main.md ".to_string(),
            },
        );

        assert!(result.changed);
        assert_eq!(result.state.preview_bindings.len(), 1);
        assert_eq!(
            result.state.preview_bindings[0].preview_path,
            "preview:/tmp/other.md"
        );
    }

    #[test]
    fn applies_detached_source_session_mutations() {
        let marked =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: DocumentWorkflowPersistentState {
                    session: DocumentWorkflowSession {
                        preview_source_path: "/tmp/main.md".to_string(),
                        state: "workspace-preview".to_string(),
                        ..DocumentWorkflowSession::default()
                    },
                    ..DocumentWorkflowPersistentState::default()
                },
                intent: "mark-detached".to_string(),
                source_path: " /tmp/main.md ".to_string(),
                file_path: String::new(),
                visibility: String::new(),
                preview_kind: String::new(),
                session_patch: Value::Null,
            });

        assert!(marked.changed);
        assert_eq!(
            marked.state.session.detached_sources.get("/tmp/main.md"),
            Some(&true)
        );
        assert_eq!(marked.state.session.state, "detached-by-user");

        let cleared =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: marked.state,
                intent: "clear-detached".to_string(),
                source_path: "/tmp/main.md".to_string(),
                file_path: String::new(),
                visibility: String::new(),
                preview_kind: String::new(),
                session_patch: Value::Null,
            });

        assert!(cleared.changed);
        assert!(!cleared
            .state
            .session
            .detached_sources
            .contains_key("/tmp/main.md"));
    }

    #[test]
    fn applies_workspace_preview_visibility_mutation() {
        let hidden =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: DocumentWorkflowPersistentState::default(),
                intent: "set-workspace-preview-visibility".to_string(),
                file_path: " /tmp/main.md ".to_string(),
                visibility: "hidden".to_string(),
                source_path: String::new(),
                preview_kind: String::new(),
                session_patch: Value::Null,
            });

        assert!(hidden.changed);
        assert_eq!(
            hidden
                .state
                .workspace_preview_visibility
                .get("/tmp/main.md")
                .map(String::as_str),
            Some("hidden")
        );

        let visible =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: hidden.state,
                intent: "set-workspace-preview-visibility".to_string(),
                file_path: "/tmp/main.md".to_string(),
                visibility: "unexpected".to_string(),
                source_path: String::new(),
                preview_kind: String::new(),
                session_patch: Value::Null,
            });

        assert!(visible.changed);
        assert_eq!(
            visible
                .state
                .workspace_preview_visibility
                .get("/tmp/main.md")
                .map(String::as_str),
            Some("visible")
        );
    }

    #[test]
    fn applies_workspace_preview_request_mutation() {
        let requested =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: DocumentWorkflowPersistentState::default(),
                intent: "set-workspace-preview-request".to_string(),
                file_path: " /tmp/main.md ".to_string(),
                preview_kind: " html ".to_string(),
                source_path: String::new(),
                visibility: String::new(),
                session_patch: Value::Null,
            });

        assert!(requested.changed);
        assert_eq!(
            requested
                .state
                .workspace_preview_requests
                .get("/tmp/main.md")
                .map(String::as_str),
            Some("html")
        );

        let cleared =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: requested.state,
                intent: "set-workspace-preview-request".to_string(),
                file_path: "/tmp/main.md".to_string(),
                preview_kind: String::new(),
                source_path: String::new(),
                visibility: String::new(),
                session_patch: Value::Null,
            });

        assert!(cleared.changed);
        assert!(!cleared
            .state
            .workspace_preview_requests
            .contains_key("/tmp/main.md"));
    }

    #[test]
    fn resolves_preview_close_effect_from_binding() {
        let effect = resolve_document_workflow_preview_close_effect(
            DocumentWorkflowPreviewCloseEffectResolveParams {
                preview_path: "preview:/tmp/ignored.md".to_string(),
                preview_binding: Some(DocumentWorkflowPreviewBinding {
                    preview_path: "preview:/tmp/main.md".to_string(),
                    source_path: "/tmp/main.md".to_string(),
                    detach_on_close: true,
                    ..DocumentWorkflowPreviewBinding::default()
                }),
            },
        );

        assert_eq!(effect.source_path.as_deref(), Some("/tmp/main.md"));
        assert!(effect.mark_detached);
    }

    #[test]
    fn resolves_preview_close_effect_from_preview_path() {
        let effect = resolve_document_workflow_preview_close_effect(
            DocumentWorkflowPreviewCloseEffectResolveParams {
                preview_path: "preview:/tmp/main.md".to_string(),
                preview_binding: None,
            },
        );

        assert_eq!(effect.source_path.as_deref(), Some("/tmp/main.md"));
        assert!(!effect.mark_detached);
    }

    #[test]
    fn applies_session_state_patch_with_rust_normalization() {
        let result =
            apply_document_workflow_session_mutation(DocumentWorkflowSessionMutationApplyParams {
                state: DocumentWorkflowPersistentState {
                    session: DocumentWorkflowSession {
                        active_file: "/tmp/old.md".to_string(),
                        active_kind: "markdown".to_string(),
                        source_pane_id: "source-a".to_string(),
                        detached_sources: HashMap::from([
                            ("/tmp/old.md".to_string(), true),
                            ("/tmp/false.md".to_string(), false),
                        ]),
                        ..DocumentWorkflowSession::default()
                    },
                    ..DocumentWorkflowPersistentState::default()
                },
                intent: "set-session-state".to_string(),
                session_patch: json!({
                    "activeFile": " /tmp/main.tex ",
                    "activeKind": "latex",
                    "previewKind": "pdf",
                    "state": "workspace-preview",
                    "detachedSources": {
                        " /tmp/main.tex ": true,
                        "/tmp/ignored.tex": false
                    }
                }),
                source_path: String::new(),
                file_path: String::new(),
                visibility: String::new(),
                preview_kind: String::new(),
            });

        assert!(result.changed);
        assert_eq!(result.state.session.active_file, "/tmp/main.tex");
        assert_eq!(result.state.session.active_kind, "latex");
        assert_eq!(result.state.session.source_pane_id, "source-a");
        assert_eq!(result.state.session.preview_kind, "pdf");
        assert_eq!(result.state.session.state, "workspace-preview");
        assert_eq!(
            result.state.session.detached_sources.get("/tmp/main.tex"),
            Some(&true)
        );
        assert!(!result
            .state
            .session
            .detached_sources
            .contains_key("/tmp/ignored.tex"));
    }

    #[test]
    fn applies_workspace_preview_show_and_hide_to_persistent_state() {
        let result = apply_document_workflow_workspace_preview_state(
            DocumentWorkflowWorkspacePreviewApplyParams {
                state: DocumentWorkflowPersistentState {
                    preview_prefs: HashMap::new(),
                    session: DocumentWorkflowSession {
                        source_pane_id: "pane-source".to_string(),
                        detached_sources: HashMap::from([("/tmp/main.md".to_string(), true)]),
                        ..DocumentWorkflowSession::default()
                    },
                    preview_bindings: Vec::new(),
                    workspace_preview_visibility: HashMap::new(),
                    workspace_preview_requests: HashMap::new(),
                    latex_artifact_paths: HashMap::new(),
                    latex_preview_states: HashMap::new(),
                },
                intent: "show".to_string(),
                file_path: "/tmp/main.md".to_string(),
                kind: "markdown".to_string(),
                preview_kind: "html".to_string(),
                preferred_preview_kind: "html".to_string(),
                persist_preference: true,
                source_pane_id: String::new(),
            },
        );

        assert_eq!(
            result.result.get("type").and_then(Value::as_str),
            Some("workspace-preview")
        );
        assert_eq!(result.state.session.active_file, "/tmp/main.md");
        assert_eq!(result.state.session.source_pane_id, "pane-source");
        assert_eq!(
            result.state.session.detached_sources.get("/tmp/main.md"),
            None
        );
        assert_eq!(
            result
                .state
                .workspace_preview_visibility
                .get("/tmp/main.md")
                .map(String::as_str),
            Some("visible")
        );
        assert_eq!(
            result.state.workspace_preview_requests.get("/tmp/main.md"),
            None
        );

        let hidden = apply_document_workflow_workspace_preview_state(
            DocumentWorkflowWorkspacePreviewApplyParams {
                state: result.state,
                intent: "hide".to_string(),
                file_path: "/tmp/main.md".to_string(),
                kind: "markdown".to_string(),
                preview_kind: String::new(),
                preferred_preview_kind: String::new(),
                persist_preference: true,
                source_pane_id: String::new(),
            },
        );

        assert_eq!(
            hidden.result.get("type").and_then(Value::as_str),
            Some("workspace-preview-hidden")
        );
        assert_eq!(
            hidden
                .state
                .workspace_preview_visibility
                .get("/tmp/main.md")
                .map(String::as_str),
            Some("hidden")
        );
        assert_eq!(
            hidden.state.workspace_preview_requests.get("/tmp/main.md"),
            None
        );
    }

    #[test]
    fn workspace_preview_apply_params_normalize_raw_payloads() {
        let params = document_workflow_workspace_preview_apply_params_from_payload(json!({
            "state": {
                "session": {
                    "sourcePaneId": "pane-source"
                },
                "workspacePreviewVisibility": {
                    "/tmp/demo.md": "hidden"
                }
            },
            "intent": "show",
            "file_path": "/tmp/demo.md",
            "kind": "markdown",
            "previewKind": "html",
            "preferred_preview_kind": "html",
            "persistPreference": false,
            "source_pane_id": "pane-override"
        }));

        assert_eq!(params.intent, "show");
        assert_eq!(params.file_path, "/tmp/demo.md");
        assert_eq!(params.kind, "markdown");
        assert_eq!(params.preview_kind, "html");
        assert_eq!(params.preferred_preview_kind, "html");
        assert!(!params.persist_preference);
        assert_eq!(params.source_pane_id, "pane-override");
        assert_eq!(params.state.session.source_pane_id, "pane-source");
        assert_eq!(
            params
                .state
                .workspace_preview_visibility
                .get("/tmp/demo.md")
                .map(String::as_str),
            Some("hidden")
        );

        let invalid = document_workflow_workspace_preview_apply_params_from_payload(json!(false));
        assert!(invalid.intent.is_empty());
        assert!(invalid.file_path.is_empty());
        assert!(invalid.kind.is_empty());
        assert!(invalid.preview_kind.is_empty());
        assert!(invalid.persist_preference);
        assert_eq!(invalid.state, DocumentWorkflowPersistentState::default());
    }

    #[tokio::test]
    async fn workspace_preview_apply_command_accepts_raw_payloads() {
        let result = document_workflow_workspace_preview_apply(json!({
            "state": {
                "session": {
                    "sourcePaneId": "pane-source"
                }
            },
            "intent": "show",
            "file_path": "/tmp/raw.md",
            "kind": "markdown",
            "preview_kind": "html",
            "preferredPreviewKind": "html"
        }))
        .await
        .expect("apply raw workspace preview payload");

        assert_eq!(
            result.result.get("type").and_then(Value::as_str),
            Some("workspace-preview")
        );
        assert_eq!(result.state.session.active_file, "/tmp/raw.md");
        assert_eq!(result.state.session.source_pane_id, "pane-source");
        assert_eq!(
            result
                .state
                .workspace_preview_visibility
                .get("/tmp/raw.md")
                .map(String::as_str),
            Some("visible")
        );

        let invalid = document_workflow_workspace_preview_apply(json!(null))
            .await
            .expect("apply invalid workspace preview payload");
        assert_eq!(invalid.result, Value::Null);
        assert_eq!(invalid.state, DocumentWorkflowPersistentState::default());
    }
}
