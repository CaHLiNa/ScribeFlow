use crate::app_dirs;
use crate::extension_artifacts::ExtensionArtifact;
use crate::extension_outputs::ExtensionCapabilityOutput;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
#[cfg(not(test))]
use tauri::Emitter;

const TASKS_FILENAME: &str = "tasks.json";
#[cfg(not(test))]
pub const EXTENSION_TASK_CHANGED_EVENT: &str = "extension-task-changed";

#[derive(Clone, Default)]
pub struct ExtensionTaskRuntimeState {
    running_pids: Arc<Mutex<HashMap<String, u32>>>,
    #[cfg(not(test))]
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskTarget {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub reference_id: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskProgress {
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub current: u32,
    #[serde(default)]
    pub total: u32,
}

impl Default for ExtensionTaskProgress {
    fn default() -> Self {
        Self {
            label: String::new(),
            current: 0,
            total: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTask {
    pub id: String,
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
    pub capability: String,
    #[serde(default)]
    pub command_id: String,
    pub state: String,
    pub created_at: String,
    pub started_at: String,
    pub finished_at: String,
    pub target: ExtensionTaskTarget,
    pub settings: Value,
    pub progress: ExtensionTaskProgress,
    pub artifacts: Vec<ExtensionArtifact>,
    #[serde(default)]
    pub outputs: Vec<ExtensionCapabilityOutput>,
    pub error: String,
    pub log_path: String,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskArtifactPatch {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub media_type: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub source_hash: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskOutputPatch {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "type", default)]
    pub output_type: String,
    #[serde(default)]
    pub media_type: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub html: String,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskUpdatePatch {
    #[serde(default)]
    pub task_id: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub progress_label: String,
    pub progress_current: Option<u32>,
    pub progress_total: Option<u32>,
    #[serde(default)]
    pub error: String,
    pub artifacts: Option<Vec<ExtensionTaskArtifactPatch>>,
    pub outputs: Option<Vec<ExtensionTaskOutputPatch>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionTasksFile {
    #[serde(default = "default_tasks_version")]
    version: u32,
    #[serde(default)]
    tasks: Vec<ExtensionTask>,
}

impl Default for ExtensionTasksFile {
    fn default() -> Self {
        Self {
            version: default_tasks_version(),
            tasks: Vec::new(),
        }
    }
}

fn default_tasks_version() -> u32 {
    1
}

fn now_string() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn normalize_task_state(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "queued" => Some("queued"),
        "running" => Some("running"),
        "succeeded" => Some("succeeded"),
        "failed" => Some("failed"),
        "cancelled" => Some("cancelled"),
        _ => None,
    }
}

fn is_terminal_task_state(value: &str) -> bool {
    matches!(value.trim(), "succeeded" | "failed" | "cancelled")
}

pub fn tasks_dir() -> Result<PathBuf, String> {
    app_dirs::extension_tasks_dir()
}

fn task_dir_in(tasks_root: &Path, task_id: &str) -> Result<PathBuf, String> {
    let dir = tasks_root.join(task_id);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    }
    Ok(dir)
}

fn tasks_file_path_in(tasks_root: &Path) -> PathBuf {
    tasks_root.join(TASKS_FILENAME)
}

fn read_tasks_file_raw_from(tasks_root: &Path) -> Result<ExtensionTasksFile, String> {
    let path = tasks_file_path_in(tasks_root);
    if !path.exists() {
        return Ok(ExtensionTasksFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str::<ExtensionTasksFile>(&content)
        .map_err(|error| format!("Failed to parse extension tasks: {error}"))
}

fn write_tasks_file_to(tasks_root: &Path, file: &ExtensionTasksFile) -> Result<(), String> {
    let path = tasks_file_path_in(tasks_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(file)
        .map_err(|error| format!("Failed to serialize extension tasks: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

#[cfg(not(test))]
fn emit_task_changed(task: &ExtensionTask, app_handle: &Arc<Mutex<Option<tauri::AppHandle>>>) {
    let Ok(handle) = app_handle.lock() else {
        return;
    };
    if let Some(app) = handle.as_ref() {
        let _ = app.emit(EXTENSION_TASK_CHANGED_EVENT, task.clone());
    }
}

fn recover_interrupted_tasks(mut file: ExtensionTasksFile) -> ExtensionTasksFile {
    let now = now_string();
    for task in &mut file.tasks {
        if matches!(task.state.as_str(), "queued" | "running") {
            task.state = "failed".to_string();
            task.finished_at = now.clone();
            task.error = "Interrupted by application shutdown".to_string();
        }
    }
    file
}

pub fn list_tasks() -> Result<Vec<ExtensionTask>, String> {
    list_tasks_from_dir(&tasks_dir()?)
}

fn list_tasks_from_dir(tasks_root: &Path) -> Result<Vec<ExtensionTask>, String> {
    let file = read_tasks_file_raw_from(tasks_root)?;
    Ok(file.tasks)
}

fn active_tasks_for_extension_in_dir(
    tasks_root: &Path,
    extension_id: &str,
    workspace_root: &str,
) -> Result<Vec<ExtensionTask>, String> {
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    let normalized_workspace_root = workspace_root.trim();
    if normalized_extension_id.is_empty() {
        return Ok(Vec::new());
    }
    Ok(list_tasks_from_dir(tasks_root)?
        .into_iter()
        .filter(|task| {
            task.extension_id
                .trim()
                .eq_ignore_ascii_case(&normalized_extension_id)
                && (normalized_workspace_root.is_empty()
                    || task.workspace_root.trim() == normalized_workspace_root)
                && matches!(task.state.as_str(), "queued" | "running")
        })
        .collect())
}

pub fn recover_interrupted_tasks_on_startup() -> Result<Vec<ExtensionTask>, String> {
    recover_interrupted_tasks_in_dir(&tasks_dir()?)
}

fn recover_interrupted_tasks_in_dir(tasks_root: &Path) -> Result<Vec<ExtensionTask>, String> {
    let file = recover_interrupted_tasks(read_tasks_file_raw_from(tasks_root)?);
    write_tasks_file_to(tasks_root, &file)?;
    Ok(file.tasks)
}

pub fn get_task(task_id: &str) -> Result<ExtensionTask, String> {
    list_tasks()?
        .into_iter()
        .find(|task| task.id == task_id)
        .ok_or_else(|| format!("Extension task not found: {task_id}"))
}

pub fn create_command_task(
    extension_id: &str,
    workspace_root: &str,
    command_id: &str,
    target: ExtensionTaskTarget,
    settings: Value,
) -> Result<ExtensionTask, String> {
    create_task_in_dir(
        &tasks_dir()?,
        extension_id,
        workspace_root,
        command_id,
        command_id,
        target,
        settings,
    )
}

pub fn create_command_task_for_probe(
    extension_id: &str,
    command_id: &str,
    target_kind: &str,
    target_path: &str,
) -> Result<ExtensionTask, String> {
    create_command_task(
        extension_id,
        "",
        command_id,
        ExtensionTaskTarget {
            kind: target_kind.to_string(),
            reference_id: String::new(),
            path: target_path.to_string(),
        },
        serde_json::json!({}),
    )
}

pub fn cancel_active_tasks_for_extension_for_probe(
    extension_id: &str,
    workspace_root: &str,
    runtime_state: &ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<Vec<ExtensionTask>, String> {
    cancel_active_tasks_for_extension(
        extension_id,
        workspace_root,
        runtime_state,
        extension_host_state,
    )
}

fn create_task_in_dir(
    tasks_root: &Path,
    extension_id: &str,
    workspace_root: &str,
    capability: &str,
    command_id: &str,
    target: ExtensionTaskTarget,
    settings: Value,
) -> Result<ExtensionTask, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let log_path = task_dir_in(tasks_root, &id)?
        .join("task.log")
        .to_string_lossy()
        .to_string();
    let now = now_string();
    let task = ExtensionTask {
        id: id.clone(),
        extension_id: extension_id.to_string(),
        workspace_root: workspace_root.to_string(),
        capability: capability.to_string(),
        command_id: command_id.to_string(),
        state: "queued".to_string(),
        created_at: now,
        started_at: String::new(),
        finished_at: String::new(),
        target,
        settings,
        progress: ExtensionTaskProgress {
            label: "Queued".to_string(),
            current: 0,
            total: 0,
        },
        artifacts: Vec::new(),
        outputs: Vec::new(),
        error: String::new(),
        log_path,
    };

    let mut file = read_tasks_file_raw_from(tasks_root)?;
    file.tasks.insert(0, task.clone());
    write_tasks_file_to(tasks_root, &file)?;
    Ok(task)
}

fn update_task_in_dir<F>(
    tasks_root: &Path,
    task_id: &str,
    update: F,
) -> Result<ExtensionTask, String>
where
    F: FnOnce(&mut ExtensionTask),
{
    let mut file = read_tasks_file_raw_from(tasks_root)?;
    let Some(task) = file.tasks.iter_mut().find(|task| task.id == task_id) else {
        return Err(format!("Extension task not found: {task_id}"));
    };
    update(task);
    let updated = task.clone();
    write_tasks_file_to(tasks_root, &file)?;
    Ok(updated)
}

fn mark_task_running_in_dir(tasks_root: &Path, task_id: &str) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "running".to_string();
        task.started_at = now_string();
        task.finished_at.clear();
        task.error.clear();
        task.progress = ExtensionTaskProgress {
            label: "Running".to_string(),
            current: 0,
            total: 0,
        };
    })
}

pub fn mark_task_running(task_id: &str) -> Result<ExtensionTask, String> {
    mark_task_running_in_dir(&tasks_dir()?, task_id)
}

fn mark_task_queued_in_dir(
    tasks_root: &Path,
    task_id: &str,
    progress_label: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "queued".to_string();
        task.started_at.clear();
        task.finished_at.clear();
        task.error.clear();
        task.progress = ExtensionTaskProgress {
            label: if progress_label.trim().is_empty() {
                "Queued".to_string()
            } else {
                progress_label.trim().to_string()
            },
            current: 0,
            total: 0,
        };
        task.artifacts = artifacts;
        task.outputs = outputs;
    })
}

pub fn mark_task_queued(
    task_id: &str,
    progress_label: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
) -> Result<ExtensionTask, String> {
    mark_task_queued_in_dir(&tasks_dir()?, task_id, progress_label, artifacts, outputs)
}

fn mark_task_running_with_progress_in_dir(
    tasks_root: &Path,
    task_id: &str,
    progress_label: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "running".to_string();
        if task.started_at.trim().is_empty() {
            task.started_at = now_string();
        }
        task.finished_at.clear();
        task.error.clear();
        task.progress = ExtensionTaskProgress {
            label: if progress_label.trim().is_empty() {
                "Running".to_string()
            } else {
                progress_label.trim().to_string()
            },
            current: 0,
            total: 0,
        };
        task.artifacts = artifacts;
        task.outputs = outputs;
    })
}

pub fn mark_task_running_with_progress(
    task_id: &str,
    progress_label: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
) -> Result<ExtensionTask, String> {
    mark_task_running_with_progress_in_dir(
        &tasks_dir()?,
        task_id,
        progress_label,
        artifacts,
        outputs,
    )
}

fn mark_task_succeeded_in_dir(
    tasks_root: &Path,
    task_id: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "succeeded".to_string();
        task.finished_at = now_string();
        task.progress = ExtensionTaskProgress {
            label: if progress_label.trim().is_empty() {
                "Completed".to_string()
            } else {
                progress_label.trim().to_string()
            },
            current: 1,
            total: 1,
        };
        task.artifacts = artifacts;
        task.outputs = outputs;
        task.error.clear();
    })
}

pub fn mark_task_succeeded(
    task_id: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    mark_task_succeeded_in_dir(&tasks_dir()?, task_id, artifacts, outputs, progress_label)
}

fn mark_task_failed_in_dir(
    tasks_root: &Path,
    task_id: &str,
    error: &str,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "failed".to_string();
        task.finished_at = now_string();
        task.progress.label = "Failed".to_string();
        task.error = error.to_string();
    })
}

