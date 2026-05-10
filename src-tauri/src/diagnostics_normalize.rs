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
    problems: Vec<Value>,
    defaults: Value,
) -> Result<Vec<NormalizedProblem>, String> {
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

    Ok(result)
}
