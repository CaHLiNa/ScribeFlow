use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub const WORKSPACE_TREE_REFRESH_REQUESTED_EVENT: &str = "workspace-tree-refresh-requested";
const ACTIVE_TREE_POLL_INTERVAL_MS: u64 = 15_000;
const IDLE_TREE_POLL_INTERVAL_MS: u64 = 60_000;
const TREE_ACTIVITY_WINDOW_MS: u64 = 15_000;
const WORKSPACE_TREE_REFRESH_DEBOUNCE_MS: u64 = 180;
const WORKSPACE_TREE_SCHEDULER_TICK_MS: u64 = 500;

#[derive(Default)]
pub struct WorkspaceTreeWatchState {
    session: Mutex<Option<WorkspaceTreeWatchSession>>,
}

struct WorkspaceTreeWatchSession {
    workspace_path: String,
    refresh_state: Arc<Mutex<WorkspaceTreeRefreshState>>,
    scheduler_state: Arc<Mutex<WorkspaceTreeSchedulerState>>,
    scheduler_running: Arc<AtomicBool>,
    _watcher: RecommendedWatcher,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTreeRefreshRequestedPayload {
    workspace_path: String,
    changed_paths: Vec<String>,
    reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeWatchActivityParams {
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTreeWatchVisibilityParams {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub visible: bool,
}

#[derive(Debug, Default)]
struct WorkspaceTreeRefreshState {
    generation: u64,
    changed_paths: Vec<String>,
}

impl WorkspaceTreeRefreshState {
    fn queue_paths(&mut self, changed_paths: Vec<String>) -> u64 {
        self.generation = self.generation.saturating_add(1);
        for path in changed_paths {
            if !self.changed_paths.contains(&path) {
                self.changed_paths.push(path);
            }
        }
        self.generation
    }

    fn take_if_generation_matches(&mut self, generation: u64) -> Vec<String> {
        if self.generation != generation {
            return Vec::new();
        }
        std::mem::take(&mut self.changed_paths)
    }

    fn reset(&mut self) {
        self.generation = self.generation.saturating_add(1);
        self.changed_paths.clear();
    }
}

#[derive(Debug)]
struct WorkspaceTreeSchedulerState {
    last_activity_at_ms: u64,
    last_poll_at_ms: u64,
    visible: bool,
}

impl Default for WorkspaceTreeSchedulerState {
    fn default() -> Self {
        let now = current_time_ms();
        Self {
            last_activity_at_ms: now,
            last_poll_at_ms: now,
            visible: true,
        }
    }
}

impl WorkspaceTreeSchedulerState {
    fn note_activity(&mut self) {
        self.last_activity_at_ms = current_time_ms();
    }

    fn set_visibility(&mut self, visible: bool) {
        self.visible = visible;
        if visible {
            self.last_activity_at_ms = current_time_ms();
        }
    }

    fn maybe_mark_poll_due(&mut self) -> bool {
        if !self.visible {
            return false;
        }

        let now = current_time_ms();
        let interval_ms = if now.saturating_sub(self.last_activity_at_ms) <= TREE_ACTIVITY_WINDOW_MS {
            ACTIVE_TREE_POLL_INTERVAL_MS
        } else {
            IDLE_TREE_POLL_INTERVAL_MS
        };

        if now.saturating_sub(self.last_poll_at_ms) < interval_ms {
            return false;
        }

        self.last_poll_at_ms = now;
        true
    }
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_workspace_path(path: &str) -> String {
    let trimmed = path.trim_end_matches(std::path::MAIN_SEPARATOR);
    if trimmed.is_empty() {
        std::path::MAIN_SEPARATOR.to_string()
    } else {
        trimmed.to_string()
    }
}

fn should_emit_event(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn collect_workspace_event_paths(workspace_root: &Path, event: &Event) -> Vec<String> {
    event
        .paths
        .iter()
        .filter_map(|path| {
            let absolute_path = if path.is_absolute() {
                path.clone()
            } else {
                workspace_root.join(path)
            };
            if absolute_path.starts_with(workspace_root) {
                Some(absolute_path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

fn create_workspace_tree_watcher(
    app: AppHandle,
    workspace_path: String,
) -> Result<WorkspaceTreeWatchSession, String> {
    let workspace_root = PathBuf::from(&workspace_path);
    if !workspace_root.is_dir() {
        return Err(format!(
            "Workspace path is not a directory: {workspace_path}"
        ));
    }

    let emitted_workspace_path = workspace_path.clone();
    let watcher_root = workspace_root.clone();
    let watcher_app = app.clone();
    let refresh_state = Arc::new(Mutex::new(WorkspaceTreeRefreshState::default()));
    let refresh_state_for_watcher = Arc::clone(&refresh_state);
    let scheduler_state = Arc::new(Mutex::new(WorkspaceTreeSchedulerState::default()));
    let scheduler_running = Arc::new(AtomicBool::new(true));

    let mut watcher = recommended_watcher(move |result: notify::Result<Event>| match result {
        Ok(event) => {
            if !should_emit_event(&event.kind) {
                return;
            }

            let changed_paths = collect_workspace_event_paths(&watcher_root, &event);
            if changed_paths.is_empty() {
                return;
            }

            let generation = match refresh_state_for_watcher.lock() {
                Ok(mut state) => state.queue_paths(changed_paths),
                Err(_) => return,
            };

            let refresh_state_for_emit = Arc::clone(&refresh_state_for_watcher);
            let watcher_app = watcher_app.clone();
            let emitted_workspace_path = emitted_workspace_path.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(WORKSPACE_TREE_REFRESH_DEBOUNCE_MS));
                let changed_paths = match refresh_state_for_emit.lock() {
                    Ok(mut state) => state.take_if_generation_matches(generation),
                    Err(_) => Vec::new(),
                };
                if changed_paths.is_empty() {
                    return;
                }

                let payload = WorkspaceTreeRefreshRequestedPayload {
                    workspace_path: emitted_workspace_path,
                    changed_paths,
                    reason: "fs-watch".to_string(),
                };

                let _ = watcher_app.emit(WORKSPACE_TREE_REFRESH_REQUESTED_EVENT, payload);
            });
        }
        Err(error) => {
            eprintln!(
                "[fs-watch] watcher error for {}: {}",
                emitted_workspace_path, error
            );
        }
    })
    .map_err(|error| error.to_string())?;

    watcher
        .watch(&workspace_root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let scheduler_app = app.clone();
    let scheduler_workspace_path = workspace_path.clone();
    let scheduler_state_for_thread = Arc::clone(&scheduler_state);
    let scheduler_running_for_thread = Arc::clone(&scheduler_running);
    thread::spawn(move || {
        while scheduler_running_for_thread.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(WORKSPACE_TREE_SCHEDULER_TICK_MS));
            let should_emit = match scheduler_state_for_thread.lock() {
                Ok(mut state) => state.maybe_mark_poll_due(),
                Err(_) => false,
            };
            if !should_emit {
                continue;
            }

            let payload = WorkspaceTreeRefreshRequestedPayload {
                workspace_path: scheduler_workspace_path.clone(),
                changed_paths: Vec::new(),
                reason: "poll".to_string(),
            };
            let _ = scheduler_app.emit(WORKSPACE_TREE_REFRESH_REQUESTED_EVENT, payload);
        }
    });

    Ok(WorkspaceTreeWatchSession {
        workspace_path,
        refresh_state,
        scheduler_state,
        scheduler_running,
        _watcher: watcher,
    })
}

#[tauri::command]
pub fn workspace_tree_watch_start(
    app: AppHandle,
    state: State<'_, WorkspaceTreeWatchState>,
    path: String,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&path);
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Failed to acquire workspace watch state".to_string())?;

    if guard
        .as_ref()
        .map(|current| current.workspace_path.as_str())
        == Some(workspace_path.as_str())
    {
        return Ok(());
    }

    drop(guard);
    let session = create_workspace_tree_watcher(app, workspace_path.clone())?;

    guard = state
        .session
        .lock()
        .map_err(|_| "Failed to acquire workspace watch state".to_string())?;
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
pub fn workspace_tree_watch_stop(state: State<'_, WorkspaceTreeWatchState>) -> Result<(), String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Failed to acquire workspace watch state".to_string())?;
    if let Some(session) = guard.as_ref() {
        if let Ok(mut refresh_state) = session.refresh_state.lock() {
            refresh_state.reset();
        }
        session.scheduler_running.store(false, Ordering::Relaxed);
    }
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn workspace_tree_watch_note_activity(
    state: State<'_, WorkspaceTreeWatchState>,
    params: WorkspaceTreeWatchActivityParams,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&params.path);
    let guard = state
        .session
        .lock()
        .map_err(|_| "Failed to acquire workspace watch state".to_string())?;
    let Some(session) = guard.as_ref() else {
        return Ok(());
    };
    if session.workspace_path != workspace_path {
        return Ok(());
    }
    if let Ok(mut scheduler_state) = session.scheduler_state.lock() {
        scheduler_state.note_activity();
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_tree_watch_set_visibility(
    state: State<'_, WorkspaceTreeWatchState>,
    params: WorkspaceTreeWatchVisibilityParams,
) -> Result<(), String> {
    let workspace_path = normalize_workspace_path(&params.path);
    let guard = state
        .session
        .lock()
        .map_err(|_| "Failed to acquire workspace watch state".to_string())?;
    let Some(session) = guard.as_ref() else {
        return Ok(());
    };
    if session.workspace_path != workspace_path {
        return Ok(());
    }
    if let Ok(mut scheduler_state) = session.scheduler_state.lock() {
        scheduler_state.set_visibility(params.visible);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{collect_workspace_event_paths, normalize_workspace_path, should_emit_event};
    use notify::{event::AccessKind, Event, EventKind};
    use std::path::{Path, PathBuf};

    #[test]
    fn normalize_workspace_path_trims_trailing_separator() {
        assert_eq!(
            normalize_workspace_path("/tmp/workspace/"),
            "/tmp/workspace"
        );
        assert_eq!(normalize_workspace_path("/"), "/");
    }

    #[test]
    fn access_events_do_not_trigger_refresh() {
        assert!(!should_emit_event(&EventKind::Access(AccessKind::Close(
            notify::event::AccessMode::Read,
        ))));
        assert!(should_emit_event(&EventKind::Remove(
            notify::event::RemoveKind::Any,
        )));
    }

    #[test]
    fn collect_workspace_event_paths_filters_outside_paths() {
        let workspace_root = Path::new("/tmp/workspace");
        let event = Event {
            kind: EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![
                PathBuf::from("/tmp/workspace/a.md"),
                PathBuf::from("/tmp/other/b.md"),
            ],
            attrs: Default::default(),
        };

        assert_eq!(
            collect_workspace_event_paths(workspace_root, &event),
            vec!["/tmp/workspace/a.md".to_string()]
        );
    }
}
