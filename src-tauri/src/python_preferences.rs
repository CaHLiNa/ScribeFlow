use crate::app_dirs;
use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonPreferencesNormalizeParams {
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

fn command_payload_field<'a>(
    params: &'a Value,
    camel_key: &str,
    snake_key: &str,
) -> Option<&'a Value> {
    params
        .as_object()
        .and_then(|object| object.get(camel_key).or_else(|| object.get(snake_key)))
}

fn string_payload_field(params: &Value, camel_key: &str, snake_key: &str) -> String {
    command_payload_field(params, camel_key, snake_key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn preferences_payload_field(params: &Value) -> PythonPreferences {
    command_payload_field(params, "preferences", "preferences")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn python_preferences_load_params_from_payload(params: Value) -> PythonPreferencesLoadParams {
    PythonPreferencesLoadParams {
        global_config_dir: string_payload_field(&params, "globalConfigDir", "global_config_dir"),
    }
}

fn python_preferences_save_params_from_payload(params: Value) -> PythonPreferencesSaveParams {
    PythonPreferencesSaveParams {
        global_config_dir: string_payload_field(&params, "globalConfigDir", "global_config_dir"),
        preferences: preferences_payload_field(&params),
    }
}

fn python_preferences_normalize_params_from_payload(
    params: Value,
) -> PythonPreferencesNormalizeParams {
    PythonPreferencesNormalizeParams {
        preferences: preferences_payload_field(&params),
    }
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

pub async fn python_preferences_load_typed(
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
pub async fn python_preferences_load(params: Value) -> Result<PythonPreferences, String> {
    python_preferences_load_typed(python_preferences_load_params_from_payload(params)).await
}

pub async fn python_preferences_save_typed(
    params: PythonPreferencesSaveParams,
) -> Result<PythonPreferences, String> {
    let normalized = normalize_python_preferences(params.preferences);
    write_python_preferences(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn python_preferences_save(params: Value) -> Result<PythonPreferences, String> {
    python_preferences_save_typed(python_preferences_save_params_from_payload(params)).await
}

pub async fn python_preferences_normalize_typed(
    params: PythonPreferencesNormalizeParams,
) -> Result<PythonPreferences, String> {
    Ok(normalize_python_preferences(params.preferences))
}

#[tauri::command]
pub async fn python_preferences_normalize(params: Value) -> Result<PythonPreferences, String> {
    python_preferences_normalize_typed(python_preferences_normalize_params_from_payload(params))
        .await
}

#[cfg(test)]
mod tests {
    use super::{
        python_preferences_load, python_preferences_load_params_from_payload,
        python_preferences_normalize, python_preferences_normalize_params_from_payload,
        python_preferences_save, python_preferences_save_params_from_payload, PythonPreferences,
        PythonPreferencesNormalizeParams, PythonPreferencesSaveParams,
    };
    use serde_json::json;
    use std::fs;

    #[tokio::test]
    async fn saves_normalized_python_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-python-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let saved = python_preferences_save(json!({
            "globalConfigDir": temp_dir.to_string_lossy().to_string(),
            "preferences": {
                "interpreterPreference": " /opt/homebrew/bin/python3 "
            }
        }))
        .await
        .expect("save python preferences");

        assert_eq!(saved.interpreter_preference, "/opt/homebrew/bin/python3");

        let typed_saved = super::python_preferences_save_typed(PythonPreferencesSaveParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            preferences: PythonPreferences {
                interpreter_preference: " /opt/homebrew/bin/python3 ".to_string(),
            },
        })
        .await
        .expect("save typed python preferences");

        assert_eq!(
            typed_saved.interpreter_preference,
            "/opt/homebrew/bin/python3"
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[tokio::test]
    async fn normalize_command_returns_canonical_python_preferences_without_writing() {
        let normalized = python_preferences_normalize(json!({
            "preferences": {
                "interpreterPreference": " /opt/homebrew/bin/python3 "
            }
        }))
        .await
        .expect("python preference normalize command should return normalized state");

        assert_eq!(
            normalized.interpreter_preference,
            "/opt/homebrew/bin/python3"
        );

        let defaulted = python_preferences_normalize(json!({
            "preferences": {
                "interpreterPreference": " AUTO "
            }
        }))
        .await
        .expect("python preference normalize command should preserve auto default");

        assert_eq!(defaulted.interpreter_preference, "auto");

        let typed_normalized =
            super::python_preferences_normalize_typed(PythonPreferencesNormalizeParams {
                preferences: PythonPreferences {
                    interpreter_preference: " /opt/homebrew/bin/python3 ".to_string(),
                },
            })
            .await
            .expect("typed python preference normalize command should return normalized state");

        assert_eq!(
            typed_normalized.interpreter_preference,
            "/opt/homebrew/bin/python3"
        );
    }

    #[tokio::test]
    async fn loads_default_python_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-python-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let loaded = python_preferences_load(json!({
            "globalConfigDir": temp_dir.to_string_lossy().to_string()
        }))
        .await
        .expect("load python preferences");

        assert_eq!(loaded.interpreter_preference, "auto");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[test]
    fn python_preferences_params_normalize_raw_payloads() {
        let load_params = python_preferences_load_params_from_payload(json!({
            "globalConfigDir": " /tmp/config/ "
        }));
        assert_eq!(load_params.global_config_dir, "/tmp/config/");

        let snake_load_params = python_preferences_load_params_from_payload(json!({
            "global_config_dir": " /tmp/snake-config "
        }));
        assert_eq!(snake_load_params.global_config_dir, "/tmp/snake-config");

        let invalid_load_params = python_preferences_load_params_from_payload(json!({
            "globalConfigDir": 42
        }));
        assert_eq!(invalid_load_params.global_config_dir, "");

        let save_params = python_preferences_save_params_from_payload(json!({
            "globalConfigDir": " /tmp/config ",
            "preferences": {
                "interpreterPreference": " /opt/homebrew/bin/python3 "
            }
        }));
        assert_eq!(save_params.global_config_dir, "/tmp/config");
        assert_eq!(
            save_params.preferences.interpreter_preference,
            " /opt/homebrew/bin/python3 "
        );

        let default_save_params = python_preferences_save_params_from_payload(json!({
            "preferences": "not-an-object"
        }));
        assert_eq!(
            default_save_params.preferences,
            PythonPreferences::default()
        );

        let normalize_params = python_preferences_normalize_params_from_payload(json!({
            "preferences": {
                "interpreterPreference": " AUTO "
            }
        }));
        assert_eq!(
            normalize_params.preferences.interpreter_preference,
            " AUTO "
        );

        let non_object = python_preferences_normalize_params_from_payload(json!(false));
        assert_eq!(non_object.preferences, PythonPreferences::default());
    }
}
