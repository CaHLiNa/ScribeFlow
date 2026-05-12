use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::keychain;

const ZOTERO_KEYCHAIN_KEY: &str = "zotero-api-key";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroAccountPathParams {
    pub global_config_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroAccountStoreParams {
    pub global_config_dir: String,
    #[serde(default)]
    pub api_key: String,
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn zotero_config_path(global_config_dir: &str) -> Option<PathBuf> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        return None;
    }
    Some(Path::new(&root).join("zotero.json"))
}

fn read_zotero_config_raw(global_config_dir: &str) -> Result<Option<Value>, String> {
    let Some(path) = zotero_config_path(global_config_dir) else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn write_zotero_config_raw(global_config_dir: &str, config: Option<Value>) -> Result<(), String> {
    let Some(path) = zotero_config_path(global_config_dir) else {
        return Ok(());
    };
    if let Some(config) = config {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let serialized =
            serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
        fs::write(&path, serialized).map_err(|error| error.to_string())?;
    } else {
        let _ = fs::remove_file(&path);
    }
    Ok(())
}

fn keychain_set(value: &str) -> Result<(), String> {
    keychain::keychain_set_entry(ZOTERO_KEYCHAIN_KEY, value)
}

fn keychain_get() -> Result<Option<String>, String> {
    keychain::keychain_get_entry(ZOTERO_KEYCHAIN_KEY)
}

fn keychain_delete() -> Result<(), String> {
    keychain::keychain_delete_entry(ZOTERO_KEYCHAIN_KEY)
}

fn merge_key_fallback(global_config_dir: &str, api_key: &str) -> Result<(), String> {
    let mut config = read_zotero_config_raw(global_config_dir)?
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    config.insert(
        "_apiKeyFallback".to_string(),
        Value::String(api_key.trim().to_string()),
    );
    config.insert(
        "_credentialStorage".to_string(),
        Value::String("mirrored-file-fallback".to_string()),
    );
    write_zotero_config_raw(global_config_dir, Some(Value::Object(config)))
}

pub(crate) fn store_zotero_api_key_string(
    global_config_dir: &str,
    api_key: &str,
) -> Result<(), String> {
    merge_key_fallback(global_config_dir, api_key)?;
    keychain_set(api_key.trim()).or_else(|_| Ok(()))
}

fn clear_key_fallback(global_config_dir: &str) -> Result<(), String> {
    let Some(existing) = read_zotero_config_raw(global_config_dir)? else {
        return Ok(());
    };
    let mut map: Map<String, Value> = existing.as_object().cloned().unwrap_or_default();
    map.remove("_apiKeyFallback");
    map.remove("_credentialStorage");
    write_zotero_config_raw(global_config_dir, Some(Value::Object(map)))
}

fn sanitize_zotero_config(config: &Value) -> Value {
    let mut map = config.as_object().cloned().unwrap_or_default();
    map.remove("_apiKeyFallback");
    map.remove("_credentialStorage");
    Value::Object(map)
}

fn build_zotero_account_state(config: Option<Value>, api_key: &str) -> Value {
    json!({
        "config": config
            .as_ref()
            .map(sanitize_zotero_config)
            .unwrap_or_else(|| json!({})),
        "hasApiKey": !api_key.trim().is_empty(),
    })
}

pub(crate) fn load_zotero_api_key_string(global_config_dir: &str) -> Result<String, String> {
    if let Some(value) = keychain_get()? {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    Ok(read_zotero_config_raw(global_config_dir)?
        .and_then(|config| {
            config
                .get("_apiKeyFallback")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
        .unwrap_or_default())
}

#[tauri::command]
pub async fn references_zotero_account_state_load(
    params: ZoteroAccountPathParams,
) -> Result<Value, String> {
    let config = read_zotero_config_raw(&params.global_config_dir)?;
    let api_key = load_zotero_api_key_string(&params.global_config_dir)?;
    Ok(build_zotero_account_state(config, &api_key))
}

#[tauri::command]
pub async fn references_zotero_api_key_store(
    params: ZoteroAccountStoreParams,
) -> Result<(), String> {
    store_zotero_api_key_string(&params.global_config_dir, &params.api_key)
}

#[tauri::command]
pub async fn references_zotero_api_key_load(
    params: ZoteroAccountPathParams,
) -> Result<Value, String> {
    let api_key = load_zotero_api_key_string(&params.global_config_dir)?;
    if api_key.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(Value::String(api_key))
    }
}

#[tauri::command]
pub async fn references_zotero_api_key_clear(
    params: ZoteroAccountPathParams,
) -> Result<(), String> {
    let _ = keychain_delete();
    clear_key_fallback(&params.global_config_dir)
}

#[tauri::command]
pub async fn references_zotero_disconnect(params: ZoteroAccountPathParams) -> Result<(), String> {
    let _ = keychain_delete();
    write_zotero_config_raw(&params.global_config_dir, None)
}

#[cfg(test)]
mod tests {
    use super::{
        build_zotero_account_state, keychain_delete, references_zotero_account_state_load,
        write_zotero_config_raw, ZoteroAccountPathParams,
    };
    use serde_json::json;
    use std::fs;

    fn temp_config_dir(prefix: &str) -> String {
        std::env::temp_dir()
            .join(format!("{prefix}-{}", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .to_string()
    }

    #[test]
    fn account_state_hides_secret_fields() {
        let state = build_zotero_account_state(
            Some(json!({
                "userId": "16788433",
                "username": "researcher",
                "_apiKeyFallback": "secret",
                "_credentialStorage": "mirrored-file-fallback"
            })),
            " secret ",
        );

        assert_eq!(
            state,
            json!({
                "config": {
                    "userId": "16788433",
                    "username": "researcher"
                },
                "hasApiKey": true
            })
        );
    }

    #[tokio::test]
    async fn account_state_load_uses_fallback_key_without_exposing_it() {
        let global_config_dir = temp_config_dir("scribeflow-zotero-account-state");
        let _ = keychain_delete();
        write_zotero_config_raw(
            &global_config_dir,
            Some(json!({
                "userId": "16788433",
                "autoSync": true,
                "_apiKeyFallback": "fallback-secret",
                "_credentialStorage": "mirrored-file-fallback"
            })),
        )
        .expect("write test zotero config");

        let state = references_zotero_account_state_load(ZoteroAccountPathParams {
            global_config_dir: global_config_dir.clone(),
        })
        .await
        .expect("load zotero account state");

        assert_eq!(
            state,
            json!({
                "config": {
                    "userId": "16788433",
                    "autoSync": true
                },
                "hasApiKey": true
            })
        );

        let _ = fs::remove_dir_all(global_config_dir);
    }

    #[tokio::test]
    async fn account_state_load_returns_empty_config_without_key() {
        let global_config_dir = temp_config_dir("scribeflow-zotero-empty-account-state");
        let _ = keychain_delete();

        let state = references_zotero_account_state_load(ZoteroAccountPathParams {
            global_config_dir: global_config_dir.clone(),
        })
        .await
        .expect("load empty zotero account state");

        assert_eq!(
            state,
            json!({
                "config": {},
                "hasApiKey": false
            })
        );

        let _ = fs::remove_dir_all(global_config_dir);
    }
}
