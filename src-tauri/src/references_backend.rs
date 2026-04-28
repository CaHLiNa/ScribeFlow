use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::references_merge::merge_library_snapshots;
use crate::references_snapshot::{
    bool_value, build_default_snapshot, clone_array, is_effectively_empty_snapshot,
    normalize_reference_record, normalize_snapshot, trim_string, StringExt,
};

const REFERENCES_DIRNAME: &str = "references";
const PDFS_DIRNAME: &str = "pdfs";
const FULLTEXT_DIRNAME: &str = "fulltext";
const REFERENCE_LIBRARY_FILENAME: &str = "library.json";

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
pub struct ReferenceLibraryLoadWorkspaceParams {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceSnapshotNormalizeParams {
    #[serde(default)]
    pub snapshot: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceRecordNormalizeParams {
    #[serde(default)]
    pub reference: Value,
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

fn write_snapshot_to_file(path: &Path, snapshot: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("Failed to serialize snapshot: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

pub(crate) fn write_library_snapshot(
    global_config_dir: &str,
    snapshot: &Value,
) -> Result<Value, String> {
    let Some(library_file) = reference_library_file(global_config_dir) else {
        return Ok(normalize_snapshot(snapshot));
    };
    let existing_snapshot = if library_file.exists() {
        read_snapshot_from_file(&library_file).ok()
    } else {
        None
    };

    let mut normalized = normalize_snapshot(snapshot);
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
                Some(legacy_snapshot) => merge_library_snapshots(&project_snapshot, &legacy_snapshot),
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

fn migrate_reference_assets_values(global_config_dir: &str, references: &[Value]) -> Result<Vec<Value>, String> {
    if global_config_dir.trim().is_empty() || references.is_empty() {
        return Ok(references.to_vec());
    }
    let Some(references_dir) = references_dir(global_config_dir) else {
        return Ok(references.to_vec());
    };
    let pdfs_dir = references_dir.join(PDFS_DIRNAME);
    let pdfs_root = normalize_root(&pdfs_dir.to_string_lossy());
    let mut migrated = Vec::new();

    for reference in references {
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
            global_config_dir: global_config_dir.to_string(),
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

    Ok(migrated)
}

#[tauri::command]
pub async fn references_library_read_or_create(
    params: ReferenceLibraryReadParams,
) -> Result<Value, String> {
    load_or_create_snapshot(&params)
}

#[tauri::command]
pub async fn references_library_load_workspace(
    params: ReferenceLibraryLoadWorkspaceParams,
) -> Result<Value, String> {
    let snapshot = load_or_create_snapshot(&ReferenceLibraryReadParams {
        global_config_dir: params.global_config_dir.clone(),
        legacy_workspace_data_dir: params.legacy_workspace_data_dir,
        legacy_project_root: params.legacy_project_root,
    })?;

    let migrated_references = migrate_reference_assets_values(
        &params.global_config_dir,
        snapshot
            .get("references")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    )?;

    let next_snapshot = json!({
        "version": snapshot.get("version").and_then(Value::as_u64).unwrap_or(2),
        "legacyMigrationComplete": true,
        "citationStyle": trim_string(snapshot.get("citationStyle")).if_empty_then(|| "apa".to_string()),
        "collections": clone_array(snapshot.get("collections")),
        "tags": clone_array(snapshot.get("tags")),
        "references": migrated_references,
    });

    write_library_snapshot(&params.global_config_dir, &next_snapshot)
}

#[tauri::command]
pub async fn references_library_write(
    params: ReferenceLibraryWriteParams,
) -> Result<Value, String> {
    write_library_snapshot(&params.global_config_dir, &params.snapshot)
}

#[tauri::command]
pub async fn references_asset_store(params: ReferenceAssetStoreParams) -> Result<Value, String> {
    store_reference_asset(&params)
}

#[tauri::command]
pub async fn references_assets_migrate(
    params: ReferenceAssetsMigrateParams,
) -> Result<Value, String> {
    Ok(Value::Array(migrate_reference_assets_values(
        &params.global_config_dir,
        &params.references,
    )?))
}

#[tauri::command]
pub async fn references_snapshot_normalize(
    params: ReferenceSnapshotNormalizeParams,
) -> Result<Value, String> {
    Ok(normalize_snapshot(&params.snapshot))
}

#[tauri::command]
pub async fn references_record_normalize(
    params: ReferenceRecordNormalizeParams,
) -> Result<Value, String> {
    Ok(normalize_reference_record(&params.reference))
}

#[cfg(test)]
mod tests {
    use super::{normalize_reference_record, normalize_snapshot};
    use serde_json::json;

    #[test]
    fn snapshot_normalization_builds_tag_registry_and_drops_fixture_refs() {
        let normalized = normalize_snapshot(&json!({
            "citationStyle": "apa",
            "collections": [{ "key": "reading", "label": "Reading" }],
            "tags": [{ "key": "seed", "label": "Seed" }],
            "references": [
                {
                    "id": "custom-1",
                    "typeKey": "article",
                    "title": "A Title",
                    "authors": ["Ada Lovelace"],
                    "collections": ["Reading"],
                    "tags": ["Robotics", { "label": "Control" }]
                },
                {
                    "id": "ref-1",
                    "title": "CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems"
                }
            ]
        }));

        assert_eq!(
            normalized["references"].as_array().map(|v| v.len()),
            Some(1)
        );
        assert_eq!(
            normalized["collections"].as_array().map(|v| v.len()),
            Some(1)
        );
        assert_eq!(normalized["tags"].as_array().map(|v| v.len()), Some(3));
    }

    #[test]
    fn reference_normalization_canonicalizes_type_and_assets() {
        let normalized = normalize_reference_record(&json!({
            "typeKey": "article",
            "title": "A Title",
            "authors": ["Ada Lovelace"],
            "pdfPath": "/tmp/a.pdf",
            "tags": [{ "label": "Control" }, "AI"]
        }));

        assert_eq!(normalized["typeKey"].as_str(), Some("journal-article"));
        assert_eq!(normalized["hasPdf"].as_bool(), Some(true));
        assert_eq!(normalized["tags"].as_array().map(|v| v.len()), Some(2));
    }
}
