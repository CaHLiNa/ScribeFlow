use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

const CROSSREF_API: &str = "https://api.crossref.org/works";
const DOI_API: &str = "https://doi.org";
const CROSSREF_USER_AGENT: &str = "ScribeFlow/1.0 (desktop references)";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossrefLookupParams {
    #[serde(default)]
    pub doi: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossrefSearchParams {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub year: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceImportTextParams {
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub format: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceBibtexExportParams {
    #[serde(default)]
    pub references: Vec<Value>,
}

fn normalize_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn trim_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(normalize_whitespace)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn normalize_reference_type_key(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "article" | "article-journal" | "journal-article" | "journal article" | "期刊论文" => {
            "journal-article".to_string()
        }
        "inproceedings" | "conference" | "paper-conference" | "conference-paper"
        | "conference paper" | "会议论文" => "conference-paper".to_string(),
        "book" | "chapter" | "图书" => "book".to_string(),
        "thesis" | "phdthesis" | "mastersthesis" | "学位论文" => "thesis".to_string(),
        "report" => "other".to_string(),
        _ => "other".to_string(),
    }
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

fn extract_csl_year(csl: &Value) -> Option<i64> {
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
    let explicit = normalize_whitespace(&trim_string(csl.get("_key")));
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

fn csl_to_reference_record(csl: &Value) -> Value {
    let authors = build_author_names_from_csl(csl);
    let citation_key = build_citation_key(csl);
    let identifier = normalize_whitespace(
        &trim_string(csl.get("DOI")).if_empty_then(|| trim_string(csl.get("URL"))),
    );
    let pdf_path =
        trim_string(csl.get("_pdfPath")).if_empty_then(|| trim_string(csl.get("pdfPath")));
    let fulltext_path =
        trim_string(csl.get("_textPath")).if_empty_then(|| trim_string(csl.get("fulltextPath")));

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
        "hasPdf": !pdf_path.is_empty(),
        "pdfPath": pdf_path,
        "hasFullText": !fulltext_path.is_empty(),
        "fulltextPath": fulltext_path,
        "collections": csl.get("_collections").cloned().unwrap_or(Value::Array(Vec::new())),
        "tags": csl.get("_tags").cloned().unwrap_or(Value::Array(Vec::new())),
        "rating": 0,
        "abstract": trim_string(csl.get("abstract")),
        "notes": [],
        "annotations": [],
    })
}

fn normalize_doi(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("doi:")
        .trim_start_matches("DOI:")
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim()
        .to_string()
}

fn tokenize(value: &str) -> HashSet<String> {
    let mut tokens = HashSet::new();
    let mut current = String::new();
    for ch in value.to_lowercase().chars() {
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
    let left_tokens = tokenize(left);
    let right_tokens = tokenize(right);
    if left_tokens.is_empty() && right_tokens.is_empty() {
        return 1.0;
    }
    let intersection = left_tokens.intersection(&right_tokens).count() as f64;
    let union = left_tokens.union(&right_tokens).count() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

fn crossref_to_csl(work: &Value) -> Value {
    let csl_type = match trim_string(work.get("type")).as_str() {
        "journal-article" => "article-journal",
        "proceedings-article" => "paper-conference",
        "book-chapter" => "chapter",
        "posted-content" => "article",
        "monograph" | "edited-book" | "reference-book" | "book" => "book",
        "dissertation" => "thesis",
        "report" => "report",
        _ => "article",
    };
    let authors = work
        .get("author")
        .and_then(Value::as_array)
        .map(|authors| {
            authors
                .iter()
                .map(|author| {
                    json!({
                        "family": trim_string(author.get("family")),
                        "given": trim_string(author.get("given")),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let issued = work
        .get("issued")
        .and_then(|issued| issued.get("date-parts"))
        .cloned()
        .or_else(|| {
            work.get("published")
                .and_then(|published| published.get("date-parts"))
                .cloned()
        });
    json!({
        "type": csl_type,
        "title": work.get("title").and_then(Value::as_array).and_then(|titles| titles.first()).and_then(Value::as_str).unwrap_or_default(),
        "DOI": trim_string(work.get("DOI")),
        "author": authors,
        "issued": issued.map(|value| json!({ "date-parts": value })),
        "container-title": work.get("container-title").and_then(Value::as_array).and_then(|titles| titles.first()).and_then(Value::as_str).unwrap_or_default(),
        "volume": trim_string(work.get("volume")),
        "issue": trim_string(work.get("issue")),
        "page": trim_string(work.get("page")),
        "publisher": trim_string(work.get("publisher")),
        "abstract": trim_string(work.get("abstract")).replace(['<', '>'], ""),
        "URL": trim_string(work.get("URL")),
    })
}

fn build_headers(extra_headers: &[(&str, &str)]) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("user-agent"),
        HeaderValue::from_static(CROSSREF_USER_AGENT),
    );
    for (key, value) in extra_headers {
        headers.insert(
            HeaderName::from_bytes(key.as_bytes()).map_err(|error| error.to_string())?,
            HeaderValue::from_str(value).map_err(|error| error.to_string())?,
        );
    }
    Ok(headers)
}

async fn fetch_json(url: &str, extra_headers: &[(&str, &str)]) -> Result<Option<Value>, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("Failed to build Crossref client: {error}"))?;
    let response = client
        .get(url)
        .headers(build_headers(extra_headers)?)
        .send()
        .await
        .map_err(|error| format!("Crossref request failed: {error}"))?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read Crossref response: {error}"))?;
    Ok(serde_json::from_str(&text).ok())
}

fn encode_uri_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn parse_bibtex_entries(text: &str) -> Vec<String> {
    let mut entries = Vec::new();
    let chars = text.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '@' {
            index += 1;
            continue;
        }
        let start = index;
        while index < chars.len() && chars[index] != '{' {
            index += 1;
        }
        if index >= chars.len() {
            break;
        }
        let mut depth = 0i32;
        let mut end = index;
        while end < chars.len() {
            if chars[end] == '{' {
                depth += 1;
            } else if chars[end] == '}' {
                depth -= 1;
                if depth == 0 {
                    entries.push(chars[start..=end].iter().collect());
                    index = end + 1;
                    break;
                }
            }
            end += 1;
        }
        if end >= chars.len() {
            break;
        }
    }
    entries
}

fn extract_braced(text: &str, start: usize) -> (String, usize) {
    let chars = text.chars().collect::<Vec<_>>();
    let mut depth = 0i32;
    let mut index = start;
    let mut content = String::new();
    while index < chars.len() {
        let ch = chars[index];
        if ch == '{' {
            depth += 1;
            if depth > 1 {
                content.push(ch);
            }
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return (content, index + 1);
            }
            content.push(ch);
        } else {
            content.push(ch);
        }
        index += 1;
    }
    (content, chars.len())
}

fn extract_bibtex_value(text: &str, mut index: usize) -> (String, usize) {
    let chars = text.chars().collect::<Vec<_>>();
    let mut value = String::new();
    while index < chars.len() {
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        if index >= chars.len() {
            break;
        }
        match chars[index] {
            '{' => {
                let (content, end) = extract_braced(text, index);
                value.push_str(&content);
                index = end;
            }
            '"' => {
                index += 1;
                let start = index;
                let mut depth = 0i32;
                while index < chars.len() {
                    if chars[index] == '{' {
                        depth += 1;
                    } else if chars[index] == '}' {
                        depth -= 1;
                    } else if chars[index] == '"' && depth == 0 {
                        break;
                    }
                    index += 1;
                }
                value.push_str(&text[start..index]);
                index += 1;
            }
            ch if ch.is_ascii_digit() => {
                let start = index;
                while index < chars.len() && chars[index].is_ascii_digit() {
                    index += 1;
                }
                value.push_str(&text[start..index]);
            }
            _ => break,
        }
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        if index < chars.len() && chars[index] == '#' {
            index += 1;
            continue;
        }
        break;
    }
    (value, index)
}

fn parse_bibtex_fields(body: &str) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    let chars = body.chars().collect::<Vec<_>>();
    let mut index = 0;
    while index < chars.len() {
        while index < chars.len() && (chars[index].is_whitespace() || chars[index] == ',') {
            index += 1;
        }
        if index >= chars.len() {
            break;
        }
        let start = index;
        while index < chars.len()
            && (chars[index].is_ascii_alphanumeric() || chars[index] == '_' || chars[index] == '-')
        {
            index += 1;
        }
        if start == index {
            index += 1;
            continue;
        }
        let name = body[start..index].to_lowercase();
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        if index >= chars.len() || chars[index] != '=' {
            continue;
        }
        index += 1;
        let (value, end) = extract_bibtex_value(body, index);
        index = end;
        fields.push((name, value));
    }
    fields
}

fn parse_bibtex_authors(value: &str) -> Vec<Value> {
    value
        .split(" and ")
        .map(str::trim)
        .filter(|author| !author.is_empty())
        .map(|author| {
            if author.contains(',') {
                let mut parts = author.splitn(2, ',');
                json!({
                    "family": parts.next().unwrap_or_default().trim(),
                    "given": parts.next().unwrap_or_default().trim(),
                })
            } else {
                let parts = author.split_whitespace().collect::<Vec<_>>();
                json!({
                    "family": parts.last().copied().unwrap_or(author),
                    "given": parts[..parts.len().saturating_sub(1)].join(" "),
                })
            }
        })
        .collect()
}

fn parse_bibtex_text(content: &str) -> Vec<Value> {
    let mut results = Vec::new();
    for entry in parse_bibtex_entries(content) {
        let Some(header_end) = entry.find('{') else {
            continue;
        };
        let Some(first_comma) = entry.find(',') else {
            continue;
        };
        let entry_type = entry[1..header_end].trim().to_lowercase();
        if matches!(entry_type.as_str(), "string" | "preamble" | "comment") {
            continue;
        }
        let key = entry[header_end + 1..first_comma].trim();
        let body = &entry[first_comma + 1..entry.len().saturating_sub(1)];
        let fields = parse_bibtex_fields(body);
        let mut csl = json!({
            "id": key,
            "_key": key,
            "type": match entry_type.as_str() {
                "article" => "article-journal",
                "inproceedings" | "conference" => "paper-conference",
                "book" => "book",
                "incollection" | "inbook" => "chapter",
                "phdthesis" | "mastersthesis" => "thesis",
                "techreport" => "report",
                "unpublished" => "manuscript",
                _ => "article",
            }
        });
        for (name, value) in fields {
            match name.as_str() {
                "title" => csl["title"] = Value::String(normalize_whitespace(&value)),
                "author" => csl["author"] = Value::Array(parse_bibtex_authors(&value)),
                "year" => {
                    if let Ok(year) = value.trim().parse::<i64>() {
                        csl["issued"] = json!({ "date-parts": [[year]] });
                    }
                }
                "journal" | "journaltitle" | "booktitle" => {
                    csl["container-title"] = Value::String(normalize_whitespace(&value));
                }
                "volume" => csl["volume"] = Value::String(normalize_whitespace(&value)),
                "number" | "issue" => csl["issue"] = Value::String(normalize_whitespace(&value)),
                "pages" => {
                    csl["page"] = Value::String(normalize_whitespace(&value).replace("--", "-"))
                }
                "doi" => csl["DOI"] = Value::String(normalize_whitespace(&value)),
                "url" => csl["URL"] = Value::String(normalize_whitespace(&value)),
                "publisher" => csl["publisher"] = Value::String(normalize_whitespace(&value)),
                "abstract" => csl["abstract"] = Value::String(normalize_whitespace(&value)),
                "keywords" => {
                    csl["_tags"] = Value::Array(
                        value
                            .split([',', ';'])
                            .map(str::trim)
                            .filter(|tag| !tag.is_empty())
                            .map(|tag| Value::String(tag.to_string()))
                            .collect(),
                    );
                }
                _ => {}
            }
        }
        results.push(csl_to_reference_record(&csl));
    }
    results
}

fn parse_ris_name(value: &str) -> Value {
    let normalized = value.trim();
    if normalized.contains(',') {
        let mut parts = normalized.splitn(2, ',');
        json!({
            "family": parts.next().unwrap_or_default().trim(),
            "given": parts.next().unwrap_or_default().trim(),
        })
    } else {
        let parts = normalized.split_whitespace().collect::<Vec<_>>();
        json!({
            "family": parts.last().copied().unwrap_or(normalized),
            "given": parts[..parts.len().saturating_sub(1)].join(" "),
        })
    }
}

fn parse_ris_text(content: &str) -> Vec<Value> {
    let blocks = content.split("\nER  -").collect::<Vec<_>>();
    let mut results = Vec::new();
    for block in blocks {
        let trimmed = block.trim();
        if trimmed.is_empty() || !trimmed.contains("TY  -") {
            continue;
        }
        let mut fields: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        let mut last_tag = String::new();
        for line in trimmed.lines() {
            if line.len() >= 6
                && line.as_bytes()[2] == b' '
                && line.as_bytes()[3] == b' '
                && line.as_bytes()[4] == b'-'
            {
                let tag = line[..2].trim().to_string();
                let value = line[6..].trim().to_string();
                last_tag = tag.clone();
                fields.entry(tag).or_default().push(value);
            } else if !last_tag.is_empty() && !line.trim().is_empty() {
                if let Some(values) = fields.get_mut(&last_tag) {
                    if let Some(last) = values.last_mut() {
                        last.push(' ');
                        last.push_str(line.trim());
                    }
                }
            }
        }

        let ty = fields
            .get("TY")
            .and_then(|values| values.first())
            .map(String::as_str)
            .unwrap_or("GEN");
        let csl_type = match ty {
            "JOUR" => "article-journal",
            "BOOK" => "book",
            "CHAP" => "chapter",
            "CONF" => "paper-conference",
            "RPRT" => "report",
            "THES" => "thesis",
            _ => "article",
        };
        let title = fields
            .get("TI")
            .and_then(|values| values.first())
            .or_else(|| fields.get("T1").and_then(|values| values.first()))
            .cloned()
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let authors = fields
            .get("AU")
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .chain(fields.get("A1").cloned().unwrap_or_default())
            .map(|author| parse_ris_name(&author))
            .collect::<Vec<_>>();
        let container = fields
            .get("JO")
            .and_then(|values| values.first())
            .or_else(|| fields.get("JF").and_then(|values| values.first()))
            .or_else(|| fields.get("T2").and_then(|values| values.first()))
            .cloned()
            .unwrap_or_default();
        let year = fields
            .get("PY")
            .and_then(|values| values.first())
            .and_then(|value| value.parse::<i64>().ok());
        let doi = fields
            .get("DO")
            .and_then(|values| values.first())
            .map(|value| normalize_doi(value))
            .unwrap_or_default();
        let mut csl = json!({
            "type": csl_type,
            "title": title,
            "author": authors,
            "container-title": container,
            "volume": fields.get("VL").and_then(|values| values.first()).cloned().unwrap_or_default(),
            "issue": fields.get("IS").and_then(|values| values.first()).cloned().unwrap_or_default(),
            "DOI": doi,
        });
        if let Some(year) = year {
            csl["issued"] = json!({ "date-parts": [[year]] });
        }
        if let Some(start_page) = fields.get("SP").and_then(|values| values.first()) {
            let page = if let Some(end_page) = fields.get("EP").and_then(|values| values.first()) {
                format!("{start_page}-{end_page}")
            } else {
                start_page.clone()
            };
            csl["page"] = Value::String(page);
        }
        if let Some(url) = fields.get("UR").and_then(|values| values.first()) {
            csl["URL"] = Value::String(url.clone());
        }
        if let Some(abstract_text) = fields
            .get("AB")
            .and_then(|values| values.first())
            .or_else(|| fields.get("N2").and_then(|values| values.first()))
        {
            csl["abstract"] = Value::String(abstract_text.clone());
        }
        results.push(csl_to_reference_record(&csl));
    }
    results
}

fn parse_csl_json_text(content: &str) -> Vec<Value> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let parsed: Value = match serde_json::from_str(trimmed) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let items = if let Some(items) = parsed.as_array() {
        items.clone()
    } else if let Some(items) = parsed.get("items").and_then(Value::as_array) {
        items.clone()
    } else {
        vec![parsed]
    };
    items
        .into_iter()
        .map(|item| csl_to_reference_record(&item))
        .collect()
}

fn detect_reference_import_format(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return "unknown".to_string();
    }
    if trimmed.starts_with('@') {
        return "bibtex".to_string();
    }
    if trimmed.contains("TY  -") {
        return "ris".to_string();
    }
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return "csl-json".to_string();
    }
    "unknown".to_string()
}

