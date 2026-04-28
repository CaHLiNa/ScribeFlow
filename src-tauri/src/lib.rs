mod app_dirs;
mod document_outline;
mod document_workflow;
mod document_workflow_action;
mod document_workflow_controller;
mod document_workflow_preview_binding;
mod document_workflow_session;
mod document_workflow_ui_state;
mod document_workspace_preview;
mod document_workspace_preview_state;
mod editor_session_runtime;
mod fs_commands;
mod fs_io;
mod fs_tree;
mod fs_tree_runtime;
mod fs_watch_runtime;
mod i18n_runtime;
mod keychain;
mod latex;
mod latex_compile;
mod latex_diagnostics;
mod latex_preferences;
mod latex_project_graph;
mod latex_runtime;
mod latex_tools;
mod legacy_cleanup;
mod markdown_runtime;
mod process_utils;
mod python_preferences;
mod python_runtime;
mod references_backend;
mod references_citation;
mod references_import;
mod references_merge;
mod references_mutation;
mod references_pdf;
mod references_query;
mod references_runtime;
mod references_snapshot;
mod references_zotero;
mod references_zotero_account;
mod security;
mod workbench_state;
mod workspace_access;
mod workspace_lifecycle;
mod workspace_preferences;

use percent_encoding::percent_decode_str;
use std::fs;
use std::path::Path;
use tauri::http::{header, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime};

#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, MenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg(target_os = "macos")]
fn apply_macos_window_vibrancy<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
    else {
        return;
    };

    if let Err(error) = apply_vibrancy(
        &window,
        NSVisualEffectMaterial::HudWindow,
        Some(NSVisualEffectState::Active),
        None,
    ) {
        eprintln!("Failed to apply macOS vibrancy: {error}");
    }
}

fn workspace_file_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("css") => "text/css; charset=utf-8",
        Some("csv") => "text/csv; charset=utf-8",
        Some("gif") => "image/gif",
        Some("htm") | Some("html") => "text/html; charset=utf-8",
        Some("ico") => "image/x-icon",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("pdf") => "application/pdf",
        Some("eps") | Some("ps") => "application/postscript",
        Some("txt") | Some("log") => "text/plain; charset=utf-8",
        Some("tif") | Some("tiff") => "image/tiff",
        Some("tsv") => "text/tab-separated-values; charset=utf-8",
        Some("webp") => "image/webp",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn workspace_protocol_response(
    status: StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .unwrap()
}

fn workspace_protocol_error(status: StatusCode, message: impl Into<String>) -> Response<Vec<u8>> {
    workspace_protocol_response(
        status,
        "text/plain; charset=utf-8",
        message.into().into_bytes(),
    )
}

fn parse_workspace_protocol_request_path(request_path: &str) -> Result<(String, String), String> {
    let mut segments = request_path
        .split('/')
        .filter(|segment| !segment.is_empty());

    let scope = segments
        .next()
        .ok_or_else(|| "Missing file scope".to_string())?;

    let scope = percent_decode_str(scope)
        .decode_utf8()
        .map_err(|_| "Invalid workspace scope encoding".to_string())?
        .into_owned();

    let decoded_segments = segments
        .map(|segment| {
            percent_decode_str(segment)
                .decode_utf8()
                .map(|value| value.into_owned())
                .map_err(|_| format!("Invalid workspace path segment encoding: {segment}"))
        })
        .collect::<Result<Vec<_>, _>>()?;

    let relative_path = decoded_segments.join("/");
    if relative_path.is_empty() {
        return Err("Missing file path".to_string());
    }

    Ok((scope, relative_path))
}

fn handle_workspace_protocol<R: Runtime>(
    app: &AppHandle<R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    eprintln!(
        "[workspace-protocol] request uri={} path={}",
        request.uri(),
        request.uri().path()
    );
    let (scope, relative_path) = match parse_workspace_protocol_request_path(request.uri().path()) {
        Ok(parts) => parts,
        Err(error) => return workspace_protocol_error(StatusCode::BAD_REQUEST, error),
    };

    let state = app.state::<security::WorkspaceScopeState>();
    let resolved = match security::resolve_allowed_scoped_path(&state, &scope, &relative_path) {
        Ok(path) => path,
        Err(error) if error.contains("No active") => {
            return workspace_protocol_error(StatusCode::FORBIDDEN, error)
        }
        Err(error) if error.contains("outside") || error.contains("traversal") => {
            return workspace_protocol_error(StatusCode::FORBIDDEN, error)
        }
        Err(error) => return workspace_protocol_error(StatusCode::BAD_REQUEST, error),
    };

    eprintln!(
        "[workspace-protocol] resolved scope={} relative_path={} absolute_path={}",
        scope,
        relative_path,
        resolved.display()
    );

    let bytes = match fs::read(&resolved) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return workspace_protocol_error(
                StatusCode::NOT_FOUND,
                format!("File not found: {}", resolved.display()),
            )
        }
        Err(error) => {
            return workspace_protocol_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to read file: {error}"),
            )
        }
    };

    workspace_protocol_response(
        StatusCode::OK,
        workspace_file_content_type(&resolved),
        bytes,
    )
}

