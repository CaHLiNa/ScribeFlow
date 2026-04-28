use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::latex::{CompileResult, LatexError, LatexState};
use crate::latex_compile::compile_latex_with_preference;
use crate::latex_tools::find_chktex;

const LATEX_RUNTIME_COMPILE_REQUESTED_EVENT: &str = "latex-runtime-compile-requested";
const LATEX_AUTOCOMPILE_DEBOUNCE_MS: u64 = 1_200;

#[derive(Default)]
pub struct LatexRuntimeState {
    queue: Arc<Mutex<HashMap<String, LatexRuntimeQueueEntry>>>,
}

#[derive(Debug, Clone)]
struct LatexRuntimeQueueEntry {
    state: LatexQueueStateInput,
    generation: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexQueueStateInput {
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub pending_count: u32,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default)]
    pub scheduled_at: u64,
    #[serde(default)]
    pub started_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompileStartParams {
    #[serde(default)]
    pub tex_path: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub now: u64,
    #[serde(default)]
    pub queue_state: Option<LatexQueueStateInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexScheduleParams {
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub now: u64,
    #[serde(default)]
    pub queue_state: Option<LatexQueueStateInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompileFinishParams {
    #[serde(default)]
    pub tex_path: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub project_root_path: String,
    #[serde(default)]
    pub project_preview_path: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub now: u64,
    #[serde(default)]
    pub queue_state: Option<LatexQueueStateInput>,
    pub result: CompileResult,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexCompileExecuteParams {
    #[serde(default)]
    pub tex_path: String,
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub project_root_path: String,
    #[serde(default)]
    pub project_preview_path: String,
    #[serde(default)]
    pub reason: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub now: u64,
    #[serde(default)]
    pub compiler_preference: Option<String>,
    #[serde(default)]
    pub engine_preference: Option<String>,
    #[serde(default)]
    pub custom_system_tex_path: Option<String>,
    #[serde(default)]
    pub custom_tectonic_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexRuntimeCancelParams {
    #[serde(default)]
    pub target_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexLintResolveParams {
    #[serde(default)]
    pub tex_path: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub custom_system_tex_path: Option<String>,
    #[serde(default)]
    pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileStartResult {
    should_run: bool,
    queue_state: Value,
    source_state: Value,
    target_state: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexScheduleResult {
    queue_state: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileFinishResult {
    source_state: Value,
    target_state: Value,
    queue_state: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileExecuteResult {
    source_state: Value,
    target_state: Value,
    queue_state: Option<Value>,
    result: CompileResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexRuntimeCompileRequestPayload {
    source_path: String,
    target_path: String,
    reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexLintStateResult {
    status: String,
    diagnostics: Vec<LatexError>,
    error: Option<String>,
    updated_at: u64,
}

fn runtime_key(target_path: &str, tex_path: &str) -> String {
    if !target_path.trim().is_empty() {
        target_path.trim().to_string()
    } else {
        tex_path.trim().to_string()
    }
}

fn queue_state_to_value(state: &LatexQueueStateInput) -> Value {
    json!({
        "targetPath": state.target_path,
        "buildExtraArgs": state.build_extra_args,
        "pendingCount": state.pending_count,
        "sourcePath": state.source_path,
        "reason": state.reason,
        "phase": state.phase,
        "updatedAt": state.updated_at,
        "scheduledAt": state.scheduled_at,
        "startedAt": state.started_at,
    })
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_queue_state(
    current: Option<&LatexQueueStateInput>,
    target_path: &str,
    tex_path: &str,
    reason: &str,
    build_extra_args: &str,
    phase: &str,
    pending_count: u32,
    now: u64,
) -> LatexQueueStateInput {
    let current = current.cloned().unwrap_or(LatexQueueStateInput {
        target_path: target_path.to_string(),
        build_extra_args: build_extra_args.to_string(),
        pending_count: 0,
        source_path: tex_path.to_string(),
        reason: reason.to_string(),
        phase: phase.to_string(),
        updated_at: 0,
        scheduled_at: 0,
        started_at: 0,
    });

    LatexQueueStateInput {
        target_path: if target_path.is_empty() {
            current.target_path
        } else {
            target_path.to_string()
        },
        build_extra_args: if build_extra_args.is_empty() {
            current.build_extra_args
        } else {
            build_extra_args.to_string()
        },
        pending_count,
        source_path: if tex_path.is_empty() {
            current.source_path
        } else {
            tex_path.to_string()
        },
        reason: if reason.is_empty() {
            current.reason
        } else {
            reason.to_string()
        },
        phase: phase.to_string(),
        updated_at: now,
        scheduled_at: if phase == "scheduled" {
            now
        } else {
            current.scheduled_at
        },
        started_at: if phase == "running" {
            now
        } else {
            current.started_at
        },
    }
}

fn build_compiling_state(
    target_path: &str,
    build_extra_args: &str,
    linked_source_path: Option<&str>,
) -> Value {
    let mut value = json!({
        "status": "compiling",
        "errors": [],
        "warnings": [],
        "compileTargetPath": target_path,
        "buildExtraArgs": build_extra_args,
    });

    if let Some(linked_source_path) = linked_source_path {
        value["linkedSourcePath"] = Value::String(linked_source_path.to_string());
    }

    value
}

fn build_finished_state(
    target_path: &str,
    project_root_path: &str,
    project_preview_path: &str,
    build_extra_args: &str,
    now: u64,
    result: &CompileResult,
    linked_source_path: Option<&str>,
) -> Value {
    let mut value = json!({
        "status": if result.success { "success" } else { "error" },
        "errors": result.errors,
        "warnings": result.warnings,
        "pdfPath": result.pdf_path,
        "synctexPath": result.synctex_path,
        "log": result.log,
        "durationMs": result.duration_ms,
        "lastCompiled": now,
        "compileTargetPath": target_path,
        "projectRootPath": project_root_path,
        "previewPath": if project_preview_path.is_empty() { result.pdf_path.clone() } else { Some(project_preview_path.to_string()) },
        "buildExtraArgs": build_extra_args,
    });

    if let Some(linked_source_path) = linked_source_path {
        value["linkedSourcePath"] = Value::String(linked_source_path.to_string());
    }

    value
}

fn build_error_result(message: &str) -> CompileResult {
    CompileResult {
        success: false,
        pdf_path: None,
        synctex_path: None,
        errors: vec![LatexError {
            file: None,
            line: None,
            column: None,
            message: message.to_string(),
            severity: "error".to_string(),
            raw: Some(message.to_string()),
        }],
        warnings: Vec::new(),
        log: message.to_string(),
        duration_ms: 0,
        compiler_backend: None,
        command_preview: None,
        requested_program: None,
        requested_program_applied: false,
    }
}

fn build_lint_state_result(
    status: &str,
    diagnostics: Vec<LatexError>,
    error: Option<String>,
) -> Value {
    serde_json::to_value(LatexLintStateResult {
        status: status.to_string(),
        diagnostics,
        error,
        updated_at: current_time_ms(),
    })
    .unwrap_or(Value::Null)
}

fn schedule_compile_request(
    app: AppHandle,
    queue: Arc<Mutex<HashMap<String, LatexRuntimeQueueEntry>>>,
    key: String,
    generation: u64,
) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(LATEX_AUTOCOMPILE_DEBOUNCE_MS)).await;
        let payload = {
            let guard = match queue.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            let Some(entry) = guard.get(&key) else {
                return;
            };
            if entry.generation != generation || entry.state.phase != "scheduled" {
                return;
            }
            LatexRuntimeCompileRequestPayload {
                source_path: entry.state.source_path.clone(),
                target_path: entry.state.target_path.clone(),
                reason: entry.state.reason.clone(),
            }
        };
        let _ = app_handle.emit(LATEX_RUNTIME_COMPILE_REQUESTED_EVENT, payload);
    });
}

fn emit_compile_request_now(app: &AppHandle, source_path: &str, target_path: &str, reason: &str) {
    let _ = app.emit(
        LATEX_RUNTIME_COMPILE_REQUESTED_EVENT,
        LatexRuntimeCompileRequestPayload {
            source_path: source_path.to_string(),
            target_path: target_path.to_string(),
            reason: reason.to_string(),
        },
    );
}

#[tauri::command]
pub async fn latex_runtime_schedule(
    app: AppHandle,
    state: State<'_, LatexRuntimeState>,
    params: LatexScheduleParams,
) -> Result<Value, String> {
    let key = runtime_key(&params.target_path, &params.source_path);
    let (queue_state, generation, should_debounce) = {
        let mut guard = state
            .queue
            .lock()
            .map_err(|_| "Failed to acquire latex runtime queue".to_string())?;
        let current = guard
            .get(&key)
            .map(|entry| entry.state.clone())
            .or(params.queue_state.clone());

        let (next_phase, pending_count, should_debounce) =
            match current.as_ref().map(|value| value.phase.as_str()) {
                Some("running") => (
                    "running",
                    current
                        .as_ref()
                        .map(|value| value.pending_count)
                        .unwrap_or(0)
                        + 1,
                    false,
                ),
                _ => ("scheduled", 0, true),
            };

        let generation = guard
            .get(&key)
            .map(|entry| entry.generation + 1)
            .unwrap_or(1);
        let queue_state = normalize_queue_state(
            current.as_ref(),
            &params.target_path,
            &params.source_path,
            &params.reason,
            &params.build_extra_args,
            next_phase,
            pending_count,
            params.now,
        );
        guard.insert(
            key.clone(),
            LatexRuntimeQueueEntry {
                state: queue_state.clone(),
                generation,
            },
        );
        (queue_state, generation, should_debounce)
    };

    if should_debounce {
        schedule_compile_request(app, state.queue.clone(), key, generation);
    }

    Ok(serde_json::to_value(LatexScheduleResult {
        queue_state: queue_state_to_value(&queue_state),
    })
    .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn latex_runtime_cancel(
    state: State<'_, LatexRuntimeState>,
    params: LatexRuntimeCancelParams,
) -> Result<(), String> {
    let mut guard = state
        .queue
        .lock()
        .map_err(|_| "Failed to acquire latex runtime queue".to_string())?;

    for path in params.target_paths {
        if path.trim().is_empty() {
            continue;
        }
        let Some(current) = guard.get(&path).cloned() else {
            continue;
        };
        if current.state.phase == "running" {
            continue;
        }
        guard.remove(&path);
    }

    Ok(())
}

#[tauri::command]
pub async fn latex_runtime_lint_resolve(params: LatexLintResolveParams) -> Result<Value, String> {
    if params.tex_path.trim().is_empty() {
        return Ok(build_lint_state_result("unavailable", Vec::new(), None));
    }

    if find_chktex(params.custom_system_tex_path.as_deref()).is_none() {
        return Ok(build_lint_state_result("unavailable", Vec::new(), None));
    }

    match crate::latex::run_chktex(
        params.tex_path,
        params.content,
        params.custom_system_tex_path,
        params.workspace_path,
    )
    .await
    {
        Ok(diagnostics) => Ok(build_lint_state_result("ready", diagnostics, None)),
        Err(error) => Ok(build_lint_state_result("error", Vec::new(), Some(error))),
    }
}

#[tauri::command]
pub async fn latex_runtime_compile_start(
    state: State<'_, LatexRuntimeState>,
    params: LatexCompileStartParams,
) -> Result<Value, String> {
    let key = runtime_key(&params.target_path, &params.tex_path);
    let (should_run, queue_state) = {
        let mut guard = state
            .queue
            .lock()
            .map_err(|_| "Failed to acquire latex runtime queue".to_string())?;
        let current = guard
            .get(&key)
            .map(|entry| entry.state.clone())
            .or(params.queue_state.clone());
        let already_running = current
            .as_ref()
            .map(|value| value.phase == "running")
            .unwrap_or(false);

        let queue_state = normalize_queue_state(
            current.as_ref(),
            &params.target_path,
            &params.tex_path,
            &params.reason,
            &params.build_extra_args,
            "running",
            if already_running {
                current
                    .as_ref()
                    .map(|value| value.pending_count)
                    .unwrap_or(0)
                    + 1
            } else {
                current
                    .as_ref()
                    .map(|value| value.pending_count)
                    .unwrap_or(0)
            },
            params.now,
        );
        let generation = guard
            .get(&key)
            .map(|entry| entry.generation + 1)
            .unwrap_or(1);
        guard.insert(
            key,
            LatexRuntimeQueueEntry {
                state: queue_state.clone(),
                generation,
            },
        );
        (!already_running, queue_state)
    };

    Ok(serde_json::to_value(LatexCompileStartResult {
        should_run,
        queue_state: queue_state_to_value(&queue_state),
        source_state: if should_run {
            build_compiling_state(&params.target_path, &params.build_extra_args, None)
        } else {
            Value::Null
        },
        target_state: if should_run && params.target_path != params.tex_path {
            Some(build_compiling_state(
                &params.target_path,
                &params.build_extra_args,
                Some(&params.tex_path),
            ))
        } else {
            None
        },
    })
    .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn latex_runtime_compile_finish(
    app: AppHandle,
    state: State<'_, LatexRuntimeState>,
    params: LatexCompileFinishParams,
) -> Result<Value, String> {
    let key = runtime_key(&params.target_path, &params.tex_path);
    let (queue_state, next_source_path) = {
        let mut guard = state
            .queue
            .lock()
            .map_err(|_| "Failed to acquire latex runtime queue".to_string())?;
        let current = guard
            .get(&key)
            .map(|entry| entry.state.clone())
            .or(params.queue_state.clone());
        let rerun_requested = current
            .as_ref()
            .map(|value| value.pending_count > 0)
            .unwrap_or(false);
        let next_source_path = current
            .as_ref()
            .map(|value| value.source_path.clone())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| params.tex_path.clone());

        if rerun_requested {
            let next_queue_state = normalize_queue_state(
                current.as_ref(),
                &params.target_path,
                &next_source_path,
                "rerun",
                &params.build_extra_args,
                "queued",
                0,
                params.now,
            );
            let generation = guard
                .get(&key)
                .map(|entry| entry.generation + 1)
                .unwrap_or(1);
            guard.insert(
                key.clone(),
                LatexRuntimeQueueEntry {
                    state: next_queue_state.clone(),
                    generation,
                },
            );
            (Some(next_queue_state), next_source_path)
        } else {
            guard.remove(&key);
            (None, next_source_path)
        }
    };

    if queue_state.is_some() {
        emit_compile_request_now(&app, &next_source_path, &params.target_path, "rerun");
    }

    Ok(serde_json::to_value(LatexCompileFinishResult {
        source_state: build_finished_state(
            &params.target_path,
            &params.project_root_path,
            &params.project_preview_path,
            &params.build_extra_args,
            params.now,
            &params.result,
            None,
        ),
        target_state: build_finished_state(
            &params.target_path,
            &params.project_root_path,
            &params.project_preview_path,
            &params.build_extra_args,
            params.now,
            &params.result,
            Some(&params.tex_path),
        ),
        queue_state: queue_state.as_ref().map(queue_state_to_value),
    })
    .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn latex_runtime_compile_fail(
    app: AppHandle,
    state: State<'_, LatexRuntimeState>,
    params: LatexCompileFinishParams,
) -> Result<Value, String> {
    latex_runtime_compile_finish(
        app,
        state,
        LatexCompileFinishParams {
            result: build_error_result(
                &params
                    .result
                    .errors
                    .first()
                    .map(|error| error.message.clone())
                    .unwrap_or_else(|| params.result.log.clone()),
            ),
            ..params
        },
    )
    .await
}

#[tauri::command]
pub async fn latex_runtime_compile_execute(
    app: AppHandle,
    runtime_state: State<'_, LatexRuntimeState>,
    latex_state: State<'_, LatexState>,
    params: LatexCompileExecuteParams,
) -> Result<Value, String> {
    {
        let mut compiling = latex_state
            .compiling
            .lock()
            .map_err(|_| "Failed to acquire latex compiling state".to_string())?;
        if *compiling.get(&params.tex_path).unwrap_or(&false) {
            return Err("Compilation already in progress for this file.".to_string());
        }
        compiling.insert(params.tex_path.clone(), true);
    }

    let compile_start = latex_runtime_compile_start(
        runtime_state.clone(),
        LatexCompileStartParams {
            tex_path: params.tex_path.clone(),
            target_path: params.target_path.clone(),
            reason: params.reason.clone(),
            build_extra_args: params.build_extra_args.clone(),
            now: params.now,
            queue_state: None,
        },
    )
    .await?;

    let should_run = compile_start
        .get("shouldRun")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !should_run {
        {
            let mut compiling = latex_state
                .compiling
                .lock()
                .map_err(|_| "Failed to acquire latex compiling state".to_string())?;
            compiling.remove(&params.tex_path);
        }
        return Ok(serde_json::to_value(LatexCompileExecuteResult {
            source_state: compile_start
                .get("sourceState")
                .cloned()
                .unwrap_or(Value::Null),
            target_state: compile_start
                .get("targetState")
                .cloned()
                .unwrap_or(Value::Null),
            queue_state: compile_start.get("queueState").cloned(),
            result: build_error_result("Compilation skipped because a compile is already running."),
        })
        .unwrap_or(Value::Null));
    }

    let compile_result = compile_latex_with_preference(
        &app,
        &params.target_path,
        params.compiler_preference,
        params.engine_preference,
        Some(params.build_extra_args.clone()),
        params.custom_system_tex_path,
        params.custom_tectonic_path,
    )
    .await;

    {
        let mut compiling = latex_state
            .compiling
            .lock()
            .map_err(|_| "Failed to acquire latex compiling state".to_string())?;
        compiling.remove(&params.tex_path);
    }

    let compile_result = match compile_result {
        Ok(result) => result,
        Err(error) => build_error_result(&error),
    };

    let finish = latex_runtime_compile_finish(
        app,
        runtime_state,
        LatexCompileFinishParams {
            tex_path: params.tex_path,
            target_path: params.target_path,
            project_root_path: params.project_root_path,
            project_preview_path: params.project_preview_path,
            build_extra_args: params.build_extra_args,
            now: current_time_ms(),
            queue_state: None,
            result: compile_result.clone(),
        },
    )
    .await?;

    Ok(serde_json::to_value(LatexCompileExecuteResult {
        source_state: finish.get("sourceState").cloned().unwrap_or(Value::Null),
        target_state: finish.get("targetState").cloned().unwrap_or(Value::Null),
        queue_state: finish.get("queueState").cloned(),
        result: compile_result,
    })
    .unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
    use super::{normalize_queue_state, runtime_key, LatexQueueStateInput};

    #[test]
    fn runtime_key_prefers_target_path() {
        assert_eq!(
            runtime_key("/workspace/main.tex", "/workspace/chapter.tex"),
            "/workspace/main.tex"
        );
        assert_eq!(
            runtime_key("", "/workspace/chapter.tex"),
            "/workspace/chapter.tex"
        );
    }

    #[test]
    fn normalize_queue_state_updates_runtime_fields() {
        let current = LatexQueueStateInput {
            target_path: "/workspace/main.tex".to_string(),
            build_extra_args: "".to_string(),
            pending_count: 1,
            source_path: "/workspace/old.tex".to_string(),
            reason: "save".to_string(),
            phase: "running".to_string(),
            updated_at: 10,
            scheduled_at: 20,
            started_at: 30,
        };

        let next = normalize_queue_state(
            Some(&current),
            "/workspace/main.tex",
            "/workspace/new.tex",
            "rerun",
            "-halt-on-error",
            "queued",
            0,
            99,
        );

        assert_eq!(next.target_path, "/workspace/main.tex");
        assert_eq!(next.source_path, "/workspace/new.tex");
        assert_eq!(next.reason, "rerun");
        assert_eq!(next.build_extra_args, "-halt-on-error");
        assert_eq!(next.phase, "queued");
        assert_eq!(next.pending_count, 0);
        assert_eq!(next.updated_at, 99);
    }
}
