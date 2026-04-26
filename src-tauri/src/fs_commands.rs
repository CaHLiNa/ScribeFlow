use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::png::PngEncoder;
use image::{ColorType, GenericImageView, ImageEncoder, ImageReader};
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePreviewResult {
    pub mime_type: String,
    pub base64: String,
    pub renderer: String,
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

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let target_path = dest.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
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

fn image_preview_cache_path(source_path: &Path, max_size: u32) -> Result<PathBuf, String> {
    let metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let mut hasher = DefaultHasher::new();
    source_path.to_string_lossy().hash(&mut hasher);
    modified.hash(&mut hasher);
    max_size.hash(&mut hasher);
    let hash = format!("{:016x}", hasher.finish());
    let cache_dir = std::env::temp_dir().join("scribeflow-image-previews");
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    Ok(cache_dir.join(hash))
}

#[cfg(unix)]
fn lookup_binary_on_path(binary_name: &str) -> Option<String> {
    let output = background_command("/bin/bash")
        .args(["-lc", &format!("which {binary_name}")])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn find_ghostscript() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for candidate in ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "/usr/bin/gs"] {
            if Path::new(candidate).exists() {
                return Some(candidate.to_string());
            }
        }
    }

    #[cfg(unix)]
    {
        return lookup_binary_on_path("gs");
    }

    #[allow(unreachable_code)]
    None
}

fn find_ps2pdf() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for candidate in [
            "/opt/homebrew/bin/ps2pdf",
            "/usr/local/bin/ps2pdf",
            "/usr/bin/ps2pdf",
        ] {
            if Path::new(candidate).exists() {
                return Some(candidate.to_string());
            }
        }
    }

    #[cfg(unix)]
    {
        return lookup_binary_on_path("ps2pdf");
    }

    #[allow(unreachable_code)]
    None
}

fn cached_postscript_pdf_path(source_path: &Path) -> Result<PathBuf, String> {
    let cache_dir = image_preview_cache_path(source_path, 0)?;
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    Ok(cache_dir.join("preview.pdf"))
}

fn convert_postscript_to_pdf(path: &Path) -> Result<PathBuf, String> {
    let pdf_path = cached_postscript_pdf_path(path)?;
    if pdf_path.exists() {
        return Ok(pdf_path);
    }

    let source = path.to_string_lossy().to_string();
    let output_path = pdf_path.to_string_lossy().to_string();
    let ps2pdf =
        find_ps2pdf().ok_or_else(|| "ps2pdf is not installed or not available on PATH.".to_string())?;
    let output = background_command(&ps2pdf)
        .args([&source, &output_path])
        .output()
        .map_err(|error| format!("Failed to start ps2pdf: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() && !stdout.is_empty() {
            format!("{stderr}\n{stdout}")
        } else if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("{}", output.status)
        };
        return Err(format!("ps2pdf conversion failed: {detail}"));
    }

    Ok(pdf_path)
}

#[cfg(target_os = "macos")]
fn render_image_preview_blocking(path: &Path, max_size: u32) -> Result<ImagePreviewResult, String> {
    if !path.exists() {
        return Err("Image path does not exist".to_string());
    }

    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("tif") | Some("tiff") => render_tiff_preview(path, max_size),
        Some("eps") | Some("ps") => render_postscript_preview(path, max_size),
        _ => Err("This image format does not have a generated preview renderer.".to_string()),
    }
}

#[cfg(not(target_os = "macos"))]
fn render_image_preview_blocking(_path: &Path, _max_size: u32) -> Result<ImagePreviewResult, String> {
    Err("Generated image previews are only available on macOS.".to_string())
}

#[cfg(target_os = "macos")]
fn render_tiff_preview(path: &Path, max_size: u32) -> Result<ImagePreviewResult, String> {
    let reader = ImageReader::open(path).map_err(|error| format!("Failed to open image: {error}"))?;
    let dynamic = reader
        .with_guessed_format()
        .map_err(|error| format!("Failed to detect image format: {error}"))?
        .decode()
        .map_err(|error| format!("Failed to decode image: {error}"))?;
    let (width, height) = dynamic.dimensions();
    let rendered = if width > max_size || height > max_size {
        dynamic.resize(max_size, max_size, image::imageops::FilterType::Lanczos3)
    } else {
        dynamic
    };
    let rgba = rendered.to_rgba8();
    let mut buffer = Cursor::new(Vec::new());
    let encoder = PngEncoder::new(&mut buffer);
    encoder
        .write_image(
            rgba.as_raw(),
            rgba.width(),
            rgba.height(),
            ColorType::Rgba8.into(),
        )
        .map_err(|error| format!("Failed to encode preview image: {error}"))?;

    Ok(ImagePreviewResult {
        mime_type: "image/png".to_string(),
        base64: STANDARD.encode(buffer.into_inner()),
        renderer: "rust-image".to_string(),
    })
}

