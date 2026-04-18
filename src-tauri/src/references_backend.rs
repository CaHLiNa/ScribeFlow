use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REFERENCES_DIRNAME: &str = "references";
const PDFS_DIRNAME: &str = "pdfs";
const FULLTEXT_DIRNAME: &str = "fulltext";
const REFERENCE_LIBRARY_FILENAME: &str = "library.json";

const LEGACY_REFERENCE_FIXTURE_IDS: &[&str] = &["ref-1", "ref-2", "ref-3"];
const LEGACY_REFERENCE_FIXTURE_TITLES: &[&str] = &[
    "CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems",
    "Constraint-aware planning for long-horizon safe robot adaptation",
    "Verification-friendly policy updates under barrier-certified constraints",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceLibraryReadParams {
    pub global_config_dir: String,
    #[serde(default)]
    pub legacy_workspace_data_dir: String,
    #[serde(default)]
    pub legacy_project_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceLibraryWriteParams {
    pub global_config_dir: String,
    #[serde(default)]
    pub snapshot: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceAssetStoreParams {
    pub global_config_dir: String,
    #[serde(default)]
    pub reference: Value,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub extracted_text: Option<String>,
    #[serde(default)]
    pub existing_fulltext_source_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceAssetsMigrateParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub references: Vec<Value>,
}

fn trim_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn bool_value(value: Option<&Value>) -> bool {
    value.and_then(Value::as_bool).unwrap_or(false)
}

fn string_array(value: Option<&Value>) -> Vec<Value> {
    value
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(|entry| Value::String(entry.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn clone_array(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

fn normalize_reference_type_key(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "article" | "journal-article" | "journal article" | "期刊论文" => {
            "journal-article".to_string()
        }
        "inproceedings" | "conference" | "conference-paper" | "conference paper" | "会议论文" => {
            "conference-paper".to_string()
        }
        "book" | "图书" => "book".to_string(),
        "thesis" | "phdthesis" | "mastersthesis" | "学位论文" => "thesis".to_string(),
        "other" | "other reference" | "其他文献" => "other".to_string(),
        _ => "other".to_string(),
    }
}

fn normalize_reference_record(reference: &Value) -> Value {
    let mut map = reference.as_object().cloned().unwrap_or_default();
    let authors = string_array(map.get("authors"));
    let author_line = trim_string(map.get("authorLine")).if_empty_then(|| {
        authors
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("; ")
    });
    let pdf_path = trim_string(map.get("pdfPath"));
    let fulltext_path = trim_string(map.get("fulltextPath"));
    let type_key = normalize_reference_type_key(
        &trim_string(map.get("typeKey")).if_empty_then(|| trim_string(map.get("typeLabel"))),
    );

    map.insert("authors".to_string(), Value::Array(authors));
    map.insert("authorLine".to_string(), Value::String(author_line));
    map.insert(
        "collections".to_string(),
        Value::Array(clone_array(map.get("collections"))),
    );
    map.insert(
        "tags".to_string(),
        Value::Array(clone_array(map.get("tags"))),
    );
    map.insert(
        "notes".to_string(),
        Value::Array(clone_array(map.get("notes"))),
    );
    map.insert(
        "annotations".to_string(),
        Value::Array(clone_array(map.get("annotations"))),
    );
    map.insert("pdfPath".to_string(), Value::String(pdf_path.clone()));
    map.insert(
        "fulltextPath".to_string(),
        Value::String(fulltext_path.clone()),
    );
    map.insert(
        "hasPdf".to_string(),
        Value::Bool(!pdf_path.is_empty() || bool_value(map.get("hasPdf"))),
    );
    map.insert(
        "hasFullText".to_string(),
        Value::Bool(!fulltext_path.is_empty() || bool_value(map.get("hasFullText"))),
    );
    map.insert("typeKey".to_string(), Value::String(type_key));
    Value::Object(map)
}

fn is_legacy_fixture_reference(reference: &Value) -> bool {
    let id = trim_string(reference.get("id"));
    let title = trim_string(reference.get("title"));
    LEGACY_REFERENCE_FIXTURE_IDS.contains(&id.as_str())
        && LEGACY_REFERENCE_FIXTURE_TITLES.contains(&title.as_str())
}

fn normalize_snapshot(raw: &Value) -> Value {
    let collections = clone_array(raw.get("collections"));
    let tags = clone_array(raw.get("tags"));
    let references: Vec<Value> = raw
        .get("references")
        .and_then(Value::as_array)
        .map(|references| {
            references
                .iter()
                .map(normalize_reference_record)
                .filter(|reference| !is_legacy_fixture_reference(reference))
                .collect()
        })
        .unwrap_or_default();

    json!({
        "version": raw.get("version").and_then(Value::as_u64).unwrap_or(2),
        "legacyMigrationComplete": bool_value(raw.get("legacyMigrationComplete")),
        "citationStyle": trim_string(raw.get("citationStyle")).if_empty_then(|| "apa".to_string()),
        "collections": collections,
        "tags": tags,
        "references": references,
    })
}

fn build_default_snapshot() -> Value {
    json!({
        "version": 2,
        "legacyMigrationComplete": false,
        "citationStyle": "apa",
        "collections": [],
        "tags": [],
        "references": [],
    })
}

fn is_effectively_empty_snapshot(snapshot: &Value) -> bool {
    snapshot
        .get("references")
        .and_then(Value::as_array)
        .map(|entries| entries.is_empty())
        .unwrap_or(true)
        && snapshot
            .get("collections")
            .and_then(Value::as_array)
            .map(|entries| entries.is_empty())
            .unwrap_or(true)
        && snapshot
            .get("tags")
            .and_then(Value::as_array)
            .map(|entries| entries.is_empty())
            .unwrap_or(true)
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn references_dir(global_config_dir: &str) -> Option<PathBuf> {
    let base = normalize_root(global_config_dir);
    if base.is_empty() {
        return None;
    }
    Some(Path::new(&base).join(REFERENCES_DIRNAME))
}

fn reference_library_file(global_config_dir: &str) -> Option<PathBuf> {
    references_dir(global_config_dir).map(|dir| dir.join(REFERENCE_LIBRARY_FILENAME))
}

fn legacy_reference_library_candidates(
    legacy_project_root: &str,
    legacy_workspace_data_dir: &str,
) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for root in [legacy_project_root, legacy_workspace_data_dir] {
        let normalized = normalize_root(root);
        if normalized.is_empty() {
            continue;
        }
        candidates.push(
            Path::new(&normalized)
                .join(REFERENCES_DIRNAME)
                .join(REFERENCE_LIBRARY_FILENAME),
        );
    }
    candidates
}

fn read_snapshot_from_file(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    Ok(normalize_snapshot(&parsed))
}

fn read_first_existing_legacy_snapshot(
    legacy_project_root: &str,
    legacy_workspace_data_dir: &str,
) -> Result<Option<Value>, String> {
    for candidate in
        legacy_reference_library_candidates(legacy_project_root, legacy_workspace_data_dir)
    {
        if candidate.exists() {
            return read_snapshot_from_file(&candidate).map(Some);
        }
    }
    Ok(None)
}

fn merge_library_entries(primary: &[Value], secondary: &[Value], field: &str) -> Vec<Value> {
    let mut merged = Vec::new();
    let mut seen = HashSet::new();

    for item in primary.iter().chain(secondary.iter()) {
        let identity = item
            .get(field)
            .or_else(|| item.get("label"))
            .or_else(|| item.get("id"))
            .and_then(Value::as_str)
            .map(|value| value.trim().to_lowercase())
            .unwrap_or_default();
        if identity.is_empty() || seen.contains(&identity) {
            continue;
        }
        seen.insert(identity);
        merged.push(item.clone());
    }

    merged
}

fn tokenize_title(value: &str) -> HashSet<String> {
    let mut tokens = HashSet::new();
    let mut current = String::new();
    for ch in value.trim().to_lowercase().chars() {
        if ch.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            current.push(ch);
        } else if !current.is_empty() {
            tokens.insert(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        tokens.insert(current);
    }
    tokens
}

fn title_similarity(left: &str, right: &str) -> f64 {
    let left_tokens = tokenize_title(left);
    let right_tokens = tokenize_title(right);
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return 0.0;
    }
    let intersection = left_tokens.intersection(&right_tokens).count() as f64;
    let union = left_tokens.union(&right_tokens).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn same_reference_identity(current: &Value, candidate: &Value) -> bool {
    let candidate_citation_key = trim_string(candidate.get("citationKey")).to_lowercase();
    let candidate_identifier = trim_string(candidate.get("identifier")).to_lowercase();
    let candidate_title = trim_string(candidate.get("title")).to_lowercase();
    let candidate_year = candidate.get("year").and_then(Value::as_i64).unwrap_or(0);

    let current_citation_key = trim_string(current.get("citationKey")).to_lowercase();
    if !candidate_citation_key.is_empty()
        && !current_citation_key.is_empty()
        && candidate_citation_key == current_citation_key
    {
        return true;
    }

    let current_identifier = trim_string(current.get("identifier")).to_lowercase();
    if !candidate_identifier.is_empty()
        && !current_identifier.is_empty()
        && candidate_identifier == current_identifier
    {
        return true;
    }

    let current_title = trim_string(current.get("title")).to_lowercase();
    let current_year = current.get("year").and_then(Value::as_i64).unwrap_or(0);
    candidate_year > 0
        && current_year > 0
        && candidate_year == current_year
        && !candidate_title.is_empty()
        && !current_title.is_empty()
        && (candidate_title == current_title
            || title_similarity(&candidate_title, &current_title) >= 0.85)
}

fn merge_reference_entries(primary: &[Value], secondary: &[Value]) -> Vec<Value> {
    let mut merged = primary.to_vec();
    for candidate in secondary {
        if !merged
            .iter()
            .any(|current| same_reference_identity(current, candidate))
        {
            merged.push(candidate.clone());
        }
    }
    merged
}

fn merge_library_snapshots(current: &Value, legacy: &Value) -> Value {
    let normalized_current = normalize_snapshot(current);
    let normalized_legacy = normalize_snapshot(legacy);

    if is_effectively_empty_snapshot(&normalized_current)
        && !is_effectively_empty_snapshot(&normalized_legacy)
    {
        return normalized_legacy;
    }
    if is_effectively_empty_snapshot(&normalized_legacy) {
        return normalized_current;
    }

    let current_collections = clone_array(normalized_current.get("collections"));
    let legacy_collections = clone_array(normalized_legacy.get("collections"));
    let current_tags = clone_array(normalized_current.get("tags"));
    let legacy_tags = clone_array(normalized_legacy.get("tags"));
    let current_references = clone_array(normalized_current.get("references"));
    let legacy_references = clone_array(normalized_legacy.get("references"));

    json!({
        "version": 2,
        "legacyMigrationComplete": true,
        "citationStyle": trim_string(normalized_current.get("citationStyle"))
            .if_empty_then(|| trim_string(normalized_legacy.get("citationStyle")))
            .if_empty_then(|| "apa".to_string()),
        "collections": merge_library_entries(&current_collections, &legacy_collections, "key"),
        "tags": merge_library_entries(&current_tags, &legacy_tags, "key"),
        "references": merge_reference_entries(&current_references, &legacy_references),
    })
}

fn write_snapshot_to_file(path: &Path, snapshot: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("Failed to serialize snapshot: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn load_or_create_snapshot(params: &ReferenceLibraryReadParams) -> Result<Value, String> {
    let Some(library_file) = reference_library_file(&params.global_config_dir) else {
        return Ok(build_default_snapshot());
    };

    if library_file.exists() {
        let project_snapshot = read_snapshot_from_file(&library_file)?;
        let should_attempt_legacy_migration =
            !bool_value(project_snapshot.get("legacyMigrationComplete"))
                && is_effectively_empty_snapshot(&project_snapshot);

        let snapshot = if should_attempt_legacy_migration {
            match read_first_existing_legacy_snapshot(
                &params.legacy_project_root,
                &params.legacy_workspace_data_dir,
            )? {
                Some(legacy_snapshot) => {
                    merge_library_snapshots(&project_snapshot, &legacy_snapshot)
                }
                None => project_snapshot,
            }
        } else {
            project_snapshot
        };

        let normalized = json!({
            "version": 2,
            "legacyMigrationComplete": true,
            "citationStyle": trim_string(snapshot.get("citationStyle")).if_empty_then(|| "apa".to_string()),
            "collections": clone_array(snapshot.get("collections")),
            "tags": clone_array(snapshot.get("tags")),
            "references": clone_array(snapshot.get("references")),
        });
        write_snapshot_to_file(&library_file, &normalized)?;
        return Ok(normalized);
    }

    if let Some(legacy_snapshot) = read_first_existing_legacy_snapshot(
        &params.legacy_project_root,
        &params.legacy_workspace_data_dir,
    )? {
        let migrated = json!({
            "version": 2,
            "legacyMigrationComplete": true,
            "citationStyle": trim_string(legacy_snapshot.get("citationStyle")).if_empty_then(|| "apa".to_string()),
            "collections": clone_array(legacy_snapshot.get("collections")),
            "tags": clone_array(legacy_snapshot.get("tags")),
            "references": clone_array(legacy_snapshot.get("references")),
        });
        write_snapshot_to_file(&library_file, &migrated)?;
        return Ok(migrated);
    }

    let mut initial = build_default_snapshot();
    if let Some(map) = initial.as_object_mut() {
        map.insert("legacyMigrationComplete".to_string(), Value::Bool(true));
    }
    write_snapshot_to_file(&library_file, &initial)?;
    Ok(initial)
}

fn sanitize_asset_segment(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in value.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric()
            || ('\u{4e00}'..='\u{9fff}').contains(&ch)
            || ch == '_'
            || ch == '-'
        {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn fallback_asset_name() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("reference-{timestamp}")
}

fn store_reference_asset(params: &ReferenceAssetStoreParams) -> Result<Value, String> {
    let normalized_source = params.source_path.trim();
    if params.global_config_dir.trim().is_empty() || normalized_source.is_empty() {
        return Ok(normalize_reference_record(&params.reference));
    }

    let Some(references_dir) = references_dir(&params.global_config_dir) else {
        return Ok(normalize_reference_record(&params.reference));
    };
    let pdfs_dir = references_dir.join(PDFS_DIRNAME);
    let fulltext_dir = references_dir.join(FULLTEXT_DIRNAME);
    fs::create_dir_all(&pdfs_dir).map_err(|error| error.to_string())?;
    fs::create_dir_all(&fulltext_dir).map_err(|error| error.to_string())?;

    let reference = normalize_reference_record(&params.reference);
    let base_name = sanitize_asset_segment(
        &trim_string(reference.get("citationKey"))
            .if_empty_then(|| trim_string(reference.get("id")))
            .if_empty_then(|| trim_string(reference.get("title"))),
    )
    .if_empty_then(fallback_asset_name);

    let extension = Path::new(normalized_source)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| format!(".{}", extension.to_lowercase()))
        .unwrap_or_else(|| ".pdf".to_string());
    let dest_pdf_path = pdfs_dir.join(format!("{base_name}{extension}"));
    let dest_text_path = fulltext_dir.join(format!("{base_name}.txt"));

    if normalize_root(normalized_source) != normalize_root(&dest_pdf_path.to_string_lossy()) {
        fs::copy(normalized_source, &dest_pdf_path).map_err(|error| error.to_string())?;
    }

    let mut fulltext_path = String::new();
    let extracted_text = params.extracted_text.clone().unwrap_or_default();
    if !extracted_text.trim().is_empty() {
        fs::write(&dest_text_path, extracted_text).map_err(|error| error.to_string())?;
        fulltext_path = dest_text_path.to_string_lossy().to_string();
    } else if let Some(existing_fulltext_source_path) = &params.existing_fulltext_source_path {
        let normalized_existing = existing_fulltext_source_path.trim();
        if !normalized_existing.is_empty() {
            let normalized_dest = dest_text_path.to_string_lossy().to_string();
            if normalize_root(normalized_existing) == normalize_root(&normalized_dest) {
                if dest_text_path.exists() {
                    fulltext_path = normalized_dest;
                }
            } else if Path::new(normalized_existing).exists() {
                fs::copy(normalized_existing, &dest_text_path)
                    .map_err(|error| error.to_string())?;
                fulltext_path = normalized_dest;
            }
        }
    }

    let mut map = reference.as_object().cloned().unwrap_or_default();
    map.insert(
        "pdfPath".to_string(),
        Value::String(dest_pdf_path.to_string_lossy().to_string()),
    );
    map.insert("hasPdf".to_string(), Value::Bool(true));
    map.insert(
        "fulltextPath".to_string(),
        Value::String(fulltext_path.clone()),
    );
    map.insert(
        "hasFullText".to_string(),
        Value::Bool(!fulltext_path.is_empty()),
    );
    Ok(normalize_reference_record(&Value::Object(map)))
}

#[tauri::command]
pub async fn references_library_read_or_create(
    params: ReferenceLibraryReadParams,
) -> Result<Value, String> {
    load_or_create_snapshot(&params)
}

#[tauri::command]
pub async fn references_library_write(
    params: ReferenceLibraryWriteParams,
) -> Result<Value, String> {
    let Some(library_file) = reference_library_file(&params.global_config_dir) else {
        return Ok(normalize_snapshot(&params.snapshot));
    };
    let existing_snapshot = if library_file.exists() {
        read_snapshot_from_file(&library_file).ok()
    } else {
        None
    };

    let mut normalized = normalize_snapshot(&params.snapshot);
    if let Some(existing_snapshot) = existing_snapshot {
        if bool_value(existing_snapshot.get("legacyMigrationComplete")) {
            if let Some(map) = normalized.as_object_mut() {
                map.insert("legacyMigrationComplete".to_string(), Value::Bool(true));
            }
        }
    }

    write_snapshot_to_file(&library_file, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn references_asset_store(params: ReferenceAssetStoreParams) -> Result<Value, String> {
    store_reference_asset(&params)
}

#[tauri::command]
pub async fn references_assets_migrate(
    params: ReferenceAssetsMigrateParams,
) -> Result<Value, String> {
    if params.global_config_dir.trim().is_empty() || params.references.is_empty() {
        return Ok(Value::Array(params.references));
    }
    let Some(references_dir) = references_dir(&params.global_config_dir) else {
        return Ok(Value::Array(params.references));
    };
    let pdfs_dir = references_dir.join(PDFS_DIRNAME);
    let pdfs_root = normalize_root(&pdfs_dir.to_string_lossy());
    let mut migrated = Vec::new();

    for reference in &params.references {
        let normalized_reference = normalize_reference_record(reference);
        let pdf_path = trim_string(normalized_reference.get("pdfPath"));
        let fulltext_path = trim_string(normalized_reference.get("fulltextPath"));
        if pdf_path.is_empty()
            || normalize_root(&pdf_path) == pdfs_root
            || normalize_root(&pdf_path).starts_with(&format!("{pdfs_root}/"))
        {
            migrated.push(normalized_reference);
            continue;
        }

        let extracted_text = pdf_extract::extract_text(Path::new(&pdf_path)).unwrap_or_default();
        let next = store_reference_asset(&ReferenceAssetStoreParams {
            global_config_dir: params.global_config_dir.clone(),
            reference: normalized_reference.clone(),
            source_path: pdf_path.clone(),
            extracted_text: Some(extracted_text),
            existing_fulltext_source_path: if fulltext_path.is_empty() {
                None
            } else {
                Some(fulltext_path)
            },
        })
        .unwrap_or(normalized_reference);
        migrated.push(next);
    }

    Ok(Value::Array(migrated))
}

trait StringExt {
    fn if_empty_then<F>(self, fallback: F) -> String
    where
        F: FnOnce() -> String;
}

impl StringExt for String {
    fn if_empty_then<F>(self, fallback: F) -> String
    where
        F: FnOnce() -> String,
    {
        if self.is_empty() {
            fallback()
        } else {
            self
        }
    }
}
