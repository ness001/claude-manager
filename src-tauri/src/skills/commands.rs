//! Tauri IPC command for custom skills — see plan T3.6, spec §7.
//!
//! `scan_custom_skills` enumerates `~/.claude/skills/` subdirectories and
//! returns one `CustomSkillEntry` per subdirectory containing a parseable
//! `SKILL.md`. Subdirectories without `SKILL.md` are silently skipped.
//! Plugin-bundled skills (under `~/.claude/plugins/...`) are NOT included
//! because we only walk `~/.claude/skills/`.

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::sessions::discovery::claude_home;

/// Wire shape returned by `scan_custom_skills`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSkillEntry {
    pub name: String,
    pub description: String,
    pub dir_path: String,
    pub skill_md_path: String,
}

#[tauri::command]
pub fn scan_custom_skills() -> Result<Vec<CustomSkillEntry>, String> {
    let Some(root) = claude_home() else {
        return Ok(Vec::new());
    };
    Ok(scan_dir(&root.join("skills")))
}

fn scan_dir(skills_dir: &Path) -> Vec<CustomSkillEntry> {
    let Ok(entries) = std::fs::read_dir(skills_dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Some(fm) = read_frontmatter(&skill_md) else {
            continue;
        };
        let dir_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        out.push(CustomSkillEntry {
            name: fm
                .get("name")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or(dir_name),
            description: fm
                .get("description")
                .map(|s| s.trim().to_string())
                .unwrap_or_default(),
            dir_path: path.to_string_lossy().to_string(),
            skill_md_path: skill_md.to_string_lossy().to_string(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Tiny YAML-frontmatter reader (mirrors `plugins::commands::read_frontmatter`).
/// Returns `None` if the file lacks an opening `---` fence.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join("claude-mgr-skill-tests").join(name);
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn scan_returns_one_entry_per_skill_md_directory() {
        let root = tmp_dir("ok");
        let a = root.join("alpha");
        fs::create_dir_all(&a).unwrap();
        fs::write(
            a.join("SKILL.md"),
            "---\nname: alpha\ndescription: a desc\n---\nbody\n",
        )
        .unwrap();
        let b = root.join("beta");
        fs::create_dir_all(&b).unwrap();
        fs::write(
            b.join("SKILL.md"),
            "---\nname: beta\ndescription: b desc\n---\nbody\n",
        )
        .unwrap();
        let out = scan_dir(&root);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].name, "alpha");
        assert_eq!(out[1].name, "beta");
    }

    #[test]
    fn skips_directory_without_skill_md() {
        let root = tmp_dir("nomd");
        fs::create_dir_all(root.join("only-dir")).unwrap();
        let out = scan_dir(&root);
        assert!(out.is_empty());
    }

    #[test]
    fn skips_malformed_frontmatter() {
        let root = tmp_dir("bad");
        let d = root.join("broken");
        fs::create_dir_all(&d).unwrap();
        // No leading --- fence → parser returns None → entry omitted.
        fs::write(d.join("SKILL.md"), "no frontmatter at all\n").unwrap();
        let out = scan_dir(&root);
        assert!(out.is_empty());
    }

    #[test]
    fn falls_back_to_dir_name_when_frontmatter_lacks_name() {
        let root = tmp_dir("fallback");
        let d = root.join("dir-named-skill");
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("SKILL.md"), "---\ndescription: only a desc\n---\n").unwrap();
        let out = scan_dir(&root);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "dir-named-skill");
        assert_eq!(out[0].description, "only a desc");
    }
}
