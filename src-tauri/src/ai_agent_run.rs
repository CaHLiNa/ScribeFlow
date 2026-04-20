use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use crate::ai_agent_prompt::{ai_agent_build_prompt, AiAgentPromptParams};
use crate::ai_agent_session_runtime::{
    ai_agent_session_complete, ai_agent_session_fail, ai_agent_session_finalize,
    ai_agent_session_interrupt, ai_agent_session_start, AiAgentSessionCompleteParams,
    AiAgentSessionFailParams, AiAgentSessionFinalizeParams, AiAgentSessionInterruptParams,
    AiAgentSessionStartParams,
};
use crate::codex_cli::{codex_cli_run, CodexCliRunParams};
use crate::research_evidence_runtime::{
    ensure_context_bundle_evidence, list_research_evidence_for_task,
};
use crate::research_task_protocol::ResearchTaskUpdateParams;
use crate::research_task_runtime::{
    ensure_research_task_for_thread, research_task_update, sync_research_task_artifacts_for_thread,
    sync_research_task_context_for_thread,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunStartedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunPreparedSessionParams {
    #[serde(default)]
    pub session: Value,
    #[serde(default)]
    pub prepared_run: Value,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub pending_assistant_id: String,
    #[serde(default)]
    pub user_message_id: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub fallback_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentRunStartedSessionResponse {
    pub ok: bool,
    pub stopped: bool,
    pub error: String,
    pub session: Value,
    pub assistant_message: Option<Value>,
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

fn array_field(value: &Value, keys: &[&str]) -> Vec<Value> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

fn normalize_string_entries(values: Vec<String>) -> Vec<String> {
    let mut entries = values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    entries.sort();
    entries.dedup();
    entries
}

fn infer_research_task_kind(skill: &Value, user_instruction: &str) -> String {
    let skill_haystack = [
        string_field(skill, &["id"]),
        string_field(skill, &["slug"]),
        string_field(skill, &["name"]),
        user_instruction.trim().to_lowercase(),
    ]
    .join(" ")
    .to_lowercase();

    if skill_haystack.contains("supporting reference")
        || skill_haystack.contains("supporting references")
    {
        return "find-supporting-references".to_string();
    }
    if skill_haystack.contains("reading note") || skill_haystack.contains("summarize-selection") {
        return "build-reading-note".to_string();
    }
    if skill_haystack.contains("bibliography") {
        return "repair-bibliography".to_string();
    }
    if skill_haystack.contains("citation") || skill_haystack.contains("reference") {
        return "revise-with-citations".to_string();
    }
    if skill_haystack.contains("related-work") || skill_haystack.contains("related work") {
        return "draft-related-work".to_string();
    }
    if skill_haystack.contains("summary") || skill_haystack.contains("summarize") {
        return "summarize-paper".to_string();
    }
    "general-research".to_string()
}

async fn hydrate_research_context_for_session(
    mut session: Value,
    skill: &Value,
    context_bundle: &Value,
    user_instruction: &str,
    resolved_task: &Value,
) -> Result<Value, String> {
    let workspace_path = string_field(
        context_bundle.get("workspace").unwrap_or(&Value::Null),
        &["path"],
    );
    let runtime_thread_id = string_field(&session, &["runtimeThreadId"]);
    if workspace_path.is_empty() || runtime_thread_id.is_empty() {
        return Ok(session);
    }

    let task_title = {
        let current = string_field(resolved_task, &["title"]);
        if current.is_empty() {
            let current = string_field(&session, &["title"]);
            if current.is_empty() {
                let instruction = user_instruction.trim();
                if instruction.is_empty() {
                    "研究任务".to_string()
                } else {
                    truncate_text(instruction, 64)
                }
            } else {
                current
            }
        } else {
            current
        }
    };
    let task_goal = if !string_field(resolved_task, &["goal"]).is_empty() {
        string_field(resolved_task, &["goal"])
    } else if user_instruction.trim().is_empty() {
        format!("完成研究任务：{}", task_title)
    } else {
        user_instruction.trim().to_string()
    };
    let task_kind = if !string_field(resolved_task, &["kind"]).is_empty() {
        string_field(resolved_task, &["kind"])
    } else {
        infer_research_task_kind(skill, user_instruction)
    };
    let active_document_paths = {
        let document = context_bundle.get("document").unwrap_or(&Value::Null);
        let path = string_field(document, &["filePath", "file_path"]);
        normalize_string_entries(if path.is_empty() {
            Vec::new()
        } else {
            vec![path]
        })
    };

    let task = ensure_research_task_for_thread(
        &workspace_path,
        &runtime_thread_id,
        &task_title,
        &task_goal,
        &task_kind,
        active_document_paths.clone(),
    )?;
    let evidence = ensure_context_bundle_evidence(&workspace_path, &task.id, context_bundle)?;
    let evidence_ids = evidence
        .iter()
        .map(|entry| entry.id.clone())
        .collect::<Vec<_>>();
    let reference_ids = normalize_string_entries(
        evidence
            .iter()
            .filter_map(|entry| {
                if entry.reference_id.is_empty() {
                    None
                } else {
                    Some(entry.reference_id.clone())
                }
            })
            .collect(),
    );
    let task = sync_research_task_context_for_thread(
        &workspace_path,
        &runtime_thread_id,
        evidence_ids,
        active_document_paths,
        reference_ids,
    )?
    .unwrap_or(task);
    let success_criteria = resolved_task
        .get("successCriteria")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let task = if success_criteria.is_empty() {
        task
    } else {
        research_task_update(ResearchTaskUpdateParams {
            workspace_path: workspace_path.clone(),
            task_id: task.id.clone(),
            title: None,
            goal: None,
            kind: None,
            status: Some("active".to_string()),
            phase: Some({
                let phase = string_field(resolved_task, &["phase"]);
                if phase.is_empty() {
                    "scoping".to_string()
                } else {
                    phase
                }
            }),
            success_criteria: Some(success_criteria),
            active_document_paths: None,
            reference_ids: None,
            evidence_ids: None,
            artifact_ids: None,
            verification_verdict: None,
            verification_summary: None,
            blocked_reason: None,
            resume_hint: None,
        })
        .await
        .map(|response| response.task)
        .unwrap_or(task)
    };
    let evidence = list_research_evidence_for_task(&workspace_path, &task.id)?;

    session["researchTask"] = serde_json::to_value(task).unwrap_or(Value::Null);
    session["researchEvidence"] = serde_json::to_value(evidence).unwrap_or(Value::Array(vec![]));
    Ok(session)
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn build_artifact_evidence_preview(evidence_entries: &[Value]) -> Vec<Value> {
    evidence_entries
        .iter()
        .filter_map(|entry| {
            let id = string_field(entry, &["id"]);
            let label = string_field(entry, &["label"]);
            if id.is_empty() && label.is_empty() {
                return None;
            }
            Some(json!({
                "id": id,
                "label": label,
                "sourceType": string_field(entry, &["sourceType"]),
                "sourcePath": string_field(entry, &["sourcePath"]),
                "sourceRange": string_field(entry, &["sourceRange"]),
                "referenceId": string_field(entry, &["referenceId"]),
                "citationKey": string_field(entry, &["citationKey"]),
                "excerpt": string_field(entry, &["excerpt"]),
                "whyRelevant": string_field(entry, &["whyRelevant"]),
            }))
        })
        .collect()
}

fn build_artifact_record(
    skill_id: &str,
    artifact: Option<Value>,
    session: &Value,
) -> Option<Value> {
    let Some(artifact) = artifact else {
        return None;
    };
    let Some(mut object) = artifact.as_object().cloned() else {
        return None;
    };
    let research_task = session.get("researchTask").cloned().unwrap_or(Value::Null);
    let evidence_entries = array_field(session, &["researchEvidence"]);
    let evidence_ids = evidence_entries
        .iter()
        .filter_map(|entry| {
            let id = string_field(entry, &["id"]);
            if id.is_empty() {
                None
            } else {
                Some(Value::String(id))
            }
        })
        .collect::<Vec<_>>();
    let artifact_type = string_field(&artifact, &["type"]);
    let verification_required = !matches!(artifact_type.as_str(), "evidence_bundle");
    let risk_level = match artifact_type.as_str() {
        "reference_patch" | "compile_fix" => "high",
        "doc_patch" | "citation_insert" | "claim_evidence_map" | "comparison_table" => "medium",
        _ => "low",
    };
    let rollback_supported = matches!(
        artifact_type.as_str(),
        "doc_patch"
            | "citation_insert"
            | "reference_patch"
            | "note_draft"
            | "related_work_outline"
            | "reading_note_bundle"
            | "claim_evidence_map"
            | "compile_fix"
            | "comparison_table"
    );
    object.insert(
        "id".to_string(),
        Value::String(format!("artifact:{}", Uuid::new_v4().simple())),
    );
    object.insert(
        "skillId".to_string(),
        Value::String(skill_id.trim().to_string()),
    );
    object.insert(
        "taskId".to_string(),
        Value::String(string_field(&research_task, &["id"])),
    );
    object.insert("evidenceIds".to_string(), Value::Array(evidence_ids));
    object.insert(
        "evidencePreview".to_string(),
        Value::Array(build_artifact_evidence_preview(&evidence_entries)),
    );
    object.insert(
        "verificationRequired".to_string(),
        Value::Bool(verification_required),
    );
    object.insert(
        "verificationStatus".to_string(),
        Value::String(if verification_required {
            "pending".to_string()
        } else {
            "not-required".to_string()
        }),
    );
    object.insert(
        "riskLevel".to_string(),
        Value::String(risk_level.to_string()),
    );
    object.insert(
        "rollbackSupported".to_string(),
        Value::Bool(rollback_supported),
    );
    object.insert("status".to_string(), Value::String("pending".to_string()));
    object.insert("createdAt".to_string(), Value::Number(now_ms().into()));
    Some(Value::Object(object))
}

fn should_hydrate_research_task(turn_route: &Value, runtime_intent: &str) -> bool {
    if turn_route
        .get("shouldHydrateResearchTask")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return true;
    }
    runtime_intent.trim() == "skill"
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    let normalized = value.trim();
    if normalized.chars().count() <= max_chars {
        return normalized.to_string();
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

fn response_with_session(
    ok: bool,
    stopped: bool,
    error: String,
    session: Value,
    assistant_message: Option<Value>,
    artifact: Option<Value>,
) -> AiAgentRunStartedSessionResponse {
    AiAgentRunStartedSessionResponse {
        ok,
        stopped,
        error,
        session,
        assistant_message,
        artifact,
    }
}

fn codex_cli_prompt_text(system_prompt: &str, user_prompt: &str) -> String {
    let system = system_prompt.trim();
    let user = user_prompt.trim();
    if system.is_empty() {
        return user.to_string();
    }
    if user.is_empty() {
        return system.to_string();
    }
    format!(
        "Follow the ScribeFlow runtime instructions below.\n\n<System>\n{system}\n</System>\n\n<User>\n{user}\n</User>"
    )
}

fn codex_cli_session_id(session: &Value) -> String {
    let session_id = string_field(session, &["id"]);
    if !session_id.is_empty() {
        return session_id;
    }
    format!("codex-cli:{}", Uuid::new_v4())
}

async fn ai_agent_run_started_session<R: Runtime>(
    _app: AppHandle<R>,
    params: AiAgentRunStartedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run;
    let session = params.session;
    let skill = prepared_run.get("skill").cloned().unwrap_or(Value::Null);
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let context_bundle = prepared_run
        .get("contextBundle")
        .cloned()
        .unwrap_or(Value::Null);
    let config = prepared_run.get("config").cloned().unwrap_or(Value::Null);
    let user_instruction = string_field(&prepared_run, &["userInstruction"]);
    let runtime_intent = string_field(&prepared_run, &["runtimeIntent"]);
    let turn_route = prepared_run
        .get("turnRoute")
        .cloned()
        .unwrap_or(Value::Null);
    let prior_conversation = array_field(&prepared_run, &["priorConversation"]);
    let attachments = array_field(&prepared_run, &["attachments"]);
    let referenced_files = array_field(&prepared_run, &["referencedFiles"]);
    let requested_tools = array_field(&prepared_run, &["requestedTools"]);
    let required_evidence = prepared_run
        .get("requiredEvidence")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let selected_artifacts = prepared_run
        .get("selectedArtifacts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let verification_plan = prepared_run
        .get("verificationPlan")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let invocation = prepared_run
        .get("invocation")
        .cloned()
        .unwrap_or(Value::Null);
    let resolved_task = prepared_run
        .get("resolvedTask")
        .cloned()
        .unwrap_or(Value::Null);
    let research_context_graph = prepared_run
        .get("researchContextGraph")
        .cloned()
        .unwrap_or(Value::Null);
    let research_config = prepared_run
        .get("researchConfig")
        .cloned()
        .unwrap_or(Value::Null);

    let execution_result: Result<(Value, Option<Value>, Option<Value>, Value), String> = async {
        let mut execution_session = session.clone();
        if should_hydrate_research_task(&turn_route, &runtime_intent) {
            execution_session = hydrate_research_context_for_session(
                execution_session,
                &skill,
                &context_bundle,
                &user_instruction,
                &resolved_task,
            )
            .await?;
        }

        let enabled_tool_ids = prepared_run
            .get("enabledToolIds")
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let prompt = ai_agent_build_prompt(AiAgentPromptParams {
            skill: skill.clone(),
            context_bundle: context_bundle.clone(),
            user_instruction: user_instruction.clone(),
            conversation: prior_conversation.clone(),
            scribeflow_skills: params.scribeflow_skills.clone(),
            support_files: Vec::new(),
            attachments: attachments.clone(),
            referenced_files: referenced_files.clone(),
            requested_tools: requested_tools.clone(),
            enabled_tool_ids,
            runtime_intent: runtime_intent.clone(),
            runtime_native_inputs: false,
            turn_route: turn_route.clone(),
            invocation: invocation.clone(),
            resolved_task: resolved_task.clone(),
            required_evidence: required_evidence.clone(),
            selected_artifacts: selected_artifacts.clone(),
            verification_plan: verification_plan.clone(),
            research_context_graph: research_context_graph.clone(),
            research_config: research_config.clone(),
        })
        .await?;

        let codex_result = codex_cli_run(CodexCliRunParams {
            session_id: codex_cli_session_id(&execution_session),
            prompt: codex_cli_prompt_text(&prompt.system_prompt, &prompt.user_prompt),
            cwd: string_field(
                context_bundle.get("workspace").unwrap_or(&Value::Null),
                &["path"],
            ),
            config: config.clone(),
        })
        .await?;

        let runtime_thread_id = string_field(&codex_result, &["threadId", "thread_id"]);
        if !runtime_thread_id.is_empty() {
            execution_session["runtimeThreadId"] = Value::String(runtime_thread_id);
        }
        execution_session["runtimeProviderId"] = Value::String("codex-cli".to_string());
        execution_session["runtimeTransport"] = Value::String("codex-cli".to_string());

        let result = json!({
            "content": string_field(&codex_result, &["content"]),
            "reasoning": "",
            "payload": {
                "events": codex_result.get("events").cloned().unwrap_or(Value::Array(vec![])),
                "stderrPreview": codex_result.get("stderrPreview").cloned().unwrap_or(Value::String(String::new())),
            },
            "transport": "codex-cli",
        });

        Ok((result, None, Some(skill.clone()), execution_session))
    }
    .await;

    match execution_result {
        Ok((result, raw_artifact, response_skill, completed_session_input)) => {
            let mut completed_session_input = completed_session_input;
            let artifact = build_artifact_record(
                &string_field(response_skill.as_ref().unwrap_or(&skill), &["id"]),
                raw_artifact,
                &completed_session_input,
            );
            if let Some(artifact) = artifact.as_ref() {
                let workspace_path = string_field(
                    context_bundle.get("workspace").unwrap_or(&Value::Null),
                    &["path"],
                );
                let runtime_thread_id =
                    string_field(&completed_session_input, &["runtimeThreadId"]);
                let artifact_id = string_field(artifact, &["id"]);
                if !workspace_path.is_empty()
                    && !runtime_thread_id.is_empty()
                    && !artifact_id.is_empty()
                {
                    if let Some(task) = sync_research_task_artifacts_for_thread(
                        &workspace_path,
                        &runtime_thread_id,
                        vec![artifact_id],
                    )? {
                        completed_session_input["researchTask"] =
                            serde_json::to_value(task).unwrap_or(Value::Null);
                    }
                }
            }
            let completed = ai_agent_session_complete(AiAgentSessionCompleteParams {
                session: completed_session_input,
                pending_assistant_id: params.pending_assistant_id,
                skill: response_skill.unwrap_or(skill),
                result,
                artifact: artifact.clone().unwrap_or(Value::Null),
                provider_state,
                context_bundle,
                created_at: params.created_at,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: completed.session,
            })
            .await?;

            Ok(response_with_session(
                true,
                false,
                String::new(),
                finalized.session,
                completed.assistant_message,
                artifact,
            ))
        }
        Err(error) if error.trim() == "AI execution stopped." => {
            let interrupted = ai_agent_session_interrupt(AiAgentSessionInterruptParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: interrupted.session,
            })
            .await?;
            Ok(response_with_session(
                false,
                true,
                error,
                finalized.session,
                None,
                None,
            ))
        }
        Err(error) => {
            let failed = ai_agent_session_fail(AiAgentSessionFailParams {
                session,
                pending_assistant_id: params.pending_assistant_id,
                skill,
                error: error.clone(),
                provider_state,
                context_bundle,
                events: Vec::new(),
                created_at: params.created_at,
            })
            .await?;
            let finalized = ai_agent_session_finalize(AiAgentSessionFinalizeParams {
                session: failed.session,
            })
            .await?;
            Ok(response_with_session(
                false,
                false,
                error,
                finalized.session,
                None,
                None,
            ))
        }
    }
}

#[tauri::command]
pub async fn ai_agent_run_prepared_session<R: Runtime>(
    app: AppHandle<R>,
    params: AiAgentRunPreparedSessionParams,
) -> Result<AiAgentRunStartedSessionResponse, String> {
    let prepared_run = params.prepared_run.clone();
    let skill = prepared_run.get("skill").cloned().unwrap_or(Value::Null);
    let provider_state = prepared_run
        .get("providerState")
        .cloned()
        .unwrap_or(Value::Null);
    let context_bundle = prepared_run
        .get("contextBundle")
        .cloned()
        .unwrap_or(Value::Null);
    let user_instruction = string_field(&prepared_run, &["userInstruction"]);
    let prompt_draft = string_field(&prepared_run, &["promptDraft"]);
    let effective_permission_mode = string_field(&prepared_run, &["effectivePermissionMode"]);
    let started = ai_agent_session_start(AiAgentSessionStartParams {
        session: params.session,
        prepared_run: prepared_run.clone(),
        skill,
        provider_state,
        context_bundle,
        user_instruction,
        prompt_draft,
        effective_permission_mode,
        pending_assistant_id: params.pending_assistant_id.clone(),
        user_message_id: params.user_message_id,
        created_at: params.created_at,
        fallback_title: params.fallback_title,
    })
    .await?;

    ai_agent_run_started_session(
        app,
        AiAgentRunStartedSessionParams {
            session: started.session,
            prepared_run: params.prepared_run,
            scribeflow_skills: params.scribeflow_skills,
            pending_assistant_id: params.pending_assistant_id,
            created_at: params.created_at,
        },
    )
    .await
}
