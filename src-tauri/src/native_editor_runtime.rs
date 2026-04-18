use crate::native_editor_bridge::{
    NativeEditorApplyExternalContentRequest, NativeEditorApplyTransactionRequest,
    NativeEditorCitationEditContext, NativeEditorCitationEntry, NativeEditorCitationTrigger,
    NativeEditorCommand, NativeEditorDocumentSnapshot, NativeEditorDocumentState,
    NativeEditorDocumentStateRequest, NativeEditorEvent, NativeEditorEventPayload,
    NativeEditorInspectInteractionRequest, NativeEditorInteractionContextSnapshot,
    NativeEditorOpenDocumentRequest, NativeEditorRecordWorkflowEventRequest, NativeEditorSelectionRange,
    NativeEditorSessionSnapshot, NativeEditorSessionStateSnapshot, NativeEditorSetDiagnosticsRequest,
    NativeEditorSetOutlineContextRequest, NativeEditorSetSelectionsRequest, NativeEditorWikiLinkMatch,
    NATIVE_EDITOR_EVENT,
};
use crate::process_utils::background_tokio_command;
use regex_lite::Regex;
use serde_json::to_string;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
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
    state_cache: Arc<Mutex<NativeEditorSessionStateSnapshot>>,
    text_cache: Arc<Mutex<HashMap<String, String>>>,
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

fn build_session_snapshot(
    session_id: String,
    helper_path: &PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
) -> NativeEditorSessionSnapshot {
    NativeEditorSessionSnapshot {
        session_id,
        helper_path: helper_path.display().to_string(),
        process_id,
        protocol_version,
        started: true,
    }
}

fn build_session_state_snapshot(
    session_id: String,
    helper_path: &PathBuf,
    process_id: Option<u32>,
    protocol_version: u32,
) -> NativeEditorSessionStateSnapshot {
    NativeEditorSessionStateSnapshot {
        session_id,
        helper_path: helper_path.display().to_string(),
        process_id,
        protocol_version,
        started: true,
        connected: false,
        last_event_kind: String::new(),
        open_documents: Vec::new(),
    }
}

fn reduce_state_cache(cache: &mut NativeEditorSessionStateSnapshot, event: &NativeEditorEvent) {
    cache.last_event_kind = match event {
        NativeEditorEvent::Ready { .. } => "ready",
        NativeEditorEvent::Pong { .. } => "pong",
        NativeEditorEvent::DocumentOpened { .. } => "documentOpened",
        NativeEditorEvent::ContentChanged { .. } => "contentChanged",
        NativeEditorEvent::SessionState { .. } => "sessionState",
        NativeEditorEvent::Stopped { .. } => "stopped",
        NativeEditorEvent::Error { .. } => "error",
    }
    .to_string();

    match event {
        NativeEditorEvent::Ready {
            session_id,
            protocol_version,
        } => {
            cache.session_id = session_id.clone();
            cache.protocol_version = *protocol_version;
            cache.connected = true;
        }
        NativeEditorEvent::DocumentOpened {
            path,
            text_length,
            version,
        } => {
            upsert_document_state(
                &mut cache.open_documents,
                path,
                *text_length,
                *version,
                None,
            );
        }
        NativeEditorEvent::ContentChanged {
            path,
            text,
            text_length,
            version,
            ..
        } => {
            let preview = if text.chars().count() > 240 {
                let head: String = text.chars().take(240).collect();
                format!("{head}\n…")
            } else {
                text.clone()
            };
            upsert_document_state(
                &mut cache.open_documents,
                path,
                *text_length,
                *version,
                Some(preview),
            );
        }
        NativeEditorEvent::SessionState { open_documents } => {
            cache.open_documents = open_documents.clone();
            cache.connected = true;
        }
        NativeEditorEvent::Stopped { .. } => {
            cache.connected = false;
        }
        NativeEditorEvent::Pong { .. } | NativeEditorEvent::Error { .. } => {}
    }
}

fn upsert_document_state(
    documents: &mut Vec<NativeEditorDocumentState>,
    path: &str,
    text_length: usize,
    version: u64,
    text_preview: Option<String>,
) {
    if let Some(existing) = documents.iter_mut().find(|document| document.path == path) {
        existing.text_length = text_length;
        existing.version = version;
        if let Some(preview) = text_preview {
            existing.text_preview = preview;
        }
        return;
    }

    documents.push(NativeEditorDocumentState {
        path: path.to_string(),
        text_length,
        version,
        selections: Vec::new(),
        cursor: None,
        viewport: None,
        text_preview: text_preview.unwrap_or_default(),
        diagnostics: Vec::new(),
        outline_context: None,
        last_workflow_event: None,
    });
}

