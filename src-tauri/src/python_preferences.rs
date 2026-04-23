use crate::app_dirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const PYTHON_PREFERENCES_VERSION: u32 = 1;
const DEFAULT_INTERPRETER_PREFERENCE: &str = "auto";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PythonPreferences {
    #[serde(default = "default_interpreter_preference")]
    pub interpreter_preference: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PythonPreferencesFile {
    #[serde(default = "default_python_preferences_version")]
    version: u32,
    #[serde(flatten)]
    preferences: PythonPreferences,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonPreferencesLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonPreferencesSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub preferences: PythonPreferences,
}

impl Default for PythonPreferences {
    fn default() -> Self {
        Self {
            interpreter_preference: default_interpreter_preference(),
        }
    }
}

fn default_python_preferences_version() -> u32 {
    PYTHON_PREFERENCES_VERSION
}

fn default_interpreter_preference() -> String {
    DEFAULT_INTERPRETER_PREFERENCE.to_string()
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn resolve_global_config_dir(global_config_dir: &str) -> Result<PathBuf, String> {
    let normalized = normalize_root(global_config_dir);
    if !normalized.is_empty() {
        return Ok(PathBuf::from(normalized));
    }
    app_dirs::data_root_dir()
}

fn python_preferences_path(global_config_dir: &str) -> Result<PathBuf, String> {
    Ok(resolve_global_config_dir(global_config_dir)?.join("python-preferences.json"))
}

fn read_python_preferences(global_config_dir: &str) -> Result<Option<PythonPreferences>, String> {
    let path = python_preferences_path(global_config_dir)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<PythonPreferencesFile>(&content) {
        return Ok(Some(parsed.preferences));
    }

    let parsed = serde_json::from_str::<PythonPreferences>(&content)
        .map_err(|error| format!("Failed to parse python preferences: {error}"))?;
    Ok(Some(parsed))
}

fn write_python_preferences(
    global_config_dir: &str,
    preferences: &PythonPreferences,
) -> Result<(), String> {
    let path = python_preferences_path(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = PythonPreferencesFile {
        version: PYTHON_PREFERENCES_VERSION,
        preferences: preferences.clone(),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize python preferences: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn normalize_interpreter_preference(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case(DEFAULT_INTERPRETER_PREFERENCE) {
        return DEFAULT_INTERPRETER_PREFERENCE.to_string();
    }
    trimmed.to_string()
}

pub fn normalize_python_preferences(preferences: PythonPreferences) -> PythonPreferences {
    PythonPreferences {
        interpreter_preference: normalize_interpreter_preference(
            &preferences.interpreter_preference,
        ),
    }
}

#[tauri::command]
pub async fn python_preferences_load(
    params: PythonPreferencesLoadParams,
) -> Result<PythonPreferences, String> {
    if let Some(current) = read_python_preferences(&params.global_config_dir)? {
        return Ok(normalize_python_preferences(current));
    }

    let defaults = PythonPreferences::default();
    write_python_preferences(&params.global_config_dir, &defaults)?;
    Ok(defaults)
}

#[tauri::command]
pub async fn python_preferences_save(
    params: PythonPreferencesSaveParams,
) -> Result<PythonPreferences, String> {
    let normalized = normalize_python_preferences(params.preferences);
    write_python_preferences(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        python_preferences_load, python_preferences_save, PythonPreferences,
        PythonPreferencesLoadParams, PythonPreferencesSaveParams,
    };
    use std::fs;

    #[tokio::test]
    async fn saves_normalized_python_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-python-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let saved = python_preferences_save(PythonPreferencesSaveParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            preferences: PythonPreferences {
                interpreter_preference: " /opt/homebrew/bin/python3 ".to_string(),
            },
        })
        .await
        .expect("save python preferences");

        assert_eq!(saved.interpreter_preference, "/opt/homebrew/bin/python3");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[tokio::test]
    async fn loads_default_python_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-python-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let loaded = python_preferences_load(PythonPreferencesLoadParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
        })
        .await
        .expect("load python preferences");

        assert_eq!(loaded.interpreter_preference, "auto");

        fs::remove_dir_all(temp_dir).ok();
    }
}
