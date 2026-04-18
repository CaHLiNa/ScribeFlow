use chrono::Utc;
use uuid::Uuid;

use super::protocol::{
    ItemKind, RuntimeItem, RuntimeTurn, RuntimeTurnInterruptResponse, RuntimeTurnStartParams,
    RuntimeTurnStartResponse, ThreadStatus, TurnStatus,
};
use super::state::CodexRuntimeState;

fn now_ts() -> i64 {
    Utc::now().timestamp()
}

fn build_user_item(thread_id: &str, turn_id: &str, user_text: &str, now: i64) -> RuntimeItem {
    RuntimeItem {
        id: format!("itm_{}", Uuid::new_v4().simple()),
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        kind: ItemKind::UserMessage,
        status: TurnStatus::Completed,
        text: user_text.to_string(),
        created_at: now,
        updated_at: now,
    }
}

pub fn build_runtime_item(
    thread_id: &str,
    turn_id: &str,
    kind: ItemKind,
    status: TurnStatus,
    text: &str,
    now: i64,
) -> RuntimeItem {
    RuntimeItem {
        id: format!("itm_{}", Uuid::new_v4().simple()),
        thread_id: thread_id.to_string(),
        turn_id: turn_id.to_string(),
        kind,
        status,
        text: text.to_string(),
        created_at: now,
        updated_at: now,
    }
}

pub fn start_turn(
    state: &mut CodexRuntimeState,
    params: RuntimeTurnStartParams,
) -> Result<RuntimeTurnStartResponse, String> {
    let now = now_ts();
    let thread = state
        .threads
        .get_mut(&params.thread_id)
        .ok_or_else(|| format!("Thread not found: {}", params.thread_id))?;

    if thread.archived_at.is_some() {
        return Err("Archived thread cannot accept new turns.".to_string());
    }

    if thread.active_turn_id.is_some() {
        return Err("Thread already has an active turn.".to_string());
    }

    let user_text = params.user_text.trim().to_string();
    if user_text.is_empty() {
        return Err("Turn input is required.".to_string());
    }

    let turn_id = format!("turn_{}", Uuid::new_v4().simple());
    let item = build_user_item(&thread.id, &turn_id, &user_text, now);
    let turn = RuntimeTurn {
        id: turn_id.clone(),
        thread_id: thread.id.clone(),
        status: TurnStatus::Running,
        user_text,
        created_at: now,
        updated_at: now,
        completed_at: None,
        interrupted_at: None,
        item_ids: vec![item.id.clone()],
    };

    thread.status = ThreadStatus::Running;
    thread.active_turn_id = Some(turn_id.clone());
    thread.updated_at = now;
    thread.turn_ids.push(turn_id.clone());

    let thread_snapshot = thread.clone();
    state.turns.insert(turn.id.clone(), turn.clone());
    state.items.insert(item.id.clone(), item.clone());

    Ok(RuntimeTurnStartResponse {
        thread: thread_snapshot,
        turn,
        items: vec![item],
    })
}

pub fn interrupt_turn(
    state: &mut CodexRuntimeState,
    thread_id: &str,
    turn_id: &str,
) -> Result<RuntimeTurnInterruptResponse, String> {
    let now = now_ts();
    let thread = state
        .threads
        .get_mut(thread_id)
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;

    if thread.active_turn_id.as_deref() != Some(turn_id) {
        return Err("Only the active turn can be interrupted.".to_string());
    }

    let turn = state
        .turns
        .get_mut(turn_id)
        .ok_or_else(|| format!("Turn not found: {turn_id}"))?;

    if turn.status != TurnStatus::Running {
        return Err("Only a running turn can be interrupted.".to_string());
    }

    turn.status = TurnStatus::Interrupted;
    turn.updated_at = now;
    turn.interrupted_at = Some(now);

    for item_id in &turn.item_ids {
        if let Some(item) = state.items.get_mut(item_id) {
            item.status = TurnStatus::Interrupted;
            item.updated_at = now;
        }
    }

    thread.status = ThreadStatus::Interrupted;
    thread.updated_at = now;
    thread.active_turn_id = None;

    Ok(RuntimeTurnInterruptResponse {
        thread: thread.clone(),
        turn: turn.clone(),
    })
}
