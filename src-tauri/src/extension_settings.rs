use crate::app_dirs;
use crate::extension_registry::find_extension_entry;
use crate::extension_secret_settings::looks_like_secret_setting_key;
use crate::keychain;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const EXTENSION_SETTINGS_FILENAME: &str = "extension-settings.json";
const EXTENSION_RUNTIME_STATE_FILENAME: &str = "extension-runtime-state.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSettings {
    #[serde(default)]
    pub enabled_extension_ids: Vec<String>,
    #[serde(default)]
    pub extension_config: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRuntimeStateStore {
    #[serde(default)]
    pub global_state: BTreeMap<String, Value>,
    #[serde(default)]
    pub workspace_state: BTreeMap<String, BTreeMap<String, Value>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRuntimeStateSnapshot {
    #[serde(default)]
    pub global_state: Value,
    #[serde(default)]
    pub workspace_state: Value,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSettingsLoadResult {
    #[serde(flatten)]
    pub settings: ExtensionSettings,
    pub settings_exists: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSettingsLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub hydrate_secrets: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionSettingsSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub workspace_root: String,
    #[serde(default)]
    pub settings: ExtensionSettings,
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn secure_storage_keys_for_extension(
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    if normalized_extension_id.is_empty() {
        return Ok(keys);
    }

    if let Ok(entry) =
        find_extension_entry(global_config_dir, workspace_root, &normalized_extension_id)
    {
        if let Some(manifest) = entry.manifest.as_ref() {
            for (key, definition) in &manifest.contributes.configuration.properties {
                if definition.secure_storage {
                    let normalized_key = key.trim().to_string();
                    if !normalized_key.is_empty() {
                        keys.push(normalized_key);
                    }
                }
            }
        }
    }

    keys.sort();
    keys.dedup();
    Ok(keys)
}

fn extension_secret_storage_key(extension_id: &str, key: &str) -> String {
    format!(
        "extension-setting:{}:{}",
        extension_id.trim().to_ascii_lowercase(),
        key.trim()
    )
}

fn secret_keys_for_config(
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
    config: &serde_json::Map<String, Value>,
) -> Result<Vec<String>, String> {
    let declared =
        secure_storage_keys_for_extension(global_config_dir, workspace_root, extension_id)?;
    let mut keys = declared
        .into_iter()
        .filter(|key| config.contains_key(key))
        .collect::<Vec<_>>();
    keys.extend(
        config
            .keys()
            .filter(|key| looks_like_secret_setting_key(key))
            .cloned(),
    );
    keys.sort();
    keys.dedup();
    Ok(keys)
}

fn redact_secret_settings_for_disk(
    global_config_dir: &str,
    workspace_root: &str,
    settings: &mut ExtensionSettings,
) -> Result<(), String> {
    for (extension_id, config) in &mut settings.extension_config {
        let Some(config_map) = config.as_object_mut() else {
            continue;
        };
        let secret_keys =
            secret_keys_for_config(global_config_dir, workspace_root, extension_id, config_map)?;
        for key in secret_keys {
            let value = config_map.get(&key).cloned().unwrap_or(Value::Null);
            let storage_key = extension_secret_storage_key(extension_id, &key);

            match value {
                Value::String(text) => {
                    let normalized_value = text.trim().to_string();
                    if !normalized_value.is_empty() {
                        keychain::keychain_set_entry(&storage_key, &normalized_value)?;
                    }
                }
                Value::Null => {
                    let _ = keychain::keychain_delete_entry(&storage_key);
                }
                other => {
                    keychain::keychain_set_entry(&storage_key, &other.to_string())?;
                }
            }

            config_map.insert(key, Value::String(String::new()));
        }
    }
    Ok(())
}

fn hydrate_secret_settings_from_keychain(
    global_config_dir: &str,
    workspace_root: &str,
    settings: &mut ExtensionSettings,
) -> Result<(), String> {
    for (extension_id, config) in &mut settings.extension_config {
        let config_map = match config {
            Value::Object(map) => map,
            _ => continue,
        };
        let secret_keys =
            secret_keys_for_config(global_config_dir, workspace_root, extension_id, config_map)?;
        for key in secret_keys {
            let storage_key = extension_secret_storage_key(extension_id, &key);
            if let Some(value) = keychain::keychain_get_entry(&storage_key)? {
                config_map.insert(key, Value::String(value));
            }
        }
    }
    Ok(())
}

fn migrate_plaintext_secrets_to_keychain(
    global_config_dir: &str,
    workspace_root: &str,
    settings: &mut ExtensionSettings,
) -> Result<bool, String> {
    let mut changed = false;
    for (extension_id, config) in &mut settings.extension_config {
        let Some(config_map) = config.as_object_mut() else {
            continue;
        };
        let secret_keys =
            secret_keys_for_config(global_config_dir, workspace_root, extension_id, config_map)?;
        for key in secret_keys {
            let Some(value) = config_map.get(&key).cloned() else {
                continue;
            };
            let normalized_value = match value {
                Value::String(text) => text.trim().to_string(),
                Value::Null => String::new(),
                other => other.to_string(),
            };
            if normalized_value.is_empty() {
                continue;
            }
            let storage_key = extension_secret_storage_key(extension_id, &key);
            if keychain::keychain_get_entry(&storage_key)?.is_none() {
                keychain::keychain_set_entry(&storage_key, &normalized_value)?;
            }
            config_map.insert(key, Value::String(String::new()));
            changed = true;
        }
    }
    Ok(changed)
}

fn settings_file(global_config_dir: &str) -> Result<std::path::PathBuf, String> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        Ok(app_dirs::data_root_dir()?.join(EXTENSION_SETTINGS_FILENAME))
    } else {
        Ok(Path::new(&root).join(EXTENSION_SETTINGS_FILENAME))
    }
}

fn runtime_state_file(global_config_dir: &str) -> Result<std::path::PathBuf, String> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        Ok(app_dirs::data_root_dir()?.join(EXTENSION_RUNTIME_STATE_FILENAME))
    } else {
        Ok(Path::new(&root).join(EXTENSION_RUNTIME_STATE_FILENAME))
    }
}

