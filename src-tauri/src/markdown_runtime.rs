use markdown::mdast::Node;
use markdown::unist::Position;
use markdown::{to_mdast, Constructs, ParseOptions};
use regex_lite::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownHeadingItem {
    pub kind: String,
    pub text: String,
    pub level: u8,
    pub display_level: u8,
    pub offset: usize,
    pub line: Option<usize>,
}

const RAW_HTML_MESSAGE: &str = "Raw HTML may not migrate cleanly to LaTeX export.";

fn markdown_parse_options() -> ParseOptions {
    let constructs = Constructs {
        gfm_autolink_literal: true,
        gfm_footnote_definition: true,
        gfm_label_start_footnote: true,
        gfm_strikethrough: true,
        gfm_table: true,
        gfm_task_list_item: true,
        math_flow: true,
        math_text: true,
        ..Constructs::default()
    };

    ParseOptions {
        constructs,
        ..ParseOptions::default()
    }
}

fn utf16_offset_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    let mut safe_offset = byte_offset.min(text.len());
    while safe_offset > 0 && !text.is_char_boundary(safe_offset) {
        safe_offset -= 1;
    }

    text[..safe_offset].encode_utf16().count()
}

fn bibliography_kind_for_heading(text: &str) -> &'static str {
    match text.trim().to_ascii_lowercase().as_str() {
        "references" | "bibliography" | "works cited" | "参考文献" => "bibliography",
        _ => "heading",
    }
}

fn position_start(content: &str, position: Option<&Position>) -> (usize, Option<usize>) {
    position
        .map(|position| {
            (
                utf16_offset_for_byte_offset(content, position.start.offset),
                Some(position.start.line),
            )
        })
        .unwrap_or((0, None))
}

fn collect_text_from_node(node: &Node) -> String {
    match node {
        Node::Text(text) => text.value.clone(),
        Node::InlineCode(code) => code.value.clone(),
        Node::InlineMath(math) => math.value.clone(),
        Node::Delete(node) => collect_text_from_children(&node.children),
        Node::Emphasis(node) => collect_text_from_children(&node.children),
        Node::Strong(node) => collect_text_from_children(&node.children),
        Node::Link(node) => collect_text_from_children(&node.children),
        Node::Image(node) => node.alt.clone(),
        Node::FootnoteReference(node) => node.identifier.clone(),
        Node::Html(node) => node.value.clone(),
        Node::Break(_) => " ".to_string(),
        _ => String::new(),
    }
}

fn collect_text_from_children(children: &[Node]) -> String {
    let mut text = String::new();
    for child in children {
        text.push_str(&collect_text_from_node(child));
    }
    text
}

