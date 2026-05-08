mod app_dirs;
mod app_update;
mod document_outline;
mod document_workflow;
mod document_workflow_action;
mod document_workflow_controller;
mod document_workflow_preview_binding;
mod document_workflow_session;
mod document_workflow_ui_state;
mod document_workspace_preview_state;
mod editor_session_runtime;
mod extension_artifacts;
mod extension_capability_contract;
mod extension_commands;
mod extension_host;
mod extension_manifest;
mod extension_outputs;
mod extension_permissions;
mod extension_registry;
mod extension_secret_settings;
mod extension_settings;
mod extension_tasks;
mod extension_views;
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
mod latex_sync_target;
mod latex_tools;
#[cfg(target_os = "macos")]
mod macos_shell;
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
mod workspace_protocol;

pub use extension_artifacts::ExtensionArtifact;
pub use extension_commands::record_extension_result_for_probe as extension_command_record_result_for_probe;
pub use extension_host::{
    activate_extension as extension_host_activate_entry,
    activate_extension_by_id_for_probe as extension_host_activate_by_id_for_probe,
    build_extension_invocation_envelope as extension_host_build_invocation_envelope_for_probe,
    cancel_window_inputs_for_extension_for_probe as extension_host_cancel_window_inputs_for_probe,
    deactivate_extension_for_probe as extension_host_deactivate_for_probe,
    invoke_extension_host as extension_host_invoke_request,
    invoke_extension_host_for_probe as extension_host_invoke_probe_request,
    invoke_extension_host_with_task_runtime_for_probe as extension_host_invoke_probe_request_with_task_runtime,
    spawned_process_count_for_probe as extension_host_spawned_process_count_for_probe,
    ExtensionHostCapabilityResult, ExtensionHostInvocationEnvelope, ExtensionHostRequest,
    ExtensionHostResponse, ExtensionHostState,
};
pub use extension_outputs::ExtensionCapabilityOutput;
pub use extension_settings::{
    load_extension_runtime_state_snapshot as extension_settings_load_runtime_state_snapshot_for_probe,
    load_extension_settings_with_state as extension_settings_load_with_state_for_probe,
    save_extension_settings as extension_settings_save_for_probe, ExtensionSettings,
};
pub use extension_tasks::cancel_active_tasks_for_extension_for_probe as extension_task_cancel_extension_for_probe;
pub use extension_tasks::cancel_task_for_runtime as extension_task_cancel_for_probe;
pub use extension_tasks::create_command_task_for_probe as extension_task_create_command_for_probe;
pub use extension_tasks::ExtensionTaskRuntimeState;

use tauri::Manager;

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

