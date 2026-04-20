use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::ai_skill_support::load_skill_supporting_files;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPromptParams {
    #[serde(default)]
    pub skill: Value,
    #[serde(default)]
    pub invocation: Value,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub user_instruction: String,
    #[serde(default)]
    pub conversation: Vec<Value>,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
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
    #[serde(default)]
    pub runtime_native_inputs: bool,
    #[serde(default)]
    pub turn_route: Value,
    #[serde(default)]
    pub resolved_task: Value,
    #[serde(default)]
    pub required_evidence: Vec<String>,
    #[serde(default)]
    pub selected_artifacts: Vec<String>,
    #[serde(default)]
    pub verification_plan: Vec<String>,
    #[serde(default)]
    pub research_context_graph: Value,
    #[serde(default)]
    pub research_config: Value,
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

fn get_ai_skill_behavior_id(skill: &Value) -> String {
    if string_field(skill, &["kind"]) == "codex-skill" {
        return string_field(skill, &["slug", "name", "id"]);
    }
    string_field(skill, &["id"])
}

fn build_response_contract(behavior_id: &str) -> String {
    match behavior_id.trim() {
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
            "  \"replacement_text\": \"optional related-work paragraph for direct insertion\",",
            "  \"outline_markdown\": \"optional markdown outline when a direct patch is not the right output\",",
            "  \"citation_suggestion\": \"citation placement guidance\",",
            "  \"rationale\": \"how the outline or paragraph follows from the supplied evidence\",",
            "  \"title\": \"optional short title for the outline artifact\"",
            "}",
        ]
        .join("\n"),
        "summarize-selection" => [
            "Return JSON with this shape:",
            "{",
            "  \"title\": \"short note title\",",
            "  \"reading_note_markdown\": \"# Heading\\n\\nstructured markdown reading note\",",
            "  \"takeaway\": \"one sentence takeaway\",",
            "  \"rationale\": \"why these are the key points\"",
            "}",
        ]
        .join("\n"),
        "find-supporting-references" => [
            "Return JSON with this shape:",
            "{",
            "  \"answer\": \"diagnosis of what support is missing\",",
            "  \"citation_suggestion\": \"optional short note about where to insert the citation\",",
            "  \"supporting_references\": [",
            "    {",
            "      \"citationKey\": \"preferred citation key\",",
            "      \"title\": \"reference title\",",
            "      \"whyRelevant\": \"why this reference supports the passage\",",
            "      \"evidenceExcerpt\": \"optional short supporting excerpt\"",
            "    }",
            "  ],",
            "  \"reference_updates\": {",
            "    \"title\": \"optional updated title\",",
            "    \"citationKey\": \"optional corrected citation key\",",
            "    \"identifier\": \"optional DOI or identifier\",",
            "    \"abstract\": \"optional corrected abstract\"",
            "  },",
            "  \"evidence_bundle_markdown\": \"optional markdown evidence bundle when review output is more suitable than an apply artifact\",",
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
    if runtime_intent.trim() == "agent" {
        return false;
    }
    !behavior_id.trim().is_empty()
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

fn build_selection_precedence_block(params: &AiAgentPromptParams) -> String {
    let has_explicit_skill = params.invocation.get("prefix").and_then(Value::as_str) == Some("$");
    let skill_name = string_field(&params.invocation, &["rawName", "name"]);

    let mut lines = vec!["Selection precedence:".to_string()];
    if has_explicit_skill {
        lines.push(format!(
            "- Explicit skill invocation wins for workflow selection: ${}.",
            if skill_name.is_empty() {
                "skill".to_string()
            } else {
                skill_name
            }
        ));
    } else {
        lines.push(
            "- If the user explicitly invokes a skill with $skill, treat that skill as the active workflow."
                .to_string(),
        );
    }
    lines.push(
        "- Use only the capabilities explicitly exposed by the runtime. Do not invent or describe unavailable tools."
            .to_string(),
    );
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

fn build_resolved_task_block(params: &AiAgentPromptParams) -> String {
    if !params.resolved_task.is_object() {
        return String::new();
    }
    let kind = string_field(&params.resolved_task, &["kind"]);
    let title = string_field(&params.resolved_task, &["title"]);
    let goal = string_field(&params.resolved_task, &["goal"]);
    let success_criteria = params
        .resolved_task
        .get("successCriteria")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();

    let mut lines = vec!["Resolved research task:".to_string()];
    if !kind.is_empty() {
        lines.push(format!("- Kind: {kind}"));
    }
    if !title.is_empty() {
        lines.push(format!("- Title: {title}"));
    }
    if !goal.is_empty() {
        lines.push(format!("- Goal: {goal}"));
    }
    if !success_criteria.is_empty() {
        lines.push("- Success criteria:".to_string());
        lines.extend(
            success_criteria
                .into_iter()
                .map(|entry| format!("  - {entry}")),
        );
    }
    lines.join("\n")
}

fn build_turn_route_block(turn_route: &Value) -> String {
    if !turn_route.is_object() {
        return String::new();
    }
    let label = string_field(turn_route, &["label"]);
    let summary = string_field(turn_route, &["summary"]);
    let runtime_intent = string_field(turn_route, &["runtimeIntent", "runtime_intent"]);
    let allowed_tool_ids = turn_route
        .get("allowedToolIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let capability_plan = turn_route
        .get("capabilityPlan")
        .cloned()
        .unwrap_or(Value::Null);
    let approval_preflight = turn_route
        .get("approvalPreflight")
        .cloned()
        .unwrap_or(Value::Null);

    let mut lines = vec!["Turn route:".to_string()];
    if !label.is_empty() {
        lines.push(format!("- Label: {label}"));
    }
    if !runtime_intent.is_empty() {
        lines.push(format!("- Runtime intent: {runtime_intent}"));
    }
    if !summary.is_empty() {
        lines.push(format!("- Summary: {summary}"));
    }
    if capability_plan.is_object() {
        lines.push("- Capability plan:".to_string());
        if bool_field(&capability_plan, &["readWorkspace"]) {
            lines.push("  - Read workspace".to_string());
        }
        if bool_field(&capability_plan, &["writeWorkspace"]) {
            lines.push("  - Write workspace".to_string());
        }
        if bool_field(&capability_plan, &["execCommand"]) {
            lines.push("  - Execute commands".to_string());
        }
        if bool_field(&capability_plan, &["useResearchTask"]) {
            lines.push("  - Hydrate research task".to_string());
        }
        if bool_field(&capability_plan, &["useSkillResponse"]) {
            lines.push("  - Keep skill response contract".to_string());
        }
        let response_mode = string_field(&capability_plan, &["responseMode"]);
        if !response_mode.is_empty() {
            lines.push(format!("  - Response mode: {response_mode}"));
        }
    }
    if approval_preflight.is_object() {
        lines.push(format!(
            "- Approval preflight: {} ({})",
            string_field(&approval_preflight, &["status"]),
            string_field(&approval_preflight, &["reason"])
        ));
    }
    if !allowed_tool_ids.is_empty() {
        lines.push("- Allowed tools:".to_string());
        lines.extend(
            allowed_tool_ids
                .into_iter()
                .map(|entry| format!("  - {entry}")),
        );
    }
    lines.join("\n")
}

fn build_research_defaults_block(research_config: &Value) -> String {
    let citation_style = string_field(research_config, &["defaultCitationStyle"]);
    let evidence_strategy = string_field(research_config, &["evidenceStrategy"]);
    let completion_threshold = string_field(research_config, &["taskCompletionThreshold"]);
    if citation_style.is_empty() && evidence_strategy.is_empty() && completion_threshold.is_empty()
    {
        return String::new();
    }
    [
        "Research defaults:".to_string(),
        format!(
            "- Citation style: {}",
            if citation_style.is_empty() {
                "apa".to_string()
            } else {
                citation_style
            }
        ),
        format!(
            "- Evidence strategy: {}",
            if evidence_strategy.is_empty() {
                "balanced".to_string()
            } else {
                evidence_strategy
            }
        ),
        format!(
            "- Completion threshold: {}",
            if completion_threshold.is_empty() {
                "strict".to_string()
            } else {
                completion_threshold
            }
        ),
    ]
    .join("\n")
}

fn build_research_plan_block(params: &AiAgentPromptParams) -> String {
    let mut lines = Vec::new();
    if !params.required_evidence.is_empty() {
        lines.push("Required evidence:".to_string());
        lines.extend(
            params
                .required_evidence
                .iter()
                .map(|entry| format!("- {entry}")),
        );
    }
    if !params.selected_artifacts.is_empty() {
        if !lines.is_empty() {
            lines.push(String::new());
        }
        lines.push("Preferred artifacts:".to_string());
        lines.extend(
            params
                .selected_artifacts
                .iter()
                .map(|entry| format!("- {entry}")),
        );
    }
    if !params.verification_plan.is_empty() {
        if !lines.is_empty() {
            lines.push(String::new());
        }
        lines.push("Verification plan:".to_string());
        lines.extend(
            params
                .verification_plan
                .iter()
                .map(|entry| format!("- {entry}")),
        );
    }
    lines.join("\n")
}

fn build_research_context_graph_block(graph: &Value) -> String {
    let nodes = graph
        .get("nodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let edges = graph
        .get("edges")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if nodes.is_empty() && edges.is_empty() {
        return String::new();
    }
    let mut lines = vec!["Research context graph:".to_string()];
    if !nodes.is_empty() {
        lines.push("- Nodes:".to_string());
        for node in nodes.iter().take(8) {
            let kind = string_field(node, &["kind"]);
            let label = string_field(node, &["label"]);
            if !label.is_empty() {
                lines.push(format!("  - {kind}: {label}"));
            }
        }
    }
    if !edges.is_empty() {
        lines.push("- Edges:".to_string());
        for edge in edges.iter().take(10) {
            let from = string_field(edge, &["from"]);
            let to = string_field(edge, &["to"]);
            let relation = string_field(edge, &["relation"]);
            if !from.is_empty() && !to.is_empty() {
                lines.push(format!("  - {from} --{relation}--> {to}"));
            }
        }
    }
    lines.join("\n")
}

fn build_available_skills_block(scribeflow_skills: &[Value]) -> String {
    let entries = scribeflow_skills
        .iter()
        .filter(|skill| string_field(skill, &["kind"]) == "codex-skill")
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
                string_field(skill, &["description", "shortDescription"]),
                string_field(skill, &["pathToSkillMd"]),
            ))
        })
        .collect::<Vec<_>>();
    if entries.is_empty() {
        return [
            "## Skills".to_string(),
            "A skill is a set of local instructions stored in a `SKILL.md` package. No skills are currently available in this session.".to_string(),
        ]
        .join("\n");
    }
    let mut lines = vec![
        "## Skills".to_string(),
        "A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used in this session.".to_string(),
        "### Available skills".to_string(),
    ];
    for (name, description, path) in entries {
        let description_text = if description.is_empty() {
            String::new()
        } else {
            format!(": {description}")
        };
        let path_text = if path.is_empty() {
            String::new()
        } else {
            format!(" (file: {path})")
        };
        lines.push(format!("- {name}{description_text}{path_text}"));
    }
    lines.join("\n")
}

fn build_skill_support_prompt_block(files: &[Value]) -> String {
    if files.is_empty() {
        return "Skill support files loaded: none.".to_string();
    }
    let mut lines = vec!["Skill support files loaded from the active skill package:".to_string()];
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
    if string_field(skill, &["kind"]) == "codex-skill" {
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
            "Type: Codex skill package".to_string(),
            format!(
                "Source path: {}",
                {
                    let path = string_field(skill, &["pathToSkillMd", "pathToSkillDir"]);
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
            "- Treat the skill instructions as the active workflow.".to_string(),
            "- Stay close to the supplied workspace context.".to_string(),
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
        build_research_defaults_block(&params.research_config),
        String::new(),
        build_turn_route_block(&params.turn_route),
        String::new(),
        build_resolved_task_block(params),
        String::new(),
        build_research_plan_block(params),
        String::new(),
        build_research_context_graph_block(&params.research_context_graph),
        String::new(),
        build_workspace_context_prompt_block(&params.context_bundle),
        String::new(),
        build_available_skills_block(&params.scribeflow_skills),
        String::new(),
        build_selection_precedence_block(params),
    ];
    if !params.runtime_native_inputs {
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
    }
    lines.join("\n")
}

fn build_chat_mode_user_prompt(params: &AiAgentPromptParams) -> String {
    let mut lines = vec![
        "User request:".to_string(),
        if params.user_instruction.trim().is_empty() {
            "Respond to the user using the available conversation and workspace context when relevant."
                .to_string()
        } else {
            params.user_instruction.trim().to_string()
        },
        String::new(),
        build_turn_route_block(&params.turn_route),
        String::new(),
        build_workspace_context_prompt_block(&params.context_bundle),
    ];
    if !params.runtime_native_inputs {
        let conversation = build_conversation_block(&params.conversation);
        if !conversation.is_empty() {
            lines.push(String::new());
            lines.push(conversation);
        }
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
        build_turn_route_block(&params.turn_route),
        String::new(),
        build_selection_precedence_block(params),
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

pub async fn ai_agent_build_prompt(
    params: AiAgentPromptParams,
) -> Result<AiAgentPromptResponse, String> {
    let mut params = params;
    if !params.runtime_native_inputs
        && params.support_files.is_empty()
        && string_field(&params.skill, &["kind"]) == "codex-skill"
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
        let route_label = string_field(&params.turn_route, &["label"]);
        let route_summary = string_field(&params.turn_route, &["summary"]);
        let mut lines = vec![
            if params.runtime_intent.trim() == "agent" {
                "You are an agent embedded in a local-first desktop research and coding workbench."
            } else {
                "You are an assistant embedded in a local-first desktop research and coding workbench."
            }
            .to_string(),
            if params.runtime_intent.trim() == "agent" {
                "Operate directly on the current workspace. Use available context, tools, and prior conversation to continue the task. Do not ask the user to choose an instruction pack unless genuinely blocked."
            } else {
                "Use the supplied workspace context carefully and do not invent file contents, evidence, or citations."
            }
            .to_string(),
            "Prefer task-oriented outputs over chatty prose: ground claims in evidence, produce reviewable artifacts when possible, and avoid unsupported scholarly assertions.".to_string(),
            "If the task touches citations, references, or bibliography, preserve cite keys and source traceability so the runtime can verify the result.".to_string(),
            "Skills are provided as an explicit catalog in the prompt. Treat them as Codex-style `SKILL.md` packages and do not infer extra skills from workspace filenames.".to_string(),
            "Do not invent unavailable runtime capabilities or workspace edit powers.".to_string(),
            "Treat the resolved research task, evidence requirements, preferred artifacts, and verification plan as the primary contract for this run.".to_string(),
            if !route_label.is_empty() {
                format!("The Rust router already resolved this turn as `{route_label}`.")
            } else {
                String::new()
            },
            if !route_summary.is_empty() {
                format!("Follow the capability plan exactly: {route_summary}.")
            } else {
                String::new()
            },
            if params.runtime_native_inputs {
                "Runtime-native context inputs may already include attachments, files, selections, references, and tool hints. Do not ask for them again unless genuinely missing.".to_string()
            } else {
                String::new()
            },
            format!(
                "{}: {}.",
                if params.runtime_intent.trim() == "agent" {
                    "Current mode"
                } else {
                    "Current skill"
                },
                if behavior_id.is_empty() {
                    "agent".to_string()
                } else {
                    behavior_id.clone()
                }
            ),
        ];
        if structured {
            lines.push("Return valid JSON only.".to_string());
        }
        lines
            .into_iter()
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    };
    let user_prompt = if params.runtime_intent.trim() == "agent" {
        build_agent_mode_user_prompt(&params)
    } else if params.runtime_intent.trim() == "chat" && behavior_id.is_empty() {
        build_chat_mode_user_prompt(&params)
    } else {
        build_skill_mode_user_prompt(&params, &behavior_id, structured)
    };

    Ok(AiAgentPromptResponse {
        system_prompt,
        user_prompt,
        behavior_id,
        structured,
        enabled_tool_ids: Vec::new(),
    })
}
