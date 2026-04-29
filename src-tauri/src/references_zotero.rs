use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::references_backend::write_library_snapshot;

const ZOTERO_API_BASE: &str = "https://api.zotero.org";
const ZOTERO_USER_AGENT: &str = "ScribeFlow-Desktop/1.0";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroConfigPathParams {
    pub global_config_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroConfigSaveParams {
    pub global_config_dir: String,
    #[serde(default)]
    pub config: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroApiKeyParams {
    pub api_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroUserGroupsParams {
    pub api_key: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCollectionsParams {
    pub api_key: String,
    pub library_type: String,
    pub library_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSyncParams {
    pub global_config_dir: String,
    pub api_key: String,
    #[serde(default)]
    pub references: Vec<Value>,
    #[serde(default)]
    pub selected_reference_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroSyncPersistParams {
    pub global_config_dir: String,
    pub api_key: String,
    #[serde(default)]
    pub snapshot: Value,
    #[serde(default)]
    pub selected_reference_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroDeleteParams {
    pub global_config_dir: String,
    pub api_key: String,
    #[serde(default)]
    pub reference: Value,
}

#[derive(Debug)]
struct ZoteroApiResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Value,
}

fn trim_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn scalar_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(boolean)) => boolean.to_string(),
        _ => String::new(),
    }
}

fn normalize_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn zotero_config_path(global_config_dir: &str) -> Option<PathBuf> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        return None;
    }
    Some(Path::new(&root).join("zotero.json"))
}

fn read_zotero_config_raw(global_config_dir: &str) -> Result<Option<Value>, String> {
    let Some(path) = zotero_config_path(global_config_dir) else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn sanitize_zotero_config(config: &Value) -> Value {
    let mut map = config.as_object().cloned().unwrap_or_default();
    map.remove("_apiKeyFallback");
    map.remove("_credentialStorage");
    Value::Object(map)
}

fn merge_preserving_hidden_fields(existing: Option<Value>, next: Option<Value>) -> Option<Value> {
    match (existing, next) {
        (_, None) => None,
        (Some(existing), Some(next)) => {
            let mut merged = existing.as_object().cloned().unwrap_or_default();
            let sanitized = sanitize_zotero_config(&next);
            if let Some(next_map) = sanitized.as_object() {
                for (key, value) in next_map {
                    merged.insert(key.clone(), value.clone());
                }
            }
            Some(Value::Object(merged))
        }
        (None, Some(next)) => Some(sanitize_zotero_config(&next)),
    }
}

fn write_zotero_config_raw(
    global_config_dir: &str,
    config: Option<Value>,
) -> Result<Value, String> {
    let Some(path) = zotero_config_path(global_config_dir) else {
        return Ok(Value::Null);
    };
    if let Some(config) = config {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let serialized = serde_json::to_string_pretty(&config)
            .map_err(|error| format!("Failed to serialize Zotero config: {error}"))?;
        fs::write(&path, serialized).map_err(|error| error.to_string())?;
        Ok(sanitize_zotero_config(&config))
    } else {
        let _ = fs::remove_file(&path);
        Ok(Value::Null)
    }
}

fn extract_zotero_item_key(value: &str) -> String {
    value
        .trim()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .last()
        .unwrap_or_default()
        .to_string()
}

fn normalize_reference_type_key(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "article" | "article-journal" | "journal-article" | "journal article" | "期刊论文" => {
            "journal-article".to_string()
        }
        "paper-conference" | "conference-paper" | "conference paper" | "会议论文" => {
            "conference-paper".to_string()
        }
        "book" | "chapter" | "图书" => "book".to_string(),
        "thesis" | "phdthesis" | "mastersthesis" | "学位论文" => "thesis".to_string(),
        _ => "other".to_string(),
    }
}

fn reference_type_to_zotero_item(value: &str) -> &'static str {
    match normalize_reference_type_key(value).as_str() {
        "journal-article" => "journalArticle",
        "conference-paper" => "conferencePaper",
        "book" => "book",
        "thesis" => "thesis",
        _ => "journalArticle",
    }
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

fn extract_csl_year(item: &Value) -> Option<i64> {
    for field in [
        "issued",
        "published-print",
        "published-online",
        "original-date",
        "submitted",
        "created",
    ] {
        if let Some(year) = extract_year_from_date_parts(item.get(field)) {
            return Some(year);
        }
    }

    for field in ["date", "raw-date", "literal"] {
        if let Some(year) = item
            .get(field)
            .and_then(Value::as_str)
            .and_then(extract_year_from_text)
        {
            return Some(year);
        }
    }

    None
}

fn stringify_author(author: &Value) -> String {
    let given = normalize_whitespace(&trim_string(author.get("given")));
    let family = normalize_whitespace(&trim_string(author.get("family")));
    [given, family]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn build_author_names_from_csl(item: &Value) -> Vec<String> {
    item.get("author")
        .and_then(Value::as_array)
        .map(|authors| {
            authors
                .iter()
                .map(stringify_author)
                .filter(|value| !value.is_empty())
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

fn first_author_family_key_component(item: &Value) -> String {
    let first_author = item
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

fn looks_like_generated_citation_key(value: &str, zotero_key: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return true;
    }

    let lower = trimmed.to_ascii_lowercase();
    let normalized_zotero_key = zotero_key.trim().to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || trimmed.contains('/')
        || trimmed.contains(':')
        || (!normalized_zotero_key.is_empty() && lower == normalized_zotero_key)
    {
        return true;
    }

    trimmed.len() == 8
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit())
}

fn build_citation_key(item: &Value) -> String {
    let explicit = normalize_whitespace(&trim_string(item.get("_key")));
    let zotero_key = extract_zotero_item_key(&trim_string(item.get("id")));
    if !looks_like_generated_citation_key(&explicit, &zotero_key) {
        return explicit;
    }

    let family = normalize_whitespace(&first_author_family_key_component(item));
    let year = extract_csl_year(item)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let fallback = format!(
        "{}{}",
        if family.is_empty() { "ref" } else { &family },
        year
    );
    if !fallback.is_empty() {
        fallback
    } else if !zotero_key.is_empty() {
        format!("ref{}", zotero_key.to_lowercase())
    } else if !explicit.is_empty() {
        sanitize_citation_key_component(&explicit)
    } else {
        format!("ref-{}", Uuid::new_v4())
    }
}

fn csl_to_reference_record(item: &Value, library_label: &str) -> Value {
    let authors = build_author_names_from_csl(item);
    let citation_key = build_citation_key(item);
    let identifier = normalize_whitespace(
        &trim_string(item.get("DOI")).if_empty_then(|| trim_string(item.get("URL"))),
    );
    let pdf_path = normalize_whitespace(
        &trim_string(item.get("_pdfPath")).if_empty_then(|| trim_string(item.get("pdfPath"))),
    );
    let fulltext_path = normalize_whitespace(
        &trim_string(item.get("_textPath")).if_empty_then(|| trim_string(item.get("fulltextPath"))),
    );
    let collections = item
        .get("_collections")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let tags = item
        .get("_tags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let title = normalize_whitespace(
        &trim_string(item.get("title")).if_empty_then(|| "Untitled".to_string()),
    );
    let source = normalize_whitespace(
        &trim_string(item.get("container-title"))
            .if_empty_then(|| trim_string(item.get("publisher"))),
    );
    let abstract_text = normalize_whitespace(&trim_string(item.get("abstract")));
    let item_id = normalize_whitespace(
        &trim_string(item.get("_key"))
            .if_empty_then(|| extract_zotero_item_key(&trim_string(item.get("id"))))
            .if_empty_then(|| citation_key.clone())
            .if_empty_then(|| format!("ref-{}", Uuid::new_v4())),
    );
    json!({
        "id": item_id,
        "typeKey": normalize_reference_type_key(&trim_string(item.get("type"))),
        "title": title,
        "authors": authors,
        "authorLine": build_author_names_from_csl(item).join("; "),
        "year": extract_csl_year(item),
        "source": source,
        "identifier": identifier,
        "volume": normalize_whitespace(&trim_string(item.get("volume"))),
        "issue": normalize_whitespace(&trim_string(item.get("issue"))),
        "pages": normalize_whitespace(&trim_string(item.get("page"))),
        "citationKey": citation_key,
        "hasPdf": !pdf_path.is_empty(),
        "pdfPath": pdf_path,
        "hasFullText": !fulltext_path.is_empty(),
        "fulltextPath": fulltext_path,
        "collections": collections,
        "tags": tags,
        "abstract": abstract_text,
        "notes": [],
        "annotations": [],
        "_zoteroKey": extract_zotero_item_key(&trim_string(item.get("id"))),
        "_zoteroLibrary": library_label,
        "_source": "zotero",
        "_importMethod": "zotero-sync",
    })
}

fn normalize_text(value: &str) -> String {
    value.trim().to_lowercase()
}

fn tokenize_title(value: &str) -> HashSet<String> {
    let mut tokens = HashSet::new();
    let mut current = String::new();
    for ch in normalize_text(value).chars() {
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
    let candidate_citation_key = normalize_text(&trim_string(candidate.get("citationKey")));
    let candidate_identifier = normalize_text(&trim_string(candidate.get("identifier")));
    let candidate_title = normalize_text(&trim_string(candidate.get("title")));
    let candidate_year = candidate.get("year").and_then(Value::as_i64).unwrap_or(0);

    let current_citation_key = normalize_text(&trim_string(current.get("citationKey")));
    if !candidate_citation_key.is_empty()
        && !current_citation_key.is_empty()
        && candidate_citation_key == current_citation_key
    {
        return true;
    }

    let current_identifier = normalize_text(&trim_string(current.get("identifier")));
    if !candidate_identifier.is_empty()
        && !current_identifier.is_empty()
        && candidate_identifier == current_identifier
    {
        return true;
    }

    let current_title = normalize_text(&trim_string(current.get("title")));
    let current_year = current.get("year").and_then(Value::as_i64).unwrap_or(0);
    candidate_year > 0
        && current_year > 0
        && candidate_year == current_year
        && !candidate_title.is_empty()
        && !current_title.is_empty()
        && (candidate_title == current_title
            || title_similarity(&candidate_title, &current_title) >= 0.85)
}

fn is_suspicious_synced_zotero_reference(reference: &Value) -> bool {
    let authors_len = reference
        .get("authors")
        .and_then(Value::as_array)
        .map(|authors| authors.len())
        .unwrap_or(0);
    trim_string(reference.get("_source")) == "zotero"
        && trim_string(reference.get("_importMethod")) == "zotero-sync"
        && !trim_string(reference.get("_zoteroKey")).is_empty()
        && trim_string(reference.get("typeKey")) == "other"
        && authors_len == 0
        && trim_string(reference.get("source")).is_empty()
        && trim_string(reference.get("identifier")).is_empty()
        && reference.get("year").and_then(Value::as_i64).unwrap_or(0) == 0
        && trim_string(reference.get("abstract")).is_empty()
        && trim_string(reference.get("pdfPath")).is_empty()
        && trim_string(reference.get("fulltextPath")).is_empty()
}

fn build_headers(api_key: &str, extra_headers: &[(&str, String)]) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("zotero-api-key"),
        HeaderValue::from_str(api_key).map_err(|error| error.to_string())?,
    );
    headers.insert(
        HeaderName::from_static("zotero-api-version"),
        HeaderValue::from_static("3"),
    );
    headers.insert(
        HeaderName::from_static("user-agent"),
        HeaderValue::from_static(ZOTERO_USER_AGENT),
    );

    for (name, value) in extra_headers {
        headers.insert(
            HeaderName::from_bytes(name.as_bytes()).map_err(|error| error.to_string())?,
            HeaderValue::from_str(value).map_err(|error| error.to_string())?,
        );
    }
    Ok(headers)
}

async fn zotero_api(
    api_key: &str,
    method: reqwest::Method,
    path: &str,
    extra_headers: &[(&str, String)],
    body: Option<Value>,
) -> Result<ZoteroApiResponse, String> {
    let url = format!("{ZOTERO_API_BASE}{path}");
    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("Failed to build Zotero client: {error}"))?;
    let headers = build_headers(api_key, extra_headers)?;
    let mut request = client.request(method, &url).headers(headers);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Zotero network error: {error}"))?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_ascii_lowercase(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect::<HashMap<_, _>>();
    let text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Zotero response: {error}"))?;
    let body = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::String(text.clone()))
    };

    if status == 429 {
        return Err(format!(
            "Zotero rate-limit error: retry after {}s",
            headers
                .get("retry-after")
                .cloned()
                .unwrap_or_else(|| "10".to_string())
        ));
    }
    if status == 403 {
        return Err("Zotero auth error: API key is invalid or expired".to_string());
    }

    Ok(ZoteroApiResponse {
        status,
        headers,
        body,
    })
}

