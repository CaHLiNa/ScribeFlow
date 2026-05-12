use crate::fs_tree::{build_workspace_tree_snapshot, FileEntry, WorkspaceTreeSnapshot};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
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
    #[serde(default)]
    pub display_preferences: FsTreeDisplayPreferences,
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
    #[serde(default)]
    pub display_preferences: FsTreeDisplayPreferences,
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
    #[serde(default)]
    pub display_preferences: FsTreeDisplayPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeWorkspaceStateResult {
    #[serde(default)]
    pub tree: Vec<FileEntry>,
    #[serde(default, rename = "displayTree")]
    pub display_tree: Vec<FileEntry>,
    #[serde(default, rename = "flatFiles")]
    pub flat_files: Vec<FileEntry>,
    #[serde(default)]
    pub expanded_dirs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeDisplayPreferences {
    #[serde(default = "default_display_show_hidden")]
    pub show_hidden: bool,
    #[serde(default = "default_display_sort_mode")]
    pub sort_mode: String,
    #[serde(default)]
    pub fold_directories: bool,
}

impl Default for FsTreeDisplayPreferences {
    fn default() -> Self {
        Self {
            show_hidden: default_display_show_hidden(),
            sort_mode: default_display_sort_mode(),
            fold_directories: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeResolveDisplayStateParams {
    #[serde(default)]
    pub tree: Vec<FileEntry>,
    #[serde(default)]
    pub display_preferences: FsTreeDisplayPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeDisplayStateResult {
    #[serde(default, rename = "displayTree")]
    pub display_tree: Vec<FileEntry>,
}

fn default_include_hidden() -> bool {
    true
}

fn default_cached_expanded_dir_limit() -> usize {
    6
}

fn default_display_show_hidden() -> bool {
    true
}

fn default_display_sort_mode() -> String {
    "name".to_string()
}

fn normalize_display_sort_mode(value: &str) -> String {
    if value.trim().eq_ignore_ascii_case("modified") {
        "modified".to_string()
    } else {
        default_display_sort_mode()
    }
}

fn normalize_display_preferences(
    preferences: FsTreeDisplayPreferences,
) -> FsTreeDisplayPreferences {
    FsTreeDisplayPreferences {
        show_hidden: preferences.show_hidden,
        sort_mode: normalize_display_sort_mode(&preferences.sort_mode),
        fold_directories: preferences.fold_directories,
    }
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
    display_preferences: &FsTreeDisplayPreferences,
) -> FsTreeWorkspaceStateResult {
    let display_tree = apply_file_tree_display_preferences(&snapshot.tree, display_preferences);
    FsTreeWorkspaceStateResult {
        tree: snapshot.tree,
        display_tree,
        flat_files: snapshot.flat_files,
        expanded_dirs,
    }
}

fn normalized_entry_name(entry: &FileEntry) -> String {
    entry
        .display_name
        .as_deref()
        .unwrap_or(&entry.name)
        .trim()
        .to_string()
}

fn is_hidden_display_entry(entry: &FileEntry) -> bool {
    normalized_entry_name(entry).starts_with('.')
}

fn compare_display_entries(
    left: &FileEntry,
    right: &FileEntry,
    preferences: &FsTreeDisplayPreferences,
) -> Ordering {
    if left.is_dir != right.is_dir {
        return if left.is_dir {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }

    if preferences.sort_mode == "modified" && !left.is_dir && !right.is_dir {
        let left_modified = left.modified.unwrap_or(0);
        let right_modified = right.modified.unwrap_or(0);
        if left_modified != right_modified {
            return right_modified.cmp(&left_modified);
        }
    }

    normalized_entry_name(left)
        .to_lowercase()
        .cmp(&normalized_entry_name(right).to_lowercase())
}

fn fold_single_child_directory(entry: FileEntry) -> FileEntry {
    if !entry.is_dir || entry.children.is_none() {
        return entry;
    }

    let mut segments = Vec::new();
    let mut current = entry;
    let name = current.name.trim();
    if !name.is_empty() {
        segments.push(name.to_string());
    }

    while let Some(children) = &current.children {
        if children.len() != 1 || !children[0].is_dir {
            break;
        }
        current = children[0].clone();
        let name = normalized_entry_name(&current);
        if !name.is_empty() {
            segments.push(name);
        }
    }

    if !segments.is_empty() {
        current.display_name = Some(segments.join("/"));
    }
    current
}

fn apply_file_tree_display_preferences(
    entries: &[FileEntry],
    preferences: &FsTreeDisplayPreferences,
) -> Vec<FileEntry> {
    let mut display_entries = entries
        .iter()
        .filter(|entry| preferences.show_hidden || !is_hidden_display_entry(entry))
        .map(|entry| {
            let mut next_entry = entry.clone();
            if let Some(children) = &entry.children {
                next_entry.children =
                    Some(apply_file_tree_display_preferences(children, preferences));
            }
            if preferences.fold_directories {
                fold_single_child_directory(next_entry)
            } else {
                next_entry
            }
        })
        .collect::<Vec<_>>();

    display_entries.sort_by(|left, right| compare_display_entries(left, right, preferences));
    display_entries
}

fn read_workspace_snapshot_state(
    workspace_path: &str,
    current_tree: &[FileEntry],
    extra_dirs: &[String],
    include_hidden: bool,
    display_preferences: &FsTreeDisplayPreferences,
) -> Result<FsTreeWorkspaceStateResult, String> {
    let loaded_dirs = collect_loaded_dirs(current_tree, workspace_path, extra_dirs);
    let loaded_set: HashSet<String> = loaded_dirs.iter().cloned().collect();
    let display_preferences = normalize_display_preferences(display_preferences.clone());
    let snapshot =
        build_workspace_tree_snapshot(Path::new(workspace_path), &loaded_set, include_hidden)?;
    Ok(build_workspace_state_result(
        snapshot,
        Vec::new(),
        &display_preferences,
    ))
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
            &params.display_preferences,
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
            &params.display_preferences,
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
            &params.display_preferences,
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

#[tauri::command]
pub async fn fs_tree_resolve_display_state(
    params: FsTreeResolveDisplayStateParams,
) -> Result<FsTreeDisplayStateResult, String> {
    let display_preferences = normalize_display_preferences(params.display_preferences);
    Ok(FsTreeDisplayStateResult {
        display_tree: apply_file_tree_display_preferences(&params.tree, &display_preferences),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        apply_file_tree_display_preferences, collect_loaded_dirs, filter_cached_root_expanded_dirs,
        list_ancestor_dir_paths, normalize_display_preferences, FsTreeDisplayPreferences,
    };
    use crate::fs_tree::FileEntry;

    fn entry(path: &str, is_dir: bool, children: Option<Vec<FileEntry>>) -> FileEntry {
        FileEntry {
            name: path.rsplit('/').next().unwrap_or(path).to_string(),
            path: path.to_string(),
            is_dir,
            children,
            modified: None,
            display_name: None,
        }
    }

    fn file_entry(path: &str, modified: u64) -> FileEntry {
        FileEntry {
            modified: Some(modified),
            ..entry(path, false, None)
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

    #[test]
    fn resolves_display_tree_with_hidden_filter_and_name_sort() {
        let entries = vec![
            file_entry("/tmp/ws/zeta.md", 1),
            file_entry("/tmp/ws/.hidden.md", 2),
            entry(
                "/tmp/ws/alpha",
                true,
                Some(vec![file_entry("/tmp/ws/alpha/note.md", 3)]),
            ),
        ];

        let display = apply_file_tree_display_preferences(
            &entries,
            &FsTreeDisplayPreferences {
                show_hidden: false,
                sort_mode: "name".to_string(),
                fold_directories: false,
            },
        );

        assert_eq!(
            display
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["alpha", "zeta.md"]
        );
    }

    #[test]
    fn resolves_display_tree_modified_sort_after_directories() {
        let entries = vec![
            file_entry("/tmp/ws/older.md", 1),
            entry("/tmp/ws/dir", true, None),
            file_entry("/tmp/ws/newer.md", 5),
        ];

        let display = apply_file_tree_display_preferences(
            &entries,
            &FsTreeDisplayPreferences {
                show_hidden: true,
                sort_mode: "modified".to_string(),
                fold_directories: false,
            },
        );

        assert_eq!(
            display
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["dir", "newer.md", "older.md"]
        );
    }

    #[test]
    fn normalizes_display_preferences_before_display_resolution() {
        assert_eq!(
            normalize_display_preferences(FsTreeDisplayPreferences {
                show_hidden: false,
                sort_mode: "recent".to_string(),
                fold_directories: true,
            }),
            FsTreeDisplayPreferences {
                show_hidden: false,
                sort_mode: "name".to_string(),
                fold_directories: true,
            }
        );

        assert_eq!(
            normalize_display_preferences(FsTreeDisplayPreferences {
                show_hidden: true,
                sort_mode: " MODIFIED ".to_string(),
                fold_directories: false,
            })
            .sort_mode,
            "modified"
        );
    }

    #[test]
    fn folds_single_child_directories_into_display_name() {
        let entries = vec![entry(
            "/tmp/ws/alpha",
            true,
            Some(vec![entry(
                "/tmp/ws/alpha/beta",
                true,
                Some(vec![file_entry("/tmp/ws/alpha/beta/note.md", 1)]),
            )]),
        )];

        let display = apply_file_tree_display_preferences(
            &entries,
            &FsTreeDisplayPreferences {
                show_hidden: true,
                sort_mode: "name".to_string(),
                fold_directories: true,
            },
        );

        assert_eq!(display[0].path, "/tmp/ws/alpha/beta");
        assert_eq!(display[0].display_name.as_deref(), Some("alpha/beta"));
        assert_eq!(
            display[0]
                .children
                .as_ref()
                .and_then(|children| children.first())
                .map(|entry| entry.name.as_str()),
            Some("note.md")
        );
    }

    #[test]
    fn folds_nested_single_child_directory_display_names() {
        let entries = vec![entry(
            "/tmp/ws/alpha",
            true,
            Some(vec![entry(
                "/tmp/ws/alpha/beta",
                true,
                Some(vec![entry(
                    "/tmp/ws/alpha/beta/gamma",
                    true,
                    Some(vec![file_entry("/tmp/ws/alpha/beta/gamma/note.md", 1)]),
                )]),
            )]),
        )];

        let display = apply_file_tree_display_preferences(
            &entries,
            &FsTreeDisplayPreferences {
                show_hidden: true,
                sort_mode: "name".to_string(),
                fold_directories: true,
            },
        );

        assert_eq!(display[0].path, "/tmp/ws/alpha/beta/gamma");
        assert_eq!(display[0].display_name.as_deref(), Some("alpha/beta/gamma"));
    }
}
