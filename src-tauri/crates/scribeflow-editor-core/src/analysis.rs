use crate::{EditorTransaction, SelectionRange, TextEdit};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorLineNumber {
    pub line: u32,
    pub from: usize,
    pub to: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorTextRange {
    pub from: usize,
    pub to: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSyntaxSpan {
    pub from: usize,
    pub to: usize,
    pub token_kind: EditorSyntaxTokenKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditorSyntaxTokenKind {
    Heading,
    Emphasis,
    Strong,
    Code,
    CodeFence,
    ListMarker,
    BlockquoteMarker,
    Link,
    Image,
    Math,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDelimiterRange {
    pub from: usize,
    pub to: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDelimiterMatch {
    pub token_kind: EditorDelimiterTokenKind,
    pub primary: EditorDelimiterRange,
    pub paired: EditorDelimiterRange,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditorDelimiterTokenKind {
    Bracket,
    Strong,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorCharacterInputPlan {
    pub handled: bool,
    pub mode: EditorCharacterInputMode,
    #[serde(default)]
    pub transaction: EditorTransaction,
    #[serde(default)]
    pub selections: Vec<SelectionRange>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditorCharacterInputMode {
    Insert,
    AutoPair,
    SkipCloser,
    WrapSelection,
}

pub fn build_line_numbers(text: &str) -> Vec<EditorLineNumber> {
    let mut lines = Vec::new();
    let mut line = 1_u32;
    let mut start = 0_usize;

    for (index, byte) in text.bytes().enumerate() {
        if byte == b'\n' {
            lines.push(EditorLineNumber {
                line,
                from: start,
                to: index,
            });
            start = index + 1;
            line += 1;
        }
    }

    lines.push(EditorLineNumber {
        line,
        from: start,
        to: text.len(),
    });

    lines
}

pub fn build_syntax_spans(text: &str) -> Vec<EditorSyntaxSpan> {
    let lines = build_line_numbers(text);
    let mut spans = Vec::new();
    let mut active_fence: Option<(char, usize)> = None;

    for line in lines {
        let line_text = &text[line.from..line.to];

        if let Some((_, fence_len)) = active_fence {
            if let Some((marker_from, marker_len)) =
                detect_fence_marker(line_text).filter(|(_, marker_len)| *marker_len >= fence_len)
            {
                spans.push(EditorSyntaxSpan {
                    from: line.from + marker_from,
                    to: line.from + marker_from + marker_len,
                    token_kind: EditorSyntaxTokenKind::CodeFence,
                });
                active_fence = None;
                continue;
            }

            spans.push(EditorSyntaxSpan {
                from: line.from,
                to: line.to,
                token_kind: EditorSyntaxTokenKind::Code,
            });
            continue;
        }

        if let Some((marker_from, marker_len)) = detect_fence_marker(line_text) {
            let fence_char = line_text
                .as_bytes()
                .get(marker_from)
                .copied()
                .map(char::from)
                .unwrap_or('`');
            spans.push(EditorSyntaxSpan {
                from: line.from + marker_from,
                to: line.from + marker_from + marker_len,
                token_kind: EditorSyntaxTokenKind::CodeFence,
            });
            active_fence = Some((fence_char, marker_len));
            continue;
        }

        if let Some((from, to)) = detect_heading_span(line_text) {
            spans.push(EditorSyntaxSpan {
                from: line.from + from,
                to: line.from + to,
                token_kind: EditorSyntaxTokenKind::Heading,
            });
        }

        if let Some((from, to)) = detect_blockquote_marker(line_text) {
            spans.push(EditorSyntaxSpan {
                from: line.from + from,
                to: line.from + to,
                token_kind: EditorSyntaxTokenKind::BlockquoteMarker,
            });
        }

        if let Some((from, to)) = detect_list_marker(line_text) {
            spans.push(EditorSyntaxSpan {
                from: line.from + from,
                to: line.from + to,
                token_kind: EditorSyntaxTokenKind::ListMarker,
            });
        }

        spans.extend(scan_inline_syntax(line.from, line_text));
    }

    spans
}

pub fn select_word_range(text: &str, offset: usize) -> SelectionRange {
    let safe_offset = offset.min(text.len());
    if text.is_empty() {
        return SelectionRange::collapsed(0);
    }

    let pivot = if safe_offset < text.len() {
        safe_offset
    } else {
        safe_offset.saturating_sub(1)
    };

    let character = text[pivot..].chars().next().unwrap_or_default();
    if !is_word_like_selection_char(character) {
        return SelectionRange::new(pivot, (pivot + character.len_utf8()).min(text.len()));
    }

    let mut start = pivot;
    let mut end = pivot + character.len_utf8();

    while let Some(previous_index) = prev_char_start(text, start) {
        let Some(previous) = text[previous_index..start].chars().next() else {
            break;
        };
        if !is_word_like_selection_char(previous) {
            break;
        }
        start = previous_index;
    }

    while end < text.len() {
        let Some(next) = text[end..].chars().next() else {
            break;
        };
        if !is_word_like_selection_char(next) {
            break;
        }
        end += next.len_utf8();
    }

    SelectionRange::new(start, end)
}

pub fn find_selection_matches(
    text: &str,
    selection: SelectionRange,
    max_matches: usize,
) -> Vec<EditorTextRange> {
    let safe_selection = selection.clamp(text.len());
    let from = safe_selection.start();
    let to = safe_selection.end();
    if from == to {
      return Vec::new();
    }
    let selected = &text[from..to];
    if selected.trim().is_empty() || selected.chars().count() < 2 || max_matches == 0 {
        return Vec::new();
    }

    let mut matches = Vec::new();
    let mut search_from = 0_usize;

    while search_from < text.len() && matches.len() < max_matches {
        let Some(found_index) = text[search_from..].find(selected) else {
            break;
        };
        let absolute_from = search_from + found_index;
        let absolute_to = absolute_from + selected.len();
        if absolute_from != from || absolute_to != to {
            matches.push(EditorTextRange {
                from: absolute_from,
                to: absolute_to,
            });
        }
        search_from = absolute_to.max(search_from + 1);
    }

    matches
}

pub fn find_delimiter_match(text: &str, selection: SelectionRange) -> Option<EditorDelimiterMatch> {
    let cursor = selection.head.min(text.len());

    if let Some(match_info) = detect_emphasis_match(text, cursor) {
        return Some(match_info);
    }

    detect_bracket_match(text, cursor)
}

pub fn plan_character_input(
    text: &str,
    selection: SelectionRange,
    input: char,
) -> EditorCharacterInputPlan {
    let safe_selection = selection.clamp(text.len());
    let start = safe_selection.start();
    let end = safe_selection.end();
    let input_text = input.to_string();
    let input_len = input.len_utf8();

    if let Some(closer) = matching_closer(input) {
        if start != end {
            return EditorCharacterInputPlan {
                handled: true,
                mode: EditorCharacterInputMode::WrapSelection,
                transaction: EditorTransaction::new(vec![TextEdit::new(
                    start..end,
                    format!("{}{}{}", input, &text[start..end], closer),
                )]),
                selections: vec![SelectionRange::new(start + input_len, end + input_len)],
            };
        }

        return EditorCharacterInputPlan {
            handled: true,
            mode: EditorCharacterInputMode::AutoPair,
            transaction: EditorTransaction::new(vec![TextEdit::new(
                start..end,
                format!("{input}{closer}"),
            )]),
            selections: vec![SelectionRange::collapsed(start + input_len)],
        };
    }

    if is_quote_like(input) {
        if start != end {
            return EditorCharacterInputPlan {
                handled: true,
                mode: EditorCharacterInputMode::WrapSelection,
                transaction: EditorTransaction::new(vec![TextEdit::new(
                    start..end,
                    format!("{}{}{}", input, &text[start..end], input),
                )]),
                selections: vec![SelectionRange::new(start + input_len, end + input_len)],
            };
        }

        if next_char(text, start) == Some(input) {
            return EditorCharacterInputPlan {
                handled: true,
                mode: EditorCharacterInputMode::SkipCloser,
                transaction: EditorTransaction::default(),
                selections: vec![SelectionRange::collapsed(start + input_len)],
            };
        }

        if should_auto_pair_quote(text, start, input) {
            return EditorCharacterInputPlan {
                handled: true,
                mode: EditorCharacterInputMode::AutoPair,
                transaction: EditorTransaction::new(vec![TextEdit::new(
                    start..end,
                    format!("{input}{input}"),
                )]),
                selections: vec![SelectionRange::collapsed(start + input_len)],
            };
        }
    }

    if is_closing_delimiter(input) && start == end && next_char(text, start) == Some(input) {
        return EditorCharacterInputPlan {
            handled: true,
            mode: EditorCharacterInputMode::SkipCloser,
            transaction: EditorTransaction::default(),
            selections: vec![SelectionRange::collapsed(start + input_len)],
        };
    }

    EditorCharacterInputPlan {
        handled: true,
        mode: EditorCharacterInputMode::Insert,
        transaction: EditorTransaction::new(vec![TextEdit::new(start..end, input_text)]),
        selections: vec![SelectionRange::collapsed(start + input_len)],
    }
}

fn detect_heading_span(line_text: &str) -> Option<(usize, usize)> {
    let indent = line_text
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count();
    if indent > 3 {
        return None;
    }

    let marker_len = line_text[indent..]
        .bytes()
        .take_while(|byte| *byte == b'#')
        .count();
    if marker_len == 0 || marker_len > 6 {
        return None;
    }

    let marker_end = indent + marker_len;
    if !line_text[marker_end..].starts_with(' ') && !line_text[marker_end..].starts_with('\t') {
        return None;
    }

    Some((indent, line_text.len()))
}

fn detect_blockquote_marker(line_text: &str) -> Option<(usize, usize)> {
    let indent = line_text
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count();
    if line_text[indent..].starts_with('>') {
        return Some((indent, indent + 1));
    }
    None
}

fn detect_list_marker(line_text: &str) -> Option<(usize, usize)> {
    let indent = line_text
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count();
    let trimmed = &line_text[indent..];

    if let Some(marker) = trimmed
        .chars()
        .next()
        .filter(|marker| matches!(marker, '-' | '+' | '*'))
    {
        let marker_len = marker.len_utf8();
        if trimmed[marker_len..].starts_with(' ') || trimmed[marker_len..].starts_with('\t') {
            return Some((indent, indent + marker_len));
        }
    }

    let digits_len = trimmed.bytes().take_while(|byte| byte.is_ascii_digit()).count();
    if digits_len > 0
        && trimmed[digits_len..].starts_with('.')
        && (trimmed[digits_len + 1..].starts_with(' ') || trimmed[digits_len + 1..].starts_with('\t'))
    {
        return Some((indent, indent + digits_len + 1));
    }

    None
}

fn detect_fence_marker(line_text: &str) -> Option<(usize, usize)> {
    let indent = line_text
        .bytes()
        .take_while(|byte| *byte == b' ' || *byte == b'\t')
        .count();
    if indent > 3 {
        return None;
    }
    let trimmed = &line_text[indent..];
    for fence_char in ['`', '~'] {
        let marker_len = trimmed.chars().take_while(|character| *character == fence_char).count();
        if marker_len >= 3 {
            return Some((indent, marker_len));
        }
    }
    None
}

fn scan_inline_syntax(base_offset: usize, line_text: &str) -> Vec<EditorSyntaxSpan> {
    let mut spans = Vec::new();
    let bytes = line_text.as_bytes();
    let mut index = 0_usize;

    while index < bytes.len() {
        if let Some((token_kind, end)) = detect_link_or_image(line_text, index) {
            spans.push(EditorSyntaxSpan {
                from: base_offset + index,
                to: base_offset + end,
                token_kind,
            });
            index = end;
            continue;
        }

        if let Some(end) = detect_wrapped_run(line_text, index, '`') {
            spans.push(EditorSyntaxSpan {
                from: base_offset + index,
                to: base_offset + end,
                token_kind: EditorSyntaxTokenKind::Code,
            });
            index = end;
            continue;
        }

        if let Some(end) = detect_wrapped_run(line_text, index, '$') {
            spans.push(EditorSyntaxSpan {
                from: base_offset + index,
                to: base_offset + end,
                token_kind: EditorSyntaxTokenKind::Math,
            });
            index = end;
            continue;
        }

        if let Some((token_kind, end)) = detect_emphasis_run(line_text, index) {
            spans.push(EditorSyntaxSpan {
                from: base_offset + index,
                to: base_offset + end,
                token_kind,
            });
            index = end;
            continue;
        }

        let Some(character) = line_text[index..].chars().next() else {
            break;
        };
        index += character.len_utf8();
    }

    spans
}

fn detect_link_or_image(line_text: &str, start: usize) -> Option<(EditorSyntaxTokenKind, usize)> {
    let remaining = &line_text[start..];
    let (token_kind, label_start) = if remaining.starts_with("![") {
        (EditorSyntaxTokenKind::Image, start + 2)
    } else if remaining.starts_with('[') {
        (EditorSyntaxTokenKind::Link, start + 1)
    } else {
        return None;
    };

    let label_end = line_text[label_start..].find(']')?;
    let label_end = label_start + label_end;
    if !line_text[label_end..].starts_with("](") {
        return None;
    }
    let destination_start = label_end + 2;
    let destination_end = line_text[destination_start..].find(')')?;
    Some((token_kind, destination_start + destination_end + 1))
}

fn detect_wrapped_run(line_text: &str, start: usize, marker: char) -> Option<usize> {
    if !line_text[start..].starts_with(marker) {
        return None;
    }

    let marker_len = line_text[start..]
        .chars()
        .take_while(|character| *character == marker)
        .count();
    let marker_bytes = marker_len * marker.len_utf8();
    let search_from = start + marker_bytes;
    let closing = marker.to_string().repeat(marker_len);
    let closing_index = line_text[search_from..].find(&closing)?;
    let end = search_from + closing_index + closing.len();
    if end <= search_from {
        return None;
    }
    Some(end)
}

fn detect_emphasis_run(line_text: &str, start: usize) -> Option<(EditorSyntaxTokenKind, usize)> {
    for token in ["**", "__", "*", "_"] {
        if !line_text[start..].starts_with(token) {
            continue;
        }
        let search_from = start + token.len();
        let closing_index = line_text[search_from..].find(token)?;
        let end = search_from + closing_index + token.len();
        if end <= search_from {
            continue;
        }
        return Some((
            if token.len() == 2 {
                EditorSyntaxTokenKind::Strong
            } else {
                EditorSyntaxTokenKind::Emphasis
            },
            end,
        ));
    }
    None
}

fn detect_emphasis_match(text: &str, cursor: usize) -> Option<EditorDelimiterMatch> {
    for token in ["**", "__"] {
        if cursor >= token.len() && text[cursor - token.len()..cursor] == *token {
            return find_matching_token(text, cursor - token.len(), token, false);
        }
        if cursor + token.len() <= text.len() && text[cursor..cursor + token.len()] == *token {
            return find_matching_token(text, cursor, token, true);
        }
    }
    None
}

fn find_matching_token(
    text: &str,
    start: usize,
    token: &str,
    search_backward: bool,
) -> Option<EditorDelimiterMatch> {
    if search_backward {
        let paired = text[..start].rfind(token)?;
        return Some(EditorDelimiterMatch {
            token_kind: EditorDelimiterTokenKind::Strong,
            primary: EditorDelimiterRange {
                from: start,
                to: start + token.len(),
            },
            paired: EditorDelimiterRange {
                from: paired,
                to: paired + token.len(),
            },
        });
    }

    let search_from = start + token.len();
    let paired = text[search_from..].find(token)? + search_from;
    Some(EditorDelimiterMatch {
        token_kind: EditorDelimiterTokenKind::Strong,
        primary: EditorDelimiterRange {
            from: start,
            to: start + token.len(),
        },
        paired: EditorDelimiterRange {
            from: paired,
            to: paired + token.len(),
        },
    })
}

fn detect_bracket_match(text: &str, cursor: usize) -> Option<EditorDelimiterMatch> {
    if cursor > 0 {
        let start = prev_char_start(text, cursor)?;
        let character = text[start..cursor].chars().next()?;
        if let Some(match_info) = match_bracket(text, start, character) {
            return Some(match_info);
        }
    }

    if cursor < text.len() {
        let character = text[cursor..].chars().next()?;
        return match_bracket(text, cursor, character);
    }

    None
}

fn match_bracket(text: &str, offset: usize, character: char) -> Option<EditorDelimiterMatch> {
    let (open, close, direction) = if let Some(closer) = matching_closer(character) {
        (character, closer, SearchDirection::Forward)
    } else if let Some(opener) = matching_opener(character) {
        (opener, character, SearchDirection::Backward)
    } else {
        return None;
    };

    let paired = match direction {
        SearchDirection::Forward => find_closing_bracket(text, offset + character.len_utf8(), open, close),
        SearchDirection::Backward => find_opening_bracket(text, offset, open, close),
    }?;

    let primary = EditorDelimiterRange {
        from: offset,
        to: offset + character.len_utf8(),
    };
    let paired = EditorDelimiterRange {
        from: paired,
        to: paired + if direction == SearchDirection::Forward { close.len_utf8() } else { open.len_utf8() },
    };

    Some(EditorDelimiterMatch {
        token_kind: EditorDelimiterTokenKind::Bracket,
        primary,
        paired,
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SearchDirection {
    Forward,
    Backward,
}

fn find_closing_bracket(text: &str, start: usize, open: char, close: char) -> Option<usize> {
    let mut depth = 1_i32;
    for (offset, character) in text[start..].char_indices() {
        if character == open {
            depth += 1;
        } else if character == close {
            depth -= 1;
            if depth == 0 {
                return Some(start + offset);
            }
        }
    }
    None
}

fn find_opening_bracket(text: &str, start: usize, open: char, close: char) -> Option<usize> {
    let characters = text[..start].char_indices().collect::<Vec<_>>();
    let mut depth = 1_i32;
    for (offset, character) in characters.into_iter().rev() {
        if character == close {
            depth += 1;
        } else if character == open {
            depth -= 1;
            if depth == 0 {
                return Some(offset);
            }
        }
    }
    None
}

fn next_char(text: &str, offset: usize) -> Option<char> {
    if offset >= text.len() {
        return None;
    }
    text[offset..].chars().next()
}

fn prev_char_start(text: &str, offset: usize) -> Option<usize> {
    text[..offset].char_indices().last().map(|(index, _)| index)
}

fn should_auto_pair_quote(text: &str, offset: usize, quote: char) -> bool {
    let previous = prev_char_start(text, offset).and_then(|index| text[index..offset].chars().next());
    let next = next_char(text, offset);

    if quote == '`' {
        return true;
    }

    let previous_is_word = previous.is_some_and(is_word_like);
    let next_is_word = next.is_some_and(is_word_like);

    !previous_is_word && !next_is_word
}

fn is_word_like(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

fn is_word_like_selection_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '-')
}

fn matching_closer(character: char) -> Option<char> {
    match character {
        '(' => Some(')'),
        '[' => Some(']'),
        '{' => Some('}'),
        '<' => Some('>'),
        _ => None,
    }
}

fn matching_opener(character: char) -> Option<char> {
    match character {
        ')' => Some('('),
        ']' => Some('['),
        '}' => Some('{'),
        '>' => Some('<'),
        _ => None,
    }
}

fn is_quote_like(character: char) -> bool {
    matches!(character, '"' | '\'' | '`')
}

fn is_closing_delimiter(character: char) -> bool {
    matches!(character, ')' | ']' | '}' | '>' | '"' | '\'' | '`')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_line_numbers_with_trailing_newline() {
        let lines = build_line_numbers("alpha\nbeta\n");
        assert_eq!(
            lines,
            vec![
                EditorLineNumber {
                    line: 1,
                    from: 0,
                    to: 5,
                },
                EditorLineNumber {
                    line: 2,
                    from: 6,
                    to: 10,
                },
                EditorLineNumber {
                    line: 3,
                    from: 11,
                    to: 11,
                },
            ]
        );
    }

    #[test]
    fn detects_markdown_syntax_spans() {
        let text = "# Title\n> quote\n- item\n[link](https://example.com)\n`code`\n";
        let spans = build_syntax_spans(text);
        let kinds = spans
            .iter()
            .map(|span| span.token_kind.clone())
            .collect::<Vec<_>>();
        assert!(kinds.contains(&EditorSyntaxTokenKind::Heading));
        assert!(kinds.contains(&EditorSyntaxTokenKind::BlockquoteMarker));
        assert!(kinds.contains(&EditorSyntaxTokenKind::ListMarker));
        assert!(kinds.contains(&EditorSyntaxTokenKind::Link));
        assert!(kinds.contains(&EditorSyntaxTokenKind::Code));
    }

    #[test]
    fn matches_nested_brackets() {
        let text = "fn call(arg[0])";
        let matched =
            find_delimiter_match(text, SelectionRange::collapsed(12)).expect("expected bracket match");
        assert_eq!(matched.token_kind, EditorDelimiterTokenKind::Bracket);
        assert_eq!(matched.primary, EditorDelimiterRange { from: 11, to: 12 });
        assert_eq!(matched.paired, EditorDelimiterRange { from: 13, to: 14 });
    }

    #[test]
    fn matches_emphasis_markers() {
        let text = "**strong**";
        let matched =
            find_delimiter_match(text, SelectionRange::collapsed(2)).expect("expected emphasis match");
        assert_eq!(matched.token_kind, EditorDelimiterTokenKind::Strong);
        assert_eq!(matched.primary, EditorDelimiterRange { from: 0, to: 2 });
        assert_eq!(matched.paired, EditorDelimiterRange { from: 8, to: 10 });
    }

    #[test]
    fn auto_pairs_brackets_and_wraps_selection() {
        let pair_plan = plan_character_input("alpha", SelectionRange::collapsed(5), '(');
        assert_eq!(pair_plan.mode, EditorCharacterInputMode::AutoPair);
        assert_eq!(pair_plan.transaction.edits[0], TextEdit::new(5..5, "()"));
        assert_eq!(pair_plan.selections, vec![SelectionRange::collapsed(6)]);

        let wrap_plan = plan_character_input("alpha", SelectionRange::new(1, 4), '(');
        assert_eq!(wrap_plan.mode, EditorCharacterInputMode::WrapSelection);
        assert_eq!(wrap_plan.transaction.edits[0], TextEdit::new(1..4, "(lph)"));
        assert_eq!(wrap_plan.selections, vec![SelectionRange::new(2, 5)]);
    }

    #[test]
    fn skips_existing_closer_and_inserts_plain_quote_inside_words() {
        let skip_plan = plan_character_input("()", SelectionRange::collapsed(1), ')');
        assert_eq!(skip_plan.mode, EditorCharacterInputMode::SkipCloser);
        assert!(skip_plan.transaction.edits.is_empty());
        assert_eq!(skip_plan.selections, vec![SelectionRange::collapsed(2)]);

        let quote_plan = plan_character_input("cant", SelectionRange::collapsed(3), '\'');
        assert_eq!(quote_plan.mode, EditorCharacterInputMode::Insert);
        assert_eq!(quote_plan.transaction.edits[0], TextEdit::new(3..3, "'"));
    }

    #[test]
    fn selects_word_range_from_offset() {
        let text = "alpha-beta gamma";
        assert_eq!(select_word_range(text, 2), SelectionRange::new(0, 10));
        assert_eq!(select_word_range(text, 12), SelectionRange::new(11, 16));
    }

    #[test]
    fn finds_selection_matches_except_current_range() {
        let text = "beta alpha beta beta";
        let matches = find_selection_matches(text, SelectionRange::new(11, 15), 10);
        assert_eq!(
            matches,
            vec![
                EditorTextRange { from: 0, to: 4 },
                EditorTextRange { from: 16, to: 20 },
            ]
        );
    }
}