async fn fetch_items_page(
    api_key: &str,
    library_type: &str,
    library_id: &str,
    start: usize,
    limit: usize,
    since: i64,
) -> Result<(Vec<Value>, i64, i64), String> {
    let prefix = if library_type == "group" {
        format!("/groups/{library_id}")
    } else {
        format!("/users/{library_id}")
    };
    let mut headers = Vec::new();
    if since > 0 {
        headers.push(("If-Modified-Since-Version", since.to_string()));
    }
    let response = zotero_api(
        api_key,
        reqwest::Method::GET,
        &format!(
            "{prefix}/items?format=csljson&limit={limit}&start={start}&itemType=-attachment%20||%20note%20||%20annotation"
        ),
        &headers,
        None,
    )
    .await?;

    if response.status == 304 {
        return Ok((Vec::new(), 0, since));
    }

    let items = extract_items_array(&response.body);
    let total_results = response
        .headers
        .get("total-results")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let last_version = response
        .headers
        .get("last-modified-version")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(since);
    Ok((items, total_results, last_version))
}

fn extract_items_array(body: &Value) -> Vec<Value> {
    if let Some(items) = body.as_array() {
        return items.to_vec();
    }

    body.get("items")
        .and_then(Value::as_array)
        .map(|items| items.to_vec())
        .unwrap_or_default()
}

