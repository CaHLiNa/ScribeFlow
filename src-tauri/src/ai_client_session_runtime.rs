use serde::Deserialize;

use crate::ai_session_storage::{
    ai_session_overlay_create, ai_session_overlay_delete, ai_session_overlay_rename,
    ai_session_overlay_save, AiSessionOverlayCreateParams, AiSessionOverlayDeleteParams,
    AiSessionOverlayMutationResponse, AiSessionOverlayRenameParams, AiSessionOverlaySaveParams,
    AiSessionOverlayState,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientSessionCreateParams {
    #[serde(flatten)]
    pub overlay: AiSessionOverlayCreateParams,
    #[serde(default)]
    pub cwd: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientSessionEnsureThreadParams {
    pub workspace_path: String,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub sessions: Vec<crate::ai_session_storage::AiSessionOverlayRecord>,
    #[serde(default)]
    pub session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientSessionRenameParams {
    #[serde(flatten)]
    pub overlay: AiSessionOverlayRenameParams,
    #[serde(default)]
    pub cwd: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiClientSessionDeleteParams {
    #[serde(flatten)]
    pub overlay: AiSessionOverlayDeleteParams,
}

#[tauri::command]
pub async fn ai_client_session_create(
    params: AiClientSessionCreateParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let _ = params.cwd;
    ai_session_overlay_create(params.overlay).await
}

#[tauri::command]
pub async fn ai_client_session_ensure_thread(
    params: AiClientSessionEnsureThreadParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let next_state = AiSessionOverlayState {
        current_session_id: params.current_session_id,
        sessions: params.sessions,
    };
    ai_session_overlay_save(AiSessionOverlaySaveParams {
        workspace_path: params.workspace_path,
        state: next_state.clone(),
    })
    .await?;

    let session = next_state
        .sessions
        .iter()
        .find(|session| session.id == params.session_id)
        .cloned()
        .or_else(|| next_state.sessions.first().cloned());

    Ok(AiSessionOverlayMutationResponse {
        success: true,
        state: next_state,
        session,
    })
}

#[tauri::command]
pub async fn ai_client_session_rename(
    params: AiClientSessionRenameParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let _ = params.cwd;
    ai_session_overlay_rename(params.overlay).await
}

#[tauri::command]
pub async fn ai_client_session_delete(
    params: AiClientSessionDeleteParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    ai_session_overlay_delete(params.overlay).await
}
