use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::ai_skill_catalog::{
    managed_skill_roots, path_starts_with, writable_skill_roots, AiSkillCatalogParams,
};
use crate::ai_skill_text::{
    build_skill_markdown, parse_skill_markdown, rewrite_skill_markdown, slugify_skill_name,
    SKILL_FILE_NAME,
};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillCreateParams {
    #[serde(flatten)]
    pub catalog: AiSkillCatalogParams,
    pub scope: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillImportParams {
    #[serde(flatten)]
    pub catalog: AiSkillCatalogParams,
    pub scope: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillDeleteParams {
    #[serde(flatten)]
    pub catalog: AiSkillCatalogParams,
    pub skill: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSkillUpdateParams {
    #[serde(flatten)]
    pub catalog: AiSkillCatalogParams,
    pub skill: Value,
    #[serde(default)]
    pub next_name: String,
    #[serde(default)]
    pub next_description: String,
    #[serde(default)]
    pub next_body: String,
}

fn path_exists(path: &Path) -> bool {
    path.exists()
}

fn get_directory_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string()
}

fn ensure_managed_root(params: &AiSkillCatalogParams, scope: &str) -> Result<String, String> {
    let roots = managed_skill_roots(&params.workspace_path, &params.global_config_dir);
    let target_root = roots.get(scope).cloned().unwrap_or_default();
    if target_root.is_empty() {
        return Err(format!("Managed skill scope is not available: {scope}"));
    }
    Ok(target_root)
}

fn ensure_skill_is_managed(params: &AiSkillCatalogParams, skill: &Value) -> Result<String, String> {
    let directory_path = skill
        .get("pathToSkillDir")
        .or_else(|| skill.get("directoryPath"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if directory_path.is_empty() {
        return Err("Managed skill directory is missing.".to_string());
    }
    let roots = managed_skill_roots(&params.workspace_path, &params.global_config_dir);
    if roots
        .values()
        .any(|root| path_starts_with(directory_path, root))
    {
        return Ok(directory_path.to_string());
    }
    Err("Only managed skills can be deleted from settings.".to_string())
}

fn ensure_skill_is_writable(
    params: &AiSkillCatalogParams,
    skill: &Value,
) -> Result<String, String> {
    let directory_path = skill
        .get("pathToSkillDir")
        .or_else(|| skill.get("directoryPath"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if directory_path.is_empty() {
        return Err("Writable skill directory is missing.".to_string());
    }
    let writable_roots = writable_skill_roots(&params.workspace_path, &params.global_config_dir);
    if writable_roots
        .iter()
        .any(|root| path_starts_with(directory_path, root))
    {
        return Ok(directory_path.to_string());
    }
    Err("Only writable skills can be edited from settings.".to_string())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path();
        let target_path = dest.join(entry.file_name());
        if entry_path.is_dir() {
            copy_dir_recursive(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn resolve_unique_duplicate_directory(base_dir: &Path) -> PathBuf {
    if !path_exists(base_dir) {
        return base_dir.to_path_buf();
    }
    let mut counter = 2;
    loop {
        let candidate = PathBuf::from(format!("{}-{counter}", base_dir.to_string_lossy()));
        if !path_exists(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}

#[tauri::command]
pub async fn ai_skill_create(params: AiSkillCreateParams) -> Result<Value, String> {
    let target_root = ensure_managed_root(&params.catalog, &params.scope)?;
    let slug = slugify_skill_name(&params.name);
    if slug.is_empty() {
        return Err("Skill name is required.".to_string());
    }

    let target_dir = PathBuf::from(target_root).join(&slug);
    if path_exists(&target_dir) {
        return Err(format!("Skill already exists: {slug}"));
    }

    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    fs::write(
        target_dir.join(SKILL_FILE_NAME),
        build_skill_markdown(&slug, &params.description, &params.body, None),
    )
    .map_err(|error| error.to_string())?;

    Ok(Value::String(target_dir.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn ai_skill_import(params: AiSkillImportParams) -> Result<Value, String> {
    let target_root = ensure_managed_root(&params.catalog, &params.scope)?;
    let source_path = PathBuf::from(params.source_path.trim());
    if !path_exists(&source_path) {
        return Err("Source skill path is required.".to_string());
    }

    if source_path.is_dir() {
        let skill_file = source_path.join(SKILL_FILE_NAME);
        let markdown = fs::read_to_string(&skill_file)
            .map_err(|_| "Selected directory does not contain SKILL.md.".to_string())?;
        let parsed = parse_skill_markdown(&markdown, &get_directory_name(&source_path));
        let slug = slugify_skill_name(&parsed.name);
        let target_dir = PathBuf::from(target_root).join(&slug);
        if path_exists(&target_dir) {
            return Err(format!("Skill already exists: {slug}"));
        }
        copy_dir_recursive(&source_path, &target_dir)?;
        return Ok(Value::String(target_dir.to_string_lossy().to_string()));
    }

    let markdown = fs::read_to_string(&source_path)
        .map_err(|_| "Selected file could not be read as a skill.".to_string())?;
    let fallback = source_path
        .parent()
        .map(get_directory_name)
        .unwrap_or_default();
    let parsed = parse_skill_markdown(&markdown, &fallback);
    let slug = slugify_skill_name(&parsed.name);
    let target_dir = PathBuf::from(target_root).join(&slug);
    if path_exists(&target_dir) {
        return Err(format!("Skill already exists: {slug}"));
    }
    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    fs::copy(&source_path, target_dir.join(SKILL_FILE_NAME)).map_err(|error| error.to_string())?;
    Ok(Value::String(target_dir.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn ai_skill_delete(params: AiSkillDeleteParams) -> Result<(), String> {
    let directory_path = ensure_skill_is_managed(&params.catalog, &params.skill)?;
    let path = PathBuf::from(directory_path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub async fn ai_skill_update(params: AiSkillUpdateParams) -> Result<Value, String> {
    let current_dir = PathBuf::from(ensure_skill_is_writable(&params.catalog, &params.skill)?);
    let slug = slugify_skill_name(&params.next_name);
    if slug.is_empty() {
        return Err("Skill name is required.".to_string());
    }

    let parent_dir = current_dir
        .parent()
        .ok_or_else(|| "Writable skill directory is missing.".to_string())?;
    let target_dir = parent_dir.join(&slug);
    if target_dir != current_dir && path_exists(&target_dir) {
        return Err(format!("Skill already exists: {slug}"));
    }

    if target_dir != current_dir {
        fs::rename(&current_dir, &target_dir).map_err(|error| error.to_string())?;
    }

    let skill_file = target_dir.join(SKILL_FILE_NAME);
    let current_markdown = fs::read_to_string(&skill_file).unwrap_or_default();
    let fallback_frontmatter = params
        .skill
        .get("frontmatter")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);

    fs::write(
        &skill_file,
        rewrite_skill_markdown(
            &current_markdown,
            &slug,
            Some(&params.next_description),
            Some(&params.next_body),
            Some(&fallback_frontmatter),
        ),
    )
    .map_err(|error| error.to_string())?;

    Ok(Value::String(target_dir.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn ai_skill_duplicate(params: AiSkillDeleteParams) -> Result<Value, String> {
    let current_dir = PathBuf::from(ensure_skill_is_writable(&params.catalog, &params.skill)?);
    let parent_dir = current_dir
        .parent()
        .ok_or_else(|| "Writable skill directory is missing.".to_string())?;
    let base_name = get_directory_name(&current_dir);
    let target_dir =
        resolve_unique_duplicate_directory(&parent_dir.join(format!("{base_name}-copy")));
    copy_dir_recursive(&current_dir, &target_dir)?;

    let duplicated_skill_file = target_dir.join(SKILL_FILE_NAME);
    let duplicated_markdown = fs::read_to_string(&duplicated_skill_file).unwrap_or_default();
    let fallback_frontmatter = params
        .skill
        .get("frontmatter")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);
    let fallback_body = params.skill["body"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let next_name = get_directory_name(&target_dir);
    let next_body = if duplicated_markdown.is_empty() {
        fallback_body
    } else {
        parse_skill_markdown(&duplicated_markdown, &next_name).body
    };

    fs::write(
        &duplicated_skill_file,
        rewrite_skill_markdown(
            &duplicated_markdown,
            &next_name,
            None,
            Some(&next_body),
            Some(&fallback_frontmatter),
        ),
    )
    .map_err(|error| error.to_string())?;

    Ok(Value::String(target_dir.to_string_lossy().to_string()))
}