fn parse_reference_import_text(content: &str, format: &str) -> Vec<Value> {
    let effective = if format.trim().is_empty() || format == "auto" {
        detect_reference_import_format(content)
    } else {
        format.to_string()
    };
    match effective.as_str() {
        "bibtex" => parse_bibtex_text(content),
        "ris" => parse_ris_text(content),
        "csl-json" => parse_csl_json_text(content),
        _ => Vec::new(),
    }
}

fn csl_type_to_bibtex_type(value: &str) -> &'static str {
    match value {
        "article-journal" | "article" => "article",
        "paper-conference" => "inproceedings",
        "book" => "book",
        "chapter" => "incollection",
        "thesis" => "phdthesis",
        "report" => "techreport",
        "manuscript" => "unpublished",
        _ => "misc",
    }
}

fn escape_bibtex(value: &str) -> String {
    value.replace('\n', " ").trim().to_string()
}

fn reference_record_to_csl(reference: &Value) -> Value {
    let authors = reference
        .get("authors")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|author| author.as_str().map(|value| value.to_string()))
        .map(|author| {
            let parts = author.split_whitespace().collect::<Vec<_>>();
            if parts.len() <= 1 {
                json!({ "family": author })
            } else {
                json!({
                    "family": parts.last().copied().unwrap_or(author.as_str()),
                    "given": parts[..parts.len().saturating_sub(1)].join(" "),
                })
            }
        })
        .collect::<Vec<_>>();
    let identifier = trim_string(reference.get("identifier"));
    let mut csl = json!({
        "id": trim_string(reference.get("citationKey")).if_empty_then(|| trim_string(reference.get("id"))),
        "_key": trim_string(reference.get("citationKey")).if_empty_then(|| trim_string(reference.get("id"))),
        "type": match normalize_reference_type_key(&trim_string(reference.get("typeKey"))).as_str() {
            "journal-article" => "article-journal",
            "conference-paper" => "paper-conference",
            "book" => "book",
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

async fn lookup_by_doi_internal(doi: &str) -> Result<Option<Value>, String> {
    let normalized = normalize_doi(doi);
    if normalized.is_empty() {
        return Ok(None);
    }
    if let Some(direct) = fetch_json(
        &format!("{CROSSREF_API}/{}", encode_uri_component(&normalized)),
        &[],
    )
    .await?
    {
        if trim_string(direct.get("status")) == "ok" {
            if let Some(message) = direct.get("message") {
                return Ok(Some(crossref_to_csl(message)));
            }
        }
    }
    if let Some(negotiated) = fetch_json(
        &format!("{DOI_API}/{}", encode_uri_component(&normalized)),
        &[("Accept", "application/vnd.citationstyles.csl+json")],
    )
    .await?
    {
        if negotiated.get("type").is_some() {
            return Ok(Some(negotiated));
        }
    }
    Ok(None)
}

async fn search_by_metadata_internal(
    title: &str,
    author: &str,
    year: Option<i64>,
) -> Result<Option<Value>, String> {
    let normalized_title = title.trim();
    if normalized_title.is_empty() {
        return Ok(None);
    }
    let mut params = vec![
        format!(
            "query.bibliographic={}",
            encode_uri_component(normalized_title)
        ),
        "rows=5".to_string(),
    ];
    if !author.trim().is_empty() {
        params.push(format!(
            "query.author={}",
            encode_uri_component(author.trim())
        ));
    }
    let Some(data) = fetch_json(&format!("{CROSSREF_API}?{}", params.join("&")), &[]).await? else {
        return Ok(None);
    };
    let items = data
        .get("message")
        .and_then(|message| message.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return Ok(None);
    }
    let mut best_score = 0.0;
    let mut best_match: Option<Value> = None;
    for item in items {
        let item_title = item
            .get("title")
            .and_then(Value::as_array)
            .and_then(|titles| titles.first())
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut score = title_similarity(normalized_title, item_title) * 0.5;
        if !author.trim().is_empty() {
            if item
                .get("author")
                .and_then(Value::as_array)
                .map(|authors| {
                    authors.iter().any(|candidate| {
                        let family = trim_string(candidate.get("family")).to_lowercase();
                        !family.is_empty()
                            && (family.contains(&author.to_lowercase())
                                || author.to_lowercase().contains(&family))
                    })
                })
                .unwrap_or(false)
            {
                score += 0.25;
            }
        }
        let matched_year = item
            .get("issued")
            .and_then(|issued| issued.get("date-parts"))
            .and_then(Value::as_array)
            .and_then(|parts| parts.first())
            .and_then(Value::as_array)
            .and_then(|parts| parts.first())
            .and_then(Value::as_i64)
            .or_else(|| {
                item.get("published")
                    .and_then(|published| published.get("date-parts"))
                    .and_then(Value::as_array)
                    .and_then(|parts| parts.first())
                    .and_then(Value::as_array)
                    .and_then(|parts| parts.first())
                    .and_then(Value::as_i64)
            });
        if let (Some(year), Some(matched_year)) = (year, matched_year) {
            if year == matched_year {
                score += 0.25;
            }
        }
        if score > best_score {
            best_score = score;
            best_match = Some(item);
        }
    }
    if best_score >= 0.6 {
        return Ok(best_match.map(|item| {
            json!({
                "csl": crossref_to_csl(&item),
                "score": best_score,
            })
        }));
    }
    Ok(None)
}

#[tauri::command]
pub async fn references_crossref_lookup_by_doi(
    params: CrossrefLookupParams,
) -> Result<Value, String> {
    Ok(lookup_by_doi_internal(&params.doi)
        .await?
        .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn references_crossref_search_by_metadata(
    params: CrossrefSearchParams,
) -> Result<Value, String> {
    Ok(
        search_by_metadata_internal(&params.title, &params.author, params.year)
            .await?
            .unwrap_or(Value::Null),
    )
}

#[tauri::command]
pub async fn references_import_parse_text(
    params: ReferenceImportTextParams,
) -> Result<Value, String> {
    Ok(Value::Array(parse_reference_import_text(
        &params.content,
        &params.format,
    )))
}

#[tauri::command]
pub async fn references_import_detect_format(
    params: ReferenceImportTextParams,
) -> Result<String, String> {
    Ok(detect_reference_import_format(&params.content))
}

#[tauri::command]
pub async fn references_import_from_text(
    params: ReferenceImportTextParams,
) -> Result<Value, String> {
    let trimmed = params.content.trim();
    if trimmed.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    if (trimmed.starts_with("10.")
        || trimmed.starts_with("https://doi.org/")
        || trimmed.starts_with("http://doi.org/"))
        && !trimmed.contains('\n')
    {
        if let Some(csl) = lookup_by_doi_internal(trimmed).await? {
            return Ok(Value::Array(vec![csl_to_reference_record(&csl)]));
        }
    }
    let parsed = parse_reference_import_text(trimmed, "auto");
    if !parsed.is_empty() {
        return Ok(Value::Array(parsed));
    }
    let lines = trimmed
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let doi_lines = lines
        .iter()
        .copied()
        .filter(|line| {
            line.starts_with("10.")
                || line.starts_with("https://doi.org/")
                || line.starts_with("http://doi.org/")
        })
        .collect::<Vec<_>>();
    if !doi_lines.is_empty() && doi_lines.len() == lines.len() {
        let mut resolved = Vec::new();
        for doi in doi_lines {
            if let Some(csl) = lookup_by_doi_internal(doi).await? {
                resolved.push(csl_to_reference_record(&csl));
            }
        }
        return Ok(Value::Array(resolved));
    }
    if let Some(match_result) = search_by_metadata_internal(trimmed, "", None).await? {
        if let Some(csl) = match_result.get("csl") {
            return Ok(Value::Array(vec![csl_to_reference_record(csl)]));
        }
    }
    Ok(Value::Array(Vec::new()))
}

#[tauri::command]
pub async fn references_export_bibtex(
    params: ReferenceBibtexExportParams,
) -> Result<String, String> {
    let entries = params
        .references
        .iter()
        .map(reference_record_to_csl)
        .filter_map(|csl| {
            let key = trim_string(csl.get("_key")).if_empty_then(|| trim_string(csl.get("id")));
            if key.is_empty() {
                return None;
            }
            let authors = csl
                .get("author")
                .and_then(Value::as_array)
                .map(|authors| {
                    authors
                        .iter()
                        .map(|author| {
                            let family = trim_string(author.get("family"));
                            let given = trim_string(author.get("given"));
                            if given.is_empty() {
                                family
                            } else {
                                format!("{family}, {given}").trim().to_string()
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" and ")
                })
                .unwrap_or_default();
            let mut fields = Vec::new();
            let title = trim_string(csl.get("title"));
            if !title.is_empty() {
                fields.push(format!("  title = {{{}}}", escape_bibtex(&title)));
            }
            if !authors.is_empty() {
                fields.push(format!("  author = {{{}}}", escape_bibtex(&authors)));
            }
            if let Some(year) = extract_csl_year(&csl) {
                fields.push(format!("  year = {{{year}}}"));
            }
            let container = trim_string(csl.get("container-title"));
            if !container.is_empty() {
                let field_name = if trim_string(csl.get("type")) == "paper-conference" {
                    "booktitle"
                } else {
                    "journal"
                };
                fields.push(format!(
                    "  {field_name} = {{{}}}",
                    escape_bibtex(&container)
                ));
            }
            let volume = trim_string(csl.get("volume"));
            if !volume.is_empty() {
                fields.push(format!("  volume = {{{}}}", escape_bibtex(&volume)));
            }
            let issue = trim_string(csl.get("issue"));
            if !issue.is_empty() {
                fields.push(format!("  number = {{{}}}", escape_bibtex(&issue)));
            }
            let page = trim_string(csl.get("page"));
            if !page.is_empty() {
                fields.push(format!(
                    "  pages = {{{}}}",
                    escape_bibtex(&page.replace('-', "--"))
                ));
            }
            let doi = trim_string(csl.get("DOI"));
            if !doi.is_empty() {
                fields.push(format!("  doi = {{{}}}", escape_bibtex(&doi)));
            }
            let url = trim_string(csl.get("URL"));
            if !url.is_empty() {
                fields.push(format!("  url = {{{}}}", escape_bibtex(&url)));
            }
            let publisher = trim_string(csl.get("publisher"));
            if !publisher.is_empty() {
                fields.push(format!("  publisher = {{{}}}", escape_bibtex(&publisher)));
            }
            let abstract_text = trim_string(csl.get("abstract"));
            if !abstract_text.is_empty() {
                fields.push(format!(
                    "  abstract = {{{}}}",
                    escape_bibtex(&abstract_text)
                ));
            }
            Some(format!(
                "@{}{key},\n{}\n}}",
                csl_type_to_bibtex_type(&trim_string(csl.get("type"))),
                fields.join(",\n")
            ))
        })
        .collect::<Vec<_>>();
    Ok(entries.join("\n\n"))
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
