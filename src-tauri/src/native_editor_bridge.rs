use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const NATIVE_EDITOR_EVENT: &str = "native-editor-event";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorDocumentState {
    pub path: String,
    pub text_length: usize,
    #[serde(default)]
    pub version: u64,
    #[serde(default)]
    pub selections: Vec<NativeEditorSelectionRange>,
    #[serde(default)]
    pub cursor: Option<NativeEditorCursorState>,
    #[serde(default)]
    pub viewport: Option<NativeEditorViewportAnchor>,
    #[serde(default)]
    pub text_preview: String,
    #[serde(default)]
    pub diagnostics: Vec<Value>,
    #[serde(default)]
    pub outline_context: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorTextEdit {
    pub start: usize,
    pub end: usize,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSelectionRange {
    pub anchor: usize,
    pub head: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorCursorState {
    pub offset: usize,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorViewportAnchor {
    pub offset: usize,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NativeEditorCommand {
    Ping {
        request_id: String,
    },
    OpenDocument {
        path: String,
        text: String,
    },
    ReplaceDocumentText {
        path: String,
        text: String,
    },
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
    ApplyExternalContent {
        path: String,
        text: String,
    },
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NativeEditorEvent {
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorEventPayload {
    pub session_id: String,
    #[serde(flatten)]
    pub event: NativeEditorEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSessionSnapshot {
    pub session_id: String,
    pub helper_path: String,
    pub process_id: Option<u32>,
    pub protocol_version: u32,
    pub started: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSessionStateSnapshot {
    pub session_id: String,
    pub helper_path: String,
    pub process_id: Option<u32>,
    pub protocol_version: u32,
    pub started: bool,
    pub connected: bool,
    #[serde(default)]
    pub last_event_kind: String,
    #[serde(default)]
    pub open_documents: Vec<NativeEditorDocumentState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorDocumentSnapshot {
    pub path: String,
    pub text_length: usize,
    pub version: u64,
    #[serde(default)]
    pub selections: Vec<NativeEditorSelectionRange>,
    pub cursor: Option<NativeEditorCursorState>,
    pub viewport: Option<NativeEditorViewportAnchor>,
    #[serde(default)]
    pub text_preview: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub diagnostics: Vec<Value>,
    #[serde(default)]
    pub outline_context: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorOpenDocumentRequest {
    pub path: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorApplyExternalContentRequest {
    pub path: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorApplyTransactionRequest {
    pub path: String,
    #[serde(default)]
    pub edits: Vec<NativeEditorTextEdit>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSetSelectionsRequest {
    pub path: String,
    #[serde(default)]
    pub selections: Vec<NativeEditorSelectionRange>,
    pub viewport_offset: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSetDiagnosticsRequest {
    pub path: String,
    #[serde(default)]
    pub diagnostics: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorSetOutlineContextRequest {
    pub path: String,
    pub context: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorDocumentStateRequest {
    pub path: String,
}
