use serde_json::Value;

use crate::ai_turn_intent::{TurnApprovalPreflight, TurnCapabilityPlan};

const LOAD_SKILL_SUPPORT_FILES_TOOL: &str = "load-skill-support-files";
const READ_ONLY_TOOL_IDS: &[&str] = &["read_file", "list_files", "search_files", "view_image"];
const WRITE_TOOL_IDS: &[&str] = &["apply_patch"];
const EXEC_TOOL_IDS: &[&str] = &[
    "exec_command",
    "write_stdin",
    "resize_terminal",
    "terminate_command",
];
const INTERACTION_TOOL_IDS: &[&str] = &["request_user_input"];

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

fn normalize_tool_id(value: &str) -> String {
    value.trim().to_lowercase()
}

fn contains_tool(enabled_tool_ids: &[String], tool_id: &str) -> bool {
    let normalized = normalize_tool_id(tool_id);
    enabled_tool_ids
        .iter()
        .any(|entry| normalize_tool_id(entry) == normalized)
}

pub fn normalize_permission_mode(value: &str) -> String {
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

pub fn resolve_default_permission_mode(
    session_mode: &str,
    provider_id: &str,
    provider_config: &Value,
) -> String {
    if session_mode.trim() == "chat" {
        return "accept-edits".to_string();
    }
    if provider_id.trim() == "anthropic" {
        return normalize_permission_mode(&string_field(
            provider_config.get("sdk").unwrap_or(&Value::Null),
            &["approvalMode", "approval_mode"],
        ));
    }
    "accept-edits".to_string()
}

pub fn build_turn_tool_allowlist(
    enabled_tool_ids: &[String],
    capability_plan: &TurnCapabilityPlan,
    include_skill_support_files: bool,
) -> Vec<String> {
    let allow_all_enabled = enabled_tool_ids.is_empty();
    let mut allowed = Vec::new();

    let mut maybe_push = |tool_id: &str| {
        let normalized = tool_id.to_string();
        if allowed.iter().any(|entry| entry == &normalized) {
            return;
        }
        if allow_all_enabled || contains_tool(enabled_tool_ids, tool_id) {
            allowed.push(normalized);
        }
    };

    if capability_plan.read_workspace {
        for tool_id in READ_ONLY_TOOL_IDS {
            maybe_push(tool_id);
        }
    }
    if capability_plan.write_workspace {
        for tool_id in WRITE_TOOL_IDS {
            maybe_push(tool_id);
        }
    }
    if capability_plan.exec_command {
        for tool_id in EXEC_TOOL_IDS {
            maybe_push(tool_id);
        }
    }
    if capability_plan.needs_user_input {
        for tool_id in INTERACTION_TOOL_IDS {
            maybe_push(tool_id);
        }
    }
    if include_skill_support_files {
        maybe_push(LOAD_SKILL_SUPPORT_FILES_TOOL);
    }

    if capability_plan.response_mode != crate::ai_turn_intent::TurnResponseMode::AnswerOnly {
        for tool_id in enabled_tool_ids {
            let normalized = normalize_tool_id(tool_id);
            if normalized == LOAD_SKILL_SUPPORT_FILES_TOOL
                || READ_ONLY_TOOL_IDS.contains(&normalized.as_str())
                || WRITE_TOOL_IDS.contains(&normalized.as_str())
                || EXEC_TOOL_IDS.contains(&normalized.as_str())
                || INTERACTION_TOOL_IDS.contains(&normalized.as_str())
            {
                continue;
            }
            if !allowed
                .iter()
                .any(|entry| normalize_tool_id(entry) == normalized)
            {
                allowed.push(tool_id.trim().to_string());
            }
        }
    }

    allowed
}

pub fn build_approval_preflight(
    session: &Value,
    permission_mode: &str,
    capability_plan: &TurnCapabilityPlan,
) -> TurnApprovalPreflight {
    let pending_permission_request = session
        .get("permissionRequests")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .cloned()
        .unwrap_or(Value::Null);
    let pending_ask_user_request = session
        .get("askUserRequests")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .cloned()
        .unwrap_or(Value::Null);
    let pending_exit_plan_request = session
        .get("exitPlanRequests")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .cloned()
        .unwrap_or(Value::Null);

    if pending_permission_request.is_object() {
        return TurnApprovalPreflight {
            required: true,
            status: "pending".to_string(),
            reason: "当前 turn 已有待处理的 permission request。".to_string(),
            pending_request_kind: "permission".to_string(),
            pending_request_id: string_field(
                &pending_permission_request,
                &["requestId", "request_id"],
            ),
        };
    }
    if pending_ask_user_request.is_object() {
        return TurnApprovalPreflight {
            required: true,
            status: "pending".to_string(),
            reason: "当前 turn 已有待处理的 ask-user request。".to_string(),
            pending_request_kind: "ask-user".to_string(),
            pending_request_id: string_field(
                &pending_ask_user_request,
                &["requestId", "request_id"],
            ),
        };
    }
    if pending_exit_plan_request.is_object() {
        return TurnApprovalPreflight {
            required: true,
            status: "pending".to_string(),
            reason: "当前 turn 仍在等待 exit-plan 决议。".to_string(),
            pending_request_kind: "exit-plan".to_string(),
            pending_request_id: string_field(
                &pending_exit_plan_request,
                &["requestId", "request_id"],
            ),
        };
    }

    let requires_approval = (capability_plan.write_workspace || capability_plan.exec_command)
        && permission_mode.trim() != "bypass-permissions";
    TurnApprovalPreflight {
        required: requires_approval,
        status: if requires_approval {
            "required".to_string()
        } else {
            "not-required".to_string()
        },
        reason: if requires_approval {
            format!(
                "当前 route 涉及{}，需要走 runtime approval。",
                if capability_plan.exec_command && capability_plan.write_workspace {
                    "workspace write 和 command exec"
                } else if capability_plan.exec_command {
                    "command exec"
                } else {
                    "workspace write"
                }
            )
        } else {
            "当前 route 不需要额外 approval。".to_string()
        },
        pending_request_kind: String::new(),
        pending_request_id: String::new(),
    }
}