#[cfg(target_os = "macos")]
fn render_postscript_preview(path: &Path, max_size: u32) -> Result<ImagePreviewResult, String> {
    let preview_dir = image_preview_cache_path(path, max_size)?;
    fs::create_dir_all(&preview_dir).map_err(|error| error.to_string())?;
    let preview_path = preview_dir.join("preview.png");

    if !preview_path.exists() {
        let resolution = if max_size >= 2000 {
            "216"
        } else if max_size >= 1400 {
            "180"
        } else {
            "144"
        };
        let mut args = vec![
            "-q".to_string(),
            "-dSAFER".to_string(),
            "-dBATCH".to_string(),
            "-dNOPAUSE".to_string(),
            "-dTextAlphaBits=4".to_string(),
            "-dGraphicsAlphaBits=4".to_string(),
            "-dFirstPage=1".to_string(),
            "-dLastPage=1".to_string(),
            "-sDEVICE=pngalpha".to_string(),
        ];
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("eps"))
            .unwrap_or(false)
        {
            args.push("-dEPSCrop".to_string());
        }
        args.push(format!("-r{resolution}"));
        args.push("-sOutputFile".to_string());
        args.push(preview_path.to_string_lossy().to_string());
        args.push(path.to_string_lossy().to_string());

        let ghostscript = find_ghostscript()
            .ok_or_else(|| "Ghostscript is not installed or not available on PATH.".to_string())?;
        let output = background_command(&ghostscript)
            .args(args)
            .output()
            .map_err(|error| format!("Failed to start Ghostscript: {error}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let detail = if !stderr.is_empty() && !stdout.is_empty() {
                format!("{stderr}\n{stdout}")
            } else if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                format!("{}", output.status)
            };
            return Err(format!("Ghostscript preview generation failed: {detail}"));
        }
    }

    let bytes = fs::read(&preview_path).map_err(|error| error.to_string())?;
    Ok(ImagePreviewResult {
        mime_type: "image/png".to_string(),
        base64: STANDARD.encode(bytes),
        renderer: "ghostscript".to_string(),
    })
}

#[tauri::command]
pub async fn read_dir_shallow(path: String, include_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    let include_hidden = include_hidden.unwrap_or(true);
    run_blocking(move || read_dir_shallow_entries(Path::new(&path_for_read), include_hidden)).await
}

#[tauri::command]
pub async fn list_files_recursive(path: String, include_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    let include_hidden = include_hidden.unwrap_or(true);
    run_blocking(move || {
        let mut files = Vec::new();
        collect_files_recursive(Path::new(&path_for_read), &mut files, include_hidden)?;
        files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
        Ok(files)
    })
    .await
}

#[tauri::command]
pub async fn read_visible_tree(
    path: String,
    loaded_dirs: Option<Vec<String>>,
    include_hidden: Option<bool>,
) -> Result<Vec<FileEntry>, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    let include_hidden = include_hidden.unwrap_or(true);
    run_blocking(move || build_visible_tree(Path::new(&path_for_read), &loaded_set, include_hidden)).await
}

#[tauri::command]
pub async fn read_workspace_tree_snapshot(
    path: String,
    loaded_dirs: Option<Vec<String>>,
    include_hidden: Option<bool>,
) -> Result<WorkspaceTreeSnapshot, String> {
    let path_for_read = path.clone();
    let loaded_set: HashSet<String> = loaded_dirs.unwrap_or_default().into_iter().collect();
    let include_hidden = include_hidden.unwrap_or(true);
    run_blocking(move || {
        build_workspace_tree_snapshot(Path::new(&path_for_read), &loaded_set, include_hidden)
    })
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
pub async fn render_image_preview(
    path: String,
    max_size: Option<u32>,
) -> Result<ImagePreviewResult, String> {
    let path_for_render = path.clone();
    run_blocking(move || {
        render_image_preview_blocking(Path::new(&path_for_render), max_size.unwrap_or(1800))
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
            command.arg("/select,");
            command.arg(&normalized);
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
pub async fn open_path_in_default_app(path: String) -> Result<(), String> {
    run_blocking(move || {
        let target = PathBuf::from(&path);
        if !target.exists() {
            return Err("Path does not exist".to_string());
        }

        #[cfg(target_os = "macos")]
        {
            let ext = target
                .extension()
                .and_then(|value| value.to_str())
                .map(|value| value.to_ascii_lowercase())
                .unwrap_or_default();
            if matches!(ext.as_str(), "eps" | "ps") {
                let converted_pdf = convert_postscript_to_pdf(&target)?;
                let preview_status = background_command("open")
                    .args(["-a", "Preview", &converted_pdf.to_string_lossy()])
                    .status()
                    .map_err(|error| format!("Failed to launch Preview: {error}"))?;
                if preview_status.success() {
                    return Ok(());
                }
            }
            let prefer_preview = matches!(
                ext.as_str(),
                "eps" | "ps" | "pdf" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "svg" | "tif" | "tiff"
            );

            if prefer_preview {
                let preview_status = background_command("open")
                    .args(["-a", "Preview", &target.to_string_lossy()])
                    .status()
                    .map_err(|error| format!("Failed to launch Preview: {error}"))?;
                if preview_status.success() {
                    return Ok(());
                }
            }

            let status = background_command("open")
                .arg(&target)
                .status()
                .map_err(|error| format!("Failed to open file: {error}"))?;
            if status.success() {
                return Ok(());
            }
            return Err(format!("Failed to open file in the default app: {status}"));
        }

        #[cfg(target_os = "windows")]
        {
            let status = background_command("cmd")
                .args(["/C", "start", "", &target.to_string_lossy()])
                .status()
                .map_err(|error| format!("Failed to open file: {error}"))?;
            if status.success() {
                return Ok(());
            }
            return Err(format!("Failed to open file in the default app: {status}"));
        }

        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            let status = background_command("xdg-open")
                .arg(&target)
                .status()
                .map_err(|error| format!("Failed to open file: {error}"))?;
            if status.success() {
                return Ok(());
            }
            return Err(format!("Failed to open file in the default app: {status}"));
        }
    })
    .await
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
