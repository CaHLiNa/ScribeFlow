use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tauri::State;

use crate::latex_project_graph::{
    graph_params_with_workspace_files, resolve_graph_value, LatexProjectGraphParams,
};
use crate::markdown_runtime::{extract_markdown_headings, MarkdownHeadingItem};
use crate::security::WorkspaceScopeState;

#[derive(Debug, Clone)]
pub struct DocumentOutlineResolveParams {
    pub file_path: String,
    pub content: String,
    pub workspace_path: String,
    pub flat_files: Vec<String>,
    pub content_overrides: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOutlineItem {
    pub kind: String,
    pub text: String,
    pub level: u8,
    pub display_level: u8,
    pub offset: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<usize>,
    #[serde(default)]
    pub node_key: String,
    #[serde(default)]
    pub ancestor_keys: Vec<String>,
    #[serde(default)]
    pub has_children: bool,
    #[serde(default)]
    pub is_tree_node: bool,
}

fn normalize_path(path: &str) -> String {
    path.trim().replace('\\', "/")
}

fn payload_field<'a>(params: &'a Value, camel_key: &str, snake_key: &str) -> Option<&'a Value> {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
}

fn string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_str)
        .map(normalize_path)
        .unwrap_or_default()
}

fn raw_string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn flat_file_path_from_value(value: &Value) -> Option<String> {
    if let Some(path) = value.as_str() {
        let path = normalize_path(path);
        return (!path.is_empty()).then_some(path);
    }

    value
        .as_object()
        .and_then(|object| object.get("path").and_then(Value::as_str))
        .map(normalize_path)
        .filter(|path| !path.is_empty())
}

fn flat_files_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> Vec<String> {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(flat_file_path_from_value)
                .collect()
        })
        .unwrap_or_default()
}

fn first_non_empty_flat_files_payload(params: &Value) -> Vec<String> {
    [
        ("flatFiles", "flat_files"),
        ("snapshotFlatFiles", "snapshot_flat_files"),
        ("cachedFlatFiles", "cached_flat_files"),
    ]
    .into_iter()
    .map(|(camel_key, snake_key)| flat_files_payload_field(params, camel_key, snake_key))
    .find(|entries| !entries.is_empty())
    .unwrap_or_default()
}