pub fn mark_task_failed(task_id: &str, error: &str) -> Result<ExtensionTask, String> {
    mark_task_failed_in_dir(&tasks_dir()?, task_id, error)
}

fn mark_task_failed_with_results_in_dir(
    tasks_root: &Path,
    task_id: &str,
    error: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "failed".to_string();
        if task.started_at.trim().is_empty() {
            task.started_at = now_string();
        }
        task.finished_at = now_string();
        task.progress.label = if progress_label.trim().is_empty() {
            "Failed".to_string()
        } else {
            progress_label.trim().to_string()
        };
        task.artifacts = artifacts;
        task.outputs = outputs;
        task.error = error.to_string();
    })
}

pub fn mark_task_failed_with_results(
    task_id: &str,
    error: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    mark_task_failed_with_results_in_dir(
        &tasks_dir()?,
        task_id,
        error,
        artifacts,
        outputs,
        progress_label,
    )
}

fn mark_task_cancelled_in_dir(tasks_root: &Path, task_id: &str) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "cancelled".to_string();
        task.finished_at = now_string();
        task.progress.label = "Cancelled".to_string();
        task.error.clear();
    })
}

pub fn mark_task_cancelled(task_id: &str) -> Result<ExtensionTask, String> {
    mark_task_cancelled_in_dir(&tasks_dir()?, task_id)
}

