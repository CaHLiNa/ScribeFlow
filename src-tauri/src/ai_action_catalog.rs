use serde::Serialize;

pub const DEFAULT_AGENT_ACTION_ID: &str = "workspace-agent";

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiBuiltInActionDefinition {
    pub id: &'static str,
    pub kind: &'static str,
    pub title_key: &'static str,
    pub description_key: &'static str,
    pub required_context: &'static [&'static str],
}

const BUILT_IN_ACTIONS: &[AiBuiltInActionDefinition] = &[AiBuiltInActionDefinition {
    id: DEFAULT_AGENT_ACTION_ID,
    kind: "built-in-action",
    title_key: "Workspace agent",
    description_key:
        "Ask the agent to inspect the current workspace, use tools, and continue the task in context.",
    required_context: &["workspace"],
}];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiActionCatalogResponse {
    pub default_action_id: &'static str,
    pub built_in_actions: Vec<AiBuiltInActionDefinition>,
}

pub fn built_in_action_definitions() -> Vec<AiBuiltInActionDefinition> {
    BUILT_IN_ACTIONS.to_vec()
}

#[tauri::command]
pub async fn ai_action_catalog_list() -> Result<AiActionCatalogResponse, String> {
    Ok(AiActionCatalogResponse {
        default_action_id: DEFAULT_AGENT_ACTION_ID,
        built_in_actions: built_in_action_definitions(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_actions_include_workspace_agent() {
        let catalog = built_in_action_definitions();
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].id, DEFAULT_AGENT_ACTION_ID);
        assert_eq!(catalog[0].required_context, &["workspace"]);
    }
}
