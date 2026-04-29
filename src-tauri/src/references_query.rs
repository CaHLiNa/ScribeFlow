use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

use crate::references_snapshot::{trim_string, StringExt};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesQueryResolveParams {
    #[serde(default)]
    pub library_sections: Vec<Value>,
    #[serde(default)]
    pub source_sections: Vec<Value>,
    #[serde(default)]
    pub collections: Vec<Value>,
    #[serde(default)]
    pub tags: Vec<Value>,
    #[serde(default)]
    pub references: Vec<Value>,
    #[serde(default)]
    pub selected_section_key: String,
    #[serde(default)]
    pub selected_source_key: String,
    #[serde(default)]
    pub selected_collection_key: String,
    #[serde(default)]
    pub selected_tag_key: String,
    #[serde(default)]
    pub sort_key: String,
    #[serde(default)]
    pub preferred_selected_reference_id: String,
    #[serde(default)]
    pub file_contents: Value,
}

fn normalize_collection_membership_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_tag_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn reference_has_pdf(reference: &Value) -> bool {
    !trim_string(reference.get("pdfPath")).is_empty()
        || reference
            .get("hasPdf")
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

fn filter_reference_by_section(reference: &Value, section_key: &str) -> bool {
    match section_key {
        "unfiled" => reference
            .get("collections")
            .and_then(Value::as_array)
            .map(|collections| collections.is_empty())
            .unwrap_or(true),
        "missing-identifier" => trim_string(reference.get("identifier")).is_empty(),
        "missing-pdf" => !reference_has_pdf(reference),
        _ => true,
    }
}

fn filter_reference_by_source(reference: &Value, source_key: &str) -> bool {
    let normalized_source = trim_string(reference.get("_source")).to_lowercase();
    match source_key {
        "zotero" => normalized_source == "zotero",
        "manual" => normalized_source != "zotero",
        _ => true,
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

fn filter_reference_by_collection(
    reference: &Value,
    collection_key: &str,
    collections: &[Value],
) -> bool {
    let Some(collection) = resolve_collection(collections, collection_key) else {
        return collection_key.trim().is_empty();
    };
    reference_has_collection(reference, &collection)
}

fn filter_reference_by_tag(reference: &Value, tag_key: &str) -> bool {
    let normalized_tag = normalize_tag_key(tag_key);
    if normalized_tag.is_empty() {
        return true;
    }

    reference
        .get("tags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .any(|value| {
            let candidate = if let Some(text) = value.as_str() {
                normalize_tag_key(text)
            } else {
                normalize_tag_key(
                    &trim_string(value.get("key"))
                        .if_empty_then(|| trim_string(value.get("label"))),
                )
            };
            candidate == normalized_tag
        })
}

fn normalized_author_sort_text(reference: &Value) -> String {
    let authors = reference
        .get("authors")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if !authors.is_empty() {
        return authors
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_lowercase();
    }
    trim_string(reference.get("authorLine")).to_lowercase()
}

fn compare_references(a: &Value, b: &Value, sort_key: &str) -> std::cmp::Ordering {
    let a_title = trim_string(a.get("title"));
    let b_title = trim_string(b.get("title"));
    let a_year = a.get("year").and_then(Value::as_i64).unwrap_or(0);
    let b_year = b.get("year").and_then(Value::as_i64).unwrap_or(0);
    let a_author = normalized_author_sort_text(a);
    let b_author = normalized_author_sort_text(b);

    match sort_key {
        "year-asc" => a_year.cmp(&b_year).then_with(|| a_title.cmp(&b_title)),
        "author-desc" => b_author.cmp(&a_author).then_with(|| a_title.cmp(&b_title)),
        "author-asc" => a_author.cmp(&b_author).then_with(|| a_title.cmp(&b_title)),
        "title-desc" => b_title.cmp(&a_title).then_with(|| b_year.cmp(&a_year)),
        "title-asc" => a_title.cmp(&b_title).then_with(|| b_year.cmp(&a_year)),
        _ => b_year.cmp(&a_year).then_with(|| a_title.cmp(&b_title)),
    }
}

fn build_count_map(items: Vec<(String, usize)>) -> Value {
    let mut map = Map::new();
    for (key, count) in items {
        map.insert(key, json!(count));
    }
    Value::Object(map)
}

fn record_citation_usage(usage: &mut BTreeMap<String, Vec<String>>, key: &str, path: &str) {
    let normalized_key = key.trim();
    if normalized_key.is_empty() || path.trim().is_empty() {
        return;
    }
    let entry = usage.entry(normalized_key.to_string()).or_default();
    if !entry.iter().any(|existing| existing == path) {
        entry.push(path.to_string());
    }
}

fn normalize_snippet_text(value: &str) -> String {
    value.trim().chars().take(220).collect::<String>()
}

fn citation_line_snippet(content: &str, byte_index: usize) -> (usize, String) {
    let mut safe_index = byte_index.min(content.len());
    while safe_index > 0 && !content.is_char_boundary(safe_index) {
        safe_index -= 1;
    }

    let line = content[..safe_index]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1;
    let line_start = content[..safe_index]
        .rfind('\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let line_end = content[safe_index..]
        .find('\n')
        .map(|index| safe_index + index)
        .unwrap_or(content.len());

    (line, normalize_snippet_text(&content[line_start..line_end]))
}

fn record_citation_detail(
    details: &mut BTreeMap<String, Vec<Value>>,
    key: &str,
    path: &str,
    content: &str,
    byte_index: usize,
) {
    let normalized_key = key.trim();
    if normalized_key.is_empty() || path.trim().is_empty() {
        return;
    }

    let (line, snippet) = citation_line_snippet(content, byte_index);
    let entry = details.entry(normalized_key.to_string()).or_default();
    if entry.iter().any(|existing| {
        trim_string(existing.get("path")) == path
            && existing.get("line").and_then(Value::as_u64) == Some(line as u64)
    }) {
        return;
    }

    entry.push(json!({
        "path": path,
        "line": line,
        "snippet": snippet,
    }));
}

fn build_citation_usage(file_contents: &Value) -> (Value, Value) {
    let Some(file_contents) = file_contents.as_object() else {
        return (Value::Object(Map::new()), Value::Object(Map::new()));
    };

    let markdown_citation_re =
        regex_lite::Regex::new(r"\[([^\[\]]*@[a-zA-Z][\w.-]*[^\[\]]*)\]").ok();
    let markdown_key_re = regex_lite::Regex::new(r"@([a-zA-Z][\w.-]*)").ok();
    let markdown_bare_key_re = regex_lite::Regex::new(r"(?:^|[\s(])@([a-zA-Z][\w.-]*)").ok();
    let latex_command_re = regex_lite::Regex::new(r"\\[A-Za-z]*cite[A-Za-z]*\*?").ok();
    let latex_key_re = regex_lite::Regex::new(r"([a-zA-Z][\w.-]*)").ok();

    let mut usage: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut details: BTreeMap<String, Vec<Value>> = BTreeMap::new();

    for (path, content) in file_contents {
        let Some(content) = content.as_str() else {
            continue;
        };

        if path.ends_with(".md") {
            if let (Some(citation_re), Some(key_re)) =
                (markdown_citation_re.as_ref(), markdown_key_re.as_ref())
            {
                for citation_match in citation_re.captures_iter(content) {
                    let Some(group) = citation_match.get(1) else {
                        continue;
                    };
                    for key_match in key_re.captures_iter(group.as_str()) {
                        let Some(key) = key_match.get(1) else {
                            continue;
                        };
                        record_citation_detail(
                            &mut details,
                            key.as_str(),
                            path,
                            content,
                            group.start() + key.start(),
                        );
                        record_citation_usage(&mut usage, key.as_str(), path);
                    }
                }
            }
            if let Some(key_re) = markdown_bare_key_re.as_ref() {
                for key_match in key_re.captures_iter(content) {
                    let Some(key) = key_match.get(1) else {
                        continue;
                    };
                    let normalized_key = key
                        .as_str()
                        .trim_end_matches(|ch| matches!(ch, '.' | ',' | ';' | ':' | ')'));
                    record_citation_detail(
                        &mut details,
                        normalized_key,
                        path,
                        content,
                        key.start(),
                    );
                    record_citation_usage(&mut usage, normalized_key, path);
                }
            }
            continue;
        }

        if path.ends_with(".tex") || path.ends_with(".latex") {
            if let (Some(command_re), Some(key_re)) =
                (latex_command_re.as_ref(), latex_key_re.as_ref())
            {
                for command_match in command_re.find_iter(content) {
                    let mut cursor = command_match.end();
                    let bytes = content.as_bytes();

                    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                        cursor += 1;
                    }

                    while cursor < bytes.len() && bytes[cursor] == b'[' {
                        let Some(relative_end) = content[cursor + 1..].find(']') else {
                            break;
                        };
                        cursor += relative_end + 2;
                        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                            cursor += 1;
                        }
                    }

                    if cursor >= bytes.len() || bytes[cursor] != b'{' {
                        continue;
                    };
                    let Some(relative_end) = content[cursor + 1..].find('}') else {
                        continue;
                    };
                    let group = &content[cursor + 1..cursor + 1 + relative_end];
                    for key_match in key_re.captures_iter(group) {
                        let Some(key) = key_match.get(1) else {
                            continue;
                        };
                        record_citation_detail(
                            &mut details,
                            key.as_str(),
                            path,
                            content,
                            cursor + 1 + key.start(),
                        );
                        record_citation_usage(&mut usage, key.as_str(), path);
                    }
                }
            }
        }
    }

    let mut result = Map::new();
    for (key, paths) in usage {
        result.insert(
            key,
            Value::Array(paths.into_iter().map(Value::String).collect()),
        );
    }
    let mut detail_result = Map::new();
    for (key, entries) in details {
        detail_result.insert(key, Value::Array(entries));
    }
    (Value::Object(result), Value::Object(detail_result))
}

fn normalize_sort_key(sort_key: &str) -> String {
    match sort_key.trim() {
        "year-desc" | "year-asc" | "title-asc" | "title-desc" | "author-asc" | "author-desc" => {
            sort_key.trim().to_string()
        }
        _ => "year-desc".to_string(),
    }
}

#[tauri::command]
pub async fn references_query_resolve(
    params: ReferencesQueryResolveParams,
) -> Result<Value, String> {
    let selected_section_key = params
        .library_sections
        .iter()
        .find(|section| trim_string(section.get("key")) == params.selected_section_key.trim())
        .map(|section| trim_string(section.get("key")))
        .unwrap_or_else(|| "all".to_string());

    let selected_source_key = params
        .source_sections
        .iter()
        .find(|section| trim_string(section.get("key")) == params.selected_source_key.trim())
        .map(|section| trim_string(section.get("key")))
        .unwrap_or_default();

    let selected_collection_key =
        resolve_collection(&params.collections, &params.selected_collection_key)
            .and_then(|collection| Some(trim_string(collection.get("key"))))
            .unwrap_or_default();

    let selected_tag_key = {
        let normalized = normalize_tag_key(&params.selected_tag_key);
        if params
            .tags
            .iter()
            .any(|tag| normalize_tag_key(&trim_string(tag.get("key"))) == normalized)
        {
            normalized
        } else {
            String::new()
        }
    };

    let sort_key = normalize_sort_key(&params.sort_key);

    let section_counts = build_count_map(
        params
            .library_sections
            .iter()
            .map(|section| {
                let key = trim_string(section.get("key"));
                let count = params
                    .references
                    .iter()
                    .filter(|reference| filter_reference_by_section(reference, &key))
                    .count();
                (key, count)
            })
            .collect(),
    );

    let source_counts = build_count_map(
        params
            .source_sections
            .iter()
            .map(|section| {
                let key = trim_string(section.get("key"));
                let count = params
                    .references
                    .iter()
                    .filter(|reference| filter_reference_by_source(reference, &key))
                    .count();
                (key, count)
            })
            .collect(),
    );

    let collection_counts = build_count_map(
        params
            .collections
            .iter()
            .map(|collection| {
                let key = trim_string(collection.get("key"));
                let count = params
                    .references
                    .iter()
                    .filter(|reference| {
                        filter_reference_by_collection(reference, &key, &params.collections)
                    })
                    .count();
                (key, count)
            })
            .collect(),
    );

    let tag_counts = build_count_map(
        params
            .tags
            .iter()
            .map(|tag| {
                let key = trim_string(tag.get("key"));
                let count = params
                    .references
                    .iter()
                    .filter(|reference| filter_reference_by_tag(reference, &key))
                    .count();
                (key, count)
            })
            .collect(),
    );

    let mut sorted_references = params.references.clone();
    sorted_references.sort_by(|a, b| compare_references(a, b, &sort_key));

    let filtered_references = sorted_references
        .iter()
        .filter(|reference| filter_reference_by_section(reference, &selected_section_key))
        .filter(|reference| filter_reference_by_source(reference, &selected_source_key))
        .filter(|reference| {
            filter_reference_by_collection(reference, &selected_collection_key, &params.collections)
        })
        .filter(|reference| filter_reference_by_tag(reference, &selected_tag_key))
        .cloned()
        .collect::<Vec<_>>();

    let preferred_selected_reference_id = params.preferred_selected_reference_id.trim();
    let selected_reference_id = if !preferred_selected_reference_id.is_empty()
        && filtered_references
            .iter()
            .any(|reference| trim_string(reference.get("id")) == preferred_selected_reference_id)
    {
        preferred_selected_reference_id.to_string()
    } else {
        filtered_references
            .first()
            .map(|reference| trim_string(reference.get("id")))
            .unwrap_or_default()
    };

    let (citation_usage_index, citation_usage_details) =
        build_citation_usage(&params.file_contents);

    Ok(json!({
        "query": {
            "selectedSectionKey": selected_section_key,
            "selectedSourceKey": selected_source_key,
            "selectedCollectionKey": selected_collection_key,
            "selectedTagKey": selected_tag_key,
            "sortKey": sort_key,
            "selectedReferenceId": selected_reference_id,
        },
        "sectionCounts": section_counts,
        "sourceCounts": source_counts,
        "collectionCounts": collection_counts,
        "tagCounts": tag_counts,
        "sortedReferences": sorted_references,
        "filteredReferences": filtered_references,
        "selectedReferenceId": selected_reference_id,
        "citationUsageIndex": citation_usage_index,
        "citationUsageDetails": citation_usage_details,
    }))
}

#[cfg(test)]
mod tests {
    use super::{references_query_resolve, ReferencesQueryResolveParams};
    use serde_json::{json, Value};

    #[tokio::test]
    async fn resolves_filtered_references_and_counts() {
        let result = references_query_resolve(ReferencesQueryResolveParams {
            library_sections: vec![json!({"key":"all"}), json!({"key":"missing-pdf"})],
            source_sections: vec![json!({"key":"zotero"}), json!({"key":"manual"})],
            collections: vec![json!({"key":"reading","label":"Reading"})],
            tags: vec![json!({"key":"ai","label":"AI"})],
            references: vec![
                json!({
                    "id":"a",
                    "title":"Alpha",
                    "authors":["Ada Lovelace"],
                    "collections":["reading"],
                    "tags":["AI"],
                    "year":2024,
                    "_source":"zotero",
                    "citationKey":"alpha2024",
                    "pdfPath":"/tmp/a.pdf"
                }),
                json!({
                    "id":"b",
                    "title":"Beta",
                    "authors":["Grace Hopper"],
                    "collections":[],
                    "tags":[],
                    "year":2022,
                    "_source":"manual",
                    "citationKey":"beta2022"
                }),
            ],
            selected_section_key: "all".to_string(),
            selected_source_key: "zotero".to_string(),
            selected_collection_key: "reading".to_string(),
            selected_tag_key: "ai".to_string(),
            sort_key: "year-desc".to_string(),
            preferred_selected_reference_id: "a".to_string(),
            file_contents: Value::Null,
        })
        .await
        .expect("resolve query");

        assert_eq!(
            result["filteredReferences"].as_array().map(|v| v.len()),
            Some(1)
        );
        assert_eq!(result["filteredReferences"][0]["id"].as_str(), Some("a"));
        assert_eq!(result["sectionCounts"]["missing-pdf"].as_u64(), Some(1));
        assert_eq!(result["sourceCounts"]["zotero"].as_u64(), Some(1));
        assert_eq!(result["collectionCounts"]["reading"].as_u64(), Some(1));
        assert_eq!(result["tagCounts"]["ai"].as_u64(), Some(1));
        assert_eq!(result["selectedReferenceId"].as_str(), Some("a"));
    }

    #[tokio::test]
    async fn builds_citation_usage_index_from_workspace_files() {
        let result = references_query_resolve(ReferencesQueryResolveParams {
            references: vec![],
            file_contents: json!({
                "/tmp/a.md":"See [@alpha2024; @beta2022]. Bare mention @gamma2025.",
                "/tmp/b.tex":"\\\\cite{alpha2024}\n\\\\cite[see][p. 2]{gamma2025}\n\\\\textcite*{delta2026}"
            }),
            ..ReferencesQueryResolveParams::default()
        })
        .await
        .expect("resolve usage");

        assert_eq!(
            result["citationUsageIndex"]["alpha2024"]
                .as_array()
                .map(|v| v.len()),
            Some(2)
        );
        assert_eq!(
            result["citationUsageIndex"]["beta2022"]
                .as_array()
                .map(|v| v.len()),
            Some(1)
        );
        assert_eq!(
            result["citationUsageIndex"]["gamma2025"]
                .as_array()
                .map(|v| v.len()),
            Some(2)
        );
        assert_eq!(
            result["citationUsageIndex"]["delta2026"]
                .as_array()
                .map(|v| v.len()),
            Some(1)
        );
        assert_eq!(
            result["citationUsageDetails"]["gamma2025"][0]["line"].as_u64(),
            Some(1)
        );
        assert_eq!(
            result["citationUsageDetails"]["gamma2025"][1]["line"].as_u64(),
            Some(2)
        );
        assert!(result["citationUsageDetails"]["delta2026"][0]["snippet"]
            .as_str()
            .unwrap_or_default()
            .contains("\\\\textcite*{delta2026}"));
    }

    #[tokio::test]
    async fn falls_back_to_first_filtered_reference_when_selected_is_hidden() {
        let result = references_query_resolve(ReferencesQueryResolveParams {
            library_sections: vec![json!({"key":"all"})],
            source_sections: vec![json!({"key":"zotero"}), json!({"key":"manual"})],
            references: vec![
                json!({
                    "id":"a",
                    "title":"Alpha",
                    "year":2024,
                    "_source":"zotero"
                }),
                json!({
                    "id":"b",
                    "title":"Beta",
                    "year":2022,
                    "_source":"manual"
                }),
            ],
            selected_source_key: "manual".to_string(),
            preferred_selected_reference_id: "a".to_string(),
            ..ReferencesQueryResolveParams::default()
        })
        .await
        .expect("resolve query with fallback selection");

        assert_eq!(result["selectedReferenceId"].as_str(), Some("b"));
    }
}