fn build_document_snapshot(
    document: &NativeEditorDocumentState,
    text_cache: &HashMap<String, String>,
) -> NativeEditorDocumentSnapshot {
    NativeEditorDocumentSnapshot {
        path: document.path.clone(),
        text_length: document.text_length,
        version: document.version,
        selections: document.selections.clone(),
        cursor: document.cursor.clone(),
        viewport: document.viewport.clone(),
        text_preview: document.text_preview.clone(),
        text: text_cache.get(&document.path).cloned().unwrap_or_default(),
        diagnostics: document.diagnostics.clone(),
        outline_context: document.outline_context.clone(),
        last_workflow_event: document.last_workflow_event.clone(),
    }
}

const CITE_CMDS_PATTERN: &str =
    "cite[tp]?|citealp|citealt|citeauthor|citeyear|autocite|textcite|parencite|nocite|footcite|fullcite|supercite|smartcite|Cite[tp]?|Parencite|Textcite|Autocite|Smartcite|Footcite|Fullcite";

fn wiki_link_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wiki link regex should compile"))
}

fn markdown_citation_group_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"\[([^\[\]]*@[a-zA-Z][\w.-]*[^\[\]]*)\]")
            .expect("markdown citation group regex should compile")
    })
}

fn latex_citation_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(&format!(r"\\({CITE_CMDS_PATTERN})\{{([^}}]*)\}}"))
            .expect("latex citation regex should compile")
    })
}

fn latex_citation_trigger_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(&format!(r"\\({CITE_CMDS_PATTERN})\{{([^}}]*)$"))
            .expect("latex citation trigger regex should compile")
    })
}

fn markdown_cite_key_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"@([a-zA-Z][\w.-]*)").expect("markdown cite key regex should compile")
    })
}

fn clamp_native_offset(text: &str, offset: usize) -> usize {
    offset.min(text.len())
}

fn line_range_for_offset(text: &str, offset: usize) -> (usize, usize, &str, &str) {
    let safe_offset = clamp_native_offset(text, offset);
    let line_start = text[..safe_offset].rfind('\n').map(|index| index + 1).unwrap_or(0);
    let line_end = text[safe_offset..]
        .find('\n')
        .map(|index| safe_offset + index)
        .unwrap_or_else(|| text.len());
    let line_text = &text[line_start..line_end];
    let text_before = &text[line_start..safe_offset];
    (line_start, line_end, line_text, text_before)
}

fn trim_wiki_link_target(raw: &str) -> String {
    let mut target = raw;
    if let Some(index) = target.find('|') {
        target = &target[..index];
    }
    if let Some(index) = target.find('#') {
        target = &target[..index];
    }
    target.trim().to_string()
}

fn detect_wiki_link_at_cursor(text: &str, cursor_offset: usize) -> Option<NativeEditorWikiLinkMatch> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in wiki_link_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let target_match = captures.get(1)?;
        let match_from = line_start + full_match.start();
        let match_to = line_start + full_match.end();
        if cursor_offset < match_from || cursor_offset >= match_to {
            continue;
        }
        let target = trim_wiki_link_target(target_match.as_str());
        if target.is_empty() {
            return None;
        }
        return Some(NativeEditorWikiLinkMatch {
            target,
            from: match_from,
            to: match_to,
        });
    }
    None
}

fn detect_markdown_citation_trigger(text: &str, cursor_offset: usize) -> Option<NativeEditorCitationTrigger> {
    let (line_start, _, _, text_before) = line_range_for_offset(text, cursor_offset);

    let last_bracket = text_before.rfind('[');
    let mut inside_brackets = false;
    if let Some(last_bracket) = last_bracket {
        let after_bracket = &text_before[last_bracket + 1..];
        if !after_bracket.contains(']') && after_bracket.contains('@') {
            inside_brackets = true;
        }
    }

    let mut at_idx = None;
    if inside_brackets {
        let last_bracket = last_bracket?;
        let after_bracket = &text_before[last_bracket + 1..];
        if let Some(last_at) = after_bracket.rfind('@') {
            at_idx = Some(last_bracket + 1 + last_at);
        }
    } else if let Some(last_at) = text_before.rfind('@') {
        let prev = if last_at == 0 {
            None
        } else {
            text_before[..last_at].chars().last()
        };
        if last_at == 0 || prev == Some('[') || prev.is_some_and(|ch| ch.is_whitespace()) {
            if !text_before[last_at..].contains(']') {
                at_idx = Some(last_at);
            }
        }
    }

    let at_idx = at_idx?;
    let query = text_before[at_idx + 1..].to_string();
    let abs_at = line_start + at_idx;
    let has_bracket_before = at_idx > 0 && text_before.as_bytes().get(at_idx - 1) == Some(&b'[');
    Some(NativeEditorCitationTrigger {
        query,
        trigger_from: if inside_brackets {
            abs_at
        } else if has_bracket_before {
            abs_at.saturating_sub(1)
        } else {
            abs_at
        },
        trigger_to: cursor_offset,
        inside_brackets,
        latex_command: None,
    })
}

