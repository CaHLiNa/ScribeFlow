use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ops::Range;

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EditorSessionId(pub String);

impl EditorSessionId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionDocument {
    pub buffer: DocumentBuffer,
    pub version: u64,
}

impl SessionDocument {
    pub fn new(path: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            buffer: DocumentBuffer::new(path, text),
            version: 1,
        }
    }

    pub fn path(&self) -> &str {
        &self.buffer.path
    }

    pub fn text(&self) -> &str {
        self.buffer.text()
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn replace_all(&mut self, next_text: impl Into<String>) {
        self.buffer.replace_all(next_text);
        self.version += 1;
    }

    pub fn apply_transaction(&mut self, transaction: &EditorTransaction) -> Result<(), BufferError> {
        self.buffer.apply_transaction(transaction)?;
        self.version += 1;
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditorSession {
    pub id: EditorSessionId,
    pub documents: BTreeMap<String, SessionDocument>,
}

impl EditorSession {
    pub fn new(id: EditorSessionId) -> Self {
        Self {
            id,
            documents: BTreeMap::new(),
        }
    }

    pub fn open_document(
        &mut self,
        path: impl Into<String>,
        text: impl Into<String>,
    ) -> &SessionDocument {
        let path = path.into();
        let document = self
            .documents
            .entry(path.clone())
            .and_modify(|existing| existing.replace_all(text.into()))
            .or_insert_with(|| SessionDocument::new(path, text.into()));
        &*document
    }

    pub fn replace_document_text(
        &mut self,
        path: impl Into<String>,
        text: impl Into<String>,
    ) -> &SessionDocument {
        let path = path.into();
        let document = self
            .documents
            .entry(path.clone())
            .or_insert_with(|| SessionDocument::new(path.clone(), ""));
        document.replace_all(text.into());
        &*document
    }

    pub fn apply_transaction(
        &mut self,
        path: impl Into<String>,
        transaction: &EditorTransaction,
    ) -> Result<&SessionDocument, BufferError> {
        let path = path.into();
        let document = self
            .documents
            .entry(path.clone())
            .or_insert_with(|| SessionDocument::new(path, ""));
        document.apply_transaction(transaction)?;
        Ok(&*document)
    }

    pub fn document(&self, path: &str) -> Option<&SessionDocument> {
        self.documents.get(path)
    }

    pub fn documents(&self) -> impl Iterator<Item = &SessionDocument> {
        self.documents.values()
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DocumentBuffer {
    pub path: String,
    pub text: String,
}

impl DocumentBuffer {
    pub fn new(path: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            text: text.into(),
        }
    }

    pub fn len(&self) -> usize {
        self.text.len()
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn replace_all(&mut self, next_text: impl Into<String>) {
        self.text = next_text.into();
    }

    pub fn apply_edit(&mut self, edit: &TextEdit) -> Result<(), BufferError> {
        validate_range(self.len(), &edit.range)?;
        self.text.replace_range(edit.range.clone(), &edit.text);
        Ok(())
    }

    pub fn apply_transaction(&mut self, transaction: &EditorTransaction) -> Result<(), BufferError> {
        let mut ascending = transaction.edits.clone();
        ascending.sort_by_key(|edit| edit.range.start);

        for edit in &ascending {
            validate_range(self.len(), &edit.range)?;
        }

        for pair in ascending.windows(2) {
            let current = &pair[0].range;
            let next = &pair[1].range;
            if current.end > next.start {
                return Err(BufferError::OverlappingEdit {
                    previous: current.clone(),
                    next: next.clone(),
                });
            }
        }

        let mut descending = ascending;
        descending.sort_by(|left, right| right.range.start.cmp(&left.range.start));
        for edit in &descending {
            self.text.replace_range(edit.range.clone(), &edit.text);
        }

        Ok(())
    }

    pub fn cursor_position(&self, offset: usize) -> CursorPosition {
        let safe_offset = clamp_offset(self.len(), offset);
        let (line, column) = line_and_column_for_offset(&self.text, safe_offset);
        CursorPosition {
            offset: safe_offset,
            line,
            column,
        }
    }

    pub fn reveal_anchor(&self, offset: usize) -> ViewportAnchor {
        let position = self.cursor_position(offset);
        ViewportAnchor {
            offset: position.offset,
            line: position.line,
            column: position.column,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CursorPosition {
    pub offset: usize,
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectionRange {
    pub anchor: usize,
    pub head: usize,
}

impl SelectionRange {
    pub fn new(anchor: usize, head: usize) -> Self {
        Self { anchor, head }
    }

    pub fn start(&self) -> usize {
        self.anchor.min(self.head)
    }

    pub fn end(&self) -> usize {
        self.anchor.max(self.head)
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextEdit {
    pub range: Range<usize>,
    pub text: String,
}

impl TextEdit {
    pub fn new(range: Range<usize>, text: impl Into<String>) -> Self {
        Self {
            range,
            text: text.into(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditorTransaction {
    pub edits: Vec<TextEdit>,
}

impl EditorTransaction {
    pub fn new(edits: Vec<TextEdit>) -> Self {
        Self { edits }
    }

    pub fn push_edit(&mut self, edit: TextEdit) {
        self.edits.push(edit);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ViewportAnchor {
    pub offset: usize,
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BufferError {
    InvalidRange {
        start: usize,
        end: usize,
        len: usize,
    },
    OverlappingEdit {
        previous: Range<usize>,
        next: Range<usize>,
    },
}

fn clamp_offset(len: usize, offset: usize) -> usize {
    offset.min(len)
}

fn validate_range(len: usize, range: &Range<usize>) -> Result<(), BufferError> {
    if range.start <= range.end && range.end <= len {
        return Ok(());
    }

    Err(BufferError::InvalidRange {
        start: range.start,
        end: range.end,
        len,
    })
}

fn line_and_column_for_offset(text: &str, offset: usize) -> (u32, u32) {
    let safe_offset = clamp_offset(text.len(), offset);
    let mut line = 1_u32;
    let mut line_start = 0_usize;

    for (index, byte) in text.bytes().enumerate() {
        if index >= safe_offset {
            break;
        }
        if byte == b'\n' {
            line += 1;
            line_start = index + 1;
        }
    }

    let column = text[line_start..safe_offset].chars().count() as u32 + 1;
    (line, column)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_and_replaces_document_content() {
        let mut buffer = DocumentBuffer::new("notes.md", "draft");
        assert_eq!(buffer.path, "notes.md");
        assert_eq!(buffer.text(), "draft");

        buffer.replace_all("final");

        assert_eq!(buffer.text(), "final");
    }

    #[test]
    fn applies_single_cursor_edit() {
        let mut buffer = DocumentBuffer::new("paper.md", "hello world");
        buffer
            .apply_edit(&TextEdit::new(6..11, "Altals"))
            .expect("single edit should apply");

        assert_eq!(buffer.text(), "hello Altals");
        assert_eq!(
            buffer.cursor_position(9),
            CursorPosition {
                offset: 9,
                line: 1,
                column: 10,
            }
        );
    }

    #[test]
    fn applies_multi_selection_transaction_without_offset_shift_errors() {
        let mut buffer = DocumentBuffer::new("paper.md", "cat bat rat");
        let transaction = EditorTransaction::new(vec![
            TextEdit::new(0..3, "CAT"),
            TextEdit::new(4..7, "BAT"),
            TextEdit::new(8..11, "RAT"),
        ]);

        buffer
            .apply_transaction(&transaction)
            .expect("multi-edit transaction should apply");

        assert_eq!(buffer.text(), "CAT BAT RAT");
    }

    #[test]
    fn resolves_line_and_column_from_offsets() {
        let buffer = DocumentBuffer::new("paper.md", "alpha\nbeta\nz");

        assert_eq!(
            buffer.cursor_position(8),
            CursorPosition {
                offset: 8,
                line: 2,
                column: 3,
            }
        );
        assert_eq!(
            buffer.cursor_position(11),
            CursorPosition {
                offset: 11,
                line: 3,
                column: 1,
            }
        );
    }

    #[test]
    fn reveal_anchor_uses_document_offsets_not_soft_wrap_visual_rows() {
        let buffer = DocumentBuffer::new(
            "long-line.md",
            "this-is-a-very-long-line-that-should-still-map-to-line-one\nshort",
        );
        let second_line_start = buffer.text().find('\n').expect("newline present") + 1;

        assert_eq!(
            buffer.reveal_anchor(40),
            ViewportAnchor {
                offset: 40,
                line: 1,
                column: 41,
            }
        );
        assert_eq!(
            buffer.reveal_anchor(second_line_start),
            ViewportAnchor {
                offset: second_line_start,
                line: 2,
                column: 1,
            }
        );
    }

    #[test]
    fn editor_session_tracks_open_documents() {
        let mut session = EditorSession::new(EditorSessionId::new("session-1"));
        session.open_document("notes.md", "draft");
        session.open_document("paper.md", "hello");

        let paths = session
            .documents()
            .map(|document| document.path().to_string())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["notes.md".to_string(), "paper.md".to_string()]);
        assert_eq!(session.document("notes.md").map(|document| document.version), Some(1));
    }

    #[test]
    fn editor_session_replace_document_text_updates_version() {
        let mut session = EditorSession::new(EditorSessionId::new("session-1"));
        session.open_document("notes.md", "draft");
        let document = session.replace_document_text("notes.md", "final");

        assert_eq!(document.text(), "final");
        assert_eq!(document.version, 2);
    }

    #[test]
    fn editor_session_can_apply_incremental_transaction() {
        let mut session = EditorSession::new(EditorSessionId::new("session-1"));
        session.open_document("notes.md", "hello world");

        let transaction = EditorTransaction::new(vec![TextEdit::new(6..11, "Altals")]);
        let document = session
            .apply_transaction("notes.md", &transaction)
            .expect("transaction should apply");

        assert_eq!(document.text(), "hello Altals");
        assert_eq!(document.version, 2);
    }
}
