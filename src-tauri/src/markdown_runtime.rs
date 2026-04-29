use markdown::mdast::Node;
use markdown::unist::Position;
use markdown::{to_mdast, Constructs, ParseOptions};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDiagnosticItem {
    pub id: String,
    pub source_path: String,
    pub line: Option<usize>,
    pub column: Option<usize>,
    pub severity: String,
    pub message: String,
    pub origin: String,
    pub actionable: bool,
    pub raw: String,
}

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

fn normalize_source_path(source_path: Option<String>) -> String {
    source_path.unwrap_or_default()
}

fn utf16_offset_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    let mut safe_offset = byte_offset.min(text.len());
    while safe_offset > 0 && !text.is_char_boundary(safe_offset) {
        safe_offset -= 1;
    }

    text[..safe_offset].encode_utf16().count()
}

fn problem_position(position: Option<&Position>) -> (Option<usize>, Option<usize>) {
    position
        .map(|position| (Some(position.start.line), Some(position.start.column)))
        .unwrap_or((None, None))
}

fn make_markdown_diagnostic(
    source_path: &str,
    position: Option<&Position>,
    severity: &str,
    message: impl Into<String>,
    raw: impl Into<String>,
) -> MarkdownDiagnosticItem {
    let (line, column) = problem_position(position);
    make_markdown_diagnostic_with_location(source_path, line, column, severity, message, raw)
}

