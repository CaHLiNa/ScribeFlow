use crate::app_dirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const WORKSPACE_SURFACE: &str = "workspace";
const SETTINGS_SURFACE: &str = "settings";
const WORKBENCH_LAYOUT_VERSION: u32 = 1;
const DEFAULT_LEFT_SIDEBAR_WIDTH: i64 = 240;
const DEFAULT_RIGHT_SIDEBAR_WIDTH: i64 = 360;
const DEFAULT_DOCUMENT_DOCK_WIDTH: i64 = 360;
const DEFAULT_REFERENCE_DOCK_WIDTH: i64 = 420;
const DEFAULT_BOTTOM_PANEL_HEIGHT: i64 = 250;
const MIN_SIDEBAR_WIDTH: i64 = 0;
const MAX_SIDEBAR_WIDTH: i64 = 2000;
const MIN_BOTTOM_PANEL_HEIGHT: i64 = 100;
const MAX_BOTTOM_PANEL_HEIGHT: i64 = 600;

const DEFAULT_WORKSPACE_SIDEBAR_PANEL: &str = "files";
const DEFAULT_SETTINGS_SIDEBAR_PANEL: &str = "files";
const DEFAULT_WORKSPACE_INSPECTOR_PANEL: &str = "dock";
const DEFAULT_SETTINGS_INSPECTOR_PANEL: &str = "";
const DEFAULT_DOCUMENT_DOCK_PAGE: &str = "preview";
const DEFAULT_REFERENCE_DOCK_PAGE: &str = "details";
const DOCUMENT_DOCK_FILE_PAGE: &str = "file";
const DOCUMENT_DOCK_PROBLEMS_PAGE: &str = "problems";
const DOCUMENT_DOCK_REFERENCES_PAGE: &str = "references";
const REFERENCE_DOCK_PDF_PAGE: &str = "pdf";
const REFERENCE_DOCK_CITED_IN_PAGE: &str = "cited-in";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchState {
    #[serde(default = "default_primary_surface")]
    pub primary_surface: String,
    #[serde(default = "default_left_sidebar_open")]
    pub left_sidebar_open: bool,
    #[serde(default = "default_left_sidebar_panel")]
    pub left_sidebar_panel: String,
    #[serde(default = "default_right_sidebar_open")]
    pub right_sidebar_open: bool,
    #[serde(default = "default_right_sidebar_panel")]
    pub right_sidebar_panel: String,
    #[serde(default = "default_document_dock_open")]
    pub document_dock_open: bool,
    #[serde(default = "default_reference_dock_open")]
    pub reference_dock_open: bool,
    #[serde(default = "default_document_dock_active_page")]
    pub document_dock_active_page: String,
    #[serde(default = "default_reference_dock_active_page")]
    pub reference_dock_active_page: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchLayoutState {
    #[serde(default = "default_left_sidebar_width")]
    pub left_sidebar_width: i64,
    #[serde(default = "default_right_sidebar_width")]
    pub right_sidebar_width: i64,
    #[serde(default = "default_document_dock_width")]
    pub document_dock_width: i64,
    #[serde(default = "default_reference_dock_width")]
    pub reference_dock_width: i64,
    #[serde(default = "default_bottom_panel_height")]
    pub bottom_panel_height: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchDockPageDefinition {
    pub id: String,
    pub permanent: bool,
    pub dynamic: bool,
    pub closeable: bool,
    pub fallback_page: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchDockSurfaceContract {
    pub default_page: String,
    pub pages: Vec<WorkbenchDockPageDefinition>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchDockPageContract {
    pub document: WorkbenchDockSurfaceContract,
    pub reference: WorkbenchDockSurfaceContract,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkbenchLayoutFile {
    #[serde(default = "default_workbench_layout_version")]
    version: u32,
    #[serde(flatten)]
    state: WorkbenchLayoutState,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchLayoutLoadParams {}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchLayoutSaveParams {
    #[serde(default)]
    pub state: WorkbenchLayoutState,
}

impl Default for WorkbenchState {
    fn default() -> Self {
        Self {
            primary_surface: default_primary_surface(),
            left_sidebar_open: default_left_sidebar_open(),
            left_sidebar_panel: default_left_sidebar_panel(),
            right_sidebar_open: default_right_sidebar_open(),
            right_sidebar_panel: default_right_sidebar_panel(),
            document_dock_open: default_document_dock_open(),
            reference_dock_open: default_reference_dock_open(),
            document_dock_active_page: default_document_dock_active_page(),
            reference_dock_active_page: default_reference_dock_active_page(),
        }
    }
}

impl Default for WorkbenchLayoutState {
    fn default() -> Self {
        Self {
            left_sidebar_width: default_left_sidebar_width(),
            right_sidebar_width: default_right_sidebar_width(),
            document_dock_width: default_document_dock_width(),
            reference_dock_width: default_reference_dock_width(),
            bottom_panel_height: default_bottom_panel_height(),
        }
    }
}

fn default_workbench_layout_version() -> u32 {
    WORKBENCH_LAYOUT_VERSION
}

fn default_left_sidebar_width() -> i64 {
    DEFAULT_LEFT_SIDEBAR_WIDTH
}

fn default_right_sidebar_width() -> i64 {
    DEFAULT_RIGHT_SIDEBAR_WIDTH
}

fn default_document_dock_width() -> i64 {
    DEFAULT_DOCUMENT_DOCK_WIDTH
}

fn default_reference_dock_width() -> i64 {
    DEFAULT_REFERENCE_DOCK_WIDTH
}

fn default_bottom_panel_height() -> i64 {
    DEFAULT_BOTTOM_PANEL_HEIGHT
}

fn default_primary_surface() -> String {
    WORKSPACE_SURFACE.to_string()
}

fn default_left_sidebar_open() -> bool {
    true
}

fn default_left_sidebar_panel() -> String {
    DEFAULT_WORKSPACE_SIDEBAR_PANEL.to_string()
}

fn default_right_sidebar_open() -> bool {
    false
}

fn default_right_sidebar_panel() -> String {
    DEFAULT_WORKSPACE_INSPECTOR_PANEL.to_string()
}

fn default_document_dock_open() -> bool {
    false
}

fn default_reference_dock_open() -> bool {
    false
}

fn default_document_dock_active_page() -> String {
    DEFAULT_DOCUMENT_DOCK_PAGE.to_string()
}

fn default_reference_dock_active_page() -> String {
    DEFAULT_REFERENCE_DOCK_PAGE.to_string()
}

fn allowed_sidebar_panels(surface: &str) -> &'static [&'static str] {
    match surface {
        SETTINGS_SURFACE => &[DEFAULT_SETTINGS_SIDEBAR_PANEL],
        _ => &[DEFAULT_WORKSPACE_SIDEBAR_PANEL, "references"],
    }
}

fn allowed_inspector_panels(surface: &str) -> &'static [&'static str] {
    match surface {
        SETTINGS_SURFACE => &[DEFAULT_SETTINGS_INSPECTOR_PANEL],
        _ => &[DEFAULT_WORKSPACE_INSPECTOR_PANEL],
    }
}

fn default_sidebar_panel_for_surface(surface: &str) -> &'static str {
    match surface {
        SETTINGS_SURFACE => DEFAULT_SETTINGS_SIDEBAR_PANEL,
        _ => DEFAULT_WORKSPACE_SIDEBAR_PANEL,
    }
}

fn default_inspector_panel_for_surface(surface: &str) -> &'static str {
    match surface {
        SETTINGS_SURFACE => DEFAULT_SETTINGS_INSPECTOR_PANEL,
        _ => DEFAULT_WORKSPACE_INSPECTOR_PANEL,
    }
}

pub fn normalize_workbench_surface(value: &str) -> String {
    match value.trim() {
        SETTINGS_SURFACE => SETTINGS_SURFACE.to_string(),
        _ => WORKSPACE_SURFACE.to_string(),
    }
}

pub fn normalize_workbench_sidebar_panel(surface: &str, panel: &str) -> String {
    let normalized_surface = normalize_workbench_surface(surface);
    let normalized_panel = panel.trim();
    if allowed_sidebar_panels(&normalized_surface).contains(&normalized_panel) {
        normalized_panel.to_string()
    } else {
        default_sidebar_panel_for_surface(&normalized_surface).to_string()
    }
}

pub fn normalize_workbench_inspector_panel(surface: &str, panel: &str) -> String {
    let normalized_surface = normalize_workbench_surface(surface);
    let normalized_panel = panel.trim();
    if allowed_inspector_panels(&normalized_surface).contains(&normalized_panel) {
        normalized_panel.to_string()
    } else {
        default_inspector_panel_for_surface(&normalized_surface).to_string()
    }
}

pub fn normalize_document_dock_page(value: &str) -> String {
    match value.trim() {
        DOCUMENT_DOCK_FILE_PAGE => DOCUMENT_DOCK_FILE_PAGE.to_string(),
        DOCUMENT_DOCK_PROBLEMS_PAGE => DOCUMENT_DOCK_PROBLEMS_PAGE.to_string(),
        DOCUMENT_DOCK_REFERENCES_PAGE => DOCUMENT_DOCK_REFERENCES_PAGE.to_string(),
        _ => DEFAULT_DOCUMENT_DOCK_PAGE.to_string(),
    }
}

pub fn normalize_reference_dock_page(value: &str) -> String {
    match value.trim() {
        REFERENCE_DOCK_PDF_PAGE => REFERENCE_DOCK_PDF_PAGE.to_string(),
        REFERENCE_DOCK_CITED_IN_PAGE => REFERENCE_DOCK_CITED_IN_PAGE.to_string(),
        _ => DEFAULT_REFERENCE_DOCK_PAGE.to_string(),
    }
}

fn dock_page_definition(
    id: &str,
    permanent: bool,
    dynamic: bool,
    closeable: bool,
    fallback_page: &str,
) -> WorkbenchDockPageDefinition {
    WorkbenchDockPageDefinition {
        id: id.to_string(),
        permanent,
        dynamic,
        closeable,
        fallback_page: fallback_page.to_string(),
    }
}

pub fn workbench_dock_page_contract() -> WorkbenchDockPageContract {
    WorkbenchDockPageContract {
        document: WorkbenchDockSurfaceContract {
            default_page: DEFAULT_DOCUMENT_DOCK_PAGE.to_string(),
            pages: vec![
                dock_page_definition(
                    DEFAULT_DOCUMENT_DOCK_PAGE,
                    true,
                    false,
                    true,
                    DOCUMENT_DOCK_FILE_PAGE,
                ),
                dock_page_definition(
                    DOCUMENT_DOCK_REFERENCES_PAGE,
                    true,
                    false,
                    false,
                    DEFAULT_DOCUMENT_DOCK_PAGE,
                ),
                dock_page_definition(
                    DOCUMENT_DOCK_PROBLEMS_PAGE,
                    false,
                    true,
                    true,
                    DEFAULT_DOCUMENT_DOCK_PAGE,
                ),
                dock_page_definition(
                    DOCUMENT_DOCK_FILE_PAGE,
                    false,
                    true,
                    true,
                    DEFAULT_DOCUMENT_DOCK_PAGE,
                ),
            ],
        },
        reference: WorkbenchDockSurfaceContract {
            default_page: DEFAULT_REFERENCE_DOCK_PAGE.to_string(),
            pages: vec![
                dock_page_definition(
                    DEFAULT_REFERENCE_DOCK_PAGE,
                    true,
                    false,
                    false,
                    DEFAULT_REFERENCE_DOCK_PAGE,
                ),
                dock_page_definition(
                    REFERENCE_DOCK_CITED_IN_PAGE,
                    false,
                    true,
                    false,
                    DEFAULT_REFERENCE_DOCK_PAGE,
                ),
                dock_page_definition(
                    REFERENCE_DOCK_PDF_PAGE,
                    false,
                    true,
                    true,
                    DEFAULT_REFERENCE_DOCK_PAGE,
                ),
            ],
        },
    }
}

pub fn normalize_workbench_state(state: WorkbenchState) -> WorkbenchState {
    let primary_surface = normalize_workbench_surface(&state.primary_surface);
    let left_sidebar_panel =
        normalize_workbench_sidebar_panel(&primary_surface, &state.left_sidebar_panel);
    let document_dock_open = state.document_dock_open;
    let reference_dock_open = state.reference_dock_open;

    WorkbenchState {
        primary_surface: primary_surface.clone(),
        left_sidebar_open: state.left_sidebar_open,
        left_sidebar_panel,
        right_sidebar_open: document_dock_open || reference_dock_open,
        right_sidebar_panel: normalize_workbench_inspector_panel(
            &primary_surface,
            &state.right_sidebar_panel,
        ),
        document_dock_open,
        reference_dock_open,
        document_dock_active_page: normalize_document_dock_page(&state.document_dock_active_page),
        reference_dock_active_page: normalize_reference_dock_page(
            &state.reference_dock_active_page,
        ),
    }
}

fn clamp_i64(value: i64, minimum: i64, maximum: i64) -> i64 {
    value.max(minimum).min(maximum)
}

pub fn normalize_workbench_layout_state(state: WorkbenchLayoutState) -> WorkbenchLayoutState {
    WorkbenchLayoutState {
        left_sidebar_width: clamp_i64(
            state.left_sidebar_width,
            MIN_SIDEBAR_WIDTH,
            MAX_SIDEBAR_WIDTH,
        ),
        right_sidebar_width: clamp_i64(
            state.right_sidebar_width,
            MIN_SIDEBAR_WIDTH,
            MAX_SIDEBAR_WIDTH,
        ),
        document_dock_width: clamp_i64(
            state.document_dock_width,
            MIN_SIDEBAR_WIDTH,
            MAX_SIDEBAR_WIDTH,
        ),
        reference_dock_width: clamp_i64(
            state.reference_dock_width,
            MIN_SIDEBAR_WIDTH,
            MAX_SIDEBAR_WIDTH,
        ),
        bottom_panel_height: clamp_i64(
            state.bottom_panel_height,
            MIN_BOTTOM_PANEL_HEIGHT,
            MAX_BOTTOM_PANEL_HEIGHT,
        ),
    }
}

fn workbench_layout_path() -> Result<PathBuf, String> {
    Ok(app_dirs::data_root_dir()?.join("workbench-layout.json"))
}

fn read_workbench_layout_state() -> Result<Option<WorkbenchLayoutState>, String> {
    let path = workbench_layout_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    if let Ok(parsed) = serde_json::from_str::<WorkbenchLayoutFile>(&content) {
        return Ok(Some(parsed.state));
    }
    let parsed = serde_json::from_str::<WorkbenchLayoutState>(&content)
        .map_err(|error| format!("Failed to parse workbench layout state: {error}"))?;
    Ok(Some(parsed))
}

fn write_workbench_layout_state(
    state: WorkbenchLayoutState,
) -> Result<WorkbenchLayoutState, String> {
    let normalized = normalize_workbench_layout_state(state);
    let path = workbench_layout_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = WorkbenchLayoutFile {
        version: WORKBENCH_LAYOUT_VERSION,
        state: normalized.clone(),
    };
    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize workbench layout state: {error}"))?;
    fs::write(path, serialized).map_err(|error| error.to_string())?;
    Ok(normalized)
}

#[tauri::command]
pub async fn workbench_state_normalize(params: WorkbenchState) -> Result<WorkbenchState, String> {
    Ok(normalize_workbench_state(params))
}

#[tauri::command]
pub async fn workbench_dock_page_contract_load() -> Result<WorkbenchDockPageContract, String> {
    Ok(workbench_dock_page_contract())
}

#[tauri::command]
pub async fn workbench_layout_load(
    _params: WorkbenchLayoutLoadParams,
) -> Result<WorkbenchLayoutState, String> {
    if let Some(current) = read_workbench_layout_state()? {
        return Ok(normalize_workbench_layout_state(current));
    }
    write_workbench_layout_state(WorkbenchLayoutState::default())
}

#[tauri::command]
pub async fn workbench_layout_save(
    params: WorkbenchLayoutSaveParams,
) -> Result<WorkbenchLayoutState, String> {
    write_workbench_layout_state(params.state)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_document_dock_page, normalize_reference_dock_page,
        normalize_workbench_inspector_panel, normalize_workbench_layout_state,
        normalize_workbench_sidebar_panel, normalize_workbench_state, workbench_dock_page_contract,
        WorkbenchLayoutState, WorkbenchState,
    };

    #[test]
    fn sidebar_panel_falls_back_by_surface() {
        assert_eq!(
            normalize_workbench_sidebar_panel("workspace", "missing"),
            "files"
        );
        assert_eq!(
            normalize_workbench_sidebar_panel("settings", "references"),
            "files"
        );
    }

    #[test]
    fn inspector_panel_is_cleared_on_settings_surface() {
        assert_eq!(
            normalize_workbench_inspector_panel("settings", "outline"),
            ""
        );
    }

    #[test]
    fn state_normalization_uses_surface_specific_defaults() {
        let normalized = normalize_workbench_state(WorkbenchState {
            primary_surface: "settings".to_string(),
            left_sidebar_open: true,
            left_sidebar_panel: "references".to_string(),
            right_sidebar_open: true,
            right_sidebar_panel: "outline".to_string(),
            document_dock_open: false,
            reference_dock_open: false,
            document_dock_active_page: "missing".to_string(),
            reference_dock_active_page: "pdf".to_string(),
        });

        assert_eq!(normalized.primary_surface, "settings");
        assert_eq!(normalized.left_sidebar_panel, "files");
        assert_eq!(normalized.right_sidebar_panel, "");
        assert!(!normalized.document_dock_open);
        assert!(!normalized.right_sidebar_open);
        assert_eq!(normalized.document_dock_active_page, "preview");
        assert_eq!(normalized.reference_dock_active_page, "pdf");
    }

    #[test]
    fn dock_page_contract_defines_allowed_pages() {
        let contract = workbench_dock_page_contract();
        let document_page_ids: Vec<_> = contract
            .document
            .pages
            .iter()
            .map(|page| page.id.as_str())
            .collect();
        let reference_page_ids: Vec<_> = contract
            .reference
            .pages
            .iter()
            .map(|page| page.id.as_str())
            .collect();

        assert_eq!(contract.document.default_page, "preview");
        assert_eq!(contract.reference.default_page, "details");
        assert_eq!(
            document_page_ids,
            vec!["preview", "references", "problems", "file"]
        );
        assert_eq!(reference_page_ids, vec!["details", "cited-in", "pdf"]);
        assert_eq!(contract.document.pages[0].fallback_page, "file");
        assert!(contract.document.pages[0].closeable);
        assert_eq!(contract.document.pages[1].fallback_page, "preview");
        assert!(contract.document.pages[1].permanent);
        assert!(!contract.document.pages[1].dynamic);
        assert!(!contract.document.pages[1].closeable);
        assert_eq!(contract.document.pages[2].fallback_page, "preview");
        assert!(!contract.document.pages[2].permanent);
        assert!(contract.document.pages[2].dynamic);
        assert!(contract.document.pages[2].closeable);
        assert_eq!(contract.reference.pages[1].fallback_page, "details");
        assert!(!contract.reference.pages[1].permanent);
        assert!(contract.reference.pages[1].dynamic);
        assert!(!contract.reference.pages[1].closeable);
        assert!(contract.reference.pages[2].closeable);
    }

    #[test]
    fn dock_page_normalization_falls_back_to_contract_defaults() {
        assert_eq!(normalize_document_dock_page("file"), "file");
        assert_eq!(normalize_document_dock_page("problems"), "problems");
        assert_eq!(normalize_document_dock_page("references"), "references");
        assert_eq!(normalize_document_dock_page("unknown"), "preview");
        assert_eq!(normalize_reference_dock_page("pdf"), "pdf");
        assert_eq!(normalize_reference_dock_page("cited-in"), "cited-in");
        assert_eq!(normalize_reference_dock_page("unknown"), "details");
    }

    #[test]
    fn layout_state_clamps_persisted_dimensions() {
        let normalized = normalize_workbench_layout_state(WorkbenchLayoutState {
            left_sidebar_width: -1,
            right_sidebar_width: 5000,
            document_dock_width: 3200,
            reference_dock_width: 3300,
            bottom_panel_height: 10,
        });

        assert_eq!(normalized.left_sidebar_width, 0);
        assert_eq!(normalized.right_sidebar_width, 2000);
        assert_eq!(normalized.document_dock_width, 2000);
        assert_eq!(normalized.reference_dock_width, 2000);
        assert_eq!(normalized.bottom_panel_height, 100);
    }
}
