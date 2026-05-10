use pulldown_cmark::{CodeBlockKind, Event, Options, Parser, Tag, TagEnd};
use serde::Deserialize;
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;
use std::sync::LazyLock;

mod latex_to_mathml;

static SYNTAX_SET: LazyLock<SyntaxSet> = LazyLock::new(SyntaxSet::load_defaults_newlines);
static THEME_SET: LazyLock<ThemeSet> = LazyLock::new(ThemeSet::load_defaults);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownPreviewOptions {
    #[serde(default = "default_true")]
    pub source_anchors: bool,
    #[serde(default = "default_true")]
    pub highlight_code: bool,
    #[serde(default = "default_true")]
    pub render_math: bool,
    #[serde(default = "default_theme")]
    pub highlight_theme: String,
}

fn default_true() -> bool { true }
fn default_theme() -> String { "InspiredGitHub".to_string() }

impl Default for MarkdownPreviewOptions {
    fn default() -> Self {
        Self {
            source_anchors: true,
            highlight_code: true,
            render_math: true,
            highlight_theme: default_theme(),
        }
    }
}
fn resolve_language_alias(lang: &str) -> &str {
    match lang {
        "js" | "jsx" => "javascript",
        "ts" | "tsx" => "typescript",
        "sh" | "zsh" => "bash",
        "tex" => "latex",
        "md" => "markdown",
        "console" | "terminal" => "shell",
        "html" | "svg" | "vue" => "xml",
        other => other,
    }
}

fn highlight_code(code: &str, lang: &str, theme_name: &str) -> String {
    let resolved = resolve_language_alias(lang);
    let syntax = SYNTAX_SET
        .find_syntax_by_token(resolved)
        .unwrap_or_else(|| SYNTAX_SET.find_syntax_plain_text());
    let theme = THEME_SET.themes.get(theme_name).unwrap_or_else(|| {
        THEME_SET.themes.values().next().unwrap()
    });
    match highlighted_html_for_string(code, &SYNTAX_SET, syntax, theme) {
        Ok(html) => html,
        Err(_) => format!("<pre><code>{}</code></pre>", escape_html(code)),
    }
}

fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
    out
}

fn render_math_to_mathml(latex: &str, display: bool) -> String {
    match latex_to_mathml::convert(latex, display) {
        Ok(mathml) => mathml,
        Err(_) => {
            let escaped = escape_html(latex);
            if display {
                format!("<pre class=\"math-error\"><code>{escaped}</code></pre>")
            } else {
                format!("<code class=\"math-error\">{escaped}</code>")
            }
        }
    }
}

struct SourceAnchor {
    kind: &'static str,
    start_line: usize,
    end_line: usize,
    start_offset: usize,
    end_offset: usize,
}

impl SourceAnchor {
    fn attrs(&self) -> String {
        format!(
            " class=\"md-preview-source-anchor\" data-source-kind=\"{}\" data-source-start-line=\"{}\" data-source-end-line=\"{}\" data-source-start-offset=\"{}\" data-source-end-offset=\"{}\"",
            self.kind, self.start_line, self.end_line, self.start_offset, self.end_offset
        )
    }
}

fn tag_to_source_kind(tag: &Tag) -> Option<&'static str> {
    match tag {
        Tag::Heading { .. } => Some("heading"),
        Tag::Paragraph => Some("paragraph"),
        Tag::BlockQuote(_) => Some("blockquote"),
        Tag::CodeBlock(_) => Some("code"),
        Tag::List(_) => Some("list"),
        Tag::Item => Some("listItem"),
        Tag::Table(_) => Some("table"),
        Tag::TableRow => Some("tableRow"),
        Tag::TableCell => Some("tableCell"),
        Tag::FootnoteDefinition(_) => Some("footnoteDefinition"),
        _ => None,
    }
}

