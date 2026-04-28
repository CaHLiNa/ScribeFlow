use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::document_workflow_preview_binding::normalize_preview_binding_set;
pub use crate::document_workflow_preview_binding::DocumentWorkflowPreviewBinding;

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
pub struct DocumentWorkflowPersistentStateSaveParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub state: DocumentWorkflowPersistentState,
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
        return Ok(normalize_document_workflow_persistent_state(current));
    }

    let normalized = normalize_document_workflow_persistent_state(params.legacy_state);
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

#[cfg(test)]
mod tests {
    use super::{
        document_workflow_session_load, document_workflow_session_save,
        normalize_document_workflow_persistent_state, DocumentWorkflowLatexPreviewState,
        DocumentWorkflowPersistentState, DocumentWorkflowPersistentStateLoadParams,
        DocumentWorkflowPersistentStateSaveParams, DocumentWorkflowPreviewBinding,
        DocumentWorkflowPreviewPreference, DocumentWorkflowSession,
    };
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
            legacy_state: DocumentWorkflowPersistentState::default(),
        })
        .await
        .expect("load document workflow session");

        assert_eq!(saved, loaded);
        fs::remove_dir_all(temp_dir).ok();
    }
}
