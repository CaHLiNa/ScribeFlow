use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

const STATE_FILE: &str = "editor-state.json";
const RECENT_FILES_FILE: &str = "editor-recent-files.json";
const STATE_VERSION: u64 = 1;
const RECENT_FILES_VERSION: u64 = 1;
const MAX_RECENT_FILES: usize = 20;
const ROOT_PANE_ID: &str = "pane-root";
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
    pub document_dock_tabs: Vec<String>,
    #[serde(default)]
    pub active_document_dock_tab: String,
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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorRecentFilesSaveParams {
    #[serde(default)]
    pub workspace_data_dir: String,
    #[serde(default)]
    pub recent_files: Vec<RecentFileEntry>,
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

fn merge_leaves_into_root(leaves: Vec<Value>) -> Value {
    let mut seen = HashSet::new();
    let mut tabs = Vec::new();
    let mut active_tab = None;

    for leaf in leaves {
        let leaf_tabs = leaf
            .get("tabs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|tab| tab.as_str().map(|value| value.to_string()))
            .collect::<Vec<_>>();

        for tab in leaf_tabs {
            if seen.insert(tab.clone()) {
                tabs.push(tab);
            }
        }

        if let Some(candidate) = leaf.get("activeTab").and_then(Value::as_str) {
            if active_tab.is_none()
                || (!is_context_candidate_path(active_tab.as_deref().unwrap_or_default())
                    && is_context_candidate_path(candidate))
            {
                active_tab = Some(candidate.to_string());
            }
        }
    }

    let resolved_active_tab = active_tab
        .filter(|tab| tabs.iter().any(|candidate| candidate == tab))
        .or_else(|| tabs.first().cloned());

    make_leaf(ROOT_PANE_ID, tabs, resolved_active_tab)
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

fn normalize_tabs_for_save(tabs: &[Value]) -> Vec<String> {
    tabs.iter()
        .filter_map(Value::as_str)
        .filter(|tab| {
            !is_virtual_draft_tab(tab)
                && !is_removed_virtual_tab_path(tab)
                && !is_preview_path(tab)
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

fn is_valid_document_dock_tab_for_save(path: &str) -> bool {
    !path.is_empty()
        && !is_virtual_new_tab(path)
        && !is_preview_path(path)
        && !is_virtual_draft_tab(path)
        && !is_removed_virtual_tab_path(path)
}

fn normalize_document_dock_tabs_for_save(tabs: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for tab in tabs {
        let path = tab.trim().to_string();
        if !is_valid_document_dock_tab_for_save(&path) || !seen.insert(path.clone()) {
            continue;
        }
        normalized.push(path);
    }
    normalized
}

fn normalize_document_dock_tabs_for_load(tabs: &[Value]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for tab in tabs.iter().filter_map(Value::as_str) {
        if !is_valid_document_dock_tab_for_save(tab) || !is_valid_tab_path(tab) {
            continue;
        }
        let path = tab.to_string();
        if seen.insert(path.clone()) {
            normalized.push(path);
        }
    }
    normalized
}

fn serialize_leaf_for_save(node: &Value) -> Option<Value> {
    let tabs = normalize_tabs_for_save(
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

fn serialize_pane_tree_for_save(node: &Value) -> Option<Value> {
    if node.is_null() {
        return None;
    }

    if node.get("type").and_then(Value::as_str) == Some("leaf") {
        return serialize_leaf_for_save(node);
    }

    if node.get("type").and_then(Value::as_str) == Some("split") {
        let children = node
            .get("children")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|child| serialize_pane_tree_for_save(&child))
            .collect::<Vec<_>>();

        if children.is_empty() {
            return None;
        }

        return Some(merge_leaves_into_root(children));
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

    merge_leaves_into_root(normalized_leaves)
}

fn build_persisted_editor_state(
    pane_tree: &Value,
    active_pane_id: &str,
    last_context_path: &str,
    document_dock_tabs: &[String],
    active_document_dock_tab: &str,
) -> Value {
    let normalized_document_dock_tabs = normalize_document_dock_tabs_for_save(document_dock_tabs);
    let normalized_active_document_dock_tab = if normalized_document_dock_tabs
        .iter()
        .any(|tab| tab == active_document_dock_tab)
    {
        active_document_dock_tab.to_string()
    } else {
        normalized_document_dock_tabs
            .first()
            .cloned()
            .unwrap_or_default()
    };
    json!({
        "version": STATE_VERSION,
        "paneTree": serialize_pane_tree_for_save(pane_tree),
        "activePaneId": active_pane_id,
        "documentDockTabs": normalized_document_dock_tabs,
        "activeDocumentDockTab": normalized_active_document_dock_tab,
        "lastContextPath": last_context_path,
    })
}

fn normalize_loaded_editor_state(state: &Value) -> Value {
    let pane_tree =
        normalize_loaded_pane_tree(&state.get("paneTree").cloned().unwrap_or(Value::Null));
    let mut all_tabs = Vec::new();
    collect_all_tabs(&pane_tree, &mut all_tabs);
    let open_tabs = all_tabs.iter().cloned().collect::<HashSet<_>>();
    let document_dock_tabs = normalize_document_dock_tabs_for_load(
        &state
            .get("documentDockTabs")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    );
    let document_dock_tab_set = document_dock_tabs.iter().cloned().collect::<HashSet<_>>();
    let active_document_dock_tab = state
        .get("activeDocumentDockTab")
        .and_then(Value::as_str)
        .filter(|path| document_dock_tab_set.contains(*path))
        .map(|value| value.to_string())
        .or_else(|| document_dock_tabs.first().cloned())
        .unwrap_or_default();
    let context_candidates = open_tabs
        .union(&document_dock_tab_set)
        .cloned()
        .collect::<HashSet<_>>();

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
        .filter(|path| is_context_candidate_path(path) && context_candidates.contains(*path))
        .map(|value| value.to_string())
        .or_else(|| {
            if is_context_candidate_path(&active_document_dock_tab) {
                Some(active_document_dock_tab.clone())
            } else {
                None
            }
        })
        .or_else(|| {
            context_leaf.as_ref().and_then(|leaf| {
                leaf.get("activeTab")
                    .and_then(Value::as_str)
                    .map(|value| value.to_string())
            })
        })
        .or_else(|| {
            all_tabs
                .iter()
                .find(|path| is_context_candidate_path(path))
                .cloned()
        })
        .unwrap_or_default();

    json!({
        "version": STATE_VERSION,
        "paneTree": pane_tree,
        "activePaneId": active_pane_id,
        "documentDockTabs": document_dock_tabs,
        "activeDocumentDockTab": active_document_dock_tab,
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
        &params.document_dock_tabs,
        &params.active_document_dock_tab,
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

    Ok(Vec::new())
}

#[tauri::command]
pub async fn editor_recent_files_save(
    params: EditorRecentFilesSaveParams,
) -> Result<Vec<RecentFileEntry>, String> {
    let workspace_data_dir = params.workspace_data_dir.trim();
    if workspace_data_dir.is_empty() {
        return Ok(Vec::new());
    }
    write_recent_files(workspace_data_dir, &params.recent_files)
}

#[cfg(test)]
mod tests {
    use super::{
        build_persisted_editor_state, normalize_loaded_editor_state, normalize_recent_files,
        RecentFileEntry,
    };
    use serde_json::json;
    use std::fs;

    #[test]
    fn save_state_filters_removed_and_preview_tabs() {
        let state = build_persisted_editor_state(
            &json!({
                "type": "leaf",
                "id": "pane-root",
                "tabs": ["draft:1", "newtab:1", "preview:/tmp/a.md", "/tmp/a.md", "library:foo"],
                "activeTab": "/tmp/a.md"
            }),
            "pane-root",
            "/tmp/a.md",
            &[],
            "",
        );

        let tabs = state["paneTree"]["tabs"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        assert_eq!(tabs, vec![json!("newtab:1"), json!("/tmp/a.md")]);
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

        assert_eq!(state["activePaneId"].as_str(), Some("pane-root"));
        assert_eq!(state["lastContextPath"].as_str(), Some(file_path.as_str()));
    }

    #[test]
    fn load_state_keeps_preview_paths_out_of_context() {
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

        assert_eq!(state["lastContextPath"].as_str(), Some(file_path.as_str()));
    }

    #[test]
    fn save_and_load_state_preserves_document_dock_tabs() {
        let file_path = std::env::temp_dir().join("scribeflow-editor-session-dock.md");
        fs::write(&file_path, "# dock").expect("write temp file");
        let file_path = file_path.to_string_lossy().to_string();

        let saved = build_persisted_editor_state(
            &json!({
                "type": "leaf",
                "id": "pane-root",
                "tabs": ["newtab:1"],
                "activeTab": "newtab:1"
            }),
            "pane-root",
            &file_path,
            &[file_path.clone(), "preview:/tmp/ignored.md".to_string()],
            &file_path,
        );
        let state = normalize_loaded_editor_state(&saved);

        assert_eq!(
            state["documentDockTabs"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
            vec![json!(file_path.clone())]
        );
        assert_eq!(
            state["activeDocumentDockTab"].as_str(),
            Some(file_path.as_str())
        );
        assert_eq!(state["lastContextPath"].as_str(), Some(file_path.as_str()));
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
}
