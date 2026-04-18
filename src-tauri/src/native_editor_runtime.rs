use crate::native_editor_bridge::{
    NativeEditorApplyExternalContentRequest, NativeEditorApplyTransactionRequest,
    NativeEditorCitationEditContext, NativeEditorCitationEntry, NativeEditorCitationReplacePlan,
    NativeEditorCitationTrigger, NativeEditorCommand, NativeEditorDocumentSnapshot,
    NativeEditorDocumentState, NativeEditorDocumentStateRequest, NativeEditorEvent,
    NativeEditorEventPayload, NativeEditorFileDropInsertionPlan,
    NativeEditorInspectInteractionRequest, NativeEditorInteractionContextSnapshot,
    NativeEditorOpenDocumentRequest, NativeEditorPlanCitationReplacementRequest,
    NativeEditorPlanFileDropInsertionRequest, NativeEditorPresentationLine,
    NativeEditorPresentationMark, NativeEditorPresentationSnapshot,
    NativeEditorPresentationSnapshotRequest, NativeEditorRecordWorkflowEventRequest,
    NativeEditorSelectionRange, NativeEditorSessionSnapshot, NativeEditorSessionStateSnapshot,
    NativeEditorSetDiagnosticsRequest, NativeEditorSetOutlineContextRequest,
    NativeEditorSetSelectionsRequest, NativeEditorWikiLinkMatch, NATIVE_EDITOR_EVENT,
};
use crate::process_utils::background_tokio_command;
use regex_lite::Regex;
use serde_json::to_string;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};
use tree_sitter_md::MarkdownParser;

const READY_TIMEOUT_MS: u64 = 3_000;
const SHUTDOWN_TIMEOUT_MS: u64 = 2_000;

struct ActiveNativeEditorSession {
    session_id: String,
    helper_path: PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
    stdin: Arc<Mutex<ChildStdin>>,
    state_cache: Arc<Mutex<NativeEditorSessionStateSnapshot>>,
    text_cache: Arc<Mutex<HashMap<String, String>>>,
    handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct NativeEditorRuntimeState {
    inner: Arc<Mutex<Option<ActiveNativeEditorSession>>>,
}

fn resolve_helper_binary_name() -> &'static str {
    if cfg!(windows) {
        "altals-native-editor-app.exe"
    } else {
        "altals-native-editor-app"
    }
}

fn helper_binary_candidates<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let binary_name = resolve_helper_binary_name();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![
        manifest_dir.join("target").join("debug").join(binary_name),
        manifest_dir
            .join("target")
            .join("release")
            .join(binary_name),
    ];

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(binary_name));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(binary_name));
        candidates.push(resource_dir.join("bin").join(binary_name));
    }

    candidates
}

fn resolve_helper_binary_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("ALTALS_NATIVE_EDITOR_BIN") {
        let path = PathBuf::from(explicit);
        if path.exists() {
            return Ok(path);
        }
    }

    helper_binary_candidates(app)
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| "Native editor helper binary is unavailable.".to_string())
}

async fn write_command(
    stdin: &Arc<Mutex<ChildStdin>>,
    command: &NativeEditorCommand,
) -> Result<(), String> {
    let serialized = to_string(command)
        .map_err(|error| format!("Failed to serialize native editor command: {error}"))?;
    let mut lock = stdin.lock().await;
    lock.write_all(format!("{serialized}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to write native editor command: {error}"))?;
    lock.flush()
        .await
        .map_err(|error| format!("Failed to flush native editor command: {error}"))?;
    Ok(())
}

fn emit_native_editor_event<R: Runtime>(
    app: &AppHandle<R>,
    session_id: String,
    event: NativeEditorEvent,
) {
    let _ = app.emit(
        NATIVE_EDITOR_EVENT,
        NativeEditorEventPayload { session_id, event },
    );
}

fn build_session_snapshot(
    session_id: String,
    helper_path: &PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
) -> NativeEditorSessionSnapshot {
    NativeEditorSessionSnapshot {
        session_id,
        helper_path: helper_path.display().to_string(),
        process_id,
        protocol_version,
        started: true,
    }
}

fn build_session_state_snapshot(
    session_id: String,
    helper_path: &PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
) -> NativeEditorSessionStateSnapshot {
    NativeEditorSessionStateSnapshot {
        session_id,
        helper_path: helper_path.display().to_string(),
        process_id,
        protocol_version,
        started: true,
        connected: false,
        last_event_kind: String::new(),
        open_documents: Vec::new(),
    }
}

fn reduce_state_cache(cache: &mut NativeEditorSessionStateSnapshot, event: &NativeEditorEvent) {
    cache.last_event_kind = match event {
        NativeEditorEvent::Ready { .. } => "ready",
        NativeEditorEvent::Pong { .. } => "pong",
        NativeEditorEvent::DocumentOpened { .. } => "documentOpened",
        NativeEditorEvent::ContentChanged { .. } => "contentChanged",
        NativeEditorEvent::SessionState { .. } => "sessionState",
        NativeEditorEvent::Stopped { .. } => "stopped",
        NativeEditorEvent::Error { .. } => "error",
    }
    .to_string();

    match event {
        NativeEditorEvent::Ready {
            session_id,
            protocol_version,
        } => {
            cache.session_id = session_id.clone();
            cache.protocol_version = *protocol_version;
            cache.connected = true;
        }
        NativeEditorEvent::DocumentOpened {
            path,
            text_length,
            version,
        } => {
            upsert_document_state(
                &mut cache.open_documents,
                path,
                *text_length,
                *version,
                None,
            );
        }
        NativeEditorEvent::ContentChanged {
            path,
            text,
            text_length,
            version,
            ..
        } => {
            let preview = if text.chars().count() > 240 {
                let head: String = text.chars().take(240).collect();
                format!("{head}\n…")
            } else {
                text.clone()
            };
            upsert_document_state(
                &mut cache.open_documents,
                path,
                *text_length,
                *version,
                Some(preview),
            );
        }
        NativeEditorEvent::SessionState { open_documents } => {
            cache.open_documents = open_documents.clone();
            cache.connected = true;
        }
        NativeEditorEvent::Stopped { .. } => {
            cache.connected = false;
        }
        NativeEditorEvent::Pong { .. } | NativeEditorEvent::Error { .. } => {}
    }
}

