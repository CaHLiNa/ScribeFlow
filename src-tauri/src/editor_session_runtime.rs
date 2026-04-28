use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const STATE_FILE: &str = "editor-state.json";
const RECENT_FILES_FILE: &str = "editor-recent-files.json";
const STATE_VERSION: u64 = 1;
const RECENT_FILES_VERSION: u64 = 1;
const MAX_RECENT_FILES: usize = 20;
const ROOT_PANE_ID: &str = "pane-root";
const DEFAULT_SPLIT_RATIO: f64 = 0.5;
const MIN_SPLIT_RATIO: f64 = 0.15;
const MAX_SPLIT_RATIO: f64 = 0.85;
const REMOVED_VIRTUAL_TAB_PREFIXES: &[&str] = &["library:", "ref:@"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSessionLoadParams {
    #[serde(default)]
    pub workspace_data_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSessionSaveParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub pane_tree: Value,
    #[serde(default)]
    pub active_pane_id: String,
    #[serde(default)]
    pub legacy_preview_paths: Vec<String>,
    #[serde(default)]
    pub last_context_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileEntry {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub opened_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentFilesFile {
    #[serde(default = "default_recent_files_version")]
    version: u64,
    #[serde(default)]
    recent_files: Vec<RecentFileEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRecentFilesLoadParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub legacy_recent_files: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRecentFilesRecordOpenedParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub recent_files: Value,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRecentFilesRenamePathParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub recent_files: Value,
    #[serde(default)]
    pub old_path: String,
    #[serde(default)]
    pub new_path: String,
}

impl Default for RecentFilesFile {
    fn default() -> Self {
        Self {
            version: RECENT_FILES_VERSION,
            recent_files: Vec::new(),
        }
    }
}

fn default_recent_files_version() -> u64 {
    RECENT_FILES_VERSION
}

fn clamp_ratio(value: f64) -> f64 {
    value.max(MIN_SPLIT_RATIO).min(MAX_SPLIT_RATIO)
}

fn is_preview_path(path: &str) -> bool {
    path.starts_with("preview:")
}

fn preview_source_path_from_path(path: &str) -> String {
    path.strip_prefix("preview:")
        .unwrap_or_default()
        .to_string()
}

fn is_virtual_new_tab(path: &str) -> bool {
    path.starts_with("newtab:")
}

fn is_virtual_draft_tab(path: &str) -> bool {
    path.starts_with("draft:")
}

fn is_removed_virtual_tab_path(path: &str) -> bool {
    REMOVED_VIRTUAL_TAB_PREFIXES
        .iter()
        .any(|prefix| path.starts_with(prefix))
}

fn is_context_candidate_path(path: &str) -> bool {
    !path.is_empty() && !is_virtual_new_tab(path) && !is_preview_path(path)
}

fn make_leaf(id: &str, tabs: Vec<String>, active_tab: Option<String>) -> Value {
    json!({
        "type": "leaf",
        "id": if id.is_empty() { ROOT_PANE_ID } else { id },
        "tabs": tabs,
        "activeTab": active_tab,
    })
}

fn collect_leaves(node: &Value, leaves: &mut Vec<Value>) {
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        leaves.push(node.clone());
        return;
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_leaves(child, leaves);
        }
    }
}

fn collect_all_tabs(node: &Value, tabs: &mut Vec<String>) {
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        for tab in node
            .get("tabs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|tab| tab.as_str().map(|value| value.to_string()))
        {
            tabs.push(tab);
        }
        return;
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_all_tabs(child, tabs);
        }
    }
}

fn find_first_leaf(node: &Value) -> Option<Value> {
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        return Some(node.clone());
    }
    node.get("children")
        .and_then(Value::as_array)
        .and_then(|children| children.iter().find_map(find_first_leaf))
}

fn find_pane(node: &Value, pane_id: &str) -> Option<Value> {
    if node.get("type").and_then(Value::as_str) == Some("leaf")
        && node.get("id").and_then(Value::as_str) == Some(pane_id)
    {
        return Some(node.clone());
    }
    node.get("children")
        .and_then(Value::as_array)
        .and_then(|children| children.iter().find_map(|child| find_pane(child, pane_id)))
}

