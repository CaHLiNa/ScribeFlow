use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;
use tauri::State;

use crate::diagnostics_normalize::NormalizedProblem;
use crate::latex_project_graph::LatexProjectGraphCacheState;

fn normalize_fs_path(path: &str) -> String {
    path.trim().replace('\\', "/")
}

fn build_project_warnings(source_path: &str, graph: &Value) -> Vec<NormalizedProblem> {
    let mut problems = Vec::new();

    if let Some(unresolved_refs) = graph.get("unresolvedRefs").and_then(Value::as_array) {
        for entry in unresolved_refs {
            let key = entry.get("key").and_then(Value::as_str).unwrap_or_default();
            let file_path = entry
                .get("filePath")
                .and_then(Value::as_str)
                .unwrap_or(source_path);
            let line = entry.get("line").and_then(Value::as_u64).map(|v| v as u32);
            problems.push(NormalizedProblem {
                id: format!("latex:ref:{}:{}:{}", file_path, key, line.unwrap_or(0)),
                source_path: file_path.to_string(),
                line,
                column: None,
                severity: "warning".to_string(),
                origin: "project".to_string(),
                actionable: true,
                message: format!("Unknown label: {key}"),
                raw: key.to_string(),
            });
        }
    }

    if let Some(unresolved_citations) = graph.get("unresolvedCitations").and_then(Value::as_array) {
        for entry in unresolved_citations {
            let key = entry.get("key").and_then(Value::as_str).unwrap_or_default();
            let file_path = entry
                .get("filePath")
                .and_then(Value::as_str)
                .unwrap_or(source_path);
            let line = entry.get("line").and_then(Value::as_u64).map(|v| v as u32);
            problems.push(NormalizedProblem {
                id: format!("latex:cite:{}:{}:{}", file_path, key, line.unwrap_or(0)),
                source_path: file_path.to_string(),
                line,
                column: None,
                severity: "warning".to_string(),
                origin: "project".to_string(),
                actionable: true,
                message: format!("Unknown citation key: {key}"),
                raw: key.to_string(),
            });
        }
    }

    problems
}

fn deduplicate_problems(problems: Vec<NormalizedProblem>) -> Vec<NormalizedProblem> {
    let mut seen = HashSet::new();
    problems
        .into_iter()
        .filter(|p| {
            let sig = format!(
                "{}::{}::{}::{}",
                p.source_path,
                p.line.unwrap_or(0),
                p.severity,
                p.message
            );
            seen.insert(sig)
        })
        .collect()
}

#[tauri::command]
pub fn latex_diagnostics_build_project_problems(
    source_path: String,
    cache_state: State<'_, LatexProjectGraphCacheState>,
) -> Result<Vec<NormalizedProblem>, String> {
    let normalized = normalize_fs_path(&source_path);
    let cache = cache_state.cache.lock().map_err(|e| e.to_string())?;
    let graph = cache.get(&normalized).map(|entry| &entry.graph);
    match graph {
        Some(g) => Ok(deduplicate_problems(build_project_warnings(&normalized, g))),
        None => Ok(Vec::new()),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LintDiagnostic {
    #[serde(default)]
    pub file: String,
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub column: Option<u32>,
    #[serde(default)]
    pub severity: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub raw: String,
}

#[tauri::command]
pub fn latex_diagnostics_build_lint_problems(
    source_path: String,
    diagnostics: Vec<LintDiagnostic>,
) -> Result<Vec<NormalizedProblem>, String> {
    let normalized = normalize_fs_path(&source_path);
    let problems: Vec<NormalizedProblem> = diagnostics
        .iter()
        .enumerate()
        .map(|(index, problem)| {
            let file = if problem.file.is_empty() {
                normalized.clone()
            } else {
                normalize_fs_path(&problem.file)
            };
            let severity = if problem.severity == "error" {
                "error"
            } else {
                "warning"
            };
            NormalizedProblem {
                id: format!(
                    "latex:lint:{}:{}:{}",
                    file,
                    problem.line.unwrap_or(0),
                    index
                ),
                source_path: file,
                line: problem.line,
                column: problem.column,
                severity: severity.to_string(),
                origin: "lint".to_string(),
                actionable: true,
                message: problem.message.clone(),
                raw: if problem.raw.is_empty() {
                    problem.message.clone()
                } else {
                    problem.raw.clone()
                },
            }
        })
        .collect();
    Ok(deduplicate_problems(problems))
}
