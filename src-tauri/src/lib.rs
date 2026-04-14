mod app_dirs;
mod fs_commands;
mod fs_io;
mod fs_tree;
mod latex;
mod latex_tools;
mod keychain;
mod network;
mod process_utils;
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

#[cfg(test)]
mod tests {
    use super::parse_workspace_protocol_request_path;

    #[test]
    fn workspace_protocol_decodes_percent_encoded_segments() {
        let (scope, relative_path) = parse_workspace_protocol_request_path(
            "/workspace/paper/An%20%E7%AD%89%20-%202026%20-%20test.pdf",
        )
        .unwrap();

        assert_eq!(scope, "workspace");
        assert_eq!(relative_path, "paper/An 等 - 2026 - test.pdf");
    }

    #[test]
    fn workspace_protocol_requires_file_path() {
        let error = parse_workspace_protocol_request_path("/workspace").unwrap_err();
        assert!(error.contains("Missing file path"));
    }
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
        .manage(latex::LatexState::default())
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
            fs_commands::create_dir,
            fs_commands::rename_path,
            fs_commands::delete_path,
            fs_commands::copy_file,
            fs_commands::copy_dir,
            fs_commands::is_directory,
            fs_commands::path_exists,
            network::proxy_api_call,
            network::proxy_api_call_full,
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            fs_commands::reveal_in_file_manager,
            fs_commands::get_global_config_dir,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
