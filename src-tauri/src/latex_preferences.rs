use crate::app_dirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const LATEX_PREFERENCES_VERSION: u32 = 1;
const DEFAULT_COMPILER_PREFERENCE: &str = "auto";
const DEFAULT_ENGINE_PREFERENCE: &str = "auto";
const DEFAULT_AUTO_COMPILE: bool = false;
const DEFAULT_FORMAT_ON_SAVE: bool = false;
const DEFAULT_BUILD_RECIPE: &str = "default";

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
    #[serde(default = "default_build_recipe")]
    pub build_recipe: String,
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
    #[serde(default)]
    pub legacy_preferences: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatexPreferencesSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
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
            build_recipe: default_build_recipe(),
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

fn default_build_recipe() -> String {
    DEFAULT_BUILD_RECIPE.to_string()
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

fn normalize_build_recipe(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "shell-escape" => "shell-escape".to_string(),
        "clean-build" => "clean-build".to_string(),
        "shell-escape-clean" => "shell-escape-clean".to_string(),
        _ => DEFAULT_BUILD_RECIPE.to_string(),
    }
}

fn normalize_build_extra_args(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_custom_system_tex_path(value: &str) -> String {
    value.trim().to_string()
}

fn parse_legacy_bool(value: Option<&String>, fallback: bool) -> bool {
    value
        .map(|item| {
            matches!(
                item.trim().to_lowercase().as_str(),
                "true" | "1" | "yes" | "on"
            )
        })
        .unwrap_or(fallback)
}

fn build_preferences_from_legacy_snapshot(
    snapshot: &HashMap<String, String>,
) -> Option<LatexPreferences> {
    if snapshot.is_empty() {
        return None;
    }

    let compiler_preference = normalize_compiler_preference(
        snapshot
            .get("latex.compilerPreference")
            .map(String::as_str)
            .unwrap_or(DEFAULT_COMPILER_PREFERENCE),
    );

    Some(LatexPreferences {
        compiler_preference: compiler_preference.clone(),
        engine_preference: normalize_engine_preference(
            &compiler_preference,
            snapshot
                .get("latex.enginePreference")
                .map(String::as_str)
                .unwrap_or(DEFAULT_ENGINE_PREFERENCE),
        ),
        auto_compile: parse_legacy_bool(snapshot.get("latex.autoCompile"), DEFAULT_AUTO_COMPILE),
        format_on_save: parse_legacy_bool(
            snapshot.get("latex.formatOnSave"),
            DEFAULT_FORMAT_ON_SAVE,
        ),
        build_recipe: normalize_build_recipe(
            snapshot
                .get("latex.buildRecipe")
                .map(String::as_str)
                .unwrap_or(DEFAULT_BUILD_RECIPE),
        ),
        build_extra_args: normalize_build_extra_args(
            snapshot
                .get("latex.buildExtraArgs")
                .map(String::as_str)
                .unwrap_or_default(),
        ),
        custom_system_tex_path: normalize_custom_system_tex_path(
            snapshot
                .get("latex.customSystemTexPath")
                .or_else(|| snapshot.get("latex.customLatexmkPath"))
                .map(String::as_str)
                .unwrap_or_default(),
        ),
    })
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
        build_recipe: normalize_build_recipe(&preferences.build_recipe),
        build_extra_args: normalize_build_extra_args(&preferences.build_extra_args),
        custom_system_tex_path: normalize_custom_system_tex_path(
            &preferences.custom_system_tex_path,
        ),
    }
}

#[tauri::command]
pub async fn latex_preferences_load(
    params: LatexPreferencesLoadParams,
) -> Result<LatexPreferences, String> {
    if let Some(current) = read_latex_preferences(&params.global_config_dir)? {
        return Ok(normalize_latex_preferences(current));
    }

    if let Some(legacy_preferences) =
        build_preferences_from_legacy_snapshot(&params.legacy_preferences)
    {
        let normalized = normalize_latex_preferences(legacy_preferences);
        write_latex_preferences(&params.global_config_dir, &normalized)?;
        return Ok(normalized);
    }

    let defaults = LatexPreferences::default();
    write_latex_preferences(&params.global_config_dir, &defaults)?;
    Ok(defaults)
}

#[tauri::command]
pub async fn latex_preferences_save(
    params: LatexPreferencesSaveParams,
) -> Result<LatexPreferences, String> {
    let normalized = normalize_latex_preferences(params.preferences);
    write_latex_preferences(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::{
        latex_preferences_load, latex_preferences_save, LatexPreferences,
        LatexPreferencesLoadParams, LatexPreferencesSaveParams,
    };
    use std::collections::HashMap;
    use std::fs;

    #[tokio::test]
    async fn normalizes_and_saves_latex_preferences() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-latex-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let saved = latex_preferences_save(LatexPreferencesSaveParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            preferences: LatexPreferences {
                compiler_preference: "tectonic".to_string(),
                engine_preference: "xelatex".to_string(),
                auto_compile: true,
                format_on_save: true,
                build_recipe: "shell-escape".to_string(),
                build_extra_args: "  -interaction=nonstopmode  ".to_string(),
                custom_system_tex_path: " /Library/TeX/texbin/latexmk ".to_string(),
            },
        })
        .await
        .expect("save latex preferences");

        assert_eq!(saved.compiler_preference, "tectonic");
        assert_eq!(saved.engine_preference, "auto");
        assert!(!saved.auto_compile);
        assert!(!saved.format_on_save);
        assert_eq!(saved.build_extra_args, "-interaction=nonstopmode");
        assert_eq!(saved.custom_system_tex_path, "/Library/TeX/texbin/latexmk");

        fs::remove_dir_all(temp_dir).ok();
    }

    #[tokio::test]
    async fn migrates_legacy_local_storage_snapshot() {
        let temp_dir =
            std::env::temp_dir().join(format!("scribeflow-latex-prefs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let mut legacy_preferences = HashMap::new();
        legacy_preferences.insert("latex.compilerPreference".to_string(), "system".to_string());
        legacy_preferences.insert("latex.enginePreference".to_string(), "xelatex".to_string());
        legacy_preferences.insert("latex.autoCompile".to_string(), "true".to_string());
        legacy_preferences.insert("latex.buildRecipe".to_string(), "clean-build".to_string());

        let loaded = latex_preferences_load(LatexPreferencesLoadParams {
            global_config_dir: temp_dir.to_string_lossy().to_string(),
            legacy_preferences,
        })
        .await
        .expect("load latex preferences");

        assert_eq!(loaded.compiler_preference, "system");
        assert_eq!(loaded.engine_preference, "xelatex");
        assert!(!loaded.auto_compile);
        assert!(!loaded.format_on_save);
        assert_eq!(loaded.build_recipe, "clean-build");

        fs::remove_dir_all(temp_dir).ok();
    }
}
