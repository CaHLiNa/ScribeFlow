use crate::fs_tree::{build_workspace_tree_snapshot, FileEntry, WorkspaceTreeSnapshot};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use tokio::task;

async fn run_blocking<F, T>(operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    task::spawn_blocking(operation)
        .await
        .map_err(|error| format!("Background task failed: {error}"))?
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeLoadWorkspaceStateParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub current_tree: Vec<FileEntry>,
    #[serde(default)]
    pub extra_dirs: Vec<String>,
    #[serde(default = "default_include_hidden")]
    pub include_hidden: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeRevealWorkspaceStateParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub current_tree: Vec<FileEntry>,
    #[serde(default = "default_include_hidden")]
    pub include_hidden: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeRestoreCachedExpandedStateParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub current_tree: Vec<FileEntry>,
    #[serde(default)]
    pub cached_root_expanded_dirs: Vec<String>,
    #[serde(default = "default_cached_expanded_dir_limit")]
    pub max_dirs: usize,
    #[serde(default = "default_include_hidden")]
    pub include_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeWorkspaceStateResult {
    #[serde(default)]
    pub tree: Vec<FileEntry>,
    #[serde(default, rename = "flatFiles")]
    pub flat_files: Vec<FileEntry>,
    #[serde(default)]
    pub expanded_dirs: Vec<String>,
}

fn default_include_hidden() -> bool {
    true
}

fn default_cached_expanded_dir_limit() -> usize {
    6
}

fn collect_loaded_directory_paths(entries: &[FileEntry], paths: &mut Vec<String>) {
    for entry in entries {
        if !entry.is_dir {
            continue;
        }
        if let Some(children) = &entry.children {
            paths.push(entry.path.clone());
            collect_loaded_directory_paths(children, paths);
        }
    }
}

fn collect_loaded_dirs(
    entries: &[FileEntry],
    workspace_path: &str,
    extra_dirs: &[String],
) -> Vec<String> {
    let mut paths = Vec::new();
    collect_loaded_directory_paths(entries, &mut paths);
    for dir in extra_dirs {
        if dir.is_empty() || dir == workspace_path {
            continue;
        }
        if !paths.contains(dir) {
            paths.push(dir.clone());
        }
    }
    paths.sort_by(|left, right| left.len().cmp(&right.len()));
    paths
}

fn list_ancestor_dir_paths(workspace_path: &str, path: &str) -> Vec<String> {
    if workspace_path.is_empty() || !path.starts_with(workspace_path) {
        return Vec::new();
    }

    let relative_path = path[workspace_path.len()..].trim_start_matches('/');
    if relative_path.is_empty() {
        return Vec::new();
    }

    let parts = relative_path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let mut ancestors = Vec::new();
    let mut current_path = workspace_path.to_string();
    for part in parts.iter().take(parts.len().saturating_sub(1)) {
        current_path = format!("{current_path}/{part}");
        ancestors.push(current_path.clone());
    }
    ancestors
}

fn collect_root_dir_paths(entries: &[FileEntry]) -> HashSet<String> {
    entries
        .iter()
        .filter(|entry| entry.is_dir)
        .map(|entry| entry.path.clone())
        .collect()
}

fn filter_cached_root_expanded_dirs(
    current_tree: &[FileEntry],
    cached_root_expanded_dirs: &[String],
    max_dirs: usize,
) -> Vec<String> {
    let root_dirs = collect_root_dir_paths(current_tree);
    cached_root_expanded_dirs
        .iter()
        .filter(|path| root_dirs.contains(*path))
        .take(max_dirs)
        .cloned()
        .collect()
}

fn build_workspace_state_result(
    snapshot: WorkspaceTreeSnapshot,
    expanded_dirs: Vec<String>,
) -> FsTreeWorkspaceStateResult {
    FsTreeWorkspaceStateResult {
        tree: snapshot.tree,
        flat_files: snapshot.flat_files,
        expanded_dirs,
    }
}

fn read_workspace_snapshot_state(
    workspace_path: &str,
    current_tree: &[FileEntry],
    extra_dirs: &[String],
    include_hidden: bool,
) -> Result<FsTreeWorkspaceStateResult, String> {
    let loaded_dirs = collect_loaded_dirs(current_tree, workspace_path, extra_dirs);
    let loaded_set: HashSet<String> = loaded_dirs.iter().cloned().collect();
    let snapshot =
        build_workspace_tree_snapshot(Path::new(workspace_path), &loaded_set, include_hidden)?;
    Ok(build_workspace_state_result(snapshot, Vec::new()))
}

#[tauri::command]
pub async fn fs_tree_load_workspace_state(
    params: FsTreeLoadWorkspaceStateParams,
) -> Result<FsTreeWorkspaceStateResult, String> {
    run_blocking(move || {
        read_workspace_snapshot_state(
            &params.workspace_path,
            &params.current_tree,
            &params.extra_dirs,
            params.include_hidden,
        )
    })
    .await
}

#[tauri::command]
pub async fn fs_tree_reveal_workspace_state(
    params: FsTreeRevealWorkspaceStateParams,
) -> Result<FsTreeWorkspaceStateResult, String> {
    run_blocking(move || {
        let ancestor_dirs = list_ancestor_dir_paths(&params.workspace_path, &params.target_path);
        let mut result = read_workspace_snapshot_state(
            &params.workspace_path,
            &params.current_tree,
            &ancestor_dirs,
            params.include_hidden,
        )?;
        result.expanded_dirs = ancestor_dirs;
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn fs_tree_restore_cached_expanded_state(
    params: FsTreeRestoreCachedExpandedStateParams,
) -> Result<FsTreeWorkspaceStateResult, String> {
    run_blocking(move || {
        let expanded_dirs = filter_cached_root_expanded_dirs(
            &params.current_tree,
            &params.cached_root_expanded_dirs,
            params.max_dirs,
        );
        let mut result = read_workspace_snapshot_state(
            &params.workspace_path,
            &params.current_tree,
            &expanded_dirs,
            params.include_hidden,
        )?;
        let current_root_dirs = collect_root_dir_paths(&result.tree);
        result.expanded_dirs = expanded_dirs
            .into_iter()
            .filter(|path| current_root_dirs.contains(path))
            .collect();
        Ok(result)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{collect_loaded_dirs, filter_cached_root_expanded_dirs, list_ancestor_dir_paths};
    use crate::fs_tree::FileEntry;

    fn entry(path: &str, is_dir: bool, children: Option<Vec<FileEntry>>) -> FileEntry {
        FileEntry {
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            path: path.to_string(),
            is_dir,
            children,
            modified: None,
        }
    }

    #[test]
    fn collects_loaded_dirs_and_extra_dirs() {
        let entries = vec![
            entry(
                "/tmp/ws/a",
                true,
                Some(vec![entry("/tmp/ws/a/one.md", false, None)]),
            ),
            entry("/tmp/ws/b", true, None),
        ];

        assert_eq!(
            collect_loaded_dirs(
                &entries,
                "/tmp/ws",
                &["/tmp/ws/b".to_string(), "/tmp/ws".to_string()],
            ),
            vec!["/tmp/ws/a".to_string(), "/tmp/ws/b".to_string()]
        );
    }

    #[test]
    fn lists_ancestor_dirs_for_target_path() {
        assert_eq!(
            list_ancestor_dir_paths("/tmp/ws", "/tmp/ws/dir/nested/file.md"),
            vec!["/tmp/ws/dir".to_string(), "/tmp/ws/dir/nested".to_string()]
        );
    }

    #[test]
    fn filters_cached_root_expanded_dirs_to_existing_root_dirs() {
        let current_tree = vec![
            entry("/tmp/ws/a", true, None),
            entry("/tmp/ws/b", true, None),
            entry("/tmp/ws/c.md", false, None),
        ];

        assert_eq!(
            filter_cached_root_expanded_dirs(
                &current_tree,
                &[
                    "/tmp/ws/b".to_string(),
                    "/tmp/ws/missing".to_string(),
                    "/tmp/ws/a".to_string(),
                ],
                2,
            ),
            vec!["/tmp/ws/b".to_string(), "/tmp/ws/a".to_string()]
        );
    }
}
