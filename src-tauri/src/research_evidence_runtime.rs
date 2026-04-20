use crate::research_evidence_protocol::{
    ResearchEvidenceListParams, ResearchEvidenceListResponse, ResearchEvidenceRecord,
};
use crate::research_evidence_storage::load_workspace_evidence;

fn trim(value: &str) -> String {
    value.trim().to_string()
}

pub(crate) fn list_research_evidence_for_task(
    workspace_path: &str,
    task_id: &str,
) -> Result<Vec<ResearchEvidenceRecord>, String> {
    let normalized_workspace_path = trim(workspace_path);
    let normalized_task_id = trim(task_id);
    if normalized_workspace_path.is_empty() || normalized_task_id.is_empty() {
        return Ok(Vec::new());
    }
    let mut evidence = load_workspace_evidence(&normalized_workspace_path)?
        .into_iter()
        .filter(|entry| entry.task_id == normalized_task_id)
        .collect::<Vec<_>>();
    evidence.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(evidence)
}

#[tauri::command]
pub async fn research_evidence_list(
    params: ResearchEvidenceListParams,
) -> Result<ResearchEvidenceListResponse, String> {
    Ok(ResearchEvidenceListResponse {
        evidence: if trim(&params.task_id).is_empty() {
            let mut evidence = load_workspace_evidence(&params.workspace_path)?;
            evidence.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
            evidence
        } else {
            list_research_evidence_for_task(&params.workspace_path, &params.task_id)?
        },
    })
}
