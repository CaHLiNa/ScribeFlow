use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextChange {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

#[tauri::command]
pub async fn text_diff_compute_minimal_change(
    old_text: String,
    new_text: String,
) -> Result<Option<TextChange>, String> {
    if old_text == new_text {
        return Ok(None);
    }

    let old_bytes = old_text.as_bytes();
    let new_bytes = new_text.as_bytes();
    let min_len = old_bytes.len().min(new_bytes.len());

    let mut prefix_len = 0;
    while prefix_len < min_len && old_bytes[prefix_len] == new_bytes[prefix_len] {
        prefix_len += 1;
    }

    let mut suffix_len = 0;
    let max_suffix = min_len - prefix_len;
    while suffix_len < max_suffix
        && old_bytes[old_bytes.len() - 1 - suffix_len] == new_bytes[new_bytes.len() - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    Ok(Some(TextChange {
        from: prefix_len,
        to: old_text.len() - suffix_len,
        insert: new_text[prefix_len..new_text.len() - suffix_len].to_string(),
    }))
}
