use chrono::Utc;
use uuid::Uuid;

use super::protocol::{
    RuntimeThread, RuntimeThreadArchiveResponse, RuntimeThreadRenameResponse,
    RuntimeThreadStartParams, ThreadStatus,
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
    };

    state.ordered_thread_ids.insert(0, thread.id.clone());
    state.threads.insert(thread.id.clone(), thread.clone());
    thread
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

    Ok(RuntimeThreadArchiveResponse {
        thread: thread.clone(),
    })
}
