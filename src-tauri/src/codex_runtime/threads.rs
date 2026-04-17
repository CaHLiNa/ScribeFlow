use chrono::Utc;
use uuid::Uuid;

use super::protocol::{
    RuntimeThread, RuntimeThreadArchiveResponse, RuntimeThreadForkResponse,
    RuntimeThreadReadResponse, RuntimeThreadRenameResponse, RuntimeThreadRollbackResponse,
    RuntimeThreadSnapshot, RuntimeThreadStartParams, RuntimeThreadUnarchiveResponse,
    ThreadStatus, TurnStatus,
};
use super::state::CodexRuntimeState;

fn now_ts() -> i64 {
    Utc::now().timestamp()
}

fn build_thread_title(state: &CodexRuntimeState, requested_title: &str) -> String {
    let normalized = requested_title.trim();
    if !normalized.is_empty() {
        return normalized.to_string();
    }
    format!("Thread {}", state.ordered_thread_ids.len() + 1)
}

fn build_thread_snapshot(state: &CodexRuntimeState, thread: RuntimeThread) -> RuntimeThreadSnapshot {
    let turns = thread
        .turn_ids
        .iter()
        .filter_map(|turn_id| state.turns.get(turn_id).cloned())
        .collect::<Vec<_>>();

    let items = turns
        .iter()
        .flat_map(|turn| turn.item_ids.iter())
        .filter_map(|item_id| state.items.get(item_id).cloned())
        .collect::<Vec<_>>();

    let permission_requests = state
        .permission_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();

    let ask_user_requests = state
        .ask_user_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();

    let exit_plan_requests = state
        .exit_plan_requests
        .values()
        .filter(|request| request.thread_id == thread.id)
        .cloned()
        .collect::<Vec<_>>();

    let plan_mode = state.plan_modes.get(&thread.id).cloned();

    RuntimeThreadSnapshot {
        thread,
        turns,
        items,
        permission_requests,
        ask_user_requests,
        exit_plan_requests,
        plan_mode,
    }
}

pub fn start_thread(
    state: &mut CodexRuntimeState,
    params: RuntimeThreadStartParams,
) -> RuntimeThread {
    let now = now_ts();
    let thread = RuntimeThread {
        id: format!("thr_{}", Uuid::new_v4().simple()),
        title: build_thread_title(state, &params.title),
        cwd: params.cwd.filter(|value| !value.trim().is_empty()),
        status: ThreadStatus::Idle,
        created_at: now,
        updated_at: now,
        archived_at: None,
        active_turn_id: None,
        turn_ids: Vec::new(),
    };

    state.ordered_thread_ids.insert(0, thread.id.clone());
    state.threads.insert(thread.id.clone(), thread.clone());
    thread
}

pub fn list_threads(state: &CodexRuntimeState) -> Vec<RuntimeThread> {
    state
        .ordered_thread_ids
        .iter()
        .filter_map(|thread_id| state.threads.get(thread_id).cloned())
        .collect()
}

pub fn rename_thread(
    state: &mut CodexRuntimeState,
    thread_id: &str,
    title: &str,
) -> Result<RuntimeThreadRenameResponse, String> {
    let normalized_title = title.trim();
    if normalized_title.is_empty() {
        return Err("Thread title cannot be empty.".to_string());
    }

    let thread = state
        .threads
        .get_mut(thread_id)
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;
    thread.title = normalized_title.to_string();
    thread.updated_at = now_ts();

    Ok(RuntimeThreadRenameResponse {
        thread: thread.clone(),
    })
}

pub fn read_thread(
    state: &CodexRuntimeState,
    thread_id: &str,
) -> Result<RuntimeThreadReadResponse, String> {
    let thread = state
        .threads
        .get(thread_id)
        .cloned()
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;

    Ok(RuntimeThreadReadResponse {
        snapshot: build_thread_snapshot(state, thread),
    })
}

pub fn archive_thread(
    state: &mut CodexRuntimeState,
    thread_id: &str,
) -> Result<RuntimeThreadArchiveResponse, String> {
    let now = now_ts();
    let thread = state
        .threads
        .get_mut(thread_id)
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;

    thread.status = ThreadStatus::Archived;
    thread.updated_at = now;
    thread.archived_at = Some(now);
    thread.active_turn_id = None;

    Ok(RuntimeThreadArchiveResponse {
        thread: thread.clone(),
    })
}

