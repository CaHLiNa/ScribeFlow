use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::path::Path;
use tokio::task;

use crate::ai_config::ai_config_load_internal;
use crate::ai_provider_catalog::resolve_provider_state_value;
use crate::ai_provider_credentials::load_ai_provider_api_key_internal;
use crate::fs_io::read_text_file_with_limit;
use crate::research_context_graph::build_research_context_graph;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPrepareParams {
    pub active_session: Value,
    #[serde(default)]
    pub active_skill: Option<Value>,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub session_mode: String,
    #[serde(default)]
    pub provider_state: Value,
    #[serde(default)]
    pub provider_id: String,
    #[serde(default)]
    pub provider_config: Value,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub flat_files: Vec<Value>,
    #[serde(default)]
    pub research_config: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentPrepareCurrentConfigParams {
    pub active_session: Value,
    #[serde(default)]
    pub active_skill: Option<Value>,
    #[serde(default)]
    pub scribeflow_skills: Vec<Value>,
    #[serde(default)]
    pub context_bundle: Value,
    #[serde(default)]
    pub session_mode: String,
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub flat_files: Vec<Value>,
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> String {
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

fn array_field<'a>(value: &'a Value, keys: &[&str]) -> Vec<Value> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(|entry| entry.as_array()).cloned())
        .unwrap_or_default()
}

fn normalize_invocation_name(value: &str) -> String {
    let trimmed = value.trim().trim_start_matches(['/', '$']);
    let mut out = String::new();
    let mut last_dash = false;
    for ch in trimmed.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn normalize_search_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn tokenize_prompt(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in normalize_search_text(value).chars() {
        if ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            current.push(ch);
        } else if current.chars().count() >= 2 {
            tokens.push(std::mem::take(&mut current));
        } else {
            current.clear();
        }
    }
    if current.chars().count() >= 2 {
        tokens.push(current);
    }
    tokens
}

fn parse_ai_prompt_resource_mentions(prompt: &str) -> (Vec<String>, Vec<String>) {
    let mut file_mentions = Vec::new();
    let mut tool_mentions = Vec::new();
    for token in prompt.split_whitespace() {
        if let Some(rest) = token.strip_prefix('@') {
            let normalized = rest.trim();
            if !normalized.is_empty() && !file_mentions.iter().any(|entry| entry == normalized) {
                file_mentions.push(normalized.to_string());
            }
        }
        if let Some(rest) = token.strip_prefix('#') {
            let normalized = normalize_invocation_name(rest);
            if !normalized.is_empty() && !tool_mentions.iter().any(|entry| entry == &normalized) {
                tool_mentions.push(normalized);
            }
        }
    }
    (file_mentions, tool_mentions)
}

fn relative_workspace_path(workspace_path: &str, target_path: &str) -> String {
    let root = workspace_path.trim_end_matches('/');
    let target = target_path.trim();
    if root.is_empty() || !target.starts_with(root) {
        return target.to_string();
    }
    target
        .trim_start_matches(root)
        .trim_start_matches('/')
        .to_string()
}

fn basename_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_string()
}

fn resolve_mentioned_workspace_files(
    file_mentions: &[String],
    files: &[Value],
    workspace_path: &str,
) -> Vec<Value> {
    file_mentions
        .iter()
        .filter_map(|mention| {
            let normalized_mention = normalize_search_text(mention);
            files.iter().find(|entry| {
                if bool_field(entry, &["is_dir", "isDir"]) {
                    return false;
                }
                let path = string_field(entry, &["path"]);
                if path.is_empty() {
                    return false;
                }
                let relative_path = relative_workspace_path(workspace_path, &path);
                normalize_search_text(&relative_path) == normalized_mention
                    || normalize_search_text(&path) == normalized_mention
                    || normalize_search_text(&string_field(entry, &["name"])) == normalized_mention
                    || normalize_search_text(&basename_path(&relative_path)) == normalized_mention
            })
        })
        .cloned()
        .collect()
}

fn build_skill_slug(skill: &Value) -> String {
    normalize_invocation_name(&string_field(
        skill,
        &["slug", "name", "directoryName", "directory_name", "id"],
    ))
}

fn is_catalog_skill(skill: &Value) -> bool {
    string_field(skill, &["kind"]) == "codex-skill"
}

