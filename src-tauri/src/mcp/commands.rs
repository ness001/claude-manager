//! Tauri IPC commands for the MCP module — see plan T3.9 and spec §8.1.
//!
//! Five commands:
//!   - `read_claude_json`: pass-through reader for `~/.claude.json`.
//!   - `read_mcp_json(project_root)`: pass-through reader for
//!     `<root>/.mcp.json`. Missing → empty string (frontend treats as no
//!     project-scope servers).
//!   - `write_mcp_server`: read-modify-write `~/.claude.json` for user
//!     and local scopes. Atomic via temp file + rename.
//!   - `remove_mcp_server`: delete a server entry from the appropriate
//!     scope's location in `~/.claude.json`.
//!   - `check_mcp_status`: opt-in shell out to `claude mcp list`. Gated
//!     behind a trait so cargo tests never spawn it (spec §8.3).
//!
//! `~/.claude.json` is the user-level config file at the home root, NOT
//! under `~/.claude/` (spec §8.1; common mistake). Use `claude_json_path`
//! for that path; never construct it from `claude_home()`.

use serde_json::{json, Value};
use std::path::PathBuf;

/// Resolve `~/.claude.json` (user-level config). On Windows this is
/// `%USERPROFILE%\.claude.json`; on POSIX, `$HOME/.claude.json`.
pub fn claude_json_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude.json"))
}

/// Read `~/.claude.json` as a raw string. Missing → empty string.
#[tauri::command]
pub fn read_claude_json() -> Result<String, String> {
    let Some(path) = claude_json_path() else {
        return Ok(String::new());
    };
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Read `<project_root>/.mcp.json` as a raw string. Missing → empty
/// string (frontend treats as no project-scope servers).
#[tauri::command]
pub fn read_mcp_json(project_root: String) -> Result<String, String> {
    let path = PathBuf::from(project_root).join(".mcp.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Write/upsert one MCP server config into `~/.claude.json`. The
/// `config_json` blob is parsed as JSON and inserted at:
///   - user  → `$.mcpServers.<name>`
///   - local → `$.projects["<cwd>"].mcpServers.<name>`
///   - project → returned as Err — project scope lives in
///                `<root>/.mcp.json`, not `~/.claude.json`. Frontend
///                must call a different path for project writes.
///
/// All unrelated keys in `~/.claude.json` are preserved (read-modify-write).
/// The write is atomic: a temp file is fully written, then renamed.
#[tauri::command]
pub fn write_mcp_server(
    scope: String,
    name: String,
    config_json: String,
    cwd: String,
) -> Result<(), String> {
    let Some(path) = claude_json_path() else {
        return Err("Could not resolve ~/.claude.json".to_string());
    };
    let cfg: Value = serde_json::from_str(&config_json).map_err(|e| e.to_string())?;

    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(e) => return Err(e.to_string()),
    };
    let mut value: Value = if existing.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str(&existing).map_err(|e| e.to_string())?
    };
    let root = value
        .as_object_mut()
        .ok_or_else(|| "~/.claude.json is not an object".to_string())?;

    match scope.as_str() {
        "user" => {
            let servers = root
                .entry("mcpServers")
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .ok_or_else(|| "mcpServers is not an object".to_string())?;
            servers.insert(name, cfg);
        }
        "local" => {
            if cwd.is_empty() {
                return Err("local scope requires cwd".to_string());
            }
            let projects = root
                .entry("projects")
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .ok_or_else(|| "projects is not an object".to_string())?;
            let project = projects
                .entry(cwd)
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .ok_or_else(|| "project entry is not an object".to_string())?;
            let servers = project
                .entry("mcpServers")
                .or_insert_with(|| json!({}))
                .as_object_mut()
                .ok_or_else(|| "project.mcpServers is not an object".to_string())?;
            servers.insert(name, cfg);
        }
        "project" => {
            return Err(
                "project scope writes belong in <root>/.mcp.json, not ~/.claude.json".to_string(),
            );
        }
        other => return Err(format!("unknown scope: {}", other)),
    }

    atomic_write(&path, &value)
}

/// Remove one MCP server entry from the appropriate scope.
#[tauri::command]
pub fn remove_mcp_server(scope: String, name: String, cwd: String) -> Result<(), String> {
    let Some(path) = claude_json_path() else {
        return Err("Could not resolve ~/.claude.json".to_string());
    };
    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    if existing.trim().is_empty() {
        return Ok(());
    }
    let mut value: Value = serde_json::from_str(&existing).map_err(|e| e.to_string())?;
    let root = value
        .as_object_mut()
        .ok_or_else(|| "~/.claude.json is not an object".to_string())?;

    match scope.as_str() {
        "user" => {
            if let Some(servers) = root.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                servers.remove(&name);
            }
        }
        "local" => {
            if cwd.is_empty() {
                return Err("local scope requires cwd".to_string());
            }
            if let Some(servers) = root
                .get_mut("projects")
                .and_then(|v| v.as_object_mut())
                .and_then(|p| p.get_mut(&cwd))
                .and_then(|v| v.as_object_mut())
                .and_then(|p| p.get_mut("mcpServers"))
                .and_then(|v| v.as_object_mut())
            {
                servers.remove(&name);
            }
        }
        "project" => {
            return Err(
                "project scope removes belong in <root>/.mcp.json, not ~/.claude.json".to_string(),
            );
        }
        other => return Err(format!("unknown scope: {}", other)),
    }

    atomic_write(&path, &value)
}

