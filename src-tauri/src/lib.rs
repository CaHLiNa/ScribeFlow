mod app_dirs;
mod chat;
mod fs_commands;
mod git;
mod kernel;
mod latex;
mod model_sync;
mod pdf_translate;
mod process_utils;
mod pty;
mod typst_export;
mod usage_db;

#[cfg(target_os = "macos")]
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, SubmenuBuilder},
    AppHandle, Manager, Runtime,
};

/// Enable macOS spellcheck for WKWebView (must run before webview init)
#[cfg(target_os = "macos")]
fn enable_macos_spellcheck() {
    use objc2_foundation::{NSString, NSUserDefaults};
    let defaults = NSUserDefaults::standardUserDefaults();
    let key = NSString::from_str("WebContinuousSpellCheckingEnabled");
    defaults.setBool_forKey(true, &key);
}

/// Open the macOS Spelling & Grammar panel
#[cfg(target_os = "macos")]
#[tauri::command]
fn open_spelling_panel(app: tauri::AppHandle) -> Result<(), String> {
    use objc2_app_kit::NSSpellChecker;
    app.run_on_main_thread(move || {
        let mtm = objc2::MainThreadMarker::new().unwrap();
        let checker = NSSpellChecker::sharedSpellChecker();
        let panel = checker.spellingPanel(mtm);
        panel.makeKeyAndOrderFront(None);
    })
    .map_err(|e| format!("{:?}", e))?;
    Ok(())
}

