use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::latex::{CompileResult, LatexError};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexQueueStateInput {
    #[serde(default)]
    pub target_path: String,
    #[serde(default)]
    pub recipe: String,
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
    pub build_recipe: String,
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
    pub build_recipe: String,
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
    pub build_recipe: String,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub now: u64,
    #[serde(default)]
    pub queue_state: Option<LatexQueueStateInput>,
    pub result: CompileResult,
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
    should_schedule_timer: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LatexCompileFinishResult {
    source_state: Value,
    target_state: Value,
    queue_state: Option<Value>,
    rerun_requested: bool,
    next_source_path: String,
}

fn normalize_queue_state(
    current: Option<&LatexQueueStateInput>,
    target_path: &str,
    tex_path: &str,
    reason: &str,
    build_recipe: &str,
    build_extra_args: &str,
    phase: &str,
    pending_count: u32,
    now: u64,
) -> Value {
    let current = current.cloned().unwrap_or(LatexQueueStateInput {
        target_path: target_path.to_string(),
        recipe: build_recipe.to_string(),
        build_extra_args: build_extra_args.to_string(),
        pending_count: 0,
        source_path: tex_path.to_string(),
        reason: reason.to_string(),
        phase: phase.to_string(),
        updated_at: 0,
        scheduled_at: 0,
        started_at: 0,
    });

    json!({
        "targetPath": if target_path.is_empty() { current.target_path } else { target_path.to_string() },
        "recipe": if build_recipe.is_empty() { current.recipe } else { build_recipe.to_string() },
        "buildExtraArgs": if build_extra_args.is_empty() { current.build_extra_args } else { build_extra_args.to_string() },
        "pendingCount": pending_count,
        "sourcePath": if tex_path.is_empty() { current.source_path } else { tex_path.to_string() },
        "reason": if reason.is_empty() { current.reason } else { reason.to_string() },
        "phase": phase,
        "updatedAt": now,
        "scheduledAt": current.scheduled_at,
        "startedAt": if phase == "running" { now } else { current.started_at },
    })
}

fn build_compiling_state(
    target_path: &str,
    build_recipe: &str,
    build_extra_args: &str,
    linked_source_path: Option<&str>,
) -> Value {
    let mut value = json!({
        "status": "compiling",
        "errors": [],
        "warnings": [],
        "compileTargetPath": target_path,
        "buildRecipe": build_recipe,
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
    build_recipe: &str,
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
        "buildRecipe": build_recipe,
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

#[tauri::command]
pub async fn latex_runtime_schedule(params: LatexScheduleParams) -> Result<Value, String> {
    let current = params.queue_state.as_ref();
    let phase = current.map(|value| value.phase.as_str()).unwrap_or_default();

    let (next_phase, pending_count, should_schedule_timer) = match phase {
        "running" => (
            "running",
            current.map(|value| value.pending_count).unwrap_or(0) + 1,
            false,
        ),
        _ => ("scheduled", 0, true),
    };

    let queue_state = normalize_queue_state(
        current,
        &params.target_path,
        &params.source_path,
        &params.reason,
        &params.build_recipe,
        &params.build_extra_args,
        next_phase,
        pending_count,
        params.now,
    );

    Ok(
        serde_json::to_value(LatexScheduleResult {
            queue_state,
            should_schedule_timer,
        })
        .unwrap_or(Value::Null),
    )
}

#[tauri::command]
pub async fn latex_runtime_compile_start(params: LatexCompileStartParams) -> Result<Value, String> {
    let current = params.queue_state.as_ref();
    let already_running = current
        .map(|value| value.phase == "running")
        .unwrap_or(false);

    if already_running {
        let queue_state = normalize_queue_state(
            current,
            &params.target_path,
            &params.tex_path,
            &params.reason,
            &params.build_recipe,
            &params.build_extra_args,
            "running",
            current.map(|value| value.pending_count).unwrap_or(0) + 1,
            params.now,
        );
        return Ok(serde_json::to_value(LatexCompileStartResult {
            should_run: false,
            queue_state,
            source_state: Value::Null,
            target_state: None,
        })
        .unwrap_or(Value::Null));
    }

    let queue_state = normalize_queue_state(
        current,
        &params.target_path,
        &params.tex_path,
        &params.reason,
        &params.build_recipe,
        &params.build_extra_args,
        "running",
        current.map(|value| value.pending_count).unwrap_or(0),
        params.now,
    );

    Ok(serde_json::to_value(LatexCompileStartResult {
        should_run: true,
        queue_state,
        source_state: build_compiling_state(
            &params.target_path,
            &params.build_recipe,
            &params.build_extra_args,
            None,
        ),
        target_state: if params.target_path != params.tex_path {
            Some(build_compiling_state(
                &params.target_path,
                &params.build_recipe,
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
    params: LatexCompileFinishParams,
) -> Result<Value, String> {
    let rerun_requested = params
        .queue_state
        .as_ref()
        .map(|value| value.pending_count > 0)
        .unwrap_or(false);
    let next_source_path = params
        .queue_state
        .as_ref()
        .map(|value| value.source_path.clone())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| params.tex_path.clone());

    let queue_state = if rerun_requested {
        Some(normalize_queue_state(
            params.queue_state.as_ref(),
            &params.target_path,
            &next_source_path,
            "rerun",
            &params.build_recipe,
            &params.build_extra_args,
            "queued",
            0,
            params.now,
        ))
    } else {
        None
    };

    Ok(serde_json::to_value(LatexCompileFinishResult {
        source_state: build_finished_state(
            &params.target_path,
            &params.project_root_path,
            &params.project_preview_path,
            &params.build_recipe,
            &params.build_extra_args,
            params.now,
            &params.result,
            None,
        ),
        target_state: build_finished_state(
            &params.target_path,
            &params.project_root_path,
            &params.project_preview_path,
            &params.build_recipe,
            &params.build_extra_args,
            params.now,
            &params.result,
            Some(&params.tex_path),
        ),
        queue_state,
        rerun_requested,
        next_source_path,
    })
    .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn latex_runtime_compile_fail(params: LatexCompileFinishParams) -> Result<Value, String> {
    latex_runtime_compile_finish(LatexCompileFinishParams {
        result: build_error_result(
            &params
                .result
                .errors
                .first()
                .map(|error| error.message.clone())
                .unwrap_or_else(|| params.result.log.clone()),
        ),
        ..params
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        latex_runtime_compile_finish, latex_runtime_schedule, LatexCompileFinishParams,
        LatexQueueStateInput, LatexScheduleParams,
    };
    use crate::latex::CompileResult;

    #[tokio::test]
    async fn schedule_keeps_running_phase_and_increments_pending_when_busy() {
        let result = latex_runtime_schedule(LatexScheduleParams {
            source_path: "/workspace/chapters/a.tex".to_string(),
            target_path: "/workspace/main.tex".to_string(),
            reason: "save".to_string(),
            build_recipe: "default".to_string(),
            build_extra_args: "".to_string(),
            now: 123,
            queue_state: Some(LatexQueueStateInput {
                target_path: "/workspace/main.tex".to_string(),
                recipe: "default".to_string(),
                build_extra_args: "".to_string(),
                pending_count: 1,
                source_path: "/workspace/old.tex".to_string(),
                reason: "save".to_string(),
                phase: "running".to_string(),
                updated_at: 100,
                scheduled_at: 90,
                started_at: 95,
            }),
        })
        .await
        .expect("schedule");

        assert_eq!(result["shouldScheduleTimer"].as_bool(), Some(false));
        assert_eq!(result["queueState"]["phase"].as_str(), Some("running"));
        assert_eq!(result["queueState"]["pendingCount"].as_u64(), Some(2));
        assert_eq!(
            result["queueState"]["sourcePath"].as_str(),
            Some("/workspace/chapters/a.tex")
        );
    }

    #[tokio::test]
    async fn compile_finish_requests_rerun_from_pending_queue() {
        let result = latex_runtime_compile_finish(LatexCompileFinishParams {
            tex_path: "/workspace/chapters/a.tex".to_string(),
            target_path: "/workspace/main.tex".to_string(),
            project_root_path: "/workspace".to_string(),
            project_preview_path: "/workspace/main.pdf".to_string(),
            build_recipe: "default".to_string(),
            build_extra_args: "".to_string(),
            now: 456,
            queue_state: Some(LatexQueueStateInput {
                target_path: "/workspace/main.tex".to_string(),
                recipe: "default".to_string(),
                build_extra_args: "".to_string(),
                pending_count: 1,
                source_path: "/workspace/chapters/b.tex".to_string(),
                reason: "save".to_string(),
                phase: "running".to_string(),
                updated_at: 400,
                scheduled_at: 390,
                started_at: 395,
            }),
            result: CompileResult {
                success: true,
                pdf_path: Some("/workspace/main.pdf".to_string()),
                synctex_path: Some("/workspace/main.synctex.gz".to_string()),
                errors: vec![],
                warnings: vec![],
                log: String::new(),
                duration_ms: 12,
                compiler_backend: None,
                command_preview: None,
                requested_program: None,
                requested_program_applied: false,
            },
        })
        .await
        .expect("finish");

        assert_eq!(result["rerunRequested"].as_bool(), Some(true));
        assert_eq!(
            result["nextSourcePath"].as_str(),
            Some("/workspace/chapters/b.tex")
        );
        assert_eq!(result["queueState"]["phase"].as_str(), Some("queued"));
    }
}
