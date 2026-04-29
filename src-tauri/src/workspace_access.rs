use crate::app_dirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const WORKSPACE_BOOKMARKS_VERSION: u32 = 1;

#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::Bool;
#[cfg(target_os = "macos")]
use objc2::AnyThread;
#[cfg(target_os = "macos")]
use objc2_foundation::{
    NSData, NSDataBase64DecodingOptions, NSDataBase64EncodingOptions, NSError, NSString,
    NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedWorkspaceBookmark {
    pub path: String,
    pub bookmark: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBookmarkCaptureParams {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBookmarkActivateParams {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBookmarkRemoveParams {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceBookmarkFile {
    #[serde(default = "default_workspace_bookmarks_version")]
    version: u32,
    #[serde(default)]
    bookmarks: HashMap<String, String>,
}

impl Default for WorkspaceBookmarkFile {
    fn default() -> Self {
        Self {
            version: WORKSPACE_BOOKMARKS_VERSION,
            bookmarks: HashMap::new(),
        }
    }
}

fn default_workspace_bookmarks_version() -> u32 {
    WORKSPACE_BOOKMARKS_VERSION
}

fn normalize_workspace_path(path: &str) -> String {
    let trimmed = path.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_bookmark_map(bookmarks: HashMap<String, String>) -> HashMap<String, String> {
    let mut normalized = HashMap::new();
    for (path, bookmark) in bookmarks {
        let normalized_path = normalize_workspace_path(&path);
        let normalized_bookmark = bookmark.trim().to_string();
        if !normalized_bookmark.is_empty() {
            normalized.insert(normalized_path, normalized_bookmark);
        }
    }
    normalized
}

fn workspace_bookmarks_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?.join("workspace-bookmarks.json"))
}

fn read_workspace_bookmarks() -> Result<WorkspaceBookmarkFile, String> {
    let path = workspace_bookmarks_path()?;
    if !path.exists() {
        return Ok(WorkspaceBookmarkFile::default());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<WorkspaceBookmarkFile>(&content)
        .map_err(|error| format!("Failed to parse workspace bookmarks: {error}"))?;
    Ok(WorkspaceBookmarkFile {
        version: WORKSPACE_BOOKMARKS_VERSION,
        bookmarks: normalize_bookmark_map(parsed.bookmarks),
    })
}

fn write_workspace_bookmarks(bookmarks: &WorkspaceBookmarkFile) -> Result<(), String> {
    let path = workspace_bookmarks_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = WorkspaceBookmarkFile {
        version: WORKSPACE_BOOKMARKS_VERSION,
        bookmarks: normalize_bookmark_map(bookmarks.bookmarks.clone()),
    };
    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace bookmarks: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn get_workspace_bookmark(path: &str) -> Result<Option<String>, String> {
    let bookmarks = read_workspace_bookmarks()?;
    Ok(bookmarks
        .bookmarks
        .get(&normalize_workspace_path(path))
        .cloned())
}

fn move_workspace_bookmark(
    old_path: &str,
    new_path: &str,
    fallback_bookmark: &str,
) -> Result<(), String> {
    let mut bookmarks = read_workspace_bookmarks()?;
    let old_key = normalize_workspace_path(old_path);
    let new_key = normalize_workspace_path(new_path);
    let bookmark = bookmarks
        .bookmarks
        .remove(&old_key)
        .unwrap_or_else(|| fallback_bookmark.trim().to_string());
    if !bookmark.is_empty() {
        bookmarks.bookmarks.insert(new_key, bookmark);
    }
    write_workspace_bookmarks(&bookmarks)
}

#[cfg(target_os = "macos")]
fn ns_error_to_string(error: &NSError) -> String {
    error.localizedDescription().to_string()
}

#[cfg(target_os = "macos")]
fn workspace_url_from_path(path: &str) -> Result<Retained<NSURL>, String> {
    NSURL::from_directory_path(path).ok_or_else(|| format!("Invalid workspace path: {}", path))
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
pub fn macos_capture_workspace_bookmark(
    params: WorkspaceBookmarkCaptureParams,
) -> Result<CapturedWorkspaceBookmark, String> {
    let normalized_path = normalize_workspace_path(&params.path);
    let mut bookmarks = read_workspace_bookmarks()?;
    let url = workspace_url_from_path(&normalized_path)?;
    let bookmark = create_bookmark_for_url(&url)?;
    bookmarks
        .bookmarks
        .insert(normalized_path.clone(), bookmark.clone());
    write_workspace_bookmarks(&bookmarks)?;
    Ok(CapturedWorkspaceBookmark {
        path: normalized_path,
        bookmark,
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_capture_workspace_bookmark(
    params: WorkspaceBookmarkCaptureParams,
) -> Result<CapturedWorkspaceBookmark, String> {
    Err(format!(
        "Security-scoped bookmarks are only available on macOS: {}",
        normalize_workspace_path(&params.path)
    ))
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
pub fn macos_activate_workspace_bookmark_for_path(
    params: WorkspaceBookmarkActivateParams,
    state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<ActivatedWorkspaceBookmark, String> {
    let normalized_path = normalize_workspace_path(&params.path);
    let Some(bookmark) = get_workspace_bookmark(&normalized_path)? else {
        return Ok(ActivatedWorkspaceBookmark {
            path: normalized_path,
            bookmark: None,
        });
    };

    let activated = macos_activate_workspace_bookmark(bookmark.clone(), state)?;
    let refreshed_bookmark = activated.bookmark.clone().unwrap_or(bookmark);
    move_workspace_bookmark(&normalized_path, &activated.path, &refreshed_bookmark)?;
    Ok(activated)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_activate_workspace_bookmark_for_path(
    params: WorkspaceBookmarkActivateParams,
    _state: tauri::State<'_, WorkspaceAccessState>,
) -> Result<ActivatedWorkspaceBookmark, String> {
    Ok(ActivatedWorkspaceBookmark {
        path: normalize_workspace_path(&params.path),
        bookmark: None,
    })
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

#[tauri::command]
pub fn workspace_bookmark_remove(params: WorkspaceBookmarkRemoveParams) -> Result<(), String> {
    let mut bookmarks = read_workspace_bookmarks()?;
    bookmarks
        .bookmarks
        .remove(&normalize_workspace_path(&params.path));
    write_workspace_bookmarks(&bookmarks)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_bookmark_map, normalize_workspace_path, WorkspaceBookmarkFile,
        WORKSPACE_BOOKMARKS_VERSION,
    };
    use std::collections::HashMap;

    #[test]
    fn normalizes_workspace_bookmark_paths_and_values() {
        let normalized = normalize_bookmark_map(HashMap::from([
            ("/tmp/demo/".to_string(), " bookmark ".to_string()),
            ("".to_string(), "".to_string()),
        ]));

        assert_eq!(normalized.get("/tmp/demo"), Some(&"bookmark".to_string()));
        assert!(!normalized.contains_key("/"));
        assert_eq!(normalize_workspace_path(""), "/");
    }

    #[test]
    fn workspace_bookmark_file_defaults_to_current_version() {
        let file = WorkspaceBookmarkFile::default();
        assert_eq!(file.version, WORKSPACE_BOOKMARKS_VERSION);
        assert!(file.bookmarks.is_empty());
    }
}