pub fn unarchive_thread(
    state: &mut CodexRuntimeState,
    thread_id: &str,
) -> Result<RuntimeThreadUnarchiveResponse, String> {
    let now = now_ts();
    let thread = state
        .threads
        .get_mut(thread_id)
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;

    thread.status = ThreadStatus::Idle;
    thread.updated_at = now;
    thread.archived_at = None;

    Ok(RuntimeThreadUnarchiveResponse {
        thread: thread.clone(),
    })
}

pub fn fork_thread(
    state: &mut CodexRuntimeState,
    thread_id: &str,
    requested_title: &str,
) -> Result<RuntimeThreadForkResponse, String> {
    let source = state
        .threads
        .get(thread_id)
        .cloned()
        .ok_or_else(|| format!("Thread not found: {thread_id}"))?;
    let now = now_ts();
    let new_thread_id = format!("thr_{}", Uuid::new_v4().simple());
    let title = if requested_title.trim().is_empty() {
        format!("{} (Fork)", source.title)
    } else {
        requested_title.trim().to_string()
    };

    let source_turns = source
        .turn_ids
        .iter()
        .filter_map(|turn_id| state.turns.get(turn_id).cloned())
        .collect::<Vec<_>>();

    let mut next_turn_ids = Vec::new();
    let mut forked_turns = Vec::new();
    let mut forked_items = Vec::new();

    for turn in source_turns {
        let next_turn_id = format!("turn_{}", Uuid::new_v4().simple());
        let mut next_item_ids = Vec::new();

        for item_id in &turn.item_ids {
            let Some(item) = state.items.get(item_id).cloned() else {
                continue;
            };
            let next_item = super::protocol::RuntimeItem {
                id: format!("itm_{}", Uuid::new_v4().simple()),
                thread_id: new_thread_id.clone(),
                turn_id: next_turn_id.clone(),
                kind: item.kind,
                status: item.status,
                text: item.text,
                created_at: item.created_at,
                updated_at: item.updated_at,
            };
            next_item_ids.push(next_item.id.clone());
            state.items.insert(next_item.id.clone(), next_item.clone());
            forked_items.push(next_item);
        }

        let next_turn = super::protocol::RuntimeTurn {
            id: next_turn_id.clone(),
            thread_id: new_thread_id.clone(),
            status: if turn.status == TurnStatus::Running {
                TurnStatus::Interrupted
            } else {
                turn.status
            },
            user_text: turn.user_text,
            created_at: turn.created_at,
            updated_at: turn.updated_at,
            completed_at: turn.completed_at,
            interrupted_at: turn.interrupted_at,
            item_ids: next_item_ids.clone(),
        };
        next_turn_ids.push(next_turn_id.clone());
        state.turns.insert(next_turn_id, next_turn.clone());
        forked_turns.push(next_turn);
    }

    let forked_thread = RuntimeThread {
        id: new_thread_id.clone(),
        title,
        cwd: source.cwd,
        status: if source.status == ThreadStatus::Archived {
            ThreadStatus::Archived
        } else {
            ThreadStatus::Idle
        },
        created_at: now,
        updated_at: now,
        archived_at: if source.status == ThreadStatus::Archived {
            Some(now)
        } else {
            None
        },
        active_turn_id: None,
        turn_ids: next_turn_ids,
    };
    state.ordered_thread_ids.insert(0, new_thread_id.clone());
    state
        .threads
        .insert(new_thread_id.clone(), forked_thread.clone());

    Ok(RuntimeThreadForkResponse {
        snapshot: RuntimeThreadSnapshot {
            thread: forked_thread,
            turns: forked_turns,
            items: forked_items,
            permission_requests: Vec::new(),
            ask_user_requests: Vec::new(),
            exit_plan_requests: Vec::new(),
            plan_mode: None,
        },
    })
}

