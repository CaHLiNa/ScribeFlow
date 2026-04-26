use serde::Deserialize;
use serde_json::{json, Value};

use crate::references_merge::{
    find_duplicate_reference_internal, merge_imported_references_internal,
};
use crate::references_snapshot::{normalize_reference_record, normalize_snapshot, trim_string};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesMutationApplyParams {
    #[serde(default)]
    pub snapshot: Value,
    pub action: ReferencesMutationAction,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReferencesMutationAction {
    AddReference {
        reference: Value,
        #[serde(default)]
        mark_for_zotero_push: bool,
    },
    UpdateReference {
        reference_id: String,
        #[serde(default)]
        updates: Value,
    },
    RemoveReference { reference_id: String },
    CreateCollection { label: String },
    RenameCollection {
        collection_key: String,
        next_label: String,
    },
    RemoveCollection { collection_key: String },
    ToggleReferenceCollection {
        reference_id: String,
        collection_key: String,
    },
    MergeImportedReferences { imported: Vec<Value> },
}

fn normalize_collection_label(label: &str) -> String {
    label.trim().to_lowercase()
}

fn normalize_collection_membership_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn build_collection_key(label: &str) -> String {
    let mut slug = String::new();
    let mut pending_separator = false;

    for ch in label.trim().chars().flat_map(|ch| ch.to_lowercase()) {
        let is_allowed =
            ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fa5}').contains(&ch);
        if is_allowed {
            if pending_separator && !slug.is_empty() {
                slug.push('-');
            }
            pending_separator = false;
            slug.push(ch);
        } else if !slug.is_empty() {
            pending_separator = true;
        }
    }

    if slug.is_empty() {
        "collection".to_string()
    } else {
        slug
    }
}

fn resolve_collection(collections: &[Value], collection_key: &str) -> Option<Value> {
    let normalized_key = normalize_collection_membership_value(collection_key);
    if normalized_key.is_empty() {
        return None;
    }

    collections
        .iter()
        .find(|collection| {
            normalize_collection_membership_value(&trim_string(collection.get("key")))
                == normalized_key
        })
        .cloned()
        .or_else(|| {
            collections
                .iter()
                .find(|collection| {
                    normalize_collection_membership_value(&trim_string(collection.get("label")))
                        == normalized_key
                })
                .cloned()
        })
}

fn reference_has_collection(reference: &Value, collection: &Value) -> bool {
    let memberships = reference
        .get("collections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let normalized_key = normalize_collection_membership_value(&trim_string(collection.get("key")));
    let normalized_label =
        normalize_collection_membership_value(&trim_string(collection.get("label")));

    memberships.iter().any(|value| {
        let normalized_value =
            normalize_collection_membership_value(value.as_str().unwrap_or_default());
        normalized_value == normalized_key || normalized_value == normalized_label
    })
}

fn normalize_snapshot_references(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("references")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn normalize_snapshot_collections(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("collections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn normalized_snapshot_with(
    snapshot: &Value,
    collections: Option<Vec<Value>>,
    references: Option<Vec<Value>>,
) -> Value {
    let mut next = snapshot.as_object().cloned().unwrap_or_default();
    if let Some(collections) = collections {
        next.insert("collections".to_string(), Value::Array(collections));
    }
    if let Some(references) = references {
        next.insert("references".to_string(), Value::Array(references));
    }
    normalize_snapshot(&Value::Object(next))
}

fn resolve_imported_selection_reference(merged_references: &[Value], imported: &[Value]) -> Option<Value> {
    if imported.is_empty() {
        return None;
    }

    merged_references
        .iter()
        .find(|reference| {
            let reference_id = trim_string(reference.get("id"));
            !reference_id.is_empty()
                && imported
                    .iter()
                    .any(|candidate| trim_string(candidate.get("id")) == reference_id)
        })
        .cloned()
        .or_else(|| {
            merged_references.iter().find_map(|reference| {
                find_duplicate_reference_internal(imported, reference)
                    .map(|_| reference.clone())
            })
        })
}

fn apply_create_collection(snapshot: &Value, label: &str) -> Value {
    let trimmed_label = label.trim();
    let collections = normalize_snapshot_collections(snapshot);
    if trimmed_label.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "collection": Value::Null,
                "changed": false,
            },
        });
    }

    if let Some(existing) = collections.iter().find(|collection| {
        normalize_collection_label(&trim_string(collection.get("label")))
            == normalize_collection_label(trimmed_label)
    }) {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "collection": existing.clone(),
                "changed": false,
            },
        });
    }

    let base_key = build_collection_key(trimmed_label);
    let mut suffix = 1;
    let mut key = base_key.clone();
    while collections
        .iter()
        .any(|collection| trim_string(collection.get("key")) == key)
    {
        suffix += 1;
        key = format!("{base_key}-{suffix}");
    }

    let next_collection = json!({
        "key": key,
        "label": trimmed_label,
    });
    let mut next_collections = collections;
    next_collections.push(next_collection.clone());

    json!({
        "snapshot": normalized_snapshot_with(snapshot, Some(next_collections), None),
        "result": {
            "collection": next_collection,
            "changed": true,
        },
    })
}