fn has_local_references_for_library(references: &[Value], library_label: &str) -> bool {
    references.iter().any(|reference| {
        trim_string(reference.get("_source")) == "zotero"
            && trim_string(reference.get("_zoteroLibrary")) == library_label
            && !trim_string(reference.get("_zoteroKey")).is_empty()
    })
}

fn library_needs_metadata_refresh(references: &[Value], library_label: &str) -> bool {
    references.iter().any(|reference| {
        if trim_string(reference.get("_source")) != "zotero"
            || trim_string(reference.get("_zoteroLibrary")) != library_label
        {
            return false;
        }

        let citation_key = trim_string(reference.get("citationKey"));
        let zotero_key = trim_string(reference.get("_zoteroKey"));
        let year = reference.get("year").and_then(Value::as_i64).unwrap_or(0);

        looks_like_generated_citation_key(&citation_key, &zotero_key) || year <= 0
    })
}

fn resolve_synced_citation_key(existing: &Value, normalized: &Value) -> String {
    let existing_key = trim_string(existing.get("citationKey"));
    let normalized_key = trim_string(normalized.get("citationKey"));
    let zotero_key = trim_string(normalized.get("_zoteroKey"));

    if existing_key.is_empty() || looks_like_generated_citation_key(&existing_key, &zotero_key) {
        normalized_key
    } else {
        existing_key
    }
}

