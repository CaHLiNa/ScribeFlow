use serde::{Deserialize, Serialize};

pub const NATIVE_EDITOR_EVENT: &str = "native-editor-event";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEditorDocumentState {
    pub path: String,
    pub text_length: usize,
    #[serde(default)]
    pub text_preview: String,
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
