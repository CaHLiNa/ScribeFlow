use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use super::protocol::{
    RuntimeAskUserRequest, RuntimeExitPlanRequest, RuntimeItem, RuntimePermissionRequest,
    RuntimePlanModeState, RuntimeThread, RuntimeTurn,
};
use super::storage::load_runtime_state;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CodexRuntimeState {
    pub threads: HashMap<String, RuntimeThread>,
    pub turns: HashMap<String, RuntimeTurn>,
    pub items: HashMap<String, RuntimeItem>,
    pub ordered_thread_ids: Vec<String>,
    pub permission_requests: HashMap<String, RuntimePermissionRequest>,
    pub ask_user_requests: HashMap<String, RuntimeAskUserRequest>,
    pub exit_plan_requests: HashMap<String, RuntimeExitPlanRequest>,
    pub plan_modes: HashMap<String, RuntimePlanModeState>,
}

#[derive(Clone)]
pub struct CodexRuntimeHandle {
    pub inner: Arc<Mutex<CodexRuntimeState>>,
}

impl Default for CodexRuntimeHandle {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(load_runtime_state().unwrap_or_default())),
        }
    }
}

impl CodexRuntimeHandle {
    pub fn from_state<'a>(state: State<'a, CodexRuntimeHandle>) -> &'a CodexRuntimeHandle {
        state.inner()
    }
}
