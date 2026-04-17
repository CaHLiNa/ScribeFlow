use serde::Deserialize;
use serde_json::json;
use tauri::State;

use crate::ai_session_storage::{
    ai_session_overlay_create, ai_session_overlay_delete, ai_session_overlay_rename,
    ai_session_overlay_save, AiSessionOverlayCreateParams, AiSessionOverlayDeleteParams,
    AiSessionOverlayMutationResponse, AiSessionOverlayRecord, AiSessionOverlayRenameParams,
    AiSessionOverlaySaveParams, AiSessionOverlayState,
};
use crate::codex_runtime::protocol::RuntimeThreadStartParams;
use crate::codex_runtime::storage::persist_runtime_state;
use crate::codex_runtime::threads::{archive_thread, rename_thread, start_thread};
use crate::codex_runtime::CodexRuntimeHandle;

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
    pub sessions: Vec<AiSessionOverlayRecord>,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub preferred_title: String,
    #[serde(default)]
    pub fallback_title: String,
    #[serde(default)]
    pub cwd: String,
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

fn patch_overlay_session_thread_binding(
    state: &AiSessionOverlayState,
    session_id: &str,
    thread_id: &str,
    title: &str,
) -> AiSessionOverlayState {
    let normalized_session_id = session_id.trim();
    let normalized_thread_id = thread_id.trim();
    let normalized_title = title.trim();

    AiSessionOverlayState {
        current_session_id: state.current_session_id.clone(),
        sessions: state
            .sessions
            .iter()
            .cloned()
            .map(|mut session| {
                if session.id == normalized_session_id {
                    if !normalized_thread_id.is_empty() {
                        session.runtime_thread_id = normalized_thread_id.to_string();
                        session.runtime_transport = "codex-runtime".to_string();
                    }
                    if !normalized_title.is_empty() {
                        session.title = normalized_title.to_string();
                    }
                }
                session
            })
            .collect(),
    }
}

fn find_overlay_session(
    state: &AiSessionOverlayState,
    session_id: &str,
) -> Option<AiSessionOverlayRecord> {
    let normalized_session_id = session_id.trim();
    state
        .sessions
        .iter()
        .find(|session| session.id == normalized_session_id)
        .cloned()
}

async fn save_overlay_state(
    workspace_path: &str,
    state: AiSessionOverlayState,
) -> Result<AiSessionOverlayState, String> {
    ai_session_overlay_save(AiSessionOverlaySaveParams {
        workspace_path: workspace_path.to_string(),
        state: state.clone(),
    })
    .await?;
    Ok(state)
}

async fn ensure_runtime_thread_for_session(
    runtime_handle: &CodexRuntimeHandle,
    workspace_path: &str,
    state: AiSessionOverlayState,
    session_id: &str,
    preferred_title: &str,
    cwd: &str,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let target_session = find_overlay_session(&state, session_id)
        .or_else(|| state.sessions.first().cloned())
        .ok_or_else(|| "Session is unavailable.".to_string())?;

    let existing_thread_id = target_session.runtime_thread_id.trim().to_string();
    if !existing_thread_id.is_empty() {
        return Ok(AiSessionOverlayMutationResponse {
            success: true,
            session: Some(target_session),
            state,
        });
    }

    let mut runtime = runtime_handle.inner.lock().await;
    let thread = start_thread(
        &mut runtime,
        RuntimeThreadStartParams {
            title: if preferred_title.trim().is_empty() {
                target_session.title.clone()
            } else {
                preferred_title.trim().to_string()
            },
            cwd: if cwd.trim().is_empty() {
                None
            } else {
                Some(cwd.trim().to_string())
            },
        },
    );
    persist_runtime_state(&runtime)?;
    drop(runtime);

    let next_state =
        patch_overlay_session_thread_binding(&state, &target_session.id, &thread.id, &thread.title);
    let next_state = save_overlay_state(workspace_path, next_state).await?;
    Ok(AiSessionOverlayMutationResponse {
        success: true,
        session: find_overlay_session(&next_state, &target_session.id),
        state: next_state,
    })
}

