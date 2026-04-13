use base64::{engine::general_purpose::STANDARD, Engine};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
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