fn upsert_document_state(
    documents: &mut Vec<NativeEditorDocumentState>,
    path: &str,
    text_length: usize,
    version: u64,
    text_preview: Option<String>,
) {
    if let Some(existing) = documents.iter_mut().find(|document| document.path == path) {
        existing.text_length = text_length;
        existing.version = version;
        if let Some(preview) = text_preview {
            existing.text_preview = preview;
        }
        return;
    }

    documents.push(NativeEditorDocumentState {
        path: path.to_string(),
        text_length,
        version,
        selections: Vec::new(),
        cursor: None,
        viewport: None,
        text_preview: text_preview.unwrap_or_default(),
        diagnostics: Vec::new(),
        outline_context: None,
        last_workflow_event: None,
    });
}

fn build_document_snapshot(
    document: &NativeEditorDocumentState,
    text_cache: &HashMap<String, String>,
) -> NativeEditorDocumentSnapshot {
    NativeEditorDocumentSnapshot {
        path: document.path.clone(),
        text_length: document.text_length,
        version: document.version,
        selections: document.selections.clone(),
        cursor: document.cursor.clone(),
        viewport: document.viewport.clone(),
        text_preview: document.text_preview.clone(),
        text: text_cache.get(&document.path).cloned().unwrap_or_default(),
        diagnostics: document.diagnostics.clone(),
        outline_context: document.outline_context.clone(),
        last_workflow_event: document.last_workflow_event.clone(),
    }
}

const CITE_CMDS_PATTERN: &str =
    "cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite";

fn wiki_link_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wiki link regex should compile"))
}

fn markdown_citation_group_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"\[([^\[\]]*@[a-zA-Z][\w.-]*[^\[\]]*)\]")
            .expect("markdown citation group regex should compile")
    })
}

fn latex_citation_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(&format!(r"\\({CITE_CMDS_PATTERN})\{{([^}}]*)\}}"))
            .expect("latex citation regex should compile")
    })
}

fn latex_citation_trigger_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(&format!(r"\\({CITE_CMDS_PATTERN})\{{([^}}]*)$"))
            .expect("latex citation trigger regex should compile")
    })
}

fn markdown_cite_key_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"@([a-zA-Z][\w.-]*)").expect("markdown cite key regex should compile")
    })
}

fn clamp_native_offset(text: &str, offset: usize) -> usize {
    offset.min(text.len())
}

