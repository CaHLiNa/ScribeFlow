use serde::Deserialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};

const ZOTERO_KEYCHAIN_KEY: &str = "zotero-api-key";
const SERVICE_NAME: &str = "ScribeFlow";

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

fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE_NAME, ZOTERO_KEYCHAIN_KEY).map_err(|error| error.to_string())
}

fn keychain_set(value: &str) -> Result<(), String> {
    let entry = keychain_entry()?;
    entry.set_password(value).map_err(|error| error.to_string())
}

fn keychain_get() -> Result<Option<String>, String> {
    let entry = keychain_entry()?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn keychain_delete() -> Result<(), String> {
    let entry = keychain_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
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

fn clear_key_fallback(global_config_dir: &str) -> Result<(), String> {
    let Some(existing) = read_zotero_config_raw(global_config_dir)? else {
        return Ok(());
    };
    let mut map: Map<String, Value> = existing.as_object().cloned().unwrap_or_default();
    map.remove("_apiKeyFallback");
    map.remove("_credentialStorage");
    write_zotero_config_raw(global_config_dir, Some(Value::Object(map)))
}

#[tauri::command]
pub async fn references_zotero_api_key_store(
    params: ZoteroAccountStoreParams,
) -> Result<(), String> {
    merge_key_fallback(&params.global_config_dir, &params.api_key)?;
    keychain_set(params.api_key.trim()).or_else(|_| Ok(()))
}

#[tauri::command]
pub async fn references_zotero_api_key_load(
    params: ZoteroAccountPathParams,
) -> Result<Value, String> {
    if let Some(value) = keychain_get()? {
        if !value.trim().is_empty() {
            return Ok(Value::String(value));
        }
    }
    let fallback = read_zotero_config_raw(&params.global_config_dir)?
        .and_then(|config| {
            config
                .get("_apiKeyFallback")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
        .unwrap_or_default();
    if fallback.is_empty() {
        Ok(Value::Null)
    } else {
        Ok(Value::String(fallback))
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
