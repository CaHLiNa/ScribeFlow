mod ai_agent_execute;
mod ai_agent_prepare;
mod ai_agent_prompt;
mod ai_agent_run;
mod ai_agent_session_runtime;
mod ai_artifact_runtime;
mod ai_attachment_runtime;
mod ai_client_session_runtime;
mod ai_config;
mod ai_provider_catalog;
mod ai_provider_credentials;
mod ai_runtime;
mod ai_runtime_session_rail;
mod ai_runtime_thread_client;
mod ai_runtime_turn_wait;
mod ai_session_local_runtime;
mod ai_session_storage;
mod ai_skill_catalog;
mod ai_skill_management;
mod ai_skill_support;
mod ai_skill_text;
mod ai_tool_catalog;
mod app_dirs;
mod codex_runtime;
mod document_workflow;
mod fs_commands;
mod fs_io;
mod fs_tree;
mod fs_tree_runtime;
mod i18n_runtime;
mod keychain;
mod latex;
mod latex_project_graph;
mod latex_runtime;
mod latex_tools;
mod markdown_runtime;
mod native_editor_bridge;
mod native_editor_runtime;
mod network;
mod process_utils;
mod references_backend;
mod references_citation;
mod references_import;
mod references_pdf;
mod references_runtime;
mod references_zotero;
mod references_zotero_account;
mod security;
mod workspace_access;

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
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
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
        name: Some("Altals".into()),
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

    let app_menu = SubmenuBuilder::new(app, "Altals")
        .about_with_text(label("关于 Altals", "About Altals"), Some(about_metadata))
        .item(&open_settings)
        .separator()
        .services_with_text(label("服务", "Services"))
        .separator()
        .hide_with_text(label("隐藏 Altals", "Hide Altals"))
        .hide_others_with_text(label("隐藏其他", "Hide Others"))
        .show_all_with_text(label("显示全部", "Show All"))
        .separator()
        .quit_with_text(label("退出 Altals", "Quit Altals"))
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

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("altals-workspace", |ctx, request| {
            handle_workspace_protocol(ctx.app_handle(), request)
        })
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(codex_runtime::CodexRuntimeHandle::default())
        .manage(latex::LatexState::default())
        .manage(native_editor_runtime::NativeEditorRuntimeState::default())
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
            fs_commands::read_file,
            fs_commands::read_file_base64,
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
            fs_tree_runtime::fs_tree_merge_loaded_children,
            fs_tree_runtime::fs_tree_collect_loaded_dirs,
            fs_tree_runtime::fs_tree_patch_dir_children,
            fs_tree_runtime::fs_tree_ancestor_dirs,
            network::proxy_api_call,
            network::proxy_api_call_full,
            network::proxy_ai_chat_completion,
            network::start_ai_provider_stream,
            network::abort_ai_provider_stream,
            ai_runtime::start_ai_anthropic_sdk_stream,
            ai_runtime::abort_ai_anthropic_sdk_stream,
            ai_runtime::respond_ai_anthropic_sdk_permission,
            ai_runtime::respond_ai_anthropic_sdk_ask_user,
            ai_runtime::respond_ai_anthropic_sdk_exit_plan,
            ai_agent_prepare::ai_agent_prepare_current_config,
            ai_agent_run::ai_agent_run_prepared_session,
            ai_artifact_runtime::ai_artifact_apply_doc_patch,
            ai_attachment_runtime::ai_attachment_create,
            ai_client_session_runtime::ai_client_session_create,
            ai_client_session_runtime::ai_client_session_ensure_thread,
            ai_client_session_runtime::ai_client_session_rename,
            ai_client_session_runtime::ai_client_session_delete,
            document_workflow::document_workflow_reconcile,
            ai_config::ai_config_load,
            ai_config::ai_config_load_internal,
            ai_config::ai_config_save,
            ai_config::ai_config_save_internal,
            ai_provider_catalog::ai_provider_catalog_list,
            ai_provider_catalog::ai_provider_state_resolve,
            ai_provider_catalog::ai_provider_models_list,
            ai_provider_catalog::ai_provider_connection_test,
            ai_provider_credentials::ai_provider_api_key_load,
            ai_provider_credentials::ai_provider_api_key_store,
            ai_provider_credentials::ai_provider_api_key_clear,
            ai_session_local_runtime::ai_session_local_mutate,
            ai_session_local_runtime::ai_session_state_normalize,
            ai_runtime_session_rail::ai_runtime_session_rail_reconcile,
            ai_runtime_thread_client::ai_runtime_thread_snapshot_to_session,
            ai_runtime_thread_client::ai_runtime_interrupt_session,
            ai_runtime_thread_client::ai_runtime_event_route,
            ai_runtime_turn_wait::ai_runtime_turn_run_wait,
            ai_skill_catalog::ai_skill_catalog_load,
            ai_skill_management::ai_skill_create,
            ai_skill_management::ai_skill_import,
            ai_skill_management::ai_skill_delete,
            ai_skill_management::ai_skill_update,
            ai_skill_management::ai_skill_duplicate,
            ai_tool_catalog::ai_tool_catalog_resolve,
            ai_session_storage::ai_session_overlay_load,
            ai_session_storage::ai_session_overlay_save,
            ai_session_storage::ai_session_overlay_restore,
            ai_session_storage::ai_session_overlay_create,
            ai_session_storage::ai_session_overlay_switch,
            ai_session_storage::ai_session_overlay_delete,
            ai_session_storage::ai_session_overlay_rename,
            codex_runtime::runtime_thread_start,
            codex_runtime::runtime_thread_list,
            codex_runtime::runtime_thread_read,
            codex_runtime::runtime_thread_rename,
            codex_runtime::runtime_thread_archive,
            codex_runtime::runtime_thread_unarchive,
            codex_runtime::runtime_thread_fork,
            codex_runtime::runtime_thread_rollback,
            codex_runtime::runtime_turn_start,
            codex_runtime::runtime_turn_interrupt,
            codex_runtime::runtime_turn_run,
            codex_runtime::runtime_permission_request,
            codex_runtime::runtime_permission_resolve,
            codex_runtime::runtime_ask_user_request,
            codex_runtime::runtime_ask_user_resolve,
            codex_runtime::runtime_exit_plan_request,
            codex_runtime::runtime_exit_plan_resolve,
            codex_runtime::runtime_plan_mode_set,
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            fs_commands::reveal_in_file_manager,
            fs_commands::get_global_config_dir,
            fs_commands::get_home_dir,
            i18n_runtime::i18n_runtime_load,
            references_backend::references_library_read_or_create,
            references_backend::references_library_write,
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
            references_runtime::references_scan_workspace_styles,
            references_runtime::references_write_bib_file,
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
            references_zotero::references_zotero_delete_item,
            markdown_runtime::markdown_extract_headings,
            latex_project_graph::latex_project_graph_resolve,
            latex_project_graph::latex_compile_request_resolve,
            latex_project_graph::latex_compile_targets_resolve,
            latex_project_graph::latex_affected_root_targets_resolve,
            latex_runtime::latex_runtime_compile_start,
            latex_runtime::latex_runtime_compile_finish,
            latex_runtime::latex_runtime_compile_fail,
            security::workspace_set_allowed_roots,
            security::workspace_clear_allowed_roots,
            workspace_access::macos_create_workspace_bookmark,
            workspace_access::macos_activate_workspace_bookmark,
            workspace_access::macos_release_workspace_access,
            latex::compile_latex,
            latex::check_latex_compilers,
            latex::check_latex_tools,
            latex::download_tectonic,
            latex::run_chktex,
            latex::format_latex_document,
            latex::synctex_forward,
            latex::synctex_backward,
            latex::read_latex_synctex,
            native_editor_runtime::native_editor_session_start,
            native_editor_runtime::native_editor_session_stop,
            native_editor_runtime::native_editor_session_open_document,
            native_editor_runtime::native_editor_session_apply_external_content,
            native_editor_runtime::native_editor_session_replace_document_text,
            native_editor_runtime::native_editor_session_apply_transaction,
            native_editor_runtime::native_editor_session_set_selections,
            native_editor_runtime::native_editor_session_set_diagnostics,
            native_editor_runtime::native_editor_session_set_outline_context,
            native_editor_runtime::native_editor_document_state,
            native_editor_runtime::native_editor_session_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