fn find_context_leaf(node: &Value) -> Option<Value> {
    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        let active_tab = node
            .get("activeTab")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if is_context_candidate_path(active_tab) {
            return Some(node.clone());
        }
    }
    node.get("children")
        .and_then(Value::as_array)
        .and_then(|children| children.iter().find_map(find_context_leaf))
}

fn normalize_legacy_preview_paths(paths: &[String]) -> HashSet<String> {
    paths
        .iter()
        .map(|path| path.trim().to_string())
        .filter(|path| is_preview_path(path))
        .collect()
}

fn is_valid_tab_path(path: &str) -> bool {
    if path.is_empty() || is_removed_virtual_tab_path(path) || is_virtual_draft_tab(path) {
        return false;
    }
    if is_virtual_new_tab(path) {
        return true;
    }

    let target_path = if is_preview_path(path) {
        preview_source_path_from_path(path)
    } else {
        path.to_string()
    };

    !target_path.is_empty() && Path::new(&target_path).exists()
}

fn normalize_tabs_for_save(
    tabs: &[Value],
    preserved_legacy_preview_paths: &HashSet<String>,
) -> Vec<String> {
    tabs.iter()
        .filter_map(Value::as_str)
        .filter(|tab| {
            !is_virtual_draft_tab(tab)
                && !is_removed_virtual_tab_path(tab)
                && (!is_preview_path(tab) || preserved_legacy_preview_paths.contains(*tab))
        })
        .map(|tab| tab.to_string())
        .collect()
}

fn normalize_tabs_for_load(tabs: &[Value]) -> Vec<String> {
    tabs.iter()
        .filter_map(Value::as_str)
        .filter(|tab| is_valid_tab_path(tab))
        .map(|tab| tab.to_string())
        .collect()
}

fn serialize_leaf_for_save(
    node: &Value,
    preserved_legacy_preview_paths: &HashSet<String>,
) -> Option<Value> {
    let tabs = normalize_tabs_for_save(
        &node
            .get("tabs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        preserved_legacy_preview_paths,
    );
    if tabs.is_empty() {
        return None;
    }
    let active_tab = node
        .get("activeTab")
        .and_then(Value::as_str)
        .filter(|active_tab| tabs.iter().any(|tab| tab == active_tab))
        .map(|value| value.to_string())
        .or_else(|| tabs.first().cloned());
    Some(make_leaf(
        node.get("id")
            .and_then(Value::as_str)
            .unwrap_or(ROOT_PANE_ID),
        tabs,
        active_tab,
    ))
}

fn serialize_leaf_for_load(node: &Value) -> Option<Value> {
    let tabs = normalize_tabs_for_load(
        &node
            .get("tabs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );
    if tabs.is_empty() {
        return None;
    }
    let active_tab = node
        .get("activeTab")
        .and_then(Value::as_str)
        .filter(|active_tab| tabs.iter().any(|tab| tab == active_tab))
        .map(|value| value.to_string())
        .or_else(|| tabs.first().cloned());
    Some(make_leaf(
        node.get("id")
            .and_then(Value::as_str)
            .unwrap_or(ROOT_PANE_ID),
        tabs,
        active_tab,
    ))
}

fn serialize_pane_tree_for_save(
    node: &Value,
    preserved_legacy_preview_paths: &HashSet<String>,
) -> Option<Value> {
    if node.is_null() {
        return None;
    }

    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        return serialize_leaf_for_save(node, preserved_legacy_preview_paths);
    }

    if node.get("type").and_then(Value::as_str) == Some("split") {
        let children = node
            .get("children")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|child| {
                serialize_pane_tree_for_save(&child, preserved_legacy_preview_paths)
            })
            .collect::<Vec<_>>();

        if children.len() < 2 {
            return children.into_iter().next();
        }

        return Some(json!({
            "type": "split",
            "direction": "vertical",
            "ratio": clamp_ratio(node.get("ratio").and_then(Value::as_f64).unwrap_or(DEFAULT_SPLIT_RATIO)),
            "children": [children[0].clone(), children[1].clone()],
        }));
    }

    None
}

fn normalize_loaded_pane_tree(node: &Value) -> Value {
    if node.is_null() {
        return make_leaf(ROOT_PANE_ID, Vec::new(), None);
    }

    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        return serialize_leaf_for_load(node)
            .unwrap_or_else(|| make_leaf(ROOT_PANE_ID, Vec::new(), None));
    }

    let mut leaves = Vec::new();
    collect_leaves(node, &mut leaves);
    let normalized_leaves = leaves
        .into_iter()
        .filter_map(|leaf| serialize_leaf_for_load(&leaf))
        .collect::<Vec<_>>();

    if normalized_leaves.is_empty() {
        return make_leaf(ROOT_PANE_ID, Vec::new(), None);
    }
    if normalized_leaves.len() == 1 {
        return normalized_leaves[0].clone();
    }

    make_split(
        normalized_leaves[0].clone(),
        normalized_leaves[1].clone(),
        node.get("ratio")
            .and_then(Value::as_f64)
            .unwrap_or(DEFAULT_SPLIT_RATIO),
    )
}