pub fn rollback_thread(
    state: &mut CodexRuntimeState,
    thread_id: &str,
    turns_to_drop: u32,
) -> Result<RuntimeThreadRollbackResponse, String> {
    let removed_turn_ids = {
        let thread = state
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| format!("Thread not found: {thread_id}"))?;
        let drop_count = if turns_to_drop == 0 {
            1
        } else {
            turns_to_drop as usize
        };
        if thread.turn_ids.is_empty() {
            return Err("Thread has no turns to roll back.".to_string());
        }

        thread
            .turn_ids
            .split_off(thread.turn_ids.len().saturating_sub(drop_count))
    };

    for turn_id in &removed_turn_ids {
        if let Some(turn) = state.turns.remove(turn_id) {
            for item_id in turn.item_ids {
                state.items.remove(&item_id);
            }
        }
    }

    let thread_snapshot = {
        let thread = state
            .threads
            .get_mut(thread_id)
            .ok_or_else(|| format!("Thread not found: {thread_id}"))?;
        thread.status = ThreadStatus::Idle;
        thread.active_turn_id = None;
        thread.updated_at = now_ts();
        thread.clone()
    };

    Ok(RuntimeThreadRollbackResponse {
        snapshot: build_thread_snapshot(state, thread_snapshot),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_thread_uses_requested_title_or_fallback() {
        let mut state = CodexRuntimeState::default();
        let first = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: String::new(),
                cwd: Some("/workspace".to_string()),
            },
        );
        let second = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Named".to_string(),
                cwd: None,
            },
        );

        assert_eq!(first.title, "Thread 1");
        assert_eq!(second.title, "Named");
        assert_eq!(state.ordered_thread_ids.len(), 2);
    }

    #[test]
    fn read_thread_collects_turns_and_items() {
        let mut state = CodexRuntimeState::default();
        let thread = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Thread".to_string(),
                cwd: None,
            },
        );

        let snapshot = read_thread(&state, &thread.id).expect("thread snapshot");
        assert_eq!(snapshot.snapshot.thread.id, thread.id);
        assert!(snapshot.snapshot.turns.is_empty());
        assert!(snapshot.snapshot.items.is_empty());
        assert!(snapshot.snapshot.permission_requests.is_empty());
        assert!(snapshot.snapshot.ask_user_requests.is_empty());
        assert!(snapshot.snapshot.exit_plan_requests.is_empty());
        assert_eq!(snapshot.snapshot.plan_mode, None);
    }

    #[test]
    fn read_thread_collects_pending_requests_and_plan_mode() {
        let mut state = CodexRuntimeState::default();
        let thread = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Thread".to_string(),
                cwd: None,
            },
        );

        state.permission_requests.insert(
            "perm-1".to_string(),
            super::super::protocol::RuntimePermissionRequest {
                request_id: "perm-1".to_string(),
                thread_id: thread.id.clone(),
                turn_id: None,
                tool_name: "read_workspace_file".to_string(),
                display_name: "Read workspace file".to_string(),
                title: "Allow read".to_string(),
                description: String::new(),
                decision_reason: String::new(),
                input_preview: String::new(),
            },
        );
        state.ask_user_requests.insert(
            "ask-1".to_string(),
            super::super::protocol::RuntimeAskUserRequest {
                request_id: "ask-1".to_string(),
                thread_id: thread.id.clone(),
                turn_id: None,
                title: "Question".to_string(),
                prompt: "Continue?".to_string(),
                description: String::new(),
                questions: Vec::new(),
            },
        );
        state.exit_plan_requests.insert(
            "exit-1".to_string(),
            super::super::protocol::RuntimeExitPlanRequest {
                request_id: "exit-1".to_string(),
                thread_id: thread.id.clone(),
                turn_id: None,
                title: "Exit plan".to_string(),
                allowed_prompts: Vec::new(),
            },
        );
        state.plan_modes.insert(
            thread.id.clone(),
            super::super::protocol::RuntimePlanModeState {
                thread_id: thread.id.clone(),
                active: true,
                summary: "Planning".to_string(),
                note: "Need approval".to_string(),
            },
        );

        let snapshot = read_thread(&state, &thread.id).expect("thread snapshot");
        assert_eq!(snapshot.snapshot.permission_requests.len(), 1);
        assert_eq!(snapshot.snapshot.ask_user_requests.len(), 1);
        assert_eq!(snapshot.snapshot.exit_plan_requests.len(), 1);
        assert_eq!(
            snapshot.snapshot.plan_mode,
            Some(super::super::protocol::RuntimePlanModeState {
                thread_id: thread.id,
                active: true,
                summary: "Planning".to_string(),
                note: "Need approval".to_string(),
            })
        );
    }

    #[test]
    fn unarchive_thread_restores_idle_status() {
        let mut state = CodexRuntimeState::default();
        let thread = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Thread".to_string(),
                cwd: None,
            },
        );
        let _ = archive_thread(&mut state, &thread.id).expect("archive");

        let response = unarchive_thread(&mut state, &thread.id).expect("unarchive");
        assert_eq!(response.thread.status, ThreadStatus::Idle);
        assert_eq!(response.thread.archived_at, None);
    }

    #[test]
    fn rename_thread_updates_title() {
        let mut state = CodexRuntimeState::default();
        let thread = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Thread".to_string(),
                cwd: None,
            },
        );

        let response = rename_thread(&mut state, &thread.id, "Renamed").expect("rename");
        assert_eq!(response.thread.title, "Renamed");
        assert_eq!(
            state.threads.get(&thread.id).map(|entry| entry.title.as_str()),
            Some("Renamed")
        );
    }
}
