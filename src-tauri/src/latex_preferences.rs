use crate::app_dirs;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const LATEX_PREFERENCES_VERSION: u32 = 1;
const DEFAULT_COMPILER_PREFERENCE: &str = "auto";
const DEFAULT_ENGINE_PREFERENCE: &str = "auto";
const DEFAULT_AUTO_COMPILE: bool = false;
const DEFAULT_FORMAT_ON_SAVE: bool = false;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LatexPreferences {
    #[serde(default = "default_compiler_preference")]
    pub compiler_preference: String,
    #[serde(default = "default_engine_preference")]
    pub engine_preference: String,
    #[serde(default = "default_auto_compile")]
    pub auto_compile: bool,
    #[serde(default = "default_format_on_save")]
    pub format_on_save: bool,
    #[serde(default)]
    pub build_extra_args: String,
    #[serde(default)]
    pub custom_system_tex_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatexPreferencesFile {
    #[serde(default = "default_latex_preferences_version")]
    version: u32,
    #[serde(flatten)]
    preferences: LatexPreferences,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexPreferencesLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexPreferencesSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub preferences: LatexPreferences,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexPreferencesNormalizeParams {
    #[serde(default)]
    pub preferences: LatexPreferences,
}

impl Default for LatexPreferences {
    fn default() -> Self {
        Self {
            compiler_preference: default_compiler_preference(),
            engine_preference: default_engine_preference(),
            auto_compile: default_auto_compile(),
            format_on_save: default_format_on_save(),
            build_extra_args: String::new(),
            custom_system_tex_path: String::new(),
        }
    }
}

fn default_latex_preferences_version() -> u32 {
    LATEX_PREFERENCES_VERSION
}

fn default_compiler_preference() -> String {
    DEFAULT_COMPILER_PREFERENCE.to_string()
}

fn default_engine_preference() -> String {
    DEFAULT_ENGINE_PREFERENCE.to_string()
}

fn default_auto_compile() -> bool {
    DEFAULT_AUTO_COMPILE
}

fn default_format_on_save() -> bool {
    DEFAULT_FORMAT_ON_SAVE
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

fn preferences_payload_field(params: &Value) -> LatexPreferences {
    command_payload_field(params, "preferences", "preferences")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn latex_preferences_load_params_from_payload(params: Value) -> LatexPreferencesLoadParams {
    LatexPreferencesLoadParams {
        global_config_dir: string_payload_field(&params, "globalConfigDir", "global_config_dir"),
    }
}

fn latex_preferences_save_params_from_payload(params: Value) -> LatexPreferencesSaveParams {
    LatexPreferencesSaveParams {
        global_config_dir: string_payload_field(&params, "globalConfigDir", "global_config_dir"),
        preferences: preferences_payload_field(&params),
    }
}

fn latex_preferences_normalize_params_from_payload(
    params: Value,
) -> LatexPreferencesNormalizeParams {
    LatexPreferencesNormalizeParams {
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

fn latex_preferences_path(global_config_dir: &str) -> Result<PathBuf, String> {
    Ok(resolve_global_config_dir(global_config_dir)?.join("latex-preferences.json"))
}

fn read_latex_preferences(global_config_dir: &str) -> Result<Option<LatexPreferences>, String> {
    let path = latex_preferences_path(global_config_dir)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<LatexPreferencesFile>(&content) {
        return Ok(Some(parsed.preferences));
    }

    let parsed = serde_json::from_str::<LatexPreferences>(&content)
        .map_err(|error| format!("Failed to parse latex preferences: {error}"))?;
    Ok(Some(parsed))
}

fn write_latex_preferences(
    global_config_dir: &str,
    preferences: &LatexPreferences,
) -> Result<(), String> {
    let path = latex_preferences_path(global_config_dir)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = LatexPreferencesFile {
        version: LATEX_PREFERENCES_VERSION,
        preferences: preferences.clone(),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize latex preferences: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn normalize_compiler_preference(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "system" => "system".to_string(),
        "tectonic" => "tectonic".to_string(),
        _ => DEFAULT_COMPILER_PREFERENCE.to_string(),
    }
}

fn normalize_engine_preference(compiler_preference: &str, value: &str) -> String {
    if compiler_preference == "tectonic" {
        return DEFAULT_ENGINE_PREFERENCE.to_string();
    }

    match value.trim().to_lowercase().as_str() {
        "xelatex" => "xelatex".to_string(),
        "pdflatex" => "pdflatex".to_string(),
        "lualatex" => "lualatex".to_string(),
        _ => DEFAULT_ENGINE_PREFERENCE.to_string(),
    }
}

fn normalize_build_extra_args(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_custom_system_tex_path(value: &str) -> String {
    value.trim().to_string()
}

pub fn normalize_latex_preferences(preferences: LatexPreferences) -> LatexPreferences {
    let compiler_preference = normalize_compiler_preference(&preferences.compiler_preference);

    LatexPreferences {
        compiler_preference: compiler_preference.clone(),
        engine_preference: normalize_engine_preference(
            &compiler_preference,
            &preferences.engine_preference,
        ),
        auto_compile: false,
        format_on_save: false,
        build_extra_args: normalize_build_extra_args(&preferences.build_extra_args),
        custom_system_tex_path: normalize_custom_system_tex_path(
            &preferences.custom_system_tex_path,
        ),
    }
}

pub async fn latex_preferences_load_typed(
    params: LatexPreferencesLoadParams,
) -> Result<LatexPreferences, String> {
    if let Some(current) = read_latex_preferences(&params.global_config_dir)? {
        return Ok(normalize_latex_preferences(current));
    }

    let defaults = LatexPreferences::default();
    write_latex_preferences(&params.global_config_dir, &defaults)?;
    Ok(defaults)
}

#[tauri::command]
pub async fn latex_preferences_load(params: Value) -> Result<LatexPreferences, String> {
    latex_preferences_load_typed(latex_preferences_load_params_from_payload(params)).await
}

pub async fn latex_preferences_save_typed(
    params: LatexPreferencesSaveParams,
) -> Result<LatexPreferences, String> {
    let normalized = normalize_latex_preferences(params.preferences);
    write_latex_preferences(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn latex_preferences_save(params: Value) -> Result<LatexPreferences, String> {
    latex_preferences_save_typed(latex_preferences_save_params_from_payload(params)).await
}

pub async fn latex_preferences_normalize_typed(
    params: LatexPreferencesNormalizeParams,
) -> Result<LatexPreferences, String> {
    Ok(normalize_latex_preferences(params.preferences))
}

#[tauri::command]
pub async fn latex_preferences_normalize(params: Value) -> Result<LatexPreferences, String> {
    latex_preferences_normalize_typed(latex_preferences_normalize_params_from_payload(params)).await
}

#[cfg(test)]
mod tests {
    use super::{
        latex_preferences_load_params_from_payload, latex_preferences_normalize,
        latex_preferences_normalize_params_from_payload, latex_preferences_save,
        latex_preferences_save_params_from_payload, LatexPreferences,
        LatexPreferencesNormalizeParams, LatexPreferencesSaveParams,
    };
    use serde_json::json;
    use std::fs;

    #[tokio::test]
    async fn normalizes_and_saves_latex_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-latex-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let saved = latex_preferences_save(json!({
            "globalConfigDir": temp_dir.to_string_lossy().to_string(),
            "preferences": {
                "compilerPreference": "tectonic",
                "enginePreference": "xelatex",
                "autoCompile": true,
                "formatOnSave": true,
                "buildExtraArgs": "  -interaction=nonstopmode  ",
                "customSystemTexPath": " /Library/TeX/texbin/latexmk "
            }
        }))
        .await
        .expect("save latex preferences");

        assert_eq!(saved.compiler_preference, "tectonic");
        assert_eq!(saved.engine_preference, "auto");
        assert!(!saved.auto_compile);
        assert!(!saved.format_on_save);
        assert_eq!(saved.build_extra_args, "-interaction=nonstopmode");
        assert_eq!(saved.custom_system_tex_path, "/Library/TeX/texbin/latexmk");

        let typed_saved = super::latex_preferences_save_typed(LatexPreferencesSaveParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            preferences: LatexPreferences {
                compiler_preference: "tectonic".to_string(),
                engine_preference: "xelatex".to_string(),
                auto_compile: true,
                format_on_save: true,
                build_extra_args: "  -interaction=nonstopmode  ".to_string(),
                custom_system_tex_path: " /Library/TeX/texbin/latexmk ".to_string(),
            },
        })
        .await
        .expect("save typed latex preferences");

        assert_eq!(typed_saved.compiler_preference, "tectonic");
        assert_eq!(typed_saved.engine_preference, "auto");
        assert!(!typed_saved.auto_compile);
        assert!(!typed_saved.format_on_save);
        assert_eq!(typed_saved.build_extra_args, "-interaction=nonstopmode");
        assert_eq!(
            typed_saved.custom_system_tex_path,
            "/Library/TeX/texbin/latexmk"
        );

        fs::remove_dir_all(temp_dir).ok();
    }

    #[tokio::test]
    async fn normalize_command_returns_canonical_latex_preferences_without_writing() {
        let normalized = latex_preferences_normalize(json!({
            "preferences": {
                "compilerPreference": " tectonic ",
                "enginePreference": "xelatex",
                "autoCompile": true,
                "formatOnSave": true,
                "buildExtraArgs": "  --keep-logs  ",
                "customSystemTexPath": " /Library/TeX/texbin "
            }
        }))
        .await
        .expect("latex preference normalize command should return normalized state");

        assert_eq!(normalized.compiler_preference, "tectonic");
        assert_eq!(normalized.engine_preference, "auto");
        assert!(!normalized.auto_compile);
        assert!(!normalized.format_on_save);
        assert_eq!(normalized.build_extra_args, "--keep-logs");
        assert_eq!(normalized.custom_system_tex_path, "/Library/TeX/texbin");

        let typed_normalized =
            super::latex_preferences_normalize_typed(LatexPreferencesNormalizeParams {
                preferences: LatexPreferences {
                    compiler_preference: " tectonic ".to_string(),
                    engine_preference: "xelatex".to_string(),
                    auto_compile: true,
                    format_on_save: true,
                    build_extra_args: "  --keep-logs  ".to_string(),
                    custom_system_tex_path: " /Library/TeX/texbin ".to_string(),
                },
            })
            .await
            .expect("typed latex preference normalize command should return normalized state");

        assert_eq!(typed_normalized.compiler_preference, "tectonic");
        assert_eq!(typed_normalized.engine_preference, "auto");
        assert!(!typed_normalized.auto_compile);
        assert!(!typed_normalized.format_on_save);
        assert_eq!(typed_normalized.build_extra_args, "--keep-logs");
        assert_eq!(
            typed_normalized.custom_system_tex_path,
            "/Library/TeX/texbin"
        );
    }

    #[test]
    fn latex_preferences_params_normalize_raw_payloads() {
        let load_params = latex_preferences_load_params_from_payload(json!({
            "globalConfigDir": " /tmp/config/ "
        }));
        assert_eq!(load_params.global_config_dir, "/tmp/config/");

        let snake_load_params = latex_preferences_load_params_from_payload(json!({
            "global_config_dir": " /tmp/snake-config "
        }));
        assert_eq!(snake_load_params.global_config_dir, "/tmp/snake-config");

        let invalid_load_params = latex_preferences_load_params_from_payload(json!({
            "globalConfigDir": 42
        }));
        assert_eq!(invalid_load_params.global_config_dir, "");

        let save_params = latex_preferences_save_params_from_payload(json!({
            "globalConfigDir": " /tmp/config ",
            "preferences": {
                "compilerPreference": " tectonic ",
                "enginePreference": "xelatex",
                "autoCompile": true,
                "formatOnSave": true,
                "buildExtraArgs": "  --keep-logs  ",
                "customSystemTexPath": " /Library/TeX/texbin "
            }
        }));
        assert_eq!(save_params.global_config_dir, "/tmp/config");
        assert_eq!(save_params.preferences.compiler_preference, " tectonic ");
        assert_eq!(save_params.preferences.engine_preference, "xelatex");
        assert!(save_params.preferences.auto_compile);
        assert!(save_params.preferences.format_on_save);
        assert_eq!(save_params.preferences.build_extra_args, "  --keep-logs  ");
        assert_eq!(
            save_params.preferences.custom_system_tex_path,
            " /Library/TeX/texbin "
        );

        let default_save_params = latex_preferences_save_params_from_payload(json!({
            "preferences": "not-an-object"
        }));
        assert_eq!(default_save_params.preferences, LatexPreferences::default());

        let normalize_params = latex_preferences_normalize_params_from_payload(json!({
            "preferences": {
                "compilerPreference": " AUTO "
            }
        }));
        assert_eq!(normalize_params.preferences.compiler_preference, " AUTO ");

        let non_object = latex_preferences_normalize_params_from_payload(json!(false));
        assert_eq!(non_object.preferences, LatexPreferences::default());
    }
}
