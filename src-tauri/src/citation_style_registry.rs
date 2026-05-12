use serde::Serialize;
use serde_json::Value;

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
pub async fn citation_style_normalize(params: Value) -> Result<String, String> {
    let style_id = citation_style_params_from_payload(params);
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
pub async fn citation_style_get_info(params: Value) -> Result<Option<CitationStyleInfo>, String> {
    let style_id = citation_style_params_from_payload(params);
    Ok(find_style(&style_id))
}

#[tauri::command]
pub async fn citation_style_list_available() -> Result<Vec<CitationStyleInfo>, String> {
    Ok(get_builtin_styles())
}

fn payload_field<'a>(params: &'a Value, key: &str) -> Option<&'a Value> {
    params.as_object().and_then(|object| object.get(key))
}

fn string_payload_field(params: &Value, key: &str) -> String {
    payload_field(params, key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn citation_style_params_from_payload(params: Value) -> String {
    string_payload_field(&params, "styleId")
}

#[cfg(test)]
mod tests {
    use super::citation_style_params_from_payload;
    use serde_json::json;

    #[test]
    fn citation_style_params_normalize_raw_payloads() {
        assert_eq!(
            citation_style_params_from_payload(json!({ "styleId": " ieee " })),
            " ieee "
        );
        assert_eq!(
            citation_style_params_from_payload(json!({ "styleId": 42 })),
            ""
        );
        assert_eq!(citation_style_params_from_payload(json!(false)), "");
    }
}
