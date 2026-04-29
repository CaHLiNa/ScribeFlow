use regex_lite::Regex;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::references_merge::{
    find_duplicate_reference_internal, merge_imported_references_internal, title_similarity,
};
use crate::references_pdf::validate_reference_pdf_path;
use crate::references_snapshot::{
    csl_to_reference_record, extract_csl_year, normalize_reference_record, reference_record_to_csl,
    trim_string, StringExt,
};
use crate::security::{self, WorkspaceScopeState};

const CROSSREF_API: &str = "https://api.crossref.org/works";
const DOI_API: &str = "https://doi.org";
const CROSSREF_USER_AGENT: &str = "ScribeFlow/1.0 (desktop references runtime)";

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceFromCslParams {
    #[serde(default)]
    pub csl: Value,
    #[serde(default)]
    pub overrides: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceMetadataRefreshParams {
    #[serde(default)]
    pub reference: Value,
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

fn looks_like_doi(value: &str) -> bool {
    Regex::new(r"(?i)^10\.\d{4,9}/")
        .map(|regex| regex.is_match(value.trim()))
        .unwrap_or(false)
}

fn first_reference_author(reference: &Value) -> String {
    reference
        .get("authors")
        .and_then(Value::as_array)
        .and_then(|authors| authors.first())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| trim_string(reference.get("authorLine")))
}

fn reference_year(reference: &Value) -> Option<i64> {
    reference
        .get("year")
        .and_then(Value::as_i64)
        .or_else(|| trim_string(reference.get("year")).parse::<i64>().ok())
}

fn reference_metadata_refresh_overrides(reference: &Value) -> Value {
    let mut overrides = Map::new();
    for key in [
        "id",
        "citationKey",
        "pdfPath",
        "fulltextPath",
        "collections",
        "tags",
        "notes",
        "annotations",
        "hasPdf",
        "hasFullText",
        "_source",
        "_zoteroKey",
        "_zoteroLibrary",
        "_importMethod",
        "_pushedByApp",
        "_appPushPending",
    ] {
        if let Some(value) = reference.get(key) {
            overrides.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(overrides)
}

fn reference_record_from_csl_with_overrides(csl: &Value, overrides: &Value) -> Value {
    let mut map = csl_to_reference_record(csl)
        .as_object()
        .cloned()
        .unwrap_or_default();

    if let Some(overrides) = overrides.as_object() {
        for (key, value) in overrides {
            map.insert(key.clone(), value.clone());
        }
    }

    normalize_reference_record(&Value::Object(map))
}

fn refreshed_reference_from_csl(reference: &Value, csl: &Value) -> Value {
    reference_record_from_csl_with_overrides(csl, &reference_metadata_refresh_overrides(reference))
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
    validate_reference_pdf_path(path)?;
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
    validate_reference_pdf_path(path)?;

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
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<Value, String> {
    references_scan_workspace_styles_scoped(params, Some(scope_state.inner())).await
}

pub(crate) async fn references_scan_workspace_styles_scoped(
    params: CitationStyleScanParams,
    scope_state: Option<&WorkspaceScopeState>,
) -> Result<Value, String> {
    let workspace_path = params.workspace_path.trim();
    if workspace_path.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let workspace_root = match scope_state {
        Some(state) => security::ensure_allowed_workspace_path(state, Path::new(workspace_path))?,
        None => PathBuf::from(workspace_path),
    };
    let styles_dir = workspace_root.join("styles");
    if !styles_dir.exists() {
        return Ok(Value::Array(Vec::new()));
    }
    let styles_dir = match scope_state {
        Some(state) => security::ensure_allowed_workspace_path(state, &styles_dir)?,
        None => styles_dir,
    };

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
pub async fn references_write_bib_file(
    params: ReferenceBibFileParams,
    scope_state: tauri::State<'_, WorkspaceScopeState>,
) -> Result<String, String> {
    references_write_bib_file_scoped(params, Some(scope_state.inner())).await
}

async fn references_write_bib_file_scoped(
    params: ReferenceBibFileParams,
    scope_state: Option<&WorkspaceScopeState>,
) -> Result<String, String> {
    let tex_path = params.tex_path.trim();
    if tex_path.is_empty() {
        return Ok(String::new());
    }
    let tex_path = match scope_state {
        Some(state) => security::ensure_allowed_workspace_path(state, Path::new(tex_path))?,
        None => PathBuf::from(tex_path),
    };
    let Some(parent) = tex_path.parent() else {
        return Ok(String::new());
    };
    let bib_path = parent.join("references.bib");
    let bib_path = match scope_state {
        Some(state) => security::ensure_allowed_mutation_path(state, &bib_path)?,
        None => bib_path,
    };
    let header =
        "% Auto-generated by ScribeFlow from project reference library\n% Do not edit manually - changes will be overwritten on next compile\n\n";
    let body = render_bibtex(&params.references);
    let content = if body.trim().is_empty() {
        "% Auto-generated by ScribeFlow\n".to_string()
    } else {
        format!("{header}{body}\n")
    };
    if let Some(parent) = bib_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&bib_path, content).map_err(|error| error.to_string())?;
    Ok(bib_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn references_record_from_csl(params: ReferenceFromCslParams) -> Result<Value, String> {
    Ok(reference_record_from_csl_with_overrides(
        &params.csl,
        &params.overrides,
    ))
}

#[tauri::command]
pub async fn references_refresh_metadata(
    params: ReferenceMetadataRefreshParams,
) -> Result<Value, String> {
    let reference = normalize_reference_record(&params.reference);
    let identifier = normalize_doi(&trim_string(reference.get("identifier")));

    if looks_like_doi(&identifier) {
        if let Some(csl) = lookup_by_doi_internal(&identifier).await? {
            return Ok(refreshed_reference_from_csl(&reference, &csl));
        }
    }

    let title = trim_string(reference.get("title"));
    let author = first_reference_author(&reference);
    let year = reference_year(&reference);
    if let Some(match_result) = search_by_metadata_internal(&title, &author, year).await? {
        if let Some(csl) = match_result.get("csl") {
            return Ok(refreshed_reference_from_csl(&reference, csl));
        }
    }

    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::{
        reference_metadata_refresh_overrides, references_record_from_csl,
        references_scan_workspace_styles_scoped, references_write_bib_file_scoped,
        refreshed_reference_from_csl, CitationStyleScanParams, ReferenceBibFileParams,
        ReferenceFromCslParams,
    };
    use crate::security::{set_allowed_roots_internal, WorkspaceScopeState};
    use serde_json::json;
    use std::fs;

    #[tokio::test]
    async fn record_from_csl_preserves_overrides_and_normalizes_type() {
        let record = references_record_from_csl(ReferenceFromCslParams {
            csl: json!({
                "type": "article-journal",
                "title": "Hydrated",
                "author": [{ "given": "Ada", "family": "Lovelace" }],
                "DOI": "10.1000/test",
            }),
            overrides: json!({
                "id": "ref-custom",
                "citationKey": "lovelace2024",
                "tags": ["AI"],
                "collections": ["reading"]
            }),
        })
        .await
        .expect("record from csl");

        assert_eq!(record["id"].as_str(), Some("ref-custom"));
        assert_eq!(record["typeKey"].as_str(), Some("journal-article"));
        assert_eq!(record["citationKey"].as_str(), Some("lovelace2024"));
        assert_eq!(record["tags"].as_array().map(|v| v.len()), Some(1));
    }

    #[test]
    fn metadata_refresh_preserves_local_reference_state() {
        let existing = json!({
            "id": "ref-local",
            "citationKey": "local2024",
            "title": "Old Title",
            "authors": ["Local Author"],
            "pdfPath": "/tmp/local.pdf",
            "fulltextPath": "/tmp/local.txt",
            "collections": ["inbox"],
            "tags": ["keep"],
            "notes": [{ "id": "note-1", "body": "Local note" }],
            "annotations": [{ "id": "annotation-1" }],
            "hasPdf": true,
            "hasFullText": true,
            "_source": "zotero",
            "_zoteroKey": "ABC123",
            "_zoteroLibrary": "user:1",
            "_importMethod": "zotero",
            "_pushedByApp": true,
            "_appPushPending": false
        });
        let refreshed = refreshed_reference_from_csl(
            &existing,
            &json!({
                "type": "article-journal",
                "title": "New Crossref Title",
                "author": [{ "given": "Ada", "family": "Lovelace" }],
                "DOI": "10.1000/new",
                "issued": { "date-parts": [[2025]] }
            }),
        );

        assert_eq!(refreshed["title"].as_str(), Some("New Crossref Title"));
        assert_eq!(refreshed["id"].as_str(), Some("ref-local"));
        assert_eq!(refreshed["citationKey"].as_str(), Some("local2024"));
        assert_eq!(refreshed["pdfPath"].as_str(), Some("/tmp/local.pdf"));
        assert_eq!(refreshed["fulltextPath"].as_str(), Some("/tmp/local.txt"));
        assert_eq!(refreshed["collections"].as_array().map(Vec::len), Some(1));
        assert_eq!(refreshed["tags"].as_array().map(Vec::len), Some(1));
        assert_eq!(refreshed["notes"].as_array().map(Vec::len), Some(1));
        assert_eq!(refreshed["annotations"].as_array().map(Vec::len), Some(1));
        assert!(refreshed.get("rating").is_none());
        assert_eq!(refreshed["hasPdf"].as_bool(), Some(true));
        assert_eq!(refreshed["hasFullText"].as_bool(), Some(true));
        assert_eq!(refreshed["_source"].as_str(), Some("zotero"));
        assert_eq!(refreshed["_zoteroKey"].as_str(), Some("ABC123"));
        assert_eq!(refreshed["_zoteroLibrary"].as_str(), Some("user:1"));
        assert_eq!(refreshed["_importMethod"].as_str(), Some("zotero"));
        assert_eq!(refreshed["_pushedByApp"].as_bool(), Some(true));
        assert_eq!(refreshed["_appPushPending"].as_bool(), Some(false));
    }

    #[test]
    fn metadata_refresh_override_set_is_local_only() {
        let overrides = reference_metadata_refresh_overrides(&json!({
            "id": "ref-local",
            "title": "Remote-owned field should not be preserved",
            "citationKey": "local2024",
            "abstract": "Remote-owned abstract should not be preserved",
            "tags": ["keep"]
        }));

        assert!(overrides.get("id").is_some());
        assert!(overrides.get("citationKey").is_some());
        assert!(overrides.get("tags").is_some());
        assert!(overrides.get("title").is_none());
        assert!(overrides.get("abstract").is_none());
    }

    #[tokio::test]
    async fn scoped_reference_style_scan_rejects_outside_workspace() {
        let workspace_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-style-scope-{}",
            uuid::Uuid::new_v4()
        ));
        let outside_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-style-outside-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(workspace_dir.join("styles")).expect("create workspace styles dir");
        fs::create_dir_all(outside_dir.join("styles")).expect("create outside styles dir");
        fs::write(
            workspace_dir.join("styles").join("local.csl"),
            r#"<style citation-format="author-date"><info><title>Local Style</title><id>local-style</id></info></style>"#,
        )
        .expect("write style");

        let state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&state, &workspace_dir.to_string_lossy(), None, None, None)
            .expect("register workspace root");

        let result = references_scan_workspace_styles_scoped(
            CitationStyleScanParams {
                workspace_path: workspace_dir.to_string_lossy().to_string(),
            },
            Some(&state),
        )
        .await
        .expect("scan workspace styles");
        assert_eq!(result.as_array().map(Vec::len), Some(1));

        let error = references_scan_workspace_styles_scoped(
            CitationStyleScanParams {
                workspace_path: outside_dir.to_string_lossy().to_string(),
            },
            Some(&state),
        )
        .await
        .expect_err("outside workspace style scan should be rejected");
        assert!(error.starts_with("Path is outside the allowed workspace roots:"));

        fs::remove_dir_all(workspace_dir).ok();
        fs::remove_dir_all(outside_dir).ok();
    }

    #[tokio::test]
    async fn scoped_reference_bib_write_stays_with_tex_workspace() {
        let workspace_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-bib-scope-{}",
            uuid::Uuid::new_v4()
        ));
        let outside_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-bib-outside-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&workspace_dir).expect("create workspace dir");
        fs::create_dir_all(&outside_dir).expect("create outside dir");
        let tex_path = workspace_dir.join("main.tex");
        let outside_tex_path = outside_dir.join("main.tex");
        fs::write(&tex_path, "\\documentclass{article}").expect("write tex");
        fs::write(&outside_tex_path, "\\documentclass{article}").expect("write outside tex");

        let state = WorkspaceScopeState::default();
        set_allowed_roots_internal(&state, &workspace_dir.to_string_lossy(), None, None, None)
            .expect("register workspace root");

        let bib_path = references_write_bib_file_scoped(
            ReferenceBibFileParams {
                tex_path: tex_path.to_string_lossy().to_string(),
                references: vec![json!({
                    "id": "ref-1",
                    "citationKey": "lovelace2024",
                    "title": "Scoped References",
                    "authors": ["Ada Lovelace"],
                    "year": 2024,
                })],
            },
            Some(&state),
        )
        .await
        .expect("write scoped bib");
        assert!(bib_path.ends_with("references.bib"));
        let content = fs::read_to_string(&bib_path).expect("read generated bib");
        assert!(content.contains("lovelace2024"));

        let error = references_write_bib_file_scoped(
            ReferenceBibFileParams {
                tex_path: outside_tex_path.to_string_lossy().to_string(),
                references: Vec::new(),
            },
            Some(&state),
        )
        .await
        .expect_err("outside bib write should be rejected");
        assert!(error.starts_with("Path is outside the allowed workspace roots:"));

        fs::remove_dir_all(workspace_dir).ok();
        fs::remove_dir_all(outside_dir).ok();
    }
}
