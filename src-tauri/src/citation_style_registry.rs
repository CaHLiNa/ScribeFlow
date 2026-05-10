use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CitationStyleInfo {
    pub id: String,
    pub name: String,
    pub category: String,
    pub fast: bool,
}

const BUILTIN_STYLES: &[(&str, &str, &str)] = &[
    ("apa", "APA 7th Edition", "Author-date"),
    ("chicago", "Chicago Author-Date", "Author-date"),
    ("harvard", "Harvard", "Author-date"),
    ("ieee", "IEEE", "Numeric"),
    ("vancouver", "Vancouver", "Numeric"),
];

fn get_builtin_styles() -> Vec<CitationStyleInfo> {
    BUILTIN_STYLES
        .iter()
        .map(|(id, name, category)| CitationStyleInfo {
            id: id.to_string(),
            name: name.to_string(),
            category: category.to_string(),
            fast: true,
        })
        .collect()
}

fn find_style(style_id: &str) -> Option<CitationStyleInfo> {
    get_builtin_styles().into_iter().find(|s| s.id == style_id)
}

#[tauri::command]
pub async fn citation_style_normalize(style_id: String) -> Result<String, String> {
    let normalized = style_id.trim().to_string();
    if normalized.is_empty() {
        return Ok("apa".to_string());
    }
    match find_style(&normalized) {
        Some(info) => Ok(info.id),
        None => Ok("apa".to_string()),
    }
}

#[tauri::command]
pub async fn citation_style_get_info(style_id: String) -> Result<Option<CitationStyleInfo>, String> {
    Ok(find_style(&style_id))
}

#[tauri::command]
pub async fn citation_style_list_available() -> Result<Vec<CitationStyleInfo>, String> {
    Ok(get_builtin_styles())
}
