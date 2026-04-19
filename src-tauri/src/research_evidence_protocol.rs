use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResearchEvidenceRecord {
    pub id: String,
    pub task_id: String,
    pub source_type: String,
    pub label: String,
    pub source_path: String,
    pub source_range: String,
    pub reference_id: String,
    pub citation_key: String,
    pub excerpt: String,
    pub confidence: f64,
    pub why_relevant: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchEvidenceListParams {
    pub workspace_path: String,
    #[serde(default)]
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchEvidenceListResponse {
    pub evidence: Vec<ResearchEvidenceRecord>,
}