fn normalize_settings(settings: ExtensionSettings) -> ExtensionSettings {
    let mut enabled_extension_ids = settings
        .enabled_extension_ids
        .into_iter()
        .map(|id| id.trim().to_ascii_lowercase())
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();
    enabled_extension_ids.sort();
    enabled_extension_ids.dedup();

    let extension_config = settings
        .extension_config
        .into_iter()
        .filter_map(|(extension_id, config)| {
            let extension_id = extension_id.trim().to_ascii_lowercase();
            if extension_id.is_empty() {
                None
            } else {
                Some((extension_id, config))
            }
        })
        .collect();

    ExtensionSettings {
        enabled_extension_ids,
        extension_config,
    }
}

fn normalize_state_value(value: Value) -> Value {
    if value.is_object() {
        value
    } else {
        Value::Object(Default::default())
    }
}

fn normalize_runtime_state_store(store: ExtensionRuntimeStateStore) -> ExtensionRuntimeStateStore {
    let global_state = store
        .global_state
        .into_iter()
        .map(|(extension_id, value)| {
            (
                extension_id.trim().to_ascii_lowercase(),
                normalize_state_value(value),
            )
        })
        .filter(|(extension_id, _)| !extension_id.is_empty())
        .collect();

    let workspace_state = store
        .workspace_state
        .into_iter()
        .filter_map(|(workspace_root, states)| {
            let normalized_workspace_root = workspace_root.trim().to_string();
            if normalized_workspace_root.is_empty() {
                return None;
            }
            let normalized_states = states
                .into_iter()
                .map(|(extension_id, value)| {
                    (
                        extension_id.trim().to_ascii_lowercase(),
                        normalize_state_value(value),
                    )
                })
                .filter(|(extension_id, _)| !extension_id.is_empty())
                .collect::<BTreeMap<_, _>>();
            Some((normalized_workspace_root, normalized_states))
        })
        .collect();

    ExtensionRuntimeStateStore {
        global_state,
        workspace_state,
    }
}

