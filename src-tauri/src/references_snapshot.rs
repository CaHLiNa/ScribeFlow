use serde_json::{json, Value};
use std::collections::HashSet;

const LEGACY_REFERENCE_FIXTURE_IDS: &[&str] = &["ref-1", "ref-2", "ref-3"];
const LEGACY_REFERENCE_FIXTURE_TITLES: &[&str] = &[
    "CBF-based safety design for adaptive control of uncertain nonlinear strict-feedback systems",
    "Constraint-aware planning for long-horizon safe robot adaptation",
    "Verification-friendly policy updates under barrier-certified constraints",
];

pub(crate) trait StringExt {
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

pub(crate) fn normalize_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

pub(crate) fn trim_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(normalize_whitespace)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

pub(crate) fn bool_value(value: Option<&Value>) -> bool {
    value.and_then(Value::as_bool).unwrap_or(false)
}

pub(crate) fn string_array(value: Option<&Value>) -> Vec<Value> {
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

pub(crate) fn clone_array(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

pub(crate) fn normalize_reference_type_key(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "article" | "article-journal" | "journal-article" | "journal article" | "期刊论文" => {
            "journal-article".to_string()
        }
        "inproceedings" | "conference" | "paper-conference" | "conference-paper"
        | "conference paper" | "会议论文" => "conference-paper".to_string(),
        "book" | "chapter" | "图书" => "book".to_string(),
        "thesis" | "phdthesis" | "mastersthesis" | "学位论文" => "thesis".to_string(),
        "report" | "other" | "other reference" | "其他文献" => "other".to_string(),
        _ => "other".to_string(),
    }
}

fn normalize_tag_label(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_tag_key(value: &str) -> String {
    normalize_tag_label(value).to_lowercase()
}

fn normalize_reference_collection_values(value: Option<&Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    value
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .filter(|entry| seen.insert(entry.to_lowercase()))
                .map(|entry| Value::String(entry.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn normalize_reference_tag_values(value: Option<&Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    value
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    if let Some(text) = entry.as_str() {
                        let label = normalize_tag_label(text);
                        if label.is_empty() {
                            None
                        } else {
                            Some(label)
                        }
                    } else if entry.is_object() {
                        let label = normalize_tag_label(
                            &trim_string(entry.get("label"))
                                .if_empty_then(|| trim_string(entry.get("name")))
                                .if_empty_then(|| trim_string(entry.get("key"))),
                        );
                        if label.is_empty() {
                            None
                        } else {
                            Some(label)
                        }
                    } else {
                        None
                    }
                })
                .filter(|label| seen.insert(label.to_lowercase()))
                .map(Value::String)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn normalize_collection_entries(value: Option<&Value>) -> Vec<Value> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for entry in value.and_then(Value::as_array).cloned().unwrap_or_default() {
        let key = trim_string(entry.get("key"))
            .if_empty_then(|| trim_string(entry.get("label")).to_lowercase());
        let label = trim_string(entry.get("label")).if_empty_then(|| trim_string(entry.get("key")));
        let normalized_key = key.trim().to_lowercase();
        if normalized_key.is_empty() || label.is_empty() || seen.contains(&normalized_key) {
            continue;
        }
        seen.insert(normalized_key.clone());
        normalized.push(json!({
            "key": normalized_key,
            "label": label,
        }));
    }

    normalized
}

fn build_tag_registry(existing_tags: &[Value], references: &[Value]) -> Vec<Value> {
    let mut tags = Vec::new();
    let mut seen = HashSet::new();

    for entry in existing_tags {
        let label = trim_string(entry.get("label"))
            .if_empty_then(|| trim_string(entry.get("name")))
            .if_empty_then(|| trim_string(entry.get("key")));
        let key = normalize_tag_key(&trim_string(entry.get("key")).if_empty_then(|| label.clone()));
        if key.is_empty() || label.is_empty() || seen.contains(&key) {
            continue;
        }
        seen.insert(key.clone());
        tags.push(json!({ "key": key, "label": label }));
    }

    for reference in references {
        for tag in normalize_reference_tag_values(reference.get("tags")) {
            let label = tag.as_str().unwrap_or_default().to_string();
            let key = normalize_tag_key(&label);
            if key.is_empty() || seen.contains(&key) {
                continue;
            }
            seen.insert(key.clone());
            tags.push(json!({ "key": key, "label": label }));
        }
    }

    tags.sort_by(|left, right| {
        trim_string(left.get("label")).cmp(&trim_string(right.get("label")))
    });
    tags
}

pub(crate) fn normalize_reference_record(reference: &Value) -> Value {
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
        Value::Array(normalize_reference_collection_values(
            map.get("collections"),
        )),
    );
    map.insert(
        "tags".to_string(),
        Value::Array(normalize_reference_tag_values(map.get("tags"))),
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

pub(crate) fn normalize_snapshot(raw: &Value) -> Value {
    let collections = normalize_collection_entries(raw.get("collections"));
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
    let tags = build_tag_registry(&clone_array(raw.get("tags")), &references);

    json!({
        "version": raw.get("version").and_then(Value::as_u64).unwrap_or(2),
        "legacyMigrationComplete": bool_value(raw.get("legacyMigrationComplete")),
        "citationStyle": trim_string(raw.get("citationStyle")).if_empty_then(|| "apa".to_string()),
        "collections": collections,
        "tags": tags,
        "references": references,
    })
}

pub(crate) fn build_default_snapshot() -> Value {
    json!({
        "version": 2,
        "legacyMigrationComplete": false,
        "citationStyle": "apa",
        "collections": [],
        "tags": [],
        "references": [],
    })
}

pub(crate) fn is_effectively_empty_snapshot(snapshot: &Value) -> bool {
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

fn extract_year_from_date_parts(value: Option<&Value>) -> Option<i64> {
    value
        .and_then(|entry| entry.get("date-parts"))
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_i64)
}

fn extract_year_from_text(value: &str) -> Option<i64> {
    value
        .split(|ch: char| !ch.is_ascii_digit())
        .find_map(|part| match part.len() {
            4 => part.parse::<i64>().ok().filter(|year| (1000..=2999).contains(year)),
            _ => None,
        })
}

pub(crate) fn extract_csl_year(csl: &Value) -> Option<i64> {
    for field in [
        "issued",
        "published-print",
        "published-online",
        "original-date",
        "submitted",
        "created",
    ] {
        if let Some(year) = extract_year_from_date_parts(csl.get(field)) {
            return Some(year);
        }
    }

    for field in ["date", "raw-date", "literal"] {
        if let Some(year) = csl
            .get(field)
            .and_then(Value::as_str)
            .and_then(extract_year_from_text)
        {
            return Some(year);
        }
    }

    None
}

fn build_author_names_from_csl(csl: &Value) -> Vec<String> {
    csl.get("author")
        .and_then(Value::as_array)
        .map(|authors| {
            authors
                .iter()
                .map(|author| {
                    let given = trim_string(author.get("given"));
                    let family = trim_string(author.get("family"));
                    [given, family]
                        .into_iter()
                        .filter(|part| !part.is_empty())
                        .collect::<Vec<_>>()
                        .join(" ")
                        .trim()
                        .to_string()
                })
                .filter(|author| !author.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn sanitize_citation_key_component(value: &str) -> String {
    value.chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn first_author_family_key_component(csl: &Value) -> String {
    let first_author = csl
        .get("author")
        .and_then(Value::as_array)
        .and_then(|authors| authors.first());
    let family = first_author
        .and_then(|author| author.get("family"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !family.trim().is_empty() {
        return sanitize_citation_key_component(family);
    }

    let literal = first_author
        .and_then(|author| author.get("literal"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    sanitize_citation_key_component(literal)
}

fn looks_like_generated_citation_key(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return true;
    }

    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || trimmed.contains('/')
        || trimmed.contains(':')
    {
        return true;
    }

    trimmed.len() == 8
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit())
}

fn build_citation_key(csl: &Value) -> String {
    let explicit = trim_string(csl.get("_key"));
    if !looks_like_generated_citation_key(&explicit) {
        return explicit;
    }

    let family = first_author_family_key_component(csl);
    let year = extract_csl_year(csl)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let candidate = format!(
        "{}{}",
        if family.is_empty() { "ref" } else { &family },
        year
    );
    if !candidate.is_empty() {
        candidate
    } else if !explicit.is_empty() {
        sanitize_citation_key_component(&explicit)
    } else {
        "ref".to_string()
    }
}

pub(crate) fn csl_to_reference_record(csl: &Value) -> Value {
    let authors = build_author_names_from_csl(csl);
    let citation_key = build_citation_key(csl);
    let identifier = trim_string(csl.get("DOI")).if_empty_then(|| trim_string(csl.get("URL")));

    json!({
        "id": trim_string(csl.get("id")).if_empty_then(|| citation_key.clone()),
        "typeKey": normalize_reference_type_key(&trim_string(csl.get("type"))),
        "title": trim_string(csl.get("title")).if_empty_then(|| "Untitled".to_string()),
        "authors": authors,
        "authorLine": build_author_names_from_csl(csl).join("; "),
        "year": extract_csl_year(csl),
        "source": trim_string(csl.get("container-title")).if_empty_then(|| trim_string(csl.get("publisher"))),
        "identifier": identifier,
        "volume": trim_string(csl.get("volume")),
        "issue": trim_string(csl.get("issue")),
        "pages": trim_string(csl.get("page")),
        "citationKey": citation_key,
        "hasPdf": !trim_string(csl.get("_pdfPath")).is_empty(),
        "pdfPath": trim_string(csl.get("_pdfPath")).if_empty_then(|| trim_string(csl.get("pdfPath"))),
        "hasFullText": !trim_string(csl.get("_textPath")).is_empty(),
        "fulltextPath": trim_string(csl.get("_textPath")).if_empty_then(|| trim_string(csl.get("fulltextPath"))),
        "collections": csl.get("_collections").cloned().unwrap_or(Value::Array(Vec::new())),
        "tags": csl.get("_tags").cloned().unwrap_or(Value::Array(Vec::new())),
        "rating": 0,
        "abstract": trim_string(csl.get("abstract")),
        "notes": [],
        "annotations": [],
    })
}

pub(crate) fn reference_record_to_csl(reference: &Value) -> Value {
    let authors = reference
        .get("authors")
        .and_then(Value::as_array)
        .map(|authors| {
            authors
                .iter()
                .filter_map(Value::as_str)
                .map(|author| {
                    let parts = author.split_whitespace().collect::<Vec<_>>();
                    let family = parts.last().copied().unwrap_or(author).to_string();
                    let given = if parts.len() > 1 {
                        parts[..parts.len() - 1].join(" ")
                    } else {
                        String::new()
                    };
                    json!({ "family": family, "given": given })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let identifier = trim_string(reference.get("identifier"));

    let mut csl = json!({
        "_key": trim_string(reference.get("citationKey")).if_empty_then(|| trim_string(reference.get("id"))),
        "type": match normalize_reference_type_key(&trim_string(reference.get("typeKey"))).as_str() {
            "journal-article" => "article-journal",
            "conference-paper" => "paper-conference",
            "book" => "book",
            "chapter" => "chapter",
            "thesis" => "thesis",
            _ => "article",
        },
        "title": trim_string(reference.get("title")),
        "author": authors,
        "container-title": trim_string(reference.get("source")),
        "volume": trim_string(reference.get("volume")),
        "issue": trim_string(reference.get("issue")),
        "page": trim_string(reference.get("pages")),
        "abstract": trim_string(reference.get("abstract")),
        "publisher": trim_string(reference.get("source")),
    });
    if let Some(year) = reference.get("year").and_then(Value::as_i64) {
        csl["issued"] = json!({ "date-parts": [[year]] });
    }
    if identifier.starts_with("10.") {
        csl["DOI"] = Value::String(identifier);
    } else if !identifier.is_empty() {
        csl["URL"] = Value::String(identifier);
    }
    csl
}
