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
}