async fn fetch_all_items(
    api_key: &str,
    library_type: &str,
    library_id: &str,
    since_version: i64,
) -> Result<(Vec<Value>, i64), String> {
    let limit = 100usize;
    let (mut items, total_results, last_version) =
        fetch_items_page(api_key, library_type, library_id, 0, limit, since_version).await?;
    if items.is_empty() && total_results == 0 {
        return Ok((Vec::new(), last_version));
    }

    let mut start = limit as i64;
    while start < total_results {
        let (page_items, _, _) = fetch_items_page(
            api_key,
            library_type,
            library_id,
            start as usize,
            limit,
            since_version,
        )
        .await?;
        items.extend(page_items);
        start += limit as i64;
    }
    Ok((items, last_version))
}

async fn fetch_raw_item(
    api_key: &str,
    library_type: &str,
    library_id: &str,
    item_key: &str,
) -> Result<Value, String> {
    let prefix = if library_type == "group" {
        format!("/groups/{library_id}")
    } else {
        format!("/users/{library_id}")
    };
    let response = zotero_api(
        api_key,
        reqwest::Method::GET,
        &format!("{prefix}/items/{item_key}?format=json"),
        &[],
        None,
    )
    .await?;
    Ok(response.body.get("data").cloned().unwrap_or(Value::Null))
}

fn reference_to_zotero_json(reference: &Value, collection_key: &str) -> Value {
    let authors = reference
        .get("authors")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let creators = authors
        .into_iter()
        .filter_map(|author| author.as_str().map(|value| value.to_string()))
        .map(|author| {
            let parts = author.split_whitespace().collect::<Vec<_>>();
            json!({
                "creatorType": "author",
                "lastName": parts.last().copied().unwrap_or(author.as_str()),
                "firstName": parts[..parts.len().saturating_sub(1)].join(" "),
            })
        })
        .collect::<Vec<_>>();
    let identifier = trim_string(reference.get("identifier"));
    let is_doi = identifier.starts_with("10.");
    let year = reference
        .get("year")
        .and_then(Value::as_i64)
        .map(|value| value.to_string())
        .unwrap_or_default();

    json!({
        "itemType": reference_type_to_zotero_item(&trim_string(reference.get("type")).if_empty_then(|| trim_string(reference.get("typeKey")))),
        "title": trim_string(reference.get("title")),
        "creators": creators,
        "date": year,
        "publicationTitle": trim_string(reference.get("source")),
        "bookTitle": trim_string(reference.get("source")),
        "proceedingsTitle": trim_string(reference.get("source")),
        "volume": trim_string(reference.get("volume")),
        "issue": trim_string(reference.get("issue")),
        "pages": trim_string(reference.get("pages")),
        "DOI": if is_doi { identifier.clone() } else { String::new() },
        "url": if is_doi { String::new() } else { identifier },
        "abstractNote": trim_string(reference.get("abstract")),
        "collections": if collection_key.trim().is_empty() { Vec::<String>::new() } else { vec![collection_key.to_string()] },
    })
}

