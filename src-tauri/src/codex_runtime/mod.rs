mod approvals;
mod events;
pub(crate) mod protocol;
pub(crate) mod providers;
pub(crate) mod state;
pub(crate) mod storage;
pub(crate) mod threads;
pub(crate) mod tools;
mod turns;

use tauri::{AppHandle, Runtime, State};

pub use state::CodexRuntimeHandle;

use self::approvals::{
    request_ask_user, request_exit_plan, request_permission, resolve_ask_user, resolve_exit_plan,
    resolve_permission, set_plan_mode,
};
use self::events::emit_runtime_event;
use self::protocol::{
    RuntimeAskUserRequestParams, RuntimeAskUserRequestResponse, RuntimeAskUserResolveParams,
    RuntimeAskUserResolveResponse, RuntimeExitPlanRequestParams, RuntimeExitPlanRequestResponse,
    RuntimeExitPlanResolveParams, RuntimeExitPlanResolveResponse, RuntimePermissionRequestParams,
    RuntimePermissionRequestResponse, RuntimePermissionResolveParams,
    RuntimePermissionResolveResponse, RuntimePlanModeSetParams, RuntimePlanModeSetResponse,
    RuntimeThreadArchiveParams, RuntimeThreadArchiveResponse, RuntimeThreadForkParams,
    RuntimeThreadForkResponse, RuntimeThreadListResponse, RuntimeThreadReadParams,
    RuntimeThreadReadResponse, RuntimeThreadRenameParams, RuntimeThreadRenameResponse,
    RuntimeThreadRollbackParams, RuntimeThreadRollbackResponse, RuntimeThreadStartParams,
    RuntimeThreadStartResponse, RuntimeThreadUnarchiveParams, RuntimeThreadUnarchiveResponse,
    RuntimeTurnInterruptParams, RuntimeTurnInterruptResponse, RuntimeTurnRunParams,
    RuntimeTurnRunResponse, RuntimeTurnStartParams, RuntimeTurnStartResponse,
};
use self::providers::{abort_running_turn_task, run_turn};
use self::storage::persist_runtime_state;
use self::threads::{
    archive_thread, fork_thread, list_threads, read_thread, rename_thread, rollback_thread,
    start_thread, unarchive_thread,
};
use self::turns::{interrupt_turn, start_turn};

#[tauri::command]
pub async fn runtime_thread_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadStartParams,
) -> Result<RuntimeThreadStartResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let thread = start_thread(&mut runtime, params);
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadStarted",
        Some(thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(RuntimeThreadStartResponse { thread })
}

#[tauri::command]
pub async fn runtime_thread_list(
    state: State<'_, CodexRuntimeHandle>,
) -> Result<RuntimeThreadListResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let runtime = handle.inner.lock().await;
    Ok(RuntimeThreadListResponse {
        threads: list_threads(&runtime),
    })
}

#[tauri::command]
pub async fn runtime_thread_read(
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadReadParams,
) -> Result<RuntimeThreadReadResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let runtime = handle.inner.lock().await;
    read_thread(&runtime, &params.thread_id)
}

