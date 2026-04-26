use crate::process_utils::background_command;
use crate::workbench_state::{normalize_workbench_state, WorkbenchState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const WORKSPACE_PREFERENCES_VERSION: u32 = 1;
const DEFAULT_EDITOR_FONT_SIZE: i64 = 14;
const DEFAULT_UI_FONT_SIZE: i64 = 13;
const MIN_EDITOR_FONT_SIZE: i64 = 12;
const MAX_EDITOR_FONT_SIZE: i64 = 20;
const DEFAULT_WRAP_COLUMN: i64 = 0;
const DEFAULT_UI_FONT: &str = "inter";
const DEFAULT_MARKDOWN_FONT: &str = "inter";
const DEFAULT_LATEX_FONT: &str = "mono";
const DEFAULT_PREFERRED_LOCALE: &str = "system";
const DEFAULT_THEME: &str = "system";
const DEFAULT_MARKDOWN_PREVIEW_SYNC: bool = true;
const DEFAULT_EDITOR_SPELLCHECK: bool = false;
const DEFAULT_EDITOR_LINE_NUMBERS: bool = true;
const DEFAULT_EDITOR_HIGHLIGHT_ACTIVE_LINE: bool = true;
const DEFAULT_FILE_TREE_SHOW_HIDDEN: bool = true;
const DEFAULT_FILE_TREE_SORT_MODE: &str = "name";
const DEFAULT_FILE_TREE_FOLD_DIRECTORIES: bool = false;
const DEFAULT_PDF_VIEWER_ZOOM_MODE: &str = "page-width";
const DEFAULT_PDF_VIEWER_SPREAD_MODE: &str = "single";
const DEFAULT_PDF_VIEWER_LAST_SCALE: &str = "";
const DEFAULT_PDF_VIEWER_PAGE_THEME_MODE: &str = "theme";
const DEFAULT_MARKDOWN_CITATION_FORMAT: &str = "bracketed";
const DEFAULT_LATEX_CITATION_COMMAND: &str = "cite";
const DEFAULT_CITATION_INSERT_ADDS_SPACE: bool = false;
static SYSTEM_FONT_FAMILIES_CACHE: OnceLock<Vec<String>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePreferences {
    #[serde(flatten)]
    pub workbench: WorkbenchState,
    #[serde(default = "default_auto_save")]
    pub auto_save: bool,
    #[serde(default = "default_soft_wrap")]
    pub soft_wrap: bool,
    #[serde(default = "default_wrap_column")]
    pub wrap_column: i64,
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: i64,
    #[serde(default = "default_ui_font_size")]
    pub ui_font_size: i64,
    #[serde(default = "default_ui_font")]
    pub ui_font: String,
    #[serde(default = "default_markdown_font", alias = "proseFont")]
    pub markdown_font: String,
    #[serde(default = "default_latex_font")]
    pub latex_font: String,
    #[serde(default = "default_preferred_locale")]
    pub preferred_locale: String,
    #[serde(default = "default_markdown_preview_sync")]
    pub markdown_preview_sync: bool,
    #[serde(default = "default_editor_spellcheck")]
    pub editor_spellcheck: bool,
    #[serde(default = "default_editor_line_numbers")]
    pub editor_line_numbers: bool,
    #[serde(default = "default_editor_highlight_active_line")]
    pub editor_highlight_active_line: bool,
    #[serde(default = "default_file_tree_show_hidden")]
    pub file_tree_show_hidden: bool,
    #[serde(default = "default_file_tree_sort_mode")]
    pub file_tree_sort_mode: String,
    #[serde(default = "default_file_tree_fold_directories")]
    pub file_tree_fold_directories: bool,
    #[serde(default = "default_pdf_viewer_zoom_mode")]
    pub pdf_viewer_zoom_mode: String,
    #[serde(default = "default_pdf_viewer_spread_mode")]
    pub pdf_viewer_spread_mode: String,
    #[serde(default = "default_pdf_viewer_last_scale")]
    pub pdf_viewer_last_scale: String,
    #[serde(default = "default_pdf_viewer_page_theme_mode")]
    pub pdf_viewer_page_theme_mode: String,
    #[serde(default = "default_markdown_citation_format")]
    pub markdown_citation_format: String,
    #[serde(default = "default_latex_citation_command")]
    pub latex_citation_command: String,
    #[serde(default = "default_citation_insert_adds_space")]
    pub citation_insert_adds_space: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for WorkspacePreferences {
    fn default() -> Self {
        Self {
            workbench: WorkbenchState::default(),
            auto_save: default_auto_save(),
            soft_wrap: default_soft_wrap(),
            wrap_column: default_wrap_column(),
            editor_font_size: default_editor_font_size(),
            ui_font_size: default_ui_font_size(),
            ui_font: default_ui_font(),
            markdown_font: default_markdown_font(),
            latex_font: default_latex_font(),
            preferred_locale: default_preferred_locale(),
            markdown_preview_sync: default_markdown_preview_sync(),
            editor_spellcheck: default_editor_spellcheck(),
            editor_line_numbers: default_editor_line_numbers(),
            editor_highlight_active_line: default_editor_highlight_active_line(),
            file_tree_show_hidden: default_file_tree_show_hidden(),
            file_tree_sort_mode: default_file_tree_sort_mode(),
            file_tree_fold_directories: default_file_tree_fold_directories(),
            pdf_viewer_zoom_mode: default_pdf_viewer_zoom_mode(),
            pdf_viewer_spread_mode: default_pdf_viewer_spread_mode(),
            pdf_viewer_last_scale: default_pdf_viewer_last_scale(),
            pdf_viewer_page_theme_mode: default_pdf_viewer_page_theme_mode(),
            markdown_citation_format: default_markdown_citation_format(),
            latex_citation_command: default_latex_citation_command(),
            citation_insert_adds_space: default_citation_insert_adds_space(),
            theme: default_theme(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspacePreferencesFile {
    #[serde(default = "default_workspace_preferences_version")]
    version: u32,
    #[serde(flatten)]
    preferences: WorkspacePreferences,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePreferencesLoadParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub legacy_preferences: HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePreferencesSaveParams {
    #[serde(default)]
    pub global_config_dir: String,
    #[serde(default)]
    pub preferences: WorkspacePreferences,
}

fn default_workspace_preferences_version() -> u32 {
    WORKSPACE_PREFERENCES_VERSION
}

fn default_auto_save() -> bool {
    true
}

fn default_primary_surface() -> String {
    WorkbenchState::default().primary_surface
}

fn default_left_sidebar_open() -> bool {
    WorkbenchState::default().left_sidebar_open
}

fn default_left_sidebar_panel() -> String {
    WorkbenchState::default().left_sidebar_panel
}

fn default_right_sidebar_open() -> bool {
    WorkbenchState::default().right_sidebar_open
}

fn default_right_sidebar_panel() -> String {
    WorkbenchState::default().right_sidebar_panel
}

fn default_soft_wrap() -> bool {
    true
}

fn default_wrap_column() -> i64 {
    DEFAULT_WRAP_COLUMN
}

fn default_editor_font_size() -> i64 {
    DEFAULT_EDITOR_FONT_SIZE
}

fn default_ui_font_size() -> i64 {
    DEFAULT_UI_FONT_SIZE
}

fn default_ui_font() -> String {
    DEFAULT_UI_FONT.to_string()
}

fn default_markdown_font() -> String {
    DEFAULT_MARKDOWN_FONT.to_string()
}

fn default_latex_font() -> String {
    DEFAULT_LATEX_FONT.to_string()
}

fn default_preferred_locale() -> String {
    DEFAULT_PREFERRED_LOCALE.to_string()
}

fn default_markdown_preview_sync() -> bool {
    DEFAULT_MARKDOWN_PREVIEW_SYNC
}

fn default_editor_spellcheck() -> bool {
    DEFAULT_EDITOR_SPELLCHECK
}

fn default_editor_line_numbers() -> bool {
    DEFAULT_EDITOR_LINE_NUMBERS
}

fn default_editor_highlight_active_line() -> bool {
    DEFAULT_EDITOR_HIGHLIGHT_ACTIVE_LINE
}

fn default_file_tree_show_hidden() -> bool {
    DEFAULT_FILE_TREE_SHOW_HIDDEN
}

fn default_file_tree_sort_mode() -> String {
    DEFAULT_FILE_TREE_SORT_MODE.to_string()
}

fn default_file_tree_fold_directories() -> bool {
    DEFAULT_FILE_TREE_FOLD_DIRECTORIES
}

fn default_pdf_viewer_zoom_mode() -> String {
    DEFAULT_PDF_VIEWER_ZOOM_MODE.to_string()
}

fn default_pdf_viewer_spread_mode() -> String {
    DEFAULT_PDF_VIEWER_SPREAD_MODE.to_string()
}

fn default_pdf_viewer_last_scale() -> String {
    DEFAULT_PDF_VIEWER_LAST_SCALE.to_string()
}

fn default_pdf_viewer_page_theme_mode() -> String {
    DEFAULT_PDF_VIEWER_PAGE_THEME_MODE.to_string()
}

fn default_markdown_citation_format() -> String {
    DEFAULT_MARKDOWN_CITATION_FORMAT.to_string()
}

fn default_latex_citation_command() -> String {
    DEFAULT_LATEX_CITATION_COMMAND.to_string()
}

fn default_citation_insert_adds_space() -> bool {
    DEFAULT_CITATION_INSERT_ADDS_SPACE
}

fn default_theme() -> String {
    DEFAULT_THEME.to_string()
}

fn normalize_root(path: &str) -> String {
    path.trim().trim_end_matches('/').to_string()
}

fn workspace_preferences_path(global_config_dir: &str) -> Option<PathBuf> {
    let root = normalize_root(global_config_dir);
    if root.is_empty() {
        return None;
    }
    Some(Path::new(&root).join("workspace-preferences.json"))
}

fn read_workspace_preferences(
    global_config_dir: &str,
) -> Result<Option<WorkspacePreferences>, String> {
    let Some(path) = workspace_preferences_path(global_config_dir) else {
        return Ok(None);
    };

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<WorkspacePreferencesFile>(&content) {
        return Ok(Some(parsed.preferences));
    }

    let parsed = serde_json::from_str::<WorkspacePreferences>(&content)
        .map_err(|error| format!("Failed to parse workspace preferences: {error}"))?;
    Ok(Some(parsed))
}

fn write_workspace_preferences(
    global_config_dir: &str,
    preferences: &WorkspacePreferences,
) -> Result<(), String> {
    let Some(path) = workspace_preferences_path(global_config_dir) else {
        return Ok(());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let payload = WorkspacePreferencesFile {
        version: WORKSPACE_PREFERENCES_VERSION,
        preferences: preferences.clone(),
    };

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workspace preferences: {error}"))?;
    fs::write(&path, serialized).map_err(|error| error.to_string())
}

fn clamp(value: i64, min: i64, max: i64) -> i64 {
    value.max(min).min(max)
}

fn normalize_editor_font_size(value: i64) -> i64 {
    clamp(value, MIN_EDITOR_FONT_SIZE, MAX_EDITOR_FONT_SIZE)
}

fn normalize_ui_font_size(value: i64) -> i64 {
    if value > 0 {
        value
    } else {
        DEFAULT_UI_FONT_SIZE
    }
}

fn normalize_wrap_column(value: i64) -> i64 {
    value.max(0)
}

fn normalize_font_preference(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    let lowered = trimmed.to_lowercase();

    match lowered.as_str() {
        "stix" => "stix".to_string(),
        "mono" => "mono".to_string(),
        "inter" => "inter".to_string(),
        _ => trimmed
            .split_once(':')
            .filter(|(prefix, family)| {
                prefix.eq_ignore_ascii_case("system") && !family.trim().is_empty()
            })
            .map(|(_, family)| format!("system:{}", family.trim()))
            .unwrap_or_else(|| fallback.to_string()),
    }
}

fn normalize_preferred_locale(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "zh" | "zh-cn" => "zh-CN".to_string(),
        "en" | "en-us" => "en-US".to_string(),
        _ => DEFAULT_PREFERRED_LOCALE.to_string(),
    }
}

fn normalize_pdf_viewer_zoom_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "page-fit" => "page-fit".to_string(),
        "remember-last" => "remember-last".to_string(),
        _ => "page-width".to_string(),
    }
}

fn normalize_file_tree_sort_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "modified" => "modified".to_string(),
        _ => "name".to_string(),
    }
}

fn normalize_pdf_viewer_spread_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "double" => "double".to_string(),
        _ => "single".to_string(),
    }
}

fn normalize_pdf_viewer_last_scale(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    match trimmed.to_ascii_lowercase().as_str() {
        "auto" | "page-fit" | "page-width" => trimmed.to_ascii_lowercase(),
        _ => trimmed
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite() && *value > 0.0)
            .map(|value| {
                let rounded = (value.min(2.0) * 10_000.0).round() / 10_000.0;
                rounded.to_string()
            })
            .unwrap_or_default(),
    }
}

