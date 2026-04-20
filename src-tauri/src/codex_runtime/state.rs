use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::protocol::RuntimeThread;
use super::storage::load_runtime_state;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CodexRuntimeState {
    pub threads: HashMap<String, RuntimeThread>,
    pub ordered_thread_ids: Vec<String>,
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