fn walk_headings(node: &Node, items: &mut Vec<MarkdownHeadingItem>, content: &str) {
    match node {
        Node::Root(root) => {
            for child in &root.children {
                walk_headings(child, items, content);
            }
        }
        Node::Heading(heading) => {
            let text = collect_text_from_children(&heading.children)
                .trim()
                .to_string();
            if !text.is_empty() {
                let level = heading.depth.clamp(1, 6) as u8;
                let (offset, line) = position_start(content, heading.position.as_ref());
                items.push(MarkdownHeadingItem {
                    kind: bibliography_kind_for_heading(&text).to_string(),
                    text,
                    level,
                    display_level: level,
                    offset,
                    line,
                });
            }
            for child in &heading.children {
                walk_headings(child, items, content);
            }
        }
        Node::Blockquote(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::List(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::ListItem(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::Table(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::TableRow(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::TableCell(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        Node::Paragraph(node) => {
            for child in &node.children {
                walk_headings(child, items, content);
            }
        }
        _ => {}
    }
}

pub(crate) fn extract_markdown_headings(content: &str) -> Result<Vec<MarkdownHeadingItem>, String> {
    let tree = to_mdast(content, &markdown_parse_options())
        .map_err(|error| format!("Failed to parse markdown headings: {error}"))?;
    let mut items = Vec::new();
    walk_headings(&tree, &mut items, content);
    Ok(items)
}

fn node_line_column(node: &Node) -> (Option<u64>, Option<u64>) {
    node.position()
        .map(|position| {
            (
                Some(position.start.line as u64),
                Some(position.start.column as u64),
            )
        })
        .unwrap_or((None, None))
}

fn build_problem(
    source_path: &str,
    line: Option<u64>,
    column: Option<u64>,
    severity: &str,
    message: impl Into<String>,
    raw: impl Into<String>,
) -> Value {
    let message = message.into();
    let raw = raw.into();
    json!({
        "sourcePath": source_path,
        "line": line,
        "column": column,
        "severity": severity,
        "message": message,
        "origin": "draft",
        "actionable": true,
        "raw": if raw.trim().is_empty() { Value::String(message) } else { Value::String(raw) },
    })
}

fn walk_markdown_draft_diagnostics(
    node: &Node,
    source_path: &str,
    previous_heading_level: &mut u8,
    problems: &mut Vec<Value>,
) {
    match node {
        Node::Heading(heading) => {
            let level = heading.depth.clamp(1, 6) as u8;
            if *previous_heading_level > 0 && level > *previous_heading_level + 1 {
                let (line, column) = node_line_column(node);
                problems.push(build_problem(
                    source_path,
                    line,
                    column,
                    "warning",
                    format!(
                        "Heading level jumps from {} to {}.",
                        *previous_heading_level, level
                    ),
                    "",
                ));
            }
            *previous_heading_level = level;
        }
        Node::Html(html) => {
            let raw = html.value.trim();
            if !raw.is_empty() {
                let (line, column) = node_line_column(node);
                problems.push(build_problem(
                    source_path,
                    line,
                    column,
                    "warning",
                    RAW_HTML_MESSAGE,
                    raw.to_string(),
                ));
            }
        }
        _ => {}
    }

    if let Some(children) = node.children() {
        for child in children {
            walk_markdown_draft_diagnostics(
                child,
                source_path,
                previous_heading_level,
                problems,
            );
        }
    }
}

fn scan_markdown_footnote_diagnostics(source_path: &str, content: &str, problems: &mut Vec<Value>) {
    let definition_regex =
        Regex::new(r"^\[\^([^\]]+)\]:").expect("valid markdown footnote definition regex");
    let reference_regex =
        Regex::new(r"\[\^([^\]]+)\]").expect("valid markdown footnote reference regex");
    let mut definitions = HashSet::new();
    let mut references = Vec::new();

    for (line_index, line) in content.lines().enumerate() {
        let line_no = (line_index + 1) as u64;
        let mut definition_prefix_len = 0usize;

        if let Some(captures) = definition_regex.captures(line) {
            if let Some(identifier_match) = captures.get(1) {
                let identifier = identifier_match.as_str().trim();
                if !identifier.is_empty() {
                    if !definitions.insert(identifier.to_string()) {
                        problems.push(build_problem(
                            source_path,
                            Some(line_no),
                            Some(1),
                            "warning",
                            format!("Duplicate footnote definition: [^{}].", identifier),
                            "",
                        ));
                    }
                    if let Some(full_match) = captures.get(0) {
                        definition_prefix_len = full_match.end();
                    }
                }
            }
        }

        let reference_slice = &line[definition_prefix_len..];
        for captures in reference_regex.captures_iter(reference_slice) {
            let Some(identifier_match) = captures.get(1) else {
                continue;
            };
            let identifier = identifier_match.as_str().trim();
            if identifier.is_empty() {
                continue;
            }
            let column = captures
                .get(0)
                .map(|entry| entry.start() + definition_prefix_len + 1)
                .unwrap_or(1) as u64;
            references.push((identifier.to_string(), Some(line_no), Some(column)));
        }
    }

    for (identifier, line, column) in references {
        if definitions.contains(&identifier) {
            continue;
        }
        problems.push(build_problem(
            source_path,
            line,
            column,
            "error",
            format!("Footnote [^{}] has no matching definition.", identifier),
            "",
        ));
    }
}

pub(crate) fn extract_markdown_draft_problems(
    source_path: &str,
    content: &str,
) -> Result<Vec<Value>, String> {
    let tree = to_mdast(content, &markdown_parse_options())
        .map_err(|error| format!("Failed to parse markdown diagnostics: {error}"))?;
    let mut previous_heading_level = 0u8;
    let mut problems = Vec::new();

    walk_markdown_draft_diagnostics(
        &tree,
        source_path,
        &mut previous_heading_level,
        &mut problems,
    );
    scan_markdown_footnote_diagnostics(source_path, content, &mut problems);

    Ok(problems)
}

#[tauri::command]
pub async fn markdown_extract_headings(
    content: String,
) -> Result<Vec<MarkdownHeadingItem>, String> {
    extract_markdown_headings(&content)
}

#[cfg(test)]
mod tests {
    use super::{extract_markdown_draft_problems, extract_markdown_headings, RAW_HTML_MESSAGE};
    use serde_json::Value;

    #[test]
    fn uses_utf16_offsets_for_non_ascii_markdown() {
        let content = "前言\n## 标题\n";
        let items = extract_markdown_headings(content).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].text, "标题");
        assert_eq!(items[0].offset, 3);
        assert_eq!(items[0].line, Some(2));
    }

    #[test]
    fn detects_markdown_draft_problems() {
        let content = "# Title\n### Jump\n<div>raw</div>\n[^a]\n[^b]: note\n[^b]: dup\n";
        let problems = extract_markdown_draft_problems("/tmp/test.md", content).unwrap();

        assert_eq!(problems.len(), 4);
        assert_eq!(
            problems[0].get("message").and_then(Value::as_str),
            Some("Heading level jumps from 1 to 3.")
        );
        assert_eq!(
            problems[1].get("message").and_then(Value::as_str),
            Some(RAW_HTML_MESSAGE)
        );
        assert_eq!(
            problems[2].get("message").and_then(Value::as_str),
            Some("Duplicate footnote definition: [^b].")
        );
        assert_eq!(
            problems[3].get("message").and_then(Value::as_str),
            Some("Footnote [^a] has no matching definition.")
        );
    }
}