fn detect_latex_citation_trigger(text: &str, cursor_offset: usize) -> Option<NativeEditorCitationTrigger> {
    let (line_start, _, _, text_before) = line_range_for_offset(text, cursor_offset);
    let captures = latex_citation_trigger_regex().captures(text_before)?;
    let command_name = captures.get(1)?.as_str();
    let inside_braces = captures.get(2)?.as_str();
    let last_comma = inside_braces.rfind(',');
    let query = last_comma
        .map(|index| inside_braces[index + 1..].trim().to_string())
        .unwrap_or_else(|| inside_braces.trim().to_string());
    let command_start = text_before.rfind(&format!("\\{command_name}"))?;
    Some(NativeEditorCitationTrigger {
        query: query.clone(),
        trigger_from: if let Some(last_comma) = last_comma {
            cursor_offset.saturating_sub(inside_braces[last_comma + 1..].trim().len())
        } else {
            line_start + command_start
        },
        trigger_to: cursor_offset,
        inside_brackets: last_comma.is_some(),
        latex_command: Some(command_name.to_string()),
    })
}

fn split_markdown_citation_parts(inner: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0_usize;
    let bytes = inner.as_bytes();
    let mut index = 0_usize;
    while index < bytes.len() {
        match bytes[index] {
            b';' => {
                parts.push(inner[start..index].trim().to_string());
                index += 1;
                start = index;
            }
            b',' => {
                let after = inner[index + 1..].trim_start();
                if after.starts_with('@') {
                    parts.push(inner[start..index].trim().to_string());
                    index += 1;
                    start = index;
                } else {
                    index += 1;
                }
            }
            _ => {
                index += 1;
            }
        }
    }
    parts.push(inner[start..].trim().to_string());
    parts.into_iter().filter(|part| !part.is_empty()).collect()
}

fn parse_markdown_citation_entries(full_match: &str) -> Vec<NativeEditorCitationEntry> {
    let inner = full_match
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(full_match);

    split_markdown_citation_parts(inner)
        .into_iter()
        .flat_map(|part| {
            let captures = markdown_cite_key_regex().captures(&part)?;
            let key_match = captures.get(0)?;
            let key_capture = captures.get(1)?;
            let key = key_capture.as_str().to_string();
            let after_key = part[key_match.end()..]
                .trim_start_matches(|ch: char| ch.is_whitespace() || ch == ',')
                .to_string();
            let prefix = part[..key_match.start()].trim().to_string();
            Some(NativeEditorCitationEntry {
                key,
                locator: after_key,
                prefix,
            })
        })
        .collect()
}

fn detect_markdown_citation_edit(text: &str, cursor_offset: usize) -> Option<NativeEditorCitationEditContext> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in markdown_citation_group_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let group_from = line_start + full_match.start();
        let group_to = line_start + full_match.end();
        if cursor_offset < group_from || cursor_offset > group_to {
            continue;
        }
        return Some(NativeEditorCitationEditContext {
            group_from,
            group_to,
            cites: parse_markdown_citation_entries(full_match.as_str()),
            latex_command: None,
        });
    }
    None
}

fn detect_latex_citation_edit(text: &str, cursor_offset: usize) -> Option<NativeEditorCitationEditContext> {
    let (line_start, _, line_text, _) = line_range_for_offset(text, cursor_offset);
    for captures in latex_citation_regex().captures_iter(line_text) {
        let full_match = captures.get(0)?;
        let command_match = captures.get(1)?;
        let keys_match = captures.get(2)?;
        let group_from = line_start + full_match.start();
        let group_to = line_start + full_match.end();
        if cursor_offset < group_from || cursor_offset > group_to {
            continue;
        }
        let cites = keys_match
            .as_str()
            .split(',')
            .map(|key| key.trim())
            .filter(|key| !key.is_empty())
            .map(|key| NativeEditorCitationEntry {
                key: key.to_string(),
                locator: String::new(),
                prefix: String::new(),
            })
            .collect::<Vec<_>>();
        return Some(NativeEditorCitationEditContext {
            group_from,
            group_to,
            cites,
            latex_command: Some(command_match.as_str().to_string()),
        });
    }
    None
}

