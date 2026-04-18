use std::fs;
use std::path::{Path, PathBuf};

use super::protocol::{ThreadStatus, TurnStatus};
use super::state::CodexRuntimeState;
use crate::app_dirs;

const CODEX_RUNTIME_DIR: &str = "codex-runtime";
const CODEX_RUNTIME_STATE_FILE: &str = "state.json";

fn runtime_state_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?
        .join(CODEX_RUNTIME_DIR)
        .join(CODEX_RUNTIME_STATE_FILE))
}

fn ensure_runtime_dir(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("Runtime state path has no parent directory.".to_string());
    };
    fs::create_dir_all(parent).map_err(|error| format!("Failed to create runtime dir: {error}"))
}

fn normalize_loaded_state(mut state: CodexRuntimeState) -> CodexRuntimeState {
    for thread in state.threads.values_mut() {
        if thread.status == ThreadStatus::Running {
            thread.status = ThreadStatus::Interrupted;
            thread.active_turn_id = None;
        }
    }

    for turn in state.turns.values_mut() {
        if turn.status == TurnStatus::Running {
            turn.status = TurnStatus::Interrupted;
        }
    }

    for item in state.items.values_mut() {
        if item.status == TurnStatus::Running {
            item.status = TurnStatus::Interrupted;
        }
    }

    state
}

fn write_runtime_state_to_path(path: &Path, state: &CodexRuntimeState) -> Result<(), String> {
    ensure_runtime_dir(path)?;
    let temp_path = path.with_extension("json.tmp");
    let serialized = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize runtime state: {error}"))?;
    fs::write(&temp_path, serialized)
        .map_err(|error| format!("Failed to write runtime state: {error}"))?;
    fs::rename(&temp_path, path)
        .map_err(|error| format!("Failed to finalize runtime state: {error}"))?;
    Ok(())
}

fn load_runtime_state_from_path(path: &Path) -> Result<CodexRuntimeState, String> {
    if !path.exists() {
        return Ok(CodexRuntimeState::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read runtime state: {error}"))?;
    let state = serde_json::from_str::<CodexRuntimeState>(&content)
        .map_err(|error| format!("Failed to parse runtime state: {error}"))?;
    Ok(normalize_loaded_state(state))
}

pub fn persist_runtime_state(state: &CodexRuntimeState) -> Result<(), String> {
    let path = runtime_state_path()?;
    write_runtime_state_to_path(&path, state)
}

pub fn load_runtime_state() -> Result<CodexRuntimeState, String> {
    let path = runtime_state_path()?;
    load_runtime_state_from_path(&path)
}
