use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use uuid::Uuid;

use crate::research_evidence_protocol::{
    ResearchEvidenceListParams, ResearchEvidenceListResponse, ResearchEvidenceRecord,
};
use crate::research_evidence_storage::{load_workspace_evidence, persist_workspace_evidence};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(Value::as_str) {
            let normalized = trim(entry);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    String::new()
}

fn bool_available(value: &Value) -> bool {
    value
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn normalize_excerpt(value: &str, max_chars: usize) -> String {
    let normalized = trim(value).replace('\n', " ");
    if normalized.chars().count() <= max_chars {
        return normalized;
    }
    format!(
        "{}…",
        normalized
            .chars()
            .take(max_chars)
            .collect::<String>()
            .trim_end()
    )
}

fn evidence_key(record: &ResearchEvidenceRecord) -> String {
    [
        record.task_id.clone(),
        record.source_type.clone(),
        record.source_path.clone(),
        record.source_range.clone(),
        record.reference_id.clone(),
        record.citation_key.clone(),
    ]
    .join("::")
}

fn upsert_evidence(
    collection: &mut Vec<ResearchEvidenceRecord>,
    mut record: ResearchEvidenceRecord,
) -> ResearchEvidenceRecord {
    let key = evidence_key(&record);
    if let Some(index) = collection
        .iter()
        .position(|entry| evidence_key(entry) == key)
    {
        let existing = collection[index].clone();
        record.id = existing.id;
        record.created_at = existing.created_at;
        record.updated_at = now_ms();
        collection[index] = record.clone();
        return record;
    }
    collection.push(record.clone());
    record
}

fn build_document_evidence(
    task_id: &str,
    context_bundle: &Value,
) -> Option<ResearchEvidenceRecord> {
    let document = context_bundle.get("document").unwrap_or(&Value::Null);
    if !bool_available(document) {
        return None;
    }
    let source_path = string_field(document, &["filePath", "file_path"]);
    if source_path.is_empty() {
        return None;
    }
    let now = now_ms();
    Some(ResearchEvidenceRecord {
        id: format!("evidence:{}", Uuid::new_v4()),
        task_id: trim(task_id),
        source_type: "document".to_string(),
        label: string_field(document, &["label", "filePath", "file_path"]),
        source_path,
        source_range: String::new(),
        reference_id: String::new(),
        citation_key: String::new(),
        excerpt: String::new(),
        confidence: 1.0,
        why_relevant: "当前活动文档".to_string(),
        created_at: now,
        updated_at: now,
    })
}

fn build_selection_evidence(
    task_id: &str,
    context_bundle: &Value,
) -> Option<ResearchEvidenceRecord> {
    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    if !bool_available(selection) {
        return None;
    }
    let source_path = string_field(selection, &["filePath", "file_path"]);
    if source_path.is_empty() {
        return None;
    }
    let from = selection
        .get("from")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .max(0);
    let to = selection
        .get("to")
        .and_then(Value::as_i64)
        .unwrap_or(0)
        .max(0);
    let excerpt = {
        let preview = string_field(selection, &["preview"]);
        if preview.is_empty() {
            normalize_excerpt(&string_field(selection, &["text"]), 320)
        } else {
            normalize_excerpt(&preview, 320)
        }
    };
    let now = now_ms();
    Some(ResearchEvidenceRecord {
        id: format!("evidence:{}", Uuid::new_v4()),
        task_id: trim(task_id),
        source_type: "selection".to_string(),
        label: "当前选区".to_string(),
        source_path,
        source_range: if to > from {
            format!("{from}:{to}")
        } else {
            String::new()
        },
        reference_id: String::new(),
        citation_key: String::new(),
        excerpt,
        confidence: 1.0,
        why_relevant: "用户当前选中的正文片段".to_string(),
        created_at: now,
        updated_at: now,
    })
}

fn build_reference_evidence(
    task_id: &str,
    context_bundle: &Value,
) -> Option<ResearchEvidenceRecord> {
    let reference = context_bundle.get("reference").unwrap_or(&Value::Null);
    if !bool_available(reference) {
        return None;
    }
    let reference_id = string_field(reference, &["id"]);
    let citation_key = string_field(reference, &["citationKey", "citation_key"]);
    if reference_id.is_empty() && citation_key.is_empty() {
        return None;
    }
    let title = string_field(reference, &["title"]);
    let excerpt = normalize_excerpt(
        &[
            string_field(reference, &["authorLine", "author_line"]),
            string_field(reference, &["year"]),
            title.clone(),
        ]
        .into_iter()
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(" · "),
        320,
    );
    let now = now_ms();
    Some(ResearchEvidenceRecord {
        id: format!("evidence:{}", Uuid::new_v4()),
        task_id: trim(task_id),
        source_type: "reference".to_string(),
        label: if title.is_empty() {
            "当前文献".to_string()
        } else {
            title
        },
        source_path: String::new(),
        source_range: String::new(),
        reference_id,
        citation_key,
        excerpt,
        confidence: 0.95,
        why_relevant: "当前选中文献".to_string(),
        created_at: now,
        updated_at: now,
    })
}

pub(crate) fn ensure_context_bundle_evidence(
    workspace_path: &str,
    task_id: &str,
    context_bundle: &Value,
) -> Result<Vec<ResearchEvidenceRecord>, String> {
    let normalized_workspace_path = trim(workspace_path);
    let normalized_task_id = trim(task_id);
    if normalized_workspace_path.is_empty() || normalized_task_id.is_empty() {
        return Ok(Vec::new());
    }

    let mut evidence = load_workspace_evidence(&normalized_workspace_path)?;
    let mut created = Vec::new();
    for candidate in [
        build_document_evidence(&normalized_task_id, context_bundle),
        build_selection_evidence(&normalized_task_id, context_bundle),
        build_reference_evidence(&normalized_task_id, context_bundle),
    ]
    .into_iter()
    .flatten()
    {
        created.push(upsert_evidence(&mut evidence, candidate));
    }

    evidence.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    persist_workspace_evidence(&normalized_workspace_path, &evidence)?;
    Ok(created)
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
