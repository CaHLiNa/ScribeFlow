use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{collect_files_recursive, read_dir_shallow_entries, FileEntry};
use crate::process_utils::background_tokio_command;
use crate::security::canonicalize_for_scope;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::ChildStdin;
use tokio::sync::{Mutex, Notify};

const READ_FILE_TOOL: &str = "read_file";
const LIST_FILES_TOOL: &str = "list_files";
const SEARCH_FILES_TOOL: &str = "search_files";
pub(crate) const APPLY_PATCH_TOOL: &str = "apply_patch";
pub(crate) const EXEC_COMMAND_TOOL: &str = "exec_command";
pub(crate) const WRITE_STDIN_TOOL: &str = "write_stdin";

const DEFAULT_READ_MAX_BYTES: u64 = 64 * 1024;
const MAX_READ_BYTES: u64 = 256 * 1024;
const DEFAULT_LIST_MAX_RESULTS: usize = 200;
const MAX_LIST_RESULTS: usize = 1000;
const DEFAULT_SEARCH_MAX_RESULTS: usize = 100;
const MAX_SEARCH_RESULTS: usize = 500;
const SEARCH_FILE_MAX_BYTES: u64 = 256 * 1024;
const APPLY_PATCH_PREVIEW_MAX_CHARS: usize = 1200;
const DEFAULT_EXEC_YIELD_MS: u64 = 1_000;
const MAX_EXEC_YIELD_MS: u64 = 30_000;
const EXEC_OUTPUT_MAX_CHARS: usize = 16_000;
const DEFAULT_EXEC_MAX_OUTPUT_TOKENS: usize = 2_000;

static EXEC_SESSION_IDS: AtomicI32 = AtomicI32::new(1000);
type ExecSessionMap = Mutex<HashMap<i32, Arc<ExecSession>>>;
static EXEC_SESSIONS: OnceLock<ExecSessionMap> = OnceLock::new();