fn line_range_for_offset(text: &str, offset: usize) -> (usize, usize, &str, &str) {
    let safe_offset = clamp_native_offset(text, offset);
    let line_start = text[..safe_offset]
        .rfind('\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let line_end = text[safe_offset..]
        .find('\n')
        .map(|index| safe_offset + index)
        .unwrap_or_else(|| text.len());
    let line_text = &text[line_start..line_end];
    let text_before = &text[line_start..safe_offset];
    (line_start, line_end, line_text, text_before)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePresentationLanguage {
    Markdown,
    Latex,
    PlainText,
}

impl NativePresentationLanguage {
    fn from_path(path: &str) -> Self {
        if is_markdown_path(path) {
            Self::Markdown
        } else if is_latex_editor_path(path) {
            Self::Latex
        } else {
            Self::PlainText
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Markdown => "markdown",
            Self::Latex => "latex",
            Self::PlainText => "text",
        }
    }

    fn parser_name(self) -> &'static str {
        match self {
            Self::Markdown => "tree-sitter-md",
            Self::Latex => "codebook-tree-sitter-latex",
            Self::PlainText => "plain-text",
        }
    }
}

fn line_number_for_offset(text: &str, offset: usize) -> u32 {
    let safe_offset = clamp_native_offset(text, offset);
    text[..safe_offset]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count() as u32
        + 1
}

fn normalize_presentation_viewport(
    text: &str,
    selection: Option<&NativeEditorSelectionRange>,
    viewport_from: Option<usize>,
    viewport_to: Option<usize>,
) -> (usize, usize) {
    let text_length = text.len();
    if text_length == 0 {
        return (0, 0);
    }

    let fallback_cursor = selection
        .map(|selection| clamp_native_offset(text, selection.head))
        .unwrap_or(0);

    let (raw_from, raw_to) = match (viewport_from, viewport_to) {
        (Some(from), Some(to)) => (from.min(to), from.max(to)),
        _ => {
            let start = fallback_cursor.saturating_sub(2_048);
            let end = (fallback_cursor + 2_048).min(text_length);
            (start, end)
        }
    };
    let raw_from = raw_from.min(text_length);
    let raw_to = raw_to.min(text_length);

    let start = text[..raw_from]
        .rfind('\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let end = text[raw_to..]
        .find('\n')
        .map(|index| raw_to + index)
        .unwrap_or(text_length);
    (start.min(text_length), end.min(text_length))
}

fn build_presentation_lines(
    text: &str,
    viewport_from: usize,
    viewport_to: usize,
) -> Vec<NativeEditorPresentationLine> {
    if text.is_empty() {
        return vec![NativeEditorPresentationLine {
            line: 1,
            from: 0,
            to: 0,
            text: String::new(),
        }];
    }

    let mut lines = Vec::new();
    let mut line_start = 0usize;
    let mut line_number = 1u32;

    for segment in text.split_inclusive('\n') {
        let has_newline = segment.ends_with('\n');
        let content = if has_newline {
            &segment[..segment.len().saturating_sub(1)]
        } else {
            segment
        };
        let line_end = line_start + content.len();
        let overlaps = line_end >= viewport_from && line_start <= viewport_to;
        if overlaps {
            lines.push(NativeEditorPresentationLine {
                line: line_number,
                from: line_start,
                to: line_end,
                text: content.to_string(),
            });
        }
        line_start = line_end + usize::from(has_newline);
        line_number += 1;
    }

    if !text.ends_with('\n') && lines.is_empty() {
        lines.push(NativeEditorPresentationLine {
            line: 1,
            from: 0,
            to: text.len(),
            text: text.to_string(),
        });
    }

    lines
}

fn push_presentation_mark(
    marks: &mut Vec<NativeEditorPresentationMark>,
    viewport_from: usize,
    viewport_to: usize,
    from: usize,
    to: usize,
    class_name: &str,
    source: &str,
    node_kind: &str,
) {
    if to <= viewport_from || from >= viewport_to || from >= to || class_name.trim().is_empty() {
        return;
    }

    marks.push(NativeEditorPresentationMark {
        from: from.max(viewport_from),
        to: to.min(viewport_to),
        class_name: class_name.to_string(),
        source: source.to_string(),
        node_kind: node_kind.to_string(),
    });
}

fn classify_markdown_node(node_kind: &str) -> Option<&'static str> {
    match node_kind {
        "atx_heading" => Some("syntax.heading.atx"),
        "setext_heading" => Some("syntax.heading.setext"),
        "paragraph" => Some("syntax.paragraph"),
        "block_quote" | "block_quote_marker" => Some("syntax.quote"),
        "fenced_code_block" | "indented_code_block" | "code_fence_content" => {
            Some("syntax.code-block")
        }
        "fenced_code_block_delimiter" | "code_span_delimiter" => Some("syntax.punctuation"),
        "code_span" => Some("syntax.code"),
        "list" | "list_item" => Some("syntax.list"),
        "list_marker_minus"
        | "list_marker_plus"
        | "list_marker_star"
        | "list_marker_dot"
        | "list_marker_parenthesis"
        | "task_list_marker_checked"
        | "task_list_marker_unchecked" => Some("syntax.list-marker"),
        "pipe_table" | "pipe_table_header" | "pipe_table_row" | "pipe_table_cell" => {
            Some("syntax.table")
        }
        "pipe_table_delimiter_row" | "pipe_table_delimiter_cell" => Some("syntax.table-delimiter"),
        "pipe_table_align_left" | "pipe_table_align_right" => Some("syntax.table-align"),
        "thematic_break" => Some("syntax.rule"),
        "html_block" | "html_tag" => Some("syntax.html"),
        "inline_link"
        | "full_reference_link"
        | "collapsed_reference_link"
        | "shortcut_link"
        | "uri_autolink"
        | "email_autolink" => Some("syntax.link"),
        "link_text" | "image_description" => Some("syntax.link-text"),
        "link_destination" => Some("syntax.link-destination"),
        "link_label" => Some("syntax.link-label"),
        "link_title" => Some("syntax.link-title"),
        "image" => Some("syntax.image"),
        "emphasis" | "emphasis_delimiter" => Some("syntax.emphasis"),
        "strong_emphasis" | "strikethrough" => Some("syntax.strong"),
        "backslash_escape" => Some("syntax.escape"),
        "latex_block" => Some("syntax.math"),
        _ if node_kind.contains("heading") => Some("syntax.heading"),
        _ => None,
    }
}

fn classify_latex_node(node_kind: &str) -> Option<&'static str> {
    match node_kind {
        "document" | "section" | "subsection" | "subsubsection" | "paragraph" | "chapter"
        | "part" => Some("syntax.section"),
        "curly_group" | "curly_group_text" | "displayed_equation" | "inline_formula"
        | "math_environment" | "math_delimiter" => Some("syntax.math"),
        "command" | "generic_command" | "begin" | "end" => Some("syntax.command"),
        "label_definition" | "label_reference" => Some("syntax.reference"),
        "citation" | "citation_command" => Some("syntax.citation-command"),
        "comment" => Some("syntax.comment"),
        "environment" | "begin_group" | "end_group" => Some("syntax.environment"),
        _ if node_kind.starts_with("\\cite")
            || node_kind.starts_with("\\footcite")
            || node_kind.starts_with("\\parencite")
            || node_kind.starts_with("\\textcite")
            || node_kind.starts_with("\\autocite")
            || node_kind.starts_with("\\nocite") =>
        {
            Some("syntax.citation-command")
        }
        _ if node_kind.starts_with("\\section")
            || node_kind.starts_with("\\subsection")
            || node_kind.starts_with("\\subsubsection")
            || node_kind.starts_with("\\part") =>
        {
            Some("syntax.section")
        }
        _ if node_kind.starts_with('\\') => Some("syntax.command"),
        _ if node_kind.contains("command") => Some("syntax.command"),
        _ if node_kind.contains("math") || node_kind.contains("equation") => Some("syntax.math"),
        _ if node_kind.contains("comment") => Some("syntax.comment"),
        _ if node_kind.contains("section") => Some("syntax.section"),
        _ if node_kind.contains("label") || node_kind.contains("ref") => Some("syntax.reference"),
        _ => None,
    }
}

fn collect_markdown_syntax_marks_with_parser(
    text: &str,
    viewport_from: usize,
    viewport_to: usize,
) -> Vec<NativeEditorPresentationMark> {
    let mut parser = MarkdownParser::default();
    let Some(tree) = parser.parse(text.as_bytes(), None) else {
        return Vec::new();
    };

    fn walk(
        cursor: &mut tree_sitter_md::MarkdownCursor<'_>,
        viewport_from: usize,
        viewport_to: usize,
        marks: &mut Vec<NativeEditorPresentationMark>,
    ) {
        let node = cursor.node();
        if node.end_byte() > viewport_from && node.start_byte() < viewport_to && node.is_named() {
            if let Some(class_name) = classify_markdown_node(node.kind()) {
                push_presentation_mark(
                    marks,
                    viewport_from,
                    viewport_to,
                    node.start_byte(),
                    node.end_byte(),
                    class_name,
                    if cursor.is_inline() {
                        "syntax-inline"
                    } else {
                        "syntax-block"
                    },
                    node.kind(),
                );
            }
        }

        if cursor.goto_first_child() {
            loop {
                walk(cursor, viewport_from, viewport_to, marks);
                if !cursor.goto_next_sibling() {
                    break;
                }
            }
            cursor.goto_parent();
        }
    }

    let mut marks = Vec::new();
    let mut cursor = tree.walk();
    walk(&mut cursor, viewport_from, viewport_to, &mut marks);
    marks
}

