use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

use crate::ai_skill_text::{parse_skill_markdown, slugify_skill_name, SKILL_FILE_NAME};

const SUPPORTED_SUPPORT_EXTENSIONS: &[&str] = &[
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".csv", ".ts", ".js", ".mjs", ".cjs", ".py",
    ".sh", ".rs",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillCatalogParams {
    #[serde(default)]
    pub workspace_path: String,
    #[serde(default)]
    pub global_config_dir: String,
}

#[derive(Debug, Clone)]
pub(crate) struct SkillRoot {
    pub path: String,
    pub scope: String,
    pub source: String,
}

fn normalize_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        trimmed.to_string()
    }
}

fn home_dir() -> String {
    dirs::home_dir()
        .map(|path| normalize_path(&path.to_string_lossy()))
        .unwrap_or_default()
}

pub(crate) fn managed_skill_roots(
    workspace_path: &str,
    global_config_dir: &str,
) -> HashMap<String, String> {
    let workspace = normalize_path(workspace_path);
    let global = normalize_path(global_config_dir);
    HashMap::from([
        (
            "workspace".to_string(),
            if workspace.is_empty() {
                String::new()
            } else {
                format!("{workspace}/.scribeflow/skills")
            },
        ),
        (
            "user".to_string(),
            if global.is_empty() {
                String::new()
            } else {
                format!("{global}/skills")
            },
        ),
    ])
}

pub(crate) fn build_skill_search_roots(
    workspace_path: &str,
    global_config_dir: &str,
) -> Vec<SkillRoot> {
    let workspace = normalize_path(workspace_path);
    let global = normalize_path(global_config_dir);
    let home = home_dir();

    let candidates = vec![
        (!home.is_empty()).then(|| SkillRoot {
            path: format!("{home}/.claude/skills"),
            scope: "user".to_string(),
            source: "claude-user".to_string(),
        }),
        (!home.is_empty()).then(|| SkillRoot {
            path: format!("{home}/.codex/skills"),
            scope: "user".to_string(),
            source: "codex-user".to_string(),
        }),
        (!home.is_empty()).then(|| SkillRoot {
            path: format!("{home}/.config/agents/skills"),
            scope: "user".to_string(),
            source: "agents-user".to_string(),
        }),
        (!home.is_empty()).then(|| SkillRoot {
            path: format!("{home}/.config/goose/skills"),
            scope: "user".to_string(),
            source: "goose-user".to_string(),
        }),
        (!global.is_empty()).then(|| SkillRoot {
            path: format!("{global}/skills"),
            scope: "user".to_string(),
            source: "scribeflow-global".to_string(),
        }),
        (!workspace.is_empty()).then(|| SkillRoot {
            path: format!("{workspace}/.claude/skills"),
            scope: "workspace".to_string(),
            source: "claude-workspace".to_string(),
        }),
        (!workspace.is_empty()).then(|| SkillRoot {
            path: format!("{workspace}/.codex/skills"),
            scope: "workspace".to_string(),
            source: "codex-workspace".to_string(),
        }),
        (!workspace.is_empty()).then(|| SkillRoot {
            path: format!("{workspace}/.agents/skills"),
            scope: "workspace".to_string(),
            source: "agents-workspace".to_string(),
        }),
        (!workspace.is_empty()).then(|| SkillRoot {
            path: format!("{workspace}/.goose/skills"),
            scope: "workspace".to_string(),
            source: "goose-workspace".to_string(),
        }),
        (!workspace.is_empty()).then(|| SkillRoot {
            path: format!("{workspace}/.scribeflow/skills"),
            scope: "workspace".to_string(),
            source: "scribeflow-workspace".to_string(),
        }),
    ];

    let mut seen = BTreeSet::new();
    candidates
        .into_iter()
        .flatten()
        .filter(|root| seen.insert(root.path.clone()))
        .collect()
}

pub(crate) fn writable_skill_roots(workspace_path: &str, global_config_dir: &str) -> Vec<String> {
    build_skill_search_roots(workspace_path, global_config_dir)
        .into_iter()
        .map(|root| root.path)
        .collect()
}

pub(crate) fn path_starts_with(path: &str, root: &str) -> bool {
    let normalized_path = normalize_path(path);
    let normalized_root = normalize_path(root);
    !normalized_root.is_empty()
        && (normalized_path == normalized_root
            || normalized_path.starts_with(&format!("{normalized_root}/")))
}