fn mark_task_cancelled_with_results_in_dir(
    tasks_root: &Path,
    task_id: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    update_task_in_dir(tasks_root, task_id, |task| {
        if is_terminal_task_state(&task.state) {
            return;
        }
        task.state = "cancelled".to_string();
        if task.started_at.trim().is_empty() {
            task.started_at = now_string();
        }
        task.finished_at = now_string();
        task.progress.label = if progress_label.trim().is_empty() {
            "Cancelled".to_string()
        } else {
            progress_label.trim().to_string()
        };
        task.artifacts = artifacts;
        task.outputs = outputs;
        task.error.clear();
    })
}

pub fn mark_task_cancelled_with_results(
    task_id: &str,
    artifacts: Vec<ExtensionArtifact>,
    outputs: Vec<ExtensionCapabilityOutput>,
    progress_label: &str,
) -> Result<ExtensionTask, String> {
    mark_task_cancelled_with_results_in_dir(
        &tasks_dir()?,
        task_id,
        artifacts,
        outputs,
        progress_label,
    )
}

fn normalize_task_artifact(
    task: &ExtensionTask,
    patch: &ExtensionTaskArtifactPatch,
    index: usize,
) -> Option<ExtensionArtifact> {
    let path = patch.path.trim();
    if path.is_empty() {
        return None;
    }
    Some(ExtensionArtifact {
        id: if patch.id.trim().is_empty() {
            format!("artifact:{}", index + 1)
        } else {
            patch.id.trim().to_string()
        },
        extension_id: task.extension_id.clone(),
        task_id: task.id.clone(),
        capability: task.capability.clone(),
        kind: patch.kind.trim().to_string(),
        media_type: patch.media_type.trim().to_string(),
        path: path.to_string(),
        source_path: if patch.source_path.trim().is_empty() {
            task.target.path.clone()
        } else {
            patch.source_path.trim().to_string()
        },
        source_hash: patch.source_hash.trim().to_string(),
        created_at: if patch.created_at.trim().is_empty() {
            now_string()
        } else {
            patch.created_at.trim().to_string()
        },
    })
}

fn normalize_task_output(
    patch: &ExtensionTaskOutputPatch,
    index: usize,
) -> Option<ExtensionCapabilityOutput> {
    let text = patch.text.trim();
    let html = patch.html.trim();
    let output_type = patch.output_type.trim();
    let media_type = patch.media_type.trim();
    if text.is_empty() && html.is_empty() && output_type.is_empty() && media_type.is_empty() {
        return None;
    }
    Some(ExtensionCapabilityOutput {
        id: if patch.id.trim().is_empty() {
            format!("output:{}", index + 1)
        } else {
            patch.id.trim().to_string()
        },
        output_type: output_type.to_string(),
        media_type: media_type.to_string(),
        title: patch.title.trim().to_string(),
        description: patch.description.trim().to_string(),
        text: text.to_string(),
        html: html.to_string(),
    })
}

fn apply_task_update_in_dir(
    tasks_root: &Path,
    extension_id: &str,
    task_id: &str,
    patch: ExtensionTaskUpdatePatch,
) -> Result<ExtensionTask, String> {
    let task = list_tasks_from_dir(tasks_root)?
        .into_iter()
        .find(|task| task.id == task_id)
        .ok_or_else(|| format!("Extension task not found: {task_id}"))?;
    if task.extension_id.trim() != extension_id.trim() {
        return Err(format!(
            "Extension {} is not allowed to update task {}",
            extension_id, task_id
        ));
    }
    let terminal_task = is_terminal_task_state(&task.state);
    let next_state = normalize_task_state(&patch.state);
    let next_artifacts = patch.artifacts.as_ref().map(|artifacts| {
        artifacts
            .iter()
            .enumerate()
            .filter_map(|(index, artifact)| normalize_task_artifact(&task, artifact, index))
            .collect::<Vec<_>>()
    });
    let next_outputs = patch.outputs.as_ref().map(|outputs| {
        outputs
            .iter()
            .enumerate()
            .filter_map(|(index, output)| normalize_task_output(output, index))
            .collect::<Vec<_>>()
    });
    update_task_in_dir(tasks_root, task_id, |task| {
        if terminal_task {
            return;
        }

        if let Some(state) = next_state {
            match state {
                "queued" => {
                    task.state = "queued".to_string();
                    task.started_at.clear();
                    task.finished_at.clear();
                    if task.progress.label.trim().is_empty() {
                        task.progress.label = "Queued".to_string();
                    }
                    task.error.clear();
                }
                "running" => {
                    task.state = "running".to_string();
                    if task.started_at.trim().is_empty() {
                        task.started_at = now_string();
                    }
                    task.finished_at.clear();
                    if task.progress.label.trim().is_empty() {
                        task.progress.label = "Running".to_string();
                    }
                    task.error.clear();
                }
                "succeeded" => {
                    task.state = "succeeded".to_string();
                    if task.started_at.trim().is_empty() {
                        task.started_at = now_string();
                    }
                    task.finished_at = now_string();
                    if task.progress.label.trim().is_empty() {
                        task.progress.label = "Completed".to_string();
                    }
                    if patch.progress_current.is_none() && patch.progress_total.is_none() {
                        task.progress.current = 1;
                        task.progress.total = 1;
                    }
                    task.error.clear();
                }
                "failed" => {
                    task.state = "failed".to_string();
                    if task.started_at.trim().is_empty() {
                        task.started_at = now_string();
                    }
                    task.finished_at = now_string();
                    if task.progress.label.trim().is_empty() {
                        task.progress.label = "Failed".to_string();
                    }
                }
                "cancelled" => {
                    task.state = "cancelled".to_string();
                    if task.started_at.trim().is_empty() {
                        task.started_at = now_string();
                    }
                    task.finished_at = now_string();
                    if task.progress.label.trim().is_empty() {
                        task.progress.label = "Cancelled".to_string();
                    }
                    task.error.clear();
                }
                _ => {}
            }
        }

        if !patch.progress_label.trim().is_empty() {
            task.progress.label = patch.progress_label.trim().to_string();
        }
        if let Some(current) = patch.progress_current {
            task.progress.current = current;
        }
        if let Some(total) = patch.progress_total {
            task.progress.total = total;
        }
        if !patch.error.trim().is_empty() {
            task.error = patch.error.trim().to_string();
        }
        if let Some(artifacts) = &next_artifacts {
            task.artifacts = artifacts.clone();
        }
        if let Some(outputs) = &next_outputs {
            task.outputs = outputs.clone();
        }
    })
}