#[derive(Debug, Clone)]
pub struct RuntimeToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone)]
pub struct RuntimeToolResult {
    pub tool_call_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
enum PatchLineKind {
    Context,
    Remove,
    Add,
}

#[derive(Debug, Clone)]
struct PatchLine {
    kind: PatchLineKind,
    text: String,
}

#[derive(Debug, Clone)]
struct PatchHunk {
    lines: Vec<PatchLine>,
}

#[derive(Debug, Clone)]
enum ParsedPatchOp {
    Add {
        path: String,
        content_lines: Vec<String>,
    },
    Delete {
        path: String,
    },
    Update {
        path: String,
        move_to: Option<String>,
        hunks: Vec<PatchHunk>,
    },
}

#[derive(Debug, Clone)]
enum ResolvedPatchOp {
    Add {
        path: PathBuf,
        content: String,
    },
    Delete {
        path: PathBuf,
    },
    Update {
        path: PathBuf,
        move_to: Option<PathBuf>,
        hunks: Vec<PatchHunk>,
    },
}

#[derive(Debug, Clone)]
pub(crate) struct PreparedApplyPatch {
    pub files: Vec<String>,
    pub preview: String,
    operations: Vec<ResolvedPatchOp>,
}

#[derive(Debug, Clone)]
pub(crate) struct PreparedExecCommand {
    pub command: String,
    pub workdir: String,
    pub shell: String,
    pub tty: bool,
    pub yield_time_ms: u64,
    pub max_output_chars: usize,
}

#[derive(Debug, Clone)]
pub(crate) struct PreparedWriteStdin {
    pub session_id: i32,
    pub chars: String,
    pub close_stdin: bool,
    pub yield_time_ms: u64,
    pub max_output_chars: usize,
}

#[derive(Debug)]
struct ExecSession {
    session_id: i32,
    stdin: Mutex<Option<ChildStdin>>,
    tty_active: bool,
    stdout: Mutex<String>,
    stderr: Mutex<String>,
    events: Mutex<Vec<ExecOutputEvent>>,
    delivered_event_count: Mutex<usize>,
    exit_code: Mutex<Option<i32>>,
    process_exited: AtomicBool,
    active_readers: AtomicI32,
    done: AtomicBool,
    notify: Notify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExecOutputStream {
    Stdout,
    Stderr,
}

impl ExecOutputStream {
    fn as_str(self) -> &'static str {
        match self {
            Self::Stdout => "stdout",
            Self::Stderr => "stderr",
        }
    }
}

#[derive(Debug, Clone)]
struct ExecOutputEvent {
    stream: ExecOutputStream,
    text: String,
}

fn string_arg(arguments: &Value, key: &str) -> String {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn bool_arg(arguments: &Value, key: &str, default: bool) -> bool {
    arguments
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn usize_arg(arguments: &Value, key: &str, default: usize, max: usize) -> usize {
    arguments
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .clamp(1, max)
}

fn u64_arg(arguments: &Value, key: &str, default: u64, max: u64) -> u64 {
    arguments
        .get(key)
        .and_then(Value::as_u64)
        .unwrap_or(default)
        .clamp(1, max)
}

fn normalize_display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn exec_sessions() -> &'static ExecSessionMap {
    EXEC_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_exec_session_id() -> i32 {
    EXEC_SESSION_IDS.fetch_add(1, Ordering::Relaxed)
}

fn maybe_mark_exec_session_done(session: &ExecSession) {
    if session.process_exited.load(Ordering::Relaxed)
        && session.active_readers.load(Ordering::Relaxed) <= 0
    {
        session.done.store(true, Ordering::Relaxed);
        session.notify.notify_waiters();
    }
}

fn workspace_root(workspace_path: &str) -> Result<PathBuf, String> {
    let trimmed = workspace_path.trim();
    if trimmed.is_empty() {
        return Err("No active workspace path is available.".to_string());
    }
    let root = canonicalize_for_scope(Path::new(trimmed))?;
    if !root.is_dir() {
        return Err(format!(
            "Workspace root is not a directory: {}",
            root.display()
        ));
    }
    Ok(root)
}

fn ensure_within_root(root: &Path, target: &Path) -> Result<(), String> {
    if target == root || target.starts_with(root) {
        Ok(())
    } else {
        Err(format!(
            "Path is outside the current workspace: {}",
            target.display()
        ))
    }
}

fn resolve_workspace_target(root: &Path, requested_path: &str) -> Result<PathBuf, String> {
    let candidate = if requested_path.trim().is_empty() {
        root.to_path_buf()
    } else {
        let requested = Path::new(requested_path.trim());
        if requested.is_absolute() {
            requested.to_path_buf()
        } else {
            root.join(requested)
        }
    };
    let resolved = canonicalize_for_scope(&candidate)?;
    ensure_within_root(root, &resolved)?;
    Ok(resolved)
}

fn ensure_relative_patch_path(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Patch path is required.".to_string());
    }
    let patch_path = Path::new(trimmed);
    if patch_path.is_absolute() {
        return Err(format!("Patch path must be relative: {trimmed}"));
    }
    for component in patch_path.components() {
        match component {
            Component::CurDir | Component::Normal(_) => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Patch path is invalid: {trimmed}"));
            }
        }
    }
    Ok(())
}

fn resolve_patch_target(root: &Path, path: &str) -> Result<PathBuf, String> {
    ensure_relative_patch_path(path)?;
    resolve_workspace_target(root, path)
}

fn relative_to_root(root: &Path, target: &Path) -> String {
    target
        .strip_prefix(root)
        .ok()
        .map(normalize_display_path)
        .unwrap_or_else(|| normalize_display_path(target))
}

fn json_content(value: &Value) -> String {
    serde_json::to_string_pretty(value)
        .unwrap_or_else(|_| "{\"error\":\"Failed to serialize tool result.\"}".to_string())
}

fn ok_result(tool_call_id: &str, value: Value) -> RuntimeToolResult {
    RuntimeToolResult {
        tool_call_id: tool_call_id.to_string(),
        content: json_content(&value),
        is_error: false,
    }
}

fn err_result(
    tool_call_id: &str,
    tool_name: &str,
    message: impl Into<String>,
) -> RuntimeToolResult {
    RuntimeToolResult {
        tool_call_id: tool_call_id.to_string(),
        content: json_content(&json!({
            "tool": tool_name,
            "error": message.into(),
        })),
        is_error: true,
    }
}

fn preview_text(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    format!(
        "{}…",
        trimmed
            .chars()
            .take(max_chars)
            .collect::<String>()
            .trim_end()
    )
}

fn shell_program(shell: &str) -> String {
    let trimmed = shell.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    if cfg!(windows) {
        "powershell.exe".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

fn shell_arguments(shell_program: &str, command: &str) -> Vec<String> {
    if cfg!(windows) {
        if shell_program.to_ascii_lowercase().contains("cmd") {
            return vec!["/C".to_string(), command.to_string()];
        }
        return vec!["-Command".to_string(), command.to_string()];
    }
    vec!["-lc".to_string(), command.to_string()]
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r#"'\''"#))
}

fn sanitize_tty_text(text: &str) -> String {
    text.trim_start_matches(['\u{4}', '\u{8}']).to_string()
}

fn build_exec_invocation(
    prepared: &PreparedExecCommand,
) -> Result<(String, Vec<String>, bool), String> {
    if !prepared.tty {
        return Ok((
            prepared.shell.clone(),
            shell_arguments(&prepared.shell, &prepared.command),
            false,
        ));
    }

    if cfg!(windows) {
        return Err("TTY exec is not supported on Windows.".to_string());
    }

    if cfg!(target_os = "macos")
        || cfg!(target_os = "freebsd")
        || cfg!(target_os = "openbsd")
        || cfg!(target_os = "netbsd")
    {
        return Ok((
            "script".to_string(),
            vec![
                "-q".to_string(),
                "/dev/null".to_string(),
                prepared.shell.clone(),
                "-lc".to_string(),
                prepared.command.clone(),
            ],
            true,
        ));
    }

    let wrapped = format!(
        "{} -lc {}",
        shell_single_quote(&prepared.shell),
        shell_single_quote(&prepared.command)
    );
    Ok((
        "script".to_string(),
        vec!["-qefc".to_string(), wrapped, "/dev/null".to_string()],
        true,
    ))
}

fn file_entry_from_path(path: &Path) -> FileEntry {
    FileEntry {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        path: normalize_display_path(path),
        is_dir: false,
        children: None,
        modified: None,
    }
}

fn collect_list_entries(
    root: &Path,
    current: &Path,
    recursive: bool,
    limit: usize,
    entries: &mut Vec<Value>,
    truncated: &mut bool,
) -> Result<(), String> {
    for entry in read_dir_shallow_entries(current)? {
        if entries.len() >= limit {
            *truncated = true;
            return Ok(());
        }

        let path = PathBuf::from(&entry.path);
        entries.push(json!({
            "path": relative_to_root(root, &path),
            "kind": if entry.is_dir { "dir" } else { "file" },
            "modified": entry.modified,
        }));

        if recursive && entry.is_dir {
            collect_list_entries(root, &path, recursive, limit, entries, truncated)?;
            if *truncated {
                return Ok(());
            }
        }
    }
    Ok(())
}

fn is_patch_file_header(line: &str) -> bool {
    line.starts_with("*** Add File: ")
        || line.starts_with("*** Delete File: ")
        || line.starts_with("*** Update File: ")
        || line == "*** End Patch"
}

fn parse_patch_line(line: &str) -> Result<PatchLine, String> {
    let mut chars = line.chars();
    let prefix = chars
        .next()
        .ok_or_else(|| "Patch hunk line cannot be empty.".to_string())?;
    let text = chars.collect::<String>();
    match prefix {
        ' ' => Ok(PatchLine {
            kind: PatchLineKind::Context,
            text,
        }),
        '-' => Ok(PatchLine {
            kind: PatchLineKind::Remove,
            text,
        }),
        '+' => Ok(PatchLine {
            kind: PatchLineKind::Add,
            text,
        }),
        _ => Err(format!("Invalid patch hunk line: {line}")),
    }
}

fn parse_apply_patch_input(input: &str) -> Result<Vec<ParsedPatchOp>, String> {
    let lines = input.lines().collect::<Vec<_>>();
    if lines.first().copied() != Some("*** Begin Patch") {
        return Err("Patch must start with `*** Begin Patch`.".to_string());
    }
    if lines.last().copied() != Some("*** End Patch") {
        return Err("Patch must end with `*** End Patch`.".to_string());
    }

    let mut index = 1usize;
    let mut operations = Vec::new();
    while index + 1 < lines.len() {
        let line = lines[index];
        if line.trim().is_empty() {
            index += 1;
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Add File: ") {
            let mut content_lines = Vec::new();
            index += 1;
            while index + 1 < lines.len() && !is_patch_file_header(lines[index]) {
                let current = lines[index];
                if !current.starts_with('+') {
                    return Err(format!("Add file lines must start with `+`: {current}"));
                }
                content_lines.push(current[1..].to_string());
                index += 1;
            }
            operations.push(ParsedPatchOp::Add {
                path: path.trim().to_string(),
                content_lines,
            });
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Delete File: ") {
            operations.push(ParsedPatchOp::Delete {
                path: path.trim().to_string(),
            });
            index += 1;
            continue;
        }

        if let Some(path) = line.strip_prefix("*** Update File: ") {
            let source_path = path.trim().to_string();
            index += 1;
            let mut move_to = None;
            if index + 1 < lines.len() && lines[index].starts_with("*** Move to: ") {
                move_to = Some(
                    lines[index]
                        .trim_start_matches("*** Move to: ")
                        .trim()
                        .to_string(),
                );
                index += 1;
            }

            let mut hunks = Vec::new();
            while index + 1 < lines.len()
                && !lines[index].starts_with("*** Add File: ")
                && !lines[index].starts_with("*** Delete File: ")
                && !lines[index].starts_with("*** Update File: ")
                && lines[index] != "*** End Patch"
            {
                let current = lines[index];
                if !current.starts_with("@@") {
                    return Err(format!("Expected patch hunk header, got: {current}"));
                }
                index += 1;
                let mut hunk_lines = Vec::new();
                while index + 1 < lines.len()
                    && !lines[index].starts_with("@@")
                    && !lines[index].starts_with("*** Add File: ")
                    && !lines[index].starts_with("*** Delete File: ")
                    && !lines[index].starts_with("*** Update File: ")
                    && lines[index] != "*** End Patch"
                {
                    if lines[index] == "*** End of File" {
                        index += 1;
                        break;
                    }
                    hunk_lines.push(parse_patch_line(lines[index])?);
                    index += 1;
                }
                hunks.push(PatchHunk { lines: hunk_lines });
            }

            if hunks.is_empty() && move_to.is_none() {
                return Err(format!(
                    "Update file operation requires at least one hunk or a move target: {source_path}"
                ));
            }

            operations.push(ParsedPatchOp::Update {
                path: source_path,
                move_to,
                hunks,
            });
            continue;
        }

        return Err(format!("Unexpected patch line: {line}"));
    }

    if operations.is_empty() {
        return Err("Patch does not contain any file operations.".to_string());
    }

    Ok(operations)
}

fn resolve_apply_patch(workspace_path: &str, input: &str) -> Result<PreparedApplyPatch, String> {
    let root = workspace_root(workspace_path)?;
    let parsed = parse_apply_patch_input(input)?;
    let mut operations = Vec::new();
    let mut files = Vec::new();

    for operation in parsed {
        match operation {
            ParsedPatchOp::Add {
                path,
                content_lines,
            } => {
                let resolved = resolve_patch_target(&root, &path)?;
                files.push(relative_to_root(&root, &resolved));
                operations.push(ResolvedPatchOp::Add {
                    path: resolved,
                    content: content_lines.join("\n"),
                });
            }
            ParsedPatchOp::Delete { path } => {
                let resolved = resolve_patch_target(&root, &path)?;
                files.push(relative_to_root(&root, &resolved));
                operations.push(ResolvedPatchOp::Delete { path: resolved });
            }
            ParsedPatchOp::Update {
                path,
                move_to,
                hunks,
            } => {
                let resolved = resolve_patch_target(&root, &path)?;
                files.push(relative_to_root(&root, &resolved));
                let resolved_move_to = move_to
                    .map(|target| resolve_patch_target(&root, &target))
                    .transpose()?;
                if let Some(ref target) = resolved_move_to {
                    files.push(relative_to_root(&root, target));
                }
                operations.push(ResolvedPatchOp::Update {
                    path: resolved,
                    move_to: resolved_move_to,
                    hunks,
                });
            }
        }
    }

    files.sort();
    files.dedup();

    Ok(PreparedApplyPatch {
        files,
        preview: preview_text(input, APPLY_PATCH_PREVIEW_MAX_CHARS),
        operations,
    })
}

fn locate_sequence(haystack: &[String], needle: &[String], start: usize) -> Option<usize> {
    if needle.is_empty() {
        return Some(start.min(haystack.len()));
    }
    if haystack.len() < needle.len() {
        return None;
    }
    let upper = haystack.len().saturating_sub(needle.len());
    (start..=upper)
        .chain(0..start.min(upper + 1))
        .find(|&index| haystack[index..index + needle.len()] == *needle)
}

fn apply_hunks_to_content(content: &str, hunks: &[PatchHunk]) -> Result<String, String> {
    let mut lines = content
        .split('\n')
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    let mut cursor = 0usize;

    for hunk in hunks {
        let old_lines = hunk
            .lines
            .iter()
            .filter_map(|line| match line.kind {
                PatchLineKind::Context | PatchLineKind::Remove => Some(line.text.clone()),
                PatchLineKind::Add => None,
            })
            .collect::<Vec<_>>();
        let new_lines = hunk
            .lines
            .iter()
            .filter_map(|line| match line.kind {
                PatchLineKind::Context | PatchLineKind::Add => Some(line.text.clone()),
                PatchLineKind::Remove => None,
            })
            .collect::<Vec<_>>();

        let Some(position) = locate_sequence(&lines, &old_lines, cursor) else {
            return Err("Failed to locate patch hunk in target file.".to_string());
        };

        lines.splice(position..position + old_lines.len(), new_lines.clone());
        cursor = position + new_lines.len();
    }

    Ok(lines.join("\n"))
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn build_apply_patch_result(
    workspace_path: &str,
    prepared: &PreparedApplyPatch,
) -> Value {
    let root = workspace_root(workspace_path).ok();
    let files = if let Some(root) = root.as_ref() {
        prepared
            .files
            .iter()
            .map(|path| relative_to_root(root, &root.join(path)))
            .collect::<Vec<_>>()
    } else {
        prepared.files.clone()
    };
    json!({
        "files": files,
        "preview": prepared.preview,
    })
}

pub(crate) fn execute_prepared_apply_patch(
    workspace_path: &str,
    prepared: &PreparedApplyPatch,
) -> Result<Value, String> {
    let root = workspace_root(workspace_path)?;
    let mut changed = Vec::new();

    for operation in &prepared.operations {
        match operation {
            ResolvedPatchOp::Add { path, content } => {
                if path.exists() {
                    return Err(format!("Target file already exists: {}", path.display()));
                }
                ensure_parent_dir(path)?;
                fs::write(path, content).map_err(|error| error.to_string())?;
                changed.push(json!({
                    "path": relative_to_root(&root, path),
                    "change": "add",
                }));
            }
            ResolvedPatchOp::Delete { path } => {
                if !path.exists() {
                    return Err(format!("Target file does not exist: {}", path.display()));
                }
                fs::remove_file(path).map_err(|error| error.to_string())?;
                changed.push(json!({
                    "path": relative_to_root(&root, path),
                    "change": "delete",
                }));
            }
            ResolvedPatchOp::Update {
                path,
                move_to,
                hunks,
            } => {
                if !path.exists() || !path.is_file() {
                    return Err(format!("Target file does not exist: {}", path.display()));
                }
                let current = fs::read_to_string(path).map_err(|error| error.to_string())?;
                let next_content = apply_hunks_to_content(&current, hunks)?;
                let destination = move_to.as_ref().unwrap_or(path);
                ensure_parent_dir(destination)?;
                fs::write(destination, next_content).map_err(|error| error.to_string())?;
                if let Some(move_path) = move_to {
                    if move_path != path {
                        fs::remove_file(path).map_err(|error| error.to_string())?;
                    }
                }
                changed.push(json!({
                    "path": relative_to_root(&root, destination),
                    "change": if move_to.is_some() { "move_update" } else { "update" },
                }));
            }
        }
    }

    Ok(json!({
        "ok": true,
        "changed": changed,
    }))
}

pub(crate) fn build_exec_command_result(prepared: &PreparedExecCommand) -> Value {
    json!({
        "command": prepared.command,
        "workdir": prepared.workdir,
        "shell": prepared.shell,
        "tty": prepared.tty,
        "yieldTimeMs": prepared.yield_time_ms,
    })
}

pub(crate) fn prepare_exec_command_tool_call(
    workspace_path: &str,
    tool_call: &RuntimeToolCall,
) -> Result<PreparedExecCommand, String> {
    let root = workspace_root(workspace_path)?;
    let command = string_arg(&tool_call.arguments, "cmd");
    if command.is_empty() {
        return Err("`cmd` is required for exec_command.".to_string());
    }

    let workdir = resolve_workspace_target(&root, &string_arg(&tool_call.arguments, "workdir"))?;
    if !workdir.is_dir() {
        return Err(format!(
            "Working directory is not a directory: {}",
            workdir.display()
        ));
    }

    let shell = shell_program(&string_arg(&tool_call.arguments, "shell"));
    let tty = bool_arg(&tool_call.arguments, "tty", false);
    let yield_time_ms = u64_arg(
        &tool_call.arguments,
        "yield_time_ms",
        DEFAULT_EXEC_YIELD_MS,
        MAX_EXEC_YIELD_MS,
    );
    let max_output_tokens = usize_arg(
        &tool_call.arguments,
        "max_output_tokens",
        DEFAULT_EXEC_MAX_OUTPUT_TOKENS,
        EXEC_OUTPUT_MAX_CHARS / 4,
    );

    Ok(PreparedExecCommand {
        command,
        workdir: normalize_display_path(&workdir),
        shell,
        tty,
        yield_time_ms,
        max_output_chars: max_output_tokens.saturating_mul(4),
    })
}

pub(crate) fn prepare_write_stdin_tool_call(
    tool_call: &RuntimeToolCall,
) -> Result<PreparedWriteStdin, String> {
    let session_id = tool_call
        .arguments
        .get("session_id")
        .and_then(Value::as_i64)
        .ok_or_else(|| "`session_id` is required for write_stdin.".to_string())?
        as i32;
    let yield_time_ms = u64_arg(
        &tool_call.arguments,
        "yield_time_ms",
        DEFAULT_EXEC_YIELD_MS,
        MAX_EXEC_YIELD_MS,
    );
    let max_output_tokens = usize_arg(
        &tool_call.arguments,
        "max_output_tokens",
        DEFAULT_EXEC_MAX_OUTPUT_TOKENS,
        EXEC_OUTPUT_MAX_CHARS / 4,
    );
    Ok(PreparedWriteStdin {
        session_id,
        chars: string_arg(&tool_call.arguments, "chars"),
        close_stdin: bool_arg(&tool_call.arguments, "close_stdin", false),
        yield_time_ms,
        max_output_chars: max_output_tokens.saturating_mul(4),
    })
}

async fn append_session_output(session: &Arc<ExecSession>, stream: ExecOutputStream, chunk: &[u8]) {
    if chunk.is_empty() {
        return;
    }
    let raw_text = String::from_utf8_lossy(chunk).to_string();
    let text = if session.tty_active {
        sanitize_tty_text(&raw_text)
    } else {
        raw_text
    };
    if text.is_empty() {
        return;
    }
    match stream {
        ExecOutputStream::Stdout => session.stdout.lock().await.push_str(&text),
        ExecOutputStream::Stderr => session.stderr.lock().await.push_str(&text),
    }
    session
        .events
        .lock()
        .await
        .push(ExecOutputEvent { stream, text });
    session.notify.notify_waiters();
}

async fn spawn_session_output_reader<R: AsyncRead + Unpin>(
    mut reader: R,
    session: Arc<ExecSession>,
    stream: ExecOutputStream,
) {
    let mut buffer = [0u8; 4096];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(count) => append_session_output(&session, stream, &buffer[..count]).await,
            Err(error) => {
                append_session_output(
                    &session,
                    ExecOutputStream::Stderr,
                    format!("\n[exec error] {error}\n").as_bytes(),
                )
                .await;
                break;
            }
        }
    }
    session.active_readers.fetch_sub(1, Ordering::Relaxed);
    maybe_mark_exec_session_done(&session);
}

async fn collect_session_output(
    session: &Arc<ExecSession>,
    yield_time_ms: u64,
    max_output_chars: usize,
) -> Value {
    let from_event_index = *session.delivered_event_count.lock().await;
    let result = collect_session_output_from_index(
        session,
        from_event_index,
        yield_time_ms,
        max_output_chars,
    )
    .await;
    let next_event_index = result
        .get("nextEventIndex")
        .and_then(Value::as_u64)
        .unwrap_or(from_event_index as u64) as usize;
    *session.delivered_event_count.lock().await = next_event_index;
    result
}

async fn collect_session_output_from_index(
    session: &Arc<ExecSession>,
    from_event_index: usize,
    yield_time_ms: u64,
    max_output_chars: usize,
) -> Value {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(yield_time_ms);
    loop {
        if session.done.load(Ordering::Relaxed) {
            break;
        }

        let now = tokio::time::Instant::now();
        if now >= deadline {
            break;
        }
        tokio::select! {
            _ = session.notify.notified() => {}
            _ = tokio::time::sleep_until(deadline) => break,
        }
    }

    let events = session.events.lock().await;
    let next_events = events
        .iter()
        .skip(from_event_index)
        .cloned()
        .collect::<Vec<_>>();
    let next_event_index = events.len();
    let exit_code = *session.exit_code.lock().await;
    let done = session.done.load(Ordering::Relaxed);
    drop(events);
    let stdout_full = session.stdout.lock().await.clone();
    let stderr_full = session.stderr.lock().await.clone();

    let merged_delta = next_events
        .iter()
        .map(|event| event.text.as_str())
        .collect::<String>();
    let stdout_delta = next_events
        .iter()
        .filter(|event| event.stream == ExecOutputStream::Stdout)
        .map(|event| event.text.as_str())
        .collect::<String>();
    let stderr_delta = next_events
        .iter()
        .filter(|event| event.stream == ExecOutputStream::Stderr)
        .map(|event| event.text.as_str())
        .collect::<String>();
    let full_output = format!("{stdout_full}{stderr_full}");
    let trimmed_output = preview_text(&merged_delta, max_output_chars);
    let session_id = if done { None } else { Some(session.session_id) };
    json!({
        "ok": exit_code.unwrap_or(0) == 0,
        "sessionId": session_id,
        "nextEventIndex": next_event_index,
        "output": trimmed_output,
        "stdout": preview_text(&stdout_delta, max_output_chars),
        "stderr": preview_text(&stderr_delta, max_output_chars),
        "outputFull": preview_text(&full_output, max_output_chars),
        "stdoutFull": preview_text(&stdout_full, max_output_chars),
        "stderrFull": preview_text(&stderr_full, max_output_chars),
        "tty": session.tty_active,
        "events": next_events
            .iter()
            .enumerate()
            .map(|(index, event)| {
                json!({
                    "eventIndex": from_event_index + index,
                    "stream": event.stream.as_str(),
                    "delta": event.text,
                    "deltaBase64": BASE64_STANDARD.encode(event.text.as_bytes()),
                    "capReached": false,
                })
            })
            .collect::<Vec<_>>(),
        "exitCode": exit_code,
        "done": done,
    })
}

pub(crate) async fn execute_prepared_exec_command(
    prepared: &PreparedExecCommand,
) -> Result<Value, String> {
    let (program, arguments, tty_active) = build_exec_invocation(prepared)?;
    let mut command = background_tokio_command(&program);
    command
        .args(arguments)
        .current_dir(&prepared.workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to execute command: {error}"))?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let session = Arc::new(ExecSession {
        session_id: next_exec_session_id(),
        stdin: Mutex::new(stdin),
        tty_active,
        stdout: Mutex::new(String::new()),
        stderr: Mutex::new(String::new()),
        events: Mutex::new(Vec::new()),
        delivered_event_count: Mutex::new(0),
        exit_code: Mutex::new(None),
        process_exited: AtomicBool::new(false),
        active_readers: AtomicI32::new(i32::from(stdout.is_some()) + i32::from(stderr.is_some())),
        done: AtomicBool::new(false),
        notify: Notify::new(),
    });

    if let Some(stdout) = stdout {
        tokio::spawn(spawn_session_output_reader(
            stdout,
            session.clone(),
            ExecOutputStream::Stdout,
        ));
    }
    if let Some(stderr) = stderr {
        tokio::spawn(spawn_session_output_reader(
            stderr,
            session.clone(),
            ExecOutputStream::Stderr,
        ));
    }

    let watcher = session.clone();
    tokio::spawn(async move {
        let exit_code = child.wait().await.ok().and_then(|status| status.code());
        let mut code = watcher.exit_code.lock().await;
        *code = exit_code;
        drop(code);
        watcher.process_exited.store(true, Ordering::Relaxed);
        maybe_mark_exec_session_done(&watcher);
    });

    exec_sessions()
        .lock()
        .await
        .insert(session.session_id, session.clone());

    let mut result =
        collect_session_output(&session, prepared.yield_time_ms, prepared.max_output_chars).await;
    result["command"] = Value::String(prepared.command.clone());
    result["workdir"] = Value::String(prepared.workdir.clone());
    result["shell"] = Value::String(prepared.shell.clone());
    result["ttyRequested"] = Value::Bool(prepared.tty);
    result["ttyActive"] = Value::Bool(tty_active);
    if result.get("done").and_then(Value::as_bool).unwrap_or(false) {
        exec_sessions().lock().await.remove(&session.session_id);
    }
    Ok(result)
}

pub(crate) async fn poll_exec_session_updates(
    session_id: i32,
    from_event_index: usize,
    yield_time_ms: u64,
    max_output_chars: usize,
) -> Result<Value, String> {
    let session = exec_sessions()
        .lock()
        .await
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("Exec session not found: {session_id}"))?;
    Ok(collect_session_output_from_index(
        &session,
        from_event_index,
        yield_time_ms,
        max_output_chars,
    )
    .await)
}

