//! Tauri IPC commands for the plugins module — see plan T3.2.
//!
//! Three commands: pass through `installed_plugins.json` and the
//! `enabledPlugins` slice of `settings.json`; walk a plugin's install
//! directory and return a structured contents summary.
//!
//! Path layout (spec §6.1, §6.5):
//!   <installPath>/skills/<name>/SKILL.md       → YAML frontmatter
//!   <installPath>/agents/<name>.md             → YAML frontmatter
//!   <installPath>/hooks/hooks.json             → { event: command, ... }
//!   <installPath>/CLAUDE.md
//!   <installPath>/.claude-plugin/plugin.json   (preferred — spec §6.5)
//!   <installPath>/.claude-plugin/marketplace.json (fallback — DESIGN-CONTEXT §2.9)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::sessions::discovery::claude_home;

/// Per-skill summary parsed from `<installPath>/skills/<name>/SKILL.md`
/// frontmatter. (Plan T3.2 step 4: "skill .md files, read first few
/// lines to extract YAML frontmatter".)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    pub name: String,
    pub description: String,
}

/// Per-agent summary parsed from `<installPath>/agents/<name>.md`
/// frontmatter.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// One row from `<installPath>/hooks/hooks.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEntry {
    pub event: String,
    pub command: String,
}

/// Wire shape returned by `read_plugin_contents`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginContents {
    pub skills: Vec<SkillEntry>,
    pub agents: Vec<AgentEntry>,
    pub hooks: Vec<HookEntry>,
    pub has_claude_md: bool,
    /// `name` from `plugin.json`, falling back to `marketplace.json`'s
    /// matching plugin entry (spec §6.5, DESIGN-CONTEXT §2.9). Empty
    /// string when neither file is present — frontend treats empty as
    /// "fall back to registry key".
    pub manifest_name: String,
    pub manifest_description: String,
}

/// Read `~/.claude/plugins/installed_plugins.json` as a raw string.
/// Returns empty string when the file is missing — frontend treats that
/// as "no plugins installed", consistent with spec §6.2.
#[tauri::command]
pub fn read_installed_plugins() -> Result<String, String> {
    let Some(root) = claude_home() else {
        return Ok(String::new());
    };
    let path = root.join("plugins").join("installed_plugins.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Read `~/.claude/settings.json` as a raw string. Frontend extracts the
/// `enabledPlugins` map. Missing file → empty string.
#[tauri::command]
pub fn read_settings_enabled_plugins() -> Result<String, String> {
    let Some(root) = claude_home() else {
        return Ok(String::new());
    };
    let path = root.join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Set `enabledPlugins["<key>"] = <enabled>` in `~/.claude/settings.json`,
/// preserving all unrelated keys (read-modify-write per Phase 3 conventions).
/// Atomic via write-to-temp-then-rename.
#[tauri::command]
pub fn write_plugin_enabled(
    app: tauri::AppHandle,
    key: String,
    enabled: bool,
) -> Result<(), String> {
    let Some(root) = claude_home() else {
        return Err("Could not resolve ~/.claude".to_string());
    };
    let path = root.join("settings.json");

    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(e) => return Err(e.to_string()),
    };
    let mut value: serde_json::Value = if existing.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&existing).map_err(|e| e.to_string())?
    };

    let map = value
        .as_object_mut()
        .ok_or_else(|| "settings.json is not an object".to_string())?;

    let entry = map
        .entry("enabledPlugins")
        .or_insert_with(|| serde_json::json!({}));
    let inner = entry
        .as_object_mut()
        .ok_or_else(|| "enabledPlugins is not an object".to_string())?;
    inner.insert(key.clone(), serde_json::Value::Bool(enabled));

    let serialized = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serialized.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;

    // Audit trail per spec §6.8 — toggles are one of the Plugins-section
    // operations explicitly enumerated in scope.
    super::log::log_event(
        &app,
        "toggle",
        Some(&key),
        "info",
        &format!("enabled={}", enabled),
    );
    Ok(())
}

/// Walk a plugin directory and summarize its contents.
#[tauri::command]
pub fn read_plugin_contents(install_path: String) -> Result<PluginContents, String> {
    let root = PathBuf::from(install_path);
    if !root.is_dir() {
        // Caller (frontend) is responsible for marking this plugin "broken";
        // returning an empty contents lets detail view degrade gracefully.
        return Ok(PluginContents::default());
    }
    let mut out = PluginContents::default();
    out.skills = scan_skills(&root.join("skills"));
    out.agents = scan_agents(&root.join("agents"));
    out.hooks = read_hooks(&root.join("hooks").join("hooks.json"));
    out.has_claude_md = root.join("CLAUDE.md").is_file();
    let (manifest_name, manifest_description) = read_manifest(&root);
    out.manifest_name = manifest_name;
    out.manifest_description = manifest_description;
    Ok(out)
}