#[cfg_attr(test, allow(dead_code))]
pub fn apply_task_update(
    extension_id: &str,
    task_id: &str,
    patch: ExtensionTaskUpdatePatch,
) -> Result<ExtensionTask, String> {
    apply_task_update_in_dir(&tasks_dir()?, extension_id, task_id, patch)
}

impl ExtensionTaskRuntimeState {
    #[cfg(not(test))]
    pub fn bind_app_handle(&self, app: tauri::AppHandle) {
        if let Ok(mut handle) = self.app_handle.lock() {
            *handle = Some(app);
        }
    }

    #[cfg(test)]
    pub fn bind_app_handle(&self, _app: tauri::AppHandle) {}

    #[cfg(not(test))]
    pub fn emit_task_changed(&self, task: &ExtensionTask) {
        emit_task_changed(task, &self.app_handle);
    }

    #[cfg(test)]
    pub fn emit_task_changed(&self, _task: &ExtensionTask) {}

    #[cfg_attr(test, allow(dead_code))]
    pub fn register_pid(&self, task_id: &str, pid: u32) -> Result<(), String> {
        let normalized_task_id = task_id.trim();
        if normalized_task_id.is_empty() || pid == 0 {
            return Ok(());
        }
        let mut guard = self
            .running_pids
            .lock()
            .map_err(|_| "Extension task runtime state is unavailable".to_string())?;
        guard.insert(normalized_task_id.to_string(), pid);
        Ok(())
    }

    pub fn unregister_pid(&self, task_id: &str) -> Result<Option<u32>, String> {
        let mut guard = self
            .running_pids
            .lock()
            .map_err(|_| "Extension task runtime state is unavailable".to_string())?;
        Ok(guard.remove(task_id))
    }
}

fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        let result = unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        if result == 0 {
            return Ok(());
        }
        return Err(std::io::Error::last_os_error().to_string());
    }

    #[cfg(windows)]
    {
        let status = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("taskkill failed: {status}"));
    }
}