fn collect_tree_sitter_latex_marks(
    text: &str,
    viewport_from: usize,
    viewport_to: usize,
) -> Vec<NativeEditorPresentationMark> {
    let mut parser = tree_sitter::Parser::new();
    if parser
        .set_language(&codebook_tree_sitter_latex::LANGUAGE.into())
        .is_err()
    {
        return Vec::new();
    }

    let Some(tree) = parser.parse(text, None) else {
        return Vec::new();
    };

    fn walk(
        node: tree_sitter::Node<'_>,
        viewport_from: usize,
        viewport_to: usize,
        marks: &mut Vec<NativeEditorPresentationMark>,
    ) {
        if node.end_byte() <= viewport_from || node.start_byte() >= viewport_to {
            return;
        }

        if node.is_named() {
            if let Some(class_name) = classify_latex_node(node.kind()) {
                push_presentation_mark(
                    marks,
                    viewport_from,
                    viewport_to,
                    node.start_byte(),
                    node.end_byte(),
                    class_name,
                    "syntax-latex",
                    node.kind(),
                );
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            walk(child, viewport_from, viewport_to, marks);
        }
    }

    let mut marks = Vec::new();
    walk(tree.root_node(), viewport_from, viewport_to, &mut marks);
    marks
}

fn collect_syntax_marks(
    language: NativePresentationLanguage,
    text: &str,
    viewport_from: usize,
    viewport_to: usize,
) -> Vec<NativeEditorPresentationMark> {
    match language {
        NativePresentationLanguage::Markdown => {
            collect_markdown_syntax_marks_with_parser(text, viewport_from, viewport_to)
        }
        NativePresentationLanguage::Latex => {
            collect_tree_sitter_latex_marks(text, viewport_from, viewport_to)
        }
        NativePresentationLanguage::PlainText => Vec::new(),
    }
}

fn collect_semantic_marks(
    path: &str,
    text: &str,
    viewport_from: usize,
    viewport_to: usize,
) -> Vec<NativeEditorPresentationMark> {
    let mut marks = Vec::new();

    if is_markdown_path(path) {
        wiki_link_regex().find_iter(text).for_each(|capture| {
            push_presentation_mark(
                &mut marks,
                viewport_from,
                viewport_to,
                capture.start(),
                capture.end(),
                "semantic.wikilink",
                "semantic",
                "wiki-link",
            );
        });

        markdown_citation_group_regex()
            .find_iter(text)
            .for_each(|capture| {
                push_presentation_mark(
                    &mut marks,
                    viewport_from,
                    viewport_to,
                    capture.start(),
                    capture.end(),
                    "semantic.citation",
                    "semantic",
                    "markdown-citation",
                );
            });
    }

    if is_latex_editor_path(path) {
        latex_citation_regex().find_iter(text).for_each(|capture| {
            push_presentation_mark(
                &mut marks,
                viewport_from,
                viewport_to,
                capture.start(),
                capture.end(),
                "semantic.latex-citation",
                "semantic",
                "latex-citation",
            );
        });
    }

    marks
}

fn build_presentation_snapshot(
    path: &str,
    text: &str,
    selection: Option<NativeEditorSelectionRange>,
    viewport_from: Option<usize>,
    viewport_to: Option<usize>,
) -> NativeEditorPresentationSnapshot {
    let language = NativePresentationLanguage::from_path(path);
    let (viewport_from, viewport_to) =
        normalize_presentation_viewport(text, selection.as_ref(), viewport_from, viewport_to);
    let lines = build_presentation_lines(text, viewport_from, viewport_to);
    let mut marks = collect_syntax_marks(language, text, viewport_from, viewport_to);
    marks.extend(collect_semantic_marks(
        path,
        text,
        viewport_from,
        viewport_to,
    ));
    marks.sort_by(|left, right| {
        left.from
            .cmp(&right.from)
            .then(left.to.cmp(&right.to))
            .then(left.class_name.cmp(&right.class_name))
    });
    marks.dedup_by(|left, right| {
        left.from == right.from
            && left.to == right.to
            && left.class_name == right.class_name
            && left.source == right.source
            && left.node_kind == right.node_kind
    });

    NativeEditorPresentationSnapshot {
        path: path.to_string(),
        language: language.as_str().to_string(),
        parser: language.parser_name().to_string(),
        text_length: text.len(),
        viewport_from,
        viewport_to,
        active_line: selection
            .as_ref()
            .map(|selection| line_number_for_offset(text, selection.head)),
        selections: selection.into_iter().collect(),
        lines,
        marks,
    }
}

fn trim_wiki_link_target(raw: &str) -> String {
    let mut target = raw;
    if let Some(index) = target.find('|') {
        target = &target[..index];
    }
    if let Some(index) = target.find('#') {
        target = &target[..index];
    }
    target.trim().to_string()
}

fn detect_wiki_link_at_cursor(
    text: &str,
    cursor_offset: usize,
) -> Option<NativeEditorWikiLinkMatch> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in wiki_link_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let target_match = captures.get(1)?;
        let match_from = line_start + full_match.start();
        let match_to = line_start + full_match.end();
        if cursor_offset < match_from || cursor_offset >= match_to {
            continue;
        }
        let target = trim_wiki_link_target(target_match.as_str());
        if target.is_empty() {
            return None;
        }
        return Some(NativeEditorWikiLinkMatch {
            target,
            from: match_from,
            to: match_to,
        });
    }
    None
}

fn detect_markdown_citation_trigger(
    text: &str,
    cursor_offset: usize,
) -> Option<NativeEditorCitationTrigger> {
    let (line_start, _, _, text_before) = line_range_for_offset(text, cursor_offset);

    let last_bracket = text_before.rfind('[');
    let mut inside_brackets = false;
    if let Some(last_bracket) = last_bracket {
        let after_bracket = &text_before[last_bracket + 1..];
        if !after_bracket.contains(']') && after_bracket.contains('@') {
            inside_brackets = true;
        }
    }

    let mut at_idx = None;
    if inside_brackets {
        let last_bracket = last_bracket?;
        let after_bracket = &text_before[last_bracket + 1..];
        if let Some(last_at) = after_bracket.rfind('@') {
            at_idx = Some(last_bracket + 1 + last_at);
        }
    } else if let Some(last_at) = text_before.rfind('@') {
        let prev = if last_at == 0 {
            None
        } else {
            text_before[..last_at].chars().last()
        };
        if last_at == 0 || prev == Some('[') || prev.is_some_and(|ch| ch.is_whitespace()) {
            if !text_before[last_at..].contains(']') {
                at_idx = Some(last_at);
            }
        }
    }

    let at_idx = at_idx?;
    let query = text_before[at_idx + 1..].to_string();
    let abs_at = line_start + at_idx;
    let has_bracket_before = at_idx > 0 && text_before.as_bytes().get(at_idx - 1) == Some(&b'[');
    Some(NativeEditorCitationTrigger {
        query,
        trigger_from: if inside_brackets {
            abs_at
        } else if has_bracket_before {
            abs_at.saturating_sub(1)
        } else {
            abs_at
        },
        trigger_to: cursor_offset,
        inside_brackets,
        latex_command: None,
    })
}

