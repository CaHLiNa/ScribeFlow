use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ai_skill_support::load_skill_supporting_files;
use crate::ai_tool_catalog::{build_ai_tool_prompt_block, resolve_runtime_tool_ids};

const DEFAULT_AGENT_ACTION_ID: &str = "workspace-agent";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPromptParams {
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub user_instruction: String,
    #[serde(default)]
    pub conversation: Vec<Value>,
    #[serde(default)]
    pub altals_skills: Vec<Value>,
    #[serde(default)]
    pub support_files: Vec<Value>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub referenced_files: Vec<Value>,
    #[serde(default)]
    pub requested_tools: Vec<Value>,
    #[serde(default)]
    pub enabled_tool_ids: Vec<String>,
    #[serde(default)]
    pub runtime_intent: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPromptResponse {
    pub system_prompt: String,
    pub user_prompt: String,
    pub behavior_id: String,
    pub structured: bool,
    pub enabled_tool_ids: Vec<String>,
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

fn bool_field(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|entry| entry.as_bool()))
        .unwrap_or(false)
}

fn is_default_agent_action_id(id: &str) -> bool {
    id.trim() == DEFAULT_AGENT_ACTION_ID
}

fn get_ai_skill_behavior_id(skill: &Value) -> String {
    let kind = string_field(skill, &["kind"]);
    if kind == "filesystem-skill" {
        return string_field(skill, &["slug", "name", "id"]);
    }
    string_field(skill, &["id"])
}

fn build_response_contract(behavior_id: &str) -> String {
    match behavior_id.trim() {
        DEFAULT_AGENT_ACTION_ID => [
            "Return JSON with this shape:",
            "{",
            "  \"answer\": \"direct answer for the user\",",
            "  \"rationale\": \"brief note about which workspace context supported the answer\"",
            "}",
        ]
        .join("\n"),
        "revise-with-citations" => [
            "Return JSON with this shape:",
            "{",
            "  \"replacement_text\": \"the revised paragraph only\",",
            "  \"citation_suggestion\": \"where the citation should appear\",",
            "  \"rationale\": \"why this revision follows from the supplied context\"",
            "}",
        ]
        .join("\n"),
        "draft-related-work" => [
            "Return JSON with this shape:",
            "{",
            "  \"paragraph\": \"related-work paragraph\",",
            "  \"citation_suggestion\": \"citation placement guidance\",",
            "  \"rationale\": \"how the paragraph uses the supplied reference\",",
            "  \"title\": \"optional short title for a note if no direct patch should be applied\"",
            "}",
        ]
        .join("\n"),
        "summarize-selection" => [
            "Return JSON with this shape:",
            "{",
            "  \"title\": \"short note title\",",
            "  \"note_markdown\": \"# Heading\\n\\nstructured markdown note\",",
            "  \"takeaway\": \"one sentence takeaway\",",
            "  \"rationale\": \"why these are the key points\"",
            "}",
        ]
        .join("\n"),
        "find-supporting-references" => [
            "Return JSON with this shape:",
            "{",
            "  \"answer\": \"diagnosis of what support is missing\",",
            "  \"rationale\": \"what in the passage created this diagnosis\",",
            "  \"title\": \"optional short label\"",
            "}",
        ]
        .join("\n"),
        _ => [
            "Return JSON with this shape:",
            "{",
            "  \"answer\": \"useful answer\",",
            "  \"rationale\": \"brief support note\"",
            "}",
        ]
        .join("\n"),
    }
}

fn requires_structured_agent_response(behavior_id: &str, runtime_intent: &str) -> bool {
    if runtime_intent.trim() == "agent" && is_default_agent_action_id(behavior_id) {
        return false;
    }
    !is_default_agent_action_id(behavior_id)
}

fn build_referenced_files_block(referenced_files: &[Value]) -> String {
    if referenced_files.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Referenced files:".to_string()];
    for file in referenced_files {
        let header = format!("- {}", {
            let relative = string_field(file, &["relativePath", "relative_path"]);
            if relative.is_empty() {
                string_field(file, &["path"])
            } else {
                relative
            }
        });
        let content = string_field(file, &["content"]);
        if content.is_empty() {
            lines.push(header);
            lines.push("  (content unavailable)".to_string());
        } else {
            let limited = if content.chars().count() > 5000 {
                format!(
                    "{}…",
                    content.chars().take(5000).collect::<String>().trim_end()
                )
            } else {
                content
            };
            lines.push(header);
            lines.push("```text".to_string());
            lines.push(limited);
            lines.push("```".to_string());
        }
    }
    lines.join("\n")
}