pub(crate) async fn execute_prepared_write_stdin(
    prepared: &PreparedWriteStdin,
) -> Result<Value, String> {
    let session = exec_sessions()
        .lock()
        .await
        .get(&prepared.session_id)
        .cloned()
        .ok_or_else(|| format!("Exec session not found: {}", prepared.session_id))?;

    if !prepared.chars.is_empty() {
        let mut stdin = session.stdin.lock().await;
        let handle = stdin
            .as_mut()
            .ok_or_else(|| "Exec session stdin is closed.".to_string())?;
        handle
            .write_all(prepared.chars.as_bytes())
            .await
            .map_err(|error| format!("Failed to write stdin: {error}"))?;
        handle
            .flush()
            .await
            .map_err(|error| format!("Failed to flush stdin: {error}"))?;
    }
    if prepared.close_stdin {
        session.stdin.lock().await.take();
    }

    let result =
        collect_session_output(&session, prepared.yield_time_ms, prepared.max_output_chars).await;
    if result.get("done").and_then(Value::as_bool).unwrap_or(false) {
        exec_sessions().lock().await.remove(&prepared.session_id);
    }
    Ok(json!({
        "sessionId": result.get("sessionId").cloned().unwrap_or(Value::Null),
        "output": result.get("output").cloned().unwrap_or(Value::String(String::new())),
        "stdout": result.get("stdout").cloned().unwrap_or(Value::String(String::new())),
        "stderr": result.get("stderr").cloned().unwrap_or(Value::String(String::new())),
        "tty": result.get("tty").cloned().unwrap_or(Value::Bool(false)),
        "events": result.get("events").cloned().unwrap_or(Value::Array(Vec::new())),
        "exitCode": result.get("exitCode").cloned().unwrap_or(Value::Null),
        "done": result.get("done").cloned().unwrap_or(Value::Bool(false)),
        "ok": result.get("ok").cloned().unwrap_or(Value::Bool(false)),
    }))
}

