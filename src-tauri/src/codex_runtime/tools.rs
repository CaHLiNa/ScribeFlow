use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{collect_files_recursive, read_dir_shallow_entries, FileEntry};
use crate::security::canonicalize_for_scope;

const READ_FILE_TOOL: &str = "read_file";
const LIST_FILES_TOOL: &str = "list_files";
const SEARCH_FILES_TOOL: &str = "search_files";
pub(crate) const APPLY_PATCH_TOOL: &str = "apply_patch";

const DEFAULT_READ_MAX_BYTES: u64 = 64 * 1024;
const MAX_READ_BYTES: u64 = 256 * 1024;
const DEFAULT_LIST_MAX_RESULTS: usize = 200;
const MAX_LIST_RESULTS: usize = 1000;
const DEFAULT_SEARCH_MAX_RESULTS: usize = 100;
const MAX_SEARCH_RESULTS: usize = 500;
const SEARCH_FILE_MAX_BYTES: u64 = 256 * 1024;
const APPLY_PATCH_PREVIEW_MAX_CHARS: usize = 1200;

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

fn workspace_root(workspace_path: &str) -> Result<PathBuf, String> {
    let trimmed = workspace_path.trim();
    if trimmed.is_empty() {
        return Err("No active workspace path is available.".to_string());
    }
    let root = canonicalize_for_scope(Path::new(trimmed))?;
    if !root.is_dir() {
        return Err(format!("Workspace root is not a directory: {}", root.display()));
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

fn err_result(tool_call_id: &str, tool_name: &str, message: impl Into<String>) -> RuntimeToolResult {
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
        trimmed.chars().take(max_chars).collect::<String>().trim_end()
    )
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

fn resolve_apply_patch(
    workspace_path: &str,
    input: &str,
) -> Result<PreparedApplyPatch, String> {
    let root = workspace_root(workspace_path)?;
    let parsed = parse_apply_patch_input(input)?;
    let mut operations = Vec::new();
    let mut files = Vec::new();

    for operation in parsed {
        match operation {
            ParsedPatchOp::Add { path, content_lines } => {
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
    match collect_list_entries(&root, &target, recursive, max_results, &mut entries, &mut truncated)
    {
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
        assert_eq!(fs::read_to_string(&file_path).expect("read"), "alpha\ngamma\n");

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
        assert_eq!(fs::read_to_string(root.join("fresh.txt")).expect("read"), "hello");
        assert!(!root.join("obsolete.txt").exists());

        let _ = fs::remove_dir_all(root);
    }
}