fn build_attachment_block(attachments: &[Value]) -> String {
    if attachments.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Attached files:".to_string()];
    for attachment in attachments {
        let summary = format!("- {} ({})", string_field(attachment, &["name"]), {
            let media_type = string_field(attachment, &["mediaType", "media_type"]);
            if media_type.is_empty() {
                "unknown".to_string()
            } else {
                media_type
            }
        });
        if !bool_field(attachment, &["isText", "is_text"]) {
            lines.push(summary);
            lines.push(
                "  Non-text attachment attached in the desktop app. Use metadata only unless more context is requested."
                    .to_string(),
            );
            continue;
        }
        let read_error = string_field(attachment, &["readError", "read_error"]);
        if !read_error.is_empty() {
            lines.push(summary);
            lines.push(format!("  Failed to read content: {read_error}"));
            continue;
        }
        let content = string_field(attachment, &["content"]);
        if content.is_empty() {
            lines.push(summary);
            lines.push("  No inline text preview available.".to_string());
            continue;
        }
        lines.push(summary);
        lines.push("```text".to_string());
        lines.push(content);
        lines.push("```".to_string());
    }
    lines.join("\n")
}

fn build_requested_tools_block(requested_tools: &[Value]) -> String {
    let entries = requested_tools
        .iter()
        .filter_map(|tool| {
            if let Some(value) = tool.as_str() {
                let normalized = value.trim();
                if !normalized.is_empty() {
                    return Some(normalized.to_string());
                }
            }
            None
        })
        .collect::<Vec<_>>();
    if entries.is_empty() {
        return String::new();
    }
    let mut lines = vec!["User-mentioned tools:".to_string()];
    lines.extend(entries.into_iter().map(|tool| format!("- {tool}")));
    lines.join("\n")
}

fn build_conversation_block(conversation: &[Value]) -> String {
    if conversation.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Recent conversation:".to_string()];
    for message in conversation {
        let role = string_field(message, &["role"]).to_uppercase();
        let content = string_field(message, &["content"]);
        if !role.is_empty() && !content.is_empty() {
            lines.push(format!("{role}: {content}"));
        }
    }
    lines.join("\n")
}

