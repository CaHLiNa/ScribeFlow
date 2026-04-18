use altals_editor_core::DocumentBuffer;
use serde_json::to_writer;
use std::collections::HashMap;
use std::io::{self, BufRead, Write};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeEditorDocumentState {
    path: String,
    text_length: usize,
    text_preview: String,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum NativeEditorCommand {
    Ping { request_id: String },
    OpenDocument { path: String, text: String },
    ReplaceDocumentText { path: String, text: String },
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
    },
    ContentChanged {
        path: String,
        text: String,
        text_length: usize,
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

fn build_document_state(path: &str, buffer: &DocumentBuffer) -> NativeEditorDocumentState {
    let text = buffer.text();
    let text_preview = if text.chars().count() > 240 {
        let preview: String = text.chars().take(240).collect();
        format!("{preview}\n…")
    } else {
        text.to_string()
    };

    NativeEditorDocumentState {
        path: path.to_string(),
        text_length: buffer.len(),
        text_preview,
    }
}

fn emit_session_state(buffers: &HashMap<String, DocumentBuffer>) {
    let mut open_documents = buffers
        .iter()
        .map(|(path, buffer)| build_document_state(path, buffer))
        .collect::<Vec<_>>();
    open_documents.sort_by(|left, right| left.path.cmp(&right.path));
    let _ = emit_event(&NativeEditorEvent::SessionState { open_documents });
}

fn main() {
    let session_id = format!("native-editor-{}", std::process::id());
    if emit_event(&NativeEditorEvent::Ready {
        session_id: session_id.clone(),
        protocol_version: 1,
    })
    .is_err()
    {
        return;
    }

    let stdin = io::stdin();
    let mut buffers: HashMap<String, DocumentBuffer> = HashMap::new();
    emit_session_state(&buffers);

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
                let buffer = DocumentBuffer::new(path.clone(), text.clone());
                let text_length = buffer.len();
                buffers.insert(path.clone(), buffer);
                let _ = emit_event(&NativeEditorEvent::DocumentOpened {
                    path: path.clone(),
                    text_length,
                });
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length,
                    reason: "open-document".to_string(),
                });
                emit_session_state(&buffers);
            }
            NativeEditorCommand::ReplaceDocumentText { path, text } => {
                let buffer = buffers
                    .entry(path.clone())
                    .or_insert_with(|| DocumentBuffer::new(path.clone(), ""));
                buffer.replace_all(text.clone());
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length: buffer.len(),
                    reason: "surface-edit".to_string(),
                });
                emit_session_state(&buffers);
            }
            NativeEditorCommand::ApplyExternalContent { path, text } => {
                let buffer = buffers
                    .entry(path.clone())
                    .or_insert_with(|| DocumentBuffer::new(path.clone(), ""));
                buffer.replace_all(text.clone());
                let _ = emit_event(&NativeEditorEvent::ContentChanged {
                    path,
                    text,
                    text_length: buffer.len(),
                    reason: "external-update".to_string(),
                });
                emit_session_state(&buffers);
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
