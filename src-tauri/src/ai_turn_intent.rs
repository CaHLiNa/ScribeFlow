use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TurnIntent {
    AnswerOnly,
    SkillInvocation,
    WorkspaceRead,
    WorkspaceWrite,
    CommandExec,
    ResearchTask,
    ApprovalContinuation,
}

impl TurnIntent {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AnswerOnly => "answer-only",
            Self::SkillInvocation => "skill-invocation",
            Self::WorkspaceRead => "workspace-read",
            Self::WorkspaceWrite => "workspace-write",
            Self::CommandExec => "command-exec",
            Self::ResearchTask => "research-task",
            Self::ApprovalContinuation => "approval-continuation",
        }
    }

    pub fn runtime_intent(&self) -> &'static str {
        match self {
            Self::AnswerOnly => "chat",
            Self::SkillInvocation => "skill",
            Self::WorkspaceRead
            | Self::WorkspaceWrite
            | Self::CommandExec
            | Self::ResearchTask
            | Self::ApprovalContinuation => "agent",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TurnResponseMode {
    AnswerOnly,
    Execute,
    Mixed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TurnCapabilityPlan {
    pub read_workspace: bool,
    pub write_workspace: bool,
    pub exec_command: bool,
    pub use_research_task: bool,
    pub use_skill_response: bool,
    pub needs_approval: bool,
    pub needs_user_input: bool,
    pub response_mode: TurnResponseMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TurnApprovalPreflight {
    pub required: bool,
    pub status: String,
    pub reason: String,
    pub pending_request_kind: String,
    pub pending_request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TurnExecutionRoute {
    pub intent: TurnIntent,
    pub runtime_intent: String,
    pub label: String,
    pub summary: String,
    pub should_hydrate_research_task: bool,
    pub should_continue_pending_turn: bool,
    pub allowed_tool_ids: Vec<String>,
    pub requested_tool_mentions: Vec<String>,
    pub capability_plan: TurnCapabilityPlan,
    pub approval_preflight: TurnApprovalPreflight,
}