pub fn load_extension_settings(
    global_config_dir: &str,
    workspace_root: &str,
) -> Result<ExtensionSettings, String> {
    let path = settings_file(global_config_dir)?;
    if !path.exists() {
        return Ok(ExtensionSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<ExtensionSettings>(&content)
        .map_err(|error| format!("Failed to parse extension settings: {error}"))?;
    let mut normalized = normalize_settings(parsed);
    if migrate_plaintext_secrets_to_keychain(global_config_dir, workspace_root, &mut normalized)? {
        let path = settings_file(global_config_dir)?;
        let serialized = serde_json::to_string_pretty(&normalized)
            .map_err(|error| format!("Failed to serialize migrated extension settings: {error}"))?;
        fs::write(path, serialized).map_err(|error| error.to_string())?;
    }
    hydrate_secret_settings_from_keychain(global_config_dir, workspace_root, &mut normalized)?;
    Ok(normalized)
}

pub fn load_redacted_extension_settings(
    global_config_dir: &str,
) -> Result<ExtensionSettings, String> {
    let path = settings_file(global_config_dir)?;
    if !path.exists() {
        return Ok(ExtensionSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<ExtensionSettings>(&content)
        .map_err(|error| format!("Failed to parse extension settings: {error}"))?;
    Ok(normalize_settings(parsed))
}

pub fn load_extension_settings_with_state(
    global_config_dir: &str,
    workspace_root: &str,
    hydrate_secrets: bool,
) -> Result<ExtensionSettingsLoadResult, String> {
    let path = settings_file(global_config_dir)?;
    let settings_exists = path.exists();
    let settings = if hydrate_secrets {
        load_extension_settings(global_config_dir, workspace_root)?
    } else {
        load_redacted_extension_settings(global_config_dir)?
    };
    Ok(ExtensionSettingsLoadResult {
        settings,
        settings_exists,
    })
}

pub fn save_extension_settings(
    global_config_dir: &str,
    workspace_root: &str,
    settings: ExtensionSettings,
) -> Result<ExtensionSettings, String> {
    let mut normalized = normalize_settings(settings);
    redact_secret_settings_for_disk(global_config_dir, workspace_root, &mut normalized)?;
    let path = settings_file(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize extension settings: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())?;
    let mut hydrated = normalized;
    hydrate_secret_settings_from_keychain(global_config_dir, workspace_root, &mut hydrated)?;
    Ok(hydrated)
}

pub fn load_extension_runtime_state_store(
    global_config_dir: &str,
) -> Result<ExtensionRuntimeStateStore, String> {
    let path = runtime_state_file(global_config_dir)?;
    if !path.exists() {
        return Ok(ExtensionRuntimeStateStore::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<ExtensionRuntimeStateStore>(&content)
        .map_err(|error| format!("Failed to parse extension runtime state: {error}"))?;
    Ok(normalize_runtime_state_store(parsed))
}

pub fn save_extension_runtime_state_store(
    global_config_dir: &str,
    store: ExtensionRuntimeStateStore,
) -> Result<ExtensionRuntimeStateStore, String> {
    let normalized = normalize_runtime_state_store(store);
    let path = runtime_state_file(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize extension runtime state: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())?;
    Ok(normalized)
}

pub fn load_extension_runtime_state_snapshot(
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
) -> Result<ExtensionRuntimeStateSnapshot, String> {
    let store = load_extension_runtime_state_store(global_config_dir)?;
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    let normalized_workspace_root = workspace_root.trim().to_string();

    Ok(ExtensionRuntimeStateSnapshot {
        global_state: store
            .global_state
            .get(&normalized_extension_id)
            .cloned()
            .unwrap_or_else(|| Value::Object(Default::default())),
        workspace_state: store
            .workspace_state
            .get(&normalized_workspace_root)
            .and_then(|states| states.get(&normalized_extension_id))
            .cloned()
            .unwrap_or_else(|| Value::Object(Default::default())),
    })
}

pub fn save_extension_runtime_state_snapshot(
    global_config_dir: &str,
    workspace_root: &str,
    extension_id: &str,
    snapshot: ExtensionRuntimeStateSnapshot,
) -> Result<ExtensionRuntimeStateSnapshot, String> {
    let mut store = load_extension_runtime_state_store(global_config_dir)?;
    let normalized_extension_id = extension_id.trim().to_ascii_lowercase();
    let normalized_workspace_root = workspace_root.trim().to_string();

    store.global_state.insert(
        normalized_extension_id.clone(),
        normalize_state_value(snapshot.global_state.clone()),
    );
    if !normalized_workspace_root.is_empty() {
        store
            .workspace_state
            .entry(normalized_workspace_root)
            .or_default()
            .insert(
                normalized_extension_id,
                normalize_state_value(snapshot.workspace_state.clone()),
            );
    }
    save_extension_runtime_state_store(global_config_dir, store)?;
    Ok(ExtensionRuntimeStateSnapshot {
        global_state: normalize_state_value(snapshot.global_state),
        workspace_state: normalize_state_value(snapshot.workspace_state),
    })
}

#[tauri::command]
pub async fn extension_settings_load(
    params: ExtensionSettingsLoadParams,
) -> Result<ExtensionSettingsLoadResult, String> {
    load_extension_settings_with_state(
        &params.global_config_dir,
        &params.workspace_root,
        params.hydrate_secrets,
    )
}

#[tauri::command]
pub async fn extension_settings_save(
    params: ExtensionSettingsSaveParams,
) -> Result<ExtensionSettings, String> {
    save_extension_settings(
        &params.global_config_dir,
        &params.workspace_root,
        params.settings,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        load_extension_runtime_state_snapshot, load_extension_settings,
        load_extension_settings_with_state, save_extension_runtime_state_snapshot,
        save_extension_settings, ExtensionRuntimeStateSnapshot, ExtensionSettings,
    };
    use crate::keychain;
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::Path;

    fn write_test_extension_manifest(root: &Path, extension_id: &str, secure_key: &str) {
        let extension_dir = root.join("extensions").join(extension_id);
        fs::create_dir_all(&extension_dir).expect("extension dir");
        let manifest = serde_json::json!({
            "name": extension_id,
            "displayName": "Test Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "configuration": {
                    "properties": {
                        secure_key: {
                            "type": "string",
                            "default": "",
                            "secureStorage": true
                        }
                    }
                }
            }
        });
        fs::write(
            extension_dir.join("package.json"),
            serde_json::to_string_pretty(&manifest).expect("manifest json"),
        )
        .expect("write manifest");
    }

    fn write_workspace_test_extension_manifest(
        workspace_root: &Path,
        extension_id: &str,
        secure_key: &str,
    ) {
        let extension_dir = workspace_root
            .join(".scribeflow")
            .join("extensions")
            .join(extension_id);
        fs::create_dir_all(&extension_dir).expect("workspace extension dir");
        let manifest = serde_json::json!({
            "name": extension_id,
            "displayName": "Workspace Test Extension",
            "version": "0.1.0",
            "main": "./dist/extension.js",
            "contributes": {
                "configuration": {
                    "properties": {
                        secure_key: {
                            "type": "string",
                            "default": "",
                            "secureStorage": true
                        }
                    }
                }
            }
        });
        fs::write(
            extension_dir.join("package.json"),
            serde_json::to_string_pretty(&manifest).expect("workspace manifest json"),
        )
        .expect("write workspace manifest");
    }

    #[test]
    fn saves_normalized_extension_settings() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        let mut extension_config = BTreeMap::new();
        extension_config.insert(
            " Example-Pdf-Extension ".to_string(),
            serde_json::json!({"targetLang": "zh-CN"}),
        );
        let saved = save_extension_settings(
            &root.to_string_lossy(),
            "",
            ExtensionSettings {
                enabled_extension_ids: vec![
                    " Example-Pdf-Extension ".to_string(),
                    "example-pdf-extension".to_string(),
                ],
                extension_config,
            },
        )
        .expect("save");
        assert_eq!(
            saved.enabled_extension_ids,
            vec!["example-pdf-extension".to_string()]
        );
        assert_eq!(
            saved.extension_config.get("example-pdf-extension"),
            Some(&serde_json::json!({"targetLang": "zh-CN"}))
        );
        assert_eq!(
            load_extension_settings(&root.to_string_lossy(), "").expect("load"),
            saved
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn load_result_marks_missing_settings_file() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-missing-{}",
            uuid::Uuid::new_v4()
        ));
        let loaded =
            load_extension_settings_with_state(&root.to_string_lossy(), "", false).expect("load");
        assert!(!loaded.settings_exists);
        assert!(loaded.settings.enabled_extension_ids.is_empty());
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn runtime_state_snapshot_roundtrips() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-runtime-state-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");

        let saved = save_extension_runtime_state_snapshot(
            &root.to_string_lossy(),
            "/tmp/workspace-a",
            "Example-Pdf-Extension",
            ExtensionRuntimeStateSnapshot {
                global_state: serde_json::json!({"targetLang": "zh-CN"}),
                workspace_state: serde_json::json!({"lastTarget": "paper.pdf"}),
            },
        )
        .expect("save runtime state");

        assert_eq!(
            saved.global_state,
            serde_json::json!({"targetLang": "zh-CN"})
        );
        assert_eq!(
            saved.workspace_state,
            serde_json::json!({"lastTarget": "paper.pdf"})
        );

        let loaded = load_extension_runtime_state_snapshot(
            &root.to_string_lossy(),
            "/tmp/workspace-a",
            "example-pdf-extension",
        )
        .expect("load runtime state");

        assert_eq!(loaded, saved);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn secret_extension_settings_are_not_persisted_in_plaintext() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-secret-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        write_test_extension_manifest(&root, "example-pdf-extension", "opaqueCredential");

        let mut extension_config = BTreeMap::new();
        extension_config.insert(
            "example-pdf-extension".to_string(),
            serde_json::json!({
                "apiKey": "sk-secret",
                "targetLang": "zh-CN",
                "serviceToken": "tok-secret",
                "opaqueCredential": "opaque-secret"
            }),
        );

        let saved = save_extension_settings(
            &root.to_string_lossy(),
            "",
            ExtensionSettings {
                enabled_extension_ids: vec!["example-pdf-extension".to_string()],
                extension_config,
            },
        )
        .expect("save");

        assert_eq!(
            saved.extension_config.get("example-pdf-extension"),
            Some(&serde_json::json!({
                "apiKey": "sk-secret",
                "targetLang": "zh-CN",
                "serviceToken": "tok-secret",
                "opaqueCredential": "opaque-secret"
            }))
        );

        let file_content =
            fs::read_to_string(root.join("extension-settings.json")).expect("settings file");
        assert!(!file_content.contains("sk-secret"));
        assert!(!file_content.contains("tok-secret"));
        assert!(!file_content.contains("opaque-secret"));

        let raw = serde_json::from_str::<serde_json::Value>(&file_content).expect("raw json");
        let config = raw
            .get("extensionConfig")
            .and_then(|value| value.get("example-pdf-extension"))
            .and_then(|value| value.as_object())
            .cloned()
            .unwrap_or_default();
        assert_eq!(
            config.get("apiKey"),
            Some(&serde_json::Value::String(String::new()))
        );
        assert_eq!(
            config.get("serviceToken"),
            Some(&serde_json::Value::String(String::new()))
        );
        assert_eq!(
            config.get("opaqueCredential"),
            Some(&serde_json::Value::String(String::new()))
        );
        assert_eq!(
            keychain::keychain_get_entry("extension-setting:example-pdf-extension:apiKey")
                .expect("keychain api key"),
            Some("sk-secret".to_string())
        );
        assert_eq!(
            keychain::keychain_get_entry("extension-setting:example-pdf-extension:serviceToken")
                .expect("keychain token"),
            Some("tok-secret".to_string())
        );
        assert_eq!(
            keychain::keychain_get_entry(
                "extension-setting:example-pdf-extension:opaqueCredential"
            )
            .expect("keychain opaque credential"),
            Some("opaque-secret".to_string())
        );

        let redacted = load_extension_settings_with_state(&root.to_string_lossy(), "", false)
            .expect("load redacted");
        assert_eq!(
            redacted
                .settings
                .extension_config
                .get("example-pdf-extension"),
            Some(&serde_json::json!({
                "apiKey": "",
                "targetLang": "zh-CN",
                "serviceToken": "",
                "opaqueCredential": ""
            }))
        );

        let loaded = load_extension_settings(&root.to_string_lossy(), "").expect("load");
        assert_eq!(
            loaded.extension_config.get("example-pdf-extension"),
            Some(&serde_json::json!({
                "apiKey": "sk-secret",
                "targetLang": "zh-CN",
                "serviceToken": "tok-secret",
                "opaqueCredential": "opaque-secret"
            }))
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn workspace_extensions_honor_schema_declared_secure_storage() {
        let global_root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-workspace-global-{}",
            uuid::Uuid::new_v4()
        ));
        let workspace_root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-workspace-root-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&global_root).expect("global root");
        fs::create_dir_all(&workspace_root).expect("workspace root");
        write_workspace_test_extension_manifest(
            &workspace_root,
            "workspace-only-extension",
            "opaqueCredential",
        );

        let mut extension_config = BTreeMap::new();
        extension_config.insert(
            "workspace-only-extension".to_string(),
            serde_json::json!({
                "opaqueCredential": "workspace-secret",
                "targetLang": "en"
            }),
        );

        let saved = save_extension_settings(
            &global_root.to_string_lossy(),
            &workspace_root.to_string_lossy(),
            ExtensionSettings {
                enabled_extension_ids: vec!["workspace-only-extension".to_string()],
                extension_config,
            },
        )
        .expect("save workspace settings");

        assert_eq!(
            saved.extension_config.get("workspace-only-extension"),
            Some(&serde_json::json!({
                "opaqueCredential": "workspace-secret",
                "targetLang": "en"
            }))
        );

        let file_content = fs::read_to_string(global_root.join("extension-settings.json"))
            .expect("workspace settings file");
        assert!(!file_content.contains("workspace-secret"));

        let loaded = load_extension_settings(
            &global_root.to_string_lossy(),
            &workspace_root.to_string_lossy(),
        )
        .expect("load workspace settings");
        assert_eq!(
            loaded.extension_config.get("workspace-only-extension"),
            Some(&serde_json::json!({
                "opaqueCredential": "workspace-secret",
                "targetLang": "en"
            }))
        );

        fs::remove_dir_all(global_root).ok();
        fs::remove_dir_all(workspace_root).ok();
    }

    #[test]
    fn namespaced_extension_secrets_roundtrip_through_keychain() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-namespaced-secret-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        write_test_extension_manifest(&root, "retain-pdf", "retainPdf.modelApiKey");

        let mut extension_config = BTreeMap::new();
        extension_config.insert(
            "retain-pdf".to_string(),
            serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-v4-flash"
            }),
        );

        let saved = save_extension_settings(
            &root.to_string_lossy(),
            "",
            ExtensionSettings {
                enabled_extension_ids: vec!["retain-pdf".to_string()],
                extension_config,
            },
        )
        .expect("save retain pdf settings");

        assert_eq!(
            saved.extension_config.get("retain-pdf"),
            Some(&serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-v4-flash"
            }))
        );

        let file_content =
            fs::read_to_string(root.join("extension-settings.json")).expect("settings file");
        assert!(!file_content.contains("sk-retain"));
        assert_eq!(
            keychain::keychain_get_entry("extension-setting:retain-pdf:retainPdf.modelApiKey")
                .expect("keychain retain pdf model key"),
            Some("sk-retain".to_string())
        );

        let loaded = load_extension_settings(&root.to_string_lossy(), "").expect("load");
        assert_eq!(
            loaded.extension_config.get("retain-pdf"),
            Some(&serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-v4-flash"
            }))
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn redacted_secret_placeholders_do_not_clear_existing_keychain_values() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-redacted-secret-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        write_test_extension_manifest(&root, "retain-pdf", "retainPdf.modelApiKey");

        let mut initial_config = BTreeMap::new();
        initial_config.insert(
            "retain-pdf".to_string(),
            serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-v4-flash"
            }),
        );

        save_extension_settings(
            &root.to_string_lossy(),
            "",
            ExtensionSettings {
                enabled_extension_ids: vec!["retain-pdf".to_string()],
                extension_config: initial_config,
            },
        )
        .expect("save initial retain pdf settings");

        let mut updated_config = BTreeMap::new();
        updated_config.insert(
            "retain-pdf".to_string(),
            serde_json::json!({
                "retainPdf.modelApiKey": "",
                "retainPdf.model": "deepseek-reasoner"
            }),
        );

        let saved = save_extension_settings(
            &root.to_string_lossy(),
            "",
            ExtensionSettings {
                enabled_extension_ids: vec!["retain-pdf".to_string()],
                extension_config: updated_config,
            },
        )
        .expect("save retain pdf settings with redacted placeholder");

        assert_eq!(
            saved.extension_config.get("retain-pdf"),
            Some(&serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-reasoner"
            }))
        );
        assert_eq!(
            keychain::keychain_get_entry("extension-setting:retain-pdf:retainPdf.modelApiKey")
                .expect("keychain retain pdf model key"),
            Some("sk-retain".to_string())
        );

        let loaded = load_extension_settings(&root.to_string_lossy(), "").expect("load");
        assert_eq!(
            loaded.extension_config.get("retain-pdf"),
            Some(&serde_json::json!({
                "retainPdf.modelApiKey": "sk-retain",
                "retainPdf.model": "deepseek-reasoner"
            }))
        );

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn loading_plaintext_secrets_migrates_them_into_keychain() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-extension-settings-migrate-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        let extension_id = "example-pdf-extension-migrate";
        write_test_extension_manifest(&root, extension_id, "opaqueCredential");

        let legacy = serde_json::json!({
            "enabledExtensionIds": [extension_id],
            "extensionConfig": {
                extension_id: {
                    "apiKey": "legacy-secret",
                    "opaqueCredential": "opaque-legacy",
                    "targetLang": "zh-CN"
                }
            }
        });
        fs::write(
            root.join("extension-settings.json"),
            serde_json::to_string_pretty(&legacy).expect("legacy json"),
        )
        .expect("write legacy file");

        let loaded = load_extension_settings(&root.to_string_lossy(), "").expect("load migrated");
        assert_eq!(
            loaded.extension_config.get(extension_id),
            Some(&serde_json::json!({
                "apiKey": "legacy-secret",
                "opaqueCredential": "opaque-legacy",
                "targetLang": "zh-CN"
            }))
        );

        let migrated_file =
            fs::read_to_string(root.join("extension-settings.json")).expect("migrated file");
        assert!(!migrated_file.contains("legacy-secret"));
        assert!(!migrated_file.contains("opaque-legacy"));
        assert_eq!(
            keychain::keychain_get_entry("extension-setting:example-pdf-extension-migrate:apiKey")
                .expect("migrated api key"),
            Some("legacy-secret".to_string())
        );
        assert_eq!(
            keychain::keychain_get_entry(
                "extension-setting:example-pdf-extension-migrate:opaqueCredential"
            )
            .expect("migrated opaque credential"),
            Some("opaque-legacy".to_string())
        );

        fs::remove_dir_all(root).ok();
    }
}
