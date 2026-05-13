use crate::fs_tree::build_workspace_tree_snapshot;
use crate::security;
use crate::security::WorkspaceScopeState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexSyncTargetResolveParams {
    #[serde(default)]
    pub reported_file: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub compile_target_path: String,
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexSyncTargetResolveResult {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexExistingSynctexResolveParams {
    #[serde(default)]
    pub pdf_path: String,
}

fn payload_field<'a>(params: &'a Value, camel_key: &str, snake_key: &str) -> Option<&'a Value> {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
}

fn string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    payload_field(params, camel_key, snake_key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn latex_sync_target_resolve_params_from_payload(params: Value) -> LatexSyncTargetResolveParams {
    LatexSyncTargetResolveParams {
        reported_file: string_payload_field(&params, "reportedFile", "reported_file"),
        source_path: string_payload_field(&params, "sourcePath", "source_path"),
        compile_target_path: string_payload_field(
            &params,
            "compileTargetPath",
            "compile_target_path",
        ),
        workspace_path: string_payload_field(&params, "workspacePath", "workspace_path"),
    }
}

fn latex_existing_synctex_resolve_params_from_payload(
    params: Value,
) -> LatexExistingSynctexResolveParams {
    LatexExistingSynctexResolveParams {
        pdf_path: string_payload_field(&params, "pdfPath", "pdf_path"),
    }
}

fn normalize_fs_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() {
        return String::new();
    }
    if normalized == "/" {
        return normalized;
    }
    if normalized.len() == 2 && normalized.as_bytes()[1] == b':' {
        return format!("{normalized}/");
    }
    normalized.trim_end_matches('/').to_string()
}

fn dirname_path(file_path: &str) -> String {
    let normalized = normalize_fs_path(file_path);
    if normalized.is_empty() || normalized == "/" {
        return "/".to_string();
    }
    match normalized.rfind('/') {
        Some(index) if index > 0 => normalized[..index].to_string(),
        Some(_) if normalized.starts_with('/') => "/".to_string(),
        _ => ".".to_string(),
    }
}

fn is_windows_absolute_path(value: &str) -> bool {
    value.len() >= 3
        && value.as_bytes()[1] == b':'
        && value.as_bytes()[2] == b'/'
        && value.as_bytes()[0].is_ascii_alphabetic()
}

fn is_absolute_fs_path(value: &str) -> bool {
    value.starts_with('/') || is_windows_absolute_path(value)
}

fn resolve_relative_path(base_dir: &str, target: &str) -> String {
    let normalized_target = normalize_fs_path(target);
    if normalized_target.is_empty() || is_absolute_fs_path(&normalized_target) {
        return normalized_target;
    }

    let seed = normalize_fs_path(if base_dir.is_empty() { "." } else { base_dir });
    let absolute = is_absolute_fs_path(&seed);
    let drive_prefix = if is_windows_absolute_path(&seed) {
        seed[..2].to_string()
    } else {
        String::new()
    };
    let mut parts = seed
        .split('/')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    for segment in normalized_target.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            let _ = parts.pop();
            continue;
        }
        parts.push(segment.to_string());
    }

    if !drive_prefix.is_empty() {
        let remainder = parts.into_iter().skip(1).collect::<Vec<_>>().join("/");
        return normalize_fs_path(&format!("{drive_prefix}/{remainder}"));
    }

    if absolute {
        normalize_fs_path(&format!("/{}", parts.join("/")))
    } else {
        normalize_fs_path(&parts.join("/"))
    }
}

fn collapse_fs_path_segments(value: &str) -> String {
    let normalized = normalize_fs_path(value);
    if normalized.is_empty() {
        return String::new();
    }

    let is_absolute = normalized.starts_with('/');
    let drive_prefix = if is_windows_absolute_path(&normalized) {
        normalized[..2].to_string()
    } else {
        String::new()
    };
    let seed = if !drive_prefix.is_empty() {
        &normalized[3..]
    } else if is_absolute {
        &normalized[1..]
    } else {
        normalized.as_str()
    };
    let mut next_segments = Vec::new();

    for segment in seed.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            let _ = next_segments.pop();
            continue;
        }
        next_segments.push(segment);
    }

    if !drive_prefix.is_empty() {
        return normalize_fs_path(&format!("{drive_prefix}/{}", next_segments.join("/")));
    }
    if is_absolute {
        return normalize_fs_path(&format!("/{}", next_segments.join("/")));
    }
    normalize_fs_path(&next_segments.join("/"))
}

