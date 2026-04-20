use std::collections::HashSet;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::latex::{compile_latex, LatexState};
use crate::references_citation::{references_citation_render, CitationRenderParams};
use crate::references_import::{references_export_bibtex, ReferenceBibtexExportParams};
use crate::references_runtime::{references_write_bib_file, ReferenceBibFileParams};
use crate::research_task_protocol::ResearchTaskUpdateParams;
use crate::research_task_runtime::research_task_update;
use crate::research_verification_protocol::{
    ResearchVerificationListParams, ResearchVerificationListResponse, ResearchVerificationRecord,
    ResearchVerificationRunParams, ResearchVerificationRunResponse,
};
use crate::research_verification_storage::{
    load_workspace_verifications, persist_workspace_verifications,
};

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

fn status_and_summary(passed: bool, kind: &str) -> (String, String, bool) {
    if passed {
        (
            "verified".to_string(),
            format!("{kind} verification passed."),
            false,
        )
    } else {
        (
            "failed".to_string(),
            format!("{kind} verification failed."),
            true,
        )
    }
}

fn normalize_reference_list(references: &[Value]) -> Vec<Value> {
    references
        .iter()
        .filter(|entry| entry.is_object())
        .cloned()
        .collect()
}

fn resolve_reference_from_inputs(
    artifact: &Value,
    reference: &Value,
    references: &[Value],
) -> Option<Value> {
    if reference.is_object() {
        return Some(reference.clone());
    }

    let reference_id = string_field(artifact, &["referenceId"]);
    let citation_key = string_field(artifact, &["citationKey"]);
    references.iter().find_map(|entry| {
        let current_id = string_field(entry, &["id"]);
        let current_key = string_field(entry, &["citationKey"]);
        if (!reference_id.is_empty() && current_id == reference_id)
            || (!citation_key.is_empty() && current_key == citation_key)
        {
            Some(entry.clone())
        } else {
            None
        }
    })
}

async fn verify_reference_renderability(
    workspace_path: &str,
    citation_style: &str,
    reference: &Value,
) -> Result<Vec<String>, String> {
    let style = if trim(citation_style).is_empty() {
        "apa".to_string()
    } else {
        trim(citation_style)
    };
    let rendered = references_citation_render(CitationRenderParams {
        style: style.clone(),
        mode: "inline".to_string(),
        reference: reference.clone(),
        references: vec![reference.clone()],
        csl_items: Vec::new(),
        number: None,
        locale: "en-GB".to_string(),
        workspace_path: workspace_path.to_string(),
    })
    .await?;
    if trim(&rendered).is_empty() {
        return Err("Citation rendering produced an empty result.".to_string());
    }

    let bibtex = references_export_bibtex(ReferenceBibtexExportParams {
        references: vec![reference.clone()],
    })
    .await?;
    if trim(&bibtex).is_empty() {
        return Err("BibTeX export produced an empty result.".to_string());
    }

    Ok(vec![
        format!("Citation rendering succeeded with style `{style}`."),
        "BibTeX export succeeded for the reference.".to_string(),
    ])
}

fn verify_doc_patch(artifact: &Value, content: &str) -> (bool, Vec<String>) {
    let replacement = string_field(artifact, &["replacementText"]);
    if replacement.is_empty() {
        return (
            false,
            vec!["Missing replacementText in artifact.".to_string()],
        );
    }
    if content.contains(&replacement) {
        (
            true,
            vec!["Replacement text is present in the saved document.".to_string()],
        )
    } else {
        (
            false,
            vec!["Replacement text is not present in the saved document.".to_string()],
        )
    }
}