fn detect_latex_citation_trigger(
    text: &str,
    cursor_offset: usize,
) -> Option<NativeEditorCitationTrigger> {
    let (line_start, _, _, text_before) = line_range_for_offset(text, cursor_offset);
    let captures = latex_citation_trigger_regex().captures(text_before)?;
    let command_name = captures.get(1)?.as_str();
    let inside_braces = captures.get(2)?.as_str();
    let last_comma = inside_braces.rfind(',');
    let query = last_comma
        .map(|index| inside_braces[index + 1..].trim().to_string())
        .unwrap_or_else(|| inside_braces.trim().to_string());
    let command_start = text_before.rfind(&format!("\\{command_name}"))?;
    Some(NativeEditorCitationTrigger {
        query: query.clone(),
        trigger_from: if let Some(last_comma) = last_comma {
            cursor_offset.saturating_sub(inside_braces[last_comma + 1..].trim().len())
        } else {
            line_start + command_start
        },
        trigger_to: cursor_offset,
        inside_brackets: last_comma.is_some(),
        latex_command: Some(command_name.to_string()),
    })
}

fn split_markdown_citation_parts(inner: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0_usize;
    let bytes = inner.as_bytes();
    let mut index = 0_usize;
    while index < bytes.len() {
        match bytes[index] {
            b';' => {
                parts.push(inner[start..index].trim().to_string());
                index += 1;
                start = index;
            }
            b',' => {
                let after = inner[index + 1..].trim_start();
                if after.starts_with('@') {
                    parts.push(inner[start..index].trim().to_string());
                    index += 1;
                    start = index;
                } else {
                    index += 1;
                }
            }
            _ => {
                index += 1;
            }
        }
    }
    parts.push(inner[start..].trim().to_string());
    parts.into_iter().filter(|part| !part.is_empty()).collect()
}

fn parse_markdown_citation_entries(full_match: &str) -> Vec<NativeEditorCitationEntry> {
    let inner = full_match
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(full_match);

    split_markdown_citation_parts(inner)
        .into_iter()
        .flat_map(|part| {
            let captures = markdown_cite_key_regex().captures(&part)?;
            let key_match = captures.get(0)?;
            let key_capture = captures.get(1)?;
            let key = key_capture.as_str().to_string();
            let after_key = part[key_match.end()..]
                .trim_start_matches(|ch: char| ch.is_whitespace() || ch == ',')
                .to_string();
            let prefix = part[..key_match.start()].trim().to_string();
            Some(NativeEditorCitationEntry {
                key,
                locator: after_key,
                prefix,
            })
        })
        .collect()
}

fn detect_markdown_citation_edit(
    text: &str,
    cursor_offset: usize,
) -> Option<NativeEditorCitationEditContext> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in markdown_citation_group_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let group_from = line_start + full_match.start();
        let group_to = line_start + full_match.end();
        if cursor_offset < group_from || cursor_offset > group_to {
            continue;
        }
        return Some(NativeEditorCitationEditContext {
            group_from,
            group_to,
            cites: parse_markdown_citation_entries(full_match.as_str()),
            latex_command: None,
        });
    }
    None
}

fn detect_latex_citation_edit(
    text: &str,
    cursor_offset: usize,
) -> Option<NativeEditorCitationEditContext> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in latex_citation_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let command_match = captures.get(1)?;
        let keys_match = captures.get(2)?;
        let group_from = line_start + full_match.start();
        let group_to = line_start + full_match.end();
        if cursor_offset < group_from || cursor_offset > group_to {
            continue;
        }
        let cites = keys_match
            .as_str()
            .split(',')
            .map(|key| key.trim())
            .filter(|key| !key.is_empty())
            .map(|key| NativeEditorCitationEntry {
                key: key.to_string(),
                locator: String::new(),
                prefix: String::new(),
            })
            .collect::<Vec<_>>();
        return Some(NativeEditorCitationEditContext {
            group_from,
            group_to,
            cites,
            latex_command: Some(command_match.as_str().to_string()),
        });
    }
    None
}

fn inspect_interaction_context(
    path: &str,
    text: &str,
    selection: Option<NativeEditorSelectionRange>,
) -> NativeEditorInteractionContextSnapshot {
    let selection = selection.unwrap_or(NativeEditorSelectionRange { anchor: 0, head: 0 });
    let cursor_offset = clamp_native_offset(text, selection.head);
    let has_selection = selection.anchor != selection.head;
    NativeEditorInteractionContextSnapshot {
        path: path.to_string(),
        has_selection,
        cursor_offset,
        wiki_link: if has_selection {
            None
        } else {
            detect_wiki_link_at_cursor(text, cursor_offset)
        },
        citation_trigger: if has_selection {
            None
        } else {
            detect_latex_citation_trigger(text, cursor_offset)
                .or_else(|| detect_markdown_citation_trigger(text, cursor_offset))
        },
        citation_edit: if has_selection {
            None
        } else {
            detect_markdown_citation_edit(text, cursor_offset)
                .or_else(|| detect_latex_citation_edit(text, cursor_offset))
        },
    }
}

fn build_markdown_citation_text(cites: &[NativeEditorCitationEntry]) -> String {
    if cites.is_empty() {
        return String::new();
    }

    let parts = cites
        .iter()
        .map(|cite| {
            let mut part = String::new();
            if !cite.prefix.trim().is_empty() {
                part.push_str(cite.prefix.trim());
                part.push(' ');
            }
            part.push('@');
            part.push_str(cite.key.trim());
            if !cite.locator.trim().is_empty() {
                part.push_str(", ");
                part.push_str(cite.locator.trim());
            }
            part
        })
        .collect::<Vec<_>>();
    format!("[{}]", parts.join("; "))
}