fn make_split(left: Value, right: Value, ratio: f64) -> Value {
    json!({
        "type": "split",
        "direction": "vertical",
        "ratio": clamp_ratio(ratio),
        "children": [left, right],
    })
}

fn build_persisted_editor_state(
    pane_tree: &Value,
    active_pane_id: &str,
    last_context_path: &str,
    legacy_preview_paths: &[String],
) -> Value {
    let preserved = normalize_legacy_preview_paths(legacy_preview_paths);
    json!({
        "version": STATE_VERSION,
        "paneTree": serialize_pane_tree_for_save(pane_tree, &preserved),
        "activePaneId": active_pane_id,
        "lastContextPath": last_context_path,
    })
}

fn normalize_loaded_editor_state(state: &Value) -> Value {
    let pane_tree =
        normalize_loaded_pane_tree(&state.get("paneTree").cloned().unwrap_or(Value::Null));
    let mut all_tabs = Vec::new();
    collect_all_tabs(&pane_tree, &mut all_tabs);
    let open_tabs = all_tabs.iter().cloned().collect::<HashSet<_>>();
    let legacy_preview_paths = all_tabs
        .iter()
        .filter(|tab| is_preview_path(tab))
        .cloned()
        .collect::<Vec<_>>();

    let active_pane_id = state
        .get("activePaneId")
        .and_then(Value::as_str)
        .filter(|pane_id| find_pane(&pane_tree, pane_id).is_some())
        .map(|value| value.to_string())
        .or_else(|| {
            find_first_leaf(&pane_tree).and_then(|leaf| {
                leaf.get("id")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            })
        })
        .unwrap_or_else(|| ROOT_PANE_ID.to_string());

    let active_pane = find_pane(&pane_tree, &active_pane_id);
    let context_leaf = active_pane
        .as_ref()
        .filter(|leaf| {
            is_context_candidate_path(
                leaf.get("activeTab")
                    .and_then(Value::as_str)
                    .unwrap_or_default(),
            )
        })
        .cloned()
        .or_else(|| find_context_leaf(&pane_tree));

    let last_context_path = state
        .get("lastContextPath")
        .and_then(Value::as_str)
        .filter(|path| is_context_candidate_path(path) && open_tabs.contains(*path))
        .map(|value| value.to_string())
        .or_else(|| {
            context_leaf.as_ref().and_then(|leaf| {
                leaf.get("activeTab")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            })
        })
        .unwrap_or_default();

    json!({
        "version": STATE_VERSION,
        "paneTree": pane_tree,
        "activePaneId": active_pane_id,
        "legacyPreviewPaths": legacy_preview_paths,
        "lastContextPath": last_context_path,
    })
}

fn state_file_path(workspace_data_dir: &str) -> String {
    format!(
        "{}/{}",
        workspace_data_dir.trim_end_matches('/'),
        STATE_FILE
    )
}

fn recent_files_path(workspace_data_dir: &str) -> String {
    format!(
        "{}/{}",
        workspace_data_dir.trim_end_matches('/'),
        RECENT_FILES_FILE
    )
}