fn choose_selected_reference_id(references: &[Value], current: &str) -> String {
    if references
        .iter()
        .any(|reference| trim_string(reference.get("id")) == current)
    {
        current.to_string()
    } else {
        references
            .first()
            .map(|reference| trim_string(reference.get("id")))
            .unwrap_or_default()
    }
}

async fn perform_sync(params: ZoteroSyncParams) -> Result<Value, String> {
    let api_key = params.api_key.trim().to_string();
    if api_key.is_empty() {
        return Ok(json!({
            "imported": 0,
            "linked": 0,
            "updated": 0,
            "references": params.references,
            "selectedReferenceId": params.selected_reference_id,
        }));
    }

    let raw_config = read_zotero_config_raw(&params.global_config_dir)?;
    let Some(mut config) = raw_config else {
        return Ok(json!({
            "imported": 0,
            "linked": 0,
            "updated": 0,
            "references": params.references,
            "selectedReferenceId": params.selected_reference_id,
        }));
    };
    let user_id = trim_string(config.get("userId"));
    if user_id.is_empty() {
        return Ok(json!({
            "imported": 0,
            "linked": 0,
            "updated": 0,
            "references": params.references,
            "selectedReferenceId": params.selected_reference_id,
        }));
    }

    let mut references = params.references;
    let mut imported = 0;
    let mut linked = 0;
    let mut updated = 0;

    let mut libraries = vec![("user".to_string(), user_id.clone())];
    if let Some(groups) = config.get("_groups").and_then(Value::as_array) {
        for group in groups {
            let group_id = trim_string(group.get("id"));
            if !group_id.is_empty() {
                libraries.push(("group".to_string(), group_id));
            }
        }
    }

    let mut removable_ids = HashSet::new();
    for reference in &references {
        if !is_suspicious_synced_zotero_reference(reference) {
            continue;
        }
        let library_label = trim_string(reference.get("_zoteroLibrary"));
        let mut parts = library_label.split('/');
        let library_type = parts.next().unwrap_or_default();
        let library_id = parts.next().unwrap_or_default();
        let item_key = trim_string(reference.get("_zoteroKey"));
        if library_type.is_empty() || library_id.is_empty() || item_key.is_empty() {
            continue;
        }
        if let Ok(raw_item) = fetch_raw_item(&api_key, library_type, library_id, &item_key).await {
            let item_type = trim_string(raw_item.get("itemType")).to_lowercase();
            if item_type == "annotation" || item_type == "note" || item_type == "attachment" {
                removable_ids.insert(trim_string(reference.get("id")));
            }
        }
    }
    if !removable_ids.is_empty() {
        references.retain(|reference| !removable_ids.contains(&trim_string(reference.get("id"))));
        updated += removable_ids.len() as i64;
    }

    if !config.is_object() {
        config = json!({});
    }
    if config
        .get("lastSyncVersions")
        .and_then(Value::as_object)
        .is_none()
    {
        config
            .as_object_mut()
            .unwrap()
            .insert("lastSyncVersions".to_string(), Value::Object(Map::new()));
    }

    for (library_type, library_id) in libraries {
        let version_key = format!("{library_type}/{library_id}");
        let since_version = config
            .get("lastSyncVersions")
            .and_then(Value::as_object)
            .and_then(|versions| versions.get(&version_key))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let effective_since_version =
            if since_version > 0
                && (!has_local_references_for_library(&references, &version_key)
                    || library_needs_metadata_refresh(&references, &version_key))
            {
                0
            } else {
                since_version
            };
        let (items, last_version) =
            fetch_all_items(&api_key, &library_type, &library_id, effective_since_version).await?;
        if let Some(versions) = config
            .get_mut("lastSyncVersions")
            .and_then(Value::as_object_mut)
        {
            versions.insert(version_key.clone(), Value::from(last_version));
        }

        for item in items {
            let normalized = csl_to_reference_record(&item, &version_key);
            let zotero_key = trim_string(normalized.get("_zoteroKey"));
            if let Some(existing_index) = references.iter().position(|reference| {
                trim_string(reference.get("_zoteroKey")) == zotero_key && !zotero_key.is_empty()
            }) {
                let existing = references[existing_index].clone();
                references[existing_index] = json!({
                    "id": trim_string(existing.get("id")),
                    "typeKey": trim_string(normalized.get("typeKey")),
                    "title": trim_string(normalized.get("title")),
                    "authors": normalized.get("authors").cloned().unwrap_or(Value::Array(Vec::new())),
                    "authorLine": trim_string(normalized.get("authorLine")),
                    "year": normalized.get("year").cloned().unwrap_or(Value::Null),
                    "source": trim_string(normalized.get("source")),
                    "identifier": trim_string(normalized.get("identifier")),
                    "volume": trim_string(normalized.get("volume")),
                    "issue": trim_string(normalized.get("issue")),
                    "pages": trim_string(normalized.get("pages")),
                    "citationKey": resolve_synced_citation_key(&existing, &normalized),
                    "collections": existing.get("collections").cloned().unwrap_or(Value::Array(Vec::new())),
                    "tags": existing.get("tags").cloned().unwrap_or(Value::Array(Vec::new())),
                    "pdfPath": trim_string(existing.get("pdfPath")),
                    "hasPdf": !trim_string(existing.get("pdfPath")).is_empty() || existing.get("hasPdf").and_then(Value::as_bool).unwrap_or(false),
                    "fulltextPath": trim_string(existing.get("fulltextPath")),
                    "hasFullText": !trim_string(existing.get("fulltextPath")).is_empty() || existing.get("hasFullText").and_then(Value::as_bool).unwrap_or(false),
                    "abstract": trim_string(normalized.get("abstract")),
                    "notes": existing.get("notes").cloned().unwrap_or(Value::Array(Vec::new())),
                    "annotations": existing.get("annotations").cloned().unwrap_or(Value::Array(Vec::new())),
                    "_zoteroKey": trim_string(normalized.get("_zoteroKey")),
                    "_zoteroLibrary": trim_string(normalized.get("_zoteroLibrary")),
                    "_source": "zotero",
                    "_importMethod": "zotero-sync",
                    "_pushedByApp": existing.get("_pushedByApp").cloned().unwrap_or(Value::Bool(false)),
                    "_appPushPending": existing.get("_appPushPending").cloned().unwrap_or(Value::Bool(false)),
                });
                updated += 1;
                continue;
            }

            if let Some(duplicate_index) = references
                .iter()
                .position(|reference| same_reference_identity(reference, &normalized))
            {
                if let Some(existing) = references
                    .get_mut(duplicate_index)
                    .and_then(Value::as_object_mut)
                {
                    existing.insert(
                        "_zoteroKey".to_string(),
                        Value::String(trim_string(normalized.get("_zoteroKey"))),
                    );
                    existing.insert(
                        "_zoteroLibrary".to_string(),
                        Value::String(trim_string(normalized.get("_zoteroLibrary"))),
                    );
                    existing.insert("_source".to_string(), Value::String("zotero".to_string()));
                }
                linked += 1;
                continue;
            }

            references.push(normalized);
            imported += 1;
        }
    }

    if let Some(push_target) = config.get("pushTarget") {
        let library_type = trim_string(push_target.get("libraryType"));
        let library_id = trim_string(push_target.get("libraryId"));
        let collection_key = trim_string(push_target.get("collectionKey"));
        if !library_type.is_empty() && !library_id.is_empty() {
            let prefix = if library_type == "group" {
                format!("/groups/{library_id}")
            } else {
                format!("/users/{library_id}")
            };
            for reference in references.iter_mut() {
                let should_push = reference
                    .get("_appPushPending")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                    && trim_string(reference.get("_zoteroKey")).is_empty();
                if !should_push {
                    continue;
                }
                let body = Value::Array(vec![reference_to_zotero_json(reference, &collection_key)]);
                let response = zotero_api(
                    &api_key,
                    reqwest::Method::POST,
                    &format!("{prefix}/items"),
                    &[],
                    Some(body),
                )
                .await?;
                if response.status != 200 {
                    return Err(format!(
                        "Zotero API error {}: {}",
                        response.status, response.body
                    ));
                }
                let created = response
                    .body
                    .get("successful")
                    .and_then(Value::as_object)
                    .and_then(|entries| entries.values().next())
                    .cloned()
                    .unwrap_or(Value::Null);
                if let Some(reference_map) = reference.as_object_mut() {
                    reference_map.insert(
                        "_zoteroKey".to_string(),
                        Value::String(trim_string(created.get("key"))),
                    );
                    reference_map.insert(
                        "_zoteroLibrary".to_string(),
                        Value::String(format!("{library_type}/{library_id}")),
                    );
                    reference_map.insert("_pushedByApp".to_string(), Value::Bool(true));
                    reference_map.insert("_appPushPending".to_string(), Value::Bool(false));
                }
            }
        }
    }

    let merged_config = merge_preserving_hidden_fields(
        read_zotero_config_raw(&params.global_config_dir)?,
        Some(config),
    )
    .unwrap_or(Value::Null);
    write_zotero_config_raw(&params.global_config_dir, Some(merged_config))?;

    Ok(json!({
        "imported": imported,
        "linked": linked,
        "updated": updated,
        "references": references,
        "selectedReferenceId": choose_selected_reference_id(&references, &params.selected_reference_id),
        "lastSyncTime": chrono::Utc::now().to_rfc3339(),
    }))
}