fn match_catalog_skill(name: &str, skills: &[Value]) -> Option<Value> {
    skills
        .iter()
        .find(|skill| is_catalog_skill(skill) && build_skill_slug(skill) == name)
        .cloned()
}

fn explicit_skill_requirements(skill: &Value) -> Vec<String> {
    let required = array_field(skill, &["requiredContext", "required_context"])
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    if !required.is_empty() {
        return required;
    }

    let slug = build_skill_slug(skill);
    if slug.contains("revise-with-citations") {
        return vec!["workspace", "selection", "reference"]
            .into_iter()
            .map(String::from)
            .collect();
    }
    if slug.contains("summarize-selection") {
        return vec!["workspace", "selection"]
            .into_iter()
            .map(String::from)
            .collect();
    }
    if slug.contains("draft-related-work") {
        return vec!["workspace", "document", "reference"]
            .into_iter()
            .map(String::from)
            .collect();
    }
    if slug.contains("find-supporting-references") {
        return vec!["workspace", "selection"]
            .into_iter()
            .map(String::from)
            .collect();
    }

    vec!["workspace".to_string()]
}

fn context_available(kind: &str, context_bundle: &Value) -> bool {
    let section = context_bundle.get(kind).unwrap_or(&Value::Null);
    bool_field(section, &["available"])
}

fn has_context(required_context: &[String], context_bundle: &Value) -> bool {
    required_context
        .iter()
        .all(|kind| context_available(kind, context_bundle))
}

fn score_prompt_against_keywords(prompt: &str, keywords: &[&str]) -> i32 {
    let normalized_prompt = normalize_search_text(prompt);
    keywords.iter().fold(0, |score, keyword| {
        score
            + if normalized_prompt.contains(keyword) {
                18
            } else {
                0
            }
    })
}

fn keyword_boost_for_skill(skill: &Value, prompt: &str) -> i32 {
    let slug = build_skill_slug(skill);
    if slug.contains("revise-with-citations") {
        return score_prompt_against_keywords(
            prompt,
            &[
                "revise",
                "rewrite",
                "tighten",
                "polish",
                "citation",
                "cite",
                "改写",
                "润色",
                "引用",
                "补引用",
            ],
        );
    }
    if slug.contains("summarize-selection") {
        return score_prompt_against_keywords(
            prompt,
            &[
                "summarize",
                "summary",
                "note",
                "takeaway",
                "总结",
                "摘要",
                "笔记",
                "提炼",
            ],
        );
    }
    if slug.contains("draft-related-work") {
        return score_prompt_against_keywords(
            prompt,
            &[
                "related work",
                "related-work",
                "literature review",
                "compare",
                "position",
                "相关工作",
                "综述",
                "对比",
            ],
        );
    }
    if slug.contains("find-supporting-references") {
        return score_prompt_against_keywords(
            prompt,
            &[
                "support",
                "evidence",
                "missing citation",
                "need citation",
                "reference gap",
                "支撑",
                "证据",
                "缺引用",
                "补文献",
            ],
        );
    }
    0
}

fn score_skill_overlap(skill: &Value, prompt_tokens: &[String]) -> i32 {
    if prompt_tokens.is_empty() {
        return 0;
    }
    let haystack = tokenize_prompt(
        &[
            string_field(skill, &["id"]),
            string_field(skill, &["name"]),
            string_field(skill, &["slug"]),
            string_field(skill, &["description"]),
        ]
        .join(" "),
    );
    if haystack.is_empty() {
        return 0;
    }
    let haystack_set = haystack
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    prompt_tokens.iter().fold(0, |score, token| {
        score + if haystack_set.contains(token) { 5 } else { 0 }
    })
}

fn infer_skill_from_prompt(
    prompt: &str,
    scribeflow_skills: &[Value],
    context_bundle: &Value,
    fallback_skill: Option<Value>,
) -> Option<Value> {
    let prompt_tokens = tokenize_prompt(prompt);
    let ranked = scribeflow_skills
        .iter()
        .filter(|skill| is_catalog_skill(skill))
        .filter(|skill| has_context(&explicit_skill_requirements(skill), context_bundle))
        .map(|skill| {
            (
                keyword_boost_for_skill(skill, prompt) + score_skill_overlap(skill, &prompt_tokens),
                skill.clone(),
            )
        })
        .filter(|(score, _)| *score >= 20)
        .max_by_key(|(score, _)| *score);
    ranked.map(|(_, skill)| skill).or(fallback_skill)
}