fn execute_read_file(workspace_path: &str, tool_call: &RuntimeToolCall) -> RuntimeToolResult {
    let root = match workspace_root(workspace_path) {
        Ok(root) => root,
        Err(error) => return err_result(&tool_call.id, READ_FILE_TOOL, error),
    };

    let requested_path = string_arg(&tool_call.arguments, "path");
    if requested_path.is_empty() {
        return err_result(&tool_call.id, READ_FILE_TOOL, "`path` is required.");
    }

    let target = match resolve_workspace_target(&root, &requested_path) {
        Ok(target) => target,
        Err(error) => return err_result(&tool_call.id, READ_FILE_TOOL, error),
    };
    if !target.is_file() {
        return err_result(
            &tool_call.id,
            READ_FILE_TOOL,
            format!("Target is not a file: {}", target.display()),
        );
    }

    let max_bytes = u64_arg(
        &tool_call.arguments,
        "max_bytes",
        DEFAULT_READ_MAX_BYTES,
        MAX_READ_BYTES,
    );
    match read_text_file_with_limit(&target, Some(max_bytes)) {
        Ok(content) => ok_result(
            &tool_call.id,
            json!({
                "path": relative_to_root(&root, &target),
                "content": content,
            }),
        ),
        Err(error) => err_result(&tool_call.id, READ_FILE_TOOL, error),
    }
}

