use serde::{Deserialize, Serialize};
use serde_json::Value;

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