fn parse_ai_invocation_input(input: &str) -> Option<(String, String, String, String)> {
    let normalized = input.trim();
    if normalized.is_empty() {
        return None;
    }
    let mut chars = normalized.chars();
    let prefix = chars.next()?;
    if prefix != '/' && prefix != '$' {
        return None;
    }
    let rest = chars.collect::<String>();
    let mut parts = rest.splitn(2, char::is_whitespace);
    let raw_name = parts.next().unwrap_or_default();
    if raw_name.trim().is_empty() {
        return None;
    }
    let remainder = parts.next().unwrap_or_default().trim().to_string();
    Some((
        prefix.to_string(),
        normalize_invocation_name(raw_name),
        raw_name.to_string(),
        remainder,
    ))
}

fn resolve_ai_invocation(
    prompt: &str,
    mode: &str,
    active_skill: Option<Value>,
    scribeflow_skills: &[Value],
    context_bundle: &Value,
    has_explicit_tool_mentions: bool,
) -> (Option<Value>, String, Option<Value>) {
    let fallback_skill = if mode == "agent" && has_explicit_tool_mentions {
        active_skill
    } else {
        infer_skill_from_prompt(prompt, scribeflow_skills, context_bundle, active_skill)
    };
    let Some((prefix, name, raw_name, remainder)) = parse_ai_invocation_input(prompt) else {
        return (fallback_skill, prompt.trim().to_string(), None);
    };

    let invocation = json!({
        "prefix": prefix,
        "name": name,
        "rawName": raw_name,
        "remainder": remainder,
    });

    if mode == "agent" {
        if let Some(skill) = match_catalog_skill(
            invocation
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            scribeflow_skills,
        ) {
            return (
                Some(skill),
                invocation
                    .get("remainder")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                Some(invocation),
            );
        }

        return (fallback_skill, prompt.trim().to_string(), None);
    }

    if invocation.get("prefix").and_then(Value::as_str) == Some("$") {
        if let Some(skill) = match_catalog_skill(
            invocation
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            scribeflow_skills,
        ) {
            return (
                Some(skill),
                invocation
                    .get("remainder")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                Some(invocation),
            );
        }
    }

    (fallback_skill, prompt.trim().to_string(), None)
}

fn normalize_permission_mode(value: &str) -> String {
    let normalized = value.trim();
    if normalized == "plan" {
        "plan".to_string()
    } else if ["acceptEdits", "accept-edits", "per-tool"].contains(&normalized) {
        "accept-edits".to_string()
    } else if ["bypassPermissions", "bypass-permissions", "auto"].contains(&normalized) {
        "bypass-permissions".to_string()
    } else {
        "accept-edits".to_string()
    }
}

fn resolve_default_permission_mode(
    mode: &str,
    provider_id: &str,
    provider_config: &Value,
) -> String {
    if mode == "chat" {
        return "accept-edits".to_string();
    }
    if provider_id == "anthropic" {
        return normalize_permission_mode(&string_field(
            provider_config.get("sdk").unwrap_or(&Value::Null),
            &["approvalMode", "approval_mode"],
        ));
    }
    "accept-edits".to_string()
}

fn normalize_conversation(messages: &[Value]) -> Vec<Value> {
    messages
        .iter()
        .filter_map(|message| {
            let role = string_field(message, &["role"]);
            if role != "user" && role != "assistant" {
                return None;
            }
            let content = string_field(message, &["content"]);
            if content.is_empty() {
                return None;
            }
            Some(json!({
                "role": role,
                "content": content,
            }))
        })
        .collect()
}

fn build_error(code: &str, extra: Value) -> Value {
    let mut payload = Map::new();
    payload.insert("ok".to_string(), Value::Bool(false));
    payload.insert("code".to_string(), Value::String(code.to_string()));
    if let Some(extra_map) = extra.as_object() {
        for (key, value) in extra_map {
            payload.insert(key.clone(), value.clone());
        }
    }
    Value::Object(payload)
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    let normalized = normalize_search_text(haystack);
    needles.iter().any(|needle| normalized.contains(needle))
}

