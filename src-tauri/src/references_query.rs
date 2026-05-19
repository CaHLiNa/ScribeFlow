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
    pub document_reference_selections: Value,
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

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReferencesQuerySearchParams {
    #[serde(default)]
    pub references: Vec<Value>,
    #[serde(default)]
    pub document_reference_selections: Value,
    #[serde(default)]
    pub tex_path: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub sort_key: String,
}

fn string_payload_field(params: &Value, key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn array_payload_field(params: &Value, key: &str) -> Vec<Value> {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn object_payload_field(params: &Value, key: &str) -> Value {
    params
        .as_object()
        .and_then(|object| object.get(key))
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}))
}

fn references_query_params_from_payload(params: Value) -> ReferencesQueryResolveParams {
    ReferencesQueryResolveParams {
        library_sections: array_payload_field(&params, "librarySections"),
        source_sections: array_payload_field(&params, "sourceSections"),
        collections: array_payload_field(&params, "collections"),
        tags: array_payload_field(&params, "tags"),
        references: array_payload_field(&params, "references"),
        document_reference_selections: object_payload_field(&params, "documentReferenceSelections"),
        selected_section_key: string_payload_field(&params, "selectedSectionKey"),
        selected_source_key: string_payload_field(&params, "selectedSourceKey"),
        selected_collection_key: string_payload_field(&params, "selectedCollectionKey"),
        selected_tag_key: string_payload_field(&params, "selectedTagKey"),
        sort_key: string_payload_field(&params, "sortKey"),
        preferred_selected_reference_id: string_payload_field(
            &params,
            "preferredSelectedReferenceId",
        ),
        file_contents: object_payload_field(&params, "fileContents"),
    }
}

fn references_query_search_params_from_payload(params: Value) -> ReferencesQuerySearchParams {
    ReferencesQuerySearchParams {
        references: array_payload_field(&params, "references"),
        document_reference_selections: object_payload_field(&params, "documentReferenceSelections"),
        tex_path: string_payload_field(&params, "texPath"),
        query: string_payload_field(&params, "query"),
        sort_key: string_payload_field(&params, "sortKey"),
    }
}

fn normalize_collection_membership_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_tag_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_reference_key(value: &str) -> String {
    value.trim().to_string()
}

fn insert_reference_lookup_entry(map: &mut Map<String, Value>, key: &str, reference: &Value) {
    let key = normalize_reference_key(key);
    if key.is_empty() || map.contains_key(&key) {
        return;
    }

    map.insert(key, reference.clone());
}

fn build_reference_lookup(references: &[Value]) -> Value {
    let mut by_id = Map::new();
    let mut by_key = Map::new();

    for reference in references {
        let id = trim_string(reference.get("id"));
        let citation_key = trim_string(reference.get("citationKey"));
        insert_reference_lookup_entry(&mut by_id, &id, reference);
        insert_reference_lookup_entry(&mut by_key, &id, reference);
        insert_reference_lookup_entry(&mut by_key, &citation_key, reference);
    }

    json!({
        "byId": by_id,
        "byKey": by_key,
    })
}

fn reference_by_id(references: &[Value], reference_id: &str) -> Option<Value> {
    let normalized_reference_id = normalize_reference_key(reference_id);
    if normalized_reference_id.is_empty() {
        return None;
    }

    references
        .iter()
        .find(|reference| trim_string(reference.get("id")) == normalized_reference_id)
        .cloned()
}

