use serde_json::{json, Value};
use std::collections::HashSet;

use crate::references_snapshot::{
    clone_array, is_effectively_empty_snapshot, normalize_snapshot, trim_string, StringExt,
};

fn normalized(value: Option<&Value>) -> String {
    trim_string(value).to_lowercase()
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

pub(crate) fn title_similarity(left: &str, right: &str) -> f64 {
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

pub(crate) fn merge_library_entries(primary: &[Value], secondary: &[Value], field: &str) -> Vec<Value> {
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

pub(crate) fn same_reference_identity(current: &Value, candidate: &Value) -> bool {
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

pub(crate) fn merge_reference_entries(primary: &[Value], secondary: &[Value]) -> Vec<Value> {
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

pub(crate) fn merge_library_snapshots(current: &Value, legacy: &Value) -> Value {
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

pub(crate) fn find_duplicate_reference_internal(existing: &[Value], candidate: &Value) -> Option<Value> {
    let candidate_citation_key = normalized(candidate.get("citationKey"));
    let candidate_identifier = normalized(candidate.get("identifier"));
    let candidate_title = normalized(candidate.get("title"));
    let candidate_year = candidate.get("year").and_then(Value::as_i64).unwrap_or(0);

    existing.iter().find_map(|current| {
        let current_citation_key = normalized(current.get("citationKey"));
        if !candidate_citation_key.is_empty()
            && !current_citation_key.is_empty()
            && candidate_citation_key == current_citation_key
        {
            return Some(current.clone());
        }

        let current_identifier = normalized(current.get("identifier"));
        if !candidate_identifier.is_empty()
            && !current_identifier.is_empty()
            && candidate_identifier == current_identifier
        {
            return Some(current.clone());
        }

        let current_title = normalized(current.get("title"));
        let current_year = current.get("year").and_then(Value::as_i64).unwrap_or(0);
        if !candidate_title.is_empty()
            && !current_title.is_empty()
            && candidate_year != 0
            && current_year != 0
            && candidate_year == current_year
            && (candidate_title == current_title
                || title_similarity(&candidate_title, &current_title) >= 0.85)
        {
            return Some(current.clone());
        }

        None
    })
}

pub(crate) fn merge_imported_references_internal(existing: &[Value], imported: &[Value]) -> Vec<Value> {
    let mut merged = existing.to_vec();
    for candidate in imported {
        if find_duplicate_reference_internal(&merged, candidate).is_none() {
            merged.push(candidate.clone());
        }
    }
    merged
}
