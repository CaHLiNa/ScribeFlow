use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

use crate::app_dirs;
use crate::research_task_protocol::ResearchTask;

const RESEARCH_TASKS_DIR: &str = "research-tasks";

fn tasks_dir() -> Result<PathBuf, String> {
    let dir = app_dirs::data_root_dir()?.join(RESEARCH_TASKS_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create research tasks dir: {error}"))?;
    }
    Ok(dir)
}

fn tasks_path_for_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    let normalized = workspace_path.trim();
    if normalized.is_empty() {
        return Err("Workspace path is required for research tasks.".to_string());
    }
    let encoded = URL_SAFE_NO_PAD.encode(normalized.as_bytes());
    Ok(tasks_dir()?.join(format!("{encoded}.json")))
}

fn read_tasks_from_path(path: &Path) -> Result<Vec<ResearchTask>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read research tasks: {error}"))?;
    serde_json::from_str::<Vec<ResearchTask>>(&content)
        .map_err(|error| format!("Failed to parse research tasks: {error}"))
}

fn write_tasks_to_path(path: &Path, tasks: &[ResearchTask]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Research tasks path has no parent directory.".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create research tasks parent dir: {error}"))?;
    }
    let temp_path = path.with_extension("json.tmp");
    let serialized = serde_json::to_string_pretty(tasks)
        .map_err(|error| format!("Failed to serialize research tasks: {error}"))?;
    fs::write(&temp_path, serialized)
        .map_err(|error| format!("Failed to write research tasks: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("Failed to finalize research tasks: {error}"))?;
    Ok(())
}

pub(crate) fn load_workspace_tasks(workspace_path: &str) -> Result<Vec<ResearchTask>, String> {
    let path = tasks_path_for_workspace(workspace_path)?;
    read_tasks_from_path(&path)
}

pub(crate) fn persist_workspace_tasks(
    workspace_path: &str,
    tasks: &[ResearchTask],
) -> Result<(), String> {
    let path = tasks_path_for_workspace(workspace_path)?;
    write_tasks_to_path(&path, tasks)
}