fn inspect_interaction_context(
    path: &str,
    text: &str,
    selection: Option<NativeEditorSelectionRange>,
) -> NativeEditorInteractionContextSnapshot {
    let selection = selection.unwrap_or(NativeEditorSelectionRange { anchor: 0, head: 0 });
    let cursor_offset = clamp_native_offset(text, selection.head);
    let has_selection = selection.anchor != selection.head;
    NativeEditorInteractionContextSnapshot {
        path: path.to_string(),
        has_selection,
        cursor_offset,
        wiki_link: if has_selection {
            None
        } else {
            detect_wiki_link_at_cursor(text, cursor_offset)
        },
        citation_trigger: if has_selection {
            None
        } else {
            detect_latex_citation_trigger(text, cursor_offset)
                .or_else(|| detect_markdown_citation_trigger(text, cursor_offset))
        },
        citation_edit: if has_selection {
            None
        } else {
            detect_markdown_citation_edit(text, cursor_offset)
                .or_else(|| detect_latex_citation_edit(text, cursor_offset))
        },
    }
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
        return Ok(build_session_snapshot(
            existing.session_id.clone(),
            &existing.helper_path,
            existing.process_id,
            existing.protocol_version,
        ));
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
    let state_cache = Arc::new(Mutex::new(build_session_state_snapshot(
        "pending".to_string(),
        &helper_path,
        process_id,
        0,
    )));
    let text_cache = Arc::new(Mutex::new(HashMap::<String, String>::new()));
    let (ready_tx, ready_rx) = oneshot::channel::<(String, u32)>();
    let ready_sender = Arc::new(Mutex::new(Some(ready_tx)));
    let app_for_task = app.clone();
    let app_for_stderr = app.clone();
    let cache_for_task = state_cache.clone();
    let text_cache_for_task = text_cache.clone();

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
            {
                let mut cache = cache_for_task.lock().await;
                reduce_state_cache(&mut cache, &parsed);
            }
            match &parsed {
                NativeEditorEvent::ContentChanged { path, text, .. } => {
                    let mut text_cache = text_cache_for_task.lock().await;
                    text_cache.insert(path.clone(), text.clone());
                }
                NativeEditorEvent::Stopped { .. } => {
                    let mut text_cache = text_cache_for_task.lock().await;
                    text_cache.clear();
                }
                _ => {}
            }
            emit_native_editor_event(&app_for_task, session_id, parsed);
        }

        let _ = stderr_task.await;
        wait_for_child(&mut child).await;
    });

    let (session_id, protocol_version) = timeout(Duration::from_millis(READY_TIMEOUT_MS), ready_rx)
        .await
        .map_err(|_| "Timed out waiting for native editor helper readiness.".to_string())?
        .map_err(|_| "Native editor helper exited before signaling readiness.".to_string())?;

    {
        let mut cache = state_cache.lock().await;
        cache.session_id = session_id.clone();
        cache.protocol_version = protocol_version;
        cache.connected = true;
    }

    let snapshot = build_session_snapshot(
        session_id.clone(),
        &helper_path,
        process_id,
        protocol_version,
    );

    *guard = Some(ActiveNativeEditorSession {
        session_id,
        helper_path,
        process_id,
        protocol_version,
        stdin,
        state_cache,
        text_cache,
        handle,
    });

    Ok(snapshot)
}

#[tauri::command]
pub async fn native_editor_document_state(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorDocumentStateRequest,
) -> Result<Option<NativeEditorDocumentSnapshot>, String> {
    let (cache, text_cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (
            active.state_cache.clone(),
            active.text_cache.clone(),
            active.handle.is_finished(),
        )
    };

    if handle_finished {
        return Ok(None);
    }

    let snapshot = cache.lock().await.clone();
    let text_cache = text_cache.lock().await.clone();
    let target_path = request.path;
    let Some(document) = snapshot
        .open_documents
        .iter()
        .find(|document| document.path == target_path)
    else {
        return Ok(None);
    };

    Ok(Some(build_document_snapshot(document, &text_cache)))
}