fn build_synced_snapshot(snapshot: &Value, sync_result: &Value) -> Value {
    json!({
        "version": snapshot.get("version").and_then(Value::as_u64).unwrap_or(2),
        "legacyMigrationComplete": snapshot.get("legacyMigrationComplete").and_then(Value::as_bool).unwrap_or(true),
        "citationStyle": trim_string(snapshot.get("citationStyle")),
        "collections": snapshot.get("collections").cloned().unwrap_or(Value::Array(Vec::new())),
        "tags": snapshot.get("tags").cloned().unwrap_or(Value::Array(Vec::new())),
        "references": sync_result.get("references").cloned().unwrap_or(Value::Array(Vec::new())),
    })
}

#[tauri::command]
pub async fn references_zotero_config_load(
    params: ZoteroConfigPathParams,
) -> Result<Value, String> {
    Ok(read_zotero_config_raw(&params.global_config_dir)?
        .map(|config| sanitize_zotero_config(&config))
        .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn references_zotero_config_save(
    params: ZoteroConfigSaveParams,
) -> Result<Value, String> {
    let existing = read_zotero_config_raw(&params.global_config_dir)?;
    let merged = merge_preserving_hidden_fields(existing, params.config);
    write_zotero_config_raw(&params.global_config_dir, merged)
}

#[tauri::command]
pub async fn references_zotero_validate_api_key(
    params: ZoteroApiKeyParams,
) -> Result<Value, String> {
    let response = zotero_api(
        params.api_key.trim(),
        reqwest::Method::GET,
        "/keys/current",
        &[],
        None,
    )
    .await?;
    Ok(json!({
        "userID": scalar_string(response.body.get("userID")),
        "username": trim_string(response.body.get("username")),
    }))
}

#[tauri::command]
pub async fn references_zotero_fetch_user_groups(
    params: ZoteroUserGroupsParams,
) -> Result<Value, String> {
    let response = zotero_api(
        params.api_key.trim(),
        reqwest::Method::GET,
        &format!("/users/{}/groups", params.user_id.trim()),
        &[],
        None,
    )
    .await?;
    let groups = response
        .body
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|group| {
            json!({
                "id": scalar_string(group.get("id")),
                "name": trim_string(group.get("data").and_then(|data| data.get("name"))),
                "owner": scalar_string(group.get("data").and_then(|data| data.get("owner"))),
                "canWrite": trim_string(group.get("meta").and_then(|meta| meta.get("library")).and_then(|library| library.get("libraryEditing"))) != "admins"
                    || scalar_string(group.get("data").and_then(|data| data.get("owner"))) == params.user_id.trim(),
            })
        })
        .collect::<Vec<_>>();
    Ok(Value::Array(groups))
}

#[tauri::command]
pub async fn references_zotero_fetch_collections(
    params: ZoteroCollectionsParams,
) -> Result<Value, String> {
    let prefix = if params.library_type.trim() == "group" {
        format!("/groups/{}", params.library_id.trim())
    } else {
        format!("/users/{}", params.library_id.trim())
    };
    let response = zotero_api(
        params.api_key.trim(),
        reqwest::Method::GET,
        &format!("{prefix}/collections"),
        &[],
        None,
    )
    .await?;
    let collections = response
        .body
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|collection| {
            json!({
                "key": trim_string(collection.get("key")),
                "name": trim_string(collection.get("data").and_then(|data| data.get("name"))),
                "parentCollection": collection
                    .get("data")
                    .and_then(|data| data.get("parentCollection"))
                    .cloned()
                    .unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    Ok(Value::Array(collections))
}

#[tauri::command]
pub async fn references_zotero_sync(params: ZoteroSyncParams) -> Result<Value, String> {
    perform_sync(params).await
}

#[tauri::command]
pub async fn references_zotero_sync_persist(
    params: ZoteroSyncPersistParams,
) -> Result<Value, String> {
    let references = params
        .snapshot
        .get("references")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let selected_reference_id = if !params.selected_reference_id.trim().is_empty() {
        params.selected_reference_id.clone()
    } else {
        trim_string(params.snapshot.get("selectedReferenceId"))
    };

    let sync_result = perform_sync(ZoteroSyncParams {
        global_config_dir: params.global_config_dir.clone(),
        api_key: params.api_key,
        references,
        selected_reference_id,
    })
    .await?;

    let persisted_snapshot = write_library_snapshot(
        &params.global_config_dir,
        &build_synced_snapshot(&params.snapshot, &sync_result),
    )?;

    Ok(json!({
        "snapshot": persisted_snapshot,
        "selectedReferenceId": sync_result.get("selectedReferenceId").cloned().unwrap_or(Value::String(String::new())),
        "imported": sync_result.get("imported").cloned().unwrap_or(Value::from(0)),
        "linked": sync_result.get("linked").cloned().unwrap_or(Value::from(0)),
        "updated": sync_result.get("updated").cloned().unwrap_or(Value::from(0)),
        "lastSyncTime": sync_result.get("lastSyncTime").cloned().unwrap_or(Value::String(String::new())),
    }))
}

#[tauri::command]
pub async fn references_zotero_delete_item(params: ZoteroDeleteParams) -> Result<(), String> {
    let Some(config) = read_zotero_config_raw(&params.global_config_dir)? else {
        return Ok(());
    };
    let zotero_key = trim_string(params.reference.get("_zoteroKey"));
    let zotero_library = trim_string(params.reference.get("_zoteroLibrary"));
    if zotero_key.is_empty() || zotero_library.is_empty() || params.api_key.trim().is_empty() {
        return Ok(());
    }
    let mut parts = zotero_library.split('/');
    let library_type = parts.next().unwrap_or_default();
    let library_id = parts.next().unwrap_or_default();
    if library_type.is_empty() || library_id.is_empty() {
        return Ok(());
    }
    let version_key = format!("{library_type}/{library_id}");
    let version = config
        .get("lastSyncVersions")
        .and_then(Value::as_object)
        .and_then(|versions| versions.get(&version_key))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let prefix = if library_type == "group" {
        format!("/groups/{library_id}")
    } else {
        format!("/users/{library_id}")
    };
    let _ = zotero_api(
        params.api_key.trim(),
        reqwest::Method::DELETE,
        &format!("{prefix}/items?itemKey={zotero_key}"),
        &[("If-Unmodified-Since-Version", version.to_string())],
        None,
    )
    .await;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        build_citation_key, extract_csl_year, extract_items_array,
        has_local_references_for_library, library_needs_metadata_refresh,
        looks_like_generated_citation_key,
    };
    use serde_json::json;

    #[test]
    fn extract_items_array_supports_top_level_array_payload() {
        let payload = json!([
            { "title": "Paper A" },
            { "title": "Paper B" }
        ]);

        let items = extract_items_array(&payload);

        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["title"], "Paper A");
        assert_eq!(items[1]["title"], "Paper B");
    }

    #[test]
    fn extract_items_array_supports_wrapped_items_payload() {
        let payload = json!({
            "items": [
                { "title": "Paper A" }
            ]
        });

        let items = extract_items_array(&payload);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["title"], "Paper A");
    }

    #[test]
    fn has_local_references_for_library_checks_zotero_anchor_fields() {
        let references = vec![
            json!({
                "_source": "zotero",
                "_zoteroLibrary": "user/16788433",
                "_zoteroKey": "ABCD1234"
            }),
            json!({
                "_source": "manual",
                "_zoteroLibrary": "user/16788433",
                "_zoteroKey": ""
            }),
        ];

        assert!(has_local_references_for_library(
            &references,
            "user/16788433"
        ));
        assert!(!has_local_references_for_library(
            &references,
            "group/123456"
        ));
    }

    #[test]
    fn extract_csl_year_falls_back_to_date_text() {
        let payload = json!({
            "date": "2023-08-15"
        });

        assert_eq!(extract_csl_year(&payload), Some(2023));
    }

    #[test]
    fn build_citation_key_uses_first_author_and_year_for_zotero_ids() {
        let payload = json!({
            "id": "16788433/Q6ZQTSEA",
            "author": [{ "given": "Qing", "family": "Qin" }],
            "issued": { "date-parts": [[2024, 3, 1]] }
        });

        assert_eq!(build_citation_key(&payload), "qin2024");
    }

    #[test]
    fn generated_key_detection_flags_zotero_identifiers() {
        assert!(looks_like_generated_citation_key("16788433/Q6ZQTSEA", "Q6ZQTSEA"));
        assert!(looks_like_generated_citation_key("Q6ZQTSEA", "Q6ZQTSEA"));
        assert!(!looks_like_generated_citation_key("qin2024", "Q6ZQTSEA"));
    }

    #[test]
    fn metadata_refresh_detects_missing_year_or_generated_key() {
        let references = vec![
            json!({
                "_source": "zotero",
                "_zoteroLibrary": "user/16788433",
                "_zoteroKey": "Q6ZQTSEA",
                "citationKey": "16788433/Q6ZQTSEA",
                "year": null
            }),
            json!({
                "_source": "zotero",
                "_zoteroLibrary": "user/16788433",
                "_zoteroKey": "ABCD1234",
                "citationKey": "qin2024",
                "year": 2024
            }),
        ];

        assert!(library_needs_metadata_refresh(&references, "user/16788433"));
        assert!(!library_needs_metadata_refresh(&references, "group/123456"));
    }
}
