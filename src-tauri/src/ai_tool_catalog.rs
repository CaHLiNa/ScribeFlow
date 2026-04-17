use serde::{Deserialize, Serialize};

const TOOL_DEFINITIONS: &[AiToolDefinition] = &[
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
        "read-active-document",
        "read_active_document",
        "Read active document",
        "Read the current open draft as workspace context.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "read-editor-selection",
        "read_editor_selection",
        "Read editor selection",
        "Read the current text selection from the active editor.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "read-selected-reference",
        "read_selected_reference",
        "Read selected reference",
        "Read the currently selected reference metadata and citation identity.",
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
    AiToolDefinition::new(
        "apply-document-patch",
        "apply_document_patch",
        "Apply document patch",
        "Write a replacement patch back into the active draft selection.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "open-note-draft",
        "open_note_draft",
        "Open note draft",
        "Create and open a markdown draft from AI output.",
        false,
        true,
    ),
    AiToolDefinition::new(
        "load-skill-support-files",
        "load_skill_support_files",
        "Load skill support files",
        "Load text support files that live alongside a discovered SKILL.md package.",
        false,
        true,
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
    pub runtime_tools: Vec<AiToolDefinition>,
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

pub fn build_ai_tool_prompt_block(tool_ids: &[String], runtime_intent: &str) -> String {
    let tools = resolve_tools_by_ids(&resolve_runtime_tool_ids(tool_ids, runtime_intent));
    if tools.is_empty() {
        return "Available tools: none.".to_string();
    }

    let mut lines = vec!["Available tools in this Altals runtime:".to_string()];
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
    let runtime_tool_ids = resolve_runtime_tool_ids(&params.enabled_tools, &params.runtime_intent);

    Ok(AiToolCatalogResolveResponse {
        tools: tool_definitions(),
        configurable_tools: configurable_tool_definitions(),
        normalized_enabled_tool_ids,
        effective_tools: resolve_tools_by_ids(&effective_tool_ids),
        runtime_tools: resolve_tools_by_ids(&runtime_tool_ids),
        effective_tool_ids,
        runtime_tool_ids,
    })
}