/// Get spelling suggestions for a word via macOS NSSpellChecker
#[cfg(target_os = "macos")]
#[tauri::command]
fn spell_suggest(word: String) -> Vec<String> {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    let checker = NSSpellChecker::sharedSpellChecker();
    let ns_word = NSString::from_str(&word);

    // Check if misspelled (returns range of first error, length=0 means OK)
    let bad = checker.checkSpellingOfString_startingAt(&ns_word, 0);
    if bad.length == 0 {
        return vec![];
    }

    // Get suggestions
    let range = NSRange::new(0, ns_word.len());
    let guesses = checker
        .guessesForWordRange_inString_language_inSpellDocumentWithTag(range, &ns_word, None, 0);

    match guesses {
        Some(arr) => {
            let mut out = Vec::new();
            for i in 0..arr.count() {
                let s = arr.objectAtIndex(i);
                out.push(s.to_string());
            }
            out
        }
        None => vec![],
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn spell_suggest(_word: String) -> Vec<String> {
    vec![]
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_spelling_panel() -> Result<(), String> {
    Err("Spelling panel is only available on macOS".into())
}

const KEYRING_SERVICE: &str = "com.altals.desktop";

const ALLOWED_KEYCHAIN_KEYS: &[&str] = &[
    "anthropic-key",
    "openai-key",
    "google-key",
    "auth-data",
    "github-token",
];

#[tauri::command]
fn keychain_get(key: String) -> Result<String, String> {
    if !ALLOWED_KEYCHAIN_KEYS.contains(&key.as_str()) {
        return Err(format!("Invalid keychain key: {}", key));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(val) => Ok(val),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keychain_set(key: String, value: String) -> Result<(), String> {
    if !ALLOWED_KEYCHAIN_KEYS.contains(&key.as_str()) {
        return Err(format!("Invalid keychain key: {}", key));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_delete(key: String) -> Result<(), String> {
    if !ALLOWED_KEYCHAIN_KEYS.contains(&key.as_str()) {
        return Err(format!("Invalid keychain key: {}", key));
    }
    let entry = keyring::Entry::new(KEYRING_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
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
const MENU_SEARCH: &str = "menu-search";
#[cfg(target_os = "macos")]
const MENU_TOGGLE_LEFT_SIDEBAR: &str = "menu-toggle-left-sidebar";
#[cfg(target_os = "macos")]
const MENU_TOGGLE_TERMINAL: &str = "menu-toggle-terminal";

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
    let search = MenuItem::with_id(
        app,
        MENU_SEARCH,
        label("搜索...", "Search..."),
        true,
        Some("CmdOrCtrl+P"),
    )?;
    let toggle_left_sidebar = MenuItem::with_id(
        app,
        MENU_TOGGLE_LEFT_SIDEBAR,
        label("切换左侧边栏", "Toggle Left Sidebar"),
        true,
        None::<&str>,
    )?;
    let toggle_terminal = MenuItem::with_id(
        app,
        MENU_TOGGLE_TERMINAL,
        label("切换终端", "Toggle Terminal"),
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
        .item(&search)
        .separator()
        .item(&toggle_left_sidebar)
        .item(&toggle_terminal)
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
    } else if event.id() == MENU_SEARCH {
        dispatch_frontend_event(app, "app:focus-search", None);
    } else if event.id() == MENU_TOGGLE_LEFT_SIDEBAR {
        dispatch_frontend_event(app, "app:toggle-left-sidebar", None);
    } else if event.id() == MENU_TOGGLE_TERMINAL {
        dispatch_frontend_event(app, "app:toggle-terminal", None);
    }
}

pub fn run() {
    #[cfg(unix)]
    enrich_path();

    #[cfg(target_os = "macos")]
    enable_macos_spellcheck();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(pty::PtyState::default())
        .manage(fs_commands::WatcherState::default())
        .manage(chat::ChatState::default())
        .manage(kernel::KernelState::default())
        .manage(latex::LatexState::default())
        .manage(pdf_translate::PdfTranslateState::default())
        .manage(usage_db::UsageDbState::default());

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|app| build_app_menu(app))
        .on_menu_event(handle_menu_event);

    builder
        .invoke_handler(tauri::generate_handler![
            fs_commands::read_dir_recursive,
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
            fs_commands::watch_directory,
            fs_commands::unwatch_directory,
            fs_commands::proxy_api_call,
            git::git_clone,
            git::git_init,
            git::git_add_all,
            git::git_commit,
            git::git_status,
            git::git_branch,
            git::git_log,
            git::git_show_file,
            git::git_show_file_base64,
            git::git_diff,
            git::git_diff_stat,
            git::git_diff_summary,
            git::git_remote_add,
            git::git_remote_get_url,
            git::git_remote_remove,
            git::git_push,
            git::git_push_branch,
            git::git_fetch,
            git::git_ahead_behind,
            git::git_pull_ff,
            git::git_merge_remote,
            git::git_set_user,
            git::git_clone_authenticated,
            fs_commands::search_file_contents,
            fs_commands::run_shell_command,
            fs_commands::fetch_url_content,
            fs_commands::get_global_config_dir,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            chat::chat_stream,
            chat::chat_abort,
            chat::chat_cleanup,
            kernel::kernel_discover,
            kernel::discover_python_interpreters,
            kernel::kernel_launch,
            kernel::kernel_execute,
            kernel::kernel_interrupt,
            kernel::kernel_shutdown,
            kernel::kernel_complete,
            latex::compile_latex,
            latex::set_tectonic_enabled,
            latex::is_tectonic_enabled,
            latex::check_tectonic,
            latex::check_latex_compilers,
            latex::download_tectonic,
            latex::synctex_forward,
            latex::synctex_backward,
            pdf_translate::pdf_translate_list_tasks,
            pdf_translate::pdf_translate_check_env_status,
            pdf_translate::pdf_translate_setup_env,
            pdf_translate::pdf_translate_warmup_env,
            pdf_translate::pdf_translate_start,
            pdf_translate::pdf_translate_cancel,
            model_sync::model_sync_list_openai_models,
            typst_export::export_md_to_pdf,
            typst_export::is_typst_available,
            typst_export::check_typst_compiler,
            typst_export::download_typst,
            typst_export::compile_typst_file,
            usage_db::usage_record,
            usage_db::usage_query_month,
            usage_db::usage_query_monthly_trend,
            usage_db::usage_query_daily_trend,
            usage_db::usage_get_setting,
            usage_db::usage_set_setting,
            keychain_get,
            keychain_set,
            keychain_delete,
            open_spelling_panel,
            spell_suggest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
