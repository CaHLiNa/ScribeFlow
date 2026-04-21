use crate::app_dirs;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const WORKSPACE_LIFECYCLE_VERSION: u32 = 1;
const MAX_RECENT_WORKSPACES: usize = 10;

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

impl Default for WorkspaceLifecycleState {
    fn default() -> Self {
        Self {
            recent_workspaces: Vec::new(),
            last_workspace: String::new(),
            setup_complete: false,
            reopen_last_workspace_on_launch: default_reopen_last_workspace_on_launch(),
        }
    }
}

fn default_workspace_lifecycle_version() -> u32 {
    WORKSPACE_LIFECYCLE_VERSION
}

fn default_reopen_last_workspace_on_launch() -> bool {
    true
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
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

#[tauri::command]
pub async fn workspace_lifecycle_load(
    params: WorkspaceLifecycleLoadParams,
) -> Result<WorkspaceLifecycleState, String> {
    if let Some(current) = read_workspace_lifecycle_state(&params.global_config_dir)? {
        return Ok(normalize_workspace_lifecycle_state(current));
    }

    let normalized = normalize_workspace_lifecycle_state(params.legacy_state);
    write_workspace_lifecycle_state(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn workspace_lifecycle_save(
    params: WorkspaceLifecycleSaveParams,
) -> Result<WorkspaceLifecycleState, String> {
    let normalized = normalize_workspace_lifecycle_state(params.state);
    write_workspace_lifecycle_state(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_workspace_lifecycle_state, workspace_lifecycle_load, workspace_lifecycle_save,
        RecentWorkspaceEntry, WorkspaceLifecycleLoadParams, WorkspaceLifecycleSaveParams,
        WorkspaceLifecycleState,
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
        });

        assert_eq!(normalized.recent_workspaces.len(), 1);
        assert_eq!(normalized.recent_workspaces[0].path, "/tmp/project");
        assert_eq!(normalized.recent_workspaces[0].name, "project");
        assert_eq!(normalized.last_workspace, "/tmp/project");
        assert!(normalized.setup_complete);
        assert!(!normalized.reopen_last_workspace_on_launch);
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
        fs::remove_dir_all(temp_dir).ok();
    }
}
