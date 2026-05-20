//! Plugins-scope activity log — see spec §6.8.
//!
//! Singleton logger that any plugin IPC can call. Appends to
//! `<app-data>/plugins.log` and emits a Tauri event so the open
//! Log window can tail it live. Rotates at 10 MB × 5 files.
//!
//! Format per line, tab-separated for grep-friendliness:
//!   <ISO timestamp>\t<op>\t<key|->\t<marker>\t<payload>
//!
//! `marker` is one of `start`, `end`, `error`, `stdout`, `stderr`, or `info`.
//! Multi-line `payload` keeps newlines verbatim (full terminal output).

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const MAX_BYTES_PER_FILE: u64 = 10 * 1024 * 1024;
const MAX_ROTATED_FILES: usize = 5;
const EVENT_NAME: &str = "plugin-log";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: String,
    pub op: String,
    pub key: String,
    pub marker: String,
    pub payload: String,
}

/// File-backed log singleton. Lives behind a Mutex because every IPC may
/// write from a different thread.
pub struct LogStore {
    path: PathBuf,
    handle: Mutex<Option<File>>,
}

impl LogStore {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            handle: Mutex::new(None),
        }
    }

    fn open(&self) -> std::io::Result<File> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        OpenOptions::new().create(true).append(true).open(&self.path)
    }

    fn write_line(&self, line: &str) -> std::io::Result<()> {
        let mut guard = self.handle.lock().expect("LogStore mutex poisoned");
        // Rotate if the file would exceed the cap with this line.
        let needs_rotate = match fs::metadata(&self.path) {
            Ok(m) => m.len() + line.len() as u64 + 1 > MAX_BYTES_PER_FILE,
            Err(_) => false,
        };
        if needs_rotate {
            *guard = None;
            self.rotate()?;
        }
        if guard.is_none() {
            *guard = Some(self.open()?);
        }
        let f = guard.as_mut().expect("file handle just set");
        f.write_all(line.as_bytes())?;
        f.write_all(b"\n")?;
        f.flush()
    }

    /// Rotate `plugins.log` → `plugins.log.1`, `.1` → `.2`, … dropping the
    /// oldest beyond `MAX_ROTATED_FILES`.
    fn rotate(&self) -> std::io::Result<()> {
        let base = &self.path;
        let oldest = base.with_extension(format!("log.{}", MAX_ROTATED_FILES));
        if oldest.exists() {
            let _ = fs::remove_file(&oldest);
        }
        for i in (1..MAX_ROTATED_FILES).rev() {
            let src = base.with_extension(format!("log.{}", i));
            let dst = base.with_extension(format!("log.{}", i + 1));
            if src.exists() {
                let _ = fs::rename(&src, &dst);
            }
        }
        if base.exists() {
            let _ = fs::rename(base, base.with_extension("log.1"));
        }
        Ok(())
    }

    /// Read the current log file (and the rotated siblings, newest-first)
    /// into one string. Used by the Log window on mount.
    pub fn read_all(&self) -> String {
        let mut out = String::new();
        if let Ok(text) = fs::read_to_string(&self.path) {
            out.push_str(&text);
        }
        for i in 1..=MAX_ROTATED_FILES {
            let p = self.path.with_extension(format!("log.{}", i));
            if let Ok(text) = fs::read_to_string(&p) {
                // Older content sits below current — keeps natural append order.
                out.push_str(&text);
            }
        }
        out
    }
}

/// Resolve the log file path under the app's local data dir.
fn log_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("claude-manager"));
    dir.join("plugins.log")
}

/// Install the singleton on app boot.
pub fn init(app: &AppHandle) {
    let store = LogStore::new(log_path(app));
    app.manage(store);
}

/// Append one entry. Best-effort: I/O errors are swallowed so a flaky
/// disk never crashes a foreground IPC. The emitted event still fires
/// so the window stays consistent with what the caller intended.
pub fn log_event(app: &AppHandle, op: &str, key: Option<&str>, marker: &str, payload: &str) {
    let entry = LogEntry {
        timestamp: iso_now(),
        op: op.to_string(),
        key: key.unwrap_or("-").to_string(),
        marker: marker.to_string(),
        payload: payload.to_string(),
    };
    if let Some(store) = app.try_state::<LogStore>() {
        // One line per entry: tabs separate fields; payload newlines stay
        // as literal newlines so the file is greppable AND a terminal-like
        // multi-line read still works if you `cat` it.
        let line = format!(
            "{}\t{}\t{}\t{}\t{}",
            entry.timestamp,
            entry.op,
            entry.key,
            entry.marker,
            entry.payload.replace('\n', "\\n"),
        );
        let _ = store.write_line(&line);
    }
    let _ = app.emit(EVENT_NAME, &entry);
}

fn iso_now() -> String {
    // SystemTime → seconds since epoch → human-readable UTC. Avoids pulling
    // in chrono just for one timestamp.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // Minimal UTC ISO-8601 without chrono: derive Y-M-D H:M:S manually.
    let (y, mo, d, h, mi, s) = epoch_to_utc(secs);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, mi, s)
}

/// Inline civil-from-days algorithm (Hinnant), no chrono dep.
fn epoch_to_utc(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400) as u32;
    let h = rem / 3600;
    let mi = (rem % 3600) / 60;
    let s = rem % 60;
    // Hinnant's civil_from_days
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64 + era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    (y, mo, d, h, mi, s)
}

// ── IPC commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn read_plugin_log(app: AppHandle) -> Result<String, String> {
    let store = app
        .try_state::<LogStore>()
        .ok_or_else(|| "LogStore not initialized".to_string())?;
    Ok(store.read_all())
}

#[tauri::command]
pub fn open_plugin_log_window(app: AppHandle) -> Result<(), String> {
    // If already open, just focus.
    if let Some(existing) = app.get_webview_window("plugins-log") {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "plugins-log",
        tauri::WebviewUrl::App("index.html#/plugins-log".into()),
    )
    .title("Plugins — Log")
    .inner_size(900.0, 600.0)
    .min_inner_size(500.0, 300.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epoch_to_utc_matches_known_date() {
        // 2026-05-20T00:00:00Z = 1779235200 seconds since epoch
        let (y, mo, d, h, mi, s) = epoch_to_utc(1_779_235_200);
        assert_eq!((y, mo, d, h, mi, s), (2026, 5, 20, 0, 0, 0));
    }

    #[test]
    fn rotation_promotes_files() {
        let dir = std::env::temp_dir().join("claude-mgr-log-rotate");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("plugins.log");
        let store = LogStore::new(path.clone());
        // Seed: 11 MB to force rotate on next write.
        fs::write(&path, vec![b'x'; (MAX_BYTES_PER_FILE + 1) as usize]).unwrap();
        store.write_line("hello").unwrap();
        assert!(path.exists(), "current file recreated");
        assert!(
            path.with_extension("log.1").exists(),
            "previous file rotated to .1"
        );
    }
}
