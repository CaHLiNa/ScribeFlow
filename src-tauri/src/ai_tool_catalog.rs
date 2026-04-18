use crate::ai_extension_catalog::resolve_mcp_runtime_tools;
use serde::{Deserialize, Serialize};

const TOOL_DEFINITIONS: &[AiToolDefinition] = &[
    AiToolDefinition::new(
        "read-extension-catalog",
        "read_extension_catalog",
        "Read extension catalog",
        "Inspect configured MCP servers and extension sources available to this runtime.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "list-workspace-directory",
        "list_workspace_directory",
        "List workspace directory",
        "List immediate files and folders inside a workspace directory.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "search-workspace-files",
        "search_workspace_files",
        "Search workspace files",
        "Search workspace files by path or filename.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "read-workspace-file",
        "read_workspace_file",
        "Read workspace file",
        "Read any text file from the current workspace.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "create-workspace-file",
        "create_workspace_file",
        "Create workspace file",
        "Create a new text file inside the current workspace and open it in the editor.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "write-workspace-file",
        "write_workspace_file",
        "Write workspace file",
        "Write text content to a workspace file and optionally open it in the editor.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "open-workspace-file",
        "open_workspace_file",
        "Open workspace file",
        "Open an existing workspace file in the editor.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "delete-workspace-path",
        "delete_workspace_path",
        "Delete workspace path",
        "Delete a file or folder inside the current workspace.",
        true,
        false,
    ),
];

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolDefinition {
    pub id: &'static str,
    pub label: &'static str,
    pub label_key: &'static str,
    pub description: &'static str,
    pub description_key: &'static str,
    pub configurable: bool,
    pub always_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRuntimeToolEntry {
    pub id: String,
    pub label: String,
    pub label_key: String,
    pub description: String,
    pub description_key: String,
    pub configurable: bool,
    pub always_available: bool,
    pub source_kind: String,
    pub source_label: String,
    pub group_key: String,
    pub group_label: String,
    pub invocation_name: String,
    pub external: bool,
}

impl AiToolDefinition {
    pub const fn new(
        id: &'static str,
        label: &'static str,
        label_key: &'static str,
        description: &'static str,
        configurable: bool,
        always_available: bool,
    ) -> Self {
        Self {
            id,
            label,
            label_key,
            description,
            description_key: description,
            configurable,
            always_available,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolCatalogResolveParams {
    #[serde(default)]
    pub enabled_tools: Vec<String>,
    #[serde(default)]
    pub runtime_intent: String,
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolCatalogResolveResponse {
    pub tools: Vec<AiToolDefinition>,
    pub configurable_tools: Vec<AiToolDefinition>,
    pub normalized_enabled_tool_ids: Vec<String>,
    pub effective_tool_ids: Vec<String>,
    pub runtime_tool_ids: Vec<String>,
    pub effective_tools: Vec<AiToolDefinition>,
    pub runtime_tools: Vec<AiRuntimeToolEntry>,
}

pub fn tool_definitions() -> Vec<AiToolDefinition> {
    TOOL_DEFINITIONS.to_vec()
}

pub fn get_tool_definition(tool_id: &str) -> Option<AiToolDefinition> {
    TOOL_DEFINITIONS
        .iter()
        .copied()
        .find(|entry| entry.id == tool_id.trim())
}

pub fn configurable_tool_definitions() -> Vec<AiToolDefinition> {
    TOOL_DEFINITIONS
        .iter()
        .copied()
        .filter(|entry| entry.configurable)
        .collect()
}

pub fn normalize_enabled_tool_ids(enabled_tools: &[String]) -> Vec<String> {
    let allowed = configurable_tool_definitions()
        .into_iter()
        .map(|entry| entry.id)
        .collect::<Vec<_>>();

    let mut normalized = Vec::new();
    for entry in enabled_tools {
        let tool_id = entry.trim();
        if tool_id.is_empty() || !allowed.iter().any(|allowed_id| allowed_id == &tool_id) {
            continue;
        }
        if !normalized.iter().any(|existing| existing == tool_id) {
            normalized.push(tool_id.to_string());
        }
    }
    normalized
}

pub fn resolve_effective_tool_ids(enabled_tools: &[String]) -> Vec<String> {
    let mut resolved = TOOL_DEFINITIONS
        .iter()
        .filter(|entry| entry.always_available)
        .map(|entry| entry.id.to_string())
        .collect::<Vec<_>>();

    for tool_id in normalize_enabled_tool_ids(enabled_tools) {
        if !resolved.iter().any(|entry| entry == &tool_id) {
            resolved.push(tool_id);
        }
    }

    resolved
}

pub fn resolve_runtime_tool_ids(enabled_tools: &[String], runtime_intent: &str) -> Vec<String> {
    let mut resolved = resolve_effective_tool_ids(enabled_tools);
    if runtime_intent.trim() != "agent" {
        return resolved;
    }

    for entry in TOOL_DEFINITIONS
        .iter()
        .filter(|entry| entry.always_available)
    {
        if !resolved.iter().any(|tool_id| tool_id == entry.id) {
            resolved.push(entry.id.to_string());
        }
    }
    resolved
}

pub fn resolve_tools_by_ids(tool_ids: &[String]) -> Vec<AiToolDefinition> {
    tool_ids
        .iter()
        .filter_map(|tool_id| get_tool_definition(tool_id))
        .collect()
}

fn slugify_invocation_name(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn normalize_runtime_tool_lookup(value: &str) -> String {
    slugify_invocation_name(value)
}

fn runtime_entry_from_builtin(tool: AiToolDefinition) -> AiRuntimeToolEntry {
    AiRuntimeToolEntry {
        id: tool.id.to_string(),
        label: tool.label.to_string(),
        label_key: tool.label_key.to_string(),
        description: tool.description.to_string(),
        description_key: tool.description_key.to_string(),
        configurable: tool.configurable,
        always_available: tool.always_available,
        source_kind: "built-in".to_string(),
        source_label: "Altals".to_string(),
        group_key: "built-in-tools".to_string(),
        group_label: "Built-in tools".to_string(),
        invocation_name: slugify_invocation_name(tool.label),
        external: false,
    }
}

fn resolve_runtime_tool_entries(
    enabled_tools: &[String],
    runtime_intent: &str,
    workspace_path: &str,
) -> Vec<AiRuntimeToolEntry> {
    let mut entries =
        resolve_tools_by_ids(&resolve_runtime_tool_ids(enabled_tools, runtime_intent))
            .into_iter()
            .map(runtime_entry_from_builtin)
            .collect::<Vec<_>>();

    if runtime_intent.trim() != "agent" || workspace_path.trim().is_empty() {
        return entries;
    }

    entries.extend(
        resolve_mcp_runtime_tools(workspace_path)
            .into_iter()
            .map(|tool| {
                let description = if tool.description.trim().is_empty() {
                    format!("External MCP tool from {}.", tool.server_name)
                } else {
                    tool.description.clone()
                };
                AiRuntimeToolEntry {
                    id: tool.runtime_name.clone(),
                    label: tool.display_name.clone(),
                    label_key: tool.display_name.clone(),
                    description_key: description.clone(),
                    description,
                    configurable: false,
                    always_available: true,
                    source_kind: "mcp".to_string(),
                    source_label: tool.server_name.clone(),
                    group_key: "mcp-tools".to_string(),
                    group_label: "MCP tools".to_string(),
                    invocation_name: {
                        let base = format!("mcp {} {}", tool.server_name, tool.tool_name);
                        let normalized = slugify_invocation_name(&base);
                        if normalized.is_empty() {
                            slugify_invocation_name(&tool.runtime_name)
                        } else {
                            normalized
                        }
                    },
                    external: true,
                }
            }),
    );

    entries
}

pub fn resolve_requested_runtime_tool_labels(
    enabled_tools: &[String],
    runtime_intent: &str,
    workspace_path: &str,
    mentions: &[String],
) -> Vec<String> {
    let runtime_tools = resolve_runtime_tool_entries(enabled_tools, runtime_intent, workspace_path);
    let mut resolved = Vec::new();

    for mention in mentions {
        let normalized_mention = normalize_runtime_tool_lookup(mention);
        if normalized_mention.is_empty() {
            continue;
        }

        let Some(tool) = runtime_tools.iter().find(|entry| {
            normalize_runtime_tool_lookup(&entry.invocation_name) == normalized_mention
                || normalize_runtime_tool_lookup(&entry.id) == normalized_mention
                || normalize_runtime_tool_lookup(&entry.label) == normalized_mention
        }) else {
            continue;
        };

        let display = if tool.source_kind == "mcp" {
            format!("MCP · {}", tool.label)
        } else {
            tool.label.clone()
        };

        if !resolved.iter().any(|entry| entry == &display) {
            resolved.push(display);
        }
    }

    resolved
}

pub fn build_ai_tool_prompt_block(tool_ids: &[String], runtime_intent: &str) -> String {
    let tools = resolve_tools_by_ids(&resolve_runtime_tool_ids(tool_ids, runtime_intent));
    if tools.is_empty() {
        return "Available tools: none.".to_string();
    }

    let mut lines = vec!["Available tools in this runtime:".to_string()];
    lines.extend(
        tools
            .into_iter()
            .map(|tool| format!("- {}: {}", tool.label, tool.description)),
    );
    lines.join("\n")
}

#[tauri::command]
pub async fn ai_tool_catalog_resolve(
    params: AiToolCatalogResolveParams,
) -> Result<AiToolCatalogResolveResponse, String> {
    let normalized_enabled_tool_ids = normalize_enabled_tool_ids(&params.enabled_tools);
    let effective_tool_ids = resolve_effective_tool_ids(&params.enabled_tools);
    let runtime_tools = resolve_runtime_tool_entries(
        &params.enabled_tools,
        &params.runtime_intent,
        &params.workspace_path,
    );
    let runtime_tool_ids = runtime_tools
        .iter()
        .map(|tool| tool.id.clone())
        .collect::<Vec<_>>();

    Ok(AiToolCatalogResolveResponse {
        tools: tool_definitions(),
        configurable_tools: configurable_tool_definitions(),
        normalized_enabled_tool_ids,
        effective_tools: resolve_tools_by_ids(&effective_tool_ids),
        runtime_tools,
        effective_tool_ids,
        runtime_tool_ids,
    })
}
