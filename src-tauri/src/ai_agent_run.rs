use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::ai_agent_execute::{ai_agent_execute, AiAgentExecuteParams};
use crate::ai_agent_prompt::{ai_agent_build_prompt, AiAgentPromptParams};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunParams {
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub config: Value,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub user_instruction: String,
    #[serde(default)]
    pub conversation: Vec<Value>,
    #[serde(default)]
    pub altals_skills: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub referenced_files: Vec<Value>,
    #[serde(default)]
    pub requested_tools: Vec<Value>,
    #[serde(default)]
    pub runtime_intent: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunResponse {
    pub skill: Value,
    pub behavior_id: String,
    pub events: Vec<Value>,
    pub transport: String,
    pub content: String,
    pub payload: Value,
    pub artifact: Option<Value>,
}

fn string_field(value: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(entry) = value.get(*key).and_then(|entry| entry.as_str()) {
            let normalized = entry.trim();
            if !normalized.is_empty() {
                return normalized.to_string();
            }
        }
    }
    String::new()
}

fn bool_available(section: &Value) -> bool {
    section
        .get("available")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut last_dash = false;
    for ch in value.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_dash = false;
        } else if !last_dash {
            output.push('-');
            last_dash = true;
        }
    }
    output.trim_matches('-').to_string()
}

fn build_doc_patch_artifact(payload: &Value, context_bundle: &Value) -> Option<Value> {
    let replacement_text = {
        let text = string_field(
            payload,
            &["replacement_text", "revised_paragraph", "paragraph"],
        );
        if text.is_empty() {
            return None;
        }
        text
    };
    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    let document = context_bundle.get("document").unwrap_or(&Value::Null);
    if !bool_available(selection) || !bool_available(document) {
        return None;
    }
    let title = {
        let title = string_field(payload, &["title"]);
        if title.is_empty() {
            "Document patch".to_string()
        } else {
            title
        }
    };

    Some(json!({
        "type": "doc_patch",
        "capabilityToolId": "apply-document-patch",
        "capabilityLabelKey": "Apply to draft",
        "filePath": string_field(document, &["filePath", "file_path"]),
        "from": selection.get("from").cloned().unwrap_or(Value::Null),
        "to": selection.get("to").cloned().unwrap_or(Value::Null),
        "originalText": string_field(selection, &["text"]),
        "replacementText": replacement_text,
        "title": title,
        "rationale": string_field(payload, &["rationale"]),
        "citationSuggestion": string_field(payload, &["citation_suggestion"]),
    }))
}

fn build_note_draft_artifact(payload: &Value, context_bundle: &Value) -> Option<Value> {
    let content = string_field(
        payload,
        &["note_markdown", "content", "summary_markdown", "paragraph"],
    );
    if content.is_empty() {
        return None;
    }
    let title = {
        let title = string_field(payload, &["title"]);
        if title.is_empty() {
            "AI note".to_string()
        } else {
            title
        }
    };
    let slug = {
        let value = slugify(&title);
        if value.is_empty() {
            "ai-note".to_string()
        } else {
            value
        }
    };
    let rationale = string_field(payload, &["rationale", "takeaway"]);
    Some(json!({
        "type": "note_draft",
        "capabilityToolId": "open-note-draft",
        "capabilityLabelKey": "Open as draft",
        "title": title,
        "suggestedName": format!("{slug}.md"),
        "content": content,
        "sourceFilePath": string_field(context_bundle.get("document").unwrap_or(&Value::Null), &["filePath", "file_path"]),
        "rationale": rationale,
    }))
}

fn normalize_artifact(behavior_id: &str, payload: &Value, context_bundle: &Value) -> Option<Value> {
    match behavior_id {
        "revise-with-citations" => build_doc_patch_artifact(payload, context_bundle),
        "draft-related-work" => {
            let selection_available =
                bool_available(context_bundle.get("selection").unwrap_or(&Value::Null));
            if selection_available {
                build_doc_patch_artifact(payload, context_bundle)
                    .or_else(|| build_note_draft_artifact(payload, context_bundle))
            } else {
                build_note_draft_artifact(payload, context_bundle)
            }
        }
        "summarize-selection" => build_note_draft_artifact(payload, context_bundle),
        "find-supporting-references" | "workspace-agent" => None,
        _ => None,
    }
}

#[tauri::command]
pub async fn ai_agent_run(params: AiAgentRunParams) -> Result<AiAgentRunResponse, String> {
    let enabled_tool_ids = params
        .config
        .get("enabledTools")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let prompt = ai_agent_build_prompt(AiAgentPromptParams {
        skill: params.skill.clone(),
        context_bundle: params.context_bundle.clone(),
        user_instruction: params.user_instruction.clone(),
        conversation: params.conversation.clone(),
        altals_skills: params.altals_skills.clone(),
        support_files: Vec::new(),
        attachments: params.attachments.clone(),
        referenced_files: params.referenced_files.clone(),
        requested_tools: params.requested_tools.clone(),
        enabled_tool_ids: enabled_tool_ids.clone(),
        runtime_intent: params.runtime_intent.clone(),
    })
    .await?;

    let executed = ai_agent_execute(AiAgentExecuteParams {
        provider_id: params
            .config
            .get("providerId")
            .and_then(Value::as_str)
            .unwrap_or("openai")
            .to_string(),
        skill: params.skill.clone(),
        config: params.config.clone(),
        api_key: params.api_key.clone(),
        conversation: params.conversation.clone(),
        user_prompt: prompt.user_prompt.clone(),
        system_prompt: prompt.system_prompt.clone(),
        context_bundle: params.context_bundle.clone(),
        support_files: Vec::new(),
        enabled_tool_ids: prompt.enabled_tool_ids.clone(),
        workspace_path: string_field(
            params
                .context_bundle
                .get("workspace")
                .unwrap_or(&Value::Null),
            &["path"],
        ),
    })
    .await?;

    let artifact = normalize_artifact(
        &prompt.behavior_id,
        &executed.payload,
        &params.context_bundle,
    );

    Ok(AiAgentRunResponse {
        skill: params.skill,
        behavior_id: prompt.behavior_id,
        events: executed.events,
        transport: executed.transport,
        content: executed.content,
        payload: executed.payload,
        artifact,
    })
}