#[tauri::command]
pub fn markdown_preview_render(
    content: String,
    options: Option<MarkdownPreviewOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();
    let mut parser_opts = Options::empty();
    parser_opts.insert(Options::ENABLE_GFM);
    parser_opts.insert(Options::ENABLE_MATH);
    parser_opts.insert(Options::ENABLE_TABLES);
    parser_opts.insert(Options::ENABLE_FOOTNOTES);
    parser_opts.insert(Options::ENABLE_STRIKETHROUGH);
    parser_opts.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&content, parser_opts);
    let events: Vec<(Event, Option<std::ops::Range<usize>>)> = parser
        .into_offset_iter()
        .map(|(event, range)| (event, Some(range)))
        .collect();

    let mut html = String::with_capacity(content.len() * 2);
    render_events(&events, &content, &opts, &mut html);
    Ok(html)
}

fn offset_to_line(content: &str, offset: usize) -> usize {
    content[..offset.min(content.len())].matches('\n').count() + 1
}

fn render_events(
    events: &[(Event, Option<std::ops::Range<usize>>)],
    content: &str,
    opts: &MarkdownPreviewOptions,
    html: &mut String,
) {
    let mut code_buf = String::new();
    let mut code_lang = String::new();
    let mut in_code_block = false;

    for (event, range) in events {
        match event {
            Event::Start(tag) => {
                let anchor = if opts.source_anchors {
                    if let (Some(kind), Some(r)) = (tag_to_source_kind(tag), range) {
                        Some(SourceAnchor {
                            kind,
                            start_line: offset_to_line(content, r.start),
                            end_line: offset_to_line(content, r.end),
                            start_offset: r.start,
                            end_offset: r.end,
                        })
                    } else {
                        None
                    }
                } else {
                    None
                };
                let attrs = anchor.as_ref().map(|a| a.attrs()).unwrap_or_default();

                match tag {
                    Tag::Heading { level, .. } => {
                        html.push_str(&format!("<h{}{attrs}>", *level as u8));
                    }
                    Tag::Paragraph => html.push_str(&format!("<p{attrs}>")),
                    Tag::BlockQuote(_) => html.push_str(&format!("<blockquote{attrs}>")),
                    Tag::CodeBlock(kind) => {
                        in_code_block = true;
                        code_buf.clear();
                        code_lang = match kind {
                            CodeBlockKind::Fenced(lang) => lang.split_whitespace().next().unwrap_or("").to_string(),
                            CodeBlockKind::Indented => String::new(),
                        };
                    }
                    Tag::List(Some(start)) => html.push_str(&format!("<ol start=\"{start}\"{attrs}>")),
                    Tag::List(None) => html.push_str(&format!("<ul{attrs}>")),
                    Tag::Item => html.push_str(&format!("<li{attrs}>")),
                    Tag::Table(_) => html.push_str(&format!("<table{attrs}>")),
                    Tag::TableHead => html.push_str("<thead><tr>"),
                    Tag::TableRow => html.push_str(&format!("<tr{attrs}>")),
                    Tag::TableCell => html.push_str(&format!("<td{attrs}>")),
                    Tag::Emphasis => html.push_str("<em>"),
                    Tag::Strong => html.push_str("<strong>"),
                    Tag::Strikethrough => html.push_str("<del>"),
                    Tag::Link { dest_url, title, .. } => {
                        html.push_str(&format!("<a href=\"{}\"", escape_html(dest_url)));
                        if !title.is_empty() {
                            html.push_str(&format!(" title=\"{}\"", escape_html(title)));
                        }
                        html.push('>');
                    }
                    Tag::Image { dest_url, title, .. } => {
                        html.push_str(&format!("<img src=\"{}\"", escape_html(dest_url)));
                        if !title.is_empty() {
                            html.push_str(&format!(" title=\"{}\"", escape_html(title)));
                        }
                        html.push_str(" alt=\"");
                    }
                    Tag::FootnoteDefinition(label) => {
                        html.push_str(&format!("<div class=\"footnote-definition\"{attrs} id=\"fn-{}\">", escape_html(label)));
                    }
                    _ => {}
                }
            }
            Event::End(tag_end) => match tag_end {
                TagEnd::Heading(level) => html.push_str(&format!("</h{}>", *level as u8)),
                TagEnd::Paragraph => html.push_str("</p>"),
                TagEnd::BlockQuote(_) => html.push_str("</blockquote>"),
                TagEnd::CodeBlock => {
                    in_code_block = false;
                    if opts.highlight_code && !code_lang.is_empty() {
                        html.push_str(&highlight_code(&code_buf, &code_lang, &opts.highlight_theme));
                    } else {
                        html.push_str("<pre><code");
                        if !code_lang.is_empty() {
                            html.push_str(&format!(" class=\"language-{}\"", escape_html(&code_lang)));
                        }
                        html.push('>');
                        html.push_str(&escape_html(&code_buf));
                        html.push_str("</code></pre>");
                    }
                }
                TagEnd::List(true) => html.push_str("</ol>"),
                TagEnd::List(false) => html.push_str("</ul>"),
                TagEnd::Item => html.push_str("</li>"),
                TagEnd::Table => html.push_str("</table>"),
                TagEnd::TableHead => html.push_str("</tr></thead>"),
                TagEnd::TableRow => html.push_str("</tr>"),
                TagEnd::TableCell => html.push_str("</td>"),
                TagEnd::Emphasis => html.push_str("</em>"),
                TagEnd::Strong => html.push_str("</strong>"),
                TagEnd::Strikethrough => html.push_str("</del>"),
                TagEnd::Link => html.push_str("</a>"),
                TagEnd::Image => html.push_str("\" />"),
                TagEnd::FootnoteDefinition => html.push_str("</div>"),
                _ => {}
            },
            Event::Text(text) => {
                if in_code_block {
                    code_buf.push_str(text);
                } else {
                    html.push_str(&escape_html(text));
                }
            }
            Event::Code(code) => {
                html.push_str("<code>");
                html.push_str(&escape_html(code));
                html.push_str("</code>");
            }
            Event::SoftBreak => html.push('\n'),
            Event::HardBreak => html.push_str("<br />"),
            Event::Rule => {
                if opts.source_anchors {
                    if let Some(r) = range {
                        let anchor = SourceAnchor {
                            kind: "thematicBreak",
                            start_line: offset_to_line(content, r.start),
                            end_line: offset_to_line(content, r.end),
                            start_offset: r.start,
                            end_offset: r.end,
                        };
                        html.push_str(&format!("<hr{} />", anchor.attrs()));
                    } else {
                        html.push_str("<hr />");
                    }
                } else {
                    html.push_str("<hr />");
                }
            }
            Event::Html(raw) | Event::InlineHtml(raw) => html.push_str(raw),
            Event::FootnoteReference(label) => {
                html.push_str(&format!("<sup class=\"footnote-ref\"><a href=\"#fn-{}\">{}</a></sup>", escape_html(label), escape_html(label)));
            }
            Event::TaskListMarker(checked) => {
                if *checked {
                    html.push_str("<input type=\"checkbox\" checked=\"\" disabled=\"\" /> ");
                } else {
                    html.push_str("<input type=\"checkbox\" disabled=\"\" /> ");
                }
            }
            Event::InlineMath(latex) => {
                if opts.render_math {
                    html.push_str(&render_math_to_mathml(latex, false));
                } else {
                    html.push_str(&format!("<code class=\"math-inline\">{}</code>", escape_html(latex)));
                }
            }
            Event::DisplayMath(latex) => {
                if opts.render_math {
                    html.push_str(&render_math_to_mathml(latex, true));
                } else {
                    html.push_str(&format!("<pre class=\"math-display\"><code>{}</code></pre>", escape_html(latex)));
                }
            }
        }
    }
}
