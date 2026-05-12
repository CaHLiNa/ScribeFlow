use serde_json::Value;

fn str_or(v: &Value, keys: &[&str], default: &str) -> String {
    for key in keys {
        if let Some(s) = v.get(*key).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    default.to_string()
}

fn num_or(v: &Value, keys: &[&str], default: f64) -> f64 {
    for key in keys {
        if let Some(n) = v.get(*key).and_then(|v| v.as_f64()) {
            return n;
        }
    }
    default
}

fn bool_or(v: &Value, keys: &[&str], default: bool) -> bool {
    for key in keys {
        if let Some(b) = v.get(*key).and_then(|v| v.as_bool()) {
            return b;
        }
    }
    default
}

fn normalize_issue(issue: &Value) -> Value {
    let file = issue
        .get("file")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| Value::String(s.to_string()))
        .unwrap_or(Value::Null);

    let line_val = issue.get("line").and_then(|v| v.as_f64());
    let line = match line_val {
        Some(n) if n.is_finite() => Value::from(n as i64),
        _ => Value::Null,
    };

    let col_val = issue.get("column").and_then(|v| v.as_f64());
    let column = match col_val {
        Some(n) if n.is_finite() => Value::from(n as i64),
        _ => Value::Null,
    };

    let message = issue
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let severity = issue
        .get("severity")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("error")
        .to_string();

    let raw = issue
        .get("raw")
        .and_then(|v| v.as_str())
        .map(|s| Value::String(s.to_string()))
        .unwrap_or(Value::Null);

    serde_json::json!({
        "file": file,
        "line": line,
        "column": column,
        "message": message,
        "severity": severity,
        "raw": raw,
    })
}

#[tauri::command]
pub async fn latex_compile_result_normalize(params: Value) -> Result<Value, String> {
    let result = result_from_payload(params);
    Ok(normalize_result(&result))
}

#[tauri::command]
pub async fn latex_compile_execution_normalize(params: Value) -> Result<Value, String> {
    let execution = execution_from_payload(params);
    Ok(normalize_execution(&execution))
}

fn payload_field(params: Value, key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()))
}

fn result_from_payload(params: Value) -> Value {
    payload_field(params, "result")
}

fn execution_from_payload(params: Value) -> Value {
    payload_field(params, "execution")
}

fn normalize_execution(execution: &Value) -> Value {
    let result = execution
        .get("result")
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));
    let normalized_result = normalize_result(&result);

    let source_state = execution
        .get("sourceState")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));

    let target_state = execution
        .get("targetState")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(|| Value::Object(Default::default()));

    let queue_state = execution
        .get("queueState")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or(Value::Null);

    serde_json::json!({
        "sourceState": source_state,
        "targetState": target_state,
        "queueState": queue_state,
        "result": normalized_result,
    })
}

fn normalize_result(result: &Value) -> Value {
    let pdf_path = str_or(result, &["pdf_path", "pdfPath"], "");
    let synctex_path = str_or(result, &["synctex_path", "synctexPath"], "");
    let duration_ms = num_or(result, &["duration_ms", "durationMs"], 0.0);
    let compiler_backend = result
        .get("compiler_backend")
        .or_else(|| result.get("compilerBackend"))
        .cloned()
        .unwrap_or(Value::Null);
    let command_preview = result
        .get("command_preview")
        .or_else(|| result.get("commandPreview"))
        .cloned()
        .unwrap_or(Value::Null);
    let requested_program = result
        .get("requested_program")
        .or_else(|| result.get("requestedProgram"))
        .cloned()
        .unwrap_or(Value::Null);
    let requested_program_applied = bool_or(
        result,
        &["requested_program_applied", "requestedProgramApplied"],
        false,
    );

    let errors = result
        .get("errors")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(normalize_issue).collect::<Vec<_>>())
        .unwrap_or_default();

    let warnings = result
        .get("warnings")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(normalize_issue).collect::<Vec<_>>())
        .unwrap_or_default();

    let log = result
        .get("log")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let success = result
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let pdf_path_or_null = if pdf_path.is_empty() {
        Value::Null
    } else {
        Value::String(pdf_path.clone())
    };
    let synctex_path_or_null = if synctex_path.is_empty() {
        Value::Null
    } else {
        Value::String(synctex_path.clone())
    };

    serde_json::json!({
        "success": success,
        "pdf_path": pdf_path_or_null,
        "synctex_path": synctex_path_or_null,
        "pdfPath": pdf_path,
        "synctexPath": synctex_path,
        "errors": errors,
        "warnings": warnings,
        "log": log,
        "duration_ms": duration_ms,
        "durationMs": duration_ms,
        "compiler_backend": compiler_backend,
        "compilerBackend": compiler_backend,
        "command_preview": command_preview,
        "commandPreview": command_preview,
        "requested_program": requested_program,
        "requestedProgram": requested_program,
        "requested_program_applied": requested_program_applied,
        "requestedProgramApplied": requested_program_applied,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        execution_from_payload, normalize_execution, normalize_result, result_from_payload,
    };
    use serde_json::json;

    #[test]
    fn latex_compile_normalize_params_normalize_raw_payloads() {
        let result = result_from_payload(json!({
            "result": {
                "success": true,
                "pdfPath": " /tmp/out.pdf ",
                "durationMs": 42,
                "errors": [{
                    "file": "/tmp/main.tex",
                    "line": 12,
                    "column": 4,
                    "message": " Missing brace ",
                    "severity": " warning ",
                    "raw": "raw log"
                }]
            }
        }));
        let normalized_result = normalize_result(&result);
        assert_eq!(normalized_result["success"], true);
        assert_eq!(normalized_result["pdfPath"], " /tmp/out.pdf ");
        assert_eq!(normalized_result["durationMs"], 42.0);
        assert_eq!(normalized_result["errors"][0]["message"], "Missing brace");
        assert_eq!(normalized_result["errors"][0]["severity"], "warning");

        let missing_result = result_from_payload(json!({
            "result": 42
        }));
        let normalized_missing_result = normalize_result(&missing_result);
        assert_eq!(normalized_missing_result["success"], false);
        assert_eq!(normalized_missing_result["pdfPath"], "");
        assert_eq!(normalized_missing_result["errors"], json!([]));

        let execution = execution_from_payload(json!({
            "execution": {
                "sourceState": {"path": "/tmp/main.tex"},
                "targetState": {"path": "/tmp/main.pdf"},
                "queueState": false,
                "result": {
                    "success": true,
                    "synctex_path": "/tmp/main.synctex.gz"
                }
            }
        }));
        let normalized_execution = normalize_execution(&execution);
        assert_eq!(
            normalized_execution["sourceState"],
            json!({"path": "/tmp/main.tex"})
        );
        assert_eq!(
            normalized_execution["targetState"],
            json!({"path": "/tmp/main.pdf"})
        );
        assert_eq!(normalized_execution["queueState"], json!(null));
        assert_eq!(
            normalized_execution["result"]["synctexPath"],
            "/tmp/main.synctex.gz"
        );

        let default_execution = execution_from_payload(json!(null));
        let normalized_default_execution = normalize_execution(&default_execution);
        assert_eq!(normalized_default_execution["sourceState"], json!({}));
        assert_eq!(normalized_default_execution["targetState"], json!({}));
        assert_eq!(normalized_default_execution["queueState"], json!(null));
    }
}
