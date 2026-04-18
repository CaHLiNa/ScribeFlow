use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_io::read_text_file_with_limit;
use crate::fs_tree::{collect_files_recursive, read_dir_shallow_entries};

const DEFAULT_LIST_RESULTS: usize = 200;
const DEFAULT_SEARCH_RESULTS: usize = 40;
const DEFAULT_READ_MAX_BYTES: u64 = 64 * 1024;

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

fn context_available(kind: &str, context_bundle: &Value) -> bool {
    context_bundle
        .get(kind)
        .and_then(|value| value.get("available"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn clamp_results(value: Option<u64>, fallback: usize) -> usize {
    let normalized = value.unwrap_or(fallback as u64);
    normalized.clamp(1, 500) as usize
}

fn normalize_workspace_root(workspace_path: &str) -> Result<PathBuf, String> {
    let trimmed = workspace_path.trim();
    if trimmed.is_empty() {
        return Err("No workspace is currently open.".to_string());
    }
    let root = PathBuf::from(trimmed);
    if !root.exists() || !root.is_dir() {
        return Err("Workspace path is unavailable.".to_string());
    }
    root.canonicalize()
        .map_err(|error| format!("Failed to resolve workspace path: {error}"))
}

fn resolve_workspace_target(
    workspace_root: &Path,
    input_path: &str,
    allow_root: bool,
) -> Result<PathBuf, String> {
    let raw = input_path.trim();
    if raw.is_empty() {
        if allow_root {
            return Ok(workspace_root.to_path_buf());
        }
        return Err("A workspace path is required.".to_string());
    }

    let candidate = if Path::new(raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        workspace_root.join(raw)
    };

    let normalized = normalize_candidate_path(workspace_root, &candidate, allow_root)?;
    if normalized == workspace_root && !allow_root {
        return Err("A workspace path is required.".to_string());
    }
    Ok(normalized)
}

fn normalize_candidate_path(
    workspace_root: &Path,
    candidate: &Path,
    allow_root: bool,
) -> Result<PathBuf, String> {
    let workspace_components = workspace_root.components().collect::<Vec<_>>();
    let mut normalized = if candidate.is_absolute() {
        candidate
            .components()
            .take(workspace_components.len())
            .collect::<PathBuf>()
    } else {
        workspace_root.to_path_buf()
    };

    for component in candidate.components() {
        use std::path::Component;
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Path::new(std::path::MAIN_SEPARATOR_STR)),
            Component::CurDir => {}
            Component::ParentDir => {
                if normalized == workspace_root {
                    return Err(
                        "Requested path must stay inside the current workspace.".to_string()
                    );
                }
                normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
        }
    }

    if !normalized.starts_with(workspace_root) {
        return Err("Requested path must stay inside the current workspace.".to_string());
    }
    if normalized == workspace_root && !allow_root {
        return Err("A workspace path is required.".to_string());
    }
    Ok(normalized)
}

fn to_relative_path(workspace_root: &Path, target: &Path) -> String {
    if target == workspace_root {
        return ".".to_string();
    }
    target
        .strip_prefix(workspace_root)
        .ok()
        .map(|value| value.to_string_lossy().trim_start_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| target.to_string_lossy().to_string())
}

fn score_match(query: &str, relative_path: &str) -> Option<usize> {
    let normalized_query = query.trim().to_lowercase();
    let normalized_path = relative_path.trim().to_lowercase();
    let basename = Path::new(&normalized_path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();

    if normalized_query.is_empty() {
        return None;
    }
    if basename == normalized_query {
        return Some(0);
    }
    if basename.starts_with(&normalized_query) {
        return Some(1);
    }
    if normalized_path == normalized_query {
        return Some(2);
    }
    if normalized_path.starts_with(&normalized_query) {
        return Some(3);
    }
    if basename.contains(&normalized_query) {
        return Some(4);
    }
    if normalized_path.contains(&normalized_query) {
        return Some(5);
    }
    None
}

pub fn resolve_runtime_tool_definitions(enabled_tool_ids: &[String]) -> Vec<RuntimeToolDefinition> {
    resolve_runtime_tool_definitions_with_context(enabled_tool_ids, &Value::Null, &[])
}

pub fn resolve_runtime_tool_definitions_with_context(
    enabled_tool_ids: &[String],
    context_bundle: &Value,
    support_files: &[Value],
) -> Vec<RuntimeToolDefinition> {
    let enabled = enabled_tool_ids
        .iter()
        .map(|value| value.trim().to_string())
        .collect::<Vec<_>>();

    let mut tools = Vec::new();
    let register = |tools: &mut Vec<RuntimeToolDefinition>,
                    id: &'static str,
                    definition: RuntimeToolDefinition| {
        if enabled.iter().any(|value| value == id) {
            tools.push(definition);
        }
    };

    register(
        &mut tools,
        "list-workspace-directory",
        RuntimeToolDefinition {
            name: "list_workspace_directory",
            description: "List immediate files and folders inside a workspace directory.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "maxResults": { "type": "number" }
                },
                "required": []
            }),
        },
    );
    register(
        &mut tools,
        "search-workspace-files",
        RuntimeToolDefinition {
            name: "search_workspace_files",
            description: "Search workspace files by path or filename.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "directoryPath": { "type": "string" },
                    "maxResults": { "type": "number" }
                },
                "required": ["query"]
            }),
        },
    );
    register(
        &mut tools,
        "read-workspace-file",
        RuntimeToolDefinition {
            name: "read_workspace_file",
            description: "Read any text file from the current workspace.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "maxBytes": { "type": "number" }
                },
                "required": ["path"]
            }),
        },
    );
    if context_available("document", context_bundle) {
        register(
            &mut tools,
            "read-active-document",
            RuntimeToolDefinition {
                name: "read_active_document",
                description: "Read the active document metadata and current text content.",
                parameters: json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }),
            },
        );
    }
    if context_available("selection", context_bundle) {
        register(
            &mut tools,
            "read-editor-selection",
            RuntimeToolDefinition {
                name: "read_editor_selection",
                description: "Read the active editor selection and its source position.",
                parameters: json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }),
            },
        );
    }
    if context_available("reference", context_bundle) {
        register(
            &mut tools,
            "read-selected-reference",
            RuntimeToolDefinition {
                name: "read_selected_reference",
                description: "Read the currently selected reference metadata.",
                parameters: json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }),
            },
        );
    }
    register(
        &mut tools,
        "create-workspace-file",
        RuntimeToolDefinition {
            name: "create_workspace_file",
            description: "Create a new text file inside the workspace and open it in the editor.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path"]
            }),
        },
    );
    register(
        &mut tools,
        "write-workspace-file",
        RuntimeToolDefinition {
            name: "write_workspace_file",
            description:
                "Write text content to a workspace file and optionally open it in the editor.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "openAfterWrite": { "type": "boolean" }
                },
                "required": ["path", "content"]
            }),
        },
    );
    register(
        &mut tools,
        "open-workspace-file",
        RuntimeToolDefinition {
            name: "open_workspace_file",
            description: "Open an existing workspace file in the editor.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        },
    );
    register(
        &mut tools,
        "delete-workspace-path",
        RuntimeToolDefinition {
            name: "delete_workspace_path",
            description: "Delete a file or folder inside the workspace.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        },
    );
    if !support_files.is_empty() {
        register(
            &mut tools,
            "load-skill-support-files",
            RuntimeToolDefinition {
                name: "load_skill_support_files",
                description:
                    "Read text support files that belong to the active instruction-pack directory.",
                parameters: json!({
                    "type": "object",
                    "properties": {},
                    "required": []
                }),
            },
        );
    }

    tools
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
    context_bundle: &Value,
    support_files: &[Value],
) -> Vec<RuntimeToolResult> {
    tool_calls
        .iter()
        .map(|tool_call| {
            match execute_runtime_tool_call(
                workspace_path,
                tool_call,
                context_bundle,
                support_files,
            ) {
                Ok(content) => RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content,
                    is_error: false,
                },
                Err(error) => RuntimeToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: error,
                    is_error: true,
                },
            }
        })
        .collect()
}