fn apply_rename_collection(snapshot: &Value, collection_key: &str, next_label: &str) -> Value {
    let trimmed_label = next_label.trim();
    let collections = normalize_snapshot_collections(snapshot);
    let references = normalize_snapshot_references(snapshot);
    let Some(collection) = resolve_collection(&collections, collection_key) else {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "collection": Value::Null,
                "changed": false,
            },
        });
    };

    if trimmed_label.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "collection": Value::Null,
                "changed": false,
            },
        });
    }

    if collections.iter().any(|candidate| {
        trim_string(candidate.get("key")) != trim_string(collection.get("key"))
            && normalize_collection_label(&trim_string(candidate.get("label")))
                == normalize_collection_label(trimmed_label)
    }) {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "collection": Value::Null,
                "changed": false,
            },
        });
    }

    let collection_key_value = trim_string(collection.get("key"));
    let collection_label_value = trim_string(collection.get("label"));
    let next_collections = collections
        .into_iter()
        .map(|candidate| {
            if trim_string(candidate.get("key")) == collection_key_value {
                json!({
                    "key": collection_key_value,
                    "label": trimmed_label,
                })
            } else {
                candidate
            }
        })
        .collect::<Vec<_>>();

    let next_references = references
        .into_iter()
        .map(|reference| {
            let memberships = reference
                .get("collections")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if memberships.is_empty() {
                return reference;
            }

            let next_memberships = memberships
                .into_iter()
                .map(|value| {
                    let normalized_value =
                        normalize_collection_membership_value(value.as_str().unwrap_or_default());
                    if normalized_value
                        == normalize_collection_membership_value(&collection_key_value)
                        || normalized_value
                            == normalize_collection_membership_value(&collection_label_value)
                    {
                        Value::String(collection_key_value.clone())
                    } else {
                        value
                    }
                })
                .collect::<Vec<_>>();

            let mut next_reference = reference.as_object().cloned().unwrap_or_default();
            next_reference.insert("collections".to_string(), Value::Array(next_memberships));
            Value::Object(next_reference)
        })
        .collect::<Vec<_>>();

    let snapshot = normalized_snapshot_with(
        snapshot,
        Some(next_collections.clone()),
        Some(next_references),
    );
    let collection = resolve_collection(
        snapshot
            .get("collections")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]),
        &collection_key_value,
    )
    .unwrap_or(Value::Null);

    json!({
        "snapshot": snapshot,
        "result": {
            "collection": collection,
            "changed": true,
        },
    })
}

fn apply_remove_collection(snapshot: &Value, collection_key: &str) -> Value {
    let collections = normalize_snapshot_collections(snapshot);
    let references = normalize_snapshot_references(snapshot);
    let Some(collection) = resolve_collection(&collections, collection_key) else {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "removed": false,
            },
        });
    };

    let collection_key_value = trim_string(collection.get("key"));
    let collection_label_value = trim_string(collection.get("label"));

    let next_collections = collections
        .into_iter()
        .filter(|candidate| trim_string(candidate.get("key")) != collection_key_value)
        .collect::<Vec<_>>();

    let next_references = references
        .into_iter()
        .map(|reference| {
            let memberships = reference
                .get("collections")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if memberships.is_empty() {
                return reference;
            }

            let next_memberships = memberships
                .into_iter()
                .filter(|value| {
                    let normalized_value =
                        normalize_collection_membership_value(value.as_str().unwrap_or_default());
                    normalized_value
                        != normalize_collection_membership_value(&collection_key_value)
                        && normalized_value
                            != normalize_collection_membership_value(&collection_label_value)
                })
                .collect::<Vec<_>>();

            let mut next_reference = reference.as_object().cloned().unwrap_or_default();
            next_reference.insert("collections".to_string(), Value::Array(next_memberships));
            Value::Object(next_reference)
        })
        .collect::<Vec<_>>();

    json!({
        "snapshot": normalized_snapshot_with(snapshot, Some(next_collections), Some(next_references)),
        "result": {
            "removed": true,
        },
    })
}