/// Enrich PATH with common tool locations so production .app bundles
/// can find Python, R, Jupyter, Homebrew binaries, etc.
#[cfg(unix)]
fn enrich_path() {
    let home = std::env::var("HOME").unwrap_or_default();
    let extra_paths = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        &format!("{}/.cargo/bin", home),
        &format!("{}/.pyenv/shims", home),
        &format!("{}/.local/bin", home),
        &format!("{}/miniconda3/bin", home),
        &format!("{}/miniforge3/bin", home),
        &format!("{}/anaconda3/bin", home),
        "/Library/TeX/texbin",
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    let enriched = extra_paths.join(":") + ":" + &current;
    std::env::set_var("PATH", enriched);
}

#[cfg(target_os = "macos")]
const MENU_OPEN_FOLDER: &str = "menu-open-folder";
#[cfg(target_os = "macos")]
const MENU_CLOSE_FOLDER: &str = "menu-close-folder";
#[cfg(target_os = "macos")]
const MENU_NEW_FILE: &str = "menu-new-file";
#[cfg(target_os = "macos")]
const MENU_OPEN_SETTINGS: &str = "menu-open-settings";
#[cfg(target_os = "macos")]
const MENU_TOGGLE_LEFT_SIDEBAR: &str = "menu-toggle-left-sidebar";

#[cfg(target_os = "macos")]
fn detect_is_chinese_locale() -> bool {
    sys_locale::get_locale()
        .map(|value| value.to_lowercase().starts_with("zh"))
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn dispatch_frontend_event<R: Runtime>(
    app: &AppHandle<R>,
    event_name: &str,
    detail: Option<serde_json::Value>,
) {
    let Some(window) = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
    else {
        return;
    };

    let event_name = serde_json::to_string(event_name).unwrap_or_else(|_| "\"\"".into());
    let script = if let Some(detail) = detail {
        format!(
            "window.dispatchEvent(new CustomEvent({}, {{ detail: {} }}));",
            event_name, detail
        )
    } else {
        format!("window.dispatchEvent(new CustomEvent({}));", event_name)
    };

    if let Err(error) = window.eval(script) {
        eprintln!("Failed to dispatch menu event {event_name}: {error}");
    }
}

#[cfg(target_os = "macos")]
fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let zh = detect_is_chinese_locale();
    let label = |zh_text: &'static str, en_text: &'static str| {
        if zh {
            zh_text
        } else {
            en_text
        }
    };

    let about_metadata = AboutMetadata {
        name: Some("ScribeFlow".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        ..Default::default()
    };

    let new_file = MenuItem::with_id(
        app,
        MENU_NEW_FILE,
        label("新建文件", "New File"),
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let open_folder = MenuItem::with_id(
        app,
        MENU_OPEN_FOLDER,
        label("打开文件夹...", "Open Folder..."),
        true,
        Some("CmdOrCtrl+O"),
    )?;
    let close_folder = MenuItem::with_id(
        app,
        MENU_CLOSE_FOLDER,
        label("关闭文件夹", "Close Folder"),
        true,
        None::<&str>,
    )?;
    let open_settings = MenuItem::with_id(
        app,
        MENU_OPEN_SETTINGS,
        label("设置...", "Settings..."),
        true,
        None::<&str>,
    )?;
    let toggle_left_sidebar = MenuItem::with_id(
        app,
        MENU_TOGGLE_LEFT_SIDEBAR,
        label("切换左侧边栏", "Toggle Left Sidebar"),
        true,
        None::<&str>,
    )?;

    let app_menu = SubmenuBuilder::new(app, "ScribeFlow")
        .about_with_text(
            label("关于 ScribeFlow", "About ScribeFlow"),
            Some(about_metadata),
        )
        .item(&open_settings)
        .separator()
        .services_with_text(label("服务", "Services"))
        .separator()
        .hide_with_text(label("隐藏 ScribeFlow", "Hide ScribeFlow"))
        .hide_others_with_text(label("隐藏其他", "Hide Others"))
        .show_all_with_text(label("显示全部", "Show All"))
        .separator()
        .quit_with_text(label("退出 ScribeFlow", "Quit ScribeFlow"))
        .build()?;

    let file_menu = SubmenuBuilder::new(app, label("文件", "File"))
        .item(&new_file)
        .separator()
        .item(&open_folder)
        .item(&close_folder)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, label("编辑", "Edit"))
        .undo_with_text(label("撤销", "Undo"))
        .redo_with_text(label("重做", "Redo"))
        .separator()
        .cut_with_text(label("剪切", "Cut"))
        .copy_with_text(label("复制", "Copy"))
        .paste_with_text(label("粘贴", "Paste"))
        .separator()
        .select_all_with_text(label("全选", "Select All"))
        .build()?;

    let view_menu = SubmenuBuilder::new(app, label("显示", "View"))
        .item(&toggle_left_sidebar)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, label("窗口", "Window"))
        .minimize_with_text(label("最小化", "Minimize"))
        .maximize_with_text(label("缩放", "Zoom"))
        .fullscreen_with_text(label("进入全屏", "Enter Full Screen"))
        .separator()
        .close_window_with_text(label("关闭窗口", "Close Window"))
        .build()?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

#[cfg(target_os = "macos")]
fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    if event.id() == MENU_NEW_FILE {
        dispatch_frontend_event(app, "app:new-file", None);
    } else if event.id() == MENU_OPEN_FOLDER {
        dispatch_frontend_event(app, "app:open-folder", None);
    } else if event.id() == MENU_CLOSE_FOLDER {
        dispatch_frontend_event(app, "app:close-folder", None);
    } else if event.id() == MENU_OPEN_SETTINGS {
        dispatch_frontend_event(app, "app:open-settings", None);
    } else if event.id() == MENU_TOGGLE_LEFT_SIDEBAR {
        dispatch_frontend_event(app, "app:toggle-left-sidebar", None);
    }
}

