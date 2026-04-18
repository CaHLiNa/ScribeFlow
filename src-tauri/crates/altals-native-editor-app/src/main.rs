use altals_editor_core::{
    CursorPosition, EditorSession, EditorSessionId, EditorTransaction, SelectionRange, SessionDocument,
    TextEdit, ViewportAnchor,
};
use serde_json::Value;
use serde_json::to_writer;
use std::collections::HashMap;
use std::io::{self, BufRead, Write};

const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorDocumentState {
    path: String,
    text_length: usize,
    version: u64,
    selections: Vec<NativeEditorSelectionRange>,
    cursor: NativeEditorCursorState,
    viewport: NativeEditorViewportAnchor,
    text_preview: String,
    diagnostics: Vec<Value>,
    outline_context: Option<Value>,
}

#[derive(Debug, Clone, Default)]
struct NativeEditorDocumentMetadata {
    diagnostics: Vec<Value>,
    outline_context: Option<Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorTextEdit {
    start: usize,
    end: usize,
    text: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorSelectionRange {
    anchor: usize,
    head: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorCursorState {
    offset: usize,
    line: u32,
    column: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorViewportAnchor {
    offset: usize,
    line: u32,
    column: u32,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum NativeEditorCommand {
    Ping { request_id: String },
    OpenDocument { path: String, text: String },
    ReplaceDocumentText { path: String, text: String },
    ApplyTransaction {
        path: String,
        edits: Vec<NativeEditorTextEdit>,
    },
    SetSelections {
        path: String,
        selections: Vec<NativeEditorSelectionRange>,
        viewport_offset: Option<usize>,
    },
    SetDiagnostics {
        path: String,
        diagnostics: Vec<Value>,
    },
    SetOutlineContext {
        path: String,
        context: Option<Value>,
    },
    ApplyExternalContent { path: String, text: String },
    Shutdown,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum NativeEditorEvent {
    Ready {
        session_id: String,
        protocol_version: u32,
    },
    Pong {
        request_id: String,
    },
    DocumentOpened {
        path: String,
        text_length: usize,
        version: u64,
    },
    ContentChanged {
        path: String,
        text: String,
        text_length: usize,
        version: u64,
        reason: String,
    },
    SessionState {
        open_documents: Vec<NativeEditorDocumentState>,
    },
    Stopped {
        session_id: String,
    },
    Error {
        message: String,
    },
}

fn emit_event(event: &NativeEditorEvent) -> io::Result<()> {
    let stdout = io::stdout();
    let mut lock = stdout.lock();
    to_writer(&mut lock, event)?;
    writeln!(&mut lock)?;
    lock.flush()
}

fn build_document_state(
    document: &SessionDocument,
    metadata: Option<&NativeEditorDocumentMetadata>,
) -> NativeEditorDocumentState {
    let text = document.text();
    let text_preview = if text.chars().count() > 240 {
        let preview: String = text.chars().take(240).collect();
        format!("{preview}\n…")
    } else {
        text.to_string()
    };
    let metadata = metadata.cloned().unwrap_or_default();

    NativeEditorDocumentState {
        path: document.path().to_string(),
        text_length: document.len(),
        version: document.version,
        selections: document
            .selections()
            .iter()
            .map(|selection| NativeEditorSelectionRange {
                anchor: selection.anchor,
                head: selection.head,
            })
            .collect(),
        cursor: build_cursor_state(document.primary_cursor()),
        viewport: build_viewport_anchor(document.viewport),
        text_preview,
        diagnostics: metadata.diagnostics,
        outline_context: metadata.outline_context,
    }
}

fn build_cursor_state(cursor: CursorPosition) -> NativeEditorCursorState {
    NativeEditorCursorState {
        offset: cursor.offset,
        line: cursor.line,
        column: cursor.column,
    }
}

fn build_viewport_anchor(viewport: ViewportAnchor) -> NativeEditorViewportAnchor {
    NativeEditorViewportAnchor {
        offset: viewport.offset,
        line: viewport.line,
        column: viewport.column,
    }
}

fn emit_session_state(
    session: &EditorSession,
    metadata: &HashMap<String, NativeEditorDocumentMetadata>,
) {
    let open_documents = session
        .documents()
        .map(|document| build_document_state(document, metadata.get(document.path())))
        .collect::<Vec<_>>();
    let _ = emit_event(&NativeEditorEvent::SessionState { open_documents });
}

fn build_transaction(edits: Vec<NativeEditorTextEdit>) -> EditorTransaction {
    EditorTransaction::new(
        edits
            .into_iter()
            .map(|edit| TextEdit::new(edit.start..edit.end, edit.text))
            .collect(),
    )
}

fn build_selections(selections: Vec<NativeEditorSelectionRange>) -> Vec<SelectionRange> {
    selections
        .into_iter()
        .map(|selection| SelectionRange::new(selection.anchor, selection.head))
        .collect()
}

fn main() {
    let session_id = format!("native-editor-{}", std::process::id());
    if emit_event(&NativeEditorEvent::Ready {
        session_id: session_id.clone(),
        protocol_version: PROTOCOL_VERSION,
    })
    .is_err()
    {
        return;
    }

    let stdin = io::stdin();
    let mut session = EditorSession::new(EditorSessionId::new(session_id.clone()));
    let mut document_metadata = HashMap::<String, NativeEditorDocumentMetadata>::new();
    emit_session_state(&session, &document_metadata);

    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            let _ = emit_event(&NativeEditorEvent::Error {
                message: "Failed to read native editor command.".to_string(),
            });
            break;
        };

        if line.trim().is_empty() {
            continue;
        }

        let command = match serde_json::from_str::<NativeEditorCommand>(&line) {
            Ok(command) => command,
            Err(error) => {
                let _ = emit_event(&NativeEditorEvent::Error {
                    message: format!("Failed to parse native editor command: {error}"),
                });
                continue;
            }
        };

        match command {
            NativeEditorCommand::Ping { request_id } => {
                let _ = emit_event(&NativeEditorEvent::Pong { request_id });
            }
            NativeEditorCommand::OpenDocument { path, text } => {
                let (text_length, version) = {
                    let document = session.open_document(path.clone(), text.clone());
                    (document.len(), document.version)
                };
                let _ = emit_event(&NativeEditorEvent::DocumentOpened {
                    path: path.clone(),
                    text_length,
                    version,
                });
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length,
                    version,
                    reason: "open-document".to_string(),
                });
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::ReplaceDocumentText { path, text } => {
                let (text_length, version) = {
                    let document = session.replace_document_text(path.clone(), text.clone());
                    (document.len(), document.version)
                };
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length,
                    version,
                    reason: "surface-edit".to_string(),
                });
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::ApplyTransaction { path, edits } => {
                let transaction = build_transaction(edits);
                match session.apply_transaction(path.clone(), &transaction) {
                    Ok(document) => {
                        let _ = emit_event(&NativeEditorEvent::ContentChanged {
                            path,
                            text: document.text().to_string(),
                            text_length: document.len(),
                            version: document.version,
                            reason: "transaction".to_string(),
                        });
                        emit_session_state(&session, &document_metadata);
                    }
                    Err(error) => {
                        let _ = emit_event(&NativeEditorEvent::Error {
                            message: format!("Failed to apply native editor transaction: {error}"),
                        });
                    }
                }
            }
            NativeEditorCommand::SetSelections {
                path,
                selections,
                viewport_offset,
            } => {
                session.set_selections(path.clone(), build_selections(selections));
                if let Some(offset) = viewport_offset {
                    session.set_viewport_anchor(path.clone(), offset);
                }
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::SetDiagnostics { path, diagnostics } => {
                let metadata = document_metadata.entry(path).or_default();
                metadata.diagnostics = diagnostics;
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::SetOutlineContext { path, context } => {
                let metadata = document_metadata.entry(path).or_default();
                metadata.outline_context = context;
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::ApplyExternalContent { path, text } => {
                let (text_length, version) = {
                    let document = session.replace_document_text(path.clone(), text.clone());
                    (document.len(), document.version)
                };
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length,
                    version,
                    reason: "external-update".to_string(),
                });
                emit_session_state(&session, &document_metadata);
            }
            NativeEditorCommand::Shutdown => {
                let _ = emit_event(&NativeEditorEvent::Stopped {
                    session_id: session_id.clone(),
                });
                break;
            }
        }
    }
}