fn normalize_recent_files(recent_files: Vec<RecentFileEntry>) -> Vec<RecentFileEntry> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for entry in recent_files {
        let path = entry.path.trim().to_string();
        if path.is_empty() || !seen.insert(path.clone()) {
            continue;
        }
        normalized.push(RecentFileEntry {
            path,
            opened_at: entry.opened_at,
        });
        if normalized.len() >= MAX_RECENT_FILES {
            break;
        }
    }

    normalized
}

fn recent_file_entries_from_value(value: &Value) -> Vec<RecentFileEntry> {
    value
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let path = entry
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            if path.is_empty() {
                return None;
            }
            let opened_at = entry
                .get("openedAt")
                .or_else(|| entry.get("opened_at"))
                .and_then(Value::as_u64)
                .or_else(|| {
                    entry
                        .get("openedAt")
                        .or_else(|| entry.get("opened_at"))
                        .and_then(Value::as_f64)
                        .filter(|value| value.is_finite() && *value > 0.0)
                        .map(|value| value as u64)
                })
                .unwrap_or(0);
            Some(RecentFileEntry { path, opened_at })
        })
        .collect()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn record_recent_file_opened(recent_files: Value, path: &str) -> Vec<RecentFileEntry> {
    let normalized_path = path.trim();
    if normalized_path.is_empty()
        || is_virtual_new_tab(normalized_path)
        || is_preview_path(normalized_path)
    {
        return normalize_recent_files(recent_file_entries_from_value(&recent_files));
    }

    let mut entries = recent_file_entries_from_value(&recent_files)
        .into_iter()
        .filter(|entry| entry.path != normalized_path)
        .collect::<Vec<_>>();
    entries.insert(
        0,
        RecentFileEntry {
            path: normalized_path.to_string(),
            opened_at: now_millis(),
        },
    );
    normalize_recent_files(entries)
}

fn rename_recent_file_path(
    recent_files: Value,
    old_path: &str,
    new_path: &str,
) -> Vec<RecentFileEntry> {
    let old_path = old_path.trim();
    let new_path = new_path.trim();
    if old_path.is_empty() || new_path.is_empty() {
        return normalize_recent_files(recent_file_entries_from_value(&recent_files));
    }

    let entries = recent_file_entries_from_value(&recent_files)
        .into_iter()
        .map(|entry| {
            if entry.path == old_path {
                RecentFileEntry {
                    path: new_path.to_string(),
                    opened_at: entry.opened_at,
                }
            } else {
                entry
            }
        })
        .collect();
    normalize_recent_files(entries)
}

fn read_recent_files(workspace_data_dir: &str) -> Result<Option<Vec<RecentFileEntry>>, String> {
    let file_path = recent_files_path(workspace_data_dir);
    if !Path::new(&file_path).exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&file_path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<RecentFilesFile>(&content) {
        return Ok(Some(normalize_recent_files(parsed.recent_files)));
    }

    let parsed = serde_json::from_str::<Vec<RecentFileEntry>>(&content)
        .map_err(|error| format!("Invalid editor recent files: {error}"))?;
    Ok(Some(normalize_recent_files(parsed)))
}

fn write_recent_files(
    workspace_data_dir: &str,
    recent_files: &[RecentFileEntry],
) -> Result<Vec<RecentFileEntry>, String> {
    let normalized = normalize_recent_files(recent_files.to_vec());
    let file_path = recent_files_path(workspace_data_dir);
    if let Some(parent) = Path::new(&file_path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = RecentFilesFile {
        version: RECENT_FILES_VERSION,
        recent_files: normalized.clone(),
    };
    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize editor recent files: {error}"))?;
    fs::write(&file_path, serialized).map_err(|error| error.to_string())?;
    Ok(normalized)
}

#[tauri::command]
pub async fn editor_session_save(params: EditorSessionSaveParams) -> Result<Value, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    if workspace_data_dir.is_empty() {
        return Ok(Value::Null);
    }

    let state = build_persisted_editor_state(
        &params.pane_tree,
        &params.active_pane_id,
        &params.last_context_path,
        &params.legacy_preview_paths,
    );
    let file_path = state_file_path(workspace_data_dir);
    let serialized = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Failed to serialize editor session: {error}"))?;
    fs::write(&file_path, serialized).map_err(|error| error.to_string())?;
    Ok(normalize_loaded_editor_state(&state))
}

