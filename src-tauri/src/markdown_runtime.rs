use markdown::mdast::Node;
use markdown::unist::Position;
use markdown::{to_mdast, Constructs, ParseOptions};
use serde::Serialize;

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

#[tauri::command]
pub async fn markdown_extract_headings(
    content: String,
) -> Result<Vec<MarkdownHeadingItem>, String> {
    extract_markdown_headings(&content)
}

#[cfg(test)]
mod tests {
    use super::extract_markdown_headings;

    #[test]
    fn uses_utf16_offsets_for_non_ascii_markdown() {
        let content = "前言\n## 标题\n";
        let items = extract_markdown_headings(content).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].text, "标题");
        assert_eq!(items[0].offset, 3);
        assert_eq!(items[0].line, Some(2));
    }
}