fn string_array_values(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn reference_search_text(reference: &Value) -> String {
    let mut parts = vec![
        trim_string(reference.get("title")),
        trim_string(reference.get("authorLine")),
        trim_string(reference.get("source")),
        trim_string(reference.get("citationKey")),
        trim_string(reference.get("identifier")),
        trim_string(reference.get("pages")),
    ];
    parts.extend(string_array_values(reference.get("authors")));
    parts.extend(string_array_values(reference.get("tags")));
    parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn build_reference_search_index(references: &[Value]) -> Value {
    let mut by_id = Map::new();
    for reference in references {
        let id = trim_string(reference.get("id"));
        if id.is_empty() {
            continue;
        }
        by_id.insert(id, Value::String(reference_search_text(reference)));
    }
    Value::Object(by_id)
}

fn normalize_reference_search_query(query: &str) -> String {
    query.trim().to_lowercase()
}

fn reference_matches_search(reference: &Value, normalized_query: &str) -> bool {
    normalized_query.is_empty() || reference_search_text(reference).contains(normalized_query)
}

fn search_reference_values(references: &[Value], normalized_query: &str) -> Vec<Value> {
    references
        .iter()
        .filter(|reference| reference_matches_search(reference, normalized_query))
        .cloned()
        .collect()
}

fn valid_reference_ids(references: &[Value]) -> Vec<String> {
    references
        .iter()
        .map(|reference| trim_string(reference.get("id")))
        .filter(|id| !id.is_empty())
        .collect()
}

fn normalize_document_reference_ids(ids: Option<&Value>, valid_ids: &[String]) -> Vec<String> {
    ids.and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .filter(|id| valid_ids.iter().any(|valid_id| valid_id == id))
        .fold(Vec::<String>::new(), |mut acc, id| {
            if !acc.iter().any(|existing| existing == id) {
                acc.push(id.to_string());
            }
            acc
        })
}

fn selected_document_reference_ids(
    document_reference_selections: &Value,
    tex_path: &str,
    references: &[Value],
) -> Vec<String> {
    let normalized_path = tex_path.trim();
    if normalized_path.is_empty() {
        return Vec::new();
    }

    let Some(selections) = document_reference_selections.as_object() else {
        return Vec::new();
    };

    let selected_ids = selections.get(normalized_path).or_else(|| {
        selections
            .iter()
            .find(|(path, _)| path.trim() == normalized_path)
            .map(|(_, ids)| ids)
    });

    normalize_document_reference_ids(selected_ids, &valid_reference_ids(references))
}

fn build_document_reference_entry(
    reference_ids: Vec<String>,
    references: &[Value],
    sorted_references: &[Value],
) -> Value {
    let selected_references = references
        .iter()
        .filter(|reference| {
            reference_ids
                .iter()
                .any(|id| id == &trim_string(reference.get("id")))
        })
        .cloned()
        .collect::<Vec<_>>();
    let available_references = sorted_references
        .iter()
        .filter(|reference| {
            !reference_ids
                .iter()
                .any(|id| id == &trim_string(reference.get("id")))
        })
        .cloned()
        .collect::<Vec<_>>();

    json!({
        "referenceIds": reference_ids,
        "references": selected_references,
        "referenceLookup": build_reference_lookup(&selected_references),
        "referenceSearchIndex": build_reference_search_index(&available_references),
        "availableReferences": available_references,
    })
}

fn build_document_reference_state(
    document_reference_selections: &Value,
    references: &[Value],
    sorted_references: &[Value],
) -> Value {
    let valid_ids = valid_reference_ids(references);
    let mut by_path = Map::new();

    if let Some(selections) = document_reference_selections.as_object() {
        for (path, ids) in selections {
            let normalized_path = path.trim();
            if normalized_path.is_empty() {
                continue;
            }

            let reference_ids = normalize_document_reference_ids(Some(ids), &valid_ids);

            if reference_ids.is_empty() {
                continue;
            }

            by_path.insert(
                normalized_path.to_string(),
                build_document_reference_entry(reference_ids, references, sorted_references),
            );
        }
    }

    json!({
        "byPath": by_path,
        "default": build_document_reference_entry(Vec::new(), references, sorted_references),
    })
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

pub async fn references_query_resolve_resolved(
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
    let selected_collection =
        resolve_collection(&params.collections, &selected_collection_key).unwrap_or(Value::Null);

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
    let selected_tag = params
        .tags
        .iter()
        .find(|tag| normalize_tag_key(&trim_string(tag.get("key"))) == selected_tag_key)
        .cloned()
        .unwrap_or(Value::Null);

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
    let selected_reference =
        reference_by_id(&params.references, &selected_reference_id).unwrap_or(Value::Null);

    let (citation_usage_index, citation_usage_details) =
        build_citation_usage(&params.file_contents);
    let document_reference_state = build_document_reference_state(
        &params.document_reference_selections,
        &params.references,
        &sorted_references,
    );

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
        "selectedReference": selected_reference,
        "selectedCollection": selected_collection,
        "selectedTag": selected_tag,
        "referenceLookup": build_reference_lookup(&params.references),
        "referenceSearchIndex": build_reference_search_index(&sorted_references),
        "documentReferenceState": document_reference_state,
        "citationUsageIndex": citation_usage_index,
        "citationUsageDetails": citation_usage_details,
    }))
}

