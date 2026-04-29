use serde_json::Value;
use std::collections::HashSet;

use crate::references_snapshot::trim_string;

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

pub(crate) fn find_duplicate_reference_internal(
    existing: &[Value],
    candidate: &Value,
) -> Option<Value> {
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

pub(crate) fn merge_imported_references_internal(
    existing: &[Value],
    imported: &[Value],
) -> Vec<Value> {
    let mut merged = existing.to_vec();
    for candidate in imported {
        if find_duplicate_reference_internal(&merged, candidate).is_none() {
            merged.push(candidate.clone());
        }
    }
    merged
}
