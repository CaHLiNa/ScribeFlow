use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextChange {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

#[tauri::command]
pub async fn text_diff_compute_minimal_change(params: Value) -> Result<Option<TextChange>, String> {
    let (old_text, new_text) = text_diff_params_from_payload(params);
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
        && old_bytes[old_bytes.len() - 1 - suffix_len]
            == new_bytes[new_bytes.len() - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    Ok(Some(TextChange {
        from: prefix_len,
        to: old_text.len() - suffix_len,
        insert: new_text[prefix_len..new_text.len() - suffix_len].to_string(),
    }))
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

fn text_diff_params_from_payload(params: Value) -> (String, String) {
    (
        string_payload_field(&params, "oldText"),
        string_payload_field(&params, "newText"),
    )
}

#[cfg(test)]
mod tests {
    use super::text_diff_params_from_payload;
    use serde_json::json;

    #[test]
    fn text_diff_params_normalize_raw_payloads() {
        let (old_text, new_text) = text_diff_params_from_payload(json!({
            "oldText": " alpha ",
            "newText": " alpha beta "
        }));
        assert_eq!(old_text, " alpha ");
        assert_eq!(new_text, " alpha beta ");

        let (missing_old, missing_new) = text_diff_params_from_payload(json!({
            "oldText": 42,
            "newText": false
        }));
        assert_eq!(missing_old, "");
        assert_eq!(missing_new, "");

        let (invalid_old, invalid_new) = text_diff_params_from_payload(json!(null));
        assert_eq!(invalid_old, "");
        assert_eq!(invalid_new, "");
    }
}
