use regex_lite::Regex;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

const CROSSREF_API: &str = "https://api.crossref.org/works";
const DOI_API: &str = "https://doi.org";
const CROSSREF_USER_AGENT: &str = "Altals/1.0 (desktop references runtime)";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceDuplicateParams {
    #[serde(default)]
    pub existing: Vec<Value>,
    #[serde(default)]
    pub candidate: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceMergeParams {
    #[serde(default)]
    pub existing: Vec<Value>,
    #[serde(default)]
    pub imported: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencePdfImportParams {
    #[serde(default)]
    pub file_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationStyleScanParams {
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceBibFileParams {
    #[serde(default)]
    pub tex_path: String,
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

fn normalized(value: Option<&Value>) -> String {
    trim_string(value).to_lowercase()
}

fn tokenize_title(value: &str) -> HashSet<String> {
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

fn extract_csl_year(csl: &Value) -> Option<i64> {
    csl.get("issued")
        .and_then(|issued| issued.get("date-parts"))
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_i64)
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

fn build_citation_key(csl: &Value) -> String {
    let explicit = trim_string(csl.get("_key")).if_empty_then(|| trim_string(csl.get("id")));
    if !explicit.is_empty() {
        return explicit;
    }

    let family = csl
        .get("author")
        .and_then(Value::as_array)
        .and_then(|authors| authors.first())
        .and_then(|author| author.get("family"))
        .and_then(Value::as_str)
        .unwrap_or("ref")
        .to_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>();
    let year = extract_csl_year(csl)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let candidate = format!(
        "{}{}",
        if family.is_empty() { "ref" } else { &family },
        year
    );
    if candidate.is_empty() {
        "ref".to_string()
    } else {
        candidate
    }
}

fn csl_to_reference_record(csl: &Value) -> Value {
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

fn reference_record_to_csl(reference: &Value) -> Value {
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

fn encode_uri_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

async fn fetch_json(url: &str, extra_headers: &[(&str, &str)]) -> Result<Option<Value>, String> {
    let headers = build_headers(extra_headers)?;
    let client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    let response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let text = response.text().await.map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
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
        if !author.trim().is_empty()
            && item
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
        let matched_year = item
            .get("issued")
            .and_then(|issued| issued.get("date-parts"))
            .and_then(Value::as_array)
            .and_then(|parts| parts.first())
            .and_then(Value::as_array)
            .and_then(|parts| parts.first())
            .and_then(Value::as_i64);
        if let (Some(left), Some(right)) = (year, matched_year) {
            if left == right {
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

fn extract_pdf_metadata_internal(path: &Path) -> Result<Value, String> {
    let extracted_text = pdf_extract::extract_text(path)
        .map_err(|error| format!("Failed to extract PDF text: {error}"))?;
    let first_text = extracted_text
        .lines()
        .take(120)
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    let title = first_text
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("Untitled")
                .to_string()
        });
    let doi = Regex::new(r"(?:doi[:\s]*|https?://doi\.org/)(10\.\d{4,9}/[^\s,;]+)")
        .ok()
        .and_then(|regex| regex.captures(&first_text))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string())
        .unwrap_or_default();
    let year = Regex::new(r"(19|20)\d{2}")
        .ok()
        .and_then(|regex| regex.find(&first_text))
        .and_then(|value| value.as_str().parse::<i64>().ok());

    Ok(json!({
        "firstText": first_text,
        "metadata": {
            "title": title,
            "author": "",
            "doi": doi,
            "year": year,
        }
    }))
}

fn build_fallback_pdf_reference(file_path: &str, first_text: &str, metadata: &Value) -> Value {
    let title = trim_string(metadata.get("title")).if_empty_then(|| {
        first_text
            .split('\n')
            .find(|line| !line.trim().is_empty())
            .map(|line| line.trim().to_string())
            .unwrap_or_else(|| {
                Path::new(file_path)
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            })
    });
    let author = trim_string(metadata.get("author"));
    let authors = if author.is_empty() {
        Vec::new()
    } else {
        author
            .split([';', ','])
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                let parts = value.split_whitespace().collect::<Vec<_>>();
                let family = parts.last().copied().unwrap_or(value).to_string();
                let given = if parts.len() > 1 {
                    parts[..parts.len() - 1].join(" ")
                } else {
                    String::new()
                };
                json!({ "family": family, "given": given })
            })
            .collect()
    };
    let year = metadata.get("year").and_then(Value::as_i64);
    let doi = trim_string(metadata.get("doi"));
    let mut csl = json!({
        "type": "article",
        "title": title,
        "author": authors,
        "DOI": doi,
    });
    if let Some(year) = year {
        csl["issued"] = json!({ "date-parts": [[year]] });
    }
    csl_to_reference_record(&csl)
}

fn find_duplicate_reference_internal(existing: &[Value], candidate: &Value) -> Option<Value> {
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

fn merge_imported_references_internal(existing: &[Value], imported: &[Value]) -> Vec<Value> {
    let mut merged = existing.to_vec();
    for candidate in imported {
        if find_duplicate_reference_internal(&merged, candidate).is_none() {
            merged.push(candidate.clone());
        }
    }
    merged
}

fn parse_csl_metadata(xml: &str, filename: &str) -> Value {
    let title = Regex::new(r"(?s)<title>(.*?)</title>")
        .ok()
        .and_then(|regex| regex.captures(xml))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Unknown Style".to_string());
    let raw_id = Regex::new(r"(?s)<id>(.*?)</id>")
        .ok()
        .and_then(|regex| regex.captures(xml))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .unwrap_or_default();
    let id = if !raw_id.is_empty() {
        raw_id
            .rsplit('/')
            .next()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(raw_id.as_str())
            .to_string()
    } else {
        filename.trim_end_matches(".csl").trim().to_string()
    };
    let category = Regex::new(r#"citation-format="([^"]+)""#)
        .ok()
        .and_then(|regex| regex.captures(xml))
        .and_then(|captures| captures.get(1))
        .map(|value| match value.as_str() {
            "author-date" => "Author-date".to_string(),
            "numeric" => "Numeric".to_string(),
            "note" => "Note".to_string(),
            "author" => "Author".to_string(),
            "label" => "Label".to_string(),
            other => other.to_string(),
        })
        .unwrap_or_else(|| "Custom".to_string());

    json!({
        "id": id,
        "name": title,
        "category": category,
        "filename": filename,
        "fast": false,
        "isCustom": true,
    })
}

fn render_bibtex(references: &[Value]) -> String {
    references
        .iter()
        .filter_map(|reference| {
            let csl = reference_record_to_csl(reference);
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
                                format!("{family}, {given}")
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" and ")
                })
                .unwrap_or_default();
            let mut fields = Vec::new();
            let title = trim_string(csl.get("title"));
            if !title.is_empty() {
                fields.push(format!("  title = {{{title}}}"));
            }
            if !authors.is_empty() {
                fields.push(format!("  author = {{{authors}}}"));
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
                fields.push(format!("  {field_name} = {{{container}}}"));
            }
            for (field, key_name) in [
                ("volume", "volume"),
                ("issue", "number"),
                ("publisher", "publisher"),
            ] {
                let value = trim_string(csl.get(field));
                if !value.is_empty() {
                    fields.push(format!("  {key_name} = {{{value}}}"));
                }
            }
            let pages = trim_string(csl.get("page"));
            if !pages.is_empty() {
                fields.push(format!("  pages = {{{}}}", pages.replace('-', "--")));
            }
            let doi = trim_string(csl.get("DOI"));
            if !doi.is_empty() {
                fields.push(format!("  doi = {{{doi}}}"));
            }
            let url = trim_string(csl.get("URL"));
            if !url.is_empty() {
                fields.push(format!("  url = {{{url}}}"));
            }

            let entry_type = match trim_string(csl.get("type")).as_str() {
                "article-journal" => "article",
                "paper-conference" => "inproceedings",
                "book" => "book",
                "chapter" => "incollection",
                "thesis" => "phdthesis",
                "report" => "techreport",
                _ => "misc",
            };
            Some(format!("@{entry_type}{{{key},\n{}\n}}", fields.join(",\n")))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[tauri::command]
pub async fn references_find_duplicate(params: ReferenceDuplicateParams) -> Result<Value, String> {
    Ok(
        find_duplicate_reference_internal(&params.existing, &params.candidate)
            .unwrap_or(Value::Null),
    )
}

#[tauri::command]
pub async fn references_merge_imported(params: ReferenceMergeParams) -> Result<Value, String> {
    Ok(Value::Array(merge_imported_references_internal(
        &params.existing,
        &params.imported,
    )))
}

#[tauri::command]
pub async fn references_import_pdf(params: ReferencePdfImportParams) -> Result<Value, String> {
    let normalized_path = params.file_path.trim();
    let path = Path::new(normalized_path);
    if !path.exists() {
        return Err(format!("PDF file not found: {}", path.display()));
    }

    let metadata_result = extract_pdf_metadata_internal(path)?;
    let first_text = trim_string(metadata_result.get("firstText"));
    let metadata = metadata_result
        .get("metadata")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let doi = trim_string(metadata.get("doi"));
    if !doi.is_empty() {
        if let Some(verified) = lookup_by_doi_internal(&doi).await? {
            return Ok(csl_to_reference_record(&verified));
        }
    }

    let title = trim_string(metadata.get("title")).if_empty_then(|| first_text.clone());
    let author = trim_string(metadata.get("author"));
    let year = metadata.get("year").and_then(Value::as_i64);
    if let Some(match_result) = search_by_metadata_internal(&title, &author, year).await? {
        if let Some(csl) = match_result.get("csl") {
            return Ok(csl_to_reference_record(csl));
        }
    }

    Ok(build_fallback_pdf_reference(
        normalized_path,
        &first_text,
        &metadata,
    ))
}

#[tauri::command]
pub async fn references_scan_workspace_styles(
    params: CitationStyleScanParams,
) -> Result<Value, String> {
    let workspace_path = params.workspace_path.trim();
    if workspace_path.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let styles_dir = Path::new(workspace_path).join("styles");
    if !styles_dir.exists() {
        return Ok(Value::Array(Vec::new()));
    }

    let mut styles = Vec::new();
    for entry in fs::read_dir(&styles_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("csl") {
            continue;
        }
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let xml = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        styles.push(parse_csl_metadata(&xml, &filename));
    }
    Ok(Value::Array(styles))
}

#[tauri::command]
pub async fn references_write_bib_file(params: ReferenceBibFileParams) -> Result<String, String> {
    let tex_path = params.tex_path.trim();
    if tex_path.is_empty() || !tex_path.contains('/') {
        return Ok(String::new());
    }
    let bib_path = format!(
        "{}/references.bib",
        tex_path
            .rsplit_once('/')
            .map(|(dir, _)| dir)
            .unwrap_or_default()
    );
    let header =
        "% Auto-generated by Altals from project reference library\n% Do not edit manually - changes will be overwritten on next compile\n\n";
    let body = render_bibtex(&params.references);
    let content = if body.trim().is_empty() {
        "% Auto-generated by Altals\n".to_string()
    } else {
        format!("{header}{body}\n")
    };
    if let Some(parent) = Path::new(&bib_path).parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&bib_path, content).map_err(|error| error.to_string())?;
    Ok(bib_path)
}

trait StringExt {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String;
}

impl StringExt for String {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String {
        if self.is_empty() {
            fallback()
        } else {
            self
        }
    }
}