fn plan_citation_replacement(
    request: NativeEditorPlanCitationReplacementRequest,
) -> Option<NativeEditorCitationReplacePlan> {
    match request.operation.as_str() {
        "insert" => {
            let trigger = request.trigger?;
            let key = request.keys.first()?.trim();
            if key.is_empty() {
                return None;
            }
            let text = if let Some(command) = request
                .latex_command
                .clone()
                .or(trigger.latex_command.clone())
                .filter(|value| !value.trim().is_empty())
            {
                if trigger.inside_brackets {
                    key.to_string()
                } else {
                    format!(r"\{}{{{}}}", command, key)
                }
            } else if trigger.inside_brackets {
                format!("@{key}")
            } else {
                format!("[@{key}]")
            };
            Some(NativeEditorCitationReplacePlan {
                from: trigger.trigger_from,
                to: trigger.trigger_to,
                text,
            })
        }
        "update" => {
            let edit = request.edit?;
            let text = if let Some(command) = edit
                .latex_command
                .clone()
                .or(request.latex_command.clone())
                .filter(|value| !value.trim().is_empty())
            {
                let keys = request
                    .cites
                    .iter()
                    .map(|cite| cite.key.trim())
                    .filter(|key| !key.is_empty())
                    .collect::<Vec<_>>();
                format!(r"\{}{{{}}}", command, keys.join(", "))
            } else {
                build_markdown_citation_text(&request.cites)
            };
            Some(NativeEditorCitationReplacePlan {
                from: edit.group_from,
                to: edit.group_to,
                text,
            })
        }
        _ => None,
    }
}

