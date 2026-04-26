use std::fs;
use std::path::{Path, PathBuf};

use crate::app_dirs;

const LEGACY_AI_CLEANUP_MARKER: &str = "migrations/remove-ai-subsystem-v1.json";

const LEGACY_AI_FILE_PATHS: &[&str] = &["ai.json"];

const LEGACY_AI_DIR_PATHS: &[&str] = &[
    "ai-session-overlays",
    "research-tasks",
    "research-evidence",
    "research-verifications",
];

fn cleanup_marker_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?.join(LEGACY_AI_CLEANUP_MARKER))
}

fn remove_file_if_exists(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_file(path)
        .map_err(|error| format!("Failed to remove legacy AI file {}: {error}", path.display()))?;
    Ok(true)
}

fn remove_dir_if_exists(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_dir_all(path).map_err(|error| {
        format!(
            "Failed to remove legacy AI directory {}: {error}",
            path.display()
        )
    })?;
    Ok(true)
}

fn write_cleanup_marker(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create cleanup marker directory {}: {error}",
                    parent.display()
                )
            })?;
        }
    }

    let payload = serde_json::json!({
        "id": "remove-ai-subsystem-v1",
        "status": "completed",
    });

    fs::write(
        path,
        serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("Failed to serialize cleanup marker: {error}"))?,
    )
    .map_err(|error| format!("Failed to write cleanup marker {}: {error}", path.display()))
}

fn run_legacy_ai_cleanup_in_root(root: &Path) -> Result<usize, String> {
    let mut removed_count = 0usize;

    for relative_path in LEGACY_AI_FILE_PATHS {
        if remove_file_if_exists(&root.join(relative_path))? {
            removed_count += 1;
        }
    }

    for relative_path in LEGACY_AI_DIR_PATHS {
        if remove_dir_if_exists(&root.join(relative_path))? {
            removed_count += 1;
        }
    }

    Ok(removed_count)
}

pub fn run_legacy_cleanup_once() -> Result<(), String> {
    let root = app_dirs::data_root_dir()?;
    let marker = cleanup_marker_path()?;

    if marker.exists() {
        return Ok(());
    }

    let _removed_count = run_legacy_ai_cleanup_in_root(&root)?;
    write_cleanup_marker(&marker)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir() -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "scribeflow-legacy-cleanup-{}-{}",
            std::process::id(),
            nanos
        ))
    }

    #[test]
    fn removes_legacy_ai_paths_in_root() {
        let root = unique_temp_dir();
        fs::create_dir_all(&root).expect("create temp root");
        fs::write(root.join("ai.json"), "{}").expect("write ai config");
        fs::create_dir_all(root.join("ai-session-overlays")).expect("create overlays dir");
        fs::create_dir_all(root.join("research-tasks")).expect("create tasks dir");
        fs::create_dir_all(root.join("research-evidence")).expect("create evidence dir");
        fs::create_dir_all(root.join("research-verifications"))
            .expect("create verifications dir");

        let removed = run_legacy_ai_cleanup_in_root(&root).expect("run cleanup");
        assert_eq!(removed, 5);
        assert!(!root.join("ai.json").exists());
        assert!(!root.join("ai-session-overlays").exists());
        assert!(!root.join("research-tasks").exists());
        assert!(!root.join("research-evidence").exists());
        assert!(!root.join("research-verifications").exists());

        let _ = fs::remove_dir_all(&root);
    }
}
