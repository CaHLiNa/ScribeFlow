use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTask {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub goal: String,
    pub status: String,
    pub phase: String,
    pub success_criteria: Vec<String>,
    pub workspace_path: String,
    pub runtime_thread_id: String,
    pub active_document_paths: Vec<String>,
    pub reference_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub artifact_ids: Vec<String>,
    pub verification_summary: String,
    pub blocked_reason: String,
    pub resume_hint: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskListParams {
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskListResponse {
    pub tasks: Vec<ResearchTask>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskEnsureParams {
    pub workspace_path: String,
    #[serde(default)]
    pub runtime_thread_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub active_document_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskEnsureResponse {
    pub task: ResearchTask,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskUpdateParams {
    pub workspace_path: String,
    pub task_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub goal: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub phase: Option<String>,
    #[serde(default)]
    pub success_criteria: Option<Vec<String>>,
    #[serde(default)]
    pub active_document_paths: Option<Vec<String>>,
    #[serde(default)]
    pub reference_ids: Option<Vec<String>>,
    #[serde(default)]
    pub evidence_ids: Option<Vec<String>>,
    #[serde(default)]
    pub artifact_ids: Option<Vec<String>>,
    #[serde(default)]
    pub verification_summary: Option<String>,
    #[serde(default)]
    pub blocked_reason: Option<String>,
    #[serde(default)]
    pub resume_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchTaskUpdateResponse {
    pub task: ResearchTask,
}