// ── helpers ─────────────────────────────────────────────────────────

/// Scan `<installPath>/skills/` for SKILL.md or top-level *.md files.
/// Real plugins use both shapes:
///   skills/<name>/SKILL.md     (preferred per spec §6.1)
///   skills/<name>.md            (older flat layout)
fn scan_skills(skills_dir: &Path) -> Vec<SkillEntry> {
    let Ok(entries) = std::fs::read_dir(skills_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let skill_md = path.join("SKILL.md");
            if skill_md.is_file() {
                if let Some(fm) = read_frontmatter(&skill_md) {
                    out.push(SkillEntry {
                        name: fm
                            .get("name")
                            .cloned()
                            .unwrap_or_else(|| dir_name(&path)),
                        description: fm.get("description").cloned().unwrap_or_default(),
                    });
                }
            }
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Some(fm) = read_frontmatter(&path) {
                out.push(SkillEntry {
                    name: fm.get("name").cloned().unwrap_or_else(|| stem(&path)),
                    description: fm.get("description").cloned().unwrap_or_default(),
                });
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Scan `<installPath>/agents/` for *.md files with frontmatter.
fn scan_agents(agents_dir: &Path) -> Vec<AgentEntry> {
    let Ok(entries) = std::fs::read_dir(agents_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let Some(fm) = read_frontmatter(&path) else {
            continue;
        };
        let tools = fm
            .get("tools")
            .map(|s| {
                s.trim_matches(|c| c == '[' || c == ']')
                    .split(',')
                    .map(|t| t.trim().trim_matches('"').to_string())
                    .filter(|t| !t.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        out.push(AgentEntry {
            name: fm.get("name").cloned().unwrap_or_else(|| stem(&path)),
            description: fm.get("description").cloned().unwrap_or_default(),
            tools,
            model: fm.get("model").cloned(),
            color: fm.get("color").cloned(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Read `hooks.json` and return one entry per (event, command) pair.
/// hooks.json shape per Claude Code:
///   { "<EventName>": [{ "matcher": "...", "hooks": [{"type":"command","command":"..."}] }, ...] }
fn read_hooks(path: &Path) -> Vec<HookEntry> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(obj) = val.as_object() {
        for (event, entries) in obj {
            let Some(arr) = entries.as_array() else {
                continue;
            };
            for matcher_entry in arr {
                let Some(hooks) = matcher_entry.get("hooks").and_then(|v| v.as_array()) else {
                    continue;
                };
                for hook in hooks {
                    if let Some(cmd) = hook.get("command").and_then(|v| v.as_str()) {
                        out.push(HookEntry {
                            event: event.clone(),
                            command: cmd.to_string(),
                        });
                    }
                }
            }
        }
    }
    out
}

/// Try `<root>/.claude-plugin/plugin.json` first; fall back to
/// `<root>/.claude-plugin/marketplace.json` and pick the first
/// `plugins[]` entry. Returns ("", "") when neither file is present.
fn read_manifest(root: &Path) -> (String, String) {
    let dir = root.join(".claude-plugin");
    let plugin_path = dir.join("plugin.json");
    if let Ok(bytes) = std::fs::read(&plugin_path) {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            let n = val
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let d = val
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            return (n, d);
        }
    }
    let mp_path = dir.join("marketplace.json");
    if let Ok(bytes) = std::fs::read(&mp_path) {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            // marketplace.json has plugins: [{ name, description, ... }]
            if let Some(first) = val
                .get("plugins")
                .and_then(|v| v.as_array())
                .and_then(|a| a.first())
            {
                let n = first
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let d = first
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                return (n, d);
            }
        }
    }
    (String::new(), String::new())
}

/// Tiny YAML-frontmatter reader: parses the `key: value` lines between
/// the first `---` fences at the head of a markdown file. Values are
/// trimmed; quoted values have surrounding quotes stripped. Anything
/// past the closing `---` is ignored.
fn read_frontmatter(path: &Path) -> Option<std::collections::HashMap<String, String>> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut out = std::collections::HashMap::new();
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed.trim() == "---" {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_string();
            let mut val = v.trim().to_string();
            if (val.starts_with('"') && val.ends_with('"') && val.len() >= 2)
                || (val.starts_with('\'') && val.ends_with('\'') && val.len() >= 2)
            {
                val = val[1..val.len() - 1].to_string();
            }
            if !key.is_empty() {
                out.insert(key, val);
            }
        }
    }
    Some(out)
}

fn dir_name(p: &Path) -> String {
    p.file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn stem(p: &Path) -> String {
    p.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// Spawn the `claude` CLI to install a plugin by name, streaming every line
/// of stdout/stderr into the Plugins log so the open Log window tails the
/// CLI output live (spec §6.7 / §6.8). Blocks until the child exits; the
/// frontend is expected to `await` and then reload the plugin list.
///
/// Returns the exit code; non-zero is surfaced as Ok(code) — the caller
/// inspects it and surfaces a UI error. We intentionally don't translate
/// non-zero into Err because the CLI already emitted the diagnostic into
/// the log; an Err here would just duplicate that into the toast layer.
#[tauri::command]
pub fn install_plugin(app: tauri::AppHandle, name: String) -> Result<i32, String> {
    spawn_claude_plugin(&app, "install", &name)
}

/// Same shape as `install_plugin` but for `claude plugins uninstall <key>`.
/// `key` is `<name>@<marketplace>` per the registry layout.
#[tauri::command]
pub fn uninstall_plugin(app: tauri::AppHandle, key: String) -> Result<i32, String> {
    spawn_claude_plugin(&app, "uninstall", &key)
}

/// Drive `claude plugins <op> <arg>` to completion. stdout/stderr are
/// read line-by-line on background threads and forwarded through the
/// Plugins log so the Log window updates as the CLI runs. The parent
/// thread waits on the child and on both reader joins before returning.
fn spawn_claude_plugin(
    app: &tauri::AppHandle,
    op: &str,
    arg: &str,
) -> Result<i32, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};

    super::log::log_event(app, op, Some(arg), "start", &format!("claude plugins {} {}", op, arg));

    let mut cmd = Command::new(claude_cli_name());
    cmd.args(["plugins", op, arg])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()
        .map_err(|e| {
            let msg = format!("failed to spawn claude: {}", e);
            super::log::log_event(app, op, Some(arg), "error", &msg);
            msg
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_out = app.clone();
    let app_err = app.clone();
    let op_owned = op.to_string();
    let arg_owned = arg.to_string();
    let op_owned2 = op.to_string();
    let arg_owned2 = arg.to_string();

    let out_join = std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                super::log::log_event(&app_out, &op_owned, Some(&arg_owned), "stdout", &line);
            }
        }
    });
    let err_join = std::thread::spawn(move || {
        if let Some(err) = stderr {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                super::log::log_event(&app_err, &op_owned2, Some(&arg_owned2), "stderr", &line);
            }
        }
    });

    let status = child.wait().map_err(|e| {
        let msg = format!("wait failed: {}", e);
        super::log::log_event(app, op, Some(arg), "error", &msg);
        msg
    })?;
    let _ = out_join.join();
    let _ = err_join.join();

    let code = status.code().unwrap_or(-1);
    super::log::log_event(app, op, Some(arg), "end", &format!("exit={}", code));
    Ok(code)
}

/// Drop a stale entry from `settings.json`'s `enabledPlugins` map. Used by
/// the Plugins UI's "Remove" affordance on orphaned cards (spec §6.7, C1
/// in the gap audit). No CLI spawn — there's nothing on disk to uninstall;
/// the entry is just dangling settings state.
#[tauri::command]
pub fn remove_orphaned_plugin(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let Some(root) = claude_home() else {
        return Err("Could not resolve ~/.claude".to_string());
    };
    let path = root.join("settings.json");
    let existing = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "{}".to_string(),
        Err(e) => return Err(e.to_string()),
    };
    let mut value: serde_json::Value = if existing.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(&existing).map_err(|e| e.to_string())?
    };
    if let Some(map) = value
        .as_object_mut()
        .and_then(|m| m.get_mut("enabledPlugins"))
        .and_then(|v| v.as_object_mut())
    {
        map.remove(&key);
    }
    let serialized = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serialized.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    super::log::log_event(&app, "remove-orphaned", Some(&key), "info", "removed from enabledPlugins");
    Ok(())
}

/// Resolve the Claude CLI binary name. On Windows the npm shim is
/// `claude.cmd`; elsewhere it's plain `claude`. We rely on PATH; if the
/// user has Claude installed via a non-PATH location, the spawn will fail
/// with a recognizable "failed to spawn" log entry.
fn claude_cli_name() -> &'static str {
    if cfg!(windows) { "claude.cmd" } else { "claude" }
}

