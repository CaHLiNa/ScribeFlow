use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use objc2::AnyThread;
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::Bool;
#[cfg(target_os = "macos")]
use objc2_foundation::{
    NSData, NSDataBase64DecodingOptions, NSDataBase64EncodingOptions, NSError, NSString, NSURL,
    NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions,
};

#[derive(Default)]
pub struct WorkspaceAccessState {
    #[cfg(target_os = "macos")]
    pub active_urls: Mutex<HashMap<String, Retained<NSURL>>>,
    #[cfg(not(target_os = "macos"))]
    pub active_urls: Mutex<HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct ActivatedWorkspaceBookmark {
    pub path: String,
    pub bookmark: Option<String>,
}

#[cfg(target_os = "macos")]
fn normalize_workspace_path(path: &str) -> String {
    let trimmed = path.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(target_os = "macos")]
fn ns_error_to_string(error: &NSError) -> String {
    error.localizedDescription().to_string()
}

#[cfg(target_os = "macos")]
fn workspace_url_from_path(path: &str) -> Result<Retained<NSURL>, String> {
    NSURL::from_directory_path(path)
        .ok_or_else(|| format!("Invalid workspace path: {}", path))
}

#[cfg(target_os = "macos")]
fn create_bookmark_for_url(url: &NSURL) -> Result<String, String> {
    let bookmark = url
        .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
            NSURLBookmarkCreationOptions::WithSecurityScope,
            None,
            None,
        )
        .map_err(|error| ns_error_to_string(&error))?;

    Ok(bookmark
        .base64EncodedStringWithOptions(NSDataBase64EncodingOptions(0))
        .to_string())
}

#[cfg(target_os = "macos")]
fn bookmark_data_from_base64(bookmark: &str) -> Result<Retained<NSData>, String> {
    let encoded = NSString::from_str(bookmark);
    NSData::initWithBase64EncodedString_options(
        NSData::alloc(),
        &encoded,
        NSDataBase64DecodingOptions(0),
    )
    .ok_or_else(|| "Invalid workspace bookmark".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_create_workspace_bookmark(path: String) -> Result<String, String> {
    let url = workspace_url_from_path(&path)?;
    create_bookmark_for_url(&url)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_create_workspace_bookmark(_path: String) -> Result<String, String> {
    Err("Security-scoped bookmarks are only available on macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_activate_workspace_bookmark(
    bookmark: String,
    state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<ActivatedWorkspaceBookmark, String> {
    let bookmark_data = bookmark_data_from_base64(&bookmark)?;
    let mut is_stale = Bool::NO;
    let url = unsafe {
        NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
            &bookmark_data,
            NSURLBookmarkResolutionOptions::WithSecurityScope
                | NSURLBookmarkResolutionOptions::WithoutUI,
            None,
            &mut is_stale,
        )
    }
    .map_err(|error| ns_error_to_string(&error))?;

    let path = url
        .to_file_path()
        .ok_or_else(|| "Failed to resolve workspace path from bookmark".to_string())?;
    let normalized_path = normalize_workspace_path(&path.to_string_lossy());

    if !unsafe { url.startAccessingSecurityScopedResource() } {
        return Err(format!(
            "Failed to access workspace permission for {}",
            normalized_path
        ));
    }

    let refreshed_bookmark = if is_stale.as_bool() {
        Some(create_bookmark_for_url(&url)?)
    } else {
        None
    };

    let mut active_urls = state.active_urls.lock().unwrap();
    if let Some(previous_url) = active_urls.remove(&normalized_path) {
        unsafe { previous_url.stopAccessingSecurityScopedResource() };
    }
    active_urls.insert(normalized_path.clone(), url);

    Ok(ActivatedWorkspaceBookmark {
        path: normalized_path,
        bookmark: refreshed_bookmark,
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_activate_workspace_bookmark(
    _bookmark: String,
    _state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<ActivatedWorkspaceBookmark, String> {
    Err("Security-scoped bookmarks are only available on macOS".to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_release_workspace_access(
    path: String,
    state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<(), String> {
    let normalized_path = normalize_workspace_path(&path);
    let mut active_urls = state.active_urls.lock().unwrap();
    if let Some(url) = active_urls.remove(&normalized_path) {
        unsafe { url.stopAccessingSecurityScopedResource() };
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_release_workspace_access(
    _path: String,
    _state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<(), String> {
    Ok(())
}
