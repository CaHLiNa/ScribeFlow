use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactApplyDocPatchParams {
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub artifact: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactApplyDocPatchResult {
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactApplyCitationInsertParams {
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub artifact: Value,
    #[serde(default)]
    pub citation_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiArtifactApplyCitationInsertResult {
    pub content: String,
}

fn string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

#[tauri::command]
pub async fn ai_artifact_apply_doc_patch(
    params: AiArtifactApplyDocPatchParams,
) -> Result<AiArtifactApplyDocPatchResult, String> {
    let source = params.content;
    let artifact = params.artifact;
    let from = artifact
        .get("from")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Patch range is outside the current document content.".to_string())?;
    let to = artifact
        .get("to")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Patch range is outside the current document content.".to_string())?;
    if from < 0 || to < from || to as usize > source.len() {
        return Err("Patch range is outside the current document content.".to_string());
    }

    let original_text = string_field(&artifact, "originalText");
    let replacement_text = string_field(&artifact, "replacementText");
    let current_slice = &source[from as usize..to as usize];
    if !original_text.is_empty() && current_slice != original_text {
        return Err(
            "The current document no longer matches the AI patch source selection.".to_string(),
        );
    }

    Ok(AiArtifactApplyDocPatchResult {
        content: format!(
            "{}{}{}",
            &source[..from as usize],
            replacement_text,
            &source[to as usize..]
        ),
    })
}

#[tauri::command]
pub async fn ai_artifact_apply_citation_insert(
    params: AiArtifactApplyCitationInsertParams,
) -> Result<AiArtifactApplyCitationInsertResult, String> {
    let source = params.content;
    let artifact = params.artifact;
    let citation_text = string_field(&json!({ "value": params.citation_text }), "value");
    if citation_text.trim().is_empty() {
        return Err("Citation text is required.".to_string());
    }

    let insert_at = artifact
        .get("insertAt")
        .and_then(Value::as_i64)
        .or_else(|| artifact.get("to").and_then(Value::as_i64))
        .ok_or_else(|| "Citation insert position is missing.".to_string())?;

    if insert_at < 0 || insert_at as usize > source.len() {
        return Err(
            "Citation insert position is outside the current document content.".to_string(),
        );
    }

    let spacer = if insert_at > 0 {
        let previous = source
            .chars()
            .nth(insert_at.saturating_sub(1) as usize)
            .unwrap_or(' ');
        if previous.is_whitespace() || citation_text.starts_with(|ch: char| ch.is_whitespace()) {
            String::new()
        } else {
            " ".to_string()
        }
    } else {
        String::new()
    };

    Ok(AiArtifactApplyCitationInsertResult {
        content: format!(
            "{}{}{}{}",
            &source[..insert_at as usize],
            spacer,
            citation_text,
            &source[insert_at as usize..]
        ),
    })
}
