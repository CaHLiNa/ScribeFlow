use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::read_dir_shallow_entries;

const MAX_SUPPORT_FILE_COUNT: usize = 12;
const MAX_SUPPORT_FILE_BYTES: u64 = 12_000;
const SUPPORTED_SUPPORT_FILE_EXTENSIONS: &[&str] = &[
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".csv", ".ts", ".js", ".mjs", ".cjs", ".py",
    ".sh", ".rs",
];

fn extname(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{}", ext.to_lowercase()))
        .unwrap_or_default()
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_string()
}

fn relative_path(root: &str, target: &str) -> String {
    let normalized_root = root.trim_end_matches('/');
    let normalized_target = target.trim();
    if normalized_root.is_empty() || !normalized_target.starts_with(&format!("{normalized_root}/"))
    {
        return normalized_target.to_string();
    }
    normalized_target[normalized_root.len() + 1..].to_string()
}

fn is_supported_skill_support_file(path: &str) -> bool {
    let name = basename(path);
    if name.is_empty() || name == "SKILL.md" {
        return false;
    }
    SUPPORTED_SUPPORT_FILE_EXTENSIONS.contains(&extname(path).as_str())
}

fn walk_skill_directory(root_path: &str, current_path: &str, collected: &mut Vec<Value>) {
    if collected.len() >= MAX_SUPPORT_FILE_COUNT {
        return;
    }

    let Ok(entries) = read_dir_shallow_entries(Path::new(current_path)) else {
        return;
    };
    for entry in entries {
        if collected.len() >= MAX_SUPPORT_FILE_COUNT {
            break;
        }
        if entry.is_dir {
            if entry.name.starts_with('.') {
                continue;
            }
            walk_skill_directory(root_path, &entry.path, collected);
            continue;
        }
        if !is_supported_skill_support_file(&entry.path) {
            continue;
        }
        let Ok(content) =
            read_text_file_with_limit(Path::new(&entry.path), Some(MAX_SUPPORT_FILE_BYTES))
        else {
            continue;
        };
        let normalized = content.trim();
        if normalized.is_empty() {
            continue;
        }
        collected.push(json!({
            "path": entry.path,
            "relativePath": relative_path(root_path, &entry.path),
            "content": normalized,
        }));
    }
}

pub fn load_skill_supporting_files(skill: &Value) -> Vec<Value> {
    let root_path = skill
        .get("directoryPath")
        .or_else(|| skill.get("directory_path"))
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();
    if root_path.is_empty() {
        return Vec::new();
    }
    let root = PathBuf::from(&root_path);
    if !root.exists() || !root.is_dir() {
        return Vec::new();
    }

    let mut collected = Vec::new();
    walk_skill_directory(&root_path, &root_path, &mut collected);
    collected
}