#[tauri::command]
pub async fn native_editor_inspect_interaction_context(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorInspectInteractionRequest,
) -> Result<Option<NativeEditorInteractionContextSnapshot>, String> {
    let (cache, text_cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (
            active.state_cache.clone(),
            active.text_cache.clone(),
            active.handle.is_finished(),
        )
    };

    if handle_finished {
        return Ok(None);
    }

    let snapshot = cache.lock().await.clone();
    let text_cache = text_cache.lock().await.clone();
    let target_path = request.path;
    let document = snapshot
        .open_documents
        .iter()
        .find(|document| document.path == target_path);

    let text = request
        .text
        .or_else(|| text_cache.get(&target_path).cloned())
        .unwrap_or_default();
    if text.is_empty() && document.is_none() && !text_cache.contains_key(&target_path) {
        return Ok(None);
    }

    let selection = request.selection.or_else(|| {
        document
            .and_then(|entry| entry.selections.first().cloned())
    });

    Ok(Some(inspect_interaction_context(&target_path, &text, selection)))
}

#[tauri::command]
pub async fn native_editor_session_state(
    state: State<'_, NativeEditorRuntimeState>,
) -> Result<Option<NativeEditorSessionStateSnapshot>, String> {
    let (cache, handle_finished) = {
        let guard = state.inner.lock().await;
        let Some(active) = guard.as_ref() else {
            return Ok(None);
        };
        (
            active.state_cache.clone(),
            active.handle.is_finished(),
        )
    };

    let mut snapshot = cache.lock().await.clone();
    if handle_finished {
        snapshot.connected = false;
    }
    Ok(Some(snapshot))
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
pub async fn native_editor_session_apply_transaction(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorApplyTransactionRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::ApplyTransaction {
            path: request.path,
            edits: request.edits,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_selections(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetSelectionsRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetSelections {
            path: request.path,
            selections: request.selections,
            viewport_offset: request.viewport_offset,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_diagnostics(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetDiagnosticsRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetDiagnostics {
            path: request.path,
            diagnostics: request.diagnostics,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_set_outline_context(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorSetOutlineContextRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::SetOutlineContext {
            path: request.path,
            context: request.context,
        },
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn native_editor_session_record_workflow_event(
    state: State<'_, NativeEditorRuntimeState>,
    request: NativeEditorRecordWorkflowEventRequest,
) -> Result<bool, String> {
    let guard = state.inner.lock().await;
    let Some(active) = guard.as_ref() else {
        return Err("Native editor session is not running.".to_string());
    };

    write_command(
        &active.stdin,
        &NativeEditorCommand::RecordWorkflowEvent {
            path: request.path,
            event: request.event,
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
    {
        let mut cache = active.state_cache.lock().await;
        cache.connected = false;
        cache.last_event_kind = "stopping".to_string();
    }
    match timeout(Duration::from_millis(SHUTDOWN_TIMEOUT_MS), active.handle).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_editor_interaction_detects_wiki_link_at_cursor() {
        let context = inspect_interaction_context(
            "note.md",
            "Before [[Paper Note|display]] after",
            Some(NativeEditorSelectionRange { anchor: 10, head: 10 }),
        );
        let wiki_link = context.wiki_link.expect("wiki link should be detected");
        assert_eq!(wiki_link.target, "Paper Note");
        assert!(context.citation_trigger.is_none());
    }

    #[test]
    fn native_editor_interaction_detects_markdown_citation_trigger() {
        let text = "Intro [@smith2020, p. 10; @doe2021";
        let cursor = text.len();
        let context = inspect_interaction_context(
            "paper.md",
            text,
            Some(NativeEditorSelectionRange {
                anchor: cursor,
                head: cursor,
            }),
        );
        let trigger = context.citation_trigger.expect("markdown trigger should exist");
        assert_eq!(trigger.query, "doe2021");
        assert!(trigger.latex_command.is_none());
    }

    #[test]
    fn native_editor_interaction_detects_latex_citation_edit_group() {
        let text = r"\cite{smith2020, doe2021}";
        let cursor = 8;
        let context = inspect_interaction_context(
            "paper.tex",
            text,
            Some(NativeEditorSelectionRange {
                anchor: cursor,
                head: cursor,
            }),
        );
        let edit = context.citation_edit.expect("latex citation edit should exist");
        assert_eq!(edit.latex_command.as_deref(), Some("cite"));
        assert_eq!(edit.cites.len(), 2);
        assert_eq!(edit.cites[0].key, "smith2020");
        assert_eq!(edit.cites[1].key, "doe2021");
    }
}