fn execute_list_files(workspace_path: &str, tool_call: &RuntimeToolCall) -> RuntimeToolResult {
    let root = match workspace_root(workspace_path) {
        Ok(root) => root,
        Err(error) => return err_result(&tool_call.id, LIST_FILES_TOOL, error),
    };

    let target = match resolve_workspace_target(&root, &string_arg(&tool_call.arguments, "path")) {
        Ok(target) => target,
        Err(error) => return err_result(&tool_call.id, LIST_FILES_TOOL, error),
    };
    if !target.is_dir() {
        return err_result(
            &tool_call.id,
            LIST_FILES_TOOL,
            format!("Target is not a directory: {}", target.display()),
        );
    }

    let recursive = bool_arg(&tool_call.arguments, "recursive", true);
    let max_results = usize_arg(
        &tool_call.arguments,
        "max_results",
        DEFAULT_LIST_MAX_RESULTS,
        MAX_LIST_RESULTS,
    );

    let mut entries = Vec::new();
    let mut truncated = false;
    match collect_list_entries(
        &root,
        &target,
        recursive,
        max_results,
        &mut entries,
        &mut truncated,
    ) {
        Ok(()) => ok_result(
            &tool_call.id,
            json!({
                "path": relative_to_root(&root, &target),
                "entries": entries,
                "truncated": truncated,
            }),
        ),
        Err(error) => err_result(&tool_call.id, LIST_FILES_TOOL, error),
    }
}

