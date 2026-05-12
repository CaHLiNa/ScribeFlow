use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

static ZH_MESSAGES: OnceLock<HashMap<String, String>> = OnceLock::new();
static MESSAGE_KEY_ALIASES: OnceLock<HashMap<String, String>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct I18nRuntimePayload {
    locale: String,
    system_locale: String,
    aliases: HashMap<String, String>,
    messages: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct I18nRuntimeLoadParams {
    #[serde(default)]
    preferred_locale: String,
}

fn string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn i18n_runtime_load_params_from_payload(params: Value) -> I18nRuntimeLoadParams {
    I18nRuntimeLoadParams {
        preferred_locale: string_payload_field(&params, "preferredLocale", "preferred_locale"),
    }
}

pub fn normalize_locale(value: &str) -> String {
    if value.trim().to_ascii_lowercase().starts_with("zh") {
        "zh-CN".to_string()
    } else {
        "en-US".to_string()
    }
}

pub fn normalize_locale_preference(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "zh" | "zh-cn" => "zh-CN".to_string(),
        "en" | "en-us" => "en-US".to_string(),
        _ => "system".to_string(),
    }
}

pub fn detect_system_locale() -> String {
    std::env::var("LC_ALL")
        .ok()
        .or_else(|| std::env::var("LC_MESSAGES").ok())
        .or_else(|| std::env::var("LANG").ok())
        .map(|value| normalize_locale(&value))
        .unwrap_or_else(|| "en-US".to_string())
}

pub fn resolve_effective_locale(preferred_locale: &str) -> String {
    let preferred_locale = normalize_locale_preference(preferred_locale);
    if preferred_locale == "system" {
        detect_system_locale()
    } else {
        preferred_locale
    }
}

fn load_messages() -> &'static HashMap<String, String> {
    ZH_MESSAGES.get_or_init(|| {
        serde_json::from_str(include_str!("../resources/i18n/zh-CN.json"))
            .expect("embedded zh-CN i18n bundle must be valid JSON")
    })
}

fn load_aliases() -> &'static HashMap<String, String> {
    MESSAGE_KEY_ALIASES.get_or_init(|| {
        serde_json::from_str(include_str!("../resources/i18n/aliases.json"))
            .expect("embedded i18n aliases must be valid JSON")
    })
}

#[tauri::command]
pub async fn i18n_runtime_load(params: Value) -> Result<I18nRuntimePayload, String> {
    let params = i18n_runtime_load_params_from_payload(params);
    let system_locale = detect_system_locale();
    let locale = resolve_effective_locale(&params.preferred_locale);

    let messages = if locale == "zh-CN" {
        load_messages().clone()
    } else {
        HashMap::new()
    };

    Ok(I18nRuntimePayload {
        locale,
        system_locale,
        aliases: load_aliases().clone(),
        messages,
    })
}

#[cfg(test)]
mod tests {
    use super::i18n_runtime_load_params_from_payload;

    #[test]
    fn i18n_runtime_params_normalize_raw_payloads() {
        let params = i18n_runtime_load_params_from_payload(serde_json::json!({
            "preferredLocale": " zh-CN "
        }));
        assert_eq!(params.preferred_locale, "zh-CN");

        let snake_params = i18n_runtime_load_params_from_payload(serde_json::json!({
            "preferred_locale": " en-US "
        }));
        assert_eq!(snake_params.preferred_locale, "en-US");

        let fallback_params = i18n_runtime_load_params_from_payload(serde_json::json!({
            "preferredLocale": 42
        }));
        assert_eq!(fallback_params.preferred_locale, "");

        let non_object = i18n_runtime_load_params_from_payload(serde_json::json!(false));
        assert_eq!(non_object.preferred_locale, "");
    }
}
