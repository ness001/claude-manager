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

/// Best-effort ISO 8601 → epoch ms. Accepts the `2026-05-04T13:48:51.652Z`
/// shape that Claude Code writes; returns None on anything we can't parse.
/// We avoid pulling in `chrono` for one parser; the format is fixed.
fn parse_iso8601_to_ms(s: &str) -> Option<i64> {
    // Expected: YYYY-MM-DDTHH:MM:SS[.fff]Z
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[10] != b'T' || !s.ends_with('Z') {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: u32 = s.get(5..7)?.parse().ok()?;
    let day: u32 = s.get(8..10)?.parse().ok()?;
    let hour: u32 = s.get(11..13)?.parse().ok()?;
    let minute: u32 = s.get(14..16)?.parse().ok()?;
    let second: u32 = s.get(17..19)?.parse().ok()?;
    let mut millis: i64 = 0;
    if bytes.len() > 20 && bytes[19] == b'.' {
        // up to 3 fractional digits
        let frac_end = s.len() - 1; // strip trailing 'Z'
        let frac = s.get(20..frac_end)?;
        let take = frac.len().min(3);
        let mut buf = String::with_capacity(3);
        buf.push_str(&frac[..take]);
        while buf.len() < 3 {
            buf.push('0');
        }
        millis = buf.parse().ok()?;
    }
    // Days since UNIX epoch (1970-01-01) using the proleptic Gregorian.
    fn is_leap(y: i64) -> bool {
        (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
    }
    let days_in_month = |y: i64, m: u32| -> i64 {
        match m {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 => {
                if is_leap(y) {
                    29
                } else {
                    28
                }
            }
            _ => 0,
        }
    };
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) as u32 {
        return None;
    }
    let mut days: i64 = 0;
    if year >= 1970 {
        for y in 1970..year {
            days += if is_leap(y) { 366 } else { 365 };
        }
    } else {
        for y in year..1970 {
            days -= if is_leap(y) { 366 } else { 365 };
        }
    }
    for m in 1..month {
        days += days_in_month(year, m);
    }
    days += (day as i64) - 1;
    let total_secs = days * 86_400
        + (hour as i64) * 3600
        + (minute as i64) * 60
        + (second as i64);
    Some(total_secs * 1000 + millis)
}

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
    /// Earliest `timestamp` field seen in the JSONL (epoch ms). The first
    /// user/assistant/system line carries the session start time. None if
    /// no parseable timestamp exists in the metadata window.
    pub started_at_ms: Option<i64>,
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

        // Earliest timestamp wins (JSONL is append-order, so first parseable
        // wins on the first iteration; we still keep the min in case a tool
        // ever writes lines out of chronological order).
        if let Some(ts) = value.get("timestamp").and_then(|v| v.as_str()) {
            if let Some(ms) = parse_iso8601_to_ms(ts) {
                out.started_at_ms = Some(match out.started_at_ms {
                    Some(prev) if prev <= ms => prev,
                    _ => ms,
                });
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

    #[test]
    fn parse_iso8601_to_ms_handles_z_with_millis() {
        // 2026-05-04T13:48:51.652Z → epoch ms (verified via Python:
        // datetime(2026,5,4,13,48,51,652000,tzinfo=timezone.utc).timestamp()*1000)
        let v = parse_iso8601_to_ms("2026-05-04T13:48:51.652Z").unwrap();
        assert_eq!(v, 1777902531652);
    }

    #[test]
    fn parse_iso8601_to_ms_handles_no_millis() {
        let v = parse_iso8601_to_ms("2026-05-04T13:48:51Z").unwrap();
        assert_eq!(v, 1777902531000);
    }

    #[test]
    fn parse_iso8601_to_ms_rejects_bad_input() {
        assert!(parse_iso8601_to_ms("not a date").is_none());
        assert!(parse_iso8601_to_ms("2026-13-01T00:00:00Z").is_none()); // bad month
        assert!(parse_iso8601_to_ms("2026-02-30T00:00:00Z").is_none()); // bad day
        assert!(parse_iso8601_to_ms("2026-05-04T13:48:51").is_none()); // no Z
    }

    #[test]
    fn started_at_ms_set_from_earliest_timestamp_in_jsonl() {
        // `normal.jsonl` has `timestamp` fields starting at
        // `2026-05-04T09:00:00.000Z` on line 1 (epoch ms 1777885200000).
        // The parser tracks the MIN across all parseable timestamps, so this
        // is the value we expect.
        let m = parse_jsonl_metadata(&fix("normal.jsonl")).unwrap();
        assert_eq!(m.started_at_ms, Some(1777885200000));
    }
}
