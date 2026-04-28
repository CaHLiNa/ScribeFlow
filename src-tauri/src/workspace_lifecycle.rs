use crate::app_dirs;
use crate::document_workflow_session::{
    document_workflow_session_load, DocumentWorkflowPersistentState,
    DocumentWorkflowPersistentStateLoadParams,
};
use crate::editor_session_runtime::{
    editor_recent_files_load, editor_session_load, EditorRecentFilesLoadParams,
    EditorSessionLoadParams, RecentFileEntry,
};
use crate::references_backend::{
    references_library_load_workspace, ReferenceLibraryLoadWorkspaceParams,
};
use crate::fs_tree::FileEntry;
use crate::fs_tree_runtime::{
    fs_tree_load_workspace_state, fs_tree_restore_cached_expanded_state,
    FsTreeLoadWorkspaceStateParams, FsTreeRestoreCachedExpandedStateParams,
    FsTreeWorkspaceStateResult,
};
use crate::references_runtime::{references_scan_workspace_styles, CitationStyleScanParams};
use crate::references_zotero::{references_zotero_config_load, ZoteroConfigPathParams};
use crate::security::{clear_allowed_roots_internal, set_allowed_roots_internal, WorkspaceScopeState};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use tauri::State;

const WORKSPACE_LIFECYCLE_VERSION: u32 = 1;
const MAX_RECENT_WORKSPACES: usize = 10;
const WORKSPACE_BOOTSTRAP_BACKGROUND_WINDOW_MS: u64 = 600;
const WORKSPACE_BOOTSTRAP_ZOTERO_AUTOSYNC_DELAY_MS: u64 = 80;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspaceEntry {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleState {
    #[serde(default)]
    pub recent_workspaces: Vec<RecentWorkspaceEntry>,
    #[serde(default)]
    pub last_workspace: String,
    #[serde(default)]
    pub setup_complete: bool,
    #[serde(default = "default_reopen_last_workspace_on_launch")]
    pub reopen_last_workspace_on_launch: bool,
    #[serde(default = "default_reopen_last_session_on_launch")]
    pub reopen_last_session_on_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapState {
    #[serde(default)]
    pub recent_workspaces: Vec<RecentWorkspaceEntry>,
    #[serde(default)]
    pub last_workspace: String,
    #[serde(default)]
    pub setup_complete: bool,
    #[serde(default = "default_reopen_last_workspace_on_launch")]
    pub reopen_last_workspace_on_launch: bool,
    #[serde(default = "default_reopen_last_session_on_launch")]
    pub reopen_last_session_on_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapTask {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default)]
    pub await_completion: bool,
    #[serde(default)]
    pub await_tree_load: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapPlan {
    #[serde(default)]
    pub block_on_initial_tree_load: bool,
    #[serde(default)]
    pub background_window_ms: u64,
    #[serde(default)]
    pub tasks: Vec<WorkspaceBootstrapTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceLifecycleFile {
    #[serde(default = "default_workspace_lifecycle_version")]
    version: u32,
    #[serde(flatten)]
    state: WorkspaceLifecycleState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub legacy_state: WorkspaceLifecycleState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub state: WorkspaceLifecycleState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleRecordOpenedParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecyclePrepareOpenParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleResolveBootstrapPlanParams {
    #[serde(default)]
    pub has_cached_tree: bool,
    #[serde(default = "default_restore_editor_session")]
    pub restore_editor_session: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLifecycleLoadBootstrapDataParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub legacy_workspace_data_dir: String,
    #[serde(default)]
    pub legacy_project_root: String,
    #[serde(default = "default_restore_editor_session")]
    pub restore_editor_session: bool,
    #[serde(default)]
    pub current_tree: Vec<FileEntry>,
    #[serde(default)]
    pub cached_root_expanded_dirs: Vec<String>,
    #[serde(default = "default_include_hidden")]
    pub include_hidden: bool,
    #[serde(default)]
    pub has_cached_tree: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOpenState {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_id: String,
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub claude_config_dir: String,
    #[serde(flatten)]
    pub lifecycle: WorkspaceBootstrapState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBootstrapHydratedData {
    #[serde(default)]
    pub references_snapshot: Value,
    #[serde(default)]
    pub reference_styles: Value,
    #[serde(default)]
    pub zotero_config: Value,
    #[serde(default)]
    pub document_workflow_state: DocumentWorkflowPersistentState,
    #[serde(default)]
    pub recent_files: Vec<RecentFileEntry>,
    #[serde(default)]
    pub editor_session_state: Value,
    #[serde(default)]
    pub file_tree_state: Option<FsTreeWorkspaceStateResult>,
}

impl Default for WorkspaceLifecycleState {
    fn default() -> Self {
        Self {
            recent_workspaces: Vec::new(),
            last_workspace: String::new(),
            setup_complete: false,
            reopen_last_workspace_on_launch: default_reopen_last_workspace_on_launch(),
            reopen_last_session_on_launch: default_reopen_last_session_on_launch(),
        }
    }
}

impl From<WorkspaceLifecycleState> for WorkspaceBootstrapState {
    fn from(state: WorkspaceLifecycleState) -> Self {
        Self {
            recent_workspaces: state.recent_workspaces,
            last_workspace: state.last_workspace,
            setup_complete: state.setup_complete,
            reopen_last_workspace_on_launch: state.reopen_last_workspace_on_launch,
            reopen_last_session_on_launch: state.reopen_last_session_on_launch,
        }
    }
}

impl From<WorkspaceBootstrapState> for WorkspaceLifecycleState {
    fn from(state: WorkspaceBootstrapState) -> Self {
        Self {
            recent_workspaces: state.recent_workspaces,
            last_workspace: state.last_workspace,
            setup_complete: state.setup_complete,
            reopen_last_workspace_on_launch: state.reopen_last_workspace_on_launch,
            reopen_last_session_on_launch: state.reopen_last_session_on_launch,
        }
    }
}

fn default_workspace_lifecycle_version() -> u32 {
    WORKSPACE_LIFECYCLE_VERSION
}

fn default_reopen_last_workspace_on_launch() -> bool {
    true
}

fn default_reopen_last_session_on_launch() -> bool {
    true
}

fn default_restore_editor_session() -> bool {
    true
}

fn default_include_hidden() -> bool {
    true
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn hash_workspace_path(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn resolve_workspace_data_dir(global_config_dir: &str, workspace_id: &str) -> String {
    let normalized = normalize_root(global_config_dir);
    if normalized.is_empty() || workspace_id.trim().is_empty() {
        return String::new();
    }
    format!("{normalized}/workspaces/{}", workspace_id.trim())
}

fn resolve_claude_config_dir(global_config_dir: &str) -> String {
    let normalized = normalize_root(global_config_dir);
    if normalized.is_empty() {
        return String::new();
    }
    let path = PathBuf::from(&normalized);
    let Some(parent) = path.parent() else {
        return String::new();
    };
    parent.join(".claude").to_string_lossy().to_string()
}

fn resolve_global_config_dir(global_config_dir: &str) -> Result<PathBuf, String> {
    let normalized = normalize_root(global_config_dir);
    if !normalized.is_empty() {
        return Ok(PathBuf::from(normalized));
    }
    app_dirs::data_root_dir()
}

fn workspace_lifecycle_path(global_config_dir: &str) -> Result<PathBuf, String> {
    Ok(resolve_global_config_dir(global_config_dir)?.join("workspace-lifecycle.json"))
}

fn fallback_workspace_name(path: &str) -> String {
    let normalized = path.trim().trim_end_matches('/');
    if normalized.is_empty() {
        return String::new();
    }
    normalized
        .rsplit('/')
        .next()
        .map(str::to_string)
        .unwrap_or_else(|| normalized.to_string())
}

fn normalize_recent_workspace_entry(entry: RecentWorkspaceEntry) -> Option<RecentWorkspaceEntry> {
    let path = entry.path.trim().trim_end_matches('/').to_string();
    if path.is_empty() {
        return None;
    }

    let name = if entry.name.trim().is_empty() {
        fallback_workspace_name(&path)
    } else {
        entry.name.trim().to_string()
    };

    Some(RecentWorkspaceEntry {
        path,
        name,
        last_opened: entry.last_opened.trim().to_string(),
    })
}

pub fn normalize_workspace_lifecycle_state(
    state: WorkspaceLifecycleState,
) -> WorkspaceLifecycleState {
    let mut seen_paths = HashSet::new();
    let mut recent_workspaces = Vec::new();

    for entry in state.recent_workspaces {
        let Some(normalized) = normalize_recent_workspace_entry(entry) else {
            continue;
        };

        if seen_paths.insert(normalized.path.clone()) {
            recent_workspaces.push(normalized);
        }

        if recent_workspaces.len() >= MAX_RECENT_WORKSPACES {
            break;
        }
    }

    let last_workspace = state
        .last_workspace
        .trim()
        .trim_end_matches('/')
        .to_string();

    WorkspaceLifecycleState {
        recent_workspaces,
        last_workspace,
        setup_complete: state.setup_complete,
        reopen_last_workspace_on_launch: state.reopen_last_workspace_on_launch,
        reopen_last_session_on_launch: state.reopen_last_session_on_launch,
    }
}

fn read_workspace_lifecycle_state(
    global_config_dir: &str,
) -> Result<Option<WorkspaceLifecycleState>, String> {
    let path = workspace_lifecycle_path(global_config_dir)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<WorkspaceLifecycleFile>(&content) {
        return Ok(Some(parsed.state));
    }

    let parsed = serde_json::from_str::<WorkspaceLifecycleState>(&content)
        .map_err(|error| format!("Failed to parse workspace lifecycle state: {error}"))?;
    Ok(Some(parsed))
}

fn write_workspace_lifecycle_state(
    global_config_dir: &str,
    state: &WorkspaceLifecycleState,
) -> Result<(), String> {
    let path = workspace_lifecycle_path(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = WorkspaceLifecycleFile {
        version: WORKSPACE_LIFECYCLE_VERSION,
        state: state.clone(),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace lifecycle state: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn load_or_migrate_workspace_lifecycle_state(
    global_config_dir: &str,
    legacy_state: WorkspaceLifecycleState,
) -> Result<WorkspaceLifecycleState, String> {
    if let Some(current) = read_workspace_lifecycle_state(global_config_dir)? {
        return Ok(normalize_workspace_lifecycle_state(current));
    }

    let normalized = normalize_workspace_lifecycle_state(legacy_state);
    write_workspace_lifecycle_state(global_config_dir, &normalized)?;
    Ok(normalized)
}

fn record_workspace_opened(state: WorkspaceLifecycleState, path: &str) -> WorkspaceLifecycleState {
    let normalized_path = normalize_root(path);
    if normalized_path.is_empty() {
        return normalize_workspace_lifecycle_state(state);
    }

    let mut recent_workspaces =
        normalize_workspace_lifecycle_state(state.clone()).recent_workspaces;
    recent_workspaces.retain(|entry| entry.path != normalized_path);
    recent_workspaces.insert(
        0,
        RecentWorkspaceEntry {
            path: normalized_path.clone(),
            name: fallback_workspace_name(&normalized_path),
            last_opened: Utc::now().to_rfc3339(),
        },
    );

    normalize_workspace_lifecycle_state(WorkspaceLifecycleState {
        recent_workspaces,
        last_workspace: normalized_path,
        setup_complete: state.setup_complete,
        reopen_last_workspace_on_launch: state.reopen_last_workspace_on_launch,
        reopen_last_session_on_launch: state.reopen_last_session_on_launch,
    })
}

fn ensure_workspace_dir(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Ok(());
    }
    fs::create_dir_all(path).map_err(|error| error.to_string())
}

fn workspace_bootstrap_task(
    key: &str,
    delay_ms: u64,
    await_completion: bool,
    await_tree_load: bool,
) -> WorkspaceBootstrapTask {
    WorkspaceBootstrapTask {
        key: key.to_string(),
        delay_ms,
        await_completion,
        await_tree_load,
    }
}

fn build_workspace_bootstrap_plan(has_cached_tree: bool) -> WorkspaceBootstrapPlan {
    let mut tasks = vec![
        workspace_bootstrap_task("workspace.loadBootstrapData", 0, true, false),
        workspace_bootstrap_task(
            "references.zoteroAutoSync",
            WORKSPACE_BOOTSTRAP_ZOTERO_AUTOSYNC_DELAY_MS,
            false,
            false,
        ),
    ];
    tasks.push(workspace_bootstrap_task(
        "files.startWatching",
        0,
        false,
        false,
    ));

    WorkspaceBootstrapPlan {
        block_on_initial_tree_load: !has_cached_tree,
        background_window_ms: WORKSPACE_BOOTSTRAP_BACKGROUND_WINDOW_MS,
        tasks,
    }
}

fn write_workspace_bootstrap_file(
    workspace_data_dir: &str,
    workspace_id: &str,
    path: &str,
) -> Result<(), String> {
    if workspace_data_dir.trim().is_empty() {
        return Ok(());
    }

    let payload = serde_json::json!({
        "id": workspace_id,
        "path": path,
        "name": fallback_workspace_name(path),
        "lastOpenedAt": Utc::now().to_rfc3339(),
    });

    let target = PathBuf::from(workspace_data_dir).join("workspace.json");
    fs::write(
        target,
        serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn workspace_lifecycle_load(
    params: WorkspaceLifecycleLoadParams,
) -> Result<WorkspaceBootstrapState, String> {
    load_or_migrate_workspace_lifecycle_state(&params.global_config_dir, params.legacy_state)
        .map(WorkspaceBootstrapState::from)
}

#[tauri::command]
pub async fn workspace_lifecycle_save(
    params: WorkspaceLifecycleSaveParams,
) -> Result<WorkspaceBootstrapState, String> {
    let normalized = normalize_workspace_lifecycle_state(params.state);
    write_workspace_lifecycle_state(&params.global_config_dir, &normalized)?;
    Ok(WorkspaceBootstrapState::from(normalized))
}

#[tauri::command]
pub async fn workspace_lifecycle_record_opened(
    params: WorkspaceLifecycleRecordOpenedParams,
) -> Result<WorkspaceBootstrapState, String> {
    let state = load_or_migrate_workspace_lifecycle_state(
        &params.global_config_dir,
        WorkspaceLifecycleState::default(),
    )?;
    let normalized = record_workspace_opened(state, &params.path);
    write_workspace_lifecycle_state(&params.global_config_dir, &normalized)?;
    Ok(WorkspaceBootstrapState::from(normalized))
}

#[tauri::command]
pub async fn workspace_lifecycle_prepare_open(
    params: WorkspaceLifecyclePrepareOpenParams,
    scope_state: State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceOpenState, String> {
    let global_config_dir = resolve_global_config_dir(&params.global_config_dir)?
        .to_string_lossy()
        .to_string();
    let path = normalize_root(&params.path);
    if path.is_empty() {
        return Err("Workspace path is required".to_string());
    }

    let workspace_id = hash_workspace_path(&path);
    let workspace_data_dir = resolve_workspace_data_dir(&global_config_dir, &workspace_id);
    let claude_config_dir = resolve_claude_config_dir(&global_config_dir);

    ensure_workspace_dir(&workspace_data_dir)?;
    ensure_workspace_dir(&format!("{workspace_data_dir}/project"))?;
    ensure_workspace_dir(&claude_config_dir)?;
    write_workspace_bootstrap_file(&workspace_data_dir, &workspace_id, &path)?;

    set_allowed_roots_internal(
        scope_state.inner(),
        &path,
        Some(&workspace_data_dir),
        Some(&global_config_dir),
        Some(&claude_config_dir),
    )?;

    let state = load_or_migrate_workspace_lifecycle_state(
        &global_config_dir,
        WorkspaceLifecycleState::default(),
    )?;
    let normalized = record_workspace_opened(state, &path);
    write_workspace_lifecycle_state(&global_config_dir, &normalized)?;

    Ok(WorkspaceOpenState {
        path,
        global_config_dir,
        workspace_id,
        workspace_data_dir,
        claude_config_dir,
        lifecycle: WorkspaceBootstrapState::from(normalized),
    })
}

#[tauri::command]
pub async fn workspace_lifecycle_resolve_bootstrap_plan(
    params: WorkspaceLifecycleResolveBootstrapPlanParams,
) -> Result<WorkspaceBootstrapPlan, String> {
    let _ = params.restore_editor_session;
    Ok(build_workspace_bootstrap_plan(params.has_cached_tree))
}

#[tauri::command]
pub async fn workspace_lifecycle_load_bootstrap_data(
    params: WorkspaceLifecycleLoadBootstrapDataParams,
) -> Result<WorkspaceBootstrapHydratedData, String> {
    let references_snapshot = references_library_load_workspace(ReferenceLibraryLoadWorkspaceParams {
        global_config_dir: params.global_config_dir.clone(),
        legacy_workspace_data_dir: params.legacy_workspace_data_dir,
        legacy_project_root: params.legacy_project_root,
    })
    .await?;

    let reference_styles = references_scan_workspace_styles(CitationStyleScanParams {
        workspace_path: params.workspace_path.clone(),
    })
    .await?;

    let zotero_config = references_zotero_config_load(ZoteroConfigPathParams {
        global_config_dir: params.global_config_dir.clone(),
    })
    .await?;

    let document_workflow_state = document_workflow_session_load(
        DocumentWorkflowPersistentStateLoadParams {
            workspace_data_dir: params.workspace_data_dir.clone(),
            legacy_state: DocumentWorkflowPersistentState::default(),
        },
    )
    .await?;

    let recent_files = editor_recent_files_load(EditorRecentFilesLoadParams {
        workspace_data_dir: params.workspace_data_dir.clone(),
        legacy_recent_files: Vec::new(),
    })
    .await?;

    let editor_session_state = if params.restore_editor_session {
        editor_session_load(EditorSessionLoadParams {
            workspace_data_dir: params.workspace_data_dir,
        })
        .await?
    } else {
        Value::Null
    };

    let file_tree_state = if params.workspace_path.trim().is_empty() {
        None
    } else if params.has_cached_tree {
        Some(
            fs_tree_restore_cached_expanded_state(FsTreeRestoreCachedExpandedStateParams {
                workspace_path: params.workspace_path.clone(),
                current_tree: params.current_tree,
                cached_root_expanded_dirs: params.cached_root_expanded_dirs,
                max_dirs: 6,
                include_hidden: params.include_hidden,
            })
            .await?,
        )
    } else {
        Some(
            fs_tree_load_workspace_state(FsTreeLoadWorkspaceStateParams {
                workspace_path: params.workspace_path.clone(),
                current_tree: params.current_tree,
                extra_dirs: Vec::new(),
                include_hidden: params.include_hidden,
            })
            .await?,
        )
    };

    Ok(WorkspaceBootstrapHydratedData {
        references_snapshot,
        reference_styles,
        zotero_config,
        document_workflow_state,
        recent_files,
        editor_session_state,
        file_tree_state,
    })
}

#[tauri::command]
pub async fn workspace_lifecycle_prepare_close(
    scope_state: State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    clear_allowed_roots_internal(scope_state.inner())
}

#[cfg(test)]
mod tests {
    use super::{
        build_workspace_bootstrap_plan, hash_workspace_path, normalize_workspace_lifecycle_state,
        record_workspace_opened, resolve_claude_config_dir, resolve_workspace_data_dir,
        workspace_lifecycle_load, workspace_lifecycle_save, RecentWorkspaceEntry,
        WorkspaceLifecycleLoadParams, WorkspaceLifecycleSaveParams, WorkspaceLifecycleState,
    };
    use std::fs;

    #[test]
    fn normalizes_recents_and_trims_last_workspace() {
        let normalized = normalize_workspace_lifecycle_state(WorkspaceLifecycleState {
            recent_workspaces: vec![
                RecentWorkspaceEntry {
                    path: "/tmp/project/".to_string(),
                    name: String::new(),
                    last_opened: "2026-04-21T00:00:00Z".to_string(),
                },
                RecentWorkspaceEntry {
                    path: "/tmp/project".to_string(),
                    name: "Duplicate".to_string(),
                    last_opened: String::new(),
                },
            ],
            last_workspace: "/tmp/project/".to_string(),
            setup_complete: true,
            reopen_last_workspace_on_launch: false,
            reopen_last_session_on_launch: false,
        });

        assert_eq!(normalized.recent_workspaces.len(), 1);
        assert_eq!(normalized.recent_workspaces[0].path, "/tmp/project");
        assert_eq!(normalized.recent_workspaces[0].name, "project");
        assert_eq!(normalized.last_workspace, "/tmp/project");
        assert!(normalized.setup_complete);
        assert!(!normalized.reopen_last_workspace_on_launch);
        assert!(!normalized.reopen_last_session_on_launch);
    }

    #[test]
    fn derives_workspace_paths_from_global_config_dir() {
        let id = hash_workspace_path("/tmp/demo");
        assert_eq!(id.len(), 64);
        assert_eq!(
            resolve_workspace_data_dir("/Users/demo/.scribeflow", &id),
            format!("/Users/demo/.scribeflow/workspaces/{id}")
        );
        assert_eq!(
            resolve_claude_config_dir("/Users/demo/.scribeflow"),
            "/Users/demo/.claude"
        );
    }

    #[tokio::test]
    async fn loads_and_saves_workspace_lifecycle_state() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-lifecycle-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let saved = workspace_lifecycle_save(WorkspaceLifecycleSaveParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            state: WorkspaceLifecycleState {
                recent_workspaces: vec![RecentWorkspaceEntry {
                    path: "/tmp/demo".to_string(),
                    name: "demo".to_string(),
                    last_opened: "2026-04-21T00:00:00Z".to_string(),
                }],
                last_workspace: "/tmp/demo".to_string(),
                setup_complete: true,
                reopen_last_workspace_on_launch: false,
                reopen_last_session_on_launch: false,
            },
        })
        .await
        .expect("save lifecycle");

        let loaded = workspace_lifecycle_load(WorkspaceLifecycleLoadParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            legacy_state: WorkspaceLifecycleState::default(),
        })
        .await
        .expect("load lifecycle");

        assert_eq!(saved, loaded);
        assert!(!loaded.reopen_last_workspace_on_launch);
        assert!(!loaded.reopen_last_session_on_launch);
        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn records_opened_workspace_at_front() {
        let normalized = record_workspace_opened(
            WorkspaceLifecycleState {
                recent_workspaces: vec![
                    RecentWorkspaceEntry {
                        path: "/tmp/old".to_string(),
                        name: "old".to_string(),
                        last_opened: "2026-04-21T00:00:00Z".to_string(),
                    },
                    RecentWorkspaceEntry {
                        path: "/tmp/demo".to_string(),
                        name: "demo".to_string(),
                        last_opened: "2026-04-20T00:00:00Z".to_string(),
                    },
                ],
                ..WorkspaceLifecycleState::default()
            },
            "/tmp/demo/",
        );

        assert_eq!(normalized.recent_workspaces.len(), 2);
        assert_eq!(normalized.recent_workspaces[0].path, "/tmp/demo");
        assert_eq!(normalized.recent_workspaces[0].name, "demo");
        assert_eq!(normalized.recent_workspaces[1].path, "/tmp/old");
        assert_eq!(normalized.last_workspace, "/tmp/demo");
    }

    #[test]
    fn builds_cached_tree_bootstrap_plan() {
        let plan = build_workspace_bootstrap_plan(true);

        assert!(!plan.block_on_initial_tree_load);
        assert_eq!(plan.background_window_ms, 600);
        assert_eq!(
            plan.tasks.iter().find(|task| task.key == "workspace.loadBootstrapData"),
            Some(&super::WorkspaceBootstrapTask {
                key: "workspace.loadBootstrapData".to_string(),
                delay_ms: 0,
                await_completion: true,
                await_tree_load: false,
            })
        );
        assert!(plan.tasks.iter().all(|task| task.key != "editor.restoreEditorState"));
    }

    #[test]
    fn builds_uncached_tree_bootstrap_plan_without_editor_restore() {
        let plan = build_workspace_bootstrap_plan(false);

        assert!(plan.block_on_initial_tree_load);
        assert_eq!(
            plan.tasks.iter().find(|task| task.key == "workspace.loadBootstrapData"),
            Some(&super::WorkspaceBootstrapTask {
                key: "workspace.loadBootstrapData".to_string(),
                delay_ms: 0,
                await_completion: true,
                await_tree_load: false,
            })
        );
        assert!(
            plan.tasks
                .iter()
                .all(|task| task.key != "editor.restoreEditorState")
        );
        assert!(plan.tasks.iter().all(|task| task.key != "files.restoreCachedExpandedDirs"));
    }
}
