mod db;
mod mcp;
mod plugins;
mod sessions;
mod skills;

use tauri::Manager;

#[tauri::command]
fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    db::resolve_db_path(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            plugins::log::init(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            sessions::commands::discover_sessions,
            sessions::commands::get_session_metadata,
            sessions::commands::read_jsonl_file,
            sessions::commands::read_pid_files,
            sessions::commands::kill_session_process,
            sessions::commands::launch_claude_session,
            plugins::commands::read_installed_plugins,
            plugins::commands::read_settings_enabled_plugins,
            plugins::commands::read_plugin_contents,
            plugins::commands::write_plugin_enabled,
            plugins::commands::check_plugin_updates,
            plugins::commands::install_plugin,
            plugins::commands::uninstall_plugin,
            plugins::commands::remove_orphaned_plugin,
            plugins::log::read_plugin_log,
            plugins::log::open_plugin_log_window,
            skills::commands::scan_custom_skills,
            mcp::commands::read_claude_json,
            mcp::commands::read_mcp_json,
            mcp::commands::write_mcp_server,
            mcp::commands::remove_mcp_server,
            mcp::commands::check_mcp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