fn apply_toggle_reference_collection(
    snapshot: &Value,
    reference_id: &str,
    collection_key: &str,
) -> Value {
    let collections = normalize_snapshot_collections(snapshot);
    let references = normalize_snapshot_references(snapshot);
    let Some(collection) = resolve_collection(&collections, collection_key) else {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
                "toggledOn": false,
            },
        });
    };

    let reference_id = reference_id.trim();
    if reference_id.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
                "toggledOn": false,
            },
        });
    }

    let mut changed = false;
    let mut toggled_on = false;
    let next_references = references
        .into_iter()
        .map(|reference| {
            if trim_string(reference.get("id")) != reference_id {
                return reference;
            }

            changed = true;
            let memberships = reference
                .get("collections")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let is_member = reference_has_collection(&reference, &collection);
            let mut next_memberships = memberships
                .into_iter()
                .filter(|value| {
                    let normalized_value =
                        normalize_collection_membership_value(value.as_str().unwrap_or_default());
                    normalized_value
                        != normalize_collection_membership_value(&trim_string(collection.get("key")))
                        && normalized_value
                            != normalize_collection_membership_value(&trim_string(collection.get("label")))
                })
                .collect::<Vec<_>>();

            toggled_on = !is_member;
            if toggled_on {
                next_memberships.push(Value::String(trim_string(collection.get("key"))));
            }

            let mut next_reference = reference.as_object().cloned().unwrap_or_default();
            next_reference.insert("collections".to_string(), Value::Array(next_memberships));
            Value::Object(next_reference)
        })
        .collect::<Vec<_>>();

    let next_snapshot = if changed {
        normalized_snapshot_with(snapshot, None, Some(next_references))
    } else {
        normalize_snapshot(snapshot)
    };

    json!({
        "snapshot": next_snapshot,
        "result": {
            "changed": changed,
            "toggledOn": toggled_on,
        },
    })
}

fn apply_merge_imported_references(snapshot: &Value, imported: &[Value]) -> Value {
    let references = normalize_snapshot_references(snapshot);
    let merged = merge_imported_references_internal(&references, imported);
    let imported_count = merged.len().saturating_sub(references.len());
    let selected_reference = resolve_imported_selection_reference(&merged, imported);
    let selected_reference_id = selected_reference
        .as_ref()
        .map(|reference| trim_string(reference.get("id")))
        .unwrap_or_default();
    let next_snapshot = normalized_snapshot_with(snapshot, None, Some(merged));

    json!({
        "snapshot": next_snapshot,
        "result": {
            "importedCount": imported_count,
            "selectedReferenceId": selected_reference_id,
            "reusedExisting": imported_count == 0 && selected_reference.is_some(),
        },
    })
}

fn apply_add_reference(snapshot: &Value, reference: &Value, mark_for_zotero_push: bool) -> Value {
    let references = normalize_snapshot_references(snapshot);
    let mut candidate = reference.as_object().cloned().unwrap_or_default();
    if mark_for_zotero_push {
        candidate.insert("_appPushPending".to_string(), Value::Bool(true));
    }
    let normalized_candidate = normalize_reference_record(&Value::Object(candidate));

    if let Some(duplicate) = find_duplicate_reference_internal(&references, &normalized_candidate) {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
                "duplicate": true,
                "selectedReferenceId": trim_string(duplicate.get("id")),
            },
        });
    }

    let mut next_references = references;
    let selected_reference_id = trim_string(normalized_candidate.get("id"));
    next_references.push(normalized_candidate);

    json!({
        "snapshot": normalized_snapshot_with(snapshot, None, Some(next_references)),
        "result": {
            "changed": true,
            "duplicate": false,
            "selectedReferenceId": selected_reference_id,
        },
    })
}

