use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThreadStatus {
    Idle,
    Running,
    Interrupted,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TurnStatus {
    Running,
    Completed,
    Interrupted,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ItemKind {
    UserMessage,
    AgentMessage,
    Reasoning,
    ToolCall,
    ToolResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThread {
    pub id: String,
    pub title: String,
    pub cwd: Option<String>,
    pub status: ThreadStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
    pub active_turn_id: Option<String>,
    pub turn_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurn {
    pub id: String,
    pub thread_id: String,
    pub status: TurnStatus,
    pub user_text: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub interrupted_at: Option<i64>,
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeItem {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub kind: ItemKind,
    pub status: TurnStatus,
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadSnapshot {
    pub thread: RuntimeThread,
    pub turns: Vec<RuntimeTurn>,
    pub items: Vec<RuntimeItem>,
    pub permission_requests: Vec<RuntimePermissionRequest>,
    pub ask_user_requests: Vec<RuntimeAskUserRequest>,
    pub exit_plan_requests: Vec<RuntimeExitPlanRequest>,
    pub plan_mode: Option<RuntimePlanModeState>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadStartParams {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadStartResponse {
    pub thread: RuntimeThread,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadReadParams {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadReadResponse {
    pub snapshot: RuntimeThreadSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadRenameParams {
    pub thread_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadRenameResponse {
    pub thread: RuntimeThread,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadListResponse {
    pub threads: Vec<RuntimeThread>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadArchiveParams {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadArchiveResponse {
    pub thread: RuntimeThread,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadUnarchiveParams {
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadUnarchiveResponse {
    pub thread: RuntimeThread,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadForkParams {
    pub thread_id: String,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadForkResponse {
    pub snapshot: RuntimeThreadSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadRollbackParams {
    pub thread_id: String,
    #[serde(default)]
    pub turns: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeThreadRollbackResponse {
    pub snapshot: RuntimeThreadSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePermissionRequest {
    pub request_id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub tool_name: String,
    pub display_name: String,
    pub title: String,
    pub description: String,
    pub decision_reason: String,
    pub input_preview: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePermissionRequestParams {
    pub thread_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub decision_reason: String,
    #[serde(default)]
    pub input_preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePermissionRequestResponse {
    pub request: RuntimePermissionRequest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePermissionResolveParams {
    pub request_id: String,
    #[serde(default)]
    pub behavior: String,
    #[serde(default)]
    pub persist: bool,
    #[serde(default)]
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePermissionResolveResponse {
    pub request_id: String,
    pub behavior: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub multi_select: bool,
    pub options: Vec<RuntimeAskUserOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserOption {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserRequest {
    pub request_id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub title: String,
    pub prompt: String,
    pub description: String,
    pub questions: Vec<RuntimeAskUserQuestion>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserRequestParams {
    pub thread_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub questions: Vec<RuntimeAskUserQuestion>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserRequestResponse {
    pub request: RuntimeAskUserRequest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserResolveParams {
    pub request_id: String,
    #[serde(default)]
    pub answers: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAskUserResolveResponse {
    pub request_id: String,
    pub answers: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanAllowedPrompt {
    pub tool: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanRequest {
    pub request_id: String,
    pub thread_id: String,
    pub turn_id: Option<String>,
    pub title: String,
    pub allowed_prompts: Vec<RuntimeExitPlanAllowedPrompt>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanRequestParams {
    pub thread_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub allowed_prompts: Vec<RuntimeExitPlanAllowedPrompt>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanRequestResponse {
    pub request: RuntimeExitPlanRequest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanResolveParams {
    pub request_id: String,
    #[serde(default)]
    pub action: String,
    #[serde(default)]
    pub feedback: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeExitPlanResolveResponse {
    pub request_id: String,
    pub action: String,
    pub feedback: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePlanModeState {
    pub thread_id: String,
    pub active: bool,
    pub summary: String,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePlanModeSetParams {
    pub thread_id: String,
    #[serde(default)]
    pub active: bool,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePlanModeSetResponse {
    pub plan_mode: RuntimePlanModeState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnStartParams {
    pub thread_id: String,
    pub user_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnStartResponse {
    pub thread: RuntimeThread,
    pub turn: RuntimeTurn,
    pub items: Vec<RuntimeItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnInterruptParams {
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnInterruptResponse {
    pub thread: RuntimeThread,
    pub turn: RuntimeTurn,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProviderConfig {
    pub provider_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnRunParams {
    pub thread_id: String,
    pub user_text: String,
    pub provider: RuntimeProviderConfig,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub enabled_tool_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeTurnRunResponse {
    pub thread: RuntimeThread,
    pub turn: RuntimeTurn,
    pub user_item: RuntimeItem,
    pub assistant_item: RuntimeItem,
    pub reasoning_item: RuntimeItem,
}
