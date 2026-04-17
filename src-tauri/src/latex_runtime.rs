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

