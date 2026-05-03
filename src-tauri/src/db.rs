use std::fs;
use tauri::{AppHandle, Manager};

/// Resolve the SQLite database file path inside the app data directory.
///
/// Creates the app data directory if it does not yet exist. The schema is
/// owned and executed by the TypeScript layer; this function only resolves
/// the on-disk path so that `Database.load("sqlite:<path>")` can open it.
pub fn resolve_db_path(app: &AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app_data_dir: {e}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("failed to create data dir: {e}"))?;
    let db_file = data_dir.join("db.sqlite");
    db_file
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "db path is not valid UTF-8".to_string())
}