async fn verify_citation_insert(
    workspace_path: &str,
    artifact: &Value,
    content: &str,
    citation_text: &str,
    file_path: &str,
    reference: &Value,
    references: &[Value],
    citation_style: &str,
) -> (bool, Vec<String>) {
    let mut details = Vec::new();
    let normalized_citation_text = trim(citation_text);
    if normalized_citation_text.is_empty() {
        details.push("Citation text is missing.".to_string());
        return (false, details);
    }
    if content.contains(&normalized_citation_text) {
        details.push("Citation text is present in the saved document.".to_string());
    } else {
        details.push("Citation text is not present in the saved document.".to_string());
        return (false, details);
    }

    let citation_key = string_field(artifact, &["citationKey"]);
    if citation_key.is_empty() {
        details.push("Artifact has no citation key.".to_string());
        return (false, details);
    }
    details.push(format!("Citation key resolved: {citation_key}"));
    if !trim(file_path).is_empty() {
        details.push(format!("Target file verified: {}", trim(file_path)));
    }

    let normalized_references = normalize_reference_list(references);
    let Some(reference) =
        resolve_reference_from_inputs(artifact, reference, &normalized_references)
    else {
        details.push("Reference snapshot is unavailable for verification.".to_string());
        return (false, details);
    };

    match verify_reference_renderability(workspace_path, citation_style, &reference).await {
        Ok(mut render_details) => {
            details.append(&mut render_details);
            (true, details)
        }
        Err(error) => {
            details.push(error);
            (false, details)
        }
    }
}

async fn verify_reference_patch(
    workspace_path: &str,
    artifact: &Value,
    reference: &Value,
    references: &[Value],
    citation_style: &str,
) -> (bool, Vec<String>) {
    let updates = artifact.get("updates").cloned().unwrap_or(Value::Null);
    let Some(object) = updates.as_object() else {
        return (false, vec!["Reference patch has no updates.".to_string()]);
    };
    let normalized_references = normalize_reference_list(references);
    let Some(reference) =
        resolve_reference_from_inputs(artifact, reference, &normalized_references)
    else {
        return (
            false,
            vec!["Reference snapshot is unavailable for verification.".to_string()],
        );
    };

    let mut details = Vec::new();
    for (key, expected) in object.iter() {
        let expected_text = expected
            .as_str()
            .map(trim)
            .unwrap_or_else(|| expected.to_string());
        let current_text = reference
            .get(key)
            .and_then(Value::as_str)
            .map(trim)
            .unwrap_or_else(|| reference.get(key).map(Value::to_string).unwrap_or_default());
        if expected_text != current_text {
            details.push(format!(
                "Field mismatch for {key}: expected `{expected_text}`, got `{current_text}`."
            ));
            return (false, details);
        }
        details.push(format!("Verified field {key}."));
    }
    match verify_reference_renderability(workspace_path, citation_style, &reference).await {
        Ok(mut render_details) => {
            details.append(&mut render_details);
            (true, details)
        }
        Err(error) => {
            details.push(error);
            (false, details)
        }
    }
}

fn verify_note_draft(created_path: &str) -> (bool, Vec<String>) {
    let normalized_path = trim(created_path);
    if normalized_path.is_empty() {
        return (false, vec!["Draft path is missing.".to_string()]);
    }
    if Path::new(&normalized_path).exists() {
        (true, vec!["Draft file exists on disk.".to_string()])
    } else {
        (
            false,
            vec!["Draft file does not exist on disk.".to_string()],
        )
    }
}

fn latest_verifications_by_artifact(
    verifications: &[ResearchVerificationRecord],
) -> Vec<ResearchVerificationRecord> {
    let mut seen = HashSet::new();
    let mut latest = Vec::new();
    for verification in verifications {
        let key = if trim(&verification.artifact_id).is_empty() {
            verification.id.clone()
        } else {
            verification.artifact_id.clone()
        };
        if seen.insert(key) {
            latest.push(verification.clone());
        }
    }
    latest
}

fn build_resume_hint(kind: &str, blocking: bool) -> String {
    if !blocking {
        return String::new();
    }
    match trim(kind).as_str() {
        "citation_insert" | "reference_patch" => {
            "修复 citation 或 bibliography 问题后重新应用相关 artifact。".to_string()
        }
        "doc_patch" => "检查文档当前内容与 patch 适用范围后重新应用。".to_string(),
        "note_draft"
        | "related_work_outline"
        | "reading_note_bundle"
        | "claim_evidence_map"
        | "compile_fix"
        | "comparison_table" => "检查生成内容与目标路径后重新生成草稿。".to_string(),
        _ => "修复当前验证失败项后重新运行对应 artifact。".to_string(),
    }
}

