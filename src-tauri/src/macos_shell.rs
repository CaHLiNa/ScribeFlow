#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSColor, NSTitlebarSeparatorStyle, NSWindow, NSWindowButton, NSWindowStyleMask,
    NSWindowTitleVisibility,
};
#[cfg(target_os = "macos")]
use objc2_foundation::NSPoint;
use tauri::menu::{AboutMetadata, Menu, MenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::window::{Color, Effect, EffectState, EffectsBuilder};
use tauri::{AppHandle, Manager, Runtime};

const MENU_OPEN_FOLDER: &str = "menu-open-folder";
const MENU_CLOSE_FOLDER: &str = "menu-close-folder";
const MENU_NEW_FILE: &str = "menu-new-file";
const MENU_OPEN_SETTINGS: &str = "menu-open-settings";
const MENU_TOGGLE_LEFT_SIDEBAR: &str = "menu-toggle-left-sidebar";
#[cfg(target_os = "macos")]
const TITLEBAR_BUTTON_VERTICAL_OFFSET: f64 = 4.0;

#[cfg(target_os = "macos")]
pub fn sync_window_transparency<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        let Some(window) = app_handle
            .get_webview_window("main")
            .or_else(|| app_handle.webview_windows().into_values().next())
        else {
            return;
        };

        let Ok(ns_window_ptr) = window.ns_window() else {
            return;
        };

        let ns_window: &NSWindow = unsafe { &*ns_window_ptr.cast() };
        let clear = NSColor::clearColor();
        let style_mask = ns_window.styleMask() | NSWindowStyleMask::FullSizeContentView;
        ns_window.setStyleMask(style_mask);
        ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        ns_window.setTitlebarAppearsTransparent(true);
        ns_window.setHasShadow(false);
        ns_window.setOpaque(false);
        ns_window.setBackgroundColor(Some(&clear));
        ns_window.setTitlebarSeparatorStyle(NSTitlebarSeparatorStyle::None);
        align_standard_window_buttons(ns_window);

        let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
        let _ = window.set_effects(
            EffectsBuilder::new()
                .effect(Effect::Sidebar)
                .state(EffectState::Active)
                .build(),
        );
    })
    .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn align_standard_window_buttons(ns_window: &NSWindow) {
    for button_kind in [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ] {
        let Some(button) = ns_window.standardWindowButton(button_kind) else {
            continue;
        };
        let frame = button.frame();
        button.setFrameOrigin(NSPoint::new(
            frame.origin.x,
            frame.origin.y - TITLEBAR_BUTTON_VERTICAL_OFFSET,
        ));
    }
}

#[cfg(not(target_os = "macos"))]
pub fn sync_window_transparency<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn macos_sync_window_transparency<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    sync_window_transparency(app)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn macos_sync_window_transparency() -> Result<(), String> {
    Ok(())
}

fn detect_is_chinese_locale() -> bool {
    sys_locale::get_locale()
        .map(|value| value.to_lowercase().starts_with("zh"))
        .unwrap_or(false)
}

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

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
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

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
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
