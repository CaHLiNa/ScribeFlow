use serde::{Deserialize, Serialize};

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
    Vec::new()
}

pub fn get_tool_definition(_tool_id: &str) -> Option<AiToolDefinition> {
    None
}

pub fn configurable_tool_definitions() -> Vec<AiToolDefinition> {
    Vec::new()
}

pub fn normalize_enabled_tool_ids(_enabled_tools: &[String]) -> Vec<String> {
    Vec::new()
}

pub fn resolve_effective_tool_ids(_enabled_tools: &[String]) -> Vec<String> {
    Vec::new()
}

pub fn resolve_runtime_tool_ids(_enabled_tools: &[String], _runtime_intent: &str) -> Vec<String> {
    Vec::new()
}

pub fn resolve_tools_by_ids(_tool_ids: &[String]) -> Vec<AiToolDefinition> {
    Vec::new()
}

pub fn resolve_requested_runtime_tool_labels(
    _enabled_tools: &[String],
    _runtime_intent: &str,
    _workspace_path: &str,
    _mentions: &[String],
) -> Vec<String> {
    Vec::new()
}

pub fn build_ai_tool_prompt_block(_tool_ids: &[String], _runtime_intent: &str) -> String {
    "Available tools: none.".to_string()
}

#[tauri::command]
pub async fn ai_tool_catalog_resolve(
    params: AiToolCatalogResolveParams,
) -> Result<AiToolCatalogResolveResponse, String> {
    let _ = (
        params.enabled_tools,
        params.runtime_intent,
        params.workspace_path,
    );

    Ok(AiToolCatalogResolveResponse {
        tools: Vec::new(),
        configurable_tools: Vec::new(),
        normalized_enabled_tool_ids: Vec::new(),
        effective_tool_ids: Vec::new(),
        runtime_tool_ids: Vec::new(),
        effective_tools: Vec::new(),
        runtime_tools: Vec::new(),
    })
}
