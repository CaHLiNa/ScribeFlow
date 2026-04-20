use serde_json::Value;

use crate::ai_turn_intent::{TurnCapabilityPlan, TurnExecutionRoute, TurnIntent, TurnResponseMode};
use crate::ai_turn_policy::{build_approval_preflight, build_turn_tool_allowlist};

#[derive(Debug, Clone)]
pub struct TurnRouterInput {
    pub session: Value,
    pub session_mode: String,
    pub prompt: String,
    pub skill: Value,
    pub invocation: Option<Value>,
    pub tool_mentions: Vec<String>,
    pub enabled_tool_ids: Vec<String>,
    pub permission_mode: String,
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

fn normalize_search_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    let normalized = normalize_search_text(haystack);
    needles.iter().any(|needle| normalized.contains(needle))
}

fn skill_slug(skill: &Value) -> String {
    [
        string_field(skill, &["slug"]),
        string_field(skill, &["name"]),
        string_field(skill, &["id"]),
    ]
    .join(" ")
    .to_lowercase()
}

fn is_explicit_skill_invocation(invocation: Option<&Value>) -> bool {
    invocation
        .and_then(|value| value.get("prefix"))
        .and_then(Value::as_str)
        == Some("$")
}

fn is_explicit_agent_invocation(invocation: Option<&Value>) -> bool {
    invocation
        .and_then(|value| value.get("prefix"))
        .and_then(Value::as_str)
        == Some("/")
}

fn looks_like_workspace_read(prompt: &str) -> bool {
    contains_any(
        prompt,
        &[
            "read ",
            "open ",
            "show ",
            "list ",
            "find ",
            "search ",
            "look at",
            "explain this file",
            "看看",
            "查看",
            "读取",
            "打开",
            "列出",
            "搜索",
            "找出",
            "解释文件",
        ],
    )
}

