use std::time::{SystemTime, UNIX_EPOCH};

use uuid::Uuid;

use crate::research_task_protocol::{
    ResearchTask, ResearchTaskEnsureParams, ResearchTaskEnsureResponse, ResearchTaskListParams,
    ResearchTaskListResponse, ResearchTaskUpdateParams, ResearchTaskUpdateResponse,
};
use crate::research_task_storage::{load_workspace_tasks, persist_workspace_tasks};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_kind(value: &str) -> String {
    let normalized = trim(value);
    if normalized.is_empty() {
        "general-research".to_string()
    } else {
        normalized
    }
}

fn normalize_status(value: &str) -> String {
    match trim(value).to_lowercase().as_str() {
        "completed" | "done" => "completed".to_string(),
        "blocked" => "blocked".to_string(),
        "failed" | "error" => "failed".to_string(),
        _ => "active".to_string(),
    }
}

fn normalize_phase(value: &str) -> String {
    match trim(value).to_lowercase().as_str() {
        "gathering" | "context" => "gathering".to_string(),
        "evidence" => "evidence".to_string(),
        "writing" | "drafting" => "writing".to_string(),
        "verification" => "verification".to_string(),
        "completed" => "completed".to_string(),
        "blocked" => "blocked".to_string(),
        _ => "scoping".to_string(),
    }
}