#[tauri::command]
pub async fn runtime_thread_rename<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadRenameParams,
) -> Result<RuntimeThreadRenameResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = rename_thread(&mut runtime, &params.thread_id, &params.title)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadRenamed",
        Some(response.thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_thread_archive<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadArchiveParams,
) -> Result<RuntimeThreadArchiveResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = archive_thread(&mut runtime, &params.thread_id)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadArchived",
        Some(response.thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_thread_unarchive<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadUnarchiveParams,
) -> Result<RuntimeThreadUnarchiveResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = unarchive_thread(&mut runtime, &params.thread_id)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadUnarchived",
        Some(response.thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_thread_fork<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadForkParams,
) -> Result<RuntimeThreadForkResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = fork_thread(&mut runtime, &params.thread_id, &params.title)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadForked",
        Some(response.snapshot.thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_thread_rollback<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeThreadRollbackParams,
) -> Result<RuntimeThreadRollbackResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = rollback_thread(&mut runtime, &params.thread_id, params.turns)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "threadRolledBack",
        Some(response.snapshot.thread.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_turn_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeTurnStartParams,
) -> Result<RuntimeTurnStartResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = start_turn(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;

    emit_runtime_event(
        &app,
        "turnStarted",
        Some(response.thread.clone()),
        Some(response.turn.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    for item in &response.items {
        emit_runtime_event(
            &app,
            "itemCompleted",
            Some(response.thread.clone()),
            Some(response.turn.clone()),
            Some(item.clone()),
            None,
            None,
            None,
            None,
            None,
            None,
        );
    }

    Ok(response)
}

#[tauri::command]
pub async fn runtime_turn_interrupt<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeTurnInterruptParams,
) -> Result<RuntimeTurnInterruptResponse, String> {
    let _ = abort_running_turn_task(&params.turn_id).await;
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = interrupt_turn(&mut runtime, &params.thread_id, &params.turn_id)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "turnInterrupted",
        Some(response.thread.clone()),
        Some(response.turn.clone()),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_turn_run<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeTurnRunParams,
) -> Result<RuntimeTurnRunResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state).clone();
    run_turn(app, handle, params).await
}

#[tauri::command]
pub async fn runtime_permission_request<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimePermissionRequestParams,
) -> Result<RuntimePermissionRequestResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = request_permission(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "permissionRequest",
        runtime.threads.get(&response.request.thread_id).cloned(),
        response
            .request
            .turn_id
            .as_ref()
            .and_then(|turn_id| runtime.turns.get(turn_id).cloned()),
        None,
        Some(response.request.clone()),
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_permission_resolve<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimePermissionResolveParams,
) -> Result<RuntimePermissionResolveResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = resolve_permission(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "permissionResolved",
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_ask_user_request<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeAskUserRequestParams,
) -> Result<RuntimeAskUserRequestResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = request_ask_user(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "askUserRequest",
        runtime.threads.get(&response.request.thread_id).cloned(),
        response
            .request
            .turn_id
            .as_ref()
            .and_then(|turn_id| runtime.turns.get(turn_id).cloned()),
        None,
        None,
        Some(response.request.clone()),
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_ask_user_resolve<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeAskUserResolveParams,
) -> Result<RuntimeAskUserResolveResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = resolve_ask_user(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "askUserResolved",
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_exit_plan_request<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeExitPlanRequestParams,
) -> Result<RuntimeExitPlanRequestResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = request_exit_plan(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "exitPlanRequest",
        runtime.threads.get(&response.request.thread_id).cloned(),
        response
            .request
            .turn_id
            .as_ref()
            .and_then(|turn_id| runtime.turns.get(turn_id).cloned()),
        None,
        None,
        None,
        Some(response.request.clone()),
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_exit_plan_resolve<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimeExitPlanResolveParams,
) -> Result<RuntimeExitPlanResolveResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = resolve_exit_plan(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        "exitPlanResolved",
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    Ok(response)
}

#[tauri::command]
pub async fn runtime_plan_mode_set<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, CodexRuntimeHandle>,
    params: RuntimePlanModeSetParams,
) -> Result<RuntimePlanModeSetResponse, String> {
    let handle = CodexRuntimeHandle::from_state(state);
    let mut runtime = handle.inner.lock().await;
    let response = set_plan_mode(&mut runtime, params)?;
    persist_runtime_state(&runtime)?;
    emit_runtime_event(
        &app,
        if response.plan_mode.active {
            "planModeStart"
        } else {
            "planModeEnd"
        },
        runtime.threads.get(&response.plan_mode.thread_id).cloned(),
        None,
        None,
        None,
        None,
        None,
        Some(response.plan_mode.clone()),
        None,
        None,
    );
    Ok(response)
}