fn make_markdown_diagnostic_with_location(
    source_path: &str,
    line: Option<usize>,
    column: Option<usize>,
    severity: &str,
    message: impl Into<String>,
    raw: impl Into<String>,
) -> MarkdownDiagnosticItem {
    let message = message.into();
    let raw = raw.into();
    MarkdownDiagnosticItem {
        id: String::new(),
        source_path: source_path.to_string(),
        line,
        column,
        severity: if severity == "error" {
            "error".to_string()
        } else {
            "warning".to_string()
        },
        message: message.clone(),
        origin: "draft".to_string(),
        actionable: true,
        raw: if raw.trim().is_empty() { message } else { raw },
    }
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

fn walk_diagnostics<'a>(
    node: &'a Node,
    source_path: &str,
    previous_heading_level: &mut Option<u8>,
    footnote_definitions: &mut HashMap<String, Option<&'a Position>>,
    footnote_references: &mut Vec<(String, Option<&'a Position>)>,
    problems: &mut Vec<MarkdownDiagnosticItem>,
) {
    match node {
        Node::Heading(heading) => {
            let level = heading.depth.clamp(1, 6);
            if let Some(previous_level) = previous_heading_level {
                if level > *previous_level + 1 {
                    problems.push(make_markdown_diagnostic(
                        source_path,
                        heading.position.as_ref(),
                        "warning",
                        format!("Heading level jumps from {previous_level} to {level}."),
                        "",
                    ));
                }
            }
            *previous_heading_level = Some(level);
        }
        Node::Html(html) => {
            let raw = html.value.trim();
            if !raw.is_empty() {
                problems.push(make_markdown_diagnostic(
                    source_path,
                    html.position.as_ref(),
                    "warning",
                    "Raw HTML may not migrate cleanly to LaTeX export.",
                    raw,
                ));
            }
        }
        Node::FootnoteDefinition(definition) => {
            let identifier = definition.identifier.trim().to_string();
            if !identifier.is_empty()
                && footnote_definitions
                    .insert(identifier.clone(), definition.position.as_ref())
                    .is_some()
            {
                problems.push(make_markdown_diagnostic(
                    source_path,
                    definition.position.as_ref(),
                    "warning",
                    format!("Duplicate footnote definition: [^{identifier}]."),
                    "",
                ));
            }
        }
        Node::FootnoteReference(reference) => {
            let identifier = reference.identifier.trim().to_string();
            if !identifier.is_empty() {
                footnote_references.push((identifier, reference.position.as_ref()));
            }
        }
        _ => {}
    }

    if let Some(children) = node.children() {
        for child in children {
            walk_diagnostics(
                child,
                source_path,
                previous_heading_level,
                footnote_definitions,
                footnote_references,
                problems,
            );
        }
    }
}

fn diagnostic_signature(problem: &MarkdownDiagnosticItem) -> String {
    [
        problem.source_path.as_str(),
        &problem
            .line
            .map(|line| line.to_string())
            .unwrap_or_default(),
        &problem
            .column
            .map(|column| column.to_string())
            .unwrap_or_default(),
        problem.severity.as_str(),
        problem.origin.as_str(),
        problem.message.as_str(),
    ]
    .join("::")
}

fn normalize_markdown_diagnostics(
    mut problems: Vec<MarkdownDiagnosticItem>,
) -> Vec<MarkdownDiagnosticItem> {
    let mut seen = HashSet::new();
    problems.retain(|problem| {
        !problem.message.trim().is_empty() && seen.insert(diagnostic_signature(problem))
    });
    problems.sort_by(|left, right| {
        left.source_path
            .cmp(&right.source_path)
            .then_with(|| {
                left.line
                    .unwrap_or(usize::MAX)
                    .cmp(&right.line.unwrap_or(usize::MAX))
            })
            .then_with(|| match (left.severity.as_str(), right.severity.as_str()) {
                ("error", "warning") => std::cmp::Ordering::Less,
                ("warning", "error") => std::cmp::Ordering::Greater,
                _ => left.severity.cmp(&right.severity),
            })
            .then_with(|| left.message.cmp(&right.message))
    });
    problems
}

fn footnote_definition_marker(line: &str) -> Option<(String, usize)> {
    let leading_whitespace = line.len() - line.trim_start().len();
    let trimmed = &line[leading_whitespace..];
    let rest = trimmed.strip_prefix("[^")?;
    let marker_end = rest.find("]:")?;
    let identifier = rest[..marker_end].trim();
    if identifier.is_empty() {
        return None;
    }
    Some((identifier.to_string(), leading_whitespace + 1))
}

fn collect_footnote_diagnostics_from_source(
    source_path: &str,
    content: &str,
    problems: &mut Vec<MarkdownDiagnosticItem>,
) {
    let mut seen = HashSet::new();
    let mut definitions = HashSet::new();
    for (line_index, line) in content.lines().enumerate() {
        let Some((identifier, column)) = footnote_definition_marker(line) else {
            continue;
        };
        definitions.insert(identifier.clone());
        if seen.insert(identifier.clone()) {
            continue;
        }
        problems.push(make_markdown_diagnostic_with_location(
            source_path,
            Some(line_index + 1),
            Some(column),
            "warning",
            format!("Duplicate footnote definition: [^{identifier}]."),
            "",
        ));
    }

    for (line_index, line) in content.lines().enumerate() {
        let mut search_start = 0;
        while let Some(relative_start) = line[search_start..].find("[^") {
            let marker_start = search_start + relative_start;
            let identifier_start = marker_start + 2;
            let Some(relative_end) = line[identifier_start..].find(']') else {
                break;
            };
            let marker_end = identifier_start + relative_end;
            let identifier = line[identifier_start..marker_end].trim();
            let after_marker = line.get(marker_end + 1..).unwrap_or_default();
            let is_definition =
                line[..marker_start].trim().is_empty() && after_marker.starts_with(':');

            if !identifier.is_empty() && !is_definition && !definitions.contains(identifier) {
                problems.push(make_markdown_diagnostic_with_location(
                    source_path,
                    Some(line_index + 1),
                    Some(marker_start + 1),
                    "error",
                    format!("Footnote [^{identifier}] has no matching definition."),
                    "",
                ));
            }

            search_start = marker_end + 1;
        }
    }
}

pub(crate) fn extract_markdown_headings(content: &str) -> Result<Vec<MarkdownHeadingItem>, String> {
    let tree = to_mdast(content, &markdown_parse_options())
        .map_err(|error| format!("Failed to parse markdown headings: {error}"))?;
    let mut items = Vec::new();
    walk_headings(&tree, &mut items, content);
    Ok(items)
}

pub(crate) fn extract_markdown_diagnostics(
    source_path: &str,
    content: &str,
) -> Result<Vec<MarkdownDiagnosticItem>, String> {
    let tree = to_mdast(content, &markdown_parse_options())
        .map_err(|error| format!("Failed to parse markdown diagnostics: {error}"))?;
    let mut problems = Vec::new();
    let mut previous_heading_level = None;
    let mut footnote_definitions = HashMap::new();
    let mut footnote_references = Vec::new();

    walk_diagnostics(
        &tree,
        source_path,
        &mut previous_heading_level,
        &mut footnote_definitions,
        &mut footnote_references,
        &mut problems,
    );
    collect_footnote_diagnostics_from_source(source_path, content, &mut problems);

    for (identifier, position) in footnote_references {
        if footnote_definitions.contains_key(&identifier) {
            continue;
        }
        problems.push(make_markdown_diagnostic(
            source_path,
            position,
            "error",
            format!("Footnote [^{identifier}] has no matching definition."),
            "",
        ));
    }

    Ok(normalize_markdown_diagnostics(problems))
}

#[tauri::command]
pub async fn markdown_extract_headings(
    content: String,
) -> Result<Vec<MarkdownHeadingItem>, String> {
    extract_markdown_headings(&content)
}

#[tauri::command]
pub async fn markdown_extract_diagnostics(
    content: String,
    source_path: Option<String>,
) -> Result<Vec<MarkdownDiagnosticItem>, String> {
    extract_markdown_diagnostics(&normalize_source_path(source_path), &content)
}

#[cfg(test)]
mod tests {
    use super::{extract_markdown_diagnostics, extract_markdown_headings};

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
    fn extracts_draft_diagnostics_with_frontend_problem_shape() {
        let content =
            "# Title\n### Jump\n<div>x</div>\n\nText[^missing]\n\n[^a]: First\n[^a]: Second\n";
        let problems = extract_markdown_diagnostics("draft.md", content).unwrap();

        assert_eq!(problems.len(), 4);
        assert_eq!(problems[0].source_path, "draft.md");
        assert_eq!(problems[0].line, Some(2));
        assert_eq!(problems[0].column, Some(1));
        assert_eq!(problems[0].severity, "warning");
        assert_eq!(problems[0].origin, "draft");
        assert!(problems[0].actionable);
        assert_eq!(problems[0].message, "Heading level jumps from 1 to 3.");

        assert_eq!(problems[1].line, Some(3));
        assert_eq!(problems[1].raw, "<div>x</div>");
        assert_eq!(
            problems[1].message,
            "Raw HTML may not migrate cleanly to LaTeX export."
        );

        assert_eq!(problems[2].line, Some(5));
        assert_eq!(problems[2].severity, "error");
        assert_eq!(
            problems[2].message,
            "Footnote [^missing] has no matching definition."
        );

        assert_eq!(problems[3].line, Some(8));
        assert_eq!(problems[3].message, "Duplicate footnote definition: [^a].");
    }
}