#[tauri::command]
pub async fn ai_client_session_create(
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiClientSessionCreateParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let runtime_handle = runtime_state.inner().clone();
    let created = ai_session_overlay_create(params.overlay.clone()).await?;
    let session_id = created
        .session
        .as_ref()
        .map(|session| session.id.clone())
        .unwrap_or_else(|| created.state.current_session_id.clone());
    ensure_runtime_thread_for_session(
        &runtime_handle,
        &params.overlay.workspace_path,
        created.state,
        &session_id,
        created
            .session
            .as_ref()
            .map(|session| session.title.as_str())
            .unwrap_or_default(),
        &params.cwd,
    )
    .await
}

#[tauri::command]
pub async fn ai_client_session_ensure_thread(
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiClientSessionEnsureThreadParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let runtime_handle = runtime_state.inner().clone();
    ensure_runtime_thread_for_session(
        &runtime_handle,
        &params.workspace_path,
        AiSessionOverlayState {
            current_session_id: params.current_session_id,
            sessions: params.sessions,
        },
        &params.session_id,
        &params.preferred_title,
        &params.cwd,
    )
    .await
}

#[tauri::command]
pub async fn ai_client_session_rename(
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiClientSessionRenameParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let runtime_handle = runtime_state.inner().clone();
    let renamed = ai_session_overlay_rename(params.overlay.clone()).await?;
    if !renamed.success {
        return Ok(renamed);
    }

    let session = renamed
        .session
        .clone()
        .or_else(|| find_overlay_session(&renamed.state, &params.overlay.session_id))
        .ok_or_else(|| "Session is unavailable.".to_string())?;

    let ensured = ensure_runtime_thread_for_session(
        &runtime_handle,
        &params.overlay.workspace_path,
        renamed.state,
        &session.id,
        &session.title,
        &params.cwd,
    )
    .await?;

    let runtime_thread_id = ensured
        .session
        .as_ref()
        .map(|entry| entry.runtime_thread_id.clone())
        .unwrap_or_default();

    if !runtime_thread_id.trim().is_empty() {
        let mut runtime = runtime_handle.inner.lock().await;
        let response = rename_thread(&mut runtime, &runtime_thread_id, &session.title)?;
        persist_runtime_state(&runtime)?;
        drop(runtime);

        let next_state = patch_overlay_session_thread_binding(
            &ensured.state,
            &session.id,
            &runtime_thread_id,
            &response.thread.title,
        );
        let next_state = save_overlay_state(&params.overlay.workspace_path, next_state).await?;
        return Ok(AiSessionOverlayMutationResponse {
            success: true,
            session: find_overlay_session(&next_state, &session.id),
            state: next_state,
        });
    }

    Ok(ensured)
}

#[tauri::command]
pub async fn ai_client_session_delete(
    runtime_state: State<'_, CodexRuntimeHandle>,
    params: AiClientSessionDeleteParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    let runtime_handle = runtime_state.inner().clone();
    let current_state = AiSessionOverlayState {
        current_session_id: params.overlay.current_session_id.clone(),
        sessions: params.overlay.sessions.clone(),
    };
    let normalized_session_id = if params.overlay.session_id.trim().is_empty() {
        current_state.current_session_id.clone()
    } else {
        params.overlay.session_id.trim().to_string()
    };
    if let Some(session) = find_overlay_session(&current_state, &normalized_session_id) {
        if !session.runtime_thread_id.trim().is_empty() {
            let mut runtime = runtime_handle.inner.lock().await;
            let _ = archive_thread(&mut runtime, &session.runtime_thread_id);
            let _ = persist_runtime_state(&runtime);
        }
    }

    ai_session_overlay_delete(params.overlay).await
}