fn split_path_segments(value: &str) -> Vec<String> {
    let normalized = collapse_fs_path_segments(value);
    if normalized.is_empty() {
        return Vec::new();
    }
    let without_drive = if is_windows_absolute_path(&normalized) {
        &normalized[3..]
    } else {
        normalized.as_str()
    };
    without_drive
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_string)
        .collect()
}

fn trailing_segment_match_count(left: &str, right: &str) -> usize {
    let left_segments = split_path_segments(left);
    let right_segments = split_path_segments(right);
    let mut matches = 0;

    while matches < left_segments.len()
        && matches < right_segments.len()
        && left_segments[left_segments.len() - 1 - matches]
            == right_segments[right_segments.len() - 1 - matches]
    {
        matches += 1;
    }

    matches
}

fn is_tex_path(value: &str) -> bool {
    let normalized = normalize_fs_path(value).to_ascii_lowercase();
    normalized.ends_with(".tex") || normalized.ends_with(".latex")
}

fn build_latex_synctex_candidates(pdf_path: &str) -> Vec<String> {
    let normalized_pdf_path = normalize_fs_path(pdf_path);
    if !normalized_pdf_path.to_ascii_lowercase().ends_with(".pdf") {
        return Vec::new();
    }
    let base_path = &normalized_pdf_path[..normalized_pdf_path.len() - 4];
    vec![
        format!("{base_path}.synctex.gz"),
        format!("{base_path}.synctex"),
    ]
}

fn score_moved_path_candidate(candidate_path: &str, reported_path: &str) -> i32 {
    let normalized_candidate = collapse_fs_path_segments(candidate_path);
    let normalized_reported = collapse_fs_path_segments(reported_path);
    if normalized_candidate.is_empty() || normalized_reported.is_empty() {
        return -1;
    }
    if normalized_candidate == normalized_reported {
        return 10_000;
    }

    let candidate_segments = split_path_segments(&normalized_candidate);
    let reported_segments = split_path_segments(&normalized_reported);
    if candidate_segments.is_empty() || reported_segments.is_empty() {
        return -1;
    }
    if candidate_segments.last() != reported_segments.last() {
        return -1;
    }

    let trailing_matches =
        trailing_segment_match_count(&normalized_candidate, &normalized_reported);
    100 + trailing_matches as i32 * 25
}

fn workspace_path_exists_for_sync(scope_state: &WorkspaceScopeState, path: &str) -> bool {
    if path.trim().is_empty() {
        return false;
    }
    security::ensure_allowed_workspace_path(scope_state, Path::new(path))
        .map(|resolved| resolved.exists())
        .unwrap_or(false)
}

fn read_workspace_tex_paths_for_sync(
    scope_state: &WorkspaceScopeState,
    workspace_path: &str,
) -> Vec<String> {
    let normalized_workspace_path = normalize_fs_path(workspace_path);
    if normalized_workspace_path.is_empty() {
        return Vec::new();
    }
    let Ok(resolved_workspace_path) =
        security::ensure_allowed_workspace_path(scope_state, Path::new(&normalized_workspace_path))
    else {
        return Vec::new();
    };
    let snapshot =
        build_workspace_tree_snapshot(&resolved_workspace_path, &HashSet::new(), true).ok();
    snapshot
        .map(|snapshot| {
            snapshot
                .flat_files
                .into_iter()
                .map(|entry| normalize_fs_path(&entry.path))
                .filter(|path| is_tex_path(path))
                .collect()
        })
        .unwrap_or_default()
}

