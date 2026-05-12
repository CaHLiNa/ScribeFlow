use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedProblem {
    pub id: String,
    pub source_path: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub severity: String,
    pub message: String,
    pub origin: String,
    pub actionable: bool,
    pub raw: String,
}

fn normalize_single(problem: &Value, defaults: &Value) -> NormalizedProblem {
    let severity = if problem.get("severity").and_then(|v| v.as_str()) == Some("warning")
        || defaults.get("severity").and_then(|v| v.as_str()) == Some("warning")
    {
        "warning"
    } else {
        "error"
    };

    let line = problem
        .get("line")
        .and_then(|v| v.as_u64())
        .filter(|&v| v > 0)
        .map(|v| v as u32);

    let column = problem
        .get("column")
        .and_then(|v| v.as_u64())
        .filter(|&v| v > 0)
        .map(|v| v as u32);

    let message_raw = problem
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let message_default = defaults
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let message = if !message_raw.is_empty() {
        message_raw
    } else {
        message_default
    }
    .trim()
    .to_string();

    let raw_field = problem.get("raw").and_then(|v| v.as_str());
    let raw_default = defaults.get("raw").and_then(|v| v.as_str());
    let raw = raw_field
        .or(raw_default)
        .or(Some(message_raw))
        .unwrap_or("")
        .trim()
        .to_string();

    NormalizedProblem {
        id: str_field(problem, "id")
            .or_else(|| str_field(defaults, "id"))
            .unwrap_or_default(),
        source_path: str_field(problem, "sourcePath")
            .or_else(|| str_field(defaults, "sourcePath"))
            .unwrap_or_default(),
        line,
        column,
        severity: severity.to_string(),
        message,
        origin: str_field(problem, "origin")
            .or_else(|| str_field(defaults, "origin"))
            .unwrap_or_else(|| "compile".to_string()),
        actionable: problem
            .get("actionable")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        raw,
    }
}

fn str_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn diagnostics_normalize_problems(
    params: Value,
) -> Result<Vec<NormalizedProblem>, String> {
    let (problems, defaults) = diagnostics_params_from_payload(params);
    Ok(normalize_problems(problems, defaults))
}

fn diagnostics_params_from_payload(params: Value) -> (Vec<Value>, Value) {
    let problems = params
        .get("problems")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let defaults = params
        .get("defaults")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    (problems, defaults)
}

fn normalize_problems(problems: Vec<Value>, defaults: Value) -> Vec<NormalizedProblem> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for entry in &problems {
        let normalized = normalize_single(entry, &defaults);
        if normalized.message.is_empty() {
            continue;
        }

        let signature = format!(
            "{}::{}::{}::{}::{}::{}",
            normalized.source_path,
            normalized.line.map_or(String::new(), |v| v.to_string()),
            normalized.column.map_or(String::new(), |v| v.to_string()),
            normalized.severity,
            normalized.origin,
            normalized.message,
        );

        if seen.contains(&signature) {
            continue;
        }
        seen.insert(signature);
        result.push(normalized);
    }

    result.sort_by(|a, b| {
        let by_file = a.source_path.cmp(&b.source_path);
        if by_file != std::cmp::Ordering::Equal {
            return by_file;
        }
        let a_line = a.line.unwrap_or(u32::MAX);
        let b_line = b.line.unwrap_or(u32::MAX);
        if a_line != b_line {
            return a_line.cmp(&b_line);
        }
        if a.severity != b.severity {
            return if a.severity == "error" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        a.message.cmp(&b.message)
    });

    result
}

#[cfg(test)]
mod tests {
    use super::{diagnostics_params_from_payload, normalize_problems};
    use serde_json::json;

    #[test]
    fn diagnostics_params_normalize_raw_payloads() {
        let (problems, defaults) = diagnostics_params_from_payload(json!({
            "problems": [
                {
                    "sourcePath": " /tmp/main.tex ",
                    "line": 2,
                    "column": 4,
                    "message": " Missing brace ",
                    "severity": "warning",
                    "origin": "latex",
                    "actionable": false,
                    "raw": " raw log "
                },
                {
                    "sourcePath": " /tmp/main.tex ",
                    "line": 2,
                    "column": 4,
                    "message": " Missing brace ",
                    "severity": "warning",
                    "origin": "latex"
                },
                {
                    "message": ""
                }
            ],
            "defaults": {
                "sourcePath": "/tmp/fallback.tex",
                "message": " fallback message ",
                "severity": "error",
                "origin": "compile"
            }
        }));

        assert_eq!(problems.len(), 3);
        assert_eq!(defaults["sourcePath"], "/tmp/fallback.tex");

        let normalized = normalize_problems(problems, defaults);
        assert_eq!(normalized.len(), 2);
        assert_eq!(normalized[0].source_path, " /tmp/main.tex ");
        assert_eq!(normalized[0].line, Some(2));
        assert_eq!(normalized[0].column, Some(4));
        assert_eq!(normalized[0].message, "Missing brace");
        assert_eq!(normalized[0].severity, "warning");
        assert_eq!(normalized[0].origin, "latex");
        assert!(!normalized[0].actionable);
        assert_eq!(normalized[0].raw, "raw log");
        assert_eq!(normalized[1].source_path, "/tmp/fallback.tex");
        assert_eq!(normalized[1].message, "fallback message");
        assert_eq!(normalized[1].severity, "error");
        assert_eq!(normalized[1].origin, "compile");

        let (fallback_problems, fallback_defaults) = diagnostics_params_from_payload(json!({
            "problems": [
                {
                    "sourcePath": 42,
                    "line": 0,
                    "column": false,
                    "message": null,
                    "severity": "info"
                }
            ],
            "defaults": {
                "sourcePath": "/tmp/default.tex",
                "message": " default diagnostic ",
                "severity": "warning",
                "raw": " default raw "
            }
        }));
        let fallback_normalized = normalize_problems(fallback_problems, fallback_defaults);
        assert_eq!(fallback_normalized.len(), 1);
        assert_eq!(fallback_normalized[0].source_path, "/tmp/default.tex");
        assert_eq!(fallback_normalized[0].line, None);
        assert_eq!(fallback_normalized[0].column, None);
        assert_eq!(fallback_normalized[0].message, "default diagnostic");
        assert_eq!(fallback_normalized[0].severity, "warning");
        assert_eq!(fallback_normalized[0].raw, "default raw");

        let (invalid_problems, invalid_defaults) = diagnostics_params_from_payload(json!(false));
        assert!(invalid_problems.is_empty());
        assert_eq!(invalid_defaults, json!({}));
        assert!(normalize_problems(invalid_problems, invalid_defaults).is_empty());
    }
}
