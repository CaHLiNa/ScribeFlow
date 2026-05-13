use markdown::mdast::Node;
use markdown::unist::Position;
use markdown::{to_mdast, Constructs, ParseOptions};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownWikiLinkItem {
    pub target: String,
    pub display: Option<String>,
    pub heading: Option<String>,
    pub from: usize,
    pub to: usize,
    pub raw: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLinkIndexFileInput {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownBacklinkItem {
    pub source_path: String,
    pub source_name: String,
    pub link_text: String,
    pub line_number: usize,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLinkIndexResult {
    pub forward_links: HashMap<String, Vec<MarkdownWikiLinkItem>>,
    pub backlinks: HashMap<String, Vec<MarkdownBacklinkItem>>,
    pub name_map: HashMap<String, Vec<String>>,
    pub headings: HashMap<String, Vec<MarkdownHeadingItem>>,
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

fn payload_field<'a>(params: &'a Value, camel_key: &str, snake_key: &str) -> Option<&'a Value> {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
}

fn raw_string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    raw_string_payload_field(params, camel_key, snake_key)
        .trim()
        .to_string()
}

fn markdown_content_params_from_payload(params: Value) -> String {
    raw_string_payload_field(&params, "content", "content")
}

fn markdown_diagnostics_params_from_payload(params: Value) -> (String, String) {
    (
        raw_string_payload_field(&params, "content", "content"),
        string_payload_field(&params, "sourcePath", "source_path"),
    )
}

fn markdown_link_index_params_from_payload(
    params: Value,
) -> (String, Vec<MarkdownLinkIndexFileInput>) {
    let workspace_path = string_payload_field(&params, "workspacePath", "workspace_path");
    let files = payload_field(&params, "files", "files")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .map(|entry| MarkdownLinkIndexFileInput {
                    path: string_payload_field(entry, "path", "path"),
                    content: raw_string_payload_field(entry, "content", "content"),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    (workspace_path, files)
}

fn normalize_markdown_link_name(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_separator = false;
    for character in value.to_lowercase().chars() {
        if character == '-' || character == '_' || character.is_whitespace() {
            if !previous_separator && !normalized.is_empty() {
                normalized.push(' ');
                previous_separator = true;
            }
        } else {
            normalized.push(character);
            previous_separator = false;
        }
    }
    normalized.trim().to_string()
}

fn basename_path(path: &str) -> String {
    normalize_path_separators(path)
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_string()
}

fn dirname_path(path: &str) -> String {
    let normalized = normalize_path_separators(path);
    normalized
        .rsplit_once('/')
        .map(|(dir, _)| dir.to_string())
        .unwrap_or_default()
}

fn normalize_path_separators(path: &str) -> String {
    path.trim().replace('\\', "/")
}

fn file_name_from_path(path: &str) -> String {
    let basename = basename_path(path);
    basename
        .strip_suffix(".md")
        .unwrap_or(&basename)
        .to_string()
}

fn relative_workspace_path<'a>(path: &'a str, workspace_path: &str) -> &'a str {
    if workspace_path.is_empty() {
        return path;
    }
    path.strip_prefix(workspace_path)
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(path)
}

fn byte_offset_for_utf16_offset(text: &str, utf16_offset: usize) -> usize {
    if utf16_offset == 0 {
        return 0;
    }
    let mut units = 0usize;
    for (byte_index, character) in text.char_indices() {
        if units >= utf16_offset {
            return byte_index;
        }
        units += character.len_utf16();
    }
    text.len()
}

fn utf16_offset_for_byte_offset(text: &str, byte_offset: usize) -> usize {
    let mut safe_offset = byte_offset.min(text.len());
    while safe_offset > 0 && !text.is_char_boundary(safe_offset) {
        safe_offset -= 1;
    }

    text[..safe_offset].encode_utf16().count()
}

fn line_context_for_utf16_range(content: &str, from: usize, to: usize) -> (usize, String) {
    let from_byte = byte_offset_for_utf16_offset(content, from).min(content.len());
    let to_byte = byte_offset_for_utf16_offset(content, to).min(content.len());
    let before_link = &content[..from_byte];
    let line_number = before_link
        .chars()
        .filter(|character| *character == '\n')
        .count()
        + 1;
    let line_start = before_link.rfind('\n').map(|index| index + 1).unwrap_or(0);
    let line_end = content[to_byte..]
        .find('\n')
        .map(|relative| to_byte + relative)
        .unwrap_or(content.len());
    (
        line_number,
        content[line_start..line_end].trim().to_string(),
    )
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

fn parse_wiki_links_from_text_segment(
    content: &str,
    segment: &str,
    segment_byte_start: usize,
    items: &mut Vec<MarkdownWikiLinkItem>,
) {
    let mut search_start = 0usize;
    while let Some(relative_start) = segment[search_start..].find("[[") {
        let link_start = search_start + relative_start;
        let inner_start = link_start + 2;
        let Some(relative_end) = segment[inner_start..].find("]]") else {
            break;
        };
        let inner_end = inner_start + relative_end;
        let link_end = inner_end + 2;
        let raw = segment[inner_start..inner_end].to_string();
        let mut target = raw.as_str();
        let mut display = None;
        let mut heading = None;

        if let Some(pipe_index) = target.find('|') {
            display = Some(target[pipe_index + 1..].to_string());
            target = &target[..pipe_index];
        }

        if let Some(hash_index) = target.find('#') {
            heading = Some(target[hash_index + 1..].to_string());
            target = &target[..hash_index];
        }

        items.push(MarkdownWikiLinkItem {
            target: target.trim().to_string(),
            display,
            heading,
            from: utf16_offset_for_byte_offset(content, segment_byte_start + link_start),
            to: utf16_offset_for_byte_offset(content, segment_byte_start + link_end),
            raw,
        });

        search_start = link_end;
    }
}

fn walk_wiki_links(node: &Node, items: &mut Vec<MarkdownWikiLinkItem>, content: &str) {
    match node {
        Node::Text(text) => {
            if let Some(position) = text.position.as_ref() {
                parse_wiki_links_from_text_segment(
                    content,
                    &text.value,
                    position.start.offset,
                    items,
                );
            }
        }
        Node::InlineCode(_) | Node::Code(_) => {}
        _ => {
            if let Some(children) = node.children() {
                for child in children {
                    walk_wiki_links(child, items, content);
                }
            }
        }
    }
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

pub(crate) fn extract_markdown_wiki_links(
    content: &str,
) -> Result<Vec<MarkdownWikiLinkItem>, String> {
    let tree = to_mdast(content, &markdown_parse_options())
        .map_err(|error| format!("Failed to parse markdown wiki links: {error}"))?;
    let mut items = Vec::new();
    walk_wiki_links(&tree, &mut items, content);
    Ok(items)
}

fn resolve_markdown_link_target(
    target: &str,
    from_path: &str,
    workspace_path: &str,
    name_map: &HashMap<String, Vec<String>>,
) -> Option<String> {
    if target.trim().is_empty() {
        return None;
    }

    let normalized = normalize_markdown_link_name(target);
    let Some(candidates) = name_map.get(&normalized) else {
        if target.contains('/') {
            let normalized_target = target.strip_suffix(".md").unwrap_or(target);
            for paths in name_map.values() {
                for path in paths {
                    let relative = relative_workspace_path(path, workspace_path);
                    if relative
                        .strip_suffix(".md")
                        .unwrap_or(relative)
                        .ends_with(normalized_target)
                    {
                        return Some(path.clone());
                    }
                }
            }
        }
        return None;
    };

    if candidates.len() == 1 {
        return candidates.first().cloned();
    }

    let from_dir = dirname_path(from_path);
    if let Some(candidate) = candidates
        .iter()
        .find(|candidate| dirname_path(candidate) == from_dir)
    {
        return Some(candidate.clone());
    }

    candidates
        .iter()
        .min_by_key(|candidate| candidate.len())
        .cloned()
}

fn build_markdown_backlinks(
    files: &[MarkdownLinkIndexFileInput],
    workspace_path: &str,
    forward_links: &HashMap<String, Vec<MarkdownWikiLinkItem>>,
    name_map: &HashMap<String, Vec<String>>,
) -> HashMap<String, Vec<MarkdownBacklinkItem>> {
    let content_by_path: HashMap<String, &str> = files
        .iter()
        .map(|file| (normalize_path_separators(&file.path), file.content.as_str()))
        .collect();
    let mut backlinks: HashMap<String, Vec<MarkdownBacklinkItem>> = HashMap::new();

    for (source_path, links) in forward_links {
        let content = content_by_path
            .get(source_path)
            .copied()
            .unwrap_or_default();
        for link in links {
            let Some(target_path) =
                resolve_markdown_link_target(&link.target, source_path, workspace_path, name_map)
            else {
                continue;
            };
            let (line_number, context) = line_context_for_utf16_range(content, link.from, link.to);
            backlinks
                .entry(target_path)
                .or_default()
                .push(MarkdownBacklinkItem {
                    source_path: source_path.clone(),
                    source_name: file_name_from_path(source_path),
                    link_text: link
                        .display
                        .clone()
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| link.target.clone()),
                    line_number,
                    context,
                });
        }
    }

    backlinks
}

pub(crate) fn resolve_markdown_link_index(
    workspace_path: &str,
    files: Vec<MarkdownLinkIndexFileInput>,
) -> Result<MarkdownLinkIndexResult, String> {
    let normalized_workspace_path = normalize_path_separators(workspace_path);
    let mut result = MarkdownLinkIndexResult::default();

    for file in &files {
        let normalized_path = normalize_path_separators(&file.path);
        if normalized_path.is_empty() {
            continue;
        }

        let name = file_name_from_path(&normalized_path);
        let normalized_name = normalize_markdown_link_name(&name);
        if !normalized_name.is_empty() {
            let paths = result.name_map.entry(normalized_name).or_default();
            if !paths.iter().any(|path| path == &normalized_path) {
                paths.push(normalized_path.clone());
            }
        }

        result.headings.insert(
            normalized_path.clone(),
            extract_markdown_headings(&file.content)?,
        );
        result
            .forward_links
            .insert(normalized_path, extract_markdown_wiki_links(&file.content)?);
    }

    result.backlinks = build_markdown_backlinks(
        &files,
        &normalized_workspace_path,
        &result.forward_links,
        &result.name_map,
    );

    Ok(result)
}

#[tauri::command]
pub async fn markdown_extract_headings(params: Value) -> Result<Vec<MarkdownHeadingItem>, String> {
    let content = markdown_content_params_from_payload(params);
    extract_markdown_headings(&content)
}

#[tauri::command]
pub async fn markdown_extract_diagnostics(
    params: Value,
) -> Result<Vec<MarkdownDiagnosticItem>, String> {
    let (content, source_path) = markdown_diagnostics_params_from_payload(params);
    extract_markdown_diagnostics(&normalize_source_path(Some(source_path)), &content)
}

#[tauri::command]
pub async fn markdown_extract_wiki_links(
    params: Value,
) -> Result<Vec<MarkdownWikiLinkItem>, String> {
    let content = markdown_content_params_from_payload(params);
    extract_markdown_wiki_links(&content)
}

#[tauri::command]
pub async fn markdown_link_index_resolve(params: Value) -> Result<MarkdownLinkIndexResult, String> {
    let (workspace_path, files) = markdown_link_index_params_from_payload(params);
    resolve_markdown_link_index(&normalize_source_path(Some(workspace_path)), files)
}

#[cfg(test)]
mod tests {
    use super::{
        extract_markdown_diagnostics, extract_markdown_headings, extract_markdown_wiki_links,
        markdown_content_params_from_payload, markdown_diagnostics_params_from_payload,
        markdown_link_index_params_from_payload, resolve_markdown_link_index,
        MarkdownLinkIndexFileInput,
    };
    use serde_json::json;

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

    #[test]
    fn extracts_wiki_links_outside_code_with_utf16_offsets() {
        let content = "前言 [[Note#Intro|读]]\n`[[Ignored]]`\n\n```md\n[[AlsoIgnored]]\n```\n";
        let links = extract_markdown_wiki_links(content).unwrap();

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Note");
        assert_eq!(links[0].heading.as_deref(), Some("Intro"));
        assert_eq!(links[0].display.as_deref(), Some("读"));
        assert_eq!(links[0].raw, "Note#Intro|读");
        assert_eq!(links[0].from, 3);
    }

    #[test]
    fn resolves_markdown_link_index_with_backlinks_and_ambiguous_names() {
        let files = vec![
            MarkdownLinkIndexFileInput {
                path: "/workspace/notes/Index.md".to_string(),
                content: "# Home\n链接 [[Topic|主题]] 和 [[nested/Topic]].\n".to_string(),
            },
            MarkdownLinkIndexFileInput {
                path: "/workspace/notes/Topic.md".to_string(),
                content: "## Local Topic\n".to_string(),
            },
            MarkdownLinkIndexFileInput {
                path: "/workspace/notes/nested/Topic.md".to_string(),
                content: "# Nested Topic\n".to_string(),
            },
        ];

        let index = resolve_markdown_link_index("/workspace/notes", files).unwrap();

        assert_eq!(
            index.name_map.get("topic").cloned().unwrap_or_default(),
            vec![
                "/workspace/notes/Topic.md".to_string(),
                "/workspace/notes/nested/Topic.md".to_string()
            ]
        );
        assert_eq!(
            index
                .headings
                .get("/workspace/notes/Topic.md")
                .and_then(|headings| headings.first())
                .map(|heading| heading.text.as_str()),
            Some("Local Topic")
        );
        assert_eq!(
            index
                .backlinks
                .get("/workspace/notes/Topic.md")
                .and_then(|links| links.first())
                .map(|link| (
                    link.source_name.as_str(),
                    link.link_text.as_str(),
                    link.line_number
                )),
            Some(("Index", "主题", 2))
        );
        assert_eq!(
            index
                .backlinks
                .get("/workspace/notes/nested/Topic.md")
                .and_then(|links| links.first())
                .map(|link| link.context.as_str()),
            Some("链接 [[Topic|主题]] 和 [[nested/Topic]].")
        );
    }

    #[test]
    fn markdown_runtime_params_normalize_raw_payloads() {
        assert_eq!(
            markdown_content_params_from_payload(json!({ "content": "  # Title  " })),
            "  # Title  "
        );
        assert_eq!(
            markdown_content_params_from_payload(json!({ "content": 42 })),
            ""
        );

        let (content, source_path) = markdown_diagnostics_params_from_payload(json!({
            "content": "  Text[^missing]  ",
            "sourcePath": " notes\\draft.md "
        }));
        assert_eq!(content, "  Text[^missing]  ");
        assert_eq!(source_path, "notes\\draft.md");

        let (workspace_path, files) = markdown_link_index_params_from_payload(json!({
            "workspace_path": " /workspace/notes ",
            "files": [
                {
                    "path": " /workspace/notes/Index.md ",
                    "content": " [[Topic]] "
                },
                {
                    "path": 42,
                    "content": false
                }
            ]
        }));

        assert_eq!(workspace_path, "/workspace/notes");
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "/workspace/notes/Index.md");
        assert_eq!(files[0].content, " [[Topic]] ");
        assert_eq!(files[1].path, "");
        assert_eq!(files[1].content, "");

        let (missing_workspace, missing_files) =
            markdown_link_index_params_from_payload(json!(false));
        assert_eq!(missing_workspace, "");
        assert!(missing_files.is_empty());
    }
}
