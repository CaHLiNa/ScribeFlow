use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{collect_files_recursive, read_dir_shallow_entries};
use crate::security::canonicalize_for_scope;

const READ_FILE_TOOL: &str = "read_file";
const LIST_FILES_TOOL: &str = "list_files";
const SEARCH_FILES_TOOL: &str = "search_files";

const DEFAULT_READ_MAX_BYTES: u64 = 64 * 1024;
const MAX_READ_BYTES: u64 = 256 * 1024;
const DEFAULT_LIST_MAX_RESULTS: usize = 200;
const MAX_LIST_RESULTS: usize = 1000;
const DEFAULT_SEARCH_MAX_RESULTS: usize = 100;
const MAX_SEARCH_RESULTS: usize = 500;
const SEARCH_FILE_MAX_BYTES: u64 = 256 * 1024;

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
        let item = json!({
            "path": relative_to_root(root, &path),
            "kind": if entry.is_dir { "dir" } else { "file" },
            "modified": entry.modified,
        });
        entries.push(item);

        if recursive && entry.is_dir {
            collect_list_entries(root, &path, recursive, limit, entries, truncated)?;
            if *truncated {
                return Ok(());
            }
        }
    }
    Ok(())
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
        vec![crate::fs_tree::FileEntry {
            name: target
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            path: normalize_display_path(&target),
            is_dir: false,
            children: None,
            modified: None,
        }]
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
    ]
}

pub fn execute_runtime_tool_calls(
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
) -> Vec<RuntimeToolResult> {
    execute_runtime_tool_calls_with_context(workspace_path, tool_calls, &Value::Null, &[])
}

pub fn execute_runtime_tool_calls_with_context(
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
    _context_bundle: &Value,
    _support_files: &[Value],
) -> Vec<RuntimeToolResult> {
    tool_calls
        .iter()
        .map(|tool_call| match tool_call.name.trim() {
            READ_FILE_TOOL => execute_read_file(workspace_path, tool_call),
            LIST_FILES_TOOL => execute_list_files(workspace_path, tool_call),
            SEARCH_FILES_TOOL => execute_search_files(workspace_path, tool_call),
            other => err_result(
                &tool_call.id,
                other,
                format!("Unsupported runtime tool: {other}"),
            ),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
}