fn normalize_pdf_viewer_page_theme_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "light" => "light".to_string(),
        _ => "theme".to_string(),
    }
}

fn normalize_markdown_citation_format(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "bare" => "bare".to_string(),
        _ => "bracketed".to_string(),
    }
}

fn normalize_latex_citation_command(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "citep" => "citep".to_string(),
        "citet" => "citet".to_string(),
        "parencite" => "parencite".to_string(),
        "textcite" => "textcite".to_string(),
        "autocite" => "autocite".to_string(),
        _ => "cite".to_string(),
    }
}

fn preferred_font_rank(name: &str) -> usize {
    match name {
        "PingFang SC" => 0,
        "SF Pro Text" => 1,
        "New York" => 2,
        "Songti SC" => 3,
        "Kaiti SC" => 4,
        "Times New Roman" => 5,
        "Helvetica Neue" => 6,
        "Avenir Next" => 7,
        "Georgia" => 8,
        "Menlo" => 9,
        _ => 100,
    }
}

fn sort_system_font_families(fonts: &mut [String]) {
    fonts.sort_by(|left, right| {
        preferred_font_rank(left)
            .cmp(&preferred_font_rank(right))
            .then_with(|| left.to_lowercase().cmp(&right.to_lowercase()))
    });
}

fn should_expose_system_font_family(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.starts_with('.') {
        return false;
    }

    let lowered = trimmed.to_lowercase();
    !lowered.contains("fallback") && !lowered.contains("lastresort")
}

