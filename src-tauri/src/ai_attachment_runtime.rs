use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::fs_io::read_text_file_with_limit;

const TEXT_ATTACHMENT_MAX_BYTES: u64 = 64 * 1024;
const TEXT_ATTACHMENT_PREVIEW_CHARS: usize = 4000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAttachmentCreateParams {
    pub path: String,
    #[serde(default)]
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAttachmentRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub media_type: String,
    pub is_text: bool,
    pub content: String,
    pub truncated: bool,
    pub read_error: String,
}

fn basename_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string()
}

fn extname(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default()
}

fn detect_media_type(path: &str) -> &'static str {
    match extname(path).as_str() {
        "md" => "text/markdown",
        "txt" => "text/plain",
        "tex" => "text/x-tex",
        "bib" => "text/x-bibtex",
        "json" => "application/json",
        "js" => "text/javascript",
        "ts" => "text/typescript",
        "vue" => "text/x-vue",
        "py" => "text/x-python",
        "rs" => "text/x-rust",
        "yaml" | "yml" => "text/yaml",
        "csv" => "text/csv",
        "html" => "text/html",
        "css" => "text/css",
        "xml" => "application/xml",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn is_text_like_attachment(media_type: &str, path: &str) -> bool {
    media_type.starts_with("text/")
        || matches!(
            extname(path).as_str(),
            "md" | "txt"
                | "tex"
                | "bib"
                | "json"
                | "js"
                | "ts"
                | "vue"
                | "py"
                | "rs"
                | "yaml"
                | "yml"
                | "csv"
                | "html"
                | "css"
                | "xml"
        )
}

fn preview_text(value: &str, limit: usize) -> String {
    let normalized = value.trim();
    if normalized.is_empty() {
        return String::new();
    }
    if normalized.chars().count() <= limit {
        return normalized.to_string();
    }
    let preview = normalized.chars().take(limit).collect::<String>();
    format!("{}...", preview.trim_end())
}

#[tauri::command]
pub async fn ai_attachment_create(
    params: AiAttachmentCreateParams,
) -> Result<AiAttachmentRecord, String> {
    let normalized_path = params.path.trim().to_string();
    if normalized_path.is_empty() {
        return Err("Attachment path is required.".to_string());
    }

    let media_type = detect_media_type(&normalized_path).to_string();
    let is_text = is_text_like_attachment(&media_type, &normalized_path);
    let mut content = String::new();
    let mut read_error = String::new();

    if is_text {
        match read_text_file_with_limit(
            Path::new(&normalized_path),
            Some(TEXT_ATTACHMENT_MAX_BYTES),
        ) {
            Ok(value) => content = value,
            Err(error) => read_error = error,
        }
    }

    let preview = preview_text(&content, TEXT_ATTACHMENT_PREVIEW_CHARS);
    let trimmed_content = content.trim().to_string();
    let truncated = !trimmed_content.is_empty() && preview != trimmed_content;
    let workspace_path = params.workspace_path.trim();
    let relative_path = if !workspace_path.is_empty() && normalized_path.starts_with(workspace_path)
    {
        normalized_path[workspace_path.len()..]
            .trim_start_matches('/')
            .to_string()
    } else {
        String::new()
    };

    Ok(AiAttachmentRecord {
        id: format!("attachment:{}", uuid::Uuid::new_v4()),
        name: basename_path(&normalized_path),
        path: normalized_path,
        relative_path,
        media_type,
        is_text,
        content: preview,
        truncated,
        read_error,
    })
}