#[tauri::command]
pub async fn references_query_resolve(params: Value) -> Result<Value, String> {
    references_query_resolve_resolved(references_query_params_from_payload(params)).await
}

pub async fn references_query_search_resolved(
    params: ReferencesQuerySearchParams,
) -> Result<Value, String> {
    let sort_key = normalize_sort_key(&params.sort_key);
    let normalized_query = normalize_reference_search_query(&params.query);
    let selected_ids = selected_document_reference_ids(
        &params.document_reference_selections,
        &params.tex_path,
        &params.references,
    );
    let mut sorted_references = params.references.clone();
    sorted_references.sort_by(|a, b| compare_references(a, b, &sort_key));

    let document_references = params
        .references
        .iter()
        .filter(|reference| {
            selected_ids
                .iter()
                .any(|id| id == &trim_string(reference.get("id")))
        })
        .cloned()
        .collect::<Vec<_>>();
    let available_references = sorted_references
        .iter()
        .filter(|reference| {
            !selected_ids
                .iter()
                .any(|id| id == &trim_string(reference.get("id")))
        })
        .cloned()
        .collect::<Vec<_>>();

    Ok(json!({
        "query": params.query.trim(),
        "normalizedQuery": normalized_query,
        "sortKey": sort_key,
        "texPath": params.tex_path.trim(),
        "documentReferenceIds": selected_ids,
        "references": search_reference_values(&sorted_references, &normalized_query),
        "documentReferences": search_reference_values(&document_references, &normalized_query),
        "availableReferences": search_reference_values(&available_references, &normalized_query),
    }))
}

#[tauri::command]
pub async fn references_query_search(params: Value) -> Result<Value, String> {
    references_query_search_resolved(references_query_search_params_from_payload(params)).await
}

#[cfg(test)]
mod tests {
    use super::{
        references_query_params_from_payload, references_query_resolve_resolved,
        references_query_search_params_from_payload, references_query_search_resolved,
        ReferencesQueryResolveParams, ReferencesQuerySearchParams,
    };
    use serde_json::{json, Value};