#[cfg(target_os = "macos")]
fn load_macos_system_font_families() -> Result<Vec<String>, String> {
    let output = background_command("system_profiler")
        .arg("SPFontsDataType")
        .arg("-json")
        .arg("-detailLevel")
        .arg("mini")
        .output()
        .map_err(|error| format!("Failed to inspect system fonts: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let payload: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse macOS font list: {error}"))?;
    let entries = payload
        .get("SPFontsDataType")
        .and_then(Value::as_array)
        .ok_or_else(|| "Missing SPFontsDataType payload".to_string())?;

    let mut families = Vec::<String>::new();

    for entry in entries {
        let entry_enabled = entry
            .get("enabled")
            .and_then(Value::as_str)
            .map(|value| value == "yes")
            .unwrap_or(true);
        let entry_valid = entry
            .get("valid")
            .and_then(Value::as_str)
            .map(|value| value == "yes")
            .unwrap_or(true);
        if !entry_enabled || !entry_valid {
            continue;
        }

        let Some(typefaces) = entry.get("typefaces").and_then(Value::as_array) else {
            continue;
        };

        for typeface in typefaces {
            let typeface_enabled = typeface
                .get("enabled")
                .and_then(Value::as_str)
                .map(|value| value == "yes")
                .unwrap_or(true);
            let typeface_valid = typeface
                .get("valid")
                .and_then(Value::as_str)
                .map(|value| value == "yes")
                .unwrap_or(true);
            if !typeface_enabled || !typeface_valid {
                continue;
            }

            let Some(family) = typeface.get("family").and_then(Value::as_str) else {
                continue;
            };

            let normalized = family.trim();
            if !should_expose_system_font_family(normalized)
                || families.iter().any(|item| item == normalized)
            {
                continue;
            }

            families.push(normalized.to_string());
        }
    }

    sort_system_font_families(&mut families);
    Ok(families)
}

