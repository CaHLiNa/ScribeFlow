use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tokio::time::{sleep, Duration};

use crate::codex_runtime::protocol::{ItemKind, RuntimeTurnRunParams};
use crate::codex_runtime::providers::run_turn;
use crate::codex_runtime::state::CodexRuntimeHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeTurnWaitResponse {
    pub thread_id: String,
    pub turn_id: String,
    pub content: String,
    pub reasoning: String,
    pub transport: String,
}

pub async fn run_turn_and_wait<R: Runtime>(
    app: AppHandle<R>,
    handle: CodexRuntimeHandle,
    params: RuntimeTurnRunParams,
) -> Result<AiRuntimeTurnWaitResponse, String> {
    let started = run_turn(app, handle.clone(), params).await?;
    let thread_id = started.thread.id.clone();
    let turn_id = started.turn.id.clone();
    let assistant_item_id = started.assistant_item.id.clone();
    let reasoning_item_id = started.reasoning_item.id.clone();

    loop {
        let (status, content, reasoning) = {
            let runtime = handle.inner.lock().await;
            let turn = runtime
                .turns
                .get(&turn_id)
                .cloned()
                .ok_or_else(|| format!("Turn disappeared while waiting: {turn_id}"))?;
            let content = runtime
                .items
                .get(&assistant_item_id)
                .filter(|item| item.kind == ItemKind::AgentMessage)
                .map(|item| item.text.clone())
                .unwrap_or_default();
            let reasoning = runtime
                .items
                .get(&reasoning_item_id)
                .filter(|item| item.kind == ItemKind::Reasoning)
                .map(|item| item.text.clone())
                .unwrap_or_default();
            (turn.status, content, reasoning)
        };

        match status {
            crate::codex_runtime::protocol::TurnStatus::Completed => {
                return Ok(AiRuntimeTurnWaitResponse {
                    thread_id,
                    turn_id,
                    content,
                    reasoning,
                    transport: "codex-runtime".to_string(),
                });
            }
            crate::codex_runtime::protocol::TurnStatus::Interrupted => {
                return Err("AI execution stopped.".to_string());
            }
            crate::codex_runtime::protocol::TurnStatus::Failed => {
                return Err("AI execution failed.".to_string());
            }
            crate::codex_runtime::protocol::TurnStatus::Running => {}
        }

        sleep(Duration::from_millis(80)).await;
    }
}

#[tauri::command]
pub async fn ai_runtime_turn_run_wait<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeTurnRunParams,
) -> Result<AiRuntimeTurnWaitResponse, String> {
    run_turn_and_wait(app, CodexRuntimeHandle::from_state(state).clone(), params).await
}