fn execute_runtime_tool_call(
    workspace_path: &str,
    tool_call: &RuntimeToolCall,
    context_bundle: &Value,
    support_files: &[Value],
) -> Result<String, String> {
    let workspace_root = normalize_workspace_root(workspace_path).ok();

    let content = match tool_call.name.as_str() {
        "list_workspace_directory" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let max_results = tool_call
                .arguments
                .get("maxResults")
                .and_then(|value| value.as_u64());
            let directory = resolve_workspace_target(&workspace_root, path, true)?;
            let entries = read_dir_shallow_entries(&directory)?;
            let result = entries
                .into_iter()
                .map(|entry| {
                    json!({
                        "name": entry.name,
                        "path": entry.path,
                        "relativePath": to_relative_path(&workspace_root, Path::new(&entry.path)),
                        "kind": if entry.is_dir { "directory" } else { "file" },
                    })
                })
                .take(clamp_results(max_results, DEFAULT_LIST_RESULTS))
                .collect::<Vec<_>>();
            json!({
                "path": directory.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &directory),
                "entries": result,
            })
        }
        "search_workspace_files" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let query = tool_call
                .arguments
                .get("query")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .trim()
                .to_string();
            if query.is_empty() {
                return Err("A search query is required.".to_string());
            }
            let directory_path = tool_call
                .arguments
                .get("directoryPath")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let max_results = tool_call
                .arguments
                .get("maxResults")
                .and_then(|value| value.as_u64());
            let scope = if directory_path.trim().is_empty() {
                workspace_root.clone()
            } else {
                resolve_workspace_target(&workspace_root, directory_path, true)?
            };
            let mut files = Vec::new();
            collect_files_recursive(&scope, &mut files)?;
            let mut matches = files
                .into_iter()
                .filter_map(|entry| {
                    let relative_path = to_relative_path(&workspace_root, Path::new(&entry.path));
                    score_match(&query, &relative_path).map(|score| {
                        (
                            score,
                            json!({
                                "name": entry.name,
                                "path": entry.path,
                                "relativePath": relative_path,
                            }),
                        )
                    })
                })
                .collect::<Vec<_>>();
            matches.sort_by(|left, right| {
                left.0.cmp(&right.0).then_with(|| {
                    left.1["relativePath"]
                        .as_str()
                        .cmp(&right.1["relativePath"].as_str())
                })
            });
            json!({
                "query": query,
                "directoryPath": scope.to_string_lossy().to_string(),
                "relativeDirectoryPath": to_relative_path(&workspace_root, &scope),
                "matches": matches
                    .into_iter()
                    .take(clamp_results(max_results, DEFAULT_SEARCH_RESULTS))
                    .map(|(_, entry)| entry)
                    .collect::<Vec<_>>(),
            })
        }
        "read_workspace_file" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let max_bytes = tool_call
                .arguments
                .get("maxBytes")
                .and_then(|value| value.as_u64())
                .unwrap_or(DEFAULT_READ_MAX_BYTES);
            let target = resolve_workspace_target(&workspace_root, path, false)?;
            let content = read_text_file_with_limit(&target, Some(max_bytes))?;
            json!({
                "path": target.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &target),
                "name": target.file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_default(),
                "available": true,
                "content": content,
            })
        }
        "read_active_document" => {
            let document = context_bundle
                .get("document")
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "available": context_available("document", context_bundle),
                "filePath": document.get("filePath").cloned().unwrap_or(Value::String(String::new())),
                "label": document.get("label").cloned().unwrap_or(Value::String(String::new())),
                "extension": document.get("extension").cloned().unwrap_or(Value::String(String::new())),
                "isMarkdown": document.get("isMarkdown").cloned().unwrap_or(Value::Bool(false)),
                "isLatex": document.get("isLatex").cloned().unwrap_or(Value::Bool(false)),
            })
        }
        "read_editor_selection" => {
            let selection = context_bundle
                .get("selection")
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "available": context_available("selection", context_bundle),
                "filePath": selection.get("filePath").cloned().unwrap_or(Value::String(String::new())),
                "from": selection.get("from").cloned().unwrap_or(Value::Null),
                "to": selection.get("to").cloned().unwrap_or(Value::Null),
                "text": selection.get("text").cloned().unwrap_or(Value::String(String::new())),
                "preview": selection.get("preview").cloned().unwrap_or(Value::String(String::new())),
                "hasSelection": selection.get("hasSelection").cloned().unwrap_or(Value::Bool(false)),
            })
        }
        "read_selected_reference" => {
            let reference = context_bundle
                .get("reference")
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "available": context_available("reference", context_bundle),
                "id": reference.get("id").cloned().unwrap_or(Value::String(String::new())),
                "title": reference.get("title").cloned().unwrap_or(Value::String(String::new())),
                "citationKey": reference.get("citationKey").cloned().unwrap_or(Value::String(String::new())),
                "year": reference.get("year").cloned().unwrap_or(Value::String(String::new())),
                "authorLine": reference.get("authorLine").cloned().unwrap_or(Value::String(String::new())),
            })
        }
        "create_workspace_file" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let content = tool_call
                .arguments
                .get("content")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_workspace_target(&workspace_root, path, false)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create directory: {error}"))?;
            }
            if target.exists() {
                return Err("File already exists.".to_string());
            }
            fs::write(&target, content)
                .map_err(|error| format!("Failed to create file: {error}"))?;
            json!({
                "path": target.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &target),
                "name": target.file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_default(),
                "created": true,
                "opened": true,
            })
        }
        "write_workspace_file" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let content = tool_call
                .arguments
                .get("content")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let open_after_write = tool_call
                .arguments
                .get("openAfterWrite")
                .and_then(|value| value.as_bool())
                .unwrap_or(false);
            let target = resolve_workspace_target(&workspace_root, path, false)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("Failed to create directory: {error}"))?;
            }
            fs::write(&target, content)
                .map_err(|error| format!("Failed to write file: {error}"))?;
            json!({
                "path": target.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &target),
                "saved": true,
                "opened": open_after_write,
            })
        }
        "open_workspace_file" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_workspace_target(&workspace_root, path, false)?;
            json!({
                "path": target.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &target),
                "opened": true,
            })
        }
        "delete_workspace_path" => {
            let workspace_root = workspace_root
                .as_ref()
                .ok_or_else(|| "No workspace is currently open.".to_string())?;
            let path = tool_call
                .arguments
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let target = resolve_workspace_target(&workspace_root, path, false)?;
            if target.is_dir() {
                fs::remove_dir_all(&target)
                    .map_err(|error| format!("Failed to delete directory: {error}"))?;
            } else {
                fs::remove_file(&target)
                    .map_err(|error| format!("Failed to delete file: {error}"))?;
            }
            json!({
                "path": target.to_string_lossy().to_string(),
                "relativePath": to_relative_path(&workspace_root, &target),
                "deleted": true,
            })
        }
        "load_skill_support_files" => json!(support_files),
        _ => {
            return Err(format!(
                "No Rust runtime executor is registered for {}.",
                tool_call.name
            ))
        }
    };

    serde_json::to_string_pretty(&content)
        .map_err(|error| format!("Failed to serialize tool result: {error}"))
}