#[cfg(not(target_os = "macos"))]
fn load_macos_system_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

fn read_system_font_families() -> Result<Vec<String>, String> {
    if let Some(cached) = SYSTEM_FONT_FAMILIES_CACHE.get() {
        return Ok(cached.clone());
    }

    let fonts = load_macos_system_font_families()?;
    let _ = SYSTEM_FONT_FAMILIES_CACHE.set(fonts.clone());
    Ok(fonts)
}

fn normalize_theme(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "system" => "system".to_string(),
        "light" | "solarized" | "humane" | "one-light" => "light".to_string(),
        "dark" | "default" | "dracula" | "monokai" | "nord" => "dark".to_string(),
        _ => "system".to_string(),
    }
}

fn normalize_workspace_preferences(preferences: WorkspacePreferences) -> WorkspacePreferences {
    WorkspacePreferences {
        workbench: normalize_workbench_state(preferences.workbench),
        auto_save: preferences.auto_save,
        soft_wrap: true,
        wrap_column: normalize_wrap_column(preferences.wrap_column),
        editor_font_size: normalize_editor_font_size(preferences.editor_font_size),
        ui_font_size: normalize_ui_font_size(preferences.ui_font_size),
        ui_font: normalize_font_preference(&preferences.ui_font, DEFAULT_UI_FONT),
        markdown_font: normalize_font_preference(&preferences.markdown_font, DEFAULT_MARKDOWN_FONT),
        latex_font: normalize_font_preference(&preferences.latex_font, DEFAULT_LATEX_FONT),
        preferred_locale: normalize_preferred_locale(&preferences.preferred_locale),
        markdown_preview_sync: preferences.markdown_preview_sync,
        editor_spellcheck: preferences.editor_spellcheck,
        editor_line_numbers: preferences.editor_line_numbers,
        editor_highlight_active_line: preferences.editor_highlight_active_line,
        file_tree_show_hidden: preferences.file_tree_show_hidden,
        file_tree_sort_mode: normalize_file_tree_sort_mode(&preferences.file_tree_sort_mode),
        file_tree_fold_directories: preferences.file_tree_fold_directories,
        pdf_viewer_zoom_mode: normalize_pdf_viewer_zoom_mode(&preferences.pdf_viewer_zoom_mode),
        pdf_viewer_spread_mode: normalize_pdf_viewer_spread_mode(&preferences.pdf_viewer_spread_mode),
        pdf_viewer_last_scale: normalize_pdf_viewer_last_scale(&preferences.pdf_viewer_last_scale),
        pdf_viewer_page_theme_mode: normalize_pdf_viewer_page_theme_mode(
            &preferences.pdf_viewer_page_theme_mode,
        ),
        markdown_citation_format: normalize_markdown_citation_format(
            &preferences.markdown_citation_format,
        ),
        latex_citation_command: normalize_latex_citation_command(
            &preferences.latex_citation_command,
        ),
        citation_insert_adds_space: preferences.citation_insert_adds_space,
        theme: normalize_theme(&preferences.theme),
    }
}

