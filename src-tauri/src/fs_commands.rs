use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::png::PngEncoder;
use image::{ColorType, GenericImageView, ImageEncoder, ImageReader};
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tokio::task;

use crate::app_dirs;
use crate::fs_io::read_text_file_with_limit;
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
pub struct WorkspaceCreateDirResult {
    pub ok: bool,
    pub path: String,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRenameResult {
    pub ok: bool,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDeleteResult {
    pub ok: bool,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDuplicateResult {
    pub ok: bool,
    pub path: String,
    pub is_dir: bool,
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
    pub ok: bool,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathStatusResult {
    pub path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
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

fn path_status_internal(path: &Path) -> PathStatusResult {
    let metadata = fs::metadata(path).ok();
    let is_dir = metadata.as_ref().is_some_and(fs::Metadata::is_dir);
    let is_file = metadata.as_ref().is_some_and(fs::Metadata::is_file);
    let modified = metadata
        .as_ref()
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_secs());

    PathStatusResult {
        path: path.to_string_lossy().to_string(),
        exists: metadata.is_some(),
        is_dir,
        is_file,
        size: metadata
            .as_ref()
            .filter(|_| is_file)
            .map(fs::Metadata::len),
        modified,
    }
}

fn workspace_path_status_internal(
    scope_state: &WorkspaceScopeState,
    path: &Path,
) -> Result<PathStatusResult, String> {
    let resolved = security::ensure_allowed_workspace_path(scope_state, path)?;
    Ok(path_status_internal(&resolved))
}

fn workspace_external_path_internal(
    scope_state: &WorkspaceScopeState,
    path: &Path,
) -> Result<PathBuf, String> {
    security::ensure_allowed_workspace_path(scope_state, path)
}

fn workspace_read_text_file_blocking(
    path: &Path,
    max_bytes: Option<u64>,
) -> Result<String, String> {
    read_text_file_with_limit(path, max_bytes)
}

fn workspace_write_text_file_blocking(path: &Path, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

fn workspace_read_file_base64_blocking(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

fn workspace_write_file_base64_blocking(path: &Path, data: &str) -> Result<(), String> {
    let bytes = STANDARD
        .decode(data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    fs::write(path, &bytes).map_err(|e| format!("Write error: {}", e))
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

fn workspace_create_dir_blocking(path: &Path) -> Result<WorkspaceCreateDirResult, String> {
    if path.exists() {
        return Ok(WorkspaceCreateDirResult {
            ok: false,
            path: path.to_string_lossy().to_string(),
            code: Some("exists".to_string()),
        });
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    Ok(WorkspaceCreateDirResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        code: None,
    })
}

fn workspace_delete_path_blocking(path: &Path) -> Result<WorkspaceDeleteResult, String> {
    let is_dir = path.is_dir();
    if is_dir {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(WorkspaceDeleteResult {
        ok: true,
        path: path.to_string_lossy().to_string(),
        is_dir,
    })
}

fn workspace_duplicate_path_blocking(path: &Path) -> Result<WorkspaceDuplicateResult, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot resolve parent directory".to_string())?;
    let is_dir = is_directory_internal(path);
    let new_path = resolve_unique_copy_destination(path, parent, is_dir);
    if is_dir {
        copy_dir_recursive(path, &new_path).map_err(|e| e.to_string())?;
    } else {
        fs::copy(path, &new_path).map_err(|e| e.to_string())?;
    }
    Ok(WorkspaceDuplicateResult {
        ok: true,
        path: new_path.to_string_lossy().to_string(),
        is_dir,
    })
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
pub async fn workspace_render_image_preview(
    path: String,
    max_size: Option<u32>,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<ImagePreviewResult, String> {
    let resolved = security::ensure_allowed_workspace_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || render_image_preview_blocking(&resolved, max_size.unwrap_or(1800))).await
}

#[tauri::command]
pub async fn workspace_read_text_file(
    path: String,
    max_bytes: Option<u64>,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    let resolved = security::ensure_allowed_workspace_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_read_text_file_blocking(&resolved, max_bytes)).await
}

#[tauri::command]
pub async fn workspace_write_text_file(
    path: String,
    content: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_write_text_file_blocking(&resolved, &content)).await
}

#[tauri::command]
pub async fn workspace_read_file_base64(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    let resolved = security::ensure_allowed_workspace_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_read_file_base64_blocking(&resolved)).await
}

#[tauri::command]
pub async fn workspace_write_file_base64(
    path: String,
    data: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_write_file_base64_blocking(&resolved, &data)).await
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
pub async fn workspace_create_dir(
    dir_path: String,
    name: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceCreateDirResult, String> {
    let full_path = format!("{}/{}", dir_path.trim_end_matches('/'), name);
    let resolved =
        security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&full_path))?;
    run_blocking(move || workspace_create_dir_blocking(&resolved)).await
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
pub async fn workspace_delete_path(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceDeleteResult, String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_delete_path_blocking(&resolved)).await
}

#[tauri::command]
pub async fn workspace_duplicate_path(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<WorkspaceDuplicateResult, String> {
    let resolved = security::ensure_allowed_mutation_path(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || workspace_duplicate_path_blocking(&resolved)).await
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
            ok: true,
            path: dest_path.to_string_lossy().to_string(),
            is_dir,
        })
    })
    .await
}

#[tauri::command]
pub async fn path_status(path: String) -> Result<PathStatusResult, String> {
    Ok(path_status_internal(Path::new(&path)))
}

#[tauri::command]
pub async fn workspace_path_status(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<PathStatusResult, String> {
    workspace_path_status_internal(scope_state.inner(), Path::new(&path))
}

fn reveal_in_file_manager_blocking(target: &Path) -> Result<(), String> {
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
pub async fn workspace_reveal_in_file_manager(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = workspace_external_path_internal(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || reveal_in_file_manager_blocking(&resolved)).await
}

fn open_path_in_default_app_blocking(target: &Path) -> Result<(), String> {
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
            let converted_pdf = convert_postscript_to_pdf(target)?;
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
            .arg(target)
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
            .arg(target)
            .status()
            .map_err(|error| format!("Failed to open file: {error}"))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Failed to open file in the default app: {status}"));
    }
}

#[tauri::command]
pub async fn workspace_open_path_in_default_app(
    path: String,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<(), String> {
    let resolved = workspace_external_path_internal(scope_state.inner(), Path::new(&path))?;
    run_blocking(move || open_path_in_default_app_blocking(&resolved)).await
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

#[cfg(test)]
mod tests {
    use super::{
        path_status_internal, workspace_create_dir_blocking, workspace_delete_path_blocking,
        workspace_duplicate_path_blocking, workspace_external_path_internal,
        workspace_path_status_internal,
        workspace_read_file_base64_blocking, workspace_read_text_file_blocking,
        workspace_write_file_base64_blocking, workspace_write_text_file_blocking,
    };
    use crate::security::{set_allowed_roots_internal, WorkspaceScopeState};
    use std::fs;

    #[test]
    fn path_status_reports_existing_file_and_missing_path() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-path-status-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "hello").expect("write temp file");

        let file_status = path_status_internal(&file_path);
        assert!(file_status.exists);
        assert!(file_status.is_file);
        assert!(!file_status.is_dir);
        assert_eq!(file_status.size, Some(5));
        assert!(file_status.modified.is_some());

        let missing_status = path_status_internal(&temp_dir.join("missing.md"));
        assert!(!missing_status.exists);
        assert!(!missing_status.is_file);
        assert!(!missing_status.is_dir);
        assert_eq!(missing_status.size, None);
        assert_eq!(missing_status.modified, None);

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn workspace_path_status_respects_registered_scope() {
        let workspace_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-path-status-{}",
            uuid::Uuid::new_v4()
        ));
        let outside_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-path-status-outside-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_dir).expect("create workspace dir");
        fs::create_dir_all(&outside_dir).expect("create outside dir");
        let workspace_file = workspace_dir.join("note.md");
        let outside_file = outside_dir.join("note.md");
        fs::write(&workspace_file, "hello").expect("write workspace file");
        fs::write(&outside_file, "outside").expect("write outside file");

        let state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&state, &workspace_dir.to_string_lossy(), None, None, None)
            .expect("register workspace root");

        let file_status =
            workspace_path_status_internal(&state, &workspace_file).expect("workspace file status");
        assert!(file_status.exists);
        assert!(file_status.is_file);
        assert!(!file_status.is_dir);

        let missing_status = workspace_path_status_internal(&state, &workspace_dir.join("missing.md"))
            .expect("missing workspace path status");
        assert!(!missing_status.exists);
        assert!(!missing_status.is_file);
        assert!(!missing_status.is_dir);

        let outside_error = workspace_path_status_internal(&state, &outside_file)
            .expect_err("outside path should be rejected");
        assert!(outside_error.starts_with("Path is outside the allowed workspace roots:"));

        fs::remove_dir_all(workspace_dir).ok();
        fs::remove_dir_all(outside_dir).ok();
    }

