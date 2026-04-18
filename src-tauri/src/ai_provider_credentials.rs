use serde_json::{json, Value};

use crate::ai_config::{
    normalize_ai_config, normalize_ai_provider_id, read_ai_config_raw, write_ai_config_raw,
};

const SERVICE_NAME: &str = "Altals";
const LEGACY_AI_KEYCHAIN_KEY: &str = "ai-api-key";

fn resolve_ai_keychain_key(provider_id: &str) -> &'static str {
    match normalize_ai_provider_id(provider_id).as_str() {
        "anthropic" => "ai-api-key-anthropic",
        "openai" => "ai-api-key-openai",
        "google" => "ai-api-key-google",
        "deepseek" => "ai-api-key-deepseek",
        "glm" => "ai-api-key-glm",
        "kimi" => "ai-api-key-kimi",
        "minimax" => "ai-api-key-minimax",
        _ => "ai-api-key-custom",
    }
}

fn read_keychain(key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_keychain(key: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(|error| error.to_string())?;
    entry.set_password(value).map_err(|error| error.to_string())
}

fn delete_keychain(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, key).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn persist_ai_credential_fallback(
    provider_id: &str,
    api_key: &str,
    credential_storage: &str,
) -> Result<(), String> {
    let raw_config = normalize_ai_config(read_ai_config_raw()?.as_ref());
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    let mut next_fallbacks = raw_config["_apiKeyFallbacks"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let mut next_storage = raw_config["_credentialStorage"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let trimmed_key = api_key.trim();

    if trimmed_key.is_empty() {
        next_fallbacks.remove(&normalized_provider_id);
        next_storage.remove(&normalized_provider_id);
    } else {
        next_fallbacks.insert(
            normalized_provider_id.clone(),
            Value::String(trimmed_key.to_string()),
        );
        next_storage.insert(
            normalized_provider_id,
            Value::String(if credential_storage.trim().is_empty() {
                "mirrored-file-fallback".to_string()
            } else {
                credential_storage.trim().to_string()
            }),
        );
    }

    let next = json!({
        "version": raw_config["version"].clone(),
        "currentProviderId": raw_config["currentProviderId"].clone(),
        "enabledTools": raw_config["enabledTools"].clone(),
        "providers": raw_config["providers"].clone(),
        "_apiKeyFallbacks": next_fallbacks,
        "_credentialStorage": next_storage,
    });
    write_ai_config_raw(Some(&next))
}

fn migrate_legacy_openai_keychain_value() -> Result<Option<String>, String> {
    let Some(legacy_value) = read_keychain(LEGACY_AI_KEYCHAIN_KEY)? else {
        return Ok(None);
    };
    let _ = write_keychain(resolve_ai_keychain_key("openai"), &legacy_value);
    let _ = delete_keychain(LEGACY_AI_KEYCHAIN_KEY);
    Ok(Some(legacy_value))
}

pub(crate) fn load_ai_provider_api_key_internal(provider_id: &str) -> Result<Option<String>, String> {
    let normalized_provider_id = normalize_ai_provider_id(provider_id);
    let keychain_key = resolve_ai_keychain_key(&normalized_provider_id);
    if let Some(value) = read_keychain(keychain_key)? {
        return Ok(Some(value));
    }

    if normalized_provider_id == "openai" {
        if let Some(value) = migrate_legacy_openai_keychain_value()? {
            return Ok(Some(value));
        }
    }

    let raw_config = normalize_ai_config(read_ai_config_raw()?.as_ref());
    let value = raw_config["_apiKeyFallbacks"]
        .get(&normalized_provider_id)
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());
    Ok(value)
}

#[tauri::command]
pub async fn ai_provider_api_key_load(provider_id: String) -> Result<Option<String>, String> {
    load_ai_provider_api_key_internal(&provider_id)
}

#[tauri::command]
pub async fn ai_provider_api_key_store(provider_id: String, api_key: String) -> Result<(), String> {
    let normalized_provider_id = normalize_ai_provider_id(&provider_id);
    let trimmed_key = api_key.trim();
    if trimmed_key.is_empty() {
        return ai_provider_api_key_clear(normalized_provider_id).await;
    }

    persist_ai_credential_fallback(
        &normalized_provider_id,
        trimmed_key,
        "mirrored-file-fallback",
    )?;
    write_keychain(
        resolve_ai_keychain_key(&normalized_provider_id),
        trimmed_key,
    )
}

#[tauri::command]
pub async fn ai_provider_api_key_clear(provider_id: String) -> Result<(), String> {
    let normalized_provider_id = normalize_ai_provider_id(&provider_id);
    delete_keychain(resolve_ai_keychain_key(&normalized_provider_id))?;
    if normalized_provider_id == "openai" {
        let _ = delete_keychain(LEGACY_AI_KEYCHAIN_KEY);
    }
    persist_ai_credential_fallback(&normalized_provider_id, "", "")
}