fn should_prefer_agent_execution(
    prompt: &str,
    skill: &Value,
    invocation: Option<&Value>,
    tool_mentions: &[String],
) -> bool {
    let normalized_prompt = normalize_search_text(prompt);

    if !tool_mentions.is_empty() {
        return true;
    }

    if invocation
        .and_then(|value| value.get("prefix"))
        .and_then(Value::as_str)
        == Some("/")
    {
        return true;
    }

    let file_action_requested = [
        "create", "new", "write", "save", "touch ", "mkdir ", "创建", "新建", "写入", "保存",
    ]
    .iter()
    .any(|needle| normalized_prompt.contains(needle));
    let file_target_requested = [
        "file",
        "folder",
        "directory",
        "path",
        "文件",
        "文件夹",
        "目录",
        ".md",
        ".txt",
        ".tex",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
    ]
    .iter()
    .any(|needle| normalized_prompt.contains(needle));
    if file_action_requested && file_target_requested {
        return true;
    }

    if contains_any(
        prompt,
        &[
            "edit",
            "patch",
            "apply",
            "insert citation",
            "update reference",
            "fix",
            "debug",
            "run ",
            "execute",
            "compile",
            "rewrite",
            "search files",
            "list files",
            "rename",
            "delete",
            "modify",
            "修改",
            "修复",
            "调试",
            "运行",
            "执行",
            "编译",
            "插入引用",
            "补引用",
            "更新文献",
            "搜索文件",
            "列出文件",
            "删除",
            "重命名",
            "改写",
        ],
    ) {
        return true;
    }

    let slug = build_skill_slug(skill);
    matches!(
        slug.as_str(),
        "revise-with-citations" | "find-supporting-references" | "fix-latex-compile"
    )
}