fn apply_update_reference(snapshot: &Value, reference_id: &str, updates: &Value) -> Value {
    let references = normalize_snapshot_references(snapshot);
    let reference_id = reference_id.trim();
    if reference_id.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
                "selectedReferenceId": "",
            },
        });
    }

    let Some(reference_index) = references
        .iter()
        .position(|reference| trim_string(reference.get("id")) == reference_id) else {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
                "selectedReferenceId": "",
            },
        });
    };

    let mut merged_reference = references[reference_index]
        .as_object()
        .cloned()
        .unwrap_or_default();
    if let Some(update_map) = updates.as_object() {
        for (key, value) in update_map {
            merged_reference.insert(key.clone(), value.clone());
        }
    }
    let normalized_reference = normalize_reference_record(&Value::Object(merged_reference));
    let selected_reference_id = trim_string(normalized_reference.get("id"));

    let next_references = references
        .into_iter()
        .enumerate()
        .map(|(index, reference)| {
            if index == reference_index {
                normalized_reference.clone()
            } else {
                reference
            }
        })
        .collect::<Vec<_>>();

    json!({
        "snapshot": normalized_snapshot_with(snapshot, None, Some(next_references)),
        "result": {
            "changed": true,
            "selectedReferenceId": selected_reference_id,
        },
    })
}

fn apply_remove_reference(snapshot: &Value, reference_id: &str) -> Value {
    let references = normalize_snapshot_references(snapshot);
    let reference_id = reference_id.trim();
    if reference_id.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "removed": false,
            },
        });
    }

    let next_references = references
        .iter()
        .filter(|reference| trim_string(reference.get("id")) != reference_id)
        .cloned()
        .collect::<Vec<_>>();

    if next_references.len() == references.len() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "removed": false,
            },
        });
    }

    json!({
        "snapshot": normalized_snapshot_with(snapshot, None, Some(next_references)),
        "result": {
            "removed": true,
        },
    })
}