fn build_workspace_context_prompt_block(context_bundle: &Value) -> String {
    let workspace_path = string_field(
        context_bundle.get("workspace").unwrap_or(&Value::Null),
        &["path"],
    );
    let document_path = string_field(
        context_bundle.get("document").unwrap_or(&Value::Null),
        &["filePath", "file_path"],
    );
    let selection = context_bundle.get("selection").unwrap_or(&Value::Null);
    let selection_text = {
        let preview = string_field(selection, &["preview"]);
        if preview.is_empty() {
            string_field(selection, &["text"])
        } else {
            preview
        }
    };
    let reference = context_bundle.get("reference").unwrap_or(&Value::Null);
    let reference_title = string_field(reference, &["title"]);
    let reference_key = string_field(reference, &["citationKey", "citation_key"]);

    [
        "Workspace context:".to_string(),
        format!(
            "- Folder: {}",
            if workspace_path.is_empty() {
                "Unavailable".to_string()
            } else {
                workspace_path
            }
        ),
        format!(
            "- Active document: {}",
            if document_path.is_empty() {
                "Unavailable".to_string()
            } else {
                document_path
            }
        ),
        format!(
            "- Selection: {}",
            if selection_text.is_empty() {
                "Unavailable".to_string()
            } else {
                selection_text
            }
        ),
        format!("- Reference: {}", {
            let combined = [reference_key, reference_title]
                .into_iter()
                .filter(|entry| !entry.is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            if combined.is_empty() {
                "Unavailable".to_string()
            } else {
                combined
            }
        }),
    ]
    .join("\n")
}

fn build_available_skills_block(altals_skills: &[Value]) -> String {
    let entries = altals_skills
        .iter()
        .filter(|skill| string_field(skill, &["kind"]) == "filesystem-skill")
        .filter_map(|skill| {
            let name = string_field(
                skill,
                &["name", "slug", "directoryName", "directory_name", "id"],
            );
            if name.is_empty() {
                return None;
            }
            Some((
                name,
                string_field(skill, &["description"]),
                string_field(skill, &["scope"]),
            ))
        })
        .collect::<Vec<_>>();
    if entries.is_empty() {
        return "Available filesystem skills:\n- None discovered.".to_string();
    }
    let mut lines = vec!["Available filesystem skills:".to_string()];
    for (name, description, scope) in entries {
        let scope_text = if scope.is_empty() {
            String::new()
        } else {
            format!(" [{scope}]")
        };
        let description_text = if description.is_empty() {
            String::new()
        } else {
            format!(": {description}")
        };
        lines.push(format!("- {name}{scope_text}{description_text}"));
    }
    lines.join("\n")
}

fn build_available_tools_block(enabled_tool_ids: &[String], runtime_intent: &str) -> String {
    build_ai_tool_prompt_block(enabled_tool_ids, runtime_intent)
}

fn build_skill_support_prompt_block(files: &[Value]) -> String {
    if files.is_empty() {
        return "Instruction-pack support files loaded: none.".to_string();
    }
    let mut lines =
        vec!["Instruction-pack support files loaded from the current skill directory:".to_string()];
    for file in files {
        lines.push(format!(
            "- {}",
            string_field(file, &["relativePath", "relative_path"])
        ));
        lines.push("```text".to_string());
        lines.push(string_field(file, &["content"]));
        lines.push("```".to_string());
    }
    lines.join("\n")
}

fn build_agent_context_snapshot(skill: &Value, context_bundle: &Value) -> String {
    if string_field(skill, &["kind"]) == "filesystem-skill" {
        let supporting_files = skill
            .get("supportingFiles")
            .or_else(|| skill.get("supporting_files"))
            .and_then(Value::as_array)
            .map(|files| {
                files
                    .iter()
                    .filter_map(|file| file.as_str().map(|value| value.to_string()))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_default();
        return [
            format!(
                "Skill: {}",
                {
                    let name = string_field(skill, &["name", "slug"]);
                    if name.is_empty() {
                        "Unnamed skill".to_string()
                    } else {
                        name
                    }
                }
            ),
            "Type: Filesystem skill".to_string(),
            format!(
                "Source path: {}",
                {
                    let path = string_field(skill, &["skillFilePath", "skill_file_path", "directoryPath", "directory_path"]);
                    if path.is_empty() {
                        "unknown".to_string()
                    } else {
                        path
                    }
                }
            ),
            format!(
                "Scope: {}",
                match string_field(skill, &["scope"]).as_str() {
                    "user" => "User scope".to_string(),
                    "workspace" => "Workspace scope".to_string(),
                    _ => "unknown".to_string(),
                }
            ),
            format!(
                "Supporting files in skill directory: {}",
                if supporting_files.is_empty() {
                    "None discovered".to_string()
                } else {
                    supporting_files
                }
            ),
            String::new(),
            "Workspace context:".to_string(),
            build_workspace_context_prompt_block(context_bundle)
                .trim_start_matches("Workspace context:\n")
                .to_string(),
            String::new(),
            "Skill instructions (from SKILL.md):".to_string(),
            "```md".to_string(),
            string_field(skill, &["markdown"]),
            "```".to_string(),
            String::new(),
            "Requirements:".to_string(),
            "- Treat the skill instructions as the active instruction pack.".to_string(),
            "- Stay close to the supplied Altals workspace context.".to_string(),
            "- If the skill expects tools or files not yet available, say so explicitly instead of inventing them.".to_string(),
        ]
        .join("\n");
    }

    format!(
        "Action: {}",
        string_field(skill, &["titleKey", "name", "id"])
    )
}

fn build_agent_mode_user_prompt(params: &AiAgentPromptParams) -> String {
    let mut lines = vec![
        "Current task:".to_string(),
        if params.user_instruction.trim().is_empty() {
            "Continue the task using the available workspace context.".to_string()
        } else {
            params.user_instruction.trim().to_string()
        },
        String::new(),
        build_workspace_context_prompt_block(&params.context_bundle),
        String::new(),
        build_available_skills_block(&params.altals_skills),
        String::new(),
        build_available_tools_block(&params.enabled_tool_ids, &params.runtime_intent),
    ];
    let referenced = build_referenced_files_block(&params.referenced_files);
    if !referenced.is_empty() {
        lines.push(String::new());
        lines.push(referenced);
    }
    let attachments = build_attachment_block(&params.attachments);
    if !attachments.is_empty() {
        lines.push(String::new());
        lines.push(attachments);
    }
    let requested = build_requested_tools_block(&params.requested_tools);
    if !requested.is_empty() {
        lines.push(String::new());
        lines.push(requested);
    }
    let conversation = build_conversation_block(&params.conversation);
    if !conversation.is_empty() {
        lines.push(String::new());
        lines.push(conversation);
    }
    lines.join("\n")
}

fn build_skill_mode_user_prompt(
    params: &AiAgentPromptParams,
    behavior_id: &str,
    structured: bool,
) -> String {
    let mut lines = vec![
        build_agent_context_snapshot(&params.skill, &params.context_bundle),
        String::new(),
        build_skill_support_prompt_block(&params.support_files),
        String::new(),
        build_available_tools_block(&params.enabled_tool_ids, &params.runtime_intent),
    ];
    let referenced = build_referenced_files_block(&params.referenced_files);
    if !referenced.is_empty() {
        lines.push(String::new());
        lines.push(referenced);
    }
    let attachments = build_attachment_block(&params.attachments);
    if !attachments.is_empty() {
        lines.push(String::new());
        lines.push(attachments);
    }
    let requested = build_requested_tools_block(&params.requested_tools);
    if !requested.is_empty() {
        lines.push(String::new());
        lines.push(requested);
    }
    let conversation = build_conversation_block(&params.conversation);
    if !conversation.is_empty() {
        lines.push(String::new());
        lines.push(conversation);
    }
    lines.push(String::new());
    lines.push(if params.user_instruction.trim().is_empty() {
        "Additional user instruction:\nNone.".to_string()
    } else {
        format!(
            "Additional user instruction:\n{}",
            params.user_instruction.trim()
        )
    });
    if structured {
        lines.push(String::new());
        lines.push(build_response_contract(behavior_id));
    }
    lines.join("\n")
}

#[tauri::command]
pub async fn ai_agent_build_prompt(
    params: AiAgentPromptParams,
) -> Result<AiAgentPromptResponse, String> {
    let mut params = params;
    if params.support_files.is_empty()
        && string_field(&params.skill, &["kind"]) == "filesystem-skill"
        && params
            .enabled_tool_ids
            .iter()
            .any(|tool_id| tool_id.trim() == "load-skill-support-files")
    {
        params.support_files = load_skill_supporting_files(&params.skill);
    }
    let behavior_id = get_ai_skill_behavior_id(&params.skill);
    let structured = requires_structured_agent_response(&behavior_id, &params.runtime_intent);
    let system_prompt = {
        let mut lines = vec![
            if params.runtime_intent.trim() == "agent" {
                "You are Altals Agent, a local-first workspace agent embedded in a desktop research and coding workbench."
            } else if is_default_agent_action_id(&behavior_id) {
                "You are Altals Agent, a local-first workspace assistant embedded in a desktop research and coding workbench."
            } else {
                "You are Altals AI, a local-first assistant embedded in a desktop research and coding workbench."
            }
            .to_string(),
            if params.runtime_intent.trim() == "agent" {
                "Operate directly on the current workspace. Use available context, tools, and prior conversation to continue the task. Do not ask the user to choose an instruction pack unless genuinely blocked."
            } else if is_default_agent_action_id(&behavior_id) {
                "Answer directly using the supplied workspace context. Do not invent file contents, evidence, or citations."
            } else {
                "Use the supplied workspace context carefully and do not invent file contents, evidence, or citations."
            }
            .to_string(),
            "Filesystem skills are provided as an explicit catalog in the prompt. Do not infer available skills by searching workspace filenames.".to_string(),
            "If the request involves creating, writing, editing, or opening workspace files and matching tools are listed as available, call those tools instead of claiming the capability is unavailable.".to_string(),
            format!("Current entry: {}.", if behavior_id.is_empty() { string_field(&params.skill, &["id"]) } else { behavior_id.clone() }),
        ];
        if structured {
            lines.push("Return valid JSON only.".to_string());
        }
        lines.join(" ")
    };
    let user_prompt =
        if params.runtime_intent.trim() == "agent" && is_default_agent_action_id(&behavior_id) {
            build_agent_mode_user_prompt(&params)
        } else {
            build_skill_mode_user_prompt(&params, &behavior_id, structured)
        };

    Ok(AiAgentPromptResponse {
        system_prompt,
        user_prompt,
        behavior_id,
        structured,
        enabled_tool_ids: resolve_runtime_tool_ids(
            &params.enabled_tool_ids,
            &params.runtime_intent,
        ),
    })
}