fn looks_like_workspace_write(prompt: &str) -> bool {
    let normalized = normalize_search_text(prompt);
    let file_action_requested = [
        "create",
        "new",
        "write",
        "save",
        "touch ",
        "mkdir ",
        "rename",
        "delete",
        "edit",
        "patch",
        "apply",
        "modify",
        "update",
        "insert citation",
        "update reference",
        "创建",
        "新建",
        "写入",
        "保存",
        "重命名",
        "删除",
        "修改",
        "补引用",
        "插入引用",
        "更新文献",
    ]
    .iter()
    .any(|needle| normalized.contains(needle));
    let file_target_requested = [
        "file",
        "folder",
        "directory",
        "path",
        "workspace",
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
    .any(|needle| normalized.contains(needle));
    file_action_requested && file_target_requested
        || contains_any(
            &normalized,
            &[
                "apply patch",
                "edit the file",
                "fix this file",
                "patch this",
                "改这个文件",
                "修这个文件",
            ],
        )
}

fn looks_like_command_exec(prompt: &str) -> bool {
    contains_any(
        prompt,
        &[
            "run ",
            "execute",
            "shell",
            "terminal",
            "command",
            "compile",
            "build",
            "cargo ",
            "npm ",
            "pnpm ",
            "uv ",
            "pytest",
            "运行",
            "执行",
            "终端",
            "命令",
            "编译",
            "构建",
            "运行测试",
            "执行测试",
        ],
    )
}

fn is_research_execution_skill(skill: &Value) -> bool {
    let slug = skill_slug(skill);
    [
        "revise-with-citations",
        "find-supporting-references",
        "draft-related-work",
        "fix-latex-compile",
        "citation",
        "reference",
        "bibliography",
        "related work",
    ]
    .iter()
    .any(|needle| slug.contains(needle))
}

fn looks_like_approval_continuation(prompt: &str) -> bool {
    let normalized = normalize_search_text(prompt);
    [
        "批准", "允许", "继续", "同意", "approve", "allow", "continue", "yes", "y ",
    ]
    .iter()
    .any(|needle| normalized == *needle || normalized.starts_with(needle))
}

fn build_capability_plan(intent: &TurnIntent, use_skill_response: bool) -> TurnCapabilityPlan {
    match intent {
        TurnIntent::AnswerOnly => TurnCapabilityPlan {
            read_workspace: false,
            write_workspace: false,
            exec_command: false,
            use_research_task: false,
            use_skill_response: false,
            needs_approval: false,
            needs_user_input: false,
            response_mode: TurnResponseMode::AnswerOnly,
        },
        TurnIntent::SkillInvocation => TurnCapabilityPlan {
            read_workspace: false,
            write_workspace: false,
            exec_command: false,
            use_research_task: false,
            use_skill_response,
            needs_approval: false,
            needs_user_input: false,
            response_mode: TurnResponseMode::AnswerOnly,
        },
        TurnIntent::WorkspaceRead => TurnCapabilityPlan {
            read_workspace: true,
            write_workspace: false,
            exec_command: false,
            use_research_task: false,
            use_skill_response,
            needs_approval: false,
            needs_user_input: false,
            response_mode: TurnResponseMode::Mixed,
        },
        TurnIntent::WorkspaceWrite => TurnCapabilityPlan {
            read_workspace: true,
            write_workspace: true,
            exec_command: false,
            use_research_task: false,
            use_skill_response,
            needs_approval: true,
            needs_user_input: true,
            response_mode: TurnResponseMode::Execute,
        },
        TurnIntent::CommandExec => TurnCapabilityPlan {
            read_workspace: true,
            write_workspace: true,
            exec_command: true,
            use_research_task: false,
            use_skill_response: false,
            needs_approval: true,
            needs_user_input: true,
            response_mode: TurnResponseMode::Execute,
        },
        TurnIntent::ResearchTask => TurnCapabilityPlan {
            read_workspace: true,
            write_workspace: true,
            exec_command: true,
            use_research_task: true,
            use_skill_response,
            needs_approval: true,
            needs_user_input: true,
            response_mode: TurnResponseMode::Execute,
        },
        TurnIntent::ApprovalContinuation => TurnCapabilityPlan {
            read_workspace: false,
            write_workspace: false,
            exec_command: false,
            use_research_task: false,
            use_skill_response: false,
            needs_approval: false,
            needs_user_input: true,
            response_mode: TurnResponseMode::Mixed,
        },
    }
}

fn build_route_label(intent: &TurnIntent) -> String {
    match intent {
        TurnIntent::AnswerOnly => "Answer only".to_string(),
        TurnIntent::SkillInvocation => "Skill response".to_string(),
        TurnIntent::WorkspaceRead => "Workspace read".to_string(),
        TurnIntent::WorkspaceWrite => "Workspace write".to_string(),
        TurnIntent::CommandExec => "Command exec".to_string(),
        TurnIntent::ResearchTask => "Research task".to_string(),
        TurnIntent::ApprovalContinuation => "Approval continuation".to_string(),
    }
}

fn build_route_summary(intent: &TurnIntent, capability_plan: &TurnCapabilityPlan) -> String {
    let mut parts = Vec::new();
    parts.push(format!("intent={}", intent.as_str()));
    if capability_plan.read_workspace {
        parts.push("read-workspace".to_string());
    }
    if capability_plan.write_workspace {
        parts.push("write-workspace".to_string());
    }
    if capability_plan.exec_command {
        parts.push("exec-command".to_string());
    }
    if capability_plan.use_research_task {
        parts.push("research-task".to_string());
    }
    parts.push(format!(
        "response={}",
        match capability_plan.response_mode {
            TurnResponseMode::AnswerOnly => "answer-only",
            TurnResponseMode::Execute => "execute",
            TurnResponseMode::Mixed => "mixed",
        }
    ));
    parts.join(" · ")
}

pub fn resolve_turn_route(input: TurnRouterInput) -> TurnExecutionRoute {
    let prompt = input.prompt.trim().to_string();
    let pending_request_exists = input
        .session
        .get("permissionRequests")
        .and_then(Value::as_array)
        .map(|entries| !entries.is_empty())
        .unwrap_or(false)
        || input
            .session
            .get("askUserRequests")
            .and_then(Value::as_array)
            .map(|entries| !entries.is_empty())
            .unwrap_or(false)
        || input
            .session
            .get("exitPlanRequests")
            .and_then(Value::as_array)
            .map(|entries| !entries.is_empty())
            .unwrap_or(false);
    let has_skill = input.skill.is_object();
    let explicit_skill = is_explicit_skill_invocation(input.invocation.as_ref());
    let explicit_agent = is_explicit_agent_invocation(input.invocation.as_ref());
    let has_tool_mentions = !input.tool_mentions.is_empty();
    let command_requested = looks_like_command_exec(&prompt);
    let write_requested = looks_like_workspace_write(&prompt);
    let read_requested = looks_like_workspace_read(&prompt) || has_tool_mentions;
    let research_requested = has_skill && is_research_execution_skill(&input.skill);

    let intent = if pending_request_exists && looks_like_approval_continuation(&prompt) {
        TurnIntent::ApprovalContinuation
    } else if explicit_skill && !command_requested && !write_requested && !read_requested {
        TurnIntent::SkillInvocation
    } else if command_requested {
        if has_skill || research_requested {
            TurnIntent::ResearchTask
        } else {
            TurnIntent::CommandExec
        }
    } else if write_requested || explicit_agent {
        if has_skill || research_requested {
            TurnIntent::ResearchTask
        } else {
            TurnIntent::WorkspaceWrite
        }
    } else if read_requested {
        if has_skill && input.session_mode.trim() != "chat" {
            TurnIntent::ResearchTask
        } else {
            TurnIntent::WorkspaceRead
        }
    } else if has_skill {
        TurnIntent::SkillInvocation
    } else {
        TurnIntent::AnswerOnly
    };

    let capability_plan = build_capability_plan(&intent, has_skill);
    let include_skill_support_files = has_skill
        && matches!(
            intent,
            TurnIntent::SkillInvocation | TurnIntent::ResearchTask
        );
    let allowed_tool_ids = build_turn_tool_allowlist(
        &input.enabled_tool_ids,
        &capability_plan,
        include_skill_support_files,
    );
    let approval_preflight =
        build_approval_preflight(&input.session, &input.permission_mode, &capability_plan);
    let summary = build_route_summary(&intent, &capability_plan);

    TurnExecutionRoute {
        runtime_intent: intent.runtime_intent().to_string(),
        label: build_route_label(&intent),
        summary,
        should_hydrate_research_task: capability_plan.use_research_task,
        should_continue_pending_turn: matches!(intent, TurnIntent::ApprovalContinuation)
            && approval_preflight.status == "pending",
        allowed_tool_ids,
        requested_tool_mentions: input.tool_mentions,
        capability_plan,
        approval_preflight,
        intent,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_question_routes_to_answer_only() {
        let route = resolve_turn_route(TurnRouterInput {
            session: Value::Null,
            session_mode: "agent".to_string(),
            prompt: "你是谁".to_string(),
            skill: Value::Null,
            invocation: None,
            tool_mentions: Vec::new(),
            enabled_tool_ids: vec!["read_file".to_string(), "apply_patch".to_string()],
            permission_mode: "accept-edits".to_string(),
        });
        assert_eq!(route.intent, TurnIntent::AnswerOnly);
        assert_eq!(route.runtime_intent, "chat");
        assert!(route.allowed_tool_ids.is_empty());
    }

    #[test]
    fn create_file_routes_to_workspace_write() {
        let route = resolve_turn_route(TurnRouterInput {
            session: Value::Null,
            session_mode: "agent".to_string(),
            prompt: "帮我新建一个 md 文件：测试.md".to_string(),
            skill: Value::Null,
            invocation: None,
            tool_mentions: Vec::new(),
            enabled_tool_ids: vec!["read_file".to_string(), "apply_patch".to_string()],
            permission_mode: "accept-edits".to_string(),
        });
        assert_eq!(route.intent, TurnIntent::WorkspaceWrite);
        assert_eq!(route.runtime_intent, "agent");
        assert!(route
            .allowed_tool_ids
            .iter()
            .any(|entry| entry == "apply_patch"));
    }

    #[test]
    fn command_request_routes_to_exec() {
        let route = resolve_turn_route(TurnRouterInput {
            session: Value::Null,
            session_mode: "agent".to_string(),
            prompt: "运行 cargo check 并修复错误".to_string(),
            skill: Value::Null,
            invocation: None,
            tool_mentions: Vec::new(),
            enabled_tool_ids: vec![
                "read_file".to_string(),
                "apply_patch".to_string(),
                "exec_command".to_string(),
            ],
            permission_mode: "accept-edits".to_string(),
        });
        assert_eq!(route.intent, TurnIntent::CommandExec);
        assert!(route
            .allowed_tool_ids
            .iter()
            .any(|entry| entry == "exec_command"));
        assert!(route
            .allowed_tool_ids
            .iter()
            .any(|entry| entry == "apply_patch"));
    }

    #[test]
    fn explicit_skill_routes_to_skill_invocation() {
        let route = resolve_turn_route(TurnRouterInput {
            session: Value::Null,
            session_mode: "agent".to_string(),
            prompt: "$summarize-selection 总结这段内容".to_string(),
            skill: serde_json::json!({
                "kind": "codex-skill",
                "slug": "summarize-selection",
            }),
            invocation: Some(serde_json::json!({
                "prefix": "$",
                "name": "summarize-selection",
            })),
            tool_mentions: Vec::new(),
            enabled_tool_ids: vec![
                "read_file".to_string(),
                "load-skill-support-files".to_string(),
                "apply_patch".to_string(),
            ],
            permission_mode: "accept-edits".to_string(),
        });
        assert_eq!(route.intent, TurnIntent::SkillInvocation);
        assert_eq!(route.runtime_intent, "skill");
        assert!(route
            .allowed_tool_ids
            .iter()
            .any(|entry| entry == "load-skill-support-files"));
        assert!(!route
            .allowed_tool_ids
            .iter()
            .any(|entry| entry == "apply_patch"));
    }
}