pub fn cancel_task_for_runtime(
    task_id: &str,
    runtime_state: &ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<ExtensionTask, String> {
    if let Some(pid) = runtime_state.unregister_pid(task_id)? {
        let _ = kill_pid(pid);
        let _ = crate::extension_host::reap_spawned_process(extension_host_state, pid, true);
    }
    let task = mark_task_cancelled(task_id)?;
    runtime_state.emit_task_changed(&task);
    Ok(task)
}

fn cancel_active_tasks_for_extension_in_dir(
    tasks_root: &Path,
    extension_id: &str,
    workspace_root: &str,
    runtime_state: &ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<Vec<ExtensionTask>, String> {
    let active_tasks = active_tasks_for_extension_in_dir(tasks_root, extension_id, workspace_root)?;
    let mut cancelled = Vec::with_capacity(active_tasks.len());
    for task in active_tasks {
        if let Some(pid) = runtime_state.unregister_pid(&task.id)? {
            let _ = kill_pid(pid);
            let _ = crate::extension_host::reap_spawned_process(extension_host_state, pid, true);
        }
        let updated = mark_task_cancelled_in_dir(tasks_root, &task.id)?;
        runtime_state.emit_task_changed(&updated);
        cancelled.push(updated);
    }
    Ok(cancelled)
}

pub fn cancel_active_tasks_for_extension(
    extension_id: &str,
    workspace_root: &str,
    runtime_state: &ExtensionTaskRuntimeState,
    extension_host_state: &crate::extension_host::ExtensionHostState,
) -> Result<Vec<ExtensionTask>, String> {
    let tasks_root = tasks_dir()?;
    cancel_active_tasks_for_extension_in_dir(
        &tasks_root,
        extension_id,
        workspace_root,
        runtime_state,
        extension_host_state,
    )
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskGetParams {
    #[serde(default)]
    pub task_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskExtensionParams {
    #[serde(default)]
    pub extension_id: String,
    #[serde(default)]
    pub workspace_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionTaskListParams {
    #[serde(default)]
    pub workspace_root: String,
}

fn task_param_string(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .get(camel_key)
        .or_else(|| params.get(snake_key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn task_get_params_from_payload(params: Value) -> ExtensionTaskGetParams {
    ExtensionTaskGetParams {
        task_id: task_param_string(&params, "taskId", "task_id"),
    }
}

fn task_extension_params_from_payload(params: Value) -> ExtensionTaskExtensionParams {
    ExtensionTaskExtensionParams {
        extension_id: task_param_string(&params, "extensionId", "extension_id"),
        workspace_root: task_param_string(&params, "workspaceRoot", "workspace_root"),
    }
}

fn task_list_params_from_payload(params: Value) -> ExtensionTaskListParams {
    ExtensionTaskListParams {
        workspace_root: task_param_string(&params, "workspaceRoot", "workspace_root"),
    }
}

fn list_tasks_for_workspace(
    tasks_root: &Path,
    workspace_root: &str,
) -> Result<Vec<ExtensionTask>, String> {
    let normalized_workspace_root = workspace_root.trim();
    if normalized_workspace_root.is_empty() {
        return list_tasks_from_dir(tasks_root);
    }
    Ok(list_tasks_from_dir(tasks_root)?
        .into_iter()
        .filter(|task| task.workspace_root.trim() == normalized_workspace_root)
        .collect())
}

#[tauri::command]
pub async fn extension_task_list(params: Value) -> Result<Vec<ExtensionTask>, String> {
    let params = task_list_params_from_payload(params);
    list_tasks_for_workspace(&tasks_dir()?, &params.workspace_root)
}

#[tauri::command]
pub async fn extension_task_get(params: Value) -> Result<ExtensionTask, String> {
    let params = task_get_params_from_payload(params);
    get_task(&params.task_id)
}

#[tauri::command]
pub async fn extension_task_cancel(
    params: Value,
    runtime_state: tauri::State<'_, ExtensionTaskRuntimeState>,
    extension_host_state: tauri::State<'_, crate::extension_host::ExtensionHostState>,
) -> Result<ExtensionTask, String> {
    let params = task_get_params_from_payload(params);
    cancel_task_for_runtime(
        &params.task_id,
        runtime_state.inner(),
        extension_host_state.inner(),
    )
}

#[tauri::command]
pub async fn extension_task_cancel_extension(
    params: Value,
    runtime_state: tauri::State<'_, ExtensionTaskRuntimeState>,
    extension_host_state: tauri::State<'_, crate::extension_host::ExtensionHostState>,
) -> Result<Vec<ExtensionTask>, String> {
    let params = task_extension_params_from_payload(params);
    cancel_active_tasks_for_extension(
        &params.extension_id,
        &params.workspace_root,
        runtime_state.inner(),
        extension_host_state.inner(),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        active_tasks_for_extension_in_dir, apply_task_update_in_dir,
        cancel_active_tasks_for_extension_in_dir, create_task_in_dir, list_tasks_from_dir,
        recover_interrupted_tasks_in_dir, task_extension_params_from_payload,
        task_get_params_from_payload, task_list_params_from_payload, update_task_in_dir,
        ExtensionTaskArtifactPatch, ExtensionTaskOutputPatch, ExtensionTaskRuntimeState,
        ExtensionTaskTarget, ExtensionTaskUpdatePatch,
    };
    use serde_json::json;
    use std::fs;

    fn temp_tasks_root(prefix: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).expect("temp tasks root");
        root
    }

    #[test]
    fn extension_task_params_normalize_raw_payloads() {
        let get_params = task_get_params_from_payload(json!({
            "taskId": " task-1 "
        }));
        assert_eq!(get_params.task_id, "task-1");

        let snake_get_params = task_get_params_from_payload(json!({
            "task_id": " task-2 "
        }));
        assert_eq!(snake_get_params.task_id, "task-2");

        let missing_get_params = task_get_params_from_payload(json!({
            "taskId": 42
        }));
        assert_eq!(missing_get_params.task_id, "");

        let list_params = task_list_params_from_payload(json!({
            "workspaceRoot": " /tmp/workspace-a "
        }));
        assert_eq!(list_params.workspace_root, "/tmp/workspace-a");

        let extension_params = task_extension_params_from_payload(json!({
            "extensionId": " example-pdf-extension ",
            "workspaceRoot": " /tmp/workspace-b "
        }));
        assert_eq!(extension_params.extension_id, "example-pdf-extension");
        assert_eq!(extension_params.workspace_root, "/tmp/workspace-b");

        let snake_extension_params = task_extension_params_from_payload(json!({
            "extension_id": " example-markdown-extension ",
            "workspace_root": " /tmp/workspace-c "
        }));
        assert_eq!(
            snake_extension_params.extension_id,
            "example-markdown-extension"
        );
        assert_eq!(snake_extension_params.workspace_root, "/tmp/workspace-c");
    }

    #[test]
    fn task_state_transitions_are_persisted() {
        let root = temp_tasks_root("scribeflow-extension-tasks-state");
        let task = create_task_in_dir(
            &root,
            "pdfmathtranslate",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-1".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({"targetLanguage": "zh"}),
        )
        .expect("create task");
        let running = update_task_in_dir(&root, &task.id, |task| {
            task.state = "running".to_string();
        })
        .expect("running");
        assert_eq!(running.state, "running");
        let failed = update_task_in_dir(&root, &task.id, |task| {
            task.state = "failed".to_string();
            task.error = "boom".to_string();
        })
        .expect("failed");
        assert_eq!(failed.error, "boom");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn list_tasks_recovers_interrupted_running_tasks() {
        let root = temp_tasks_root("scribeflow-extension-tasks-recover");
        let task = create_task_in_dir(
            &root,
            "pdfmathtranslate",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-2".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");
        update_task_in_dir(&root, &task.id, |task| {
            task.state = "running".to_string();
        })
        .expect("running");
        let listed = list_tasks_from_dir(&root).expect("tasks");
        let still_running = listed
            .iter()
            .find(|item| item.id == task.id)
            .expect("listed task");
        assert_eq!(still_running.state, "running");

        let tasks = recover_interrupted_tasks_in_dir(&root).expect("tasks");
        let recovered = tasks.iter().find(|item| item.id == task.id).expect("task");
        assert_eq!(recovered.state, "failed");
        assert_eq!(recovered.error, "Interrupted by application shutdown");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn queued_task_hint_resets_runtime_timestamps() {
        let root = temp_tasks_root("scribeflow-extension-tasks-queued");
        let task = create_task_in_dir(
            &root,
            "pdfmathtranslate",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-3".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        update_task_in_dir(&root, &task.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-01T00:00:00Z".to_string();
        })
        .expect("running");

        let queued = super::update_task_in_dir(&root, &task.id, |task| {
            task.state = "queued".to_string();
            task.started_at.clear();
            task.finished_at.clear();
            task.progress.label = "Translation queued".to_string();
        })
        .expect("queued");

        assert_eq!(queued.state, "queued");
        assert!(queued.started_at.is_empty());
        assert!(queued.finished_at.is_empty());
        assert_eq!(queued.progress.label, "Translation queued");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn runtime_state_registers_and_unregisters_spawned_pid() {
        let runtime = ExtensionTaskRuntimeState::default();
        runtime.register_pid("task-1", 4242).expect("register pid");

        let first = runtime.unregister_pid("task-1").expect("unregister pid");
        assert_eq!(first, Some(4242));

        let second = runtime
            .unregister_pid("task-1")
            .expect("unregister missing pid");
        assert_eq!(second, None);
    }

    #[test]
    fn active_tasks_for_extension_filters_running_and_queued_only() {
        let root = temp_tasks_root("scribeflow-extension-tasks-active-extension");
        let running = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-9".to_string(),
                path: "/tmp/paper-a.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create running task");
        let queued = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.summarize",
            "scribeflow.pdf.summarize",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-10".to_string(),
                path: "/tmp/paper-b.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create queued task");
        let completed = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.export",
            "scribeflow.pdf.export",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-11".to_string(),
                path: "/tmp/paper-c.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create completed task");
        let other_extension = create_task_in_dir(
            &root,
            "other-extension",
            "/tmp/workspace-b",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-12".to_string(),
                path: "/tmp/paper-d.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create other extension task");

        update_task_in_dir(&root, &running.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-02T10:00:00Z".to_string();
        })
        .expect("mark running");
        update_task_in_dir(&root, &completed.id, |task| {
            task.state = "succeeded".to_string();
            task.finished_at = "2026-05-02T11:00:00Z".to_string();
        })
        .expect("mark succeeded");
        update_task_in_dir(&root, &other_extension.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-02T12:00:00Z".to_string();
        })
        .expect("mark other running");

        let active =
            active_tasks_for_extension_in_dir(&root, "example-pdf-extension", "/tmp/workspace-a")
                .expect("active tasks for extension");
        let ids = active.into_iter().map(|task| task.id).collect::<Vec<_>>();
        assert_eq!(ids, vec![queued.id, running.id]);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cancel_active_tasks_for_extension_marks_only_matching_active_tasks() {
        let root = temp_tasks_root("scribeflow-extension-tasks-cancel-extension");
        let runtime = ExtensionTaskRuntimeState::default();
        let host_state = crate::extension_host::ExtensionHostState::default();
        let tasks_root = root.join(".scribeflow").join("extension-tasks");
        fs::create_dir_all(&tasks_root).expect("create tasks root");

        let running = create_task_in_dir(
            &tasks_root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "scribeflow.pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "pdf".to_string(),
                reference_id: "ref-13".to_string(),
                path: "/tmp/paper-a.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create running task");
        let queued = create_task_in_dir(
            &tasks_root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "scribeflow.pdf.summarize",
            "scribeflow.pdf.summarize",
            ExtensionTaskTarget {
                kind: "pdf".to_string(),
                reference_id: "ref-14".to_string(),
                path: "/tmp/paper-b.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create queued task");
        let completed = create_task_in_dir(
            &tasks_root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "scribeflow.pdf.export",
            "scribeflow.pdf.export",
            ExtensionTaskTarget {
                kind: "pdf".to_string(),
                reference_id: "ref-15".to_string(),
                path: "/tmp/paper-c.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create completed task");
        let other_extension = create_task_in_dir(
            &tasks_root,
            "other-extension",
            "/tmp/workspace-b",
            "scribeflow.pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "pdf".to_string(),
                reference_id: "ref-16".to_string(),
                path: "/tmp/paper-d.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create other extension task");
        let other_workspace_same_extension = create_task_in_dir(
            &tasks_root,
            "example-pdf-extension",
            "/tmp/workspace-b",
            "scribeflow.pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "pdf".to_string(),
                reference_id: "ref-17".to_string(),
                path: "/tmp/paper-e.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create other workspace same extension task");

        update_task_in_dir(&tasks_root, &running.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-02T10:00:00Z".to_string();
        })
        .expect("mark running");
        update_task_in_dir(&tasks_root, &completed.id, |task| {
            task.state = "succeeded".to_string();
            task.finished_at = "2026-05-02T11:00:00Z".to_string();
        })
        .expect("mark completed");
        update_task_in_dir(&tasks_root, &other_extension.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-02T12:00:00Z".to_string();
        })
        .expect("mark other extension running");
        update_task_in_dir(&tasks_root, &other_workspace_same_extension.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-02T12:30:00Z".to_string();
        })
        .expect("mark other workspace same extension running");

        runtime
            .register_pid(&running.id, 4242)
            .expect("register running pid");
        runtime
            .register_pid(&queued.id, 4243)
            .expect("register queued pid");
        runtime
            .register_pid(&other_extension.id, 4244)
            .expect("register other pid");
        runtime
            .register_pid(&other_workspace_same_extension.id, 4245)
            .expect("register other workspace same extension pid");

        let cancelled = cancel_active_tasks_for_extension_in_dir(
            &tasks_root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            &runtime,
            &host_state,
        )
        .expect("cancel active tasks for extension");

        assert_eq!(cancelled.len(), 2);
        assert!(cancelled.iter().all(|task| task.state == "cancelled"));
        assert!(runtime
            .unregister_pid(&running.id)
            .expect("running pid removed")
            .is_none());
        assert!(runtime
            .unregister_pid(&queued.id)
            .expect("queued pid removed")
            .is_none());
        assert_eq!(
            runtime
                .unregister_pid(&other_extension.id)
                .expect("other pid kept"),
            Some(4244)
        );
        assert_eq!(
            runtime
                .unregister_pid(&other_workspace_same_extension.id)
                .expect("other workspace pid kept"),
            Some(4245)
        );

        let listed = list_tasks_from_dir(&tasks_root).expect("list tasks");
        let running_task = listed
            .iter()
            .find(|task| task.id == running.id)
            .expect("running task");
        let queued_task = listed
            .iter()
            .find(|task| task.id == queued.id)
            .expect("queued task");
        let completed_task = listed
            .iter()
            .find(|task| task.id == completed.id)
            .expect("completed task");
        let other_task = listed
            .iter()
            .find(|task| task.id == other_extension.id)
            .expect("other task");
        let other_workspace_same_extension_task = listed
            .iter()
            .find(|task| task.id == other_workspace_same_extension.id)
            .expect("other workspace same extension task");
        assert_eq!(running_task.state, "cancelled");
        assert_eq!(queued_task.state, "cancelled");
        assert_eq!(completed_task.state, "succeeded");
        assert_eq!(other_task.state, "running");
        assert_eq!(other_workspace_same_extension_task.state, "running");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_task_update_merges_running_progress_and_artifacts() {
        let root = temp_tasks_root("scribeflow-extension-tasks-update");
        let task = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-4".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let updated = super::update_task_in_dir(&root, &task.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-01T00:00:00Z".to_string();
        })
        .expect("running");
        assert_eq!(updated.state, "running");

        let result = apply_task_update_in_dir(
            &root,
            "example-pdf-extension",
            &task.id,
            ExtensionTaskUpdatePatch {
                task_id: task.id.clone(),
                state: "running".to_string(),
                progress_label: "Spawned process 4242".to_string(),
                progress_current: Some(1),
                progress_total: Some(3),
                error: String::new(),
                artifacts: Some(vec![ExtensionTaskArtifactPatch {
                    id: "artifact-1".to_string(),
                    kind: "log".to_string(),
                    media_type: "text/plain".to_string(),
                    path: "/tmp/output.log".to_string(),
                    source_path: "/tmp/paper.pdf".to_string(),
                    source_hash: String::new(),
                    created_at: String::new(),
                }]),
                outputs: None,
            },
        )
        .expect("apply task update");

        assert_eq!(result.state, "running");
        assert_eq!(result.progress.label, "Spawned process 4242");
        assert_eq!(result.progress.current, 1);
        assert_eq!(result.progress.total, 3);
        assert_eq!(result.artifacts.len(), 1);
        assert_eq!(result.artifacts[0].path, "/tmp/output.log");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn task_state_transitions_persist_structured_outputs() {
        let root = temp_tasks_root("scribeflow-extension-tasks-outputs");
        let task = create_task_in_dir(
            &root,
            "example-markdown-extension",
            "/tmp/workspace-a",
            "document.summarize",
            "scribeflow.markdown.summarize",
            ExtensionTaskTarget {
                kind: "workspace".to_string(),
                reference_id: String::new(),
                path: "/tmp/draft.md".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let completed = super::mark_task_succeeded_in_dir(
            &root,
            &task.id,
            Vec::new(),
            vec![crate::extension_outputs::ExtensionCapabilityOutput {
                id: "summary".to_string(),
                output_type: "inlineText".to_string(),
                media_type: "text/plain".to_string(),
                title: "Note Summary".to_string(),
                description: "/tmp/draft.md".to_string(),
                text: "summary body".to_string(),
                html: String::new(),
            }],
            "Completed",
        )
        .expect("mark succeeded");

        assert_eq!(completed.outputs.len(), 1);
        assert_eq!(completed.outputs[0].output_type, "inlineText");
        assert_eq!(completed.outputs[0].text, "summary body");

        let listed = list_tasks_from_dir(&root).expect("list tasks");
        let persisted = listed
            .iter()
            .find(|entry| entry.id == task.id)
            .expect("persisted task");
        assert_eq!(persisted.outputs.len(), 1);
        assert_eq!(persisted.outputs[0].media_type, "text/plain");
        assert_eq!(persisted.outputs[0].title, "Note Summary");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn failed_task_state_can_preserve_structured_results() {
        let root = temp_tasks_root("scribeflow-extension-tasks-failed-results");
        let task = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-7".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let failed = super::mark_task_failed_with_results_in_dir(
            &root,
            &task.id,
            "Worker exited with code 7",
            vec![crate::extension_artifacts::ExtensionArtifact {
                id: "failure-log".to_string(),
                extension_id: "example-pdf-extension".to_string(),
                task_id: task.id.clone(),
                capability: "pdf.translate".to_string(),
                kind: "log".to_string(),
                media_type: "text/plain".to_string(),
                path: "/tmp/failure.log".to_string(),
                source_path: "/tmp/paper.pdf".to_string(),
                source_hash: String::new(),
                created_at: "2026-05-02T00:00:00Z".to_string(),
            }],
            vec![crate::extension_outputs::ExtensionCapabilityOutput {
                id: "failure-summary".to_string(),
                output_type: "inlineText".to_string(),
                media_type: "text/plain".to_string(),
                title: "Failure Summary".to_string(),
                description: "/tmp/paper.pdf".to_string(),
                text: "worker stderr: boom".to_string(),
                html: String::new(),
            }],
            "Worker failed",
        )
        .expect("mark failed with results");

        assert_eq!(failed.state, "failed");
        assert_eq!(failed.progress.label, "Worker failed");
        assert_eq!(failed.error, "Worker exited with code 7");
        assert_eq!(failed.artifacts.len(), 1);
        assert_eq!(failed.artifacts[0].path, "/tmp/failure.log");
        assert_eq!(failed.outputs.len(), 1);
        assert_eq!(failed.outputs[0].id, "failure-summary");
        assert_eq!(failed.outputs[0].text, "worker stderr: boom");

        let listed = list_tasks_from_dir(&root).expect("list tasks");
        let persisted = listed
            .iter()
            .find(|entry| entry.id == task.id)
            .expect("persisted failed task");
        assert_eq!(persisted.state, "failed");
        assert_eq!(persisted.progress.label, "Worker failed");
        assert_eq!(persisted.artifacts.len(), 1);
        assert_eq!(persisted.outputs.len(), 1);
        assert_eq!(persisted.outputs[0].title, "Failure Summary");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cancelled_task_state_can_preserve_structured_results() {
        let root = temp_tasks_root("scribeflow-extension-tasks-cancelled-results");
        let task = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-8".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let cancelled = super::mark_task_cancelled_with_results_in_dir(
            &root,
            &task.id,
            vec![crate::extension_artifacts::ExtensionArtifact {
                id: "cancel-log".to_string(),
                extension_id: "example-pdf-extension".to_string(),
                task_id: task.id.clone(),
                capability: "pdf.translate".to_string(),
                kind: "log".to_string(),
                media_type: "text/plain".to_string(),
                path: "/tmp/cancel.log".to_string(),
                source_path: "/tmp/paper.pdf".to_string(),
                source_hash: String::new(),
                created_at: "2026-05-02T00:00:00Z".to_string(),
            }],
            vec![crate::extension_outputs::ExtensionCapabilityOutput {
                id: "cancel-summary".to_string(),
                output_type: "inlineText".to_string(),
                media_type: "text/plain".to_string(),
                title: "Cancelled Summary".to_string(),
                description: "/tmp/paper.pdf".to_string(),
                text: "cancelled by user".to_string(),
                html: String::new(),
            }],
            "Cancelled by user",
        )
        .expect("mark cancelled with results");

        assert_eq!(cancelled.state, "cancelled");
        assert_eq!(cancelled.progress.label, "Cancelled by user");
        assert_eq!(cancelled.error, "");
        assert_eq!(cancelled.artifacts.len(), 1);
        assert_eq!(cancelled.artifacts[0].path, "/tmp/cancel.log");
        assert_eq!(cancelled.outputs.len(), 1);
        assert_eq!(cancelled.outputs[0].id, "cancel-summary");
        assert_eq!(cancelled.outputs[0].text, "cancelled by user");

        let listed = list_tasks_from_dir(&root).expect("list tasks");
        let persisted = listed
            .iter()
            .find(|entry| entry.id == task.id)
            .expect("persisted cancelled task");
        assert_eq!(persisted.state, "cancelled");
        assert_eq!(persisted.progress.label, "Cancelled by user");
        assert_eq!(persisted.artifacts.len(), 1);
        assert_eq!(persisted.outputs.len(), 1);
        assert_eq!(persisted.outputs[0].title, "Cancelled Summary");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_task_update_does_not_reopen_terminal_task() {
        let root = temp_tasks_root("scribeflow-extension-tasks-terminal-guard");
        let task = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-5".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let cancelled = super::update_task_in_dir(&root, &task.id, |task| {
            task.state = "cancelled".to_string();
            task.finished_at = "2026-05-01T01:00:00Z".to_string();
            task.progress.label = "Cancelled".to_string();
        })
        .expect("cancelled");
        assert_eq!(cancelled.state, "cancelled");

        let updated = apply_task_update_in_dir(
            &root,
            "example-pdf-extension",
            &task.id,
            ExtensionTaskUpdatePatch {
                task_id: task.id.clone(),
                state: "running".to_string(),
                progress_label: "Late update".to_string(),
                progress_current: Some(2),
                progress_total: Some(3),
                error: String::new(),
                artifacts: None,
                outputs: None,
            },
        )
        .expect("late update ignored");

        assert_eq!(updated.state, "cancelled");
        assert_eq!(updated.progress.label, "Cancelled");
        assert_eq!(updated.progress.current, 0);
        assert_eq!(updated.progress.total, 0);
        assert_eq!(updated.finished_at, "2026-05-01T01:00:00Z");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn apply_task_update_can_replace_artifacts_and_outputs() {
        let root = temp_tasks_root("scribeflow-extension-tasks-replace-contract");
        let task = create_task_in_dir(
            &root,
            "example-markdown-extension",
            "/tmp/workspace-a",
            "document.summarize",
            "scribeflow.markdown.summarize",
            ExtensionTaskTarget {
                kind: "workspace".to_string(),
                reference_id: String::new(),
                path: "/tmp/draft.md".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let running = super::update_task_in_dir(&root, &task.id, |task| {
            task.state = "running".to_string();
            task.started_at = "2026-05-01T00:00:00Z".to_string();
            task.artifacts = vec![crate::extension_artifacts::ExtensionArtifact {
                id: "artifact-1".to_string(),
                extension_id: task.extension_id.clone(),
                task_id: task.id.clone(),
                capability: task.capability.clone(),
                kind: "preview".to_string(),
                media_type: "text/plain".to_string(),
                path: "/tmp/original.txt".to_string(),
                source_path: task.target.path.clone(),
                source_hash: String::new(),
                created_at: "2026-05-01T00:00:01Z".to_string(),
            }];
            task.outputs = vec![crate::extension_outputs::ExtensionCapabilityOutput {
                id: "summary-1".to_string(),
                output_type: "inlineText".to_string(),
                media_type: "text/plain".to_string(),
                title: "Original Summary".to_string(),
                description: String::new(),
                text: "before".to_string(),
                html: String::new(),
            }];
        })
        .expect("running");
        assert_eq!(running.artifacts.len(), 1);
        assert_eq!(running.outputs.len(), 1);

        let replaced = apply_task_update_in_dir(
            &root,
            "example-markdown-extension",
            &task.id,
            ExtensionTaskUpdatePatch {
                task_id: task.id.clone(),
                state: "running".to_string(),
                progress_label: "Streaming update".to_string(),
                progress_current: Some(2),
                progress_total: Some(4),
                error: String::new(),
                artifacts: Some(Vec::new()),
                outputs: Some(vec![ExtensionTaskOutputPatch {
                    id: "summary-2".to_string(),
                    output_type: "inlineText".to_string(),
                    media_type: "text/plain".to_string(),
                    title: "Updated Summary".to_string(),
                    description: String::new(),
                    text: "after".to_string(),
                    html: String::new(),
                }]),
            },
        )
        .expect("replace patch");

        assert_eq!(replaced.artifacts.len(), 0);
        assert_eq!(replaced.outputs.len(), 1);
        assert_eq!(replaced.outputs[0].id, "summary-2");
        assert_eq!(replaced.outputs[0].text, "after");

        let persisted = list_tasks_from_dir(&root).expect("list tasks");
        let persisted = persisted
            .iter()
            .find(|entry| entry.id == task.id)
            .expect("persisted task");
        assert_eq!(persisted.artifacts.len(), 0);
        assert_eq!(persisted.outputs.len(), 1);
        assert_eq!(persisted.outputs[0].title, "Updated Summary");
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn terminal_task_ignores_late_state_transition_helpers() {
        let root = temp_tasks_root("scribeflow-extension-tasks-terminal-helpers");
        let task = create_task_in_dir(
            &root,
            "example-pdf-extension",
            "/tmp/workspace-a",
            "pdf.translate",
            "scribeflow.pdf.translate",
            ExtensionTaskTarget {
                kind: "referencePdf".to_string(),
                reference_id: "ref-6".to_string(),
                path: "/tmp/paper.pdf".to_string(),
            },
            serde_json::json!({}),
        )
        .expect("create task");

        let cancelled = super::update_task_in_dir(&root, &task.id, |task| {
            task.state = "cancelled".to_string();
            task.finished_at = "2026-05-01T02:00:00Z".to_string();
            task.progress.label = "Cancelled".to_string();
        })
        .expect("cancelled");
        assert_eq!(cancelled.state, "cancelled");

        let running = super::mark_task_running_with_progress_in_dir(
            &root,
            &task.id,
            "Late running",
            Vec::new(),
            Vec::new(),
        )
        .expect("late running ignored");
        assert_eq!(running.state, "cancelled");
        assert_eq!(running.progress.label, "Cancelled");

        let succeeded = super::mark_task_succeeded_in_dir(
            &root,
            &task.id,
            Vec::new(),
            Vec::new(),
            "Late success",
        )
        .expect("late success ignored");
        assert_eq!(succeeded.state, "cancelled");
        assert_eq!(succeeded.progress.label, "Cancelled");
        assert_eq!(succeeded.finished_at, "2026-05-01T02:00:00Z");
        fs::remove_dir_all(root).ok();
    }
}