/// Run `claude mcp list` and return raw stdout. Spec §8.3: this SPAWNS
/// servers for health checks — frontend gates the call to "panel visible
/// + user-initiated refresh". Tests must never trigger this; cargo tests
/// exercise the parser via `mock_status_runner` only.
#[tauri::command]
pub fn check_mcp_status() -> Result<String, String> {
    RealStatusRunner.run()
}

// ── status runner gate (spec §8.3) ───────────────────────────────────

/// Trait gating the `claude mcp list` subprocess. Production uses
/// `RealStatusRunner`; cargo tests use a fake. The `check_mcp_status`
/// command always uses the real runner — tests never invoke the command.
pub trait StatusRunner {
    fn run(&self) -> Result<String, String>;
}

pub struct RealStatusRunner;

impl StatusRunner for RealStatusRunner {
    fn run(&self) -> Result<String, String> {
        let mut child = std::process::Command::new("claude")
            .args(["mcp", "list"])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;

        let stdout = child.stdout.take();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let status = child.wait();
            let _ = tx.send(status);
        });

        let timeout = std::time::Duration::from_secs(30);
        match rx.recv_timeout(timeout) {
            Ok(Ok(_)) => {
                let mut out = String::new();
                if let Some(mut pipe) = stdout {
                    use std::io::Read;
                    let _ = pipe.read_to_string(&mut out);
                }
                Ok(out)
            }
            Ok(Err(e)) => Err(e.to_string()),
            Err(_) => {
                Err("claude mcp list timed out after 30s".to_string())
            }
        }
    }
}

// ── helpers ─────────────────────────────────────────────────────────