fn path_extension_lowercase(path: &str) -> String {
    PathBuf::from(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default()
}

fn is_image_path(path: &str) -> bool {
    matches!(
        path_extension_lowercase(path).as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "ico"
    )
}

fn is_markdown_path(path: &str) -> bool {
    matches!(path_extension_lowercase(path).as_str(), "md" | "markdown")
}

fn is_latex_editor_path(path: &str) -> bool {
    matches!(
        path_extension_lowercase(path).as_str(),
        "tex" | "latex" | "cls" | "sty"
    )
}

fn relative_path_between_files(from_file: &str, to_file: &str) -> String {
    let from_dir = PathBuf::from(from_file)
        .parent()
        .map(PathBuf::from)
        .unwrap_or_default();
    pathdiff::diff_paths(to_file, from_dir)
        .unwrap_or_else(|| PathBuf::from(to_file))
        .to_string_lossy()
        .replace('\\', "/")
}

fn filename_from_path(path: &str) -> String {
    PathBuf::from(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .unwrap_or_default()
}

fn stem_from_path(path: &str) -> String {
    PathBuf::from(path)
        .file_stem()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .unwrap_or_default()
}

fn plan_file_drop_insertion(
    request: NativeEditorPlanFileDropInsertionRequest,
) -> Option<NativeEditorFileDropInsertionPlan> {
    let source_path = request.source_path.trim();
    if source_path.is_empty() || request.dropped_paths.is_empty() {
        return None;
    }

    let text = request
        .dropped_paths
        .iter()
        .map(|path| {
            let rel_path = relative_path_between_files(source_path, path);
            let file_name = filename_from_path(path);
            let stem = stem_from_path(path);

            if is_markdown_path(source_path) {
                if is_image_path(path) {
                    format!("![{}]({})", stem, rel_path)
                } else {
                    format!("[{}]({})", file_name, rel_path)
                }
            } else if is_latex_editor_path(source_path) {
                if is_image_path(path) {
                    format!(r"\includegraphics{{{}}}", rel_path)
                } else {
                    format!(r"\input{{{}}}", rel_path)
                }
            } else {
                rel_path
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    Some(NativeEditorFileDropInsertionPlan { text })
}

async fn wait_for_child(child: &mut Child) {
    let _ = child.wait().await;
}

#[tauri::command]
pub async fn native_editor_session_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<NativeEditorSessionSnapshot, String> {
    let mut guard = state.inner.lock().await;
    if let Some(existing) = guard.as_ref() {
        return Ok(build_session_snapshot(
            existing.session_id.clone(),
            &existing.helper_path,
            existing.process_id,
            existing.protocol_version,
        ));
    }

    let helper_path = resolve_helper_binary_path(&app)?;
    let mut child = background_tokio_command(&helper_path)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to spawn native editor helper: {error}"))?;

    let process_id = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Native editor helper stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Native editor helper stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take();

    let stdin = Arc::new(Mutex::new(stdin));
    let state_cache = Arc::new(Mutex::new(build_session_state_snapshot(
        "pending".to_string(),
        &helper_path,
        process_id,
        0,
    )));
    let text_cache = Arc::new(Mutex::new(HashMap::<String, String>::new()));
    let (ready_tx, ready_rx) = oneshot::channel::<(String, u32)>();
    let ready_sender = Arc::new(Mutex::new(Some(ready_tx)));
    let app_for_task = app.clone();
    let app_for_stderr = app.clone();
    let cache_for_task = state_cache.clone();
    let text_cache_for_task = text_cache.clone();

    let handle = tokio::spawn(async move {
        let mut child = child;
        let mut stdout_lines = BufReader::new(stdout).lines();
        let ready_sender_for_stdout = ready_sender.clone();

        let stderr_task = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut stderr_lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = stderr_lines.next_line().await {
                    emit_native_editor_event(
                        &app_for_stderr,
                        "pending".to_string(),
                        NativeEditorEvent::Error { message: line },
                    );
                }
            }
        });

        while let Ok(Some(line)) = stdout_lines.next_line().await {
            let parsed = match serde_json::from_str::<NativeEditorEvent>(&line) {
                Ok(event) => event,
                Err(error) => {
                    emit_native_editor_event(
                        &app_for_task,
                        "pending".to_string(),
                        NativeEditorEvent::Error {
                            message: format!("Failed to parse native editor event: {error}"),
                        },
                    );
                    continue;
                }
            };

            if let NativeEditorEvent::Ready {
                session_id,
                protocol_version,
            } = &parsed
            {
                if let Some(sender) = ready_sender_for_stdout.lock().await.take() {
                    let _ = sender.send((session_id.clone(), *protocol_version));
                }
            }

            let session_id = match &parsed {
                NativeEditorEvent::Ready { session_id, .. } => session_id.clone(),
                NativeEditorEvent::Stopped { session_id } => session_id.clone(),
                _ => "native-editor-session".to_string(),
            };
            {
                let mut cache = cache_for_task.lock().await;
                reduce_state_cache(&mut cache, &parsed);
            }
            match &parsed {
                NativeEditorEvent::ContentChanged { path, text, .. } => {
                    let mut text_cache = text_cache_for_task.lock().await;
                    text_cache.insert(path.clone(), text.clone());
                }
                NativeEditorEvent::Stopped { .. } => {
                    let mut text_cache = text_cache_for_task.lock().await;
                    text_cache.clear();
                }
                _ => {}
            }
            emit_native_editor_event(&app_for_task, session_id, parsed);
        }

        let _ = stderr_task.await;
        wait_for_child(&mut child).await;
    });

    let (session_id, protocol_version) = timeout(Duration::from_millis(READY_TIMEOUT_MS), ready_rx)
        .await
        .map_err(|_| "Timed out waiting for native editor helper readiness.".to_string())?
        .map_err(|_| "Native editor helper exited before signaling readiness.".to_string())?;

    {
        let mut cache = state_cache.lock().await;
        cache.session_id = session_id.clone();
        cache.protocol_version = protocol_version;
        cache.connected = true;
    }

    let snapshot = build_session_snapshot(
        session_id.clone(),
        &helper_path,
        process_id,
        protocol_version,
    );

    *guard = Some(ActiveNativeEditorSession {
        session_id,
        helper_path,
        process_id,
        protocol_version,
        stdin,
        state_cache,
        text_cache,
        handle,
    });

    Ok(snapshot)
}

#[tauri::command]
pub async fn native_editor_document_state(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorDocumentStateRequest,
) -> Result<Option<NativeEditorDocumentSnapshot>, String> {
    let (cache, text_cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (
            active.state_cache.clone(),
            active.text_cache.clone(),
            active.handle.is_finished(),
        )
    };

    if handle_finished {
        return Ok(None);
    }

    let snapshot = cache.lock().await.clone();
    let text_cache = text_cache.lock().await.clone();
    let target_path = request.path;
    let Some(document) = snapshot
        .open_documents
        .iter()
        .find(|document| document.path == target_path)
    else {
        return Ok(None);
    };

    Ok(Some(build_document_snapshot(document, &text_cache)))
}

#[tauri::command]
pub async fn native_editor_inspect_interaction_context(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorInspectInteractionRequest,
) -> Result<Option<NativeEditorInteractionContextSnapshot>, String> {
    let (cache, text_cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (
            active.state_cache.clone(),
            active.text_cache.clone(),
            active.handle.is_finished(),
        )
    };

    if handle_finished {
        return Ok(None);
    }

    let snapshot = cache.lock().await.clone();
    let text_cache = text_cache.lock().await.clone();
    let target_path = request.path;
    let document = snapshot
        .open_documents
        .iter()
        .find(|document| document.path == target_path);

    let text = request
        .text
        .or_else(|| text_cache.get(&target_path).cloned())
        .unwrap_or_default();
    if text.is_empty() && document.is_none() && !text_cache.contains_key(&target_path) {
        return Ok(None);
    }

    let selection = request
        .selection
        .or_else(|| document.and_then(|entry| entry.selections.first().cloned()));

    Ok(Some(inspect_interaction_context(
        &target_path,
        &text,
        selection,
    )))
}

#[tauri::command]
pub async fn native_editor_presentation_snapshot(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorPresentationSnapshotRequest,
) -> Result<Option<NativeEditorPresentationSnapshot>, String> {
    let normalized_path = request.path.trim();
    if normalized_path.is_empty() {
        return Ok(None);
    }

    let target_path = normalized_path.to_string();
    let text = if let Some(text) = request.text {
        text
    } else {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Err("Native editor session is not running.".to_string());
        };
        let cache = active.text_cache.lock().await;
        cache.get(&target_path).cloned().unwrap_or_default()
    };

    Ok(Some(build_presentation_snapshot(
        &target_path,
        &text,
        request.selection,
        request.viewport_from,
        request.viewport_to,
    )))
}

#[tauri::command]
pub async fn native_editor_plan_citation_replacement(
    request: NativeEditorPlanCitationReplacementRequest,
) -> Result<Option<NativeEditorCitationReplacePlan>, String> {
    if request.path.trim().is_empty() {
        return Ok(None);
    }
    Ok(plan_citation_replacement(request))
}

#[tauri::command]
pub async fn native_editor_plan_file_drop_insertion(
    request: NativeEditorPlanFileDropInsertionRequest,
) -> Result<Option<NativeEditorFileDropInsertionPlan>, String> {
    if request.source_path.trim().is_empty() {
        return Ok(None);
    }
    Ok(plan_file_drop_insertion(request))
}

#[tauri::command]
pub async fn native_editor_session_state(
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<Option<NativeEditorSessionStateSnapshot>, String> {
    let (cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (active.state_cache.clone(), active.handle.is_finished())
    };

    let mut snapshot = cache.lock().await.clone();
    if handle_finished {
        snapshot.connected = false;
    }
    Ok(Some(snapshot))
}

#[tauri::command]
pub async fn native_editor_session_open_document<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorOpenDocumentRequest,
) -> Result<NativeEditorSessionSnapshot, String> {
    let snapshot = native_editor_session_start(app, state.clone()).await?;
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session did not start.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::OpenDocument {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(snapshot)
}

#[tauri::command]
pub async fn native_editor_session_apply_external_content(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyExternalContentRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ApplyExternalContent {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_replace_document_text(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyExternalContentRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ReplaceDocumentText {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_apply_transaction(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyTransactionRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ApplyTransaction {
            path: request.path,
            edits: request.edits,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_selections(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetSelectionsRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetSelections {
            path: request.path,
            selections: request.selections,
            viewport_offset: request.viewport_offset,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_diagnostics(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetDiagnosticsRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetDiagnostics {
            path: request.path,
            diagnostics: request.diagnostics,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_outline_context(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetOutlineContextRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetOutlineContext {
            path: request.path,
            context: request.context,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_record_workflow_event(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorRecordWorkflowEventRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::RecordWorkflowEvent {
            path: request.path,
            event: request.event,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_stop(
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<bool, String> {
    let mut guard = state.inner.lock().await;
    let Some(active) = guard.take() else {
        return Ok(false);
    };

    let _ = write_command(&active.stdin, &NativeEditorCommand::Shutdown).await;
    {
        let mut cache = active.state_cache.lock().await;
        cache.connected = false;
        cache.last_event_kind = "stopping".to_string();
    }
    match timeout(Duration::from_millis(SHUTDOWN_TIMEOUT_MS), active.handle).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_editor_interaction_detects_wiki_link_at_cursor() {
        let context = inspect_interaction_context(
            "note.md",
            "Before [[Paper Note|display]] after",
            Some(NativeEditorSelectionRange {
                anchor: 10,
                head: 10,
            }),
        );
        let wiki_link = context.wiki_link.expect("wiki link should be detected");
        assert_eq!(wiki_link.target, "Paper Note");
        assert!(context.citation_trigger.is_none());
    }

    #[test]
    fn native_editor_interaction_detects_markdown_citation_trigger() {
        let text = "Intro [@smith2020, p. 10; @doe2021";
        let cursor = text.len();
        let context = inspect_interaction_context(
            "paper.md",
            text,
            Some(NativeEditorSelectionRange {
                anchor: cursor,
                head: cursor,
            }),
        );
        let trigger = context
            .citation_trigger
            .expect("markdown trigger should exist");
        assert_eq!(trigger.query, "doe2021");
        assert!(trigger.latex_command.is_none());
    }

    #[test]
    fn native_editor_interaction_detects_latex_citation_edit_group() {
        let text = r"\cite{smith2020, doe2021}";
        let cursor = 8;
        let context = inspect_interaction_context(
            "paper.tex",
            text,
            Some(NativeEditorSelectionRange {
                anchor: cursor,
                head: cursor,
            }),
        );
        let edit = context
            .citation_edit
            .expect("latex citation edit should exist");
        assert_eq!(edit.latex_command.as_deref(), Some("cite"));
        assert_eq!(edit.cites.len(), 2);
        assert_eq!(edit.cites[0].key, "smith2020");
        assert_eq!(edit.cites[1].key, "doe2021");
    }

    #[test]
    fn native_editor_plans_markdown_citation_update() {
        let plan = plan_citation_replacement(NativeEditorPlanCitationReplacementRequest {
            path: "paper.md".to_string(),
            operation: "update".to_string(),
            trigger: None,
            edit: Some(NativeEditorCitationEditContext {
                group_from: 4,
                group_to: 20,
                cites: vec![],
                latex_command: None,
            }),
            keys: vec![],
            cites: vec![
                NativeEditorCitationEntry {
                    key: "smith2020".to_string(),
                    locator: "p. 10".to_string(),
                    prefix: String::new(),
                },
                NativeEditorCitationEntry {
                    key: "doe2021".to_string(),
                    locator: String::new(),
                    prefix: "see".to_string(),
                },
            ],
            latex_command: None,
        })
        .expect("markdown plan should exist");

        assert_eq!(plan.from, 4);
        assert_eq!(plan.to, 20);
        assert_eq!(plan.text, "[@smith2020, p. 10; see @doe2021]");
    }

    #[test]
    fn native_editor_plans_latex_citation_insert() {
        let plan = plan_citation_replacement(NativeEditorPlanCitationReplacementRequest {
            path: "paper.tex".to_string(),
            operation: "insert".to_string(),
            trigger: Some(NativeEditorCitationTrigger {
                query: "smi".to_string(),
                trigger_from: 12,
                trigger_to: 15,
                inside_brackets: false,
                latex_command: Some("cite".to_string()),
            }),
            edit: None,
            keys: vec!["smith2020".to_string()],
            cites: vec![],
            latex_command: Some("citep".to_string()),
        })
        .expect("latex insert plan should exist");

        assert_eq!(plan.text, r"\citep{smith2020}");
    }

    #[test]
    fn native_editor_plans_markdown_file_drop_insertion() {
        let plan = plan_file_drop_insertion(NativeEditorPlanFileDropInsertionRequest {
            source_path: "/workspace/notes/paper.md".to_string(),
            dropped_paths: vec![
                "/workspace/assets/figure-1.png".to_string(),
                "/workspace/refs/ref.pdf".to_string(),
            ],
        })
        .expect("file drop plan should exist");

        assert_eq!(
            plan.text,
            "![figure-1](../assets/figure-1.png)\n[ref.pdf](../refs/ref.pdf)"
        );
    }

    #[test]
    fn native_editor_plans_latex_file_drop_insertion() {
        let plan = plan_file_drop_insertion(NativeEditorPlanFileDropInsertionRequest {
            source_path: "/workspace/tex/main.tex".to_string(),
            dropped_paths: vec![
                "/workspace/figures/plot.png".to_string(),
                "/workspace/sections/methods.tex".to_string(),
            ],
        })
        .expect("latex file drop plan should exist");

        assert_eq!(
            plan.text,
            "\\includegraphics{../figures/plot.png}\n\\input{../sections/methods.tex}"
        );
    }

    #[test]
    fn native_editor_builds_markdown_presentation_snapshot() {
        let snapshot = build_presentation_snapshot(
            "note.md",
            "# Title\n\nSee [[Paper Note]] and [@smith2020].\n",
            Some(NativeEditorSelectionRange { anchor: 3, head: 3 }),
            Some(0),
            Some(48),
        );

        assert_eq!(snapshot.language, "markdown");
        assert_eq!(snapshot.parser, "tree-sitter-md");
        assert_eq!(snapshot.active_line, Some(1));
        assert!(!snapshot.lines.is_empty());
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "syntax.heading.atx"));
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "syntax.link"));
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "semantic.wikilink"));
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "semantic.citation"));
    }

    #[test]
    fn native_editor_builds_latex_presentation_snapshot() {
        let snapshot = build_presentation_snapshot(
            "paper.tex",
            "\\section{Intro}\n\\cite{smith2020}\n",
            Some(NativeEditorSelectionRange {
                anchor: 12,
                head: 12,
            }),
            Some(0),
            Some(32),
        );

        assert_eq!(snapshot.language, "latex");
        assert_eq!(snapshot.parser, "codebook-tree-sitter-latex");
        assert!(
            snapshot
                .marks
                .iter()
                .any(|mark| mark.class_name == "syntax.command"
                    || mark.class_name == "syntax.section")
        );
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "syntax.citation-command"));
        assert!(snapshot
            .marks
            .iter()
            .any(|mark| mark.class_name == "semantic.latex-citation"));
    }
}