fn normalize_vec(values: Option<Vec<String>>) -> Vec<String> {
    let mut entries = values
        .unwrap_or_default()
        .into_iter()
        .map(|value| trim(&value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    entries.sort();
    entries.dedup();
    entries
}

fn sort_tasks(tasks: &mut [ResearchTask]) {
    tasks.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
}

fn default_goal(title: &str) -> String {
    if trim(title).is_empty() {
        "完成当前研究任务".to_string()
    } else {
        format!("完成研究任务：{}", trim(title))
    }
}

fn create_task(
    workspace_path: &str,
    runtime_thread_id: &str,
    title: &str,
    goal: &str,
    kind: &str,
    active_document_paths: Vec<String>,
) -> ResearchTask {
    let now = now_ms();
    let resolved_title = if trim(title).is_empty() {
        "研究任务".to_string()
    } else {
        trim(title)
    };
    let resolved_goal = if trim(goal).is_empty() {
        default_goal(&resolved_title)
    } else {
        trim(goal)
    };
    ResearchTask {
        id: format!("research-task:{}", Uuid::new_v4()),
        kind: normalize_kind(kind),
        title: resolved_title,
        goal: resolved_goal,
        status: "active".to_string(),
        phase: "scoping".to_string(),
        success_criteria: Vec::new(),
        workspace_path: trim(workspace_path),
        runtime_thread_id: trim(runtime_thread_id),
        active_document_paths,
        reference_ids: Vec::new(),
        evidence_ids: Vec::new(),
        artifact_ids: Vec::new(),
        verification_summary: String::new(),
        blocked_reason: String::new(),
        resume_hint: String::new(),
        created_at: now,
        updated_at: now,
    }
}

pub(crate) fn find_research_task_by_thread_id(
    workspace_path: &str,
    runtime_thread_id: &str,
) -> Result<Option<ResearchTask>, String> {
    let normalized_thread_id = trim(runtime_thread_id);
    if trim(workspace_path).is_empty() || normalized_thread_id.is_empty() {
        return Ok(None);
    }
    Ok(load_workspace_tasks(workspace_path)?
        .into_iter()
        .find(|task| task.runtime_thread_id == normalized_thread_id))
}

pub(crate) fn ensure_research_task_for_thread(
    workspace_path: &str,
    runtime_thread_id: &str,
    title: &str,
    goal: &str,
    kind: &str,
    active_document_paths: Vec<String>,
) -> Result<ResearchTask, String> {
    let normalized_workspace_path = trim(workspace_path);
    if normalized_workspace_path.is_empty() {
        return Err("Workspace path is required for research task binding.".to_string());
    }
    let normalized_thread_id = trim(runtime_thread_id);
    if normalized_thread_id.is_empty() {
        return Err("Runtime thread id is required for research task binding.".to_string());
    }

    let mut tasks = load_workspace_tasks(&normalized_workspace_path)?;
    if let Some(index) = tasks
        .iter()
        .position(|task| task.runtime_thread_id == normalized_thread_id)
    {
        let mut task = tasks[index].clone();
        if !trim(title).is_empty() {
            task.title = trim(title);
        }
        if !trim(goal).is_empty() {
            task.goal = trim(goal);
        } else if task.goal.is_empty() {
            task.goal = default_goal(&task.title);
        }
        let normalized_documents = normalize_vec(Some(active_document_paths));
        if !normalized_documents.is_empty() {
            task.active_document_paths = normalized_documents;
        }
        task.updated_at = now_ms();
        tasks[index] = task.clone();
        sort_tasks(&mut tasks);
        persist_workspace_tasks(&normalized_workspace_path, &tasks)?;
        return Ok(task);
    }

    let task = create_task(
        &normalized_workspace_path,
        &normalized_thread_id,
        title,
        goal,
        kind,
        normalize_vec(Some(active_document_paths)),
    );
    tasks.push(task.clone());
    sort_tasks(&mut tasks);
    persist_workspace_tasks(&normalized_workspace_path, &tasks)?;
    Ok(task)
}

pub(crate) fn sync_research_task_title_for_thread(
    workspace_path: &str,
    runtime_thread_id: &str,
    title: &str,
) -> Result<Option<ResearchTask>, String> {
    let normalized_workspace_path = trim(workspace_path);
    let normalized_thread_id = trim(runtime_thread_id);
    if normalized_workspace_path.is_empty()
        || normalized_thread_id.is_empty()
        || trim(title).is_empty()
    {
        return Ok(None);
    }

    let mut tasks = load_workspace_tasks(&normalized_workspace_path)?;
    let Some(index) = tasks
        .iter()
        .position(|task| task.runtime_thread_id == normalized_thread_id)
    else {
        return Ok(None);
    };

    let mut task = tasks[index].clone();
    task.title = trim(title);
    task.updated_at = now_ms();
    tasks[index] = task.clone();
    sort_tasks(&mut tasks);
    persist_workspace_tasks(&normalized_workspace_path, &tasks)?;
    Ok(Some(task))
}

#[tauri::command]
pub async fn research_task_list(
    params: ResearchTaskListParams,
) -> Result<ResearchTaskListResponse, String> {
    let mut tasks = load_workspace_tasks(&params.workspace_path)?;
    sort_tasks(&mut tasks);
    Ok(ResearchTaskListResponse { tasks })
}

#[tauri::command]
pub async fn research_task_ensure(
    params: ResearchTaskEnsureParams,
) -> Result<ResearchTaskEnsureResponse, String> {
    Ok(ResearchTaskEnsureResponse {
        task: ensure_research_task_for_thread(
            &params.workspace_path,
            &params.runtime_thread_id,
            &params.title,
            &params.goal,
            &params.kind,
            params.active_document_paths,
        )?,
    })
}

#[tauri::command]
pub async fn research_task_update(
    params: ResearchTaskUpdateParams,
) -> Result<ResearchTaskUpdateResponse, String> {
    let normalized_workspace_path = trim(&params.workspace_path);
    if normalized_workspace_path.is_empty() {
        return Err("Workspace path is required for research task update.".to_string());
    }
    let normalized_task_id = trim(&params.task_id);
    if normalized_task_id.is_empty() {
        return Err("Task id is required for research task update.".to_string());
    }

    let mut tasks = load_workspace_tasks(&normalized_workspace_path)?;
    let Some(index) = tasks.iter().position(|task| task.id == normalized_task_id) else {
        return Err(format!("Research task not found: {normalized_task_id}"));
    };

    let mut task = tasks[index].clone();
    if let Some(title) = params.title {
        let normalized = trim(&title);
        if !normalized.is_empty() {
            task.title = normalized;
        }
    }
    if let Some(goal) = params.goal {
        let normalized = trim(&goal);
        task.goal = if normalized.is_empty() {
            default_goal(&task.title)
        } else {
            normalized
        };
    }
    if let Some(kind) = params.kind {
        task.kind = normalize_kind(&kind);
    }
    if let Some(status) = params.status {
        task.status = normalize_status(&status);
    }
    if let Some(phase) = params.phase {
        task.phase = normalize_phase(&phase);
    }
    if let Some(success_criteria) = params.success_criteria {
        task.success_criteria = normalize_vec(Some(success_criteria));
    }
    if let Some(active_document_paths) = params.active_document_paths {
        task.active_document_paths = normalize_vec(Some(active_document_paths));
    }
    if let Some(reference_ids) = params.reference_ids {
        task.reference_ids = normalize_vec(Some(reference_ids));
    }
    if let Some(evidence_ids) = params.evidence_ids {
        task.evidence_ids = normalize_vec(Some(evidence_ids));
    }
    if let Some(artifact_ids) = params.artifact_ids {
        task.artifact_ids = normalize_vec(Some(artifact_ids));
    }
    if let Some(verification_summary) = params.verification_summary {
        task.verification_summary = trim(&verification_summary);
    }
    if let Some(blocked_reason) = params.blocked_reason {
        task.blocked_reason = trim(&blocked_reason);
    }
    if let Some(resume_hint) = params.resume_hint {
        task.resume_hint = trim(&resume_hint);
    }
    task.updated_at = now_ms();

    tasks[index] = task.clone();
    sort_tasks(&mut tasks);
    persist_workspace_tasks(&normalized_workspace_path, &tasks)?;

    Ok(ResearchTaskUpdateResponse { task })
}