fn aggregate_task_verdict(
    verifications: &[ResearchVerificationRecord],
) -> (String, String, String, String, String) {
    let latest = latest_verifications_by_artifact(verifications);
    if latest.is_empty() {
        return (
            String::new(),
            String::new(),
            String::new(),
            String::new(),
            "active".to_string(),
        );
    }

    let blocking_entries = latest
        .iter()
        .filter(|entry| entry.blocking || trim(&entry.status) == "failed")
        .cloned()
        .collect::<Vec<_>>();
    let verified_count = latest
        .iter()
        .filter(|entry| trim(&entry.status) == "verified")
        .count();

    if blocking_entries.is_empty() {
        return (
            "pass".to_string(),
            format!("全部 {} 项研究验证已通过。", latest.len()),
            String::new(),
            String::new(),
            "active".to_string(),
        );
    }

    let primary_blocker = blocking_entries
        .first()
        .map(|entry| trim(&entry.summary))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "仍有验证项未通过。".to_string());
    let resume_hint = build_resume_hint(
        blocking_entries
            .first()
            .map(|entry| entry.kind.as_str())
            .unwrap_or_default(),
        true,
    );
    if verified_count == 0 {
        return (
            "fail".to_string(),
            format!("全部 {} 项研究验证均未通过。", blocking_entries.len()),
            primary_blocker,
            resume_hint,
            "failed".to_string(),
        );
    }

    (
        "block".to_string(),
        format!(
            "仍有 {} 项阻塞验证待修复，{} 项验证已通过。",
            blocking_entries.len(),
            verified_count
        ),
        primary_blocker,
        resume_hint,
        "blocked".to_string(),
    )
}

async fn build_verification_record(
    params: &ResearchVerificationRunParams,
) -> ResearchVerificationRecord {
    let kind = string_field(&params.artifact, &["type"]);
    let (passed, details) = match kind.as_str() {
        "doc_patch" => verify_doc_patch(&params.artifact, &params.content),
        "citation_insert" => {
            verify_citation_insert(
                &params.workspace_path,
                &params.artifact,
                &params.content,
                &params.citation_text,
                &params.file_path,
                &params.reference,
                &params.references,
                &params.citation_style,
            )
            .await
        }
        "reference_patch" => {
            verify_reference_patch(
                &params.workspace_path,
                &params.artifact,
                &params.reference,
                &params.references,
                &params.citation_style,
            )
            .await
        }
        "note_draft"
        | "related_work_outline"
        | "reading_note_bundle"
        | "claim_evidence_map"
        | "compile_fix"
        | "comparison_table" => verify_note_draft(&params.created_path),
        _ => (
            false,
            vec!["Unsupported artifact type for verification.".to_string()],
        ),
    };
    let (status, summary, blocking) = status_and_summary(passed, &kind);
    let now = now_ms();
    ResearchVerificationRecord {
        id: format!("verification:{}", Uuid::new_v4()),
        task_id: trim(&params.task_id),
        artifact_id: trim(&params.artifact_id),
        kind,
        status,
        summary,
        details,
        blocking,
        created_at: now,
        updated_at: now,
    }
}

fn mark_verification_failed(
    verification: &mut ResearchVerificationRecord,
    message: String,
    extra_details: Vec<String>,
) {
    verification.status = "failed".to_string();
    verification.summary = message.clone();
    verification.blocking = true;
    verification.details.extend(extra_details);
}

fn is_latex_path(path: &str) -> bool {
    let normalized = trim(path).to_lowercase();
    normalized.ends_with(".tex") || normalized.ends_with(".latex")
}