fn execute_search_files(workspace_path: &str, tool_call: &RuntimeToolCall) -> RuntimeToolResult {
    let root = match workspace_root(workspace_path) {
        Ok(root) => root,
        Err(error) => return err_result(&tool_call.id, SEARCH_FILES_TOOL, error),
    };

    let query = string_arg(&tool_call.arguments, "query");
    if query.is_empty() {
        return err_result(&tool_call.id, SEARCH_FILES_TOOL, "`query` is required.");
    }

    let target = match resolve_workspace_target(&root, &string_arg(&tool_call.arguments, "path")) {
        Ok(target) => target,
        Err(error) => return err_result(&tool_call.id, SEARCH_FILES_TOOL, error),
    };

    let max_results = usize_arg(
        &tool_call.arguments,
        "max_results",
        DEFAULT_SEARCH_MAX_RESULTS,
        MAX_SEARCH_RESULTS,
    );
    let case_sensitive = bool_arg(&tool_call.arguments, "case_sensitive", false);
    let query_cmp = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    let files = if target.is_file() {
        vec![file_entry_from_path(&target)]
    } else if target.is_dir() {
        let mut files = Vec::new();
        if let Err(error) = collect_files_recursive(&target, &mut files) {
            return err_result(&tool_call.id, SEARCH_FILES_TOOL, error);
        }
        files
    } else {
        return err_result(
            &tool_call.id,
            SEARCH_FILES_TOOL,
            format!("Search target does not exist: {}", target.display()),
        );
    };

    let mut matches = Vec::new();
    let mut truncated = false;
    for file in files {
        if matches.len() >= max_results {
            truncated = true;
            break;
        }

        let path = PathBuf::from(&file.path);
        let Ok(content) = read_text_file_with_limit(&path, Some(SEARCH_FILE_MAX_BYTES)) else {
            continue;
        };

        for (index, line) in content.lines().enumerate() {
            let comparable = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if !comparable.contains(&query_cmp) {
                continue;
            }

            matches.push(json!({
                "path": relative_to_root(&root, &path),
                "line": index + 1,
                "text": line,
            }));
            if matches.len() >= max_results {
                truncated = true;
                break;
            }
        }
    }

    ok_result(
        &tool_call.id,
        json!({
            "query": query,
            "path": relative_to_root(&root, &target),
            "matches": matches,
            "truncated": truncated,
        }),
    )
}

pub(crate) fn is_apply_patch_tool_call(tool_call: &RuntimeToolCall) -> bool {
    tool_call.name.trim() == APPLY_PATCH_TOOL
}

pub(crate) fn is_exec_command_tool_call(tool_call: &RuntimeToolCall) -> bool {
    tool_call.name.trim() == EXEC_COMMAND_TOOL
}

pub(crate) fn is_write_stdin_tool_call(tool_call: &RuntimeToolCall) -> bool {
    tool_call.name.trim() == WRITE_STDIN_TOOL
}

pub(crate) fn prepare_apply_patch_tool_call(
    workspace_path: &str,
    tool_call: &RuntimeToolCall,
) -> Result<PreparedApplyPatch, String> {
    let input = string_arg(&tool_call.arguments, "input");
    if input.is_empty() {
        return Err("`input` is required for apply_patch.".to_string());
    }
    resolve_apply_patch(workspace_path, &input)
}

pub(crate) fn execute_runtime_tool_call_with_context(
    workspace_path: &str,
    tool_call: &RuntimeToolCall,
    _context_bundle: &Value,
    _support_files: &[Value],
) -> RuntimeToolResult {
    match tool_call.name.trim() {
        READ_FILE_TOOL => execute_read_file(workspace_path, tool_call),
        LIST_FILES_TOOL => execute_list_files(workspace_path, tool_call),
        SEARCH_FILES_TOOL => execute_search_files(workspace_path, tool_call),
        APPLY_PATCH_TOOL => err_result(
            &tool_call.id,
            APPLY_PATCH_TOOL,
            "apply_patch requires runtime-managed approval.",
        ),
        EXEC_COMMAND_TOOL => err_result(
            &tool_call.id,
            EXEC_COMMAND_TOOL,
            "exec_command requires runtime-managed approval.",
        ),
        WRITE_STDIN_TOOL => err_result(
            &tool_call.id,
            WRITE_STDIN_TOOL,
            "write_stdin requires a live exec session.",
        ),
        other => err_result(
            &tool_call.id,
            other,
            format!("Unsupported runtime tool: {other}"),
        ),
    }
}

