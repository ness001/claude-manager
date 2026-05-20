//! Tauri IPC commands for the sessions module. Four commands total — the
//! frontend orchestrator (T2.5) is the sole caller.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use super::discovery::{
    claude_home, discover_session_files, SessionFileInfo,
};
use super::parser::{parse_jsonl_metadata, read_jsonl_lines, SessionMetadata};
use super::pid::{read_pid_files_in, PidFileData};

/// Wire shape returned by `discover_sessions`. Inlines `is_sidechain`
/// overlaid from `sessions-index.json` (the only source spec §5.1
/// trusts for that field).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSession {
    #[serde(flatten)]
    pub metadata: SessionMetadata,
    pub project_dir: String,
}

/// Read `sessions-index.json` for one project directory and return a
/// map of `sessionId -> isSidechain`. Empty map on any error — never
/// poisons the discovery scan (DESIGN-CONTEXT §2.2).
fn read_sidechain_overlay(project_dir: &Path) -> HashMap<String, bool> {
    let mut out = HashMap::new();
    let path = project_dir.join("sessions-index.json");
    let Ok(bytes) = std::fs::read(&path) else {
        return out;
    };
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return out;
    };
    // Real layout (per docs/sources-of-truth/sessions-index-cache-json.yaml):
    //   { "version": 1, "entries": [ { "sessionId": "...", "isSidechain": ... }, ... ] }
    // Some older snapshots used { "sessions": [ { "id": "...", "isSidechain": ... } ] };
    // keep that as a fallback so we don't break long-running installs.
    let arr = value
        .get("entries")
        .and_then(|v| v.as_array())
        .or_else(|| value.get("sessions").and_then(|v| v.as_array()))
        .or_else(|| value.as_array());
    if let Some(arr) = arr {
        for entry in arr {
            let id = entry
                .get("sessionId")
                .or_else(|| entry.get("id"))
                .and_then(|v| v.as_str());
            let sc = entry.get("isSidechain").and_then(|v| v.as_bool());
            if let (Some(id), Some(sc)) = (id, sc) {
                out.insert(id.to_string(), sc);
            }
        }
    }
    out
}

/// Single batch IPC: discover every session under `~/.claude/projects/`,
/// parse first-10-lines metadata, overlay `isSidechain` from
/// `sessions-index.json`. Returns the full list — frontend then
/// cross-references PID files separately.
#[tauri::command]
pub fn discover_sessions() -> Result<Vec<DiscoveredSession>, String> {
    let files: Vec<SessionFileInfo> = discover_session_files();
    if files.is_empty() {
        return Ok(Vec::new());
    }
    // Group files by project_dir so we read each sessions-index.json once.
    let mut by_proj: HashMap<String, Vec<SessionFileInfo>> = HashMap::new();
    for f in files {
        by_proj.entry(f.project_dir.clone()).or_default().push(f);
    }

    let root = match claude_home() {
        Some(r) => r,
        None => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for (proj_name, file_list) in by_proj {
        let proj_dir = root.join("projects").join(&proj_name);
        let overlay = read_sidechain_overlay(&proj_dir);
        for f in file_list {
            let path = Path::new(&f.path);
            let mut meta = match parse_jsonl_metadata(path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if let Some(b) = overlay.get(&meta.session_id) {
                meta.is_sidechain = *b;
            }
            out.push(DiscoveredSession {
                metadata: meta,
                project_dir: proj_name.clone(),
            });
        }
    }
    Ok(out)
}

/// Re-parse a single session file's metadata (incremental update).
#[tauri::command]
pub fn get_session_metadata(path: String) -> Result<SessionMetadata, String> {
    parse_jsonl_metadata(Path::new(&path)).map_err(|e| e.to_string())
}

/// Read every line of a JSONL file as raw strings. Frontend parses.
#[tauri::command]
pub fn read_jsonl_file(path: String) -> Result<Vec<String>, String> {
    read_jsonl_lines(Path::new(&path)).map_err(|e| e.to_string())
}

/// List every PID file in `~/.claude/sessions/`. Liveness check is
/// deferred to the frontend / future polling.
#[tauri::command]
pub fn read_pid_files() -> Result<Vec<PidFileData>, String> {
    match claude_home() {
        Some(root) => Ok(read_pid_files_in(&root)),
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixtures_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/rust-sessions")
    }

    #[test]
    fn sessions_index_overlay_marks_is_sidechain_only() {
        let proj = fixtures_root().join("projects").join("proj-a");
        let overlay = read_sidechain_overlay(&proj);
        // Fixture index marks one session as sidechain.
        assert_eq!(overlay.get("sess-sidechain"), Some(&true));
        // Stale index entry pointing to a missing JSONL — discovery must
        // OMIT that session, but the overlay itself is allowed to mention it.
        assert!(overlay.contains_key("sess-dangling"));
    }

    #[test]
    fn read_sidechain_overlay_is_empty_when_index_missing() {
        let tmp = std::env::temp_dir().join("claude-mgr-noidx");
        std::fs::create_dir_all(&tmp).unwrap();
        let overlay = read_sidechain_overlay(&tmp);
        assert!(overlay.is_empty());
    }

    /// Backwards-compat: the historical wrapper used `{sessions:[{id,…}]}`
    /// instead of the current `{version,entries:[{sessionId,…}]}`. Long-
    /// running installs may still have the old shape on disk; we accept
    /// both rather than silently dropping every sidechain marker.
    #[test]
    fn read_sidechain_overlay_accepts_legacy_sessions_id_shape() {
        let tmp = std::env::temp_dir().join("claude-mgr-legacy-idx");
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(
            tmp.join("sessions-index.json"),
            r#"{"sessions":[{"id":"sess-legacy","isSidechain":true}]}"#,
        )
        .unwrap();
        let overlay = read_sidechain_overlay(&tmp);
        assert_eq!(overlay.get("sess-legacy"), Some(&true));
    }
}
