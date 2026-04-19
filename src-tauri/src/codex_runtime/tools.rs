use serde_json::Value;

#[derive(Debug, Clone)]
pub struct RuntimeToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
    pub source_kind: &'static str,
    pub invocation_name: &'static str,
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

pub fn resolve_runtime_tool_definitions_with_context(
    _workspace_path: &str,
    _enabled_tool_ids: &[String],
    _requested_tool_mentions: &[String],
    _context_bundle: &Value,
    _support_files: &[Value],
) -> Vec<RuntimeToolDefinition> {
    Vec::new()
}

pub fn execute_runtime_tool_calls(
    workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
) -> Vec<RuntimeToolResult> {
    execute_runtime_tool_calls_with_context(workspace_path, tool_calls, &Value::Null, &[])
}

pub fn execute_runtime_tool_calls_with_context(
    _workspace_path: &str,
    tool_calls: &[RuntimeToolCall],
    _context_bundle: &Value,
    _support_files: &[Value],
) -> Vec<RuntimeToolResult> {
    tool_calls
        .iter()
        .map(|tool_call| RuntimeToolResult {
            tool_call_id: tool_call.id.clone(),
            content: format!(
                "No ScribeFlow runtime tool is available for {}.",
                tool_call.name
            ),
            is_error: true,
        })
        .collect()
}
