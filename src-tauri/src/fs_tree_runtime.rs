use crate::fs_tree::FileEntry;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeMergeParams {
    #[serde(default)]
    pub next_entries: Vec<FileEntry>,
    #[serde(default)]
    pub previous_entries: Vec<FileEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeCollectLoadedDirsParams {
    #[serde(default)]
    pub entries: Vec<FileEntry>,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub extra_dirs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreePatchChildrenParams {
    #[serde(default)]
    pub entries: Vec<FileEntry>,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub children: Vec<FileEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsTreeAncestorParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub target_path: String,
}

fn merge_preserving_loaded_children(
    next_entries: &[FileEntry],
    previous_entries: &[FileEntry],
) -> Vec<FileEntry> {
    next_entries
        .iter()
        .map(|entry| {
            let previous = previous_entries
                .iter()
                .find(|candidate| candidate.path == entry.path);
            if !entry.is_dir || previous.map(|value| value.is_dir) != Some(true) {
                return entry.clone();
            }

            match (
                &entry.children,
                previous.and_then(|value| value.children.as_ref()),
            ) {
                (None, Some(previous_children)) => FileEntry {
                    children: Some(previous_children.clone()),
                    ..entry.clone()
                },
                (Some(entry_children), Some(previous_children)) => FileEntry {
                    children: Some(merge_preserving_loaded_children(
                        entry_children,
                        previous_children,
                    )),
                    ..entry.clone()
                },
                _ => entry.clone(),
            }
        })
        .collect()
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

fn patch_tree_entry_children(
    entries: &[FileEntry],
    target_path: &str,
    children: &[FileEntry],
) -> Vec<FileEntry> {
    entries
        .iter()
        .map(|entry| {
            if entry.path == target_path {
                return FileEntry {
                    children: Some(children.to_vec()),
                    ..entry.clone()
                };
            }
            if let Some(current_children) = &entry.children {
                return FileEntry {
                    children: Some(patch_tree_entry_children(
                        current_children,
                        target_path,
                        children,
                    )),
                    ..entry.clone()
                };
            }
            entry.clone()
        })
        .collect()
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

#[tauri::command]
pub async fn fs_tree_merge_loaded_children(
    params: FsTreeMergeParams,
) -> Result<Vec<FileEntry>, String> {
    Ok(merge_preserving_loaded_children(
        &params.next_entries,
        &params.previous_entries,
    ))
}

#[tauri::command]
pub async fn fs_tree_collect_loaded_dirs(
    params: FsTreeCollectLoadedDirsParams,
) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    collect_loaded_directory_paths(&params.entries, &mut paths);
    for dir in params.extra_dirs {
        if dir.is_empty() || dir == params.workspace_path {
            continue;
        }
        if !paths.contains(&dir) {
            paths.push(dir);
        }
    }
    paths.sort_by(|a, b| a.len().cmp(&b.len()));
    Ok(paths)
}

#[tauri::command]
pub async fn fs_tree_patch_dir_children(
    params: FsTreePatchChildrenParams,
) -> Result<Vec<FileEntry>, String> {
    Ok(patch_tree_entry_children(
        &params.entries,
        &params.target_path,
        &params.children,
    ))
}

#[tauri::command]
pub async fn fs_tree_ancestor_dirs(params: FsTreeAncestorParams) -> Result<Vec<String>, String> {
    Ok(list_ancestor_dir_paths(
        &params.workspace_path,
        &params.target_path,
    ))
}