pub fn resolve_runtime_tool_definitions_with_context(
    workspace_path: &str,
    _enabled_tool_ids: &[String],
    _requested_tool_mentions: &[String],
    _context_bundle: &Value,
    _support_files: &[Value],
) -> Vec<RuntimeToolDefinition> {
    if workspace_path.trim().is_empty() {
        return Vec::new();
    }

    vec![
        RuntimeToolDefinition {
            name: READ_FILE_TOOL,
            description: "Read a UTF-8 text file from the current workspace.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Relative path to the file inside the current workspace."
                    },
                    "max_bytes": {
                        "type": "integer",
                        "description": "Maximum file size to read in bytes. Defaults to 65536."
                    }
                },
                "required": ["path"],
                "additionalProperties": false
            }),
        },
        RuntimeToolDefinition {
            name: LIST_FILES_TOOL,
            description: "List files and directories inside the current workspace.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Optional relative directory path inside the current workspace."
                    },
                    "recursive": {
                        "type": "boolean",
                        "description": "Whether to walk subdirectories recursively. Defaults to true."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of returned entries. Defaults to 200."
                    }
                },
                "additionalProperties": false
            }),
        },
        RuntimeToolDefinition {
            name: SEARCH_FILES_TOOL,
            description: "Search text content in UTF-8 workspace files and return matching lines.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search text to match."
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional relative file or directory path inside the current workspace."
                    },
                    "case_sensitive": {
                        "type": "boolean",
                        "description": "Whether the search should be case-sensitive. Defaults to false."
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of returned matches. Defaults to 100."
                    }
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        },
        RuntimeToolDefinition {
            name: APPLY_PATCH_TOOL,
            description: "Apply a structured multi-file patch inside the current workspace.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "input": {
                        "type": "string",
                        "description": "Patch body using the *** Begin Patch / *** End Patch format."
                    }
                },
                "required": ["input"],
                "additionalProperties": false
            }),
        },
        RuntimeToolDefinition {
            name: EXEC_COMMAND_TOOL,
            description: "Execute a shell command in the current workspace after approval.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "cmd": {
                        "type": "string",
                        "description": "Shell command to execute."
                    },
                    "workdir": {
                        "type": "string",
                        "description": "Optional relative working directory inside the current workspace."
                    },
                    "shell": {
                        "type": "string",
                        "description": "Optional shell binary override."
                    },
                    "tty": {
                        "type": "boolean",
                        "description": "Enable PTY mode. On Unix this uses a pseudo-terminal session."
                    },
                    "yield_time_ms": {
                        "type": "integer",
                        "description": "How long to wait for output before returning. Defaults to 1000."
                    },
                    "max_output_tokens": {
                        "type": "integer",
                        "description": "Maximum output tokens to return. Defaults to 2000."
                    }
                },
                "required": ["cmd"],
                "additionalProperties": false
            }),
        },
        RuntimeToolDefinition {
            name: WRITE_STDIN_TOOL,
            description: "Write to an existing exec session or poll for more output.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "integer",
                        "description": "Identifier of the running exec session."
                    },
                    "chars": {
                        "type": "string",
                        "description": "Optional bytes to write to stdin. May be empty to poll."
                    },
                    "close_stdin": {
                        "type": "boolean",
                        "description": "Close stdin after writing optional chars."
                    },
                    "yield_time_ms": {
                        "type": "integer",
                        "description": "How long to wait for output before returning. Defaults to 1000."
                    },
                    "max_output_tokens": {
                        "type": "integer",
                        "description": "Maximum output tokens to return. Defaults to 2000."
                    }
                },
                "required": ["session_id"],
                "additionalProperties": false
            }),
        },
    ]
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn execute_runtime_tool_calls(
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
) -> Vec<RuntimeToolResult> {
    execute_runtime_tool_calls_with_context(workspace_path, tool_calls, &Value::Null, &[])
}

