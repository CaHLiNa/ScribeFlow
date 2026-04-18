use crate::native_editor_bridge::{
    NativeEditorApplyExternalContentRequest, NativeEditorCommand, NativeEditorEvent,
    NativeEditorEventPayload, NativeEditorOpenDocumentRequest, NativeEditorSessionSnapshot,
    NATIVE_EDITOR_EVENT,
};
use crate::process_utils::background_tokio_command;
use serde_json::to_string;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

const READY_TIMEOUT_MS: u64 = 3_000;
const SHUTDOWN_TIMEOUT_MS: u64 = 2_000;

struct ActiveNativeEditorSession {
    session_id: String,
    helper_path: PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
    stdin: Arc<Mutex<ChildStdin>>,
    handle: JoinHandle<()>,
}

#[derive(Default)]
pub struct NativeEditorRuntimeState {
    inner: Arc<Mutex<Option<ActiveNativeEditorSession>>>,
}

fn resolve_helper_binary_name() -> &'static str {
    if cfg!(windows) {
        "altals-native-editor-app.exe"
    } else {
        "altals-native-editor-app"
    }
}

fn helper_binary_candidates<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let binary_name = resolve_helper_binary_name();
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![
        manifest_dir.join("target").join("debug").join(binary_name),
        manifest_dir.join("target").join("release").join(binary_name),
    ];

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join(binary_name));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(binary_name));
        candidates.push(resource_dir.join("bin").join(binary_name));
    }

    candidates
}

fn resolve_helper_binary_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("ALTALS_NATIVE_EDITOR_BIN") {
        let path = PathBuf::from(explicit);
        if path.exists() {
            return Ok(path);
        }
    }

    helper_binary_candidates(app)
        .into_iter()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| "Native editor helper binary is unavailable.".to_string())
}

async fn write_command(stdin: &Arc<Mutex<ChildStdin>>, command: &NativeEditorCommand) -> Result<(), String> {
    let serialized =
        to_string(command).map_err(|error| format!("Failed to serialize native editor command: {error}"))?;
    let mut lock = stdin.lock().await;
    lock.write_all(format!("{serialized}\n").as_bytes())
        .await
        .map_err(|error| format!("Failed to write native editor command: {error}"))?;
    lock.flush()
        .await
        .map_err(|error| format!("Failed to flush native editor command: {error}"))?;
    Ok(())
}

fn emit_native_editor_event<R: Runtime>(
    app: &AppHandle<R>,
    session_id: String,
    event: NativeEditorEvent,
) {
    let _ = app.emit(
        NATIVE_EDITOR_EVENT,
        NativeEditorEventPayload { session_id, event },
    );
}

async fn wait_for_child(child: &mut Child) {
    let _ = child.wait().await;
}

#[tauri::command]
pub async fn native_editor_session_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<NativeEditorSessionSnapshot, String> {
    let mut guard = state.inner.lock().await;
    if let Some(existing) = guard.as_ref() {
        return Ok(NativeEditorSessionSnapshot {
            session_id: existing.session_id.clone(),
            helper_path: existing.helper_path.display().to_string(),
            process_id: existing.process_id,
            protocol_version: existing.protocol_version,
            started: true,
        });
    }

    let helper_path = resolve_helper_binary_path(&app)?;
    let mut child = background_tokio_command(&helper_path)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to spawn native editor helper: {error}"))?;

    let process_id = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Native editor helper stdin is unavailable.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Native editor helper stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take();

    let stdin = Arc::new(Mutex::new(stdin));
    let (ready_tx, ready_rx) = oneshot::channel::<(String, u32)>();
    let ready_sender = Arc::new(Mutex::new(Some(ready_tx)));
    let app_for_task = app.clone();
    let app_for_stderr = app.clone();

    let handle = tokio::spawn(async move {
        let mut child = child;
        let mut stdout_lines = BufReader::new(stdout).lines();
        let ready_sender_for_stdout = ready_sender.clone();

        let stderr_task = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut stderr_lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = stderr_lines.next_line().await {
                    emit_native_editor_event(
                        &app_for_stderr,
                        "pending".to_string(),
                        NativeEditorEvent::Error { message: line },
                    );
                }
            }
        });

        while let Ok(Some(line)) = stdout_lines.next_line().await {
            let parsed = match serde_json::from_str::<NativeEditorEvent>(&line) {
                Ok(event) => event,
                Err(error) => {
                    emit_native_editor_event(
                        &app_for_task,
                        "pending".to_string(),
                        NativeEditorEvent::Error {
                            message: format!("Failed to parse native editor event: {error}"),
                        },
                    );
                    continue;
                }
            };

            if let NativeEditorEvent::Ready {
                session_id,
                protocol_version,
            } = &parsed
            {
                if let Some(sender) = ready_sender_for_stdout.lock().await.take() {
                    let _ = sender.send((session_id.clone(), *protocol_version));
                }
            }

            let session_id = match &parsed {
                NativeEditorEvent::Ready { session_id, .. } => session_id.clone(),
                NativeEditorEvent::Stopped { session_id } => session_id.clone(),
                _ => "native-editor-session".to_string(),
            };
            emit_native_editor_event(&app_for_task, session_id, parsed);
        }

        let _ = stderr_task.await;
        wait_for_child(&mut child).await;
    });

    let (session_id, protocol_version) = timeout(Duration::from_millis(READY_TIMEOUT_MS), ready_rx)
        .await
        .map_err(|_| "Timed out waiting for native editor helper readiness.".to_string())?
        .map_err(|_| "Native editor helper exited before signaling readiness.".to_string())?;

    let snapshot = NativeEditorSessionSnapshot {
        session_id: session_id.clone(),
        helper_path: helper_path.display().to_string(),
        process_id,
        protocol_version,
        started: true,
    };

    *guard = Some(ActiveNativeEditorSession {
        session_id,
        helper_path,
        process_id,
        protocol_version,
        stdin,
        handle,
    });

    Ok(snapshot)
}

#[tauri::command]
pub async fn native_editor_session_open_document<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorOpenDocumentRequest,
) -> Result<NativeEditorSessionSnapshot, String> {
    let snapshot = native_editor_session_start(app, state.clone()).await?;
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session did not start.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::OpenDocument {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(snapshot)
}

#[tauri::command]
pub async fn native_editor_session_apply_external_content(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyExternalContentRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ApplyExternalContent {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_replace_document_text(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyExternalContentRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ReplaceDocumentText {
            path: request.path,
            text: request.text,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_stop(
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<bool, String> {
    let mut guard = state.inner.lock().await;
    let Some(active) = guard.take() else {
        return Ok(false);
    };

    let _ = write_command(&active.stdin, &NativeEditorCommand::Shutdown).await;
    match timeout(Duration::from_millis(SHUTDOWN_TIMEOUT_MS), active.handle).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(true),
    }
}