#[tauri::command]
pub async fn references_mutation_apply(
    params: ReferencesMutationApplyParams,
) -> Result<Value, String> {
    let normalized_snapshot = normalize_snapshot(&params.snapshot);
    let result = match params.action {
        ReferencesMutationAction::AddReference {
            reference,
            mark_for_zotero_push,
        } => apply_add_reference(&normalized_snapshot, &reference, mark_for_zotero_push),
        ReferencesMutationAction::UpdateReference {
            reference_id,
            updates,
        } => apply_update_reference(&normalized_snapshot, &reference_id, &updates),
        ReferencesMutationAction::RemoveReference { reference_id } => {
            apply_remove_reference(&normalized_snapshot, &reference_id)
        }
        ReferencesMutationAction::CreateCollection { label } => {
            apply_create_collection(&normalized_snapshot, &label)
        }
        ReferencesMutationAction::RenameCollection {
            collection_key,
            next_label,
        } => apply_rename_collection(&normalized_snapshot, &collection_key, &next_label),
        ReferencesMutationAction::RemoveCollection { collection_key } => {
            apply_remove_collection(&normalized_snapshot, &collection_key)
        }
        ReferencesMutationAction::ToggleReferenceCollection {
            reference_id,
            collection_key,
        } => apply_toggle_reference_collection(&normalized_snapshot, &reference_id, &collection_key),
        ReferencesMutationAction::MergeImportedReferences { imported } => {
            apply_merge_imported_references(&normalized_snapshot, &imported)
        }
    };

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{references_mutation_apply, ReferencesMutationAction, ReferencesMutationApplyParams};
    use serde_json::json;

    fn sample_snapshot() -> serde_json::Value {
        json!({
            "version": 2,
            "citationStyle": "apa",
            "collections": [{ "key": "reading", "label": "Reading" }],
            "tags": [],
            "references": [
                {
                    "id": "ref-1",
                    "title": "Adaptive Control",
                    "year": 2024,
                    "citationKey": "ada2024",
                    "collections": ["reading"],
                    "tags": ["Control"]
                }
            ]
        })
    }

    #[tokio::test]
    async fn create_collection_returns_existing_duplicate() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::CreateCollection {
                label: "reading".to_string(),
            },
        })
        .await
        .expect("create collection");

        assert_eq!(result["result"]["changed"].as_bool(), Some(false));
        assert_eq!(
            result["result"]["collection"]["key"].as_str(),
            Some("reading")
        );
    }

    #[tokio::test]
    async fn remove_collection_updates_memberships() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::RemoveCollection {
                collection_key: "reading".to_string(),
            },
        })
        .await
        .expect("remove collection");

        assert_eq!(result["result"]["removed"].as_bool(), Some(true));
        assert_eq!(
            result["snapshot"]["collections"]
                .as_array()
                .map(|items| items.len()),
            Some(0)
        );
        assert_eq!(
            result["snapshot"]["references"][0]["collections"]
                .as_array()
                .map(|items| items.len()),
            Some(0)
        );
    }

    #[tokio::test]
    async fn merge_imported_references_selects_existing_duplicate() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::MergeImportedReferences {
                imported: vec![json!({
                    "id": "imported-1",
                    "title": "Adaptive Control",
                    "year": 2024,
                    "citationKey": "ada2024",
                    "collections": [],
                    "tags": ["Control"]
                })],
            },
        })
        .await
        .expect("merge imported references");

        assert_eq!(result["result"]["importedCount"].as_u64(), Some(0));
        assert_eq!(
            result["result"]["selectedReferenceId"].as_str(),
            Some("ref-1")
        );
        assert_eq!(result["result"]["reusedExisting"].as_bool(), Some(true));
    }

    #[tokio::test]
    async fn toggle_reference_collection_adds_membership() {
        let snapshot = json!({
            "version": 2,
            "citationStyle": "apa",
            "collections": [{ "key": "reading", "label": "Reading" }],
            "tags": [],
            "references": [
                {
                    "id": "ref-1",
                    "title": "Adaptive Control",
                    "year": 2024,
                    "citationKey": "ada2024",
                    "collections": [],
                    "tags": []
                }
            ]
        });
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot,
            action: ReferencesMutationAction::ToggleReferenceCollection {
                reference_id: "ref-1".to_string(),
                collection_key: "reading".to_string(),
            },
        })
        .await
        .expect("toggle reference collection");

        assert_eq!(result["result"]["changed"].as_bool(), Some(true));
        assert_eq!(result["result"]["toggledOn"].as_bool(), Some(true));
        assert_eq!(
            result["snapshot"]["references"][0]["collections"][0].as_str(),
            Some("reading")
        );
    }

    #[tokio::test]
    async fn add_reference_detects_duplicate_and_selects_existing() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::AddReference {
                reference: json!({
                    "id": "new-ref",
                    "title": "Adaptive Control",
                    "year": 2024,
                    "citationKey": "ada2024",
                    "collections": [],
                    "tags": []
                }),
                mark_for_zotero_push: false,
            },
        })
        .await
        .expect("add reference");

        assert_eq!(result["result"]["changed"].as_bool(), Some(false));
        assert_eq!(result["result"]["duplicate"].as_bool(), Some(true));
        assert_eq!(
            result["result"]["selectedReferenceId"].as_str(),
            Some("ref-1")
        );
    }

    #[tokio::test]
    async fn update_reference_normalizes_and_keeps_selection() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::UpdateReference {
                reference_id: "ref-1".to_string(),
                updates: json!({
                    "tags": [{ "label": "AI" }],
                    "typeKey": "article"
                }),
            },
        })
        .await
        .expect("update reference");

        assert_eq!(result["result"]["changed"].as_bool(), Some(true));
        assert_eq!(
            result["snapshot"]["references"][0]["typeKey"].as_str(),
            Some("journal-article")
        );
        assert_eq!(
            result["snapshot"]["tags"].as_array().map(|items| items.len()),
            Some(2)
        );
    }

    #[tokio::test]
    async fn remove_reference_drops_entry() {
        let result = references_mutation_apply(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            action: ReferencesMutationAction::RemoveReference {
                reference_id: "ref-1".to_string(),
            },
        })
        .await
        .expect("remove reference");

        assert_eq!(result["result"]["removed"].as_bool(), Some(true));
        assert_eq!(
            result["snapshot"]["references"]
                .as_array()
                .map(|items| items.len()),
            Some(0)
        );
    }
}