pub fn run() {
    if extension_host::is_extension_host_mode() {
        extension_host::run_extension_host_stdio_loop()
            .expect("error while running extension host sidecar");
        return;
    }

    #[cfg(unix)]
    enrich_path();

    let _ = extension_tasks::recover_interrupted_tasks_on_startup();

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("scribeflow-workspace", |ctx, request| {
            workspace_protocol::handle_workspace_protocol(ctx.app_handle(), request)
        })
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(latex::LatexState::default())
        .manage(latex_runtime::LatexRuntimeState::default())
        .manage(fs_watch_runtime::WorkspaceTreeWatchState::default())
        .manage(security::WorkspaceScopeState::default())
        .manage(workspace_access::WorkspaceAccessState::default())
        .manage(extension_tasks::ExtensionTaskRuntimeState::default())
        .manage(extension_host::ExtensionHostState::default());

    #[cfg(target_os = "macos")]
    let builder = builder
        .setup(|app| {
            let extension_host_state = app.state::<extension_host::ExtensionHostState>();
            let extension_task_state = app.state::<extension_tasks::ExtensionTaskRuntimeState>();
            extension_host::bind_extension_host_app_handle(
                extension_host_state.inner(),
                app.handle().clone(),
            );
            extension_task_state
                .inner()
                .bind_app_handle(app.handle().clone());
            let _ = macos_shell::sync_window_transparency(app.handle().clone());
            Ok(())
        })
        .menu(|app| macos_shell::build_app_menu(app))
        .on_menu_event(macos_shell::handle_menu_event);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.setup(|app| {
        let extension_host_state = app.state::<extension_host::ExtensionHostState>();
        let extension_task_state = app.state::<extension_tasks::ExtensionTaskRuntimeState>();
        extension_host::bind_extension_host_app_handle(
            extension_host_state.inner(),
            app.handle().clone(),
        );
        extension_task_state
            .inner()
            .bind_app_handle(app.handle().clone());
        Ok(())
    });

    builder
        .invoke_handler(tauri::generate_handler![
            // Filesystem, workspace files, and app utility bridges.
            fs_watch_runtime::workspace_tree_watch_start,
            fs_watch_runtime::workspace_tree_watch_note_activity,
            fs_watch_runtime::workspace_tree_watch_set_visibility,
            fs_watch_runtime::workspace_tree_watch_stop,
            app_update::app_update_download_asset,
            app_update::app_update_reveal_download,
            fs_commands::workspace_render_image_preview,
            fs_commands::workspace_read_file_base64,
            fs_commands::workspace_write_file_base64,
            fs_commands::workspace_read_text_file,
            fs_commands::workspace_write_text_file,
            fs_commands::workspace_create_file,
            fs_commands::workspace_create_dir,
            fs_commands::workspace_rename_path,
            fs_commands::workspace_delete_path,
            fs_commands::workspace_duplicate_path,
            fs_commands::workspace_move_path,
            fs_commands::workspace_copy_external_path,
            fs_commands::path_status,
            fs_commands::workspace_path_status,
            fs_tree_runtime::fs_tree_load_workspace_state,
            fs_tree_runtime::fs_tree_reveal_workspace_state,
            fs_tree_runtime::fs_tree_restore_cached_expanded_state,
            document_workflow::document_workflow_reconcile,
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            fs_commands::workspace_reveal_in_file_manager,
            fs_commands::workspace_open_path_in_default_app,
            fs_commands::get_global_config_dir,
            fs_commands::get_home_dir,
            i18n_runtime::i18n_runtime_load,
            // Extension platform runtime, registry, tasks, artifacts, and settings.
            extension_registry::extension_registry_list,
            extension_manifest::extension_registry_validate_manifest,
            extension_host::extension_host_status,
            extension_host::extension_host_activate,
            extension_host::extension_host_cancel_window_inputs,
            extension_host::extension_host_deactivate,
            extension_host::extension_host_respond_ui_request,
            extension_host::extension_host_resolve_host_call,
            extension_host::extension_host_notify_view_selection,
            extension_host::extension_host_update_settings,
            extension_commands::extension_command_execute,
            extension_commands::extension_capability_invoke,
            extension_views::extension_view_resolve,
            extension_tasks::extension_task_list,
            extension_tasks::extension_task_get,
            extension_tasks::extension_task_cancel,
            extension_tasks::extension_task_cancel_extension,
            extension_artifacts::extension_artifact_open,
            extension_artifacts::extension_artifact_reveal,
            extension_artifacts::extension_artifact_read_text,
            extension_settings::extension_settings_load,
            extension_settings::extension_settings_save,
            // Reference library, citation, import/export, PDF metadata, and Zotero.
            references_backend::references_library_read_or_create,
            references_backend::references_library_load_workspace,
            references_backend::references_library_write,
            references_backend::references_snapshot_normalize,
            references_backend::references_record_normalize,
            references_backend::references_asset_store,
            references_backend::references_asset_rename,
            references_citation::references_citation_render,
            references_import::references_crossref_lookup_by_doi,
            references_import::references_crossref_search_by_metadata,
            references_import::references_import_parse_text,
            references_import::references_import_parse_file,
            references_import::references_import_detect_format,
            references_import::references_import_from_text,
            references_import::references_export_bibtex,
            references_import::references_write_export_file,
            references_pdf::references_pdf_extract_text,
            references_pdf::references_pdf_extract_metadata,
            references_runtime::references_find_duplicate,
            references_runtime::references_merge_imported,
            references_runtime::references_import_pdf,
            references_runtime::references_record_from_csl,
            references_runtime::references_refresh_metadata,
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
            // Document workflow, preview state, editor session, Markdown, Python, and LaTeX.
            document_outline::document_outline_resolve,
            document_workflow_action::document_workflow_action_resolve,
            document_workflow_controller::document_workflow_controller_execute,
            document_workflow_session::document_workflow_latex_preview_apply,
            document_workflow_session::document_workflow_latex_preview_reconcile,
            document_workflow_session::document_workflow_preview_binding_apply,
            document_workflow_session::document_workflow_session_load,
            document_workflow_session::document_workflow_session_save,
            document_workflow_session::document_workflow_workspace_preview_apply,
            document_workflow_ui_state::document_workflow_ui_resolve,
            document_workspace_preview_state::document_workspace_preview_state_resolve,
            editor_session_runtime::editor_session_load,
            editor_session_runtime::editor_session_save,
            editor_session_runtime::editor_recent_files_load,
            editor_session_runtime::editor_recent_files_save,
            markdown_runtime::markdown_extract_diagnostics,
            markdown_runtime::markdown_extract_headings,
            markdown_runtime::markdown_extract_wiki_links,
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
            // Workspace security, access, lifecycle, workbench state, and preferences.
            security::workspace_set_allowed_roots,
            security::workspace_clear_allowed_roots,
            workspace_access::macos_create_workspace_bookmark,
            workspace_access::macos_capture_workspace_bookmark,
            workspace_access::macos_activate_workspace_bookmark,
            workspace_access::macos_activate_workspace_bookmark_for_path,
            macos_shell::macos_sync_window_transparency,
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
            workbench_state::workbench_dock_page_contract_load,
            workbench_state::workbench_layout_load,
            workbench_state::workbench_layout_save,
            workspace_preferences::workspace_preferences_load,
            workspace_preferences::workspace_preferences_save,
            workspace_preferences::workspace_preferences_list_system_fonts,
            // Legacy LaTeX tools and SyncTeX compatibility commands.
            latex::compile_latex,
            latex::check_latex_compilers,
            latex::check_latex_tools,
            latex::download_tectonic,
            latex::format_latex_document,
            latex_sync_target::latex_existing_synctex_resolve,
            latex_sync_target::latex_sync_target_resolve,
            latex::workspace_synctex_forward,
            latex::workspace_synctex_backward,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