pub fn run() {
    #[cfg(unix)]
    enrich_path();

    if let Err(error) = legacy_cleanup::run_legacy_cleanup_once() {
        eprintln!("Failed to complete one-time legacy cleanup: {error}");
    }

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("scribeflow-workspace", |ctx, request| {
            handle_workspace_protocol(ctx.app_handle(), request)
        })
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(latex::LatexState::default())
        .manage(latex_runtime::LatexRuntimeState::default())
        .manage(fs_watch_runtime::WorkspaceTreeWatchState::default())
        .manage(security::WorkspaceScopeState::default())
        .manage(workspace_access::WorkspaceAccessState::default());

    #[cfg(target_os = "macos")]
    let builder = builder
        .setup(|app| {
            apply_macos_window_vibrancy(app.handle());
            Ok(())
        })
        .menu(|app| build_app_menu(app))
        .on_menu_event(handle_menu_event);

    builder
        .invoke_handler(tauri::generate_handler![
            fs_commands::read_dir_shallow,
            fs_commands::list_files_recursive,
            fs_commands::read_visible_tree,
            fs_commands::read_workspace_tree_snapshot,
            fs_watch_runtime::workspace_tree_watch_start,
            fs_watch_runtime::workspace_tree_watch_note_activity,
            fs_watch_runtime::workspace_tree_watch_set_visibility,
            fs_watch_runtime::workspace_tree_watch_stop,
            fs_commands::read_file,
            fs_commands::read_file_base64,
            fs_commands::render_image_preview,
            fs_commands::write_file,
            fs_commands::write_file_base64,
            fs_commands::create_file,
            fs_commands::workspace_create_file,
            fs_commands::create_dir,
            fs_commands::rename_path,
            fs_commands::workspace_rename_path,
            fs_commands::delete_path,
            fs_commands::copy_file,
            fs_commands::copy_dir,
            fs_commands::workspace_duplicate_path,
            fs_commands::workspace_move_path,
            fs_commands::workspace_copy_external_path,
            fs_commands::is_directory,
            fs_commands::path_exists,
            fs_tree_runtime::fs_tree_load_workspace_state,
            fs_tree_runtime::fs_tree_reveal_workspace_state,
            fs_tree_runtime::fs_tree_restore_cached_expanded_state,
            document_workflow::document_workflow_reconcile,
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            fs_commands::reveal_in_file_manager,
            fs_commands::open_path_in_default_app,
            fs_commands::get_global_config_dir,
            fs_commands::get_home_dir,
            i18n_runtime::i18n_runtime_load,
            references_backend::references_library_read_or_create,
            references_backend::references_library_load_workspace,
            references_backend::references_library_write,
            references_backend::references_snapshot_normalize,
            references_backend::references_record_normalize,
            references_backend::references_asset_store,
            references_backend::references_assets_migrate,
            references_citation::references_citation_render,
            references_import::references_crossref_lookup_by_doi,
            references_import::references_crossref_search_by_metadata,
            references_import::references_import_parse_text,
            references_import::references_import_detect_format,
            references_import::references_import_from_text,
            references_import::references_export_bibtex,
            references_pdf::references_pdf_extract_text,
            references_pdf::references_pdf_extract_metadata,
            references_runtime::references_find_duplicate,
            references_runtime::references_merge_imported,
            references_runtime::references_import_pdf,
            references_runtime::references_record_from_csl,
            references_runtime::references_scan_workspace_styles,
            references_runtime::references_write_bib_file,
            references_mutation::references_mutation_apply,
            references_query::references_query_resolve,
            references_zotero_account::references_zotero_api_key_store,
            references_zotero_account::references_zotero_api_key_load,
            references_zotero_account::references_zotero_api_key_clear,
            references_zotero_account::references_zotero_disconnect,
            references_zotero::references_zotero_config_load,
            references_zotero::references_zotero_config_save,
            references_zotero::references_zotero_validate_api_key,
            references_zotero::references_zotero_fetch_user_groups,
            references_zotero::references_zotero_fetch_collections,
            references_zotero::references_zotero_sync,
            references_zotero::references_zotero_sync_persist,
            references_zotero::references_zotero_delete_item,
            document_outline::document_outline_resolve,
            document_workflow_action::document_workflow_action_resolve,
            document_workflow_controller::document_workflow_controller_execute,
            document_workflow_session::document_workflow_session_load,
            document_workflow_session::document_workflow_session_save,
            document_workflow_ui_state::document_workflow_ui_resolve,
            document_workspace_preview::document_workspace_preview_mutate,
            document_workspace_preview_state::document_workspace_preview_state_resolve,
            editor_session_runtime::editor_session_load,
            editor_session_runtime::editor_session_save,
            editor_session_runtime::editor_recent_files_load,
            editor_session_runtime::editor_recent_files_save,
            markdown_runtime::markdown_extract_headings,
            python_preferences::python_preferences_load,
            python_preferences::python_preferences_save,
            python_runtime::python_runtime_detect,
            python_runtime::python_runtime_list,
            python_runtime::python_runtime_compile,
            latex_project_graph::latex_project_graph_resolve,
            latex_project_graph::latex_compile_request_resolve,
            latex_project_graph::latex_compile_targets_resolve,
            latex_project_graph::latex_affected_root_targets_resolve,
            latex_runtime::latex_runtime_compile_start,
            latex_runtime::latex_runtime_cancel,
            latex_runtime::latex_runtime_compile_execute,
            latex_runtime::latex_runtime_lint_resolve,
            latex_runtime::latex_runtime_schedule,
            latex_runtime::latex_runtime_compile_finish,
            latex_runtime::latex_runtime_compile_fail,
            latex_preferences::latex_preferences_load,
            latex_preferences::latex_preferences_save,
            security::workspace_set_allowed_roots,
            security::workspace_clear_allowed_roots,
            workspace_access::macos_create_workspace_bookmark,
            workspace_access::macos_capture_workspace_bookmark,
            workspace_access::macos_activate_workspace_bookmark,
            workspace_access::macos_activate_workspace_bookmark_for_path,
            workspace_access::macos_release_workspace_access,
            workspace_access::workspace_bookmark_remove,
            workspace_lifecycle::workspace_lifecycle_load,
            workspace_lifecycle::workspace_lifecycle_prepare_close,
            workspace_lifecycle::workspace_lifecycle_load_bootstrap_data,
            workspace_lifecycle::workspace_lifecycle_prepare_open,
            workspace_lifecycle::workspace_lifecycle_record_opened,
            workspace_lifecycle::workspace_lifecycle_resolve_bootstrap_plan,
            workspace_lifecycle::workspace_lifecycle_save,
            workbench_state::workbench_state_normalize,
            workbench_state::workbench_layout_load,
            workbench_state::workbench_layout_save,
            workspace_preferences::workspace_preferences_load,
            workspace_preferences::workspace_preferences_save,
            workspace_preferences::workspace_preferences_list_system_fonts,
            latex::compile_latex,
            latex::check_latex_compilers,
            latex::check_latex_tools,
            latex::download_tectonic,
            latex::run_chktex,
            latex::format_latex_document,
            latex::synctex_forward,
            latex::synctex_backward,
            latex::read_latex_synctex,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
