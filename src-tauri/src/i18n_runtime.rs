use serde::Serialize;
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

fn normalize_locale(value: &str) -> String {
    if value.trim().to_ascii_lowercase().starts_with("zh") {
        "zh-CN".to_string()
    } else {
        "en-US".to_string()
    }
}

fn normalize_locale_preference(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "zh" | "zh-cn" => "zh-CN".to_string(),
        "en" | "en-us" => "en-US".to_string(),
        _ => "system".to_string(),
    }
}

fn detect_system_locale() -> String {
    std::env::var("LC_ALL")
        .ok()
        .or_else(|| std::env::var("LC_MESSAGES").ok())
        .or_else(|| std::env::var("LANG").ok())
        .map(|value| normalize_locale(&value))
        .unwrap_or_else(|| "en-US".to_string())
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
pub async fn i18n_runtime_load(
    params: Option<I18nRuntimeLoadParams>,
) -> Result<I18nRuntimePayload, String> {
    let system_locale = detect_system_locale();
    let preferred_locale =
        normalize_locale_preference(&params.unwrap_or_default().preferred_locale);
    let locale = if preferred_locale == "system" {
        system_locale.clone()
    } else {
        preferred_locale
    };

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
