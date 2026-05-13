use serde::Deserialize;
use serde_json::{json, Value};

use crate::app_dirs;
use crate::references_merge::{
    find_duplicate_reference_internal, merge_imported_references_internal,
};
use crate::references_snapshot::{
    build_default_snapshot, normalize_reference_record, normalize_snapshot, trim_string,
};
use crate::references_zotero::zotero_config_has_push_target;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesMutationApplyParams {
    #[serde(default)]
    pub snapshot: Value,
    #[serde(default)]
    pub global_config_dir: String,
    pub action: ReferencesMutationAction,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ReferencesMutationAction {
    Noop,
    AddReference {
        reference: Value,
        #[serde(default, alias = "markForZoteroPush")]
        mark_for_zotero_push: bool,
    },
    UpdateReference {
        #[serde(alias = "referenceId")]
        reference_id: String,
        #[serde(default)]
        updates: Value,
    },
    RemoveReference {
        #[serde(alias = "referenceId")]
        reference_id: String,
    },
    CreateCollection {
        label: String,
    },
    RenameCollection {
        #[serde(alias = "collectionKey")]
        collection_key: String,
        #[serde(alias = "nextLabel")]
        next_label: String,
    },
    RemoveCollection {
        #[serde(alias = "collectionKey")]
        collection_key: String,
    },
    ToggleReferenceCollection {
        #[serde(alias = "referenceId")]
        reference_id: String,
        #[serde(alias = "collectionKey")]
        collection_key: String,
    },
    MergeImportedReferences {
        imported: Vec<Value>,
        #[serde(default, alias = "markForZoteroPush")]
        mark_for_zotero_push: bool,
    },
    SetDocumentReferenceIds {
        #[serde(alias = "texPath")]
        tex_path: String,
        #[serde(default, alias = "referenceIds")]
        reference_ids: Vec<String>,
    },
}

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn string_payload_field(params: &Value, key: &str) -> String {
    payload_field(params, key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn snapshot_payload_field(params: &Value) -> Value {
    payload_field(params, "snapshot")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(build_default_snapshot)
}

fn mutation_action_payload_field(params: &Value) -> ReferencesMutationAction {
    payload_field(params, "action")
        .filter(|value| value.is_object())
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or(ReferencesMutationAction::Noop)
}

fn references_mutation_apply_params_from_payload(params: Value) -> ReferencesMutationApplyParams {
    ReferencesMutationApplyParams {
        snapshot: snapshot_payload_field(&params),
        global_config_dir: string_payload_field(&params, "globalConfigDir"),
        action: mutation_action_payload_field(&params),
    }
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
        let is_allowed = ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fa5}').contains(&ch);
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

fn resolve_imported_selection_reference(
    merged_references: &[Value],
    imported: &[Value],
) -> Option<Value> {
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
                find_duplicate_reference_internal(imported, reference).map(|_| reference.clone())
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
                    normalized_value != normalize_collection_membership_value(&collection_key_value)
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
                        != normalize_collection_membership_value(&trim_string(
                            collection.get("key"),
                        ))
                        && normalized_value
                            != normalize_collection_membership_value(&trim_string(
                                collection.get("label"),
                            ))
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

fn mark_references_for_zotero_push(imported: &[Value], should_mark: bool) -> Vec<Value> {
    imported
        .iter()
        .map(|reference| {
            if !should_mark {
                return reference.clone();
            }
            let mut map = reference.as_object().cloned().unwrap_or_default();
            map.insert("_appPushPending".to_string(), Value::Bool(true));
            Value::Object(map)
        })
        .collect()
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
        .position(|reference| trim_string(reference.get("id")) == reference_id)
    else {
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

fn apply_set_document_reference_ids(
    snapshot: &Value,
    tex_path: &str,
    reference_ids: &[String],
) -> Value {
    let normalized_tex_path = tex_path.trim();
    if normalized_tex_path.is_empty() {
        return json!({
            "snapshot": normalize_snapshot(snapshot),
            "result": {
                "changed": false,
            },
        });
    }

    let mut next = snapshot.as_object().cloned().unwrap_or_default();
    let mut selections = next
        .get("documentReferenceSelections")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let ids = reference_ids
        .iter()
        .map(|reference_id| reference_id.trim())
        .filter(|reference_id| !reference_id.is_empty())
        .map(|reference_id| Value::String(reference_id.to_string()))
        .collect::<Vec<_>>();

    if ids.is_empty() {
        selections.remove(normalized_tex_path);
    } else {
        selections.insert(normalized_tex_path.to_string(), Value::Array(ids));
    }
    next.insert(
        "documentReferenceSelections".to_string(),
        Value::Object(selections),
    );

    json!({
        "snapshot": normalize_snapshot(&Value::Object(next)),
        "result": {
            "changed": true,
        },
    })
}

fn resolve_global_config_dir(global_config_dir: &str) -> Result<String, String> {
    let trimmed = global_config_dir.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }

    Ok(app_dirs::data_root_dir()?.to_string_lossy().to_string())
}

fn should_mark_for_zotero_push(global_config_dir: &str, requested: bool) -> Result<bool, String> {
    if !requested {
        return Ok(false);
    }

    Ok(zotero_config_has_push_target(&resolve_global_config_dir(
        global_config_dir,
    )?)?)
}

#[tauri::command]
pub async fn references_mutation_apply(params: Value) -> Result<Value, String> {
    references_mutation_apply_typed(references_mutation_apply_params_from_payload(params)).await
}

pub(crate) async fn references_mutation_apply_typed(
    params: ReferencesMutationApplyParams,
) -> Result<Value, String> {
    let normalized_snapshot = normalize_snapshot(&params.snapshot);
    let result = match params.action {
        ReferencesMutationAction::Noop => json!({
            "snapshot": normalized_snapshot,
            "result": {
                "changed": false,
            },
        }),
        ReferencesMutationAction::AddReference {
            reference,
            mark_for_zotero_push,
        } => {
            let should_mark =
                should_mark_for_zotero_push(&params.global_config_dir, mark_for_zotero_push)?;
            apply_add_reference(
                &normalized_snapshot,
                &reference,
                should_mark
                    || reference
                        .get("_appPushPending")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
            )
        }
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
        } => {
            apply_toggle_reference_collection(&normalized_snapshot, &reference_id, &collection_key)
        }
        ReferencesMutationAction::MergeImportedReferences {
            imported,
            mark_for_zotero_push,
        } => {
            let should_mark =
                should_mark_for_zotero_push(&params.global_config_dir, mark_for_zotero_push)?;
            let imported = mark_references_for_zotero_push(&imported, should_mark);
            apply_merge_imported_references(&normalized_snapshot, &imported)
        }
        ReferencesMutationAction::SetDocumentReferenceIds {
            tex_path,
            reference_ids,
        } => apply_set_document_reference_ids(&normalized_snapshot, &tex_path, &reference_ids),
    };

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::{
        references_mutation_apply, references_mutation_apply_params_from_payload,
        references_mutation_apply_typed, ReferencesMutationAction, ReferencesMutationApplyParams,
    };
    use serde_json::json;
    use std::fs;

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

    #[test]
    fn mutation_params_accept_frontend_camel_case_fields() {
        let update_params = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "action": {
                "type": "updateReference",
                "referenceId": "ref-1",
                "updates": { "year": 2025 }
            }
        }));
        match update_params.action {
            ReferencesMutationAction::UpdateReference {
                reference_id,
                updates,
            } => {
                assert_eq!(reference_id, "ref-1");
                assert_eq!(updates["year"].as_i64(), Some(2025));
            }
            _ => panic!("expected updateReference action"),
        }

        let add_params = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "action": {
                "type": "addReference",
                "reference": { "id": "ref-2", "title": "New Reference" },
                "markForZoteroPush": true
            }
        }));
        match add_params.action {
            ReferencesMutationAction::AddReference {
                mark_for_zotero_push,
                ..
            } => {
                assert!(mark_for_zotero_push);
            }
            _ => panic!("expected addReference action"),
        }

        let rename_params = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "action": {
                "type": "renameCollection",
                "collectionKey": "reading",
                "nextLabel": "Reading Queue"
            }
        }));
        match rename_params.action {
            ReferencesMutationAction::RenameCollection {
                collection_key,
                next_label,
            } => {
                assert_eq!(collection_key, "reading");
                assert_eq!(next_label, "Reading Queue");
            }
            _ => panic!("expected renameCollection action"),
        }

        let toggle_params = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "action": {
                "type": "toggleReferenceCollection",
                "referenceId": "ref-1",
                "collectionKey": "reading"
            }
        }));
        match toggle_params.action {
            ReferencesMutationAction::ToggleReferenceCollection {
                reference_id,
                collection_key,
            } => {
                assert_eq!(reference_id, "ref-1");
                assert_eq!(collection_key, "reading");
            }
            _ => panic!("expected toggleReferenceCollection action"),
        }

        let document_reference_params = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "globalConfigDir": "/tmp/scribeflow-config",
            "action": {
                "type": "setDocumentReferenceIds",
                "texPath": "/workspace/main.tex",
                "referenceIds": ["ref-1"]
            }
        }));
        assert_eq!(
            document_reference_params.global_config_dir,
            "/tmp/scribeflow-config"
        );
        match document_reference_params.action {
            ReferencesMutationAction::SetDocumentReferenceIds {
                tex_path,
                reference_ids,
            } => {
                assert_eq!(tex_path, "/workspace/main.tex");
                assert_eq!(reference_ids, vec!["ref-1".to_string()]);
            }
            _ => panic!("expected setDocumentReferenceIds action"),
        }
    }

    #[tokio::test]
    async fn mutation_params_normalize_raw_payloads() {
        let invalid_params = references_mutation_apply_params_from_payload(json!({
            "globalConfigDir": false,
            "snapshot": "not-a-snapshot",
            "action": "not-an-action",
        }));
        assert_eq!(invalid_params.global_config_dir, "");
        assert_eq!(
            invalid_params.snapshot,
            crate::references_snapshot::build_default_snapshot()
        );
        assert!(matches!(
            invalid_params.action,
            ReferencesMutationAction::Noop
        ));

        let incomplete_action = references_mutation_apply_params_from_payload(json!({
            "snapshot": sample_snapshot(),
            "action": {
                "type": "updateReference",
                "referenceId": 42,
            },
        }));
        assert!(matches!(
            incomplete_action.action,
            ReferencesMutationAction::Noop
        ));

        let result = references_mutation_apply(json!({
            "snapshot": "not-a-snapshot",
            "action": { "type": "unknownAction" },
        }))
        .await
        .expect("apply no-op mutation");
        assert_eq!(result["result"]["changed"].as_bool(), Some(false));
        assert_eq!(
            result["snapshot"],
            crate::references_snapshot::build_default_snapshot()
        );
    }

    #[tokio::test]
    async fn create_collection_returns_existing_duplicate() {
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
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
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
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
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
            action: ReferencesMutationAction::MergeImportedReferences {
                imported: vec![json!({
                    "id": "imported-1",
                    "title": "Adaptive Control",
                    "year": 2024,
                    "citationKey": "ada2024",
                    "collections": [],
                    "tags": ["Control"]
                })],
                mark_for_zotero_push: false,
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
    async fn merge_imported_references_marks_zotero_push_pending_from_rust_config() {
        let config_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-mutation-zotero-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&config_dir).expect("create config dir");
        fs::write(
            config_dir.join("zotero.json"),
            r#"{
  "pushTarget": {
    "libraryType": "user",
    "libraryId": "16788433",
    "collectionKey": "papers"
  }
}"#,
        )
        .expect("write zotero config");

        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: config_dir.to_string_lossy().to_string(),
            action: ReferencesMutationAction::MergeImportedReferences {
                imported: vec![json!({
                    "id": "imported-2",
                    "title": "New Imported Reference",
                    "year": 2026,
                    "citationKey": "new2026",
                    "collections": [],
                    "tags": []
                })],
                mark_for_zotero_push: true,
            },
        })
        .await
        .expect("merge imported references");

        let imported = result["snapshot"]["references"]
            .as_array()
            .and_then(|references| {
                references
                    .iter()
                    .find(|reference| reference["id"].as_str() == Some("imported-2"))
            })
            .expect("imported reference");
        assert_eq!(imported["_appPushPending"].as_bool(), Some(true));

        let _ = fs::remove_dir_all(config_dir);
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
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot,
            global_config_dir: String::new(),
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
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
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
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
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
            result["snapshot"]["tags"]
                .as_array()
                .map(|items| items.len()),
            Some(2)
        );
    }

    #[tokio::test]
    async fn update_reference_preserves_content_fields() {
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
            action: ReferencesMutationAction::UpdateReference {
                reference_id: "ref-1".to_string(),
                updates: json!({
                    "abstract": "Updated abstract body",
                    "notes": ["Updated note body"]
                }),
            },
        })
        .await
        .expect("update reference content");

        let reference = &result["snapshot"]["references"][0];
        assert_eq!(
            reference["abstract"].as_str(),
            Some("Updated abstract body")
        );
        assert_eq!(reference["notes"][0].as_str(), Some("Updated note body"));
    }

    #[tokio::test]
    async fn remove_reference_drops_entry() {
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
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

    #[tokio::test]
    async fn set_document_reference_ids_prunes_invalid_and_empty_entries() {
        let result = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: sample_snapshot(),
            global_config_dir: String::new(),
            action: ReferencesMutationAction::SetDocumentReferenceIds {
                tex_path: "/workspace/main.tex".to_string(),
                reference_ids: vec![
                    "ref-1".to_string(),
                    "missing".to_string(),
                    "ref-1".to_string(),
                    "".to_string(),
                ],
            },
        })
        .await
        .expect("set document reference ids");

        assert_eq!(
            result["snapshot"]["documentReferenceSelections"]["/workspace/main.tex"],
            json!(["ref-1"])
        );

        let cleared = references_mutation_apply_typed(ReferencesMutationApplyParams {
            snapshot: result["snapshot"].clone(),
            global_config_dir: String::new(),
            action: ReferencesMutationAction::SetDocumentReferenceIds {
                tex_path: "/workspace/main.tex".to_string(),
                reference_ids: vec![],
            },
        })
        .await
        .expect("clear document reference ids");

        assert!(
            cleared["snapshot"]["documentReferenceSelections"]["/workspace/main.tex"].is_null()
        );
    }
}
