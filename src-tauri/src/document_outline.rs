use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

use crate::latex_project_graph::{resolve_graph_value, LatexProjectGraphParams};
use crate::markdown_runtime::{extract_markdown_headings, MarkdownHeadingItem};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentOutlineResolveParams {
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub flat_files: Vec<String>,
    #[serde(default)]
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
) -> Vec<DocumentOutlineItem> {
    let mut content_overrides = params.content_overrides.clone();
    if !params.content.is_empty() && !content_overrides.contains_key(normalized_path) {
        content_overrides.insert(normalized_path.to_string(), params.content.clone());
    }

    let graph = resolve_graph_value(&LatexProjectGraphParams {
        source_path: normalized_path.to_string(),
        flat_files: params.flat_files.clone(),
        content_overrides,
    })
    .unwrap_or(Value::Null);

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
    params: DocumentOutlineResolveParams,
) -> Result<Vec<DocumentOutlineItem>, String> {
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
        let items = latex_outline_items(&params, &normalized_path);
        return Ok(enrich_outline_tree(items, &normalized_path));
    }

    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::{enrich_outline_tree, DocumentOutlineItem};

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
}