/// Look up `git ls-remote origin HEAD` for each marketplace under
/// `~/.claude/plugins/marketplaces/<name>/`. Returns a marketplace → SHA map.
/// Marketplaces that aren't a git checkout, can't reach their remote, or
/// time out are simply omitted. Spec §13 (cache TTL is enforced on the
/// frontend).
#[tauri::command]
pub fn check_plugin_updates(marketplaces: Vec<String>) -> Result<std::collections::HashMap<String, String>, String> {
    let Some(root) = claude_home() else {
        return Err("Could not resolve ~/.claude".to_string());
    };
    let marketplaces_root = root.join("plugins").join("marketplaces");
    let mut out: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for name in marketplaces {
        let dir = marketplaces_root.join(&name);
        if !dir.join(".git").exists() {
            continue;
        }
        let output = {
            let mut cmd = std::process::Command::new("git");
            cmd.args(["ls-remote", "origin", "HEAD"])
                .current_dir(&dir);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }
            cmd.output()
        };
        let Ok(output) = output else { continue };
        if !output.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Some(sha) = stdout.split_whitespace().next() {
            if sha.len() == 40 {
                out.insert(name, sha.to_string());
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join("claude-mgr-plugin-tests").join(name);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn read_plugin_contents_handles_missing_dir() {
        let result = read_plugin_contents("Z:/this/does/not/exist".to_string()).unwrap();
        assert!(result.skills.is_empty());
        assert!(result.agents.is_empty());
        assert!(result.hooks.is_empty());
        assert!(!result.has_claude_md);
    }

    #[test]
    fn manifest_falls_back_to_marketplace_json() {
        let root = tmp_dir("fallback");
        let cp = root.join(".claude-plugin");
        fs::create_dir_all(&cp).unwrap();
        // Only marketplace.json — no plugin.json (DESIGN-CONTEXT §2.9).
        fs::write(
            cp.join("marketplace.json"),
            r#"{"plugins":[{"name":"doc-skills","description":"docs"}]}"#,
        )
        .unwrap();
        let (n, d) = read_manifest(&root);
        assert_eq!(n, "doc-skills");
        assert_eq!(d, "docs");
    }

    #[test]
    fn manifest_prefers_plugin_json_when_both_present() {
        let root = tmp_dir("preferred");
        let cp = root.join(".claude-plugin");
        fs::create_dir_all(&cp).unwrap();
        fs::write(
            cp.join("plugin.json"),
            r#"{"name":"primary","description":"from plugin.json"}"#,
        )
        .unwrap();
        fs::write(
            cp.join("marketplace.json"),
            r#"{"plugins":[{"name":"secondary","description":"from marketplace.json"}]}"#,
        )
        .unwrap();
        let (n, d) = read_manifest(&root);
        assert_eq!(n, "primary");
        assert_eq!(d, "from plugin.json");
    }

    #[test]
    fn read_frontmatter_parses_quoted_and_bare_values() {
        let root = tmp_dir("fm");
        let p = root.join("a.md");
        fs::write(
            &p,
            "---\nname: hello\ndescription: \"a quoted desc\"\nmodel: claude-opus-4-6\n---\nbody\n",
        )
        .unwrap();
        let fm = read_frontmatter(&p).unwrap();
        assert_eq!(fm.get("name").unwrap(), "hello");
        assert_eq!(fm.get("description").unwrap(), "a quoted desc");
        assert_eq!(fm.get("model").unwrap(), "claude-opus-4-6");
    }

    #[test]
    fn read_frontmatter_empty_value_yields_empty_string() {
        let root = tmp_dir("fm-empty-value");
        let p = root.join("a.md");
        fs::write(&p, "---\nname: hello\ndescription: \n---\n").unwrap();
        let fm = read_frontmatter(&p).unwrap();
        assert_eq!(fm.get("name").unwrap(), "hello");
        assert_eq!(fm.get("description").unwrap(), "");
    }

    #[test]
    fn read_frontmatter_value_with_colon_is_preserved() {
        let root = tmp_dir("fm-colon-value");
        let p = root.join("a.md");
        fs::write(
            &p,
            "---\nname: hello\nurl: https://example.com/path?q=1\n---\n",
        )
        .unwrap();
        let fm = read_frontmatter(&p).unwrap();
        assert_eq!(fm.get("url").unwrap(), "https://example.com/path?q=1");
    }

    #[test]
    fn read_frontmatter_missing_closing_fence_returns_partial() {
        let root = tmp_dir("fm-no-close");
        let p = root.join("a.md");
        fs::write(&p, "---\nname: hello\ndescription: world\n").unwrap();
        let fm = read_frontmatter(&p).unwrap();
        assert_eq!(fm.get("name").unwrap(), "hello");
        assert_eq!(fm.get("description").unwrap(), "world");
    }

    #[test]
    fn scan_skills_handles_skill_md_layout() {
        let root = tmp_dir("skills-dir");
        let s = root.join("my-skill");
        fs::create_dir_all(&s).unwrap();
        fs::write(
            s.join("SKILL.md"),
            "---\nname: my-skill\ndescription: hi\n---\n",
        )
        .unwrap();
        let skills = scan_skills(&root);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
    }

    #[test]
    fn read_hooks_extracts_event_command_pairs() {
        let root = tmp_dir("hooks");
        let path = root.join("hooks.json");
        fs::write(
            &path,
            r#"{"SessionStart":[{"matcher":"","hooks":[{"type":"command","command":"echo hi"}]}]}"#,
        )
        .unwrap();
        let hooks = read_hooks(&path);
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].event, "SessionStart");
        assert_eq!(hooks[0].command, "echo hi");
    }

    #[test]
    fn scan_agents_parses_basic_frontmatter() {
        let root = tmp_dir("agents-basic");
        fs::write(
            root.join("researcher.md"),
            "---\nname: researcher\ndescription: digs through code\n---\nbody\n",
        )
        .unwrap();
        let agents = scan_agents(&root);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "researcher");
        assert_eq!(agents[0].description, "digs through code");
        assert!(agents[0].tools.is_empty());
        assert!(agents[0].model.is_none());
        assert!(agents[0].color.is_none());
    }

    #[test]
    fn scan_agents_parses_tools_list() {
        let root = tmp_dir("agents-tools");
        fs::write(
            root.join("worker.md"),
            "---\nname: worker\ndescription: does stuff\ntools: [Read, Write, Bash]\n---\n",
        )
        .unwrap();
        let agents = scan_agents(&root);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].tools, vec!["Read", "Write", "Bash"]);
    }

    #[test]
    fn scan_agents_optional_model_and_color() {
        let root = tmp_dir("agents-optional");
        fs::write(
            root.join("with.md"),
            "---\nname: with\ndescription: d\nmodel: claude-opus-4-6\ncolor: blue\n---\n",
        )
        .unwrap();
        fs::write(
            root.join("without.md"),
            "---\nname: without\ndescription: d\n---\n",
        )
        .unwrap();
        let agents = scan_agents(&root);
        assert_eq!(agents.len(), 2);
        let with = agents.iter().find(|a| a.name == "with").unwrap();
        let without = agents.iter().find(|a| a.name == "without").unwrap();
        assert_eq!(with.model.as_deref(), Some("claude-opus-4-6"));
        assert_eq!(with.color.as_deref(), Some("blue"));
        assert!(without.model.is_none());
        assert!(without.color.is_none());
    }

    #[test]
    fn scan_agents_sorts_by_name_ascending() {
        let root = tmp_dir("agents-sort");
        fs::write(
            root.join("zebra.md"),
            "---\nname: zebra\ndescription: z\n---\n",
        )
        .unwrap();
        fs::write(
            root.join("apple.md"),
            "---\nname: apple\ndescription: a\n---\n",
        )
        .unwrap();
        fs::write(
            root.join("mango.md"),
            "---\nname: mango\ndescription: m\n---\n",
        )
        .unwrap();
        let agents = scan_agents(&root);
        let names: Vec<&str> = agents.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["apple", "mango", "zebra"]);
    }

    #[test]
    fn read_hooks_flattens_multiple_matchers() {
        let root = tmp_dir("hooks-multi");
        let path = root.join("hooks.json");
        fs::write(
            &path,
            r#"{"PreToolUse":[
                {"matcher":"Bash","hooks":[{"type":"command","command":"echo one"}]},
                {"matcher":"Write","hooks":[
                    {"type":"command","command":"echo two"},
                    {"type":"command","command":"echo three"}
                ]}
            ]}"#,
        )
        .unwrap();
        let hooks = read_hooks(&path);
        assert_eq!(hooks.len(), 3);
        assert!(hooks.iter().all(|h| h.event == "PreToolUse"));
        let cmds: Vec<&str> = hooks.iter().map(|h| h.command.as_str()).collect();
        assert!(cmds.contains(&"echo one"));
        assert!(cmds.contains(&"echo two"));
        assert!(cmds.contains(&"echo three"));
    }

    #[test]
    fn read_hooks_skips_non_command_hook_types() {
        let root = tmp_dir("hooks-noncmd");
        let path = root.join("hooks.json");
        // First hook has no `command` field (e.g., "webhook" shape) — must be
        // skipped silently; the trailing command hook still comes through.
        fs::write(
            &path,
            r#"{"PostToolUse":[{"matcher":"","hooks":[
                {"type":"webhook","url":"https://example.com/hook"},
                {"type":"command","command":"echo kept"}
            ]}]}"#,
        )
        .unwrap();
        let hooks = read_hooks(&path);
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].command, "echo kept");
    }

    #[test]
    fn read_hooks_handles_malformed_value_shape() {
        let root = tmp_dir("hooks-malformed");
        let path = root.join("hooks.json");
        // Event value is a string instead of an array — parser should skip
        // it via the `as_array()` guard, not panic.
        fs::write(&path, r#"{"PreToolUse":"not-an-array","Notification":42}"#).unwrap();
        let hooks = read_hooks(&path);
        assert!(hooks.is_empty());
    }

    /// Lightweight test for the read-modify-write JSON shape produced by
    /// `write_plugin_enabled` — exercises the inner mutation logic without
    /// invoking the Tauri command (which would touch the real `~/.claude`).
    #[test]
    fn enabled_plugins_rmw_preserves_unrelated_keys() {
        let original = r#"{"theme":"dark","enabledPlugins":{"a@m":true,"b@m":false},"customApiKeyResponses":{"approved":[]}}"#;
        let mut value: serde_json::Value = serde_json::from_str(original).unwrap();
        let map = value.as_object_mut().unwrap();
        let entry = map
            .entry("enabledPlugins")
            .or_insert_with(|| serde_json::json!({}));
        entry
            .as_object_mut()
            .unwrap()
            .insert("a@m".to_string(), serde_json::Value::Bool(false));
        // Unrelated keys preserved.
        assert_eq!(value["theme"], "dark");
        assert!(value.get("customApiKeyResponses").is_some());
        // Mutated entry flipped.
        assert_eq!(value["enabledPlugins"]["a@m"], false);
        // Sibling enabledPlugins entry unchanged.
        assert_eq!(value["enabledPlugins"]["b@m"], false);
    }

    /// Mirror of the toggle RMW test for the orphaned-remove path: the
    /// removed key disappears, every unrelated key stays put. This is the
    /// shape `remove_orphaned_plugin` writes back via serde — the test
    /// pins the in-memory mutation so future refactors don't accidentally
    /// nuke siblings under enabledPlugins or top-level keys.
    #[test]
    fn remove_orphaned_drops_only_target_key() {
        let original = r#"{"theme":"dark","enabledPlugins":{"a@m":true,"b@m":false,"c@m":true},"other":42}"#;
        let mut value: serde_json::Value = serde_json::from_str(original).unwrap();
        if let Some(map) = value
            .as_object_mut()
            .and_then(|m| m.get_mut("enabledPlugins"))
            .and_then(|v| v.as_object_mut())
        {
            map.remove("b@m");
        }
        assert_eq!(value["theme"], "dark");
        assert_eq!(value["other"], 42);
        assert_eq!(value["enabledPlugins"]["a@m"], true);
        assert!(value["enabledPlugins"].get("b@m").is_none());
        assert_eq!(value["enabledPlugins"]["c@m"], true);
    }

    /// Missing enabledPlugins key is a no-op rather than a panic — covers
    /// the orphaned-remove edge case where the user clicks Remove on a
    /// card that some other process already cleaned up between list
    /// render and click.
    #[test]
    fn remove_orphaned_on_missing_map_is_noop() {
        let original = r#"{"theme":"dark"}"#;
        let mut value: serde_json::Value = serde_json::from_str(original).unwrap();
        if let Some(map) = value
            .as_object_mut()
            .and_then(|m| m.get_mut("enabledPlugins"))
            .and_then(|v| v.as_object_mut())
        {
            map.remove("b@m");
        }
        assert_eq!(value["theme"], "dark");
        assert!(value.get("enabledPlugins").is_none());
    }
}
