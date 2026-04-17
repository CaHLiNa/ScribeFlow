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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex_runtime::protocol::{RuntimeItem, RuntimeThread, RuntimeTurn};
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_state_path(label: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        std::env::temp_dir()
            .join(format!("altals-codex-runtime-{label}-{stamp}"))
            .join("state.json")
    }

    #[test]
    fn runtime_state_round_trip_restores_threads_and_interrupts_running_entities() {
        let path = temp_state_path("roundtrip");
        let mut state = CodexRuntimeState {
            threads: HashMap::new(),
            turns: HashMap::new(),
            items: HashMap::new(),
            permission_requests: HashMap::new(),
            ask_user_requests: HashMap::new(),
            exit_plan_requests: HashMap::new(),
            plan_modes: HashMap::new(),
            ordered_thread_ids: vec!["thr-1".to_string()],
        };
        state.threads.insert(
            "thr-1".to_string(),
            RuntimeThread {
                id: "thr-1".to_string(),
                title: "Thread".to_string(),
                cwd: None,
                status: ThreadStatus::Running,
                created_at: 1,
                updated_at: 1,
                archived_at: None,
                active_turn_id: Some("turn-1".to_string()),
                turn_ids: vec!["turn-1".to_string()],
            },
        );
        state.turns.insert(
            "turn-1".to_string(),
            RuntimeTurn {
                id: "turn-1".to_string(),
                thread_id: "thr-1".to_string(),
                status: TurnStatus::Running,
                user_text: "Inspect".to_string(),
                created_at: 1,
                updated_at: 1,
                completed_at: None,
                interrupted_at: None,
                item_ids: vec!["item-1".to_string()],
            },
        );
        state.items.insert(
            "item-1".to_string(),
            RuntimeItem {
                id: "item-1".to_string(),
                thread_id: "thr-1".to_string(),
                turn_id: "turn-1".to_string(),
                kind: super::super::protocol::ItemKind::AgentMessage,
                status: TurnStatus::Running,
                text: "Working".to_string(),
                created_at: 1,
                updated_at: 1,
            },
        );

        write_runtime_state_to_path(&path, &state).expect("persist");
        let restored = load_runtime_state_from_path(&path).expect("load");

        assert_eq!(
            restored.threads.get("thr-1").map(|thread| &thread.status),
            Some(&ThreadStatus::Interrupted)
        );
        assert_eq!(
            restored.turns.get("turn-1").map(|turn| &turn.status),
            Some(&TurnStatus::Interrupted)
        );
        assert_eq!(
            restored.items.get("item-1").map(|item| &item.status),
            Some(&TurnStatus::Interrupted)
        );

        let _ = fs::remove_file(&path);
        if let Some(parent) = path.parent().and_then(|value| value.parent()) {
            let _ = fs::remove_dir_all(parent);
        }
    }
}
