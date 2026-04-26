use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

const HIDDEN_WORKSPACE_FILES: &[&str] = &[
    ".scribeflow-latex-sync-debug.jsonl",
    "_instructions.md",
    "instructions.md",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceTreeSnapshot {
    pub tree: Vec<FileEntry>,
    #[serde(rename = "flatFiles")]
    pub flat_files: Vec<FileEntry>,
}

fn should_skip_entry(name: &str, _is_dir: bool, is_symlink: bool, include_hidden: bool) -> bool {
    if is_symlink {
        return true;
    }
    if HIDDEN_WORKSPACE_FILES.contains(&name) {
        return true;
    }
    if !include_hidden && name.starts_with('.') {
        return true;
    }
    matches!(name, "node_modules" | "target" | ".DS_Store")
}

fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });
}

fn file_modified_timestamp(metadata: &fs::Metadata, is_dir: bool) -> Option<u64> {
    if is_dir {
        return None;
    }

    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

pub fn read_dir_shallow_entries(dir: &Path, include_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        if should_skip_entry(&name, is_dir, is_symlink, include_hidden) {
            continue;
        }

        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children: None,
            modified: file_modified_timestamp(&metadata, is_dir),
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

pub fn build_visible_tree(
    dir: &Path,
    loaded_dirs: &HashSet<String>,
    include_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        if should_skip_entry(&name, is_dir, is_symlink, include_hidden) {
            continue;
        }

        let path_string = path.to_string_lossy().to_string();
        let children = if is_dir && loaded_dirs.contains(&path_string) {
            Some(build_visible_tree(&path, loaded_dirs, include_hidden)?)
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: path_string,
            is_dir,
            children,
            modified: file_modified_timestamp(&metadata, is_dir),
        });
    }

    sort_entries(&mut entries);
    Ok(entries)
}

fn collect_snapshot_entries(
    dir: &Path,
    loaded_dirs: &HashSet<String>,
    flat_files: &mut Vec<FileEntry>,
    include_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        if should_skip_entry(&name, is_dir, is_symlink, include_hidden) {
            continue;
        }

        let path_string = path.to_string_lossy().to_string();
        if is_dir {
            let nested_entries =
                collect_snapshot_entries(&path, loaded_dirs, flat_files, include_hidden)?;
            let children = if loaded_dirs.contains(&path_string) {
                Some(nested_entries)
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: path_string,
                is_dir: true,
                children,
                modified: None,
            });
            continue;
        }

        let file_entry = FileEntry {
            name,
            path: path_string,
            is_dir: false,
            children: None,
            modified: file_modified_timestamp(&metadata, false),
        };
        flat_files.push(file_entry.clone());
        entries.push(file_entry);
    }

    sort_entries(&mut entries);
    Ok(entries)
}

pub fn build_workspace_tree_snapshot(
    dir: &Path,
    loaded_dirs: &HashSet<String>,
    include_hidden: bool,
) -> Result<WorkspaceTreeSnapshot, String> {
    let mut flat_files = Vec::new();
    let tree = collect_snapshot_entries(dir, loaded_dirs, &mut flat_files, include_hidden)?;
    flat_files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(WorkspaceTreeSnapshot { tree, flat_files })
}

pub fn collect_files_recursive(
    dir: &Path,
    files: &mut Vec<FileEntry>,
    include_hidden: bool,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        if should_skip_entry(&name, is_dir, is_symlink, include_hidden) {
            continue;
        }

        if is_dir {
            collect_files_recursive(&path, files, include_hidden)?;
            continue;
        }

        files.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir: false,
            children: None,
            modified: file_modified_timestamp(&metadata, false),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::should_skip_entry;

    #[test]
    fn hidden_entries_follow_include_hidden_flag() {
        assert!(should_skip_entry(".git", true, false, false));
        assert!(should_skip_entry(".gitignore", false, false, false));
        assert!(!should_skip_entry(".git", true, false, true));
        assert!(!should_skip_entry(".gitignore", false, false, true));
    }
}
