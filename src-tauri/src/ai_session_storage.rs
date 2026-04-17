use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::task;

use crate::app_dirs;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayRecord {
    pub id: String,
    pub mode: String,
    pub permission_mode: String,
    pub runtime_thread_id: String,
    pub runtime_provider_id: String,
    pub runtime_transport: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub prompt_draft: String,
    pub queued_prompt_draft: String,
    pub attachments: Vec<Value>,
    pub queued_attachments: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayState {
    pub current_session_id: String,
    pub sessions: Vec<AiSessionOverlayRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayMutationResponse {
    pub success: bool,
    pub state: AiSessionOverlayState,
    pub session: Option<AiSessionOverlayRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayLoadParams {
    pub workspace_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlaySaveParams {
    pub workspace_path: String,
    pub state: AiSessionOverlayState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayRestoreParams {
    pub workspace_path: String,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayCreateParams {
    pub workspace_path: String,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub sessions: Vec<AiSessionOverlayRecord>,
    #[serde(default)]
    pub title: String,
    #[serde(default = "default_true")]
    pub activate: bool,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub permission_mode: String,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlaySwitchParams {
    pub workspace_path: String,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub sessions: Vec<AiSessionOverlayRecord>,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayDeleteParams {
    pub workspace_path: String,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub sessions: Vec<AiSessionOverlayRecord>,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionOverlayRenameParams {
    pub workspace_path: String,
    #[serde(default)]
    pub current_session_id: String,
    #[serde(default)]
    pub sessions: Vec<AiSessionOverlayRecord>,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub fallback_title: String,
}

fn default_true() -> bool {
    true
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn normalize_mode(mode: &str) -> String {
    if mode.trim() == "chat" {
        "chat".to_string()
    } else {
        "agent".to_string()
    }
}

fn normalize_permission_mode(value: &str) -> String {
    let normalized = value.trim();
    if normalized == "plan" {
        "plan".to_string()
    } else if ["acceptEdits", "accept-edits", "per-tool"].contains(&normalized) {
        "accept-edits".to_string()
    } else if ["bypassPermissions", "bypass-permissions", "auto"].contains(&normalized) {
        "bypass-permissions".to_string()
    } else {
        "accept-edits".to_string()
    }
}

fn create_session_id() -> String {
    format!("ai-session:{}", uuid::Uuid::new_v4())
}

fn normalize_session_record(
    record: AiSessionOverlayRecord,
    fallback_title: &str,
) -> AiSessionOverlayRecord {
    let created_at = if record.created_at > 0 {
        record.created_at
    } else {
        now_ms()
    };
    let updated_at = if record.updated_at > 0 {
        record.updated_at
    } else {
        created_at
    };
    let fallback = if fallback_title.trim().is_empty() {
        "New session"
    } else {
        fallback_title.trim()
    };
    let title = if record.title.trim().is_empty() {
        fallback.to_string()
    } else {
        record.title.trim().to_string()
    };

    AiSessionOverlayRecord {
        id: if record.id.trim().is_empty() {
            create_session_id()
        } else {
            record.id.trim().to_string()
        },
        mode: normalize_mode(&record.mode),
        permission_mode: normalize_permission_mode(&record.permission_mode),
        runtime_thread_id: record.runtime_thread_id.trim().to_string(),
        runtime_provider_id: record.runtime_provider_id.trim().to_string(),
        runtime_transport: record.runtime_transport.trim().to_string(),
        title,
        created_at,
        updated_at,
        prompt_draft: record.prompt_draft,
        queued_prompt_draft: record.queued_prompt_draft,
        attachments: record.attachments,
        queued_attachments: record.queued_attachments,
    }
}

fn create_initial_state(fallback_title: &str) -> AiSessionOverlayState {
    let fallback = if fallback_title.trim().is_empty() {
        "New session"
    } else {
        fallback_title.trim()
    };
    let session = normalize_session_record(
        AiSessionOverlayRecord {
            id: String::new(),
            mode: "agent".to_string(),
            permission_mode: "accept-edits".to_string(),
            runtime_thread_id: String::new(),
            runtime_provider_id: String::new(),
            runtime_transport: String::new(),
            title: fallback.to_string(),
            created_at: now_ms(),
            updated_at: now_ms(),
            prompt_draft: String::new(),
            queued_prompt_draft: String::new(),
            attachments: Vec::new(),
            queued_attachments: Vec::new(),
        },
        fallback,
    );

    AiSessionOverlayState {
        current_session_id: session.id.clone(),
        sessions: vec![session],
    }
}

fn ensure_state(state: AiSessionOverlayState, fallback_title: &str) -> AiSessionOverlayState {
    let fallback = if fallback_title.trim().is_empty() {
        "New session"
    } else {
        fallback_title.trim()
    };
    let sessions = state
        .sessions
        .into_iter()
        .map(|session| normalize_session_record(session, fallback))
        .collect::<Vec<_>>();

    if sessions.is_empty() {
        return create_initial_state(fallback);
    }

    let current_session_id = if sessions
        .iter()
        .any(|session| session.id == state.current_session_id)
    {
        state.current_session_id
    } else {
        sessions
            .first()
            .map(|session| session.id.clone())
            .unwrap_or_default()
    };

    AiSessionOverlayState {
        current_session_id,
        sessions,
    }
}

fn find_session(state: &AiSessionOverlayState, session_id: &str) -> Option<AiSessionOverlayRecord> {
    let normalized_id = session_id.trim();
    if normalized_id.is_empty() {
        return state.sessions.first().cloned();
    }
    state
        .sessions
        .iter()
        .find(|session| session.id == normalized_id)
        .cloned()
        .or_else(|| state.sessions.first().cloned())
}

fn persist_state_for_workspace(
    workspace_path: &str,
    state: &AiSessionOverlayState,
) -> Result<(), String> {
    if workspace_path.trim().is_empty() {
        return Ok(());
    }
    let path = overlay_path_for_workspace(workspace_path)?;
    save_overlay_state_to_path(&path, state)
}

fn overlays_dir() -> Result<PathBuf, String> {
    let dir = app_dirs::data_root_dir()?.join("ai-session-overlays");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| format!("Failed to create overlays dir: {error}"))?;
    }
    Ok(dir)
}

fn overlay_path_for_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    let normalized = workspace_path.trim();
    if normalized.is_empty() {
        return Err("Workspace path is required.".to_string());
    }

    let encoded = URL_SAFE_NO_PAD.encode(normalized.as_bytes());
    Ok(overlays_dir()?.join(format!("{encoded}.json")))
}

fn load_overlay_state_from_path(path: &Path) -> Result<Option<AiSessionOverlayState>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read session overlay state: {error}"))?;
    let parsed = serde_json::from_str::<AiSessionOverlayState>(&content)
        .map_err(|error| format!("Failed to parse session overlay state: {error}"))?;
    Ok(Some(parsed))
}

fn save_overlay_state_to_path(path: &Path, state: &AiSessionOverlayState) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Overlay path is missing a parent directory.".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create overlay parent directory: {error}"))?;
    }

    let serialized = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize session overlay state: {error}"))?;
    fs::write(path, serialized).map_err(|error| format!("Failed to write session overlay state: {error}"))
}

async fn run_blocking<F, T>(operation: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    task::spawn_blocking(operation)
        .await
        .map_err(|error| format!("Background task failed: {error}"))?
}

#[tauri::command]
pub async fn ai_session_overlay_load(
    params: AiSessionOverlayLoadParams,
) -> Result<Option<AiSessionOverlayState>, String> {
    let workspace_path = params.workspace_path;
    run_blocking(move || {
        let path = overlay_path_for_workspace(&workspace_path)?;
        load_overlay_state_from_path(&path)
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_save(params: AiSessionOverlaySaveParams) -> Result<(), String> {
    let workspace_path = params.workspace_path;
    let state = params.state;
    run_blocking(move || {
        let path = overlay_path_for_workspace(&workspace_path)?;
        save_overlay_state_to_path(&path, &state)
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_restore(
    params: AiSessionOverlayRestoreParams,
) -> Result<AiSessionOverlayState, String> {
    let workspace_path = params.workspace_path;
    let fallback_title = params.fallback_title;
    run_blocking(move || {
        if workspace_path.trim().is_empty() {
            return Ok(create_initial_state(&fallback_title));
        }

        let path = overlay_path_for_workspace(&workspace_path)?;
        let restored = load_overlay_state_from_path(&path)?;
        Ok(match restored {
            Some(state) => ensure_state(state, &fallback_title),
            None => create_initial_state(&fallback_title),
        })
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_create(
    params: AiSessionOverlayCreateParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    run_blocking(move || {
        let mut state = ensure_state(
            AiSessionOverlayState {
                current_session_id: params.current_session_id,
                sessions: params.sessions,
            },
            &params.fallback_title,
        );
        let fallback = if params.fallback_title.trim().is_empty() {
            "New session"
        } else {
            params.fallback_title.trim()
        };
        let session = normalize_session_record(
            AiSessionOverlayRecord {
                id: String::new(),
                mode: params.mode,
                permission_mode: params.permission_mode,
                runtime_thread_id: String::new(),
                runtime_provider_id: String::new(),
                runtime_transport: String::new(),
                title: if params.title.trim().is_empty() {
                    fallback.to_string()
                } else {
                    params.title.trim().to_string()
                },
                created_at: now_ms(),
                updated_at: now_ms(),
                prompt_draft: String::new(),
                queued_prompt_draft: String::new(),
                attachments: Vec::new(),
                queued_attachments: Vec::new(),
            },
            fallback,
        );
        state.sessions.insert(0, session.clone());
        if params.activate {
            state.current_session_id = session.id.clone();
        }
        persist_state_for_workspace(&params.workspace_path, &state)?;
        Ok(AiSessionOverlayMutationResponse {
            success: true,
            state,
            session: Some(session),
        })
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_switch(
    params: AiSessionOverlaySwitchParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    run_blocking(move || {
        let mut state = ensure_state(
            AiSessionOverlayState {
                current_session_id: params.current_session_id,
                sessions: params.sessions,
            },
            &params.fallback_title,
        );
        let normalized_session_id = params.session_id.trim().to_string();
        let success = state
            .sessions
            .iter()
            .any(|session| session.id == normalized_session_id);
        if success {
            state.current_session_id = normalized_session_id;
            persist_state_for_workspace(&params.workspace_path, &state)?;
        }
        let session = find_session(&state, &state.current_session_id);
        Ok(AiSessionOverlayMutationResponse {
            success,
            state,
            session,
        })
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_delete(
    params: AiSessionOverlayDeleteParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    run_blocking(move || {
        let state = ensure_state(
            AiSessionOverlayState {
                current_session_id: params.current_session_id,
                sessions: params.sessions,
            },
            &params.fallback_title,
        );
        let normalized_session_id = if params.session_id.trim().is_empty() {
            state.current_session_id.clone()
        } else {
            params.session_id.trim().to_string()
        };
        if state.sessions.len() <= 1
            || !state.sessions.iter().any(|session| session.id == normalized_session_id)
        {
            let session = find_session(&state, &state.current_session_id);
            return Ok(AiSessionOverlayMutationResponse {
                success: false,
                state,
                session,
            });
        }

        let mut sessions = state
            .sessions
            .into_iter()
            .filter(|session| session.id != normalized_session_id)
            .collect::<Vec<_>>();
        let current_session_id = if state.current_session_id == normalized_session_id {
            sessions
                .first()
                .map(|session| session.id.clone())
                .unwrap_or_default()
        } else {
            state.current_session_id
        };
        let state = ensure_state(
            AiSessionOverlayState {
                current_session_id,
                sessions: std::mem::take(&mut sessions),
            },
            &params.fallback_title,
        );
        persist_state_for_workspace(&params.workspace_path, &state)?;
        let session = find_session(&state, &state.current_session_id);
        Ok(AiSessionOverlayMutationResponse {
            success: true,
            state,
            session,
        })
    })
    .await
}

#[tauri::command]
pub async fn ai_session_overlay_rename(
    params: AiSessionOverlayRenameParams,
) -> Result<AiSessionOverlayMutationResponse, String> {
    run_blocking(move || {
        let normalized_title = params.title.trim().to_string();
        let state = ensure_state(
            AiSessionOverlayState {
                current_session_id: params.current_session_id,
                sessions: params.sessions,
            },
            &params.fallback_title,
        );
        if normalized_title.is_empty() {
            let session = find_session(&state, &params.session_id);
            return Ok(AiSessionOverlayMutationResponse {
                success: false,
                state,
                session,
            });
        }

        let normalized_session_id = params.session_id.trim().to_string();
        let mut matched = false;
        let sessions = state
            .sessions
            .into_iter()
            .map(|mut session| {
                if session.id == normalized_session_id {
                    matched = true;
                    session.title = normalized_title.clone();
                    session.updated_at = now_ms();
                }
                session
            })
            .collect::<Vec<_>>();
        let state = ensure_state(
            AiSessionOverlayState {
                current_session_id: state.current_session_id,
                sessions,
            },
            &params.fallback_title,
        );
        if matched {
            persist_state_for_workspace(&params.workspace_path, &state)?;
        }
        let session = find_session(&state, &normalized_session_id);
        Ok(AiSessionOverlayMutationResponse {
            success: matched,
            state,
            session,
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_overlay_path(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        std::env::temp_dir()
            .join(format!("altals-ai-overlay-{label}-{stamp}"))
            .join("overlay.json")
    }

    #[test]
    fn save_and_load_overlay_state_round_trip() {
        let path = temp_overlay_path("roundtrip");
        let state = AiSessionOverlayState {
            current_session_id: "session-1".to_string(),
            sessions: vec![AiSessionOverlayRecord {
                id: "session-1".to_string(),
                mode: "agent".to_string(),
                permission_mode: "accept-edits".to_string(),
                runtime_thread_id: "thr_1".to_string(),
                runtime_provider_id: "openai".to_string(),
                runtime_transport: "codex-runtime".to_string(),
                title: "Session".to_string(),
                created_at: 1,
                updated_at: 2,
                prompt_draft: "draft".to_string(),
                queued_prompt_draft: "queued".to_string(),
                attachments: vec![json!({ "id": "att-1" })],
                queued_attachments: vec![json!({ "id": "att-2" })],
            }],
        };

        save_overlay_state_to_path(&path, &state).expect("save");
        let restored = load_overlay_state_from_path(&path)
            .expect("load")
            .expect("overlay state");

        assert_eq!(restored, state);

        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir_all(path.parent().unwrap_or_else(|| Path::new("")));
    }
}
