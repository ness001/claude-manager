//! JSONL metadata parsing — first ~10 lines for SessionMeta fields, plus
//! a streaming `user` + `assistant` line counter for `messageCount`.
//!
//! Keep this module pure: no IO of `~/.claude/` paths here, only of the
//! supplied path. Callers (`discovery`, `commands`) are responsible for
//! locating files.
//!
//! Critical (DESIGN-CONTEXT §2 / spec §11):
//!   - `message.content` may be a bare string OR a content block array.
//!   - `messageCount` counts only `user` + `assistant` lines (spec §5.1).

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// Subset of fields the frontend `parseJsonlMetadata` shape needs. Field
/// names mirror the TS `SessionMeta` casing so JSON travels untransformed.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadata {
    pub session_id: String,
    pub cwd: Option<String>,
    pub first_prompt: Option<String>,
    pub model: Option<String>,
    pub version: Option<String>,
    pub permission_mode: Option<String>,
    pub git_branch: Option<String>,
    pub slug: Option<String>,
    /// Defaults to false when absent; loader overlays the value from
    /// `sessions-index.json` (the only source spec §5.1 trusts for this).
    pub is_sidechain: bool,
    pub kind: Option<String>,
    pub entrypoint: Option<String>,
    /// Count of lines whose `type` is `user` or `assistant`.
    pub message_count: u32,
    /// Bytes; convenient for dirty-check.
    pub file_size: u64,
    /// Last-modified epoch ms.
    pub mtime_ms: i64,
}

/// First-10-lines metadata window — matches frontend `METADATA_WINDOW`.
const METADATA_WINDOW: usize = 10;

/// Parse `~10` lines for metadata, then continue scanning to count
/// `user` + `assistant` occurrences. Returns a SessionMetadata with the
/// `session_id` defaulted to the file stem when JSONL omits it.
pub fn parse_jsonl_metadata(path: &Path) -> std::io::Result<SessionMetadata> {
    let file = File::open(path)?;
    let meta = file.metadata()?;
    let mut out = SessionMetadata::default();
    out.file_size = meta.len();
    out.mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    out.session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let reader = BufReader::new(file);
    for (idx, line_res) in reader.lines().enumerate() {
        let Ok(line) = line_res else { continue };
        if line.is_empty() {
            continue;
        }
        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Always: count user / assistant for messageCount.
        if let Some(t) = value.get("type").and_then(|v| v.as_str()) {
            if t == "user" || t == "assistant" {
                out.message_count = out.message_count.saturating_add(1);
            }
        }

        // Only first METADATA_WINDOW lines contribute to header fields.
        if idx >= METADATA_WINDOW {
            continue;
        }

        // sessionId from line content takes priority over filename stem.
        if let Some(s) = value.get("sessionId").and_then(|v| v.as_str()) {
            if out.session_id.is_empty() || out.session_id != s {
                out.session_id = s.to_string();
            }
        }
        if out.cwd.is_none() {
            if let Some(s) = value.get("cwd").and_then(|v| v.as_str()) {
                out.cwd = Some(s.to_string());
            }
        }
        if out.version.is_none() {
            if let Some(s) = value.get("version").and_then(|v| v.as_str()) {
                out.version = Some(s.to_string());
            }
        }
        if out.git_branch.is_none() {
            if let Some(s) = value.get("gitBranch").and_then(|v| v.as_str()) {
                out.git_branch = Some(s.to_string());
            }
        }
        if out.entrypoint.is_none() {
            if let Some(s) = value.get("entrypoint").and_then(|v| v.as_str()) {
                out.entrypoint = Some(s.to_string());
            }
        }
        if out.slug.is_none() {
            if let Some(s) = value.get("slug").and_then(|v| v.as_str()) {
                out.slug = Some(s.to_string());
            }
        }
        if out.permission_mode.is_none() {
            // JSONL writes both `permissionMode` and `permission-mode`.
            let pm = value
                .get("permissionMode")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("permission-mode").and_then(|v| v.as_str()));
            if let Some(s) = pm {
                out.permission_mode = Some(s.to_string());
            }
        }
        if let Some(b) = value.get("isSidechain").and_then(|v| v.as_bool()) {
            // Will be overlaid by `sessions-index.json` later if present.
            out.is_sidechain = b;
        }
        if out.model.is_none() {
            // assistant: message.model
            if let Some(m) = value
                .pointer("/message/model")
                .and_then(|v| v.as_str())
            {
                out.model = Some(m.to_string());
            }
        }
        if out.first_prompt.is_none()
            && value.get("type").and_then(|v| v.as_str()) == Some("user")
        {
            // content may be a string OR an array of content blocks.
            if let Some(c) = value.pointer("/message/content") {
                if let Some(s) = c.as_str() {
                    out.first_prompt = Some(s.to_string());
                } else if let Some(arr) = c.as_array() {
                    let joined = arr
                        .iter()
                        .filter_map(|b| {
                            if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                                b.get("text").and_then(|v| v.as_str())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\n");
                    if !joined.is_empty() {
                        out.first_prompt = Some(joined);
                    }
                }
            }
        }
    }
    Ok(out)
}

/// Read the entire JSONL file as a Vec of raw line strings (no parsing).
pub fn read_jsonl_lines(path: &Path) -> std::io::Result<Vec<String>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines() {
        out.push(line?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fix(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/rust-sessions/projects/proj-a")
            .join(name)
    }

    #[test]
    fn extracts_full_metadata_from_normal_fixture() {
        let m = parse_jsonl_metadata(&fix("normal.jsonl")).unwrap();
        assert_eq!(m.session_id, "sess-normal");
        assert_eq!(m.first_prompt.as_deref(), Some("hello, claude"));
        assert_eq!(m.model.as_deref(), Some("claude-opus-4.6"));
        assert_eq!(m.version.as_deref(), Some("2.1.98"));
        assert_eq!(m.permission_mode.as_deref(), Some("default"));
        assert_eq!(m.git_branch.as_deref(), Some("main"));
        assert_eq!(m.slug.as_deref(), Some("chat-with-claude"));
        assert!(!m.is_sidechain);
        // Counts user + assistant only — fixture has 3 user + 2 assistant.
        assert_eq!(m.message_count, 5);
    }

    #[test]
    fn version_may_be_12_char_sha() {
        let m = parse_jsonl_metadata(&fix("version-sha.jsonl")).unwrap();
        assert_eq!(m.version.as_deref(), Some("abc123def456"));
    }

    #[test]
    fn slug_is_none_when_absent() {
        let m = parse_jsonl_metadata(&fix("no-slug.jsonl")).unwrap();
        assert!(m.slug.is_none());
        assert!(m.first_prompt.is_some());
    }

    #[test]
    fn message_count_excludes_system_and_progress() {
        // noisy-progress: 1 user + 1 assistant + 8 progress = 2 counted.
        let m = parse_jsonl_metadata(&fix("noisy-progress.jsonl")).unwrap();
        assert_eq!(m.message_count, 2);
    }

    #[test]
    fn truncated_final_line_does_not_panic() {
        let m = parse_jsonl_metadata(&fix("truncated.jsonl")).unwrap();
        // 1 user + 1 assistant counted; truncated tail silently dropped.
        assert_eq!(m.message_count, 2);
        assert_eq!(m.session_id, "sess-trunc");
    }

    #[test]
    fn read_jsonl_lines_returns_all_lines() {
        let lines = read_jsonl_lines(&fix("normal.jsonl")).unwrap();
        assert_eq!(lines.len(), 9);
    }
}
