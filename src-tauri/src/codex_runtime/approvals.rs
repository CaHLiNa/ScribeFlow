use uuid::Uuid;

use super::protocol::{
    RuntimeAskUserRequest, RuntimeAskUserRequestParams, RuntimeAskUserRequestResponse,
    RuntimeAskUserResolveParams, RuntimeAskUserResolveResponse, RuntimeExitPlanRequest,
    RuntimeExitPlanRequestParams, RuntimeExitPlanRequestResponse, RuntimeExitPlanResolveParams,
    RuntimeExitPlanResolveResponse, RuntimePermissionRequest, RuntimePermissionRequestParams,
    RuntimePermissionRequestResponse, RuntimePermissionResolveParams,
    RuntimePermissionResolveResponse, RuntimePlanModeSetParams, RuntimePlanModeSetResponse,
    RuntimePlanModeState,
};
use super::state::CodexRuntimeState;

pub fn request_permission(
    state: &mut CodexRuntimeState,
    params: RuntimePermissionRequestParams,
) -> Result<RuntimePermissionRequestResponse, String> {
    if !state.threads.contains_key(&params.thread_id) {
        return Err(format!("Thread not found: {}", params.thread_id));
    }

    let request = RuntimePermissionRequest {
        request_id: format!("perm_{}", Uuid::new_v4().simple()),
        thread_id: params.thread_id,
        turn_id: params.turn_id,
        tool_name: params.tool_name.clone(),
        display_name: if params.display_name.trim().is_empty() {
            params.tool_name
        } else {
            params.display_name
        },
        title: params.title,
        description: params.description,
        decision_reason: params.decision_reason,
        input_preview: params.input_preview,
    };
    state
        .permission_requests
        .insert(request.request_id.clone(), request.clone());
    Ok(RuntimePermissionRequestResponse { request })
}

pub fn resolve_permission(
    state: &mut CodexRuntimeState,
    params: RuntimePermissionResolveParams,
) -> Result<RuntimePermissionResolveResponse, String> {
    let request = state
        .permission_requests
        .remove(&params.request_id)
        .ok_or_else(|| format!("Permission request not found: {}", params.request_id))?;
    Ok(RuntimePermissionResolveResponse {
        request_id: request.request_id,
        behavior: if params.behavior.trim().is_empty() {
            "deny".to_string()
        } else {
            params.behavior
        },
    })
}

pub fn request_ask_user(
    state: &mut CodexRuntimeState,
    params: RuntimeAskUserRequestParams,
) -> Result<RuntimeAskUserRequestResponse, String> {
    if !state.threads.contains_key(&params.thread_id) {
        return Err(format!("Thread not found: {}", params.thread_id));
    }

    let request = RuntimeAskUserRequest {
        request_id: format!("ask_{}", Uuid::new_v4().simple()),
        thread_id: params.thread_id,
        turn_id: params.turn_id,
        title: params.title,
        prompt: params.prompt,
        description: params.description,
        questions: params.questions,
    };
    state
        .ask_user_requests
        .insert(request.request_id.clone(), request.clone());
    Ok(RuntimeAskUserRequestResponse { request })
}

pub fn resolve_ask_user(
    state: &mut CodexRuntimeState,
    params: RuntimeAskUserResolveParams,
) -> Result<RuntimeAskUserResolveResponse, String> {
    let request = state
        .ask_user_requests
        .remove(&params.request_id)
        .ok_or_else(|| format!("Ask-user request not found: {}", params.request_id))?;
    Ok(RuntimeAskUserResolveResponse {
        request_id: request.request_id,
        answers: params.answers,
    })
}

pub fn request_exit_plan(
    state: &mut CodexRuntimeState,
    params: RuntimeExitPlanRequestParams,
) -> Result<RuntimeExitPlanRequestResponse, String> {
    if !state.threads.contains_key(&params.thread_id) {
        return Err(format!("Thread not found: {}", params.thread_id));
    }

    let request = RuntimeExitPlanRequest {
        request_id: format!("exit_plan_{}", Uuid::new_v4().simple()),
        thread_id: params.thread_id,
        turn_id: params.turn_id,
        title: params.title,
        allowed_prompts: params.allowed_prompts,
    };
    state
        .exit_plan_requests
        .insert(request.request_id.clone(), request.clone());
    Ok(RuntimeExitPlanRequestResponse { request })
}

pub fn resolve_exit_plan(
    state: &mut CodexRuntimeState,
    params: RuntimeExitPlanResolveParams,
) -> Result<RuntimeExitPlanResolveResponse, String> {
    let request = state
        .exit_plan_requests
        .remove(&params.request_id)
        .ok_or_else(|| format!("Exit-plan request not found: {}", params.request_id))?;
    Ok(RuntimeExitPlanResolveResponse {
        request_id: request.request_id,
        action: if params.action.trim().is_empty() {
            "deny".to_string()
        } else {
            params.action
        },
        feedback: params.feedback,
    })
}

pub fn set_plan_mode(
    state: &mut CodexRuntimeState,
    params: RuntimePlanModeSetParams,
) -> Result<RuntimePlanModeSetResponse, String> {
    if !state.threads.contains_key(&params.thread_id) {
        return Err(format!("Thread not found: {}", params.thread_id));
    }

    let plan_mode = RuntimePlanModeState {
        thread_id: params.thread_id.clone(),
        active: params.active,
        summary: params.summary,
        note: params.note,
    };
    if plan_mode.active {
        state
            .plan_modes
            .insert(plan_mode.thread_id.clone(), plan_mode.clone());
    } else {
        state.plan_modes.remove(&plan_mode.thread_id);
    }

    Ok(RuntimePlanModeSetResponse { plan_mode })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex_runtime::protocol::RuntimeThreadStartParams;
    use crate::codex_runtime::threads::start_thread;

    #[test]
    fn permission_request_round_trip_works() {
        let mut state = CodexRuntimeState::default();
        let thread = start_thread(
            &mut state,
            RuntimeThreadStartParams {
                title: "Thread".to_string(),
                cwd: None,
            },
        );

        let request = request_permission(
            &mut state,
            RuntimePermissionRequestParams {
                thread_id: thread.id.clone(),
                turn_id: None,
                tool_name: "Edit".to_string(),
                display_name: "".to_string(),
                title: "Permission".to_string(),
                description: "Need approval".to_string(),
                decision_reason: "".to_string(),
                input_preview: "".to_string(),
            },
        )
        .expect("request");

        let resolved = resolve_permission(
            &mut state,
            RuntimePermissionResolveParams {
                request_id: request.request.request_id,
                behavior: "allow".to_string(),
                persist: false,
                message: "".to_string(),
            },
        )
        .expect("resolve");

        assert_eq!(resolved.behavior, "allow");
        assert!(state.permission_requests.is_empty());
    }
}
