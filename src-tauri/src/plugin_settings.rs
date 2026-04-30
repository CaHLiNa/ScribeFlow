use crate::app_dirs;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const PLUGIN_SETTINGS_FILENAME: &str = "plugin-settings.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettings {
    #[serde(default)]
    pub enabled_plugin_ids: Vec<String>,
    #[serde(default)]
    pub default_providers: BTreeMap<String, String>,
    #[serde(default)]
    pub plugin_config: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsLoadResult {
    #[serde(flatten)]
    pub settings: PluginSettings,
    pub settings_exists: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub settings: PluginSettings,
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn settings_file(global_config_dir: &str) -> Result<std::path::PathBuf, String> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        Ok(app_dirs::data_root_dir()?.join(PLUGIN_SETTINGS_FILENAME))
    } else {
        Ok(Path::new(&root).join(PLUGIN_SETTINGS_FILENAME))
    }
}

fn normalize_settings(settings: PluginSettings) -> PluginSettings {
    let mut enabled_plugin_ids = settings
        .enabled_plugin_ids
        .into_iter()
        .map(|id| id.trim().to_ascii_lowercase())
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();
    enabled_plugin_ids.sort();
    enabled_plugin_ids.dedup();

    let default_providers = settings
        .default_providers
        .into_iter()
        .filter_map(|(capability, plugin_id)| {
            let capability = capability.trim().to_string();
            let plugin_id = plugin_id.trim().to_ascii_lowercase();
            if capability.is_empty() || plugin_id.is_empty() {
                None
            } else {
                Some((capability, plugin_id))
            }
        })
        .collect();

    let plugin_config = settings
        .plugin_config
        .into_iter()
        .filter_map(|(plugin_id, config)| {
            let plugin_id = plugin_id.trim().to_ascii_lowercase();
            if plugin_id.is_empty() {
                None
            } else {
                Some((plugin_id, config))
            }
        })
        .collect();

    PluginSettings {
        enabled_plugin_ids,
        default_providers,
        plugin_config,
    }
}

pub fn load_plugin_settings(global_config_dir: &str) -> Result<PluginSettings, String> {
    let path = settings_file(global_config_dir)?;
    if !path.exists() {
        return Ok(PluginSettings::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<PluginSettings>(&content)
        .map_err(|error| format!("Failed to parse plugin settings: {error}"))?;
    Ok(normalize_settings(parsed))
}

pub fn load_plugin_settings_with_state(
    global_config_dir: &str,
) -> Result<PluginSettingsLoadResult, String> {
    let path = settings_file(global_config_dir)?;
    let settings_exists = path.exists();
    let settings = load_plugin_settings(global_config_dir)?;
    Ok(PluginSettingsLoadResult {
        settings,
        settings_exists,
    })
}

pub fn save_plugin_settings(
    global_config_dir: &str,
    settings: PluginSettings,
) -> Result<PluginSettings, String> {
    let normalized = normalize_settings(settings);
    let path = settings_file(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize plugin settings: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())?;
    Ok(normalized)
}

#[tauri::command]
pub async fn plugin_settings_load(
    params: PluginSettingsLoadParams,
) -> Result<PluginSettingsLoadResult, String> {
    load_plugin_settings_with_state(&params.global_config_dir)
}

#[tauri::command]
pub async fn plugin_settings_save(
    params: PluginSettingsSaveParams,
) -> Result<PluginSettings, String> {
    save_plugin_settings(&params.global_config_dir, params.settings)
}

#[cfg(test)]
mod tests {
    use super::{
        load_plugin_settings, load_plugin_settings_with_state, save_plugin_settings, PluginSettings,
    };
    use std::collections::BTreeMap;
    use std::fs;

    #[test]
    fn saves_normalized_plugin_settings() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-plugin-settings-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("root");
        let mut default_providers = BTreeMap::new();
        default_providers.insert(
            "pdf.translate".to_string(),
            " PDFMathTranslate ".to_string(),
        );
        let mut plugin_config = BTreeMap::new();
        plugin_config.insert(
            " PDFMathTranslate ".to_string(),
            serde_json::json!({"model": "gpt-4.1-mini"}),
        );
        let saved = save_plugin_settings(
            &root.to_string_lossy(),
            PluginSettings {
                enabled_plugin_ids: vec![
                    " PDFMathTranslate ".to_string(),
                    "pdfmathtranslate".to_string(),
                ],
                default_providers,
                plugin_config,
            },
        )
        .expect("save");
        assert_eq!(
            saved.enabled_plugin_ids,
            vec!["pdfmathtranslate".to_string()]
        );
        assert_eq!(
            saved.plugin_config.get("pdfmathtranslate"),
            Some(&serde_json::json!({"model": "gpt-4.1-mini"}))
        );
        assert_eq!(
            load_plugin_settings(&root.to_string_lossy()).expect("load"),
            saved
        );
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn load_result_marks_missing_settings_file() {
        let root = std::env::temp_dir().join(format!(
            "scribeflow-plugin-settings-missing-{}",
            uuid::Uuid::new_v4()
        ));
        let loaded = load_plugin_settings_with_state(&root.to_string_lossy()).expect("load");
        assert!(!loaded.settings_exists);
        assert!(loaded.settings.enabled_plugin_ids.is_empty());
        fs::remove_dir_all(root).ok();
    }
}