fn content_overrides_payload_field(
    params: &Value,
    camel_key: &str,
    snake_key: &str,
) -> HashMap<String, String> {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .filter_map(|(path, content)| {
                    let path = normalize_path(path);
                    if path.is_empty() {
                        return None;
                    }
                    content.as_str().map(|content| (path, content.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn document_outline_params_from_payload(params: Value) -> DocumentOutlineResolveParams {
    DocumentOutlineResolveParams {
        file_path: string_payload_field(&params, "filePath", "file_path"),
        content: raw_string_payload_field(&params, "content", "content"),
        workspace_path: string_payload_field(&params, "workspacePath", "workspace_path"),
        flat_files: first_non_empty_flat_files_payload(&params),
        content_overrides: content_overrides_payload_field(
            &params,
            "contentOverrides",
            "content_overrides",
        ),
    }
}

fn lower_path(path: &str) -> String {
    normalize_path(path).to_ascii_lowercase()
}

fn is_markdown_path(path: &str) -> bool {
    let path = lower_path(path);
    path.ends_with(".md") || path.ends_with(".markdown")
}

fn is_latex_path(path: &str) -> bool {
    let path = lower_path(path);
    path.ends_with(".tex") || path.ends_with(".latex")
}

fn resolve_primary_content(params: &DocumentOutlineResolveParams, normalized_path: &str) -> String {
    if let Some(content) = params.content_overrides.get(normalized_path) {
        return content.clone();
    }
    params.content.clone()
}

fn item_path(item: &DocumentOutlineItem, fallback_path: &str) -> String {
    item.file_path
        .as_deref()
        .map(normalize_path)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_path.to_string())
}

fn build_node_key(item: &DocumentOutlineItem, fallback_path: &str) -> String {
    format!(
        "{}::{}::{}::{}",
        item_path(item, fallback_path),
        item.offset,
        item.kind,
        item.text
    )
}

fn is_tree_node(item: &DocumentOutlineItem) -> bool {
    matches!(item.kind.as_str(), "heading" | "appendix")
}

fn tree_level(item: &DocumentOutlineItem) -> u8 {
    if !is_tree_node(item) {
        return 1;
    }
    std::cmp::max(1, item.display_level)
}

fn enrich_outline_tree(
    items: Vec<DocumentOutlineItem>,
    fallback_path: &str,
) -> Vec<DocumentOutlineItem> {
    let mut items: Vec<DocumentOutlineItem> = items
        .into_iter()
        .map(|mut item| {
            item.node_key = build_node_key(&item, fallback_path);
            item.ancestor_keys = Vec::new();
            item.has_children = false;
            item.is_tree_node = is_tree_node(&item);
            if item
                .file_path
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
            {
                item.file_path = Some(fallback_path.to_string());
            }
            item
        })
        .collect();

    let mut stack: Vec<(String, u8)> = Vec::new();
    let mut branch_keys = HashSet::new();
    let mut ancestor_map: HashMap<String, Vec<String>> = HashMap::new();

    for item in &items {
        if item.is_tree_node {
            let level = tree_level(item);
            while stack
                .last()
                .map(|(_, stack_level)| *stack_level >= level)
                .unwrap_or(false)
            {
                stack.pop();
            }

            if let Some((parent_key, _)) = stack.last() {
                branch_keys.insert(parent_key.clone());
            }

            ancestor_map.insert(
                item.node_key.clone(),
                stack.iter().map(|(key, _)| key.clone()).collect(),
            );
            stack.push((item.node_key.clone(), level));
        } else {
            ancestor_map.insert(item.node_key.clone(), Vec::new());
            stack.clear();
        }
    }

    for item in &mut items {
        item.ancestor_keys = ancestor_map.remove(&item.node_key).unwrap_or_default();
        item.has_children = branch_keys.contains(&item.node_key);
    }

    items
}

fn markdown_outline_items(
    content: &str,
    normalized_path: &str,
) -> Result<Vec<DocumentOutlineItem>, String> {
    let items = extract_markdown_headings(content)?;
    Ok(items
        .into_iter()
        .map(|item: MarkdownHeadingItem| DocumentOutlineItem {
            kind: item.kind,
            text: item.text,
            level: item.level,
            display_level: item.display_level,
            offset: item.offset,
            line: item.line,
            file_path: Some(normalized_path.to_string()),
            order: None,
            node_key: String::new(),
            ancestor_keys: Vec::new(),
            has_children: false,
            is_tree_node: false,
        })
        .collect())
}

fn latex_outline_items(
    params: &DocumentOutlineResolveParams,
    normalized_path: &str,
    scope_state: &WorkspaceScopeState,
) -> Vec<DocumentOutlineItem> {
    let mut content_overrides = params.content_overrides.clone();
    if !params.content.is_empty() && !content_overrides.contains_key(normalized_path) {
        content_overrides.insert(normalized_path.to_string(), params.content.clone());
    }

    let graph_params = graph_params_with_workspace_files(
        LatexProjectGraphParams {
            source_path: normalized_path.to_string(),
            workspace_path: params.workspace_path.clone(),
            flat_files: params.flat_files.clone(),
            content_overrides: content_overrides.clone(),
        },
        scope_state,
    )
    .unwrap_or_else(|_| LatexProjectGraphParams {
        source_path: normalized_path.to_string(),
        workspace_path: params.workspace_path.clone(),
        flat_files: params.flat_files.clone(),
        content_overrides,
    });

    let graph = resolve_graph_value(&graph_params).unwrap_or(Value::Null);

    graph
        .get("outlineItems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| serde_json::from_value::<DocumentOutlineItem>(item).ok())
        .collect()
}

#[tauri::command]
pub async fn document_outline_resolve(
    params: Value,
    scope_state: State<'_, WorkspaceScopeState>,
) -> Result<Vec<DocumentOutlineItem>, String> {
    let params = document_outline_params_from_payload(params);
    let normalized_path = normalize_path(&params.file_path);
    if normalized_path.is_empty() {
        return Ok(Vec::new());
    }

    if is_markdown_path(&normalized_path) {
        let content = resolve_primary_content(&params, &normalized_path);
        let items = markdown_outline_items(&content, &normalized_path)?;
        return Ok(enrich_outline_tree(items, &normalized_path));
    }

    if is_latex_path(&normalized_path) {
        let items = latex_outline_items(&params, &normalized_path, scope_state.inner());
        return Ok(enrich_outline_tree(items, &normalized_path));
    }

    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::{document_outline_params_from_payload, enrich_outline_tree, DocumentOutlineItem};
    use serde_json::json;

    fn item(kind: &str, text: &str, display_level: u8, offset: usize) -> DocumentOutlineItem {
        DocumentOutlineItem {
            kind: kind.to_string(),
            text: text.to_string(),
            level: display_level,
            display_level,
            offset,
            line: Some(1),
            file_path: Some("/tmp/demo.md".to_string()),
            order: None,
            node_key: String::new(),
            ancestor_keys: Vec::new(),
            has_children: false,
            is_tree_node: false,
        }
    }

    #[test]
    fn enriches_heading_hierarchy_metadata() {
        let items = vec![
            item("heading", "A", 1, 0),
            item("heading", "B", 2, 10),
            item("heading", "C", 2, 20),
            item("heading", "D", 3, 30),
            item("figure", "Figure", 1, 40),
        ];

        let enriched = enrich_outline_tree(items, "/tmp/demo.md");
        assert_eq!(enriched.len(), 5);

        assert!(enriched[0].has_children);
        assert!(enriched[0].ancestor_keys.is_empty());
        assert_eq!(
            enriched[1].ancestor_keys,
            vec![enriched[0].node_key.clone()]
        );
        assert!(enriched[2].has_children);
        assert_eq!(
            enriched[3].ancestor_keys,
            vec![enriched[0].node_key.clone(), enriched[2].node_key.clone()]
        );
        assert!(!enriched[4].is_tree_node);
        assert!(enriched[4].ancestor_keys.is_empty());
    }

    #[test]
    fn document_outline_params_normalize_raw_payloads() {
        let params = document_outline_params_from_payload(json!({
            "filePath": " /workspace/main.md ",
            "content": "  # Title keeps spaces  ",
            "workspacePath": 42,
            "flatFiles": [
                " /workspace/main.md ",
                { "path": " /workspace/chapter.tex " },
                { "path": 42 },
                "",
                false
            ],
            "snapshotFlatFiles": [
                " /workspace/snapshot.md "
            ],
            "cachedFlatFiles": [
                " /workspace/cached.md "
            ],
            "contentOverrides": {
                " /workspace/main.md ": "  override keeps spaces  ",
                "": "ignored",
                "/workspace/invalid.md": false
            }
        }));

        assert_eq!(params.file_path, "/workspace/main.md");
        assert_eq!(params.content, "  # Title keeps spaces  ");
        assert_eq!(params.workspace_path, "");
        assert_eq!(
            params.flat_files,
            vec!["/workspace/main.md", "/workspace/chapter.tex"]
        );
        assert_eq!(
            params
                .content_overrides
                .get("/workspace/main.md")
                .map(String::as_str),
            Some("  override keeps spaces  ")
        );
        assert!(!params
            .content_overrides
            .contains_key("/workspace/invalid.md"));

        let snapshot_params = document_outline_params_from_payload(json!({
            "file_path": " /workspace/snake.tex ",
            "content": false,
            "workspace_path": " /workspace ",
            "flat_files": false,
            "snapshot_flat_files": [
                { "path": " /workspace/snapshot.tex " }
            ],
            "cached_flat_files": [
                " /workspace/cached.tex "
            ],
            "content_overrides": {
                " /workspace/snake.tex ": "snake body"
            }
        }));
        assert_eq!(snapshot_params.file_path, "/workspace/snake.tex");
        assert_eq!(snapshot_params.content, "");
        assert_eq!(snapshot_params.workspace_path, "/workspace");
        assert_eq!(snapshot_params.flat_files, vec!["/workspace/snapshot.tex"]);
        assert_eq!(
            snapshot_params
                .content_overrides
                .get("/workspace/snake.tex")
                .map(String::as_str),
            Some("snake body")
        );

        let cached_params = document_outline_params_from_payload(json!({
            "filePath": " /workspace/cached.md ",
            "flatFiles": [],
            "snapshotFlatFiles": [],
            "cachedFlatFiles": [
                " /workspace/cached.md "
            ]
        }));
        assert_eq!(cached_params.flat_files, vec!["/workspace/cached.md"]);

        let non_object = document_outline_params_from_payload(json!(42));
        assert_eq!(non_object.file_path, "");
        assert_eq!(non_object.content, "");
        assert!(non_object.flat_files.is_empty());
        assert!(non_object.content_overrides.is_empty());
    }
}
