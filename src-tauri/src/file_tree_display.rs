use crate::path_utils::basename_path;
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreePreferences {
    pub show_hidden: Option<bool>,
    pub sort_mode: Option<String>,
    pub fold_directories: Option<bool>,
}

fn normalized_entry_name(entry: &Value) -> String {
    entry
        .get("display_name")
        .or_else(|| entry.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn is_hidden_entry(entry: &Value) -> bool {
    normalized_entry_name(entry).starts_with('.')
}

fn sort_entries(entries: &mut Vec<Value>, sort_mode: &str) {
    entries.sort_by(|left, right| {
        let left_dir = left.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        let right_dir = right.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        if left_dir != right_dir {
            return if left_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }

        if sort_mode == "modified" && !left_dir && !right_dir {
            let left_mod = left.get("modified").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let right_mod = right.get("modified").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if left_mod != right_mod {
                return right_mod.partial_cmp(&left_mod).unwrap_or(std::cmp::Ordering::Equal);
            }
        }

        let left_name = normalized_entry_name(left).to_lowercase();
        let right_name = normalized_entry_name(right).to_lowercase();
        left_name.cmp(&right_name)
    });
}

fn fold_single_child_directory(entry: &Value) -> Value {
    let is_dir = entry.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
    if !is_dir {
        return entry.clone();
    }

    let _children = match entry.get("children").and_then(|v| v.as_array()) {
        Some(c) => c,
        None => return entry.clone(),
    };

    let mut segments: Vec<String> = vec![entry
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()];

    let mut current = entry.clone();

    loop {
        let kids = match current.get("children").and_then(|v| v.as_array()) {
            Some(c) if c.len() == 1 => c,
            _ => break,
        };
        let child = &kids[0];
        let child_is_dir = child.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        if !child_is_dir {
            break;
        }
        current = child.clone();
        segments.push(
            current
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string(),
        );
    }

    let mut result = current.clone();
    if let Some(obj) = result.as_object_mut() {
        obj.insert(
            "display_name".to_string(),
            Value::String(segments.join("/")),
        );
    }
    result
}

fn apply_preferences_recursive(entries: &[Value], preferences: &FileTreePreferences) -> Vec<Value> {
    let show_hidden = preferences.show_hidden.unwrap_or(true);
    let sort_mode = preferences.sort_mode.as_deref().unwrap_or("name");
    let fold = preferences.fold_directories.unwrap_or(false);

    let mut result: Vec<Value> = entries
        .iter()
        .filter(|entry| show_hidden || !is_hidden_entry(entry))
        .map(|entry| {
            let children = entry.get("children").and_then(|v| v.as_array());
            let mut next_entry = entry.clone();

            if let Some(kids) = children {
                let processed = apply_preferences_recursive(kids, preferences);
                if let Some(obj) = next_entry.as_object_mut() {
                    obj.insert("children".to_string(), Value::Array(processed));
                }
            }

            if fold {
                fold_single_child_directory(&next_entry)
            } else {
                next_entry
            }
        })
        .collect();

    sort_entries(&mut result, sort_mode);
    result
}

// --- Flat file snapshot utilities ---

fn normalize_flat_file_path(entry: &Value) -> String {
    if let Some(s) = entry.as_str() {
        return s.to_string();
    }
    entry
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn normalize_flat_file_entry(entry: &Value) -> Option<Value> {
    let path = normalize_flat_file_path(entry);
    if path.is_empty() {
        return None;
    }

    if entry.is_string() {
        return Some(serde_json::json!({
            "path": path,
            "name": basename_path(&path),
            "is_dir": false,
        }));
    }

    let mut result = entry.clone();
    if let Some(obj) = result.as_object_mut() {
        obj.insert("path".to_string(), Value::String(path.clone()));
        if !obj.contains_key("name") {
            obj.insert("name".to_string(), Value::String(basename_path(&path)));
        }
    }
    Some(result)
}

fn list_flat_files(snapshot: &Value, include_directories: bool) -> Vec<Value> {
    let entries = snapshot
        .get("flatFiles")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    entries
        .iter()
        .filter_map(|entry| normalize_flat_file_entry(entry))
        .filter(|entry| {
            include_directories
                || !entry
                    .get("is_dir")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
        })
        .collect()
}

// --- Tauri commands ---

#[tauri::command]
pub async fn file_tree_display_apply_preferences(
    entries: Vec<Value>,
    preferences: FileTreePreferences,
) -> Result<Vec<Value>, String> {
    Ok(apply_preferences_recursive(&entries, &preferences))
}

#[tauri::command]
pub async fn workspace_snapshot_list_flat_files(
    snapshot: Value,
    include_directories: bool,
) -> Result<Vec<Value>, String> {
    Ok(list_flat_files(&snapshot, include_directories))
}

#[tauri::command]
pub async fn workspace_snapshot_filter_by_extension(
    snapshot: Value,
    extensions: Vec<String>,
) -> Result<Vec<Value>, String> {
    let normalized_exts: Vec<String> = extensions
        .iter()
        .map(|e| e.to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();

    if normalized_exts.is_empty() {
        return Ok(Vec::new());
    }

    let files = list_flat_files(&snapshot, false);
    let filtered = files
        .into_iter()
        .filter(|entry| {
            let path = entry
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            normalized_exts.iter().any(|ext| path.ends_with(ext))
        })
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub async fn workspace_snapshot_count_by_extension(
    snapshot: Value,
    extensions: Vec<String>,
) -> Result<u32, String> {
    let result = workspace_snapshot_filter_by_extension(snapshot, extensions).await?;
    Ok(result.len() as u32)
}

#[tauri::command]
pub async fn workspace_snapshot_filter_existing_recent(
    recent_files: Vec<Value>,
    snapshot: Value,
) -> Result<Vec<Value>, String> {
    let flat = list_flat_files(&snapshot, false);
    let available: std::collections::HashSet<String> = flat
        .iter()
        .filter_map(|entry| entry.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    let filtered = recent_files
        .into_iter()
        .filter(|entry| {
            entry
                .get("path")
                .and_then(|v| v.as_str())
                .map_or(false, |p| available.contains(p))
        })
        .collect();

    Ok(filtered)
}
