//! Enumerate `~/.claude/projects/*/` directories and find `.jsonl` session
//! files. Pure filesystem walk — no JSONL parsing here (see `parser.rs`).
//!
//! Critical (DESIGN-CONTEXT §2.2): never trust `sessions-index.json` for
//! field discovery. The filesystem is the source of truth; the index is a
//! speed hint for `isSidechain` only.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Lightweight handle to a discovered session file. Heavyweight metadata
/// extraction happens in `parser::parse_jsonl_metadata`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFileInfo {
    /// Absolute path to the `.jsonl` file.
    pub path: String,
    /// Project directory name (the slugified CWD under `projects/`).
    pub project_dir: String,
    /// Bytes — used by the loader to decide whether to re-parse.
    pub file_size: u64,
    /// Last-modified epoch ms — same purpose as `file_size`.
    pub mtime_ms: i64,
}

/// Resolve `~/.claude/` whether or not `dirs` is available.
pub fn claude_home() -> Option<PathBuf> {
    if let Some(home) = std::env::var_os("USERPROFILE") {
        return Some(PathBuf::from(home).join(".claude"));
    }
    if let Some(home) = std::env::var_os("HOME") {
        return Some(PathBuf::from(home).join(".claude"));
    }
    None
}

/// Walk `<root>/projects/*/*.jsonl`. Errors per directory are logged and
/// skipped — one bad project must not poison the whole scan.
pub fn discover_session_files_in(root: &Path) -> Vec<SessionFileInfo> {
    let projects_dir = root.join("projects");
    let Ok(entries) = std::fs::read_dir(&projects_dir) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let proj_path = entry.path();
        if !proj_path.is_dir() {
            continue;
        }
        let proj_name = proj_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let Ok(files) = std::fs::read_dir(&proj_path) else {
            continue;
        };
        for f in files.flatten() {
            let p = f.path();
            if p.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                continue;
            }
            let meta = match f.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            out.push(SessionFileInfo {
                path: p.to_string_lossy().into_owned(),
                project_dir: proj_name.clone(),
                file_size: meta.len(),
                mtime_ms,
            });
        }
    }
    out
}

/// Convenience wrapper that resolves `~/.claude/` first.
pub fn discover_session_files() -> Vec<SessionFileInfo> {
    match claude_home() {
        Some(root) => discover_session_files_in(&root),
        None => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fixtures_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("rust-sessions")
    }

    #[test]
    fn discovers_jsonl_files_under_projects() {
        let root = fixtures_root();
        let files = discover_session_files_in(&root);
        // Fixtures contain at least the canonical 6.
        let names: Vec<_> = files
            .iter()
            .map(|f| {
                std::path::Path::new(&f.path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        for expected in [
            "normal.jsonl",
            "with-permission-mode.jsonl",
            "version-sha.jsonl",
            "no-slug.jsonl",
            "noisy-progress.jsonl",
            "truncated.jsonl",
        ] {
            assert!(names.contains(&expected.to_string()), "missing {expected}");
        }
    }

    #[test]
    fn skips_non_jsonl_files() {
        let tmp = std::env::temp_dir().join("claude-mgr-disc-test");
        let _ = fs::remove_dir_all(&tmp);
        let proj = tmp.join("projects").join("p1");
        fs::create_dir_all(&proj).unwrap();
        fs::write(proj.join("session.jsonl"), b"{}").unwrap();
        fs::write(proj.join("readme.txt"), b"ignore me").unwrap();

        let files = discover_session_files_in(&tmp);
        assert_eq!(files.len(), 1);
        assert!(files[0].path.ends_with("session.jsonl"));
    }

    #[test]
    fn returns_empty_when_no_projects_dir() {
        let tmp = std::env::temp_dir().join("claude-mgr-empty-test");
        let _ = fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let files = discover_session_files_in(&tmp);
        assert!(files.is_empty());
    }

    // env-var tests below mutate process-global state; serialize via a shared
    // mutex (no serial_test crate in Cargo.toml) and restore originals via RAII.
    use std::sync::{Mutex, OnceLock};
    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }
    struct EnvGuard {
        keys: Vec<(&'static str, Option<std::ffi::OsString>)>,
    }
    impl EnvGuard {
        fn capture(keys: &[&'static str]) -> Self {
            Self {
                keys: keys
                    .iter()
                    .map(|k| (*k, std::env::var_os(k)))
                    .collect(),
            }
        }
    }
    impl Drop for EnvGuard {
        fn drop(&mut self) {
            for (k, v) in &self.keys {
                match v {
                    Some(val) => std::env::set_var(k, val),
                    None => std::env::remove_var(k),
                }
            }
        }
    }

    #[test]
    fn claude_home_prefers_userprofile_over_home() {
        let _lk = env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let _g = EnvGuard::capture(&["USERPROFILE", "HOME"]);
        std::env::set_var("USERPROFILE", "C:\\Users\\winner");
        std::env::set_var("HOME", "/home/loser");
        let p = claude_home().unwrap();
        assert_eq!(p, PathBuf::from("C:\\Users\\winner").join(".claude"));
    }

    #[test]
    fn claude_home_falls_back_to_home_when_userprofile_absent() {
        let _lk = env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let _g = EnvGuard::capture(&["USERPROFILE", "HOME"]);
        std::env::remove_var("USERPROFILE");
        std::env::set_var("HOME", "/home/posix");
        let p = claude_home().unwrap();
        assert_eq!(p, PathBuf::from("/home/posix").join(".claude"));
    }

    #[test]
    fn claude_home_returns_none_when_both_absent() {
        let _lk = env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let _g = EnvGuard::capture(&["USERPROFILE", "HOME"]);
        std::env::remove_var("USERPROFILE");
        std::env::remove_var("HOME");
        assert!(claude_home().is_none());
    }
}