    #[test]
    fn workspace_external_path_respects_registered_scope() {
        let workspace_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-external-path-{}",
            uuid::Uuid::new_v4()
        ));
        let outside_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-external-path-outside-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_dir).expect("create workspace dir");
        fs::create_dir_all(&outside_dir).expect("create outside dir");
        let workspace_file = workspace_dir.join("note.md");
        let outside_file = outside_dir.join("note.md");
        fs::write(&workspace_file, "hello").expect("write workspace file");
        fs::write(&outside_file, "outside").expect("write outside file");

        let state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&state, &workspace_dir.to_string_lossy(), None, None, None)
            .expect("register workspace root");

        let resolved = workspace_external_path_internal(&state, &workspace_file)
            .expect("workspace external path should resolve");
        assert!(resolved.ends_with("note.md"));

        let missing = workspace_external_path_internal(&state, &workspace_dir.join("missing.pdf"))
            .expect("missing workspace path should still resolve inside scope");
        assert!(missing.ends_with("missing.pdf"));

        let outside_error = workspace_external_path_internal(&state, &outside_file)
            .expect_err("outside path should be rejected");
        assert!(outside_error.starts_with("Path is outside the allowed workspace roots:"));

        fs::remove_dir_all(workspace_dir).ok();
        fs::remove_dir_all(outside_dir).ok();
    }

    #[test]
    fn workspace_create_dir_and_delete_return_typed_results() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-dir-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let dir_path = temp_dir.join("folder");

        let created = workspace_create_dir_blocking(&dir_path).expect("create workspace dir");
        assert!(created.ok);
        assert_eq!(created.path, dir_path.to_string_lossy().to_string());
        assert_eq!(created.code, None);

        let duplicate = workspace_create_dir_blocking(&dir_path).expect("duplicate folder result");
        assert!(!duplicate.ok);
        assert_eq!(duplicate.code.as_deref(), Some("exists"));

        let deleted = workspace_delete_path_blocking(&dir_path).expect("delete workspace dir");
        assert!(deleted.ok);
        assert!(deleted.is_dir);
        assert_eq!(deleted.path, dir_path.to_string_lossy().to_string());
        assert!(!dir_path.exists());

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn workspace_duplicate_returns_typed_result() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-duplicate-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "hello").expect("write source file");

        let duplicated =
            workspace_duplicate_path_blocking(&file_path).expect("duplicate workspace file");
        assert!(duplicated.ok);
        assert!(!duplicated.is_dir);
        assert_ne!(duplicated.path, file_path.to_string_lossy().to_string());
        assert_eq!(
            fs::read_to_string(&duplicated.path).expect("read duplicated file"),
            "hello"
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn workspace_text_file_read_write_respects_limit() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-text-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("note.md");

        workspace_write_text_file_blocking(&file_path, "hello workspace")
            .expect("write workspace text");
        let content =
            workspace_read_text_file_blocking(&file_path, Some(32)).expect("read workspace text");
        assert_eq!(content, "hello workspace");

        let error =
            workspace_read_text_file_blocking(&file_path, Some(4)).expect_err("limit should fail");
        assert!(error.starts_with("FILE_TOO_LARGE:4:"));

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn workspace_base64_file_read_write_roundtrips_bytes() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-base64-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("artifact.pdf");

        workspace_write_file_base64_blocking(&file_path, "AAECA/8=").expect("write base64");
        let bytes = fs::read(&file_path).expect("read artifact bytes");
        assert_eq!(bytes, vec![0, 1, 2, 3, 255]);

        let encoded = workspace_read_file_base64_blocking(&file_path).expect("read base64");
        assert_eq!(encoded, "AAECA/8=");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn workspace_base64_file_write_rejects_invalid_payload() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-workspace-base64-invalid-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let file_path = temp_dir.join("artifact.pdf");

        let error = workspace_write_file_base64_blocking(&file_path, "not base64 !!!")
            .expect_err("invalid base64 should fail");
        assert!(error.starts_with("Base64 decode error:"));
        assert!(!file_path.exists());

        fs::remove_dir_all(temp_dir).ok();
    }
}