pub fn execute_runtime_tool_calls_with_context(
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
    context_bundle: &Value,
    support_files: &[Value],
) -> Vec<RuntimeToolResult> {
    tool_calls
        .iter()
        .map(|tool_call| {
            execute_runtime_tool_call_with_context(
                workspace_path,
                tool_call,
                context_bundle,
                support_files,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let unique = format!(
            "scribeflow-tools-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        fs::create_dir_all(&root).expect("create temp workspace");
        root
    }

    #[test]
    fn read_file_tool_returns_file_content() {
        let root = temp_workspace();
        let file_path = root.join("note.txt");
        fs::write(&file_path, "hello tools").expect("write file");

        let result = execute_runtime_tool_calls(
            &normalize_display_path(&root),
            &[RuntimeToolCall {
                id: "call_1".to_string(),
                name: READ_FILE_TOOL.to_string(),
                arguments: json!({ "path": "note.txt" }),
            }],
        );

        assert_eq!(result.len(), 1);
        assert!(!result[0].is_error);
        assert!(result[0].content.contains("hello tools"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_files_tool_returns_workspace_entries() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("docs")).expect("create docs dir");
        fs::write(root.join("docs").join("a.md"), "# A").expect("write nested file");

        let result = execute_runtime_tool_calls(
            &normalize_display_path(&root),
            &[RuntimeToolCall {
                id: "call_2".to_string(),
                name: LIST_FILES_TOOL.to_string(),
                arguments: json!({ "path": ".", "recursive": true }),
            }],
        );

        assert_eq!(result.len(), 1);
        assert!(!result[0].is_error);
        assert!(result[0].content.contains("\"docs\""));
        assert!(result[0].content.contains("docs/a.md"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn search_files_tool_returns_matching_lines() {
        let root = temp_workspace();
        fs::write(root.join("paper.md"), "alpha\nbeta keyword\ngamma\n").expect("write file");

        let result = execute_runtime_tool_calls(
            &normalize_display_path(&root),
            &[RuntimeToolCall {
                id: "call_3".to_string(),
                name: SEARCH_FILES_TOOL.to_string(),
                arguments: json!({ "query": "keyword" }),
            }],
        );

        assert_eq!(result.len(), 1);
        assert!(!result[0].is_error);
        assert!(result[0].content.contains("\"line\": 2"));
        assert!(result[0].content.contains("beta keyword"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_patch_can_update_existing_file() {
        let root = temp_workspace();
        let file_path = root.join("note.txt");
        fs::write(&file_path, "alpha\nbeta\n").expect("write file");

        let prepared = prepare_apply_patch_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_4".to_string(),
                name: APPLY_PATCH_TOOL.to_string(),
                arguments: json!({
                    "input": "*** Begin Patch\n*** Update File: note.txt\n@@\n alpha\n-beta\n+gamma\n*** End Patch"
                }),
            },
        )
        .expect("prepare patch");

        let result =
            execute_prepared_apply_patch(&normalize_display_path(&root), &prepared).expect("apply");
        assert_eq!(result["ok"], Value::Bool(true));
        assert_eq!(
            fs::read_to_string(&file_path).expect("read"),
            "alpha\ngamma\n"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn apply_patch_can_add_and_delete_files() {
        let root = temp_workspace();
        fs::write(root.join("obsolete.txt"), "remove me").expect("write old file");

        let add = prepare_apply_patch_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_5".to_string(),
                name: APPLY_PATCH_TOOL.to_string(),
                arguments: json!({
                    "input": "*** Begin Patch\n*** Add File: fresh.txt\n+hello\n*** Delete File: obsolete.txt\n*** End Patch"
                }),
            },
        )
        .expect("prepare patch");

        execute_prepared_apply_patch(&normalize_display_path(&root), &add).expect("apply");
        assert_eq!(
            fs::read_to_string(root.join("fresh.txt")).expect("read"),
            "hello"
        );
        assert!(!root.join("obsolete.txt").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prepare_exec_command_resolves_workspace_workdir() {
        let root = temp_workspace();
        fs::create_dir_all(root.join("scripts")).expect("create dir");

        let prepared = prepare_exec_command_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_6".to_string(),
                name: EXEC_COMMAND_TOOL.to_string(),
                arguments: json!({
                    "cmd": "echo hi",
                    "workdir": "scripts",
                }),
            },
        )
        .expect("prepare exec");

        assert_eq!(prepared.command, "echo hi");
        assert!(prepared.workdir.ends_with("/scripts") || prepared.workdir.ends_with("\\scripts"));
        assert!(!prepared.tty);

        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn exec_command_runs_shell_command() {
        let root = temp_workspace();

        let prepared = prepare_exec_command_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_7".to_string(),
                name: EXEC_COMMAND_TOOL.to_string(),
                arguments: json!({
                    "cmd": if cfg!(windows) { "Write-Output hello" } else { "printf hello" },
                    "yield_time_ms": 500,
                }),
            },
        )
        .expect("prepare exec");

        let result = execute_prepared_exec_command(&prepared)
            .await
            .expect("exec command");

        assert_eq!(result["ok"], Value::Bool(true));
        assert!(result["output"]
            .as_str()
            .unwrap_or_default()
            .contains("hello"));
        assert!(result["stdout"]
            .as_str()
            .unwrap_or_default()
            .contains("hello"));
        assert_eq!(result["stderr"], Value::String(String::new()));

        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn exec_command_returns_split_stream_events() {
        let root = temp_workspace();
        let prepared = prepare_exec_command_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_7b".to_string(),
                name: EXEC_COMMAND_TOOL.to_string(),
                arguments: json!({
                    "cmd": if cfg!(windows) {
                        "Write-Output out; [Console]::Error.Write('err')"
                    } else {
                        "printf out; printf err >&2"
                    },
                    "yield_time_ms": 500,
                }),
            },
        )
        .expect("prepare exec");

        let result = execute_prepared_exec_command(&prepared)
            .await
            .expect("exec command");

        let events = result["events"].as_array().cloned().unwrap_or_default();
        assert!(!events.is_empty());
        assert!(result["stdout"]
            .as_str()
            .unwrap_or_default()
            .contains("out"));
        assert!(result["stderr"]
            .as_str()
            .unwrap_or_default()
            .contains("err"));
        assert!(events
            .iter()
            .any(|event| event["stream"] == Value::String("stdout".to_string())));
        assert!(events
            .iter()
            .any(|event| event["stream"] == Value::String("stderr".to_string())));

        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn exec_command_can_resume_with_write_stdin_poll() {
        let root = temp_workspace();
        let prepared = prepare_exec_command_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_8".to_string(),
                name: EXEC_COMMAND_TOOL.to_string(),
                arguments: json!({
                    "cmd": if cfg!(windows) {
                        "Write-Output hello; Start-Sleep -Milliseconds 300; Write-Output world"
                    } else {
                        "printf hello; sleep 0.3; printf world"
                    },
                    "yield_time_ms": 50,
                }),
            },
        )
        .expect("prepare exec");

        let first = execute_prepared_exec_command(&prepared)
            .await
            .expect("start session");
        let session_id = first
            .get("sessionId")
            .and_then(Value::as_i64)
            .expect("session id") as i32;
        assert!(first["output"]
            .as_str()
            .unwrap_or_default()
            .contains("hello"));

        let follow_up = execute_prepared_write_stdin(&PreparedWriteStdin {
            session_id,
            chars: String::new(),
            close_stdin: false,
            yield_time_ms: 600,
            max_output_chars: EXEC_OUTPUT_MAX_CHARS,
        })
        .await
        .expect("poll session");

        assert!(follow_up["output"]
            .as_str()
            .unwrap_or_default()
            .contains("world"));
        if follow_up["done"] != Value::Bool(true) {
            let final_poll = execute_prepared_write_stdin(&PreparedWriteStdin {
                session_id,
                chars: String::new(),
                close_stdin: false,
                yield_time_ms: 300,
                max_output_chars: EXEC_OUTPUT_MAX_CHARS,
            })
            .await
            .expect("final poll");
            assert_eq!(final_poll["done"], Value::Bool(true));
        }

        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn exec_command_supports_tty_mode() {
        let root = temp_workspace();
        let prepared = prepare_exec_command_tool_call(
            &normalize_display_path(&root),
            &RuntimeToolCall {
                id: "call_8b".to_string(),
                name: EXEC_COMMAND_TOOL.to_string(),
                arguments: json!({
                    "cmd": "printf hello",
                    "tty": true,
                    "yield_time_ms": 500,
                }),
            },
        )
        .expect("prepare tty exec");

        let result = execute_prepared_exec_command(&prepared)
            .await
            .expect("exec tty command");

        assert_eq!(result["ttyRequested"], Value::Bool(true));
        assert_eq!(result["ttyActive"], Value::Bool(true));
        assert_eq!(result["tty"], Value::Bool(true));
        assert!(result["output"]
            .as_str()
            .unwrap_or_default()
            .contains("hello"));

        let _ = fs::remove_dir_all(root);
    }
}