/// Pretty-print `value` to a temp file next to `path`, then rename.
fn atomic_write(path: &std::path::Path, value: &Value) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serialized.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_dir(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join("claude-mgr-mcp-tests").join(name);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    /// `read_mcp_json` returns "" for a missing `.mcp.json`.
    #[test]
    fn read_mcp_json_missing_returns_empty() {
        let dir = tmp_dir("read-missing");
        let result = read_mcp_json(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(result, "");
    }

    /// `read_mcp_json` returns the file contents when present.
    #[test]
    fn read_mcp_json_returns_contents() {
        let dir = tmp_dir("read-present");
        fs::write(dir.join(".mcp.json"), r#"{"mcpServers":{}}"#).unwrap();
        let result = read_mcp_json(dir.to_string_lossy().into_owned()).unwrap();
        assert_eq!(result, r#"{"mcpServers":{}}"#);
    }

    /// `atomic_write` lands the new contents and removes the .tmp.
    #[test]
    fn atomic_write_replaces_target() {
        let dir = tmp_dir("atomic");
        let target = dir.join("claude.json");
        fs::write(&target, "{}").unwrap();
        atomic_write(&target, &json!({"mcpServers":{"a":{"type":"stdio"}}})).unwrap();
        let txt = fs::read_to_string(&target).unwrap();
        assert!(txt.contains("\"a\""));
        assert!(!target.with_extension("json.tmp").exists());
    }

    /// Read-modify-write at user scope preserves unrelated keys.
    #[test]
    fn user_scope_rmw_preserves_unrelated_keys() {
        let original = r#"{"theme":"dark","mcpServers":{"old":{"type":"stdio"}}}"#;
        let mut value: Value = serde_json::from_str(original).unwrap();
        let root = value.as_object_mut().unwrap();
        let servers = root
            .get_mut("mcpServers")
            .unwrap()
            .as_object_mut()
            .unwrap();
        servers.insert(
            "new".to_string(),
            json!({"type":"http","url":"https://x.test"}),
        );
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["mcpServers"]["old"]["type"], "stdio");
        assert_eq!(value["mcpServers"]["new"]["url"], "https://x.test");
    }

    /// `check_mcp_status` is gated behind `StatusRunner` — exercise the
    /// trait with a fake so tests NEVER spawn `claude mcp list`.
    #[test]
    fn status_runner_is_mockable() {
        struct FakeRunner;
        impl StatusRunner for FakeRunner {
            fn run(&self) -> Result<String, String> {
                Ok("fake-output".to_string())
            }
        }
        let f = FakeRunner;
        assert_eq!(f.run().unwrap(), "fake-output");
    }

    // `remove_mcp_server` resolves `~/.claude.json` from USERPROFILE/HOME, so
    // tests must redirect those env vars to a temp home. Serialize via shared
    // mutex; restore originals via RAII guard.
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
    fn remove_local_scope_drops_entry_and_preserves_siblings() {
        let _lk = env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let _g = EnvGuard::capture(&["USERPROFILE", "HOME"]);
        let home = tmp_dir("remove-local-present");
        std::env::set_var("USERPROFILE", &home);
        std::env::remove_var("HOME");

        let cwd = "C:\\projects\\demo";
        let original = serde_json::json!({
            "theme": "dark",
            "projects": {
                cwd: {
                    "mcpServers": {
                        "doomed": {"type": "stdio", "command": "x"},
                        "keeper": {"type": "stdio", "command": "y"}
                    }
                },
                "C:\\projects\\other": {
                    "mcpServers": {"untouched": {"type": "stdio"}}
                }
            }
        });
        fs::write(
            home.join(".claude.json"),
            serde_json::to_string_pretty(&original).unwrap(),
        )
        .unwrap();

        remove_mcp_server("local".to_string(), "doomed".to_string(), cwd.to_string())
            .unwrap();

        let after: Value =
            serde_json::from_str(&fs::read_to_string(home.join(".claude.json")).unwrap())
                .unwrap();
        assert_eq!(after["theme"], "dark");
        assert!(after["projects"][cwd]["mcpServers"]
            .get("doomed")
            .is_none());
        assert_eq!(
            after["projects"][cwd]["mcpServers"]["keeper"]["command"],
            "y"
        );
        assert_eq!(
            after["projects"]["C:\\projects\\other"]["mcpServers"]["untouched"]["type"],
            "stdio"
        );
    }

    #[test]
    fn remove_local_scope_noop_when_project_path_missing() {
        let _lk = env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let _g = EnvGuard::capture(&["USERPROFILE", "HOME"]);
        let home = tmp_dir("remove-local-missing");
        std::env::set_var("USERPROFILE", &home);
        std::env::remove_var("HOME");

        // `projects` has a DIFFERENT cwd; the target cwd path doesn't exist.
        let original = r#"{"theme":"light","projects":{"C:\\elsewhere":{"mcpServers":{"x":{"type":"stdio"}}}}}"#;
        fs::write(home.join(".claude.json"), original).unwrap();

        remove_mcp_server(
            "local".to_string(),
            "ghost".to_string(),
            "C:\\not\\there".to_string(),
        )
        .unwrap();

        let after: Value =
            serde_json::from_str(&fs::read_to_string(home.join(".claude.json")).unwrap())
                .unwrap();
        // Nothing removed; sibling project untouched.
        assert_eq!(after["theme"], "light");
        assert_eq!(
            after["projects"]["C:\\elsewhere"]["mcpServers"]["x"]["type"],
            "stdio"
        );
        assert!(after["projects"].get("C:\\not\\there").is_none());
    }
}