fn resolve_moved_absolute_latex_path(
    scope_state: &WorkspaceScopeState,
    reported_file: &str,
    params: &LatexSyncTargetResolveParams,
) -> String {
    let normalized_reported = collapse_fs_path_segments(reported_file);
    if normalized_reported.is_empty() || !is_absolute_fs_path(&normalized_reported) {
        return normalized_reported;
    }
    if workspace_path_exists_for_sync(scope_state, &normalized_reported) {
        return normalized_reported;
    }

    let source_path = normalize_fs_path(&params.source_path);
    let compile_target_path = normalize_fs_path(&params.compile_target_path);
    let mut candidates = vec![source_path, compile_target_path];
    candidates.extend(read_workspace_tex_paths_for_sync(
        scope_state,
        &params.workspace_path,
    ));

    let mut best_path = String::new();
    let mut best_score = -1;
    for candidate in candidates {
        let score = score_moved_path_candidate(&candidate, &normalized_reported);
        if score > best_score {
            best_path = candidate;
            best_score = score;
        }
    }

    if !best_path.is_empty()
        && best_score >= 125
        && workspace_path_exists_for_sync(scope_state, &best_path)
    {
        return best_path;
    }

    normalized_reported
}

pub(crate) fn resolve_latex_sync_target_path(
    scope_state: &WorkspaceScopeState,
    params: &LatexSyncTargetResolveParams,
) -> String {
    let normalized_reported = collapse_fs_path_segments(&params.reported_file);
    let normalized_compile_target_path = normalize_fs_path(&params.compile_target_path);
    let normalized_source_path = normalize_fs_path(&params.source_path);
    if normalized_reported.is_empty() {
        return String::new();
    }

    if is_absolute_fs_path(&normalized_reported) {
        return resolve_moved_absolute_latex_path(scope_state, &normalized_reported, params);
    }

    let base_dirs = [
        (!normalized_compile_target_path.is_empty())
            .then(|| dirname_path(&normalized_compile_target_path)),
        (!normalized_source_path.is_empty()).then(|| dirname_path(&normalized_source_path)),
        (!params.workspace_path.trim().is_empty())
            .then(|| normalize_fs_path(&params.workspace_path)),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();

    for base_dir in &base_dirs {
        let resolved = resolve_relative_path(base_dir, &normalized_reported);
        if !resolved.is_empty() && workspace_path_exists_for_sync(scope_state, &resolved) {
            return resolved;
        }
    }

    for base_dir in &base_dirs {
        let resolved = resolve_relative_path(base_dir, &normalized_reported);
        if !resolved.is_empty() {
            return resolved;
        }
    }

    normalized_reported
}

#[tauri::command]
pub async fn latex_sync_target_resolve(
    params: Value,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<LatexSyncTargetResolveResult, String> {
    let params = latex_sync_target_resolve_params_from_payload(params);
    Ok(LatexSyncTargetResolveResult {
        path: resolve_latex_sync_target_path(scope_state.inner(), &params),
    })
}

#[tauri::command]
pub async fn latex_existing_synctex_resolve(
    params: Value,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<LatexSyncTargetResolveResult, String> {
    let params = latex_existing_synctex_resolve_params_from_payload(params);
    let path = build_latex_synctex_candidates(&params.pdf_path)
        .into_iter()
        .find(|candidate| workspace_path_exists_for_sync(scope_state.inner(), candidate))
        .unwrap_or_default();
    Ok(LatexSyncTargetResolveResult { path })
}

#[cfg(test)]
mod tests {
    use super::{
        build_latex_synctex_candidates, latex_existing_synctex_resolve_params_from_payload,
        latex_sync_target_resolve_params_from_payload, resolve_latex_sync_target_path,
        workspace_path_exists_for_sync, LatexSyncTargetResolveParams,
    };
    use crate::security::{set_allowed_roots_internal, WorkspaceScopeState};
    use serde_json::json;
    use std::fs;

    #[test]
    fn resolves_relative_latex_sync_target_against_compile_dir() {
        let temp_root =
            std::env::temp_dir().join(format!("scribeflow-synctex-{}", uuid::Uuid::new_v4()));
        let chapter_dir = temp_root.join("chapters");
        fs::create_dir_all(&chapter_dir).expect("create workspace dirs");
        let main_path = temp_root.join("main.tex");
        let chapter_path = chapter_dir.join("intro.tex");
        fs::write(&main_path, "\\input{chapters/intro}").expect("write main");
        fs::write(&chapter_path, "content").expect("write chapter");

        let scope_state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&scope_state, &temp_root.to_string_lossy(), None, None, None)
            .expect("register workspace");
        let params = LatexSyncTargetResolveParams {
            reported_file: "chapters/intro.tex".to_string(),
            source_path: chapter_path.to_string_lossy().to_string(),
            compile_target_path: main_path.to_string_lossy().to_string(),
            workspace_path: temp_root.to_string_lossy().to_string(),
        };

        assert_eq!(
            resolve_latex_sync_target_path(&scope_state, &params),
            chapter_path.to_string_lossy().to_string()
        );

        fs::remove_dir_all(temp_root).ok();
    }

    #[test]
    fn resolves_moved_absolute_latex_sync_target_by_trailing_segments() {
        let temp_root =
            std::env::temp_dir().join(format!("scribeflow-synctex-{}", uuid::Uuid::new_v4()));
        let project_dir = temp_root.join("project");
        fs::create_dir_all(&project_dir).expect("create workspace dirs");
        let main_path = project_dir.join("main.tex");
        fs::write(&main_path, "content").expect("write main");

        let scope_state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&scope_state, &temp_root.to_string_lossy(), None, None, None)
            .expect("register workspace");
        let params = LatexSyncTargetResolveParams {
            reported_file: "/old/location/project/main.tex".to_string(),
            source_path: main_path.to_string_lossy().to_string(),
            compile_target_path: main_path.to_string_lossy().to_string(),
            workspace_path: temp_root.to_string_lossy().to_string(),
        };

        assert_eq!(
            resolve_latex_sync_target_path(&scope_state, &params),
            main_path.to_string_lossy().to_string()
        );

        fs::remove_dir_all(temp_root).ok();
    }

    #[test]
    fn builds_latex_synctex_candidates_for_pdf_paths() {
        assert_eq!(
            build_latex_synctex_candidates("/tmp/main.pdf"),
            vec!["/tmp/main.synctex.gz", "/tmp/main.synctex"]
        );
        assert!(build_latex_synctex_candidates("/tmp/main.tex").is_empty());
    }

    #[test]
    fn latex_sync_target_params_normalize_raw_payloads() {
        let params = latex_sync_target_resolve_params_from_payload(json!({
            "reportedFile": " chapter\\main.tex ",
            "sourcePath": 42,
            "compileTargetPath": " /workspace/main.tex ",
            "workspacePath": false
        }));

        assert_eq!(params.reported_file, "chapter\\main.tex");
        assert_eq!(params.source_path, "");
        assert_eq!(params.compile_target_path, "/workspace/main.tex");
        assert_eq!(params.workspace_path, "");

        let snake_params = latex_sync_target_resolve_params_from_payload(json!({
            "reported_file": " chapter/main.tex ",
            "source_path": " /workspace/chapter/main.tex ",
            "compile_target_path": null,
            "workspace_path": " /workspace "
        }));

        assert_eq!(snake_params.reported_file, "chapter/main.tex");
        assert_eq!(snake_params.source_path, "/workspace/chapter/main.tex");
        assert_eq!(snake_params.compile_target_path, "");
        assert_eq!(snake_params.workspace_path, "/workspace");

        let existing = latex_existing_synctex_resolve_params_from_payload(json!({
            "pdfPath": " /workspace/main.pdf "
        }));
        assert_eq!(existing.pdf_path, "/workspace/main.pdf");

        let invalid_existing = latex_existing_synctex_resolve_params_from_payload(json!({
            "pdfPath": 42
        }));
        assert_eq!(invalid_existing.pdf_path, "");
    }

    #[test]
    fn workspace_path_exists_for_sync_respects_workspace_scope() {
        let temp_root =
            std::env::temp_dir().join(format!("scribeflow-synctex-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_root).expect("create workspace");
        let synctex_path = temp_root.join("main.synctex.gz");
        fs::write(&synctex_path, "content").expect("write synctex");

        let scope_state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&scope_state, &temp_root.to_string_lossy(), None, None, None)
            .expect("register workspace");

        assert!(workspace_path_exists_for_sync(
            &scope_state,
            &synctex_path.to_string_lossy()
        ));
        assert!(!workspace_path_exists_for_sync(
            &scope_state,
            "/outside/main.synctex.gz"
        ));

        fs::remove_dir_all(temp_root).ok();
    }
}