fn is_support_file(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if file_name == SKILL_FILE_NAME {
        return false;
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_ascii_lowercase()))
        .unwrap_or_default();
    SUPPORTED_SUPPORT_EXTENSIONS.contains(&extension.as_str())
}

fn relative_path(root: &Path, target: &Path) -> String {
    target
        .strip_prefix(root)
        .ok()
        .map(|path| normalize_path(&path.to_string_lossy()))
        .unwrap_or_else(|| normalize_path(&target.to_string_lossy()))
}

fn collect_supporting_files(root: &Path, current: &Path, collected: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_supporting_files(root, &path, collected);
            continue;
        }
        if is_support_file(&path) {
            collected.push(relative_path(root, &path));
        }
    }
}

fn build_skill_id(scope: &str, slug: &str, skill_file_path: &str) -> String {
    let encoded =
        url::form_urlencoded::byte_serialize(skill_file_path.as_bytes()).collect::<String>();
    format!("skill:{scope}:{slug}:{encoded}")
}

fn metadata_list(frontmatter: &serde_json::Map<String, Value>, key: &str) -> Vec<String> {
    let Some(value) = frontmatter.get(key) else {
        return Vec::new();
    };
    match value {
        Value::Array(entries) => entries
            .iter()
            .filter_map(Value::as_str)
            .map(|entry| entry.trim().to_string())
            .filter(|entry| !entry.is_empty())
            .collect(),
        Value::String(text) => text
            .split([',', '\n'])
            .map(|entry| entry.trim().trim_start_matches('-').trim().to_string())
            .filter(|entry| !entry.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn infer_research_task_types(slug: &str) -> Vec<String> {
    if slug.contains("revise-with-citations") {
        return vec!["revise-with-citations".to_string()];
    }
    if slug.contains("summarize-selection") {
        return vec![
            "build-reading-note".to_string(),
            "summarize-paper".to_string(),
        ];
    }
    if slug.contains("draft-related-work") {
        return vec!["draft-related-work".to_string()];
    }
    if slug.contains("find-supporting-references") {
        return vec!["find-supporting-references".to_string()];
    }
    Vec::new()
}

fn infer_required_evidence(slug: &str) -> Vec<String> {
    if slug.contains("revise-with-citations") {
        return vec![
            "workspace".to_string(),
            "document".to_string(),
            "selection".to_string(),
            "reference".to_string(),
        ];
    }
    if slug.contains("draft-related-work") {
        return vec![
            "workspace".to_string(),
            "document".to_string(),
            "reference".to_string(),
        ];
    }
    if slug.contains("find-supporting-references") {
        return vec![
            "workspace".to_string(),
            "selection".to_string(),
            "reference".to_string(),
        ];
    }
    if slug.contains("summarize-selection") {
        return vec!["workspace".to_string(), "selection".to_string()];
    }
    vec!["workspace".to_string()]
}

fn infer_output_artifacts(slug: &str) -> Vec<String> {
    if slug.contains("revise-with-citations") {
        return vec!["doc_patch".to_string(), "citation_insert".to_string()];
    }
    if slug.contains("draft-related-work") {
        return vec!["related_work_outline".to_string(), "doc_patch".to_string()];
    }
    if slug.contains("find-supporting-references") {
        return vec![
            "citation_insert".to_string(),
            "reference_patch".to_string(),
            "evidence_bundle".to_string(),
            "claim_evidence_map".to_string(),
        ];
    }
    if slug.contains("summarize-selection") {
        return vec!["reading_note_bundle".to_string(), "note_draft".to_string()];
    }
    Vec::new()
}

fn infer_verification_hints(slug: &str) -> Vec<String> {
    if slug.contains("citation") || slug.contains("reference") {
        return vec![
            "检查 citation key 是否可解析".to_string(),
            "检查 BibTeX 是否可导出".to_string(),
        ];
    }
    if slug.contains("summarize-selection") || slug.contains("related-work") {
        return vec!["检查草稿文件是否成功创建".to_string()];
    }
    Vec::new()
}

fn infer_risk_notes(slug: &str) -> Vec<String> {
    if slug.contains("citation") || slug.contains("reference") {
        return vec!["不要编造 citation key 或参考文献字段".to_string()];
    }
    if slug.contains("related-work") {
        return vec!["避免在没有证据的情况下生成 related work 断言".to_string()];
    }
    Vec::new()
}

fn discover_skills_in_root(
    root: &SkillRoot,
    precedence: usize,
    managed_roots: &HashMap<String, String>,
    writable_roots: &[String],
) -> Vec<Value> {
    let root_path = PathBuf::from(&root.path);
    let Ok(entries) = fs::read_dir(&root_path) else {
        return Vec::new();
    };

    let mut discovered = Vec::new();
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        let skill_file = entry_path.join(SKILL_FILE_NAME);
        let Ok(markdown) = fs::read_to_string(&skill_file) else {
            continue;
        };

        let directory_name = entry.file_name().to_string_lossy().to_string();
        let parsed = parse_skill_markdown(&markdown, &directory_name);
        let directory_path = normalize_path(&entry_path.to_string_lossy());
        let skill_file_path = normalize_path(&skill_file.to_string_lossy());
        let source_root_path = normalize_path(&root.path);
        let mut supporting_files = Vec::new();
        collect_supporting_files(&entry_path, &entry_path, &mut supporting_files);
        supporting_files.sort();

        let managed_by_scribeflow = managed_roots.values().any(|managed_root| {
            !managed_root.is_empty() && path_starts_with(&directory_path, managed_root)
        });
        let writable_by_scribeflow = writable_roots
            .iter()
            .any(|writable_root| path_starts_with(&directory_path, writable_root));

        let slug = if parsed.slug.is_empty() {
            slugify_skill_name(&directory_name)
        } else {
            parsed.slug
        };
        let description = parsed.description.clone();
        let research_task_types = {
            let metadata = metadata_list(&parsed.frontmatter, "researchTaskTypes");
            if metadata.is_empty() {
                infer_research_task_types(&slug)
            } else {
                metadata
            }
        };
        let required_evidence_types = {
            let metadata = metadata_list(&parsed.frontmatter, "requiredEvidenceTypes");
            if metadata.is_empty() {
                infer_required_evidence(&slug)
            } else {
                metadata
            }
        };
        let output_artifact_types = {
            let metadata = metadata_list(&parsed.frontmatter, "outputArtifactTypes");
            if metadata.is_empty() {
                infer_output_artifacts(&slug)
            } else {
                metadata
            }
        };
        let verification_hints = {
            let metadata = metadata_list(&parsed.frontmatter, "verificationHints");
            if metadata.is_empty() {
                infer_verification_hints(&slug)
            } else {
                metadata
            }
        };
        let risk_notes = {
            let metadata = metadata_list(&parsed.frontmatter, "riskNotes");
            if metadata.is_empty() {
                infer_risk_notes(&slug)
            } else {
                metadata
            }
        };

        discovered.push(json!({
            "id": build_skill_id(&root.scope, &slug, &skill_file_path),
            "kind": "codex-skill",
            "name": parsed.name,
            "slug": slug,
            "description": description,
            "shortDescription": parsed.description,
            "directoryName": directory_name,
            "pathToSkillDir": directory_path,
            "pathToSkillMd": skill_file_path,
            "pathToSkillRoot": source_root_path,
            "markdown": markdown,
            "body": parsed.body,
            "frontmatter": Value::Object(parsed.frontmatter),
            "scope": root.scope,
            "source": root.source,
            "precedence": precedence,
            "supportingFiles": supporting_files,
            "researchTaskTypes": research_task_types,
            "requiredEvidenceTypes": required_evidence_types,
            "outputArtifactTypes": output_artifact_types,
            "verificationHints": verification_hints,
            "riskNotes": risk_notes,
            "managedByScribeFlow": managed_by_scribeflow,
            "writableByScribeFlow": writable_by_scribeflow,
        }));
    }

    discovered
}

#[tauri::command]
pub async fn ai_skill_catalog_load(params: AiSkillCatalogParams) -> Result<Value, String> {
    let managed_roots = managed_skill_roots(&params.workspace_path, &params.global_config_dir);
    let writable_roots = writable_skill_roots(&params.workspace_path, &params.global_config_dir);
    let roots = build_skill_search_roots(&params.workspace_path, &params.global_config_dir);

    let mut merged = HashMap::new();
    for (index, root) in roots.iter().enumerate() {
        for skill in discover_skills_in_root(root, index, &managed_roots, &writable_roots) {
            let key = slugify_skill_name(skill["name"].as_str().unwrap_or_default());
            if !key.is_empty() {
                merged.insert(key, skill);
            }
        }
    }

    let mut skills = merged.into_values().collect::<Vec<_>>();
    skills.sort_by(|left, right| {
        left["name"]
            .as_str()
            .unwrap_or_default()
            .cmp(right["name"].as_str().unwrap_or_default())
    });

    Ok(json!({
        "skills": skills,
        "managedRoots": managed_roots,
        "writableRoots": writable_roots,
    }))
}