fn legacy_string(snapshot: &HashMap<String, String>, key: &str) -> Option<String> {
    snapshot
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn legacy_number(snapshot: &HashMap<String, String>, key: &str, fallback: i64) -> i64 {
    snapshot
        .get(key)
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn legacy_boolean(snapshot: &HashMap<String, String>, key: &str, fallback: bool) -> bool {
    match snapshot.get(key) {
        Some(value) => value != "false",
        None => fallback,
    }
}

fn legacy_true_only_boolean(snapshot: &HashMap<String, String>, key: &str, fallback: bool) -> bool {
    snapshot
        .get(key)
        .map(|value| value == "true")
        .unwrap_or(fallback)
}

fn migrate_legacy_preferences(snapshot: &HashMap<String, String>) -> WorkspacePreferences {
    let mut preferences = WorkspacePreferences::default();

    preferences.workbench.primary_surface =
        legacy_string(snapshot, "primarySurface").unwrap_or_else(default_primary_surface);
    preferences.workbench.left_sidebar_open =
        legacy_boolean(snapshot, "leftSidebarOpen", default_left_sidebar_open());
    preferences.workbench.left_sidebar_panel =
        legacy_string(snapshot, "leftSidebarPanel").unwrap_or_else(default_left_sidebar_panel);
    preferences.workbench.right_sidebar_open =
        legacy_true_only_boolean(snapshot, "rightSidebarOpen", default_right_sidebar_open());
    preferences.workbench.right_sidebar_panel =
        legacy_string(snapshot, "rightSidebarPanel").unwrap_or_else(default_right_sidebar_panel);

    preferences.auto_save = legacy_boolean(snapshot, "autoSave", default_auto_save());
    preferences.soft_wrap = legacy_boolean(snapshot, "softWrap", default_soft_wrap());
    preferences.wrap_column = legacy_number(snapshot, "wrapColumn", default_wrap_column());
    preferences.editor_font_size =
        legacy_number(snapshot, "editorFontSize", default_editor_font_size());
    preferences.ui_font_size = legacy_number(snapshot, "uiFontSize", default_ui_font_size());
    preferences.ui_font = legacy_string(snapshot, "uiFont").unwrap_or_else(default_ui_font);
    preferences.markdown_font = legacy_string(snapshot, "markdownFont")
        .or_else(|| legacy_string(snapshot, "proseFont"))
        .unwrap_or_else(default_markdown_font);
    preferences.latex_font =
        legacy_string(snapshot, "latexFont").unwrap_or_else(default_latex_font);
    preferences.preferred_locale =
        legacy_string(snapshot, "preferredLocale").unwrap_or_else(default_preferred_locale);
    preferences.markdown_preview_sync =
        legacy_boolean(snapshot, "markdownPreviewSync", default_markdown_preview_sync());
    preferences.editor_spellcheck =
        legacy_true_only_boolean(snapshot, "editorSpellcheck", default_editor_spellcheck());
    preferences.editor_line_numbers =
        legacy_boolean(snapshot, "editorLineNumbers", default_editor_line_numbers());
    preferences.editor_highlight_active_line = legacy_boolean(
        snapshot,
        "editorHighlightActiveLine",
        default_editor_highlight_active_line(),
    );
    preferences.file_tree_show_hidden =
        legacy_boolean(snapshot, "fileTreeShowHidden", default_file_tree_show_hidden());
    preferences.file_tree_sort_mode =
        legacy_string(snapshot, "fileTreeSortMode").unwrap_or_else(default_file_tree_sort_mode);
    preferences.file_tree_fold_directories = legacy_boolean(
        snapshot,
        "fileTreeFoldDirectories",
        default_file_tree_fold_directories(),
    );
    preferences.pdf_viewer_zoom_mode = legacy_string(snapshot, "pdfViewerZoomMode")
        .unwrap_or_else(default_pdf_viewer_zoom_mode);
    preferences.pdf_viewer_spread_mode = legacy_string(snapshot, "pdfViewerSpreadMode")
        .unwrap_or_else(default_pdf_viewer_spread_mode);
    preferences.pdf_viewer_last_scale = legacy_string(snapshot, "pdfViewerLastScale")
        .unwrap_or_else(default_pdf_viewer_last_scale);
    preferences.pdf_viewer_page_theme_mode = legacy_string(snapshot, "pdfViewerPageThemeMode")
        .unwrap_or_else(default_pdf_viewer_page_theme_mode);
    preferences.markdown_citation_format = legacy_string(snapshot, "markdownCitationFormat")
        .unwrap_or_else(default_markdown_citation_format);
    preferences.latex_citation_command = legacy_string(snapshot, "latexCitationCommand")
        .unwrap_or_else(default_latex_citation_command);
    preferences.citation_insert_adds_space = legacy_true_only_boolean(
        snapshot,
        "citationInsertAddsSpace",
        default_citation_insert_adds_space(),
    );
    preferences.theme = legacy_string(snapshot, "theme").unwrap_or_else(default_theme);

    normalize_workspace_preferences(preferences)
}

#[tauri::command]
pub async fn workspace_preferences_load(
    params: WorkspacePreferencesLoadParams,
) -> Result<WorkspacePreferences, String> {
    let loaded = read_workspace_preferences(&params.global_config_dir)?;
    let normalized = normalize_workspace_preferences(match loaded.clone() {
        Some(preferences) => preferences,
        None => migrate_legacy_preferences(&params.legacy_preferences),
    });

    if loaded.as_ref() != Some(&normalized) {
        write_workspace_preferences(&params.global_config_dir, &normalized)?;
    }

    Ok(normalized)
}

#[tauri::command]
pub async fn workspace_preferences_save(
    params: WorkspacePreferencesSaveParams,
) -> Result<WorkspacePreferences, String> {
    let normalized = normalize_workspace_preferences(params.preferences);
    write_workspace_preferences(&params.global_config_dir, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub async fn workspace_preferences_list_system_fonts() -> Result<Vec<String>, String> {
    read_system_font_families()
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_legacy_preferences, normalize_workspace_preferences,
        should_expose_system_font_family, WorkspacePreferences,
    };

    #[test]
    fn legacy_migration_maps_old_theme_ids() {
        let legacy = std::collections::HashMap::from([
            ("theme".to_string(), "monokai".to_string()),
            ("leftSidebarPanel".to_string(), "references".to_string()),
        ]);

        let migrated = migrate_legacy_preferences(&legacy);
        assert_eq!(migrated.theme, "dark");
        assert_eq!(migrated.workbench.left_sidebar_panel, "references");
    }

    #[test]
    fn normalization_clamps_numbers_and_colors() {
        let normalized = normalize_workspace_preferences(WorkspacePreferences {
            editor_font_size: 50,
            preferred_locale: "zh".to_string(),
            soft_wrap: false,
            ..WorkspacePreferences::default()
        });

        assert_eq!(normalized.editor_font_size, 20);
        assert_eq!(normalized.preferred_locale, "zh-CN");
        assert!(normalized.soft_wrap);
    }

    #[test]
    fn normalization_clamps_new_preference_values() {
        let normalized = normalize_workspace_preferences(WorkspacePreferences {
            file_tree_sort_mode: "recent".to_string(),
            pdf_viewer_zoom_mode: "weird".to_string(),
            pdf_viewer_spread_mode: "spread".to_string(),
            pdf_viewer_last_scale: "-1".to_string(),
            pdf_viewer_page_theme_mode: "custom".to_string(),
            markdown_citation_format: "inline".to_string(),
            latex_citation_command: "smartcite".to_string(),
            ..WorkspacePreferences::default()
        });

        assert_eq!(normalized.file_tree_sort_mode, "name");
        assert_eq!(normalized.pdf_viewer_zoom_mode, "page-width");
        assert_eq!(normalized.pdf_viewer_spread_mode, "single");
        assert_eq!(normalized.pdf_viewer_last_scale, "");
        assert_eq!(normalized.pdf_viewer_page_theme_mode, "theme");
        assert_eq!(normalized.markdown_citation_format, "bracketed");
        assert_eq!(normalized.latex_citation_command, "cite");
    }

    #[test]
    fn normalization_preserves_system_font_family() {
        let normalized = normalize_workspace_preferences(WorkspacePreferences {
            markdown_font: "system: PingFang SC ".to_string(),
            ..WorkspacePreferences::default()
        });

        assert_eq!(normalized.markdown_font, "system:PingFang SC");
    }

    #[test]
    fn legacy_migration_maps_old_prose_font_to_markdown_font() {
        let legacy = std::collections::HashMap::from([(
            "proseFont".to_string(),
            "system: New York".to_string(),
        )]);

        let migrated = migrate_legacy_preferences(&legacy);
        assert_eq!(migrated.markdown_font, "system:New York");
        assert_eq!(migrated.latex_font, "mono");
    }

    #[test]
    fn hides_internal_or_fallback_font_families() {
        assert!(!should_expose_system_font_family(".Beirut PUA"));
        assert!(!should_expose_system_font_family(
            ".CJK Symbols Fallback SC"
        ));
        assert!(!should_expose_system_font_family("LastResort"));
        assert!(should_expose_system_font_family("PingFang SC"));
    }
}
