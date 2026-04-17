use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

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

fn should_skip_entry(name: &str, is_dir: bool, is_symlink: bool) -> bool {
    if is_symlink {
        return true;
    }
    if name.starts_with('.') && is_dir {
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

pub fn read_dir_shallow_entries(dir: &Path) -> Result<Vec<FileEntry>, String> {
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

        if should_skip_entry(&name, is_dir, is_symlink) {
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

        if should_skip_entry(&name, is_dir, is_symlink) {
            continue;
        }

        let path_string = path.to_string_lossy().to_string();
        let children = if is_dir && loaded_dirs.contains(&path_string) {
            Some(build_visible_tree(&path, loaded_dirs)?)
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

        if should_skip_entry(&name, is_dir, is_symlink) {
            continue;
        }

        let path_string = path.to_string_lossy().to_string();
        if is_dir {
            let nested_entries = collect_snapshot_entries(&path, loaded_dirs, flat_files)?;
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
) -> Result<WorkspaceTreeSnapshot, String> {
    let mut flat_files = Vec::new();
    let tree = collect_snapshot_entries(dir, loaded_dirs, &mut flat_files)?;
    flat_files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(WorkspaceTreeSnapshot { tree, flat_files })
}

pub fn collect_files_recursive(dir: &Path, files: &mut Vec<FileEntry>) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let file_type = metadata.file_type();
        let is_symlink = file_type.is_symlink();
        let is_dir = file_type.is_dir();

        if should_skip_entry(&name, is_dir, is_symlink) {
            continue;
        }

        if is_dir {
            collect_files_recursive(&path, files)?;
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
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn temp_dir_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("altals-fs-tree-{label}-{}", Uuid::new_v4()))
    }

    #[test]
    fn build_visible_tree_only_loads_requested_directories() {
        let root = temp_dir_path("visible-tree");
        let docs = root.join("docs");
        let chapters = docs.join("chapters");
        let notes = root.join("notes.md");
        let chapter = chapters.join("chapter1.md");

        fs::create_dir_all(&chapters).unwrap();
        fs::write(&notes, "notes").unwrap();
        fs::write(docs.join("intro.md"), "intro").unwrap();
        fs::write(&chapter, "chapter").unwrap();

        let mut loaded_dirs = HashSet::new();
        loaded_dirs.insert(docs.to_string_lossy().to_string());

        let tree = build_visible_tree(&root, &loaded_dirs).unwrap();

        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].path, docs.to_string_lossy().to_string());
        assert!(tree[0].is_dir);
        assert!(tree[0].children.is_some());

        let docs_children = tree[0].children.as_ref().unwrap();
        assert_eq!(docs_children.len(), 2);
        let chapters_entry = docs_children
            .iter()
            .find(|entry| entry.path == chapters.to_string_lossy())
            .unwrap();
        assert!(chapters_entry.children.is_none());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn build_workspace_tree_snapshot_collects_flat_files_while_respecting_loaded_dirs() {
        let root = temp_dir_path("snapshot");
        let docs = root.join("docs");
        let chapters = docs.join("chapters");
        let notes = root.join("notes.md");
        let intro = docs.join("intro.md");
        let chapter = chapters.join("chapter1.md");

        fs::create_dir_all(&chapters).unwrap();
        fs::write(&notes, "notes").unwrap();
        fs::write(&intro, "intro").unwrap();
        fs::write(&chapter, "chapter").unwrap();

        let mut loaded_dirs = HashSet::new();
        loaded_dirs.insert(docs.to_string_lossy().to_string());

        let snapshot = build_workspace_tree_snapshot(&root, &loaded_dirs).unwrap();

        assert_eq!(snapshot.tree.len(), 2);
        assert_eq!(snapshot.flat_files.len(), 3);
        assert_eq!(
            snapshot
                .flat_files
                .iter()
                .map(|entry| entry.path.clone())
                .collect::<Vec<_>>(),
            vec![
                chapter.to_string_lossy().to_string(),
                intro.to_string_lossy().to_string(),
                notes.to_string_lossy().to_string(),
            ]
        );

        let docs_entry = snapshot
            .tree
            .iter()
            .find(|entry| entry.path == docs.to_string_lossy())
            .unwrap();
        assert!(docs_entry.children.is_some());

        let chapters_entry = docs_entry
            .children
            .as_ref()
            .unwrap()
            .iter()
            .find(|entry| entry.path == chapters.to_string_lossy())
            .unwrap();
        assert!(chapters_entry.children.is_none());

        fs::remove_dir_all(root).unwrap();
    }
}