async fn verify_bibliography_and_compile(
    app: AppHandle,
    latex_state: State<'_, LatexState>,
    params: &ResearchVerificationRunParams,
    verification: &mut ResearchVerificationRecord,
) {
    let file_path = trim(&params.file_path);
    if !is_latex_path(&file_path) {
        return;
    }

    let references = normalize_reference_list(&params.references);
    if references.is_empty() {
        mark_verification_failed(
            verification,
            "LaTeX workflow verification failed.".to_string(),
            vec!["No references were supplied for bibliography verification.".to_string()],
        );
        return;
    }

    match references_write_bib_file(ReferenceBibFileParams {
        tex_path: file_path.clone(),
        references: references.clone(),
    })
    .await
    {
        Ok(bib_path) => {
            verification
                .details
                .push(format!("Bibliography file written: {bib_path}"));
        }
        Err(error) => {
            mark_verification_failed(
                verification,
                "LaTeX workflow verification failed.".to_string(),
                vec![format!("Failed to write bibliography file: {error}")],
            );
            return;
        }
    }

    match compile_latex(
        app,
        latex_state,
        file_path.clone(),
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    {
        Ok(result) if result.success => {
            verification
                .details
                .push("LaTeX compile verification succeeded.".to_string());
        }
        Ok(result) => {
            let message = result
                .errors
                .first()
                .map(|entry| entry.message.clone())
                .unwrap_or_else(|| "LaTeX compile verification failed.".to_string());
            mark_verification_failed(
                verification,
                "LaTeX workflow verification failed.".to_string(),
                vec![message],
            );
        }
        Err(error) => {
            mark_verification_failed(
                verification,
                "LaTeX workflow verification failed.".to_string(),
                vec![format!("Failed to run LaTeX compile verification: {error}")],
            );
        }
    }
}

pub(crate) fn list_research_verifications_for_task(
    workspace_path: &str,
    task_id: &str,
) -> Result<Vec<ResearchVerificationRecord>, String> {
    let normalized_workspace_path = trim(workspace_path);
    let normalized_task_id = trim(task_id);
    if normalized_workspace_path.is_empty() || normalized_task_id.is_empty() {
        return Ok(Vec::new());
    }
    let mut verifications = load_workspace_verifications(&normalized_workspace_path)?
        .into_iter()
        .filter(|entry| entry.task_id == normalized_task_id)
        .collect::<Vec<_>>();
    verifications.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(verifications)
}

#[tauri::command]
pub async fn research_verification_run(
    app: AppHandle,
    latex_state: State<'_, LatexState>,
    params: ResearchVerificationRunParams,
) -> Result<ResearchVerificationRunResponse, String> {
    let normalized_workspace_path = trim(&params.workspace_path);
    if normalized_workspace_path.is_empty() {
        return Err("Workspace path is required for research verification.".to_string());
    }
    let mut verifications = load_workspace_verifications(&normalized_workspace_path)?;
    let mut verification = build_verification_record(&params).await;
    if verification.status == "verified" {
        verify_bibliography_and_compile(app, latex_state, &params, &mut verification).await;
    }
    verifications.push(verification.clone());
    verifications.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    persist_workspace_verifications(&normalized_workspace_path, &verifications)?;

    let mut updated_task = None;
    if !trim(&params.task_id).is_empty() {
        let task_verifications =
            list_research_verifications_for_task(&normalized_workspace_path, &params.task_id)?;
        let (verification_verdict, verification_summary, blocked_reason, resume_hint, task_status) =
            aggregate_task_verdict(&task_verifications);
        updated_task = research_task_update(ResearchTaskUpdateParams {
            workspace_path: normalized_workspace_path.clone(),
            task_id: trim(&params.task_id),
            title: None,
            goal: None,
            kind: None,
            status: Some(task_status),
            phase: Some("verification".to_string()),
            success_criteria: None,
            active_document_paths: None,
            reference_ids: None,
            evidence_ids: None,
            artifact_ids: None,
            verification_verdict: Some(verification_verdict),
            verification_summary: Some(verification_summary),
            blocked_reason: Some(blocked_reason),
            resume_hint: Some(resume_hint),
        })
        .await
        .ok()
        .map(|response| response.task);
    }

    Ok(ResearchVerificationRunResponse {
        verification,
        task: updated_task,
    })
}

#[tauri::command]
pub async fn research_verification_list(
    params: ResearchVerificationListParams,
) -> Result<ResearchVerificationListResponse, String> {
    Ok(ResearchVerificationListResponse {
        verifications: if trim(&params.task_id).is_empty() {
            let mut verifications = load_workspace_verifications(&params.workspace_path)?;
            verifications.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
            verifications
        } else {
            list_research_verifications_for_task(&params.workspace_path, &params.task_id)?
        },
    })
}