#[tauri::command]
pub async fn editor_session_load(params: EditorSessionLoadParams) -> Result<Value, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    if workspace_data_dir.is_empty() {
        return Ok(Value::Null);
    }

    let file_path = state_file_path(workspace_data_dir);
    if !Path::new(&file_path).exists() {
        return Ok(Value::Null);
    }

    let content = fs::read_to_string(&file_path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|error| format!("Invalid editor session: {error}"))?;
    if parsed.get("version").and_then(Value::as_u64) != Some(STATE_VERSION) {
        return Ok(Value::Null);
    }

    Ok(normalize_loaded_editor_state(&parsed))
}

#[tauri::command]
pub async fn editor_recent_files_load(
    params: EditorRecentFilesLoadParams,
) -> Result<Vec<RecentFileEntry>, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    if workspace_data_dir.is_empty() {
        return Ok(Vec::new());
    }

    if let Some(current) = read_recent_files(workspace_data_dir)? {
        return Ok(current);
    }

    let legacy_recent_files = recent_file_entries_from_value(&params.legacy_recent_files);
    write_recent_files(workspace_data_dir, &legacy_recent_files)
}

#[tauri::command]
pub async fn editor_recent_files_record_opened(
    params: EditorRecentFilesRecordOpenedParams,
) -> Result<Vec<RecentFileEntry>, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    let recent_files = record_recent_file_opened(params.recent_files, &params.path);
    if workspace_data_dir.is_empty() {
        return Ok(recent_files);
    }
    write_recent_files(workspace_data_dir, &recent_files)
}

#[tauri::command]
pub async fn editor_recent_files_rename_path(
    params: EditorRecentFilesRenamePathParams,
) -> Result<Vec<RecentFileEntry>, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    let recent_files =
        rename_recent_file_path(params.recent_files, &params.old_path, &params.new_path);
    if workspace_data_dir.is_empty() {
        return Ok(recent_files);
    }
    write_recent_files(workspace_data_dir, &recent_files)
}

#[cfg(test)]
mod tests {
    use super::{
        build_persisted_editor_state, normalize_loaded_editor_state, normalize_recent_files,
        recent_file_entries_from_value, record_recent_file_opened, rename_recent_file_path,
        RecentFileEntry,
    };
    use serde_json::json;
    use std::fs;

