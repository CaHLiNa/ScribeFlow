use lopdf::{Document, Object, StringFormat};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const MAX_REFERENCE_PDF_BYTES: u64 = 250 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencePdfPathParams {
    pub file_path: String,
}

pub(crate) fn validate_reference_pdf_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("PDF file not found: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("PDF path is not a file: {}", path.display()));
    }
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err("Reference PDF source must be a .pdf file.".to_string());
    }

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_REFERENCE_PDF_BYTES {
        return Err("Reference PDF source is too large.".to_string());
    }

    Ok(())
}

fn decode_pdf_string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim().to_string()
}

fn object_to_string(object: Option<&Object>) -> String {
    match object {
        Some(Object::String(bytes, StringFormat::Literal))
        | Some(Object::String(bytes, StringFormat::Hexadecimal)) => decode_pdf_string(bytes),
        Some(Object::Name(bytes)) => decode_pdf_string(bytes),
        Some(Object::Integer(value)) => value.to_string(),
        Some(Object::Real(value)) => value.to_string(),
        _ => String::new(),
    }
}

fn read_info_dict(document: &Document) -> Option<lopdf::Dictionary> {
    let info_ref = document.trailer.get(b"Info").ok()?.as_reference().ok()?;
    document.get_dictionary(info_ref).ok().cloned()
}

fn extract_year(value: &str) -> Option<i64> {
    let digits = value
        .chars()
        .collect::<Vec<_>>()
        .windows(4)
        .find_map(|window| {
            let candidate = window.iter().collect::<String>();
            candidate.parse::<i64>().ok()
        })?;
    if (1000..=9999).contains(&digits) {
        Some(digits)
    } else {
        None
    }
}

fn extract_doi(value: &str) -> String {
    let lower = value.to_lowercase();
    if let Some(start) = lower.find("10.") {
        let candidate = value[start..]
            .chars()
            .take_while(|ch| {
                !ch.is_whitespace() && *ch != ',' && *ch != ';' && *ch != ')' && *ch != '>'
            })
            .collect::<String>();
        return candidate.trim_matches(['.', ';', ',', ')']).to_string();
    }
    String::new()
}

fn first_non_empty_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

#[tauri::command]
pub async fn references_pdf_extract_text(params: ReferencePdfPathParams) -> Result<String, String> {
    let path = Path::new(params.file_path.trim());
    validate_reference_pdf_path(path)?;
    pdf_extract::extract_text(path).map_err(|error| format!("Failed to extract PDF text: {error}"))
}

#[tauri::command]
pub async fn references_pdf_extract_metadata(
    params: ReferencePdfPathParams,
) -> Result<Value, String> {
    let normalized_path = params.file_path.trim();
    let path = Path::new(normalized_path);
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

    let mut title = String::new();
    let mut author = String::new();
    let mut doi = String::new();
    let mut year = None;

    if let Ok(document) = Document::load(path) {
        if let Some(info) = read_info_dict(&document) {
            title = object_to_string(info.get(b"Title").ok());
            author = object_to_string(info.get(b"Author").ok());
            let subject = object_to_string(info.get(b"Subject").ok());
            if doi.is_empty() {
                doi = extract_doi(&subject);
            }
            if year.is_none() {
                year = extract_year(&object_to_string(info.get(b"CreationDate").ok()));
            }
        }
    }

    if doi.is_empty() {
        doi = extract_doi(&first_text);
    }
    if title.is_empty() {
        title = first_non_empty_line(&extracted_text);
        if title.is_empty() {
            title = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("Untitled")
                .to_string();
        }
    }

    Ok(json!({
        "firstText": first_text,
        "metadata": {
            "title": title,
            "author": author,
            "doi": doi,
            "year": year,
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::validate_reference_pdf_path;
    use std::fs;

    #[test]
    fn reference_pdf_validation_rejects_non_pdf_files() {
        let temp_dir = std::env::temp_dir().join(format!(
            "scribeflow-reference-pdf-validation-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let txt_path = temp_dir.join("paper.txt");
        fs::write(&txt_path, "not a pdf").expect("write txt");

        let error = validate_reference_pdf_path(&txt_path).expect_err("non-pdf should be rejected");
        assert_eq!(error, "Reference PDF source must be a .pdf file.");

        fs::remove_dir_all(temp_dir).ok();
    }
}
