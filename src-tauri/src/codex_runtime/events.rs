use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use super::protocol::{
    RuntimeAskUserRequest, RuntimeExitPlanRequest, RuntimeItem, RuntimePermissionRequest,
    RuntimePlanModeState, RuntimeThread, RuntimeTurn,
};

pub const CODEX_RUNTIME_EVENT: &str = "codex-runtime-event";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEventPayload {
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread: Option<RuntimeThread>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn: Option<RuntimeTurn>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<RuntimeItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_request: Option<RuntimePermissionRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ask_user_request: Option<RuntimeAskUserRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_plan_request: Option<RuntimeExitPlanRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_mode: Option<RuntimePlanModeState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn emit_runtime_event<R: Runtime>(
    app: &AppHandle<R>,
    event_type: &str,
    thread: Option<RuntimeThread>,
    turn: Option<RuntimeTurn>,
    item: Option<RuntimeItem>,
    permission_request: Option<RuntimePermissionRequest>,
    ask_user_request: Option<RuntimeAskUserRequest>,
    exit_plan_request: Option<RuntimeExitPlanRequest>,
    plan_mode: Option<RuntimePlanModeState>,
    delta: Option<String>,
    error: Option<String>,
) {
    let _ = app.emit(
        CODEX_RUNTIME_EVENT,
        RuntimeEventPayload {
            event_type: event_type.to_string(),
            thread,
            turn,
            item,
            permission_request,
            ask_user_request,
            exit_plan_request,
            plan_mode,
            delta,
            error,
        },
    );
}