    #[test]
    fn save_state_filters_removed_virtual_tabs() {
        let state = build_persisted_editor_state(
            &json!({
                "type": "leaf",
                "id": "pane-root",
                "tabs": ["draft:1", "newtab:1", "preview:/tmp/a.md", "/tmp/a.md", "library:foo"],
                "activeTab": "/tmp/a.md"
            }),
            "pane-root",
            "/tmp/a.md",
            &["preview:/tmp/a.md".to_string()],
        );

        let tabs = state["paneTree"]["tabs"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert_eq!(tabs.len(), 3);
    }

    #[test]
    fn save_state_drops_preview_tabs_without_legacy_preservation() {
        let state = build_persisted_editor_state(
            &json!({
                "type": "leaf",
                "id": "pane-root",
                "tabs": ["preview:/tmp/a.md", "/tmp/a.md"],
                "activeTab": "/tmp/a.md"
            }),
            "pane-root",
            "/tmp/a.md",
            &[],
        );

        let tabs = state["paneTree"]["tabs"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert_eq!(tabs, vec![json!("/tmp/a.md")]);
    }

    #[test]
    fn load_state_restores_active_pane_and_context() {
        let file_path = std::env::temp_dir().join("scribeflow-editor-session-test.md");
        fs::write(&file_path, "# test").expect("write temp file");
        let file_path = file_path.to_string_lossy().to_string();

        let state = normalize_loaded_editor_state(&json!({
            "version": 1,
            "activePaneId": "missing-pane",
            "paneTree": {
                "type": "split",
                "ratio": 0.8,
                "children": [
                    { "type": "leaf", "id": "pane-left", "tabs": ["newtab:1"], "activeTab": "newtab:1" },
                    { "type": "leaf", "id": "pane-right", "tabs": [file_path], "activeTab": file_path }
                ]
            }
        }));

        assert_eq!(state["activePaneId"].as_str(), Some("pane-left"));
        assert_eq!(state["lastContextPath"].as_str(), Some(file_path.as_str()));
    }

    #[test]
    fn load_state_keeps_legacy_preview_paths_out_of_context() {
        let file_path = std::env::temp_dir().join("scribeflow-editor-session-preview.md");
        fs::write(&file_path, "# preview").expect("write temp file");
        let file_path = file_path.to_string_lossy().to_string();
        let preview_path = format!("preview:{file_path}");

        let state = normalize_loaded_editor_state(&json!({
            "version": 1,
            "activePaneId": "pane-root",
            "paneTree": {
                "type": "leaf",
                "id": "pane-root",
                "tabs": [preview_path, file_path],
                "activeTab": preview_path
            },
            "lastContextPath": preview_path
        }));

        assert_eq!(
            state["legacyPreviewPaths"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            vec![json!(format!("preview:{file_path}"))]
        );
        assert_eq!(state["lastContextPath"].as_str(), Some(""));
    }

    #[test]
    fn recent_files_are_deduped_and_limited() {
        let mut entries = vec![
            RecentFileEntry {
                path: "/tmp/a.md".to_string(),
                opened_at: 2,
            },
            RecentFileEntry {
                path: "/tmp/a.md".to_string(),
                opened_at: 1,
            },
        ];
        for index in 0..25 {
            entries.push(RecentFileEntry {
                path: format!("/tmp/{index}.md"),
                opened_at: index,
            });
        }

        let normalized = normalize_recent_files(entries);
        assert_eq!(normalized.len(), 20);
        assert_eq!(normalized[0].path, "/tmp/a.md");
        assert_eq!(normalized[0].opened_at, 2);
    }

    #[test]
    fn recent_file_open_replaces_existing_entry_and_moves_it_to_front() {
        let result = record_recent_file_opened(
            json!([
                { "path": "/tmp/a.md", "openedAt": 1 },
                { "path": "/tmp/b.md", "openedAt": 9 }
            ]),
            "/tmp/a.md",
        );

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].path, "/tmp/a.md");
        assert!(result[0].opened_at >= 1);
        assert_eq!(result[1].path, "/tmp/b.md");
    }

    #[test]
    fn recent_file_open_ignores_preview_and_newtab_paths() {
        let recent_files = json!([
            { "path": "/tmp/a.md", "openedAt": 2 },
            { "path": "/tmp/b.md", "openedAt": 1 }
        ]);

        let preview_result = record_recent_file_opened(recent_files.clone(), "preview:/tmp/c.md");
        let newtab_result = record_recent_file_opened(recent_files, "newtab:1");

        assert_eq!(preview_result.len(), 2);
        assert_eq!(preview_result[0].path, "/tmp/a.md");
        assert_eq!(newtab_result.len(), 2);
        assert_eq!(newtab_result[0].path, "/tmp/a.md");
    }

    #[test]
    fn recent_file_rename_updates_path_and_preserves_order() {
        let result = rename_recent_file_path(
            json!([
                { "path": "/tmp/a.md", "openedAt": 3 },
                { "path": "/tmp/b.md", "openedAt": 2 }
            ]),
            "/tmp/b.md",
            "/tmp/c.md",
        );

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].path, "/tmp/a.md");
        assert_eq!(result[1].path, "/tmp/c.md");
        assert_eq!(result[1].opened_at, 2);
    }

    #[test]
    fn recent_file_entries_parser_accepts_camel_and_snake_case_timestamps() {
        let result = recent_file_entries_from_value(&json!([
            { "path": "/tmp/a.md", "openedAt": 7 },
            { "path": "/tmp/b.md", "opened_at": 4.0 }
        ]));

        assert_eq!(
            result,
            vec![
                RecentFileEntry {
                    path: "/tmp/a.md".to_string(),
                    opened_at: 7,
                },
                RecentFileEntry {
                    path: "/tmp/b.md".to_string(),
                    opened_at: 4,
                },
            ]
        );
    }
}