fn list_string_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .map(|entry| match entry {
            Value::Array(values) => values
                .iter()
                .filter_map(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            Value::String(text) => text
                .split([',', '\n'])
                .map(|value| value.trim().trim_start_matches('-').trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            _ => Vec::new(),
        })
        .unwrap_or_default()
}

fn inferred_task_kind(skill: &Value, prompt: &str) -> String {
    let explicit = list_string_field(skill, &["researchTaskTypes"]);
    if let Some(kind) = explicit.first() {
        return kind.clone();
    }

    let haystack = [
        string_field(skill, &["slug", "name", "id"]),
        prompt.trim().to_lowercase(),
    ]
    .join(" ")
    .to_lowercase();
    if haystack.contains("related work") || haystack.contains("related-work") {
        return "draft-related-work".to_string();
    }
    if haystack.contains("supporting reference")
        || haystack.contains("supporting references")
        || haystack.contains("缺引用")
        || haystack.contains("补文献")
    {
        return "find-supporting-references".to_string();
    }
    if haystack.contains("summarize")
        || haystack.contains("summary")
        || haystack.contains("reading note")
        || haystack.contains("笔记")
    {
        return "build-reading-note".to_string();
    }
    if haystack.contains("latex")
        || haystack.contains("bibliography")
        || haystack.contains("compile")
    {
        return "fix-latex-compile".to_string();
    }
    if haystack.contains("compare") || haystack.contains("对比") {
        return "compare-papers".to_string();
    }
    "general-research".to_string()
}

fn default_required_evidence_for_task(task_kind: &str) -> Vec<String> {
    match task_kind {
        "revise-with-citations" => vec!["workspace", "document", "selection", "reference"],
        "draft-related-work" => vec!["workspace", "document", "reference"],
        "find-supporting-references" => vec!["workspace", "selection", "reference"],
        "build-reading-note" | "summarize-paper" => vec!["workspace", "selection"],
        "fix-latex-compile" => vec!["workspace", "document"],
        "compare-papers" => vec!["workspace", "reference"],
        _ => vec!["workspace"],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn default_selected_artifacts_for_task(task_kind: &str) -> Vec<String> {
    match task_kind {
        "revise-with-citations" => vec!["doc_patch", "citation_insert"],
        "draft-related-work" => vec!["related_work_outline", "doc_patch"],
        "find-supporting-references" => {
            vec![
                "citation_insert",
                "reference_patch",
                "claim_evidence_map",
                "evidence_bundle",
            ]
        }
        "build-reading-note" | "summarize-paper" => vec!["reading_note_bundle", "note_draft"],
        "fix-latex-compile" => vec!["compile_fix"],
        "compare-papers" => vec!["comparison_table"],
        _ => vec!["note_draft"],
    }
    .into_iter()
    .map(String::from)
    .collect()
}

fn default_verification_plan_for_task(task_kind: &str) -> Vec<String> {
    match task_kind {
        "revise-with-citations" | "find-supporting-references" => vec![
            "验证 citation key 是否可解析".to_string(),
            "验证 reference render 与 BibTeX 导出".to_string(),
        ],
        "fix-latex-compile" => vec![
            "写出 bibliography 文件".to_string(),
            "执行最小 LaTeX compile".to_string(),
        ],
        "draft-related-work" | "build-reading-note" | "summarize-paper" | "compare-papers" => {
            vec!["验证 artifact 草稿文件是否真实创建".to_string()]
        }
        _ => vec!["验证 artifact 是否可审查或可应用".to_string()],
    }
}

fn build_research_defaults(research_config: &Value) -> Value {
    json!({
        "defaultCitationStyle": string_field(research_config, &["defaultCitationStyle"]).if_empty_then(|| "apa".to_string()),
        "evidenceStrategy": string_field(research_config, &["evidenceStrategy"]).if_empty_then(|| "balanced".to_string()),
        "taskCompletionThreshold": string_field(research_config, &["taskCompletionThreshold"]).if_empty_then(|| "strict".to_string()),
    })
}

fn build_resolved_task(skill: &Value, prompt_draft: &str, user_instruction: &str) -> Value {
    let normalized_instruction = if user_instruction.trim().is_empty() {
        prompt_draft.trim().to_string()
    } else {
        user_instruction.trim().to_string()
    };
    let task_kind = inferred_task_kind(skill, &normalized_instruction);
    let selected_artifacts = {
        let from_skill = list_string_field(skill, &["outputArtifactTypes"]);
        if from_skill.is_empty() {
            default_selected_artifacts_for_task(&task_kind)
        } else {
            from_skill
        }
    };
    let resolved_title = if normalized_instruction.is_empty() {
        "研究任务".to_string()
    } else {
        normalized_instruction
            .chars()
            .take(72)
            .collect::<String>()
            .trim()
            .to_string()
    };
    let success_criteria = {
        let mut criteria = Vec::new();
        criteria.push("任务输出必须可回溯到 workspace context 和 research evidence。".to_string());
        criteria.push("输出应优先落到 artifact，而不是停留在聊天文本。".to_string());
        if task_kind == "revise-with-citations" || task_kind == "find-supporting-references" {
            criteria
                .push("涉及引用时必须保持 citation key 与 reference traceability。".to_string());
        }
        if task_kind == "fix-latex-compile" {
            criteria.push("需要给出 compile 级别的验证结论。".to_string());
        }
        criteria
    };

    json!({
        "kind": task_kind,
        "title": resolved_title,
        "goal": if normalized_instruction.is_empty() {
            "完成当前研究任务".to_string()
        } else {
            normalized_instruction
        },
        "status": "active",
        "phase": "scoping",
        "successCriteria": success_criteria,
        "selectedArtifacts": selected_artifacts,
    })
}

trait StringExt {
    fn if_empty_then<F: FnOnce() -> String>(self, fallback: F) -> String;
}

impl StringExt for String {
    fn if_empty_then<F: FnOnce() -> String>(self, fallback: F) -> String {
        if self.trim().is_empty() {
            fallback()
        } else {
            self
        }
    }
}

async fn ai_agent_prepare(params: AiAgentPrepareParams) -> Result<Value, String> {
    let session = params.active_session;
    if !session.is_object() {
        return Ok(build_error("SESSION_UNAVAILABLE", json!({})));
    }

    let normalized_session_mode =
        if params.session_mode.trim() == "chat" || string_field(&session, &["mode"]) == "chat" {
            "chat".to_string()
        } else {
            "agent".to_string()
        };
    let is_agent_session = normalized_session_mode == "agent";
    let prompt_draft = string_field(&session, &["promptDraft", "prompt_draft"]);
    let (file_mentions, tool_mentions) = parse_ai_prompt_resource_mentions(&prompt_draft);
    let (resolved_skill, user_instruction, invocation) = resolve_ai_invocation(
        &prompt_draft,
        &normalized_session_mode,
        params.active_skill.clone(),
        &params.scribeflow_skills,
        &params.context_bundle,
        !tool_mentions.is_empty(),
    );
    let skill = resolved_skill.unwrap_or(Value::Null);
    if skill.is_null() && !is_agent_session {
        return Ok(build_error(
            "AI_SKILL_UNAVAILABLE",
            json!({
                "promptDraft": prompt_draft,
                "invocation": invocation,
            }),
        ));
    }

    if skill.is_object() && !is_catalog_skill(&skill) {
        let required_context = array_field(&skill, &["requiredContext", "required_context"])
            .into_iter()
            .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
            .collect::<Vec<_>>();
        if !required_context
            .iter()
            .all(|kind| context_available(kind, &params.context_bundle))
        {
            return Ok(build_error(
                "MISSING_CONTEXT",
                json!({
                    "skill": skill,
                    "invocation": invocation,
                    "promptDraft": prompt_draft,
                }),
            ));
        }
    } else if skill.is_object()
        && !array_field(&skill, &["requiredContext", "required_context"])
            .into_iter()
            .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
            .all(|kind| context_available(&kind, &params.context_bundle))
    {
        return Ok(build_error(
            "MISSING_CONTEXT",
            json!({
                "skill": skill,
                "invocation": invocation,
                "promptDraft": prompt_draft,
            }),
        ));
    }

    if !bool_field(&params.provider_state, &["ready"]) {
        return Ok(build_error(
            "PROVIDER_NOT_READY",
            json!({
                "skill": skill,
                "invocation": invocation,
                "providerState": params.provider_state,
                "promptDraft": prompt_draft,
            }),
        ));
    }

    let provider_id = params.provider_id.trim().to_string();
    let effective_permission_mode = if normalized_session_mode == "chat" {
        "chat".to_string()
    } else {
        let fallback =
            resolve_default_permission_mode("agent", &provider_id, &params.provider_config);
        let session_mode = string_field(&session, &["permissionMode", "permission_mode"]);
        if session_mode.is_empty() {
            fallback
        } else {
            normalize_permission_mode(&session_mode)
        }
    };

    let mut config = params.provider_config.clone();
    if let Some(map) = config.as_object_mut() {
        let existing_sdk = map.get("sdk").cloned().unwrap_or(Value::Null);
        map.insert(
            "enabledTools".to_string(),
            params
                .provider_state
                .get("enabledToolIds")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        );
        if provider_id == "anthropic" {
            let mut sdk = existing_sdk.as_object().cloned().unwrap_or_default();
            let runtime_mode = string_field(&existing_sdk, &["runtimeMode", "runtime_mode"]);
            sdk.insert(
                "runtimeMode".to_string(),
                Value::String(if !is_agent_session {
                    "http".to_string()
                } else {
                    if runtime_mode.is_empty() {
                        "sdk".to_string()
                    } else {
                        runtime_mode
                    }
                }),
            );
            sdk.insert(
                "approvalMode".to_string(),
                Value::String(if effective_permission_mode == "plan" {
                    "plan".to_string()
                } else {
                    "per-tool".to_string()
                }),
            );
            sdk.insert(
                "autoAllowAll".to_string(),
                Value::Bool(effective_permission_mode == "bypass-permissions"),
            );
            map.insert("sdk".to_string(), Value::Object(sdk));
        }
    }

    let referenced_entries = resolve_mentioned_workspace_files(
        &file_mentions,
        &params.flat_files,
        &params.workspace_path,
    );
    let resolved_task = build_resolved_task(&skill, &prompt_draft, &user_instruction);
    let task_kind = string_field(&resolved_task, &["kind"]);
    let required_evidence = {
        let from_skill = list_string_field(&skill, &["requiredEvidenceTypes"]);
        if from_skill.is_empty() {
            default_required_evidence_for_task(&task_kind)
        } else {
            from_skill
        }
    };
    let selected_artifacts = array_field(&resolved_task, &["selectedArtifacts"])
        .into_iter()
        .filter_map(|entry| entry.as_str().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let verification_plan = {
        let from_skill = list_string_field(&skill, &["verificationHints"]);
        if from_skill.is_empty() {
            default_verification_plan_for_task(&task_kind)
        } else {
            from_skill
        }
    };
    let research_config = build_research_defaults(&params.research_config);
    let research_context_graph =
        build_research_context_graph(&params.context_bundle, &resolved_task, &required_evidence);
    let requested_tools = Vec::new();
    let referenced_files = task::spawn_blocking(move || {
        referenced_entries
            .into_iter()
            .map(|entry| {
                let path = string_field(&entry, &["path"]);
                let content = if path.is_empty() {
                    String::new()
                } else {
                    read_text_file_with_limit(Path::new(&path), Some(64 * 1024)).unwrap_or_default()
                };
                json!({
                    "path": path,
                    "relativePath": relative_workspace_path(&params.workspace_path, &string_field(&entry, &["path"])),
                    "content": content,
                })
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|error| format!("Background task failed: {error}"))?;

    let prior_messages = array_field(&session, &["messages"]);
    let prior_conversation = normalize_conversation(
        &prior_messages
            .into_iter()
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>(),
    );

    let runtime_intent = if is_agent_session {
        if should_prefer_agent_execution(&prompt_draft, &skill, invocation.as_ref(), &tool_mentions)
        {
            "agent".to_string()
        } else if skill.is_object() {
            "skill".to_string()
        } else {
            "chat".to_string()
        }
    } else if invocation.is_some() {
        "skill".to_string()
    } else {
        "chat".to_string()
    };

    Ok(json!({
        "ok": true,
        "session": session,
        "sessionMode": normalized_session_mode,
        "isAgentSession": is_agent_session,
        "promptDraft": prompt_draft,
        "promptMentions": {
            "fileMentions": file_mentions,
            "toolMentions": tool_mentions,
        },
        "requestedToolMentions": if is_agent_session {
            Value::Array(tool_mentions.iter().cloned().map(Value::String).collect())
        } else {
            Value::Array(Vec::new())
        },
        "invocation": invocation,
        "selectionPolicy": {
            "explicitSkillWins": true,
            "explicitToolsWinOverInference": true,
            "builtInToolsBeforeMcpByDefault": true,
        },
        "resolvedTask": resolved_task,
        "requiredEvidence": required_evidence,
        "selectedArtifacts": selected_artifacts,
        "verificationPlan": verification_plan,
        "researchContextGraph": research_context_graph,
        "researchConfig": research_config,
        "skill": skill,
        "providerState": params.provider_state,
        "providerId": provider_id,
        "apiKey": params.api_key,
        "effectivePermissionMode": effective_permission_mode,
        "config": config,
        "contextBundle": params.context_bundle,
        "userInstruction": if is_agent_session && user_instruction.is_empty() {
            prompt_draft
        } else {
            user_instruction
        },
        "runtimeIntent": runtime_intent,
        "referencedFiles": referenced_files,
        "priorConversation": prior_conversation,
        "attachments": session.get("attachments").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
        "requestedTools": Value::Array(requested_tools.into_iter().map(Value::String).collect()),
    }))
}

#[tauri::command]
pub async fn ai_agent_prepare_current_config(
    params: AiAgentPrepareCurrentConfigParams,
) -> Result<Value, String> {
    let config = ai_config_load_internal().await?;
    let provider_id = string_field(&config, &["currentProviderId"]);
    let provider_config = config
        .get("providers")
        .and_then(|providers| providers.get(&provider_id))
        .cloned()
        .unwrap_or(Value::Null);
    let api_key = load_ai_provider_api_key_internal(&provider_id)?.unwrap_or_default();
    let mut provider_state = resolve_provider_state_value(&provider_id, &provider_config, &api_key);
    if let Some(map) = provider_state.as_object_mut() {
        map.insert(
            "enabledToolIds".to_string(),
            config
                .get("enabledTools")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        );
    }

    ai_agent_prepare(AiAgentPrepareParams {
        active_session: params.active_session,
        active_skill: params.active_skill,
        scribeflow_skills: params.scribeflow_skills,
        context_bundle: params.context_bundle,
        session_mode: params.session_mode,
        provider_state,
        provider_id,
        provider_config,
        api_key,
        workspace_path: params.workspace_path,
        flat_files: params.flat_files,
        research_config: config
            .get("researchDefaults")
            .cloned()
            .unwrap_or(Value::Null),
    })
    .await
}