    #[tokio::test]
    async fn resolves_filtered_references_and_counts() {
        let result = references_query_resolve_resolved(ReferencesQueryResolveParams {
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
            document_reference_selections: json!({}),
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
        assert_eq!(result["selectedReference"]["id"].as_str(), Some("a"));
        assert_eq!(
            result["selectedCollection"]["key"].as_str(),
            Some("reading")
        );
        assert_eq!(result["selectedTag"]["key"].as_str(), Some("ai"));
        assert_eq!(
            result["referenceLookup"]["byId"]["a"]["id"].as_str(),
            Some("a")
        );
        assert_eq!(
            result["referenceLookup"]["byKey"]["alpha2024"]["id"].as_str(),
            Some("a")
        );
        assert!(result["referenceSearchIndex"]["a"]
            .as_str()
            .unwrap_or_default()
            .contains("ada lovelace"));
    }

    #[tokio::test]
    async fn resolves_document_reference_lookup_state_in_rust() {
        let result = references_query_resolve_resolved(ReferencesQueryResolveParams {
            references: vec![
                json!({
                    "id":"ref-1",
                    "title":"Graph Neural Networks",
                    "authors":["Ada Lovelace"],
                    "citationKey":"lovelace2024",
                    "tags":["graph"],
                    "year":2024,
                }),
                json!({
                    "id":"ref-2",
                    "title":"Bayesian Methods",
                    "authorLine":"Grace Hopper",
                    "citationKey":"hopper2025",
                    "source":"Journal of Tests",
                    "year":2025,
                }),
                json!({
                    "id":"ref-3",
                    "title":"Unused Reference",
                    "citationKey":"unused2026",
                    "year":2026,
                }),
            ],
            document_reference_selections: json!({
                " paper.tex ": ["ref-1", "missing", "ref-1", "ref-2"],
                "": ["ref-3"]
            }),
            sort_key: "year-desc".to_string(),
            ..ReferencesQueryResolveParams::default()
        })
        .await
        .expect("resolve document reference state");

        let entry = &result["documentReferenceState"]["byPath"]["paper.tex"];
        assert_eq!(entry["referenceIds"], json!(["ref-1", "ref-2"]));
        assert_eq!(entry["references"].as_array().map(Vec::len), Some(2));
        assert_eq!(
            entry["referenceLookup"]["byKey"]["hopper2025"]["id"].as_str(),
            Some("ref-2")
        );
        assert!(entry["referenceSearchIndex"]["ref-3"]
            .as_str()
            .unwrap_or_default()
            .contains("unused reference"));
        assert_eq!(
            entry["availableReferences"]
                .as_array()
                .and_then(|items| items.first())
                .and_then(|reference| reference.get("id"))
                .and_then(Value::as_str),
            Some("ref-3")
        );
        assert_eq!(
            result["documentReferenceState"]["default"]["availableReferences"]
                .as_array()
                .map(Vec::len),
            Some(3)
        );
    }

    #[tokio::test]
    async fn searches_references_and_document_available_targets_in_rust() {
        let references = vec![
            json!({
                "id":"ref-1",
                "title":"Graph Neural Networks",
                "authors":["Ada Lovelace"],
                "citationKey":"lovelace2024",
                "tags":["graph"],
                "year":2024,
            }),
            json!({
                "id":"ref-2",
                "title":"Bayesian Methods",
                "authorLine":"Grace Hopper",
                "citationKey":"hopper2025",
                "source":"Journal of Tests",
                "year":2025,
            }),
            json!({
                "id":"ref-3",
                "title":"Unused Reference",
                "citationKey":"unused2026",
                "year":2026,
            }),
        ];

        let result = references_query_search_resolved(ReferencesQuerySearchParams {
            references,
            document_reference_selections: json!({
                "paper.tex": ["ref-1", "missing", "ref-1", "ref-2"],
            }),
            tex_path: " paper.tex ".to_string(),
            query: " grace ".to_string(),
            sort_key: "year-desc".to_string(),
        })
        .await
        .expect("search references");

        assert_eq!(result["normalizedQuery"].as_str(), Some("grace"));
        assert_eq!(result["documentReferenceIds"], json!(["ref-1", "ref-2"]));
        assert_eq!(
            result["references"]
                .as_array()
                .and_then(|items| items.first())
                .and_then(|reference| reference.get("id"))
                .and_then(Value::as_str),
            Some("ref-2")
        );
        assert_eq!(
            result["documentReferences"]
                .as_array()
                .and_then(|items| items.first())
                .and_then(|reference| reference.get("id"))
                .and_then(Value::as_str),
            Some("ref-2")
        );
        assert_eq!(
            result["availableReferences"].as_array().map(Vec::len),
            Some(0)
        );

        let available_result = references_query_search_resolved(ReferencesQuerySearchParams {
            references: vec![
                json!({"id":"ref-1","title":"Graph Neural Networks","year":2024}),
                json!({"id":"ref-2","title":"Bayesian Methods","year":2025}),
                json!({"id":"ref-3","title":"Unused Reference","citationKey":"unused2026","year":2026}),
            ],
            document_reference_selections: json!({
                "paper.tex": ["ref-1", "ref-2"],
            }),
            tex_path: "paper.tex".to_string(),
            query: "unused".to_string(),
            sort_key: "year-desc".to_string(),
        })
        .await
        .expect("search available references");
        assert_eq!(
            available_result["availableReferences"]
                .as_array()
                .and_then(|items| items.first())
                .and_then(|reference| reference.get("id"))
                .and_then(Value::as_str),
            Some("ref-3")
        );
    }

    #[tokio::test]
    async fn builds_citation_usage_index_from_workspace_files() {
        let result = references_query_resolve_resolved(ReferencesQueryResolveParams {
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
        let result = references_query_resolve_resolved(ReferencesQueryResolveParams {
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

    #[tokio::test]
    async fn normalizes_raw_selection_intents_in_rust() {
        let result = references_query_resolve_resolved(ReferencesQueryResolveParams {
            library_sections: vec![json!({"key":"all"}), json!({"key":"missing-pdf"})],
            source_sections: vec![json!({"key":"manual"}), json!({"key":"zotero"})],
            collections: vec![json!({"key":"ml","label":"Machine Learning"})],
            tags: vec![json!({"key":"theory","label":"Theory"})],
            references: vec![json!({
                "id":"ref-1",
                "title":"Selected",
                "collections":["ml"],
                "tags":["Theory"],
                "year":2026,
                "_source":"manual",
                "citationKey":"selected2026"
            })],
            selected_section_key: " missing-pdf ".to_string(),
            selected_source_key: " manual ".to_string(),
            selected_collection_key: " machine learning ".to_string(),
            selected_tag_key: " THEORY ".to_string(),
            sort_key: "bad-sort".to_string(),
            preferred_selected_reference_id: "ref-1".to_string(),
            ..ReferencesQueryResolveParams::default()
        })
        .await
        .expect("resolve raw selection intent");

        assert_eq!(
            result["query"]["selectedSectionKey"].as_str(),
            Some("missing-pdf")
        );
        assert_eq!(
            result["query"]["selectedSourceKey"].as_str(),
            Some("manual")
        );
        assert_eq!(
            result["query"]["selectedCollectionKey"].as_str(),
            Some("ml")
        );
        assert_eq!(result["query"]["selectedTagKey"].as_str(), Some("theory"));
        assert_eq!(result["query"]["sortKey"].as_str(), Some("year-desc"));
        assert_eq!(
            result["query"]["selectedReferenceId"].as_str(),
            Some("ref-1")
        );
        assert_eq!(result["selectedCollection"]["key"].as_str(), Some("ml"));
        assert_eq!(result["selectedTag"]["key"].as_str(), Some("theory"));
    }

    #[test]
    fn references_query_params_normalize_raw_payload() {
        let params = references_query_params_from_payload(json!({
            "librarySections": "not-an-array",
            "sourceSections": [{"key": "manual"}],
            "collections": null,
            "tags": [{"key": "ai"}],
            "references": [{"id": "ref-a"}],
            "documentReferenceSelections": "not-an-object",
            "selectedSectionKey": 12,
            "selectedSourceKey": "manual",
            "selectedCollectionKey": false,
            "selectedTagKey": "ai",
            "sortKey": "title-asc",
            "preferredSelectedReferenceId": ["ref-a"],
            "fileContents": "not-an-object"
        }));

        assert!(params.library_sections.is_empty());
        assert_eq!(params.source_sections.len(), 1);
        assert!(params.collections.is_empty());
        assert_eq!(params.tags.len(), 1);
        assert_eq!(params.references.len(), 1);
        assert_eq!(params.document_reference_selections, json!({}));
        assert_eq!(params.selected_section_key, "");
        assert_eq!(params.selected_source_key, "manual");
        assert_eq!(params.selected_collection_key, "");
        assert_eq!(params.selected_tag_key, "ai");
        assert_eq!(params.sort_key, "title-asc");
        assert_eq!(params.preferred_selected_reference_id, "");
        assert_eq!(params.file_contents, json!({}));

        let defaults = references_query_params_from_payload(Value::Null);
        assert!(defaults.references.is_empty());
        assert_eq!(defaults.file_contents, json!({}));
    }

    #[test]
    fn references_query_search_params_normalize_raw_payload() {
        let params = references_query_search_params_from_payload(json!({
            "references": [{"id": "ref-a"}],
            "documentReferenceSelections": "not-an-object",
            "texPath": ["paper.tex"],
            "query": " graph ",
            "sortKey": false
        }));

        assert_eq!(params.references.len(), 1);
        assert_eq!(params.document_reference_selections, json!({}));
        assert_eq!(params.tex_path, "");
        assert_eq!(params.query, " graph ");
        assert_eq!(params.sort_key, "");

        let defaults = references_query_search_params_from_payload(Value::Null);
        assert!(defaults.references.is_empty());
        assert_eq!(defaults.document_reference_selections, json!({}));
        assert_eq!(defaults.query, "");
    }
}
