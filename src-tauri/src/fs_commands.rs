use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::task;

use crate::app_dirs;
use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{
    build_visible_tree, build_workspace_tree_snapshot, collect_files_recursive,
    read_dir_shallow_entries, FileEntry, WorkspaceTreeSnapshot,
};
use crate::process_utils::background_command;
use crate::security;
use crate::security::WorkspaceScopeState;

async fn run_blocking<F, T>(operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    task::spawn_blocking(operation)
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCreateFileResult {
    pub ok: bool,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRenameResult {
    pub ok: bool,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMoveResult {
    pub ok: bool,
    pub dest_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCopyExternalResult {
    pub path: String,
    pub is_dir: bool,
}

fn build_copy_name(name: &str, index: usize, suffix: &str) -> String {
    if index == 1 {
        format!("{name} copy{suffix}")
    } else {
        format!("{name} copy {index}{suffix}")
    }
}

fn path_exists_internal(path: &Path) -> bool {
    path.exists()
}

fn is_directory_internal(path: &Path) -> bool {
    path.is_dir()
}

fn resolve_unique_copy_destination(path: &Path, dir: &Path, is_dir: bool) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if is_dir {
        let mut index = 1;
        loop {
            let candidate = dir.join(build_copy_name(name, index, ""));
            if !path_exists_internal(&candidate) {
                return candidate;
            }
            index += 1;
        }
    }

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let mut index = 1;
    loop {
        let candidate = dir.join(build_copy_name(stem, index, &suffix));
        if !path_exists_internal(&candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn resolve_unique_move_destination(name: &str, dest_dir: &Path, is_dir: bool) -> PathBuf {
    if is_dir {
        let mut index = 2;
        loop {
            let candidate = dest_dir.join(format!("{name} {index}"));
            if !path_exists_internal(&candidate) {
                return candidate;
            }
            index += 1;
        }
    }

    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let mut index = 2;
    loop {
        let candidate = dest_dir.join(format!("{stem} {index}{suffix}"));
        if !path_exists_internal(&candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn default_file_content(name: &str, initial_content: &str) -> String {
    if !initial_content.is_empty() {
        return initial_content.to_string();
    }
    if name.ends_with(".tex") {
        let title = name.trim_end_matches(".tex").replace('-', " ");
        return format!(
            "\\documentclass{{article}}\n\\title{{{title}}}\n\\author{{}}\n\\date{{}}\n\n\\begin{{document}}\n\\maketitle\n\n\n\n\\end{{document}}\n"
        );
    }
    String::new()
}

#[tauri::command]
pub async fn read_dir_shallow(path: String) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    run_blocking(move || read_dir_shallow_entries(Path::new(&path_for_read))).await
}

#[tauri::command]
pub async fn list_files_recursive(path: String) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    run_blocking(move || {
        let mut files = Vec::new();
        collect_files_recursive(Path::new(&path_for_read), &mut files)?;
        files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
        Ok(files)
    })
    .await
}

#[tauri::command]
pub async fn read_visible_tree(
    path: String,
    loaded_dirs: Option<Vec<String>>,
) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    run_blocking(move || build_visible_tree(Path::new(&path_for_read), &loaded_set)).await
}

#[tauri::command]
pub async fn read_workspace_tree_snapshot(
    path: String,
    loaded_dirs: Option<Vec<String>>,
) -> Result<WorkspaceTreeSnapshot, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    run_blocking(move || build_workspace_tree_snapshot(Path::new(&path_for_read), &loaded_set))
        .await
}

#[tauri::command]
pub async fn read_file(path: String, max_bytes: Option<u64>) -> Result<String, String> {
    eprintln!("[fs] read_file start path={}", path);
    let started = std::time::Instant::now();
    let path_for_read = path.clone();
    let result =
        run_blocking(move || read_text_file_with_limit(Path::new(&path_for_read), max_bytes)).await;
    match &result {
        Ok(content) => eprintln!(
            "[fs] read_file ok path={} bytes={} elapsed_ms={}",
            path,
            content.len(),
            started.elapsed().as_millis()
        ),
        Err(error) => eprintln!(
            "[fs] read_file err path={} elapsed_ms={} error={}",
            path,
            started.elapsed().as_millis(),
            error
        ),
    }
    result
}

#[tauri::command]
pub async fn read_file_base64(path: String) -> Result<String, String> {
    run_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        Ok(STANDARD.encode(&bytes))
    })
    .await
}

#[tauri::command]
pub async fn write_file(
    path: String,
    content: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || fs::write(&resolved, &content).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn write_file_base64(
    path: String,
    data: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        let bytes = STANDARD
            .decode(&data)
            .map_err(|e| format!("Base64 decode error: {}", e))?;
        fs::write(&resolved, &bytes).map_err(|e| format!("Write error: {}", e))
    })
    .await
}

#[tauri::command]
pub async fn create_file(
    path: String,
    content: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        if resolved.exists() {
            return Err("File already exists".to_string());
        }
        fs::write(&resolved, &content).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn workspace_create_file(
    dir_path: String,
    name: String,
    initial_content: Option<String>,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceCreateFileResult, String> {
    let full_path = format!("{}/{}", dir_path.trim_end_matches('/'), name);
    let resolved =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&full_path))?;
    let content = default_file_content(&name, initial_content.unwrap_or_default().trim());
    run_blocking(move || {
        if resolved.exists() {
            return Err("File already exists".to_string());
        }
        fs::write(&resolved, content).map_err(|e| e.to_string())?;
        Ok(WorkspaceCreateFileResult {
            ok: true,
            path: resolved.to_string_lossy().to_string(),
        })
    })
    .await
}

#[tauri::command]
pub async fn create_dir(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || fs::create_dir_all(&resolved).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn rename_path(
    old_path: String,
    new_path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_old =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&old_path))?;
    let resolved_new =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&new_path))?;
    run_blocking(move || fs::rename(&resolved_old, &resolved_new).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn workspace_rename_path(
    old_path: String,
    new_path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceRenameResult, String> {
    let resolved_old =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&old_path))?;
    let resolved_new =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&new_path))?;
    run_blocking(move || {
        if resolved_old != resolved_new && resolved_new.exists() {
            return Ok(WorkspaceRenameResult {
                ok: false,
                code: Some("exists".to_string()),
            });
        }
        fs::rename(&resolved_old, &resolved_new).map_err(|e| e.to_string())?;
        Ok(WorkspaceRenameResult {
            ok: true,
            code: None,
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_path(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        if resolved.is_dir() {
            fs::remove_dir_all(&resolved).map_err(|e| e.to_string())
        } else {
            fs::remove_file(&resolved).map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn copy_file(
    src: String,
    dest: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_dest =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest))?;
    run_blocking(move || {
        fs::copy(&src, &resolved_dest).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn copy_dir(
    src: String,
    dest: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved_dest =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest))?;
    run_blocking(move || {
        let src = Path::new(&src);
        copy_dir_recursive(src, &resolved_dest).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn workspace_duplicate_path(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || {
        let parent = resolved
            .parent()
            .ok_or_else(|| "Cannot resolve parent directory".to_string())?;
        let is_dir = is_directory_internal(&resolved);
        let new_path = resolve_unique_copy_destination(&resolved, parent, is_dir);
        if is_dir {
            copy_dir_recursive(&resolved, &new_path).map_err(|e| e.to_string())?;
        } else {
            fs::copy(&resolved, &new_path).map_err(|e| e.to_string())?;
        }
        Ok(new_path.to_string_lossy().to_string())
    })
    .await
}

#[tauri::command]
pub async fn workspace_move_path(
    src_path: String,
    dest_dir: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceMoveResult, String> {
    let resolved_src =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&src_path))?;
    let resolved_dest_dir =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest_dir))?;
    run_blocking(move || {
        let name = resolved_src
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let mut dest_path = resolved_dest_dir.join(&name);
        if resolved_src != dest_path && dest_path.exists() {
            dest_path =
                resolve_unique_move_destination(&name, &resolved_dest_dir, resolved_src.is_dir());
        }
        fs::rename(&resolved_src, &dest_path).map_err(|e| e.to_string())?;
        Ok(WorkspaceMoveResult {
            ok: true,
            dest_path: dest_path.to_string_lossy().to_string(),
        })
    })
    .await
}

#[tauri::command]
pub async fn workspace_copy_external_path(
    src_path: String,
    dest_dir: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceCopyExternalResult, String> {
    let resolved_dest_dir =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&dest_dir))?;
    run_blocking(move || {
        let src = PathBuf::from(&src_path);
        let is_dir = src.is_dir();
        let name = src
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid source path".to_string())?
            .to_string();
        let mut dest_path = resolved_dest_dir.join(&name);
        if dest_path.exists() {
            dest_path = resolve_unique_move_destination(&name, &resolved_dest_dir, is_dir);
        }
        if is_dir {
            copy_dir_recursive(&src, &dest_path).map_err(|e| e.to_string())?;
        } else {
            fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;
        }
        Ok(WorkspaceCopyExternalResult {
            path: dest_path.to_string_lossy().to_string(),
            is_dir,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs_io::format_file_too_large_error;

    fn temp_file_path(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("altals-fs-{label}-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn read_text_file_with_limit_returns_error_code_when_file_is_too_large() {
        let path = temp_file_path("too-large");
        fs::write(&path, "1234567890").unwrap();

        let error = read_text_file_with_limit(&path, Some(4)).unwrap_err();
        assert_eq!(error, format_file_too_large_error(4, 10));

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn read_text_file_with_limit_reads_when_within_limit() {
        let path = temp_file_path("within-limit");
        fs::write(&path, "hello").unwrap();

        let content = read_text_file_with_limit(&path, Some(8)).unwrap();
        assert_eq!(content, "hello");

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn resolve_unique_copy_destination_adds_copy_suffix() {
        let root = temp_file_path("copy-dest");
        fs::create_dir_all(&root).unwrap();
        let src = root.join("paper.md");
        let existing = root.join("paper copy.md");
        fs::write(&src, "a").unwrap();
        fs::write(&existing, "b").unwrap();

        let candidate = resolve_unique_copy_destination(&src, &root, false);
        assert!(candidate.ends_with("paper copy 2.md"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn default_file_content_bootstraps_tex_files() {
        let content = default_file_content("chapter-1.tex", "");
        assert!(content.contains("\\documentclass"));
        assert!(content.contains("\\title{chapter 1}"));
    }
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn is_directory(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    let exists = Path::new(&path).exists();
    eprintln!("[fs] path_exists path={} exists={}", path, exists);
    Ok(exists)
}

#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    let metadata = fs::metadata(target).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();

    #[cfg(target_os = "macos")]
    {
        let mut command = background_command("open");
        if !is_dir {
            command.arg("-R");
        }
        command.arg(target);
        let status = command.status().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Finder: {status}"));
    }

    #[cfg(target_os = "windows")]
    {
        let normalized = target.to_string_lossy().replace('/', "\\");
        let mut command = background_command("explorer");
        if is_dir {
            command.arg(&normalized);
        } else {
            command.arg(format!("/select,{normalized}"));
        }
        let status = command.status().map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in Explorer: {status}"));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let open_target = if is_dir {
            target.to_path_buf()
        } else {
            target
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| target.to_path_buf())
        };
        let status = background_command("xdg-open")
            .arg(&open_target)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to reveal path in file manager: {status}"));
    }
}

#[tauri::command]
pub async fn get_global_config_dir() -> Result<String, String> {
    let dir = app_dirs::data_root_dir()?;
    let value = dir.to_string_lossy().to_string();
    eprintln!("[app-dirs] get_global_config_dir={}", value);
    Ok(value)
}

#[tauri::command]
pub async fn get_home_dir() -> Result<String, String> {
    let dir = dirs::home_dir().ok_or("Cannot find home directory".to_string())?;
    Ok(dir.to_string_lossy().to_string())
}
