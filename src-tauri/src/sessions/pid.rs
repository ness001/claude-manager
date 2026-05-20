//! PID file reader + process liveness probe.
//!
//! PID files live at `~/.claude/sessions/{pid}.json`. Per DESIGN-CONTEXT
//! §2.3 they are ephemeral — absence means "ended", not "never existed".
//!
//! Liveness uses PowerShell `Get-WmiObject Win32_Process` (spec §17.4).
//! The PowerShell call is hidden behind `ProcessProbe` so unit tests can
//! supply a fake (no real processes spawned in `cargo test`).

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

/// Contents of `~/.claude/sessions/{pid}.json`. JSONL value names mirror
/// the TS `PidFileData` type so the wire format is identical.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PidFileData {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    /// Epoch milliseconds. The on-disk format is always an integer; the
    /// `±60s` PID-reuse guard at `pid.rs:169` does the arithmetic directly.
    pub started_at: i64,
    pub kind: String,
    pub entrypoint: String,
}

/// Read every `*.json` from `<root>/sessions/`. Bad files are skipped.
pub fn read_pid_files_in(root: &Path) -> Vec<PidFileData> {
    let dir = root.join("sessions");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = std::fs::read(&p) else { continue };
        if let Ok(parsed) = serde_json::from_slice::<PidFileData>(&bytes) {
            out.push(parsed);
        }
    }
    out
}

/// Probe interface — implementations decide HOW to ask the OS whether a
/// PID matches a `node.exe ... cli.js` process started near `started_at`.
///
/// Public — consumed by `is_process_alive_with` (T2.5 frontend will wrap
/// `read_pid_files` + a probe call). Marked `allow(dead_code)` while the
/// liveness IPC isn't wired yet.
#[allow(dead_code)]
pub trait ProcessProbe: Send + Sync {
    /// Return Some((command_line, creation_epoch_ms)) when the process is
    /// alive, None otherwise. Implementation must enforce its own timeout.
    fn query(&self, pid: u32) -> Option<(String, i64)>;
}

/// Production probe — shells out to PowerShell with a 5s wall clock.
#[allow(dead_code)]
pub struct PowerShellProbe;

impl ProcessProbe for PowerShellProbe {
    fn query(&self, pid: u32) -> Option<(String, i64)> {
        // Get-WmiObject (NOT Get-CimInstance) per spec §17.4 / DESIGN-CONTEXT
        // §2.10 — better PowerShell 5.1 compatibility.
        let script = format!(
            "$ErrorActionPreference='SilentlyContinue';\
             $p=Get-WmiObject Win32_Process -Filter \"ProcessId = {pid}\";\
             if($p){{\"$($p.CommandLine)|$($p.CreationDate)\"}}"
        );
        let mut child = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;

        // Manual 5s wall clock — `Command` has no built-in timeout.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => {
                    if std::time::Instant::now() > deadline {
                        let _ = child.kill();
                        return None;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(_) => return None,
            }
        }
        let output = child.wait_with_output().ok()?;
        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if raw.is_empty() {
            return None;
        }
        let mut parts = raw.splitn(2, '|');
        let cmdline = parts.next()?.to_string();
        let wmi_date = parts.next()?.trim().to_string();
        let creation_ms = parse_wmi_creation_date(&wmi_date)?;
        Some((cmdline, creation_ms))
    }
}

/// WMI CreationDate format: `yyyymmddHHMMSS.ffffff[+-]TZmin` e.g.
/// `20260504093045.123456+000`. Returns epoch ms in UTC, ignoring sub-ms.
#[allow(dead_code)]
fn parse_wmi_creation_date(s: &str) -> Option<i64> {
    if s.len() < 14 {
        return None;
    }
    let bytes = s.as_bytes();
    let parse = |range: std::ops::Range<usize>| {
        std::str::from_utf8(&bytes[range]).ok()?.parse::<i64>().ok()
    };
    let year = parse(0..4)?;
    let month = parse(4..6)?;
    let day = parse(6..8)?;
    let hour = parse(8..10)?;
    let min = parse(10..12)?;
    let sec = parse(12..14)?;
    // Zeller-free epoch math: build a NaiveDateTime by hand.
    // We avoid pulling chrono just for this; treat as UTC.
    let days_from_civil = days_from_civil(year, month as u32, day as u32);
    let secs = days_from_civil * 86400
        + hour * 3600
        + min * 60
        + sec;
    Some(secs * 1000)
}

/// Howard Hinnant's days_from_civil — converts a (Y/M/D) tuple to days
/// since 1970-01-01. Public domain.
#[allow(dead_code)]
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let m = m as u64;
    let d = d as u64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe as i64 - 719468
}

/// Decide liveness given a probe + the PID file's `started_at`.
/// Cross-checks per spec §17.4 / DESIGN-CONTEXT §2.4:
///   1. process exists,
///   2. CommandLine contains `cli.js`,
///   3. CreationDate within ±60s of `started_at` (PID-reuse guard).
#[allow(dead_code)]
pub fn is_process_alive_with(
    probe: &dyn ProcessProbe,
    pid: u32,
    started_at_ms: i64,
) -> bool {
    let Some((cmdline, creation_ms)) = probe.query(pid) else {
        return false;
    };
    if !cmdline.contains("cli.js") {
        return false;
    }
    let delta = (creation_ms - started_at_ms).abs();
    delta <= 60_000
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Mutex;

    fn fixtures_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/rust-sessions")
    }

    /// Probe stub for tests — never spawns a real process.
    struct FakeProbe {
        responses: Mutex<Vec<Option<(String, i64)>>>,
    }
    impl ProcessProbe for FakeProbe {
        fn query(&self, _pid: u32) -> Option<(String, i64)> {
            self.responses.lock().unwrap().remove(0)
        }
    }

    #[test]
    fn read_pid_files_returns_well_formed_records() {
        let pids = read_pid_files_in(&fixtures_root());
        assert!(!pids.is_empty(), "expected at least one PID fixture");
        let alive = pids.iter().find(|p| p.session_id == "sess-alive").unwrap();
        assert_eq!(alive.kind, "interactive");
    }

    #[test]
    fn alive_when_cli_js_present_and_creation_close_to_started_at() {
        // started_at: 2026-05-04T09:30:00Z → epoch ms.
        let started = 1778_852_400_000;
        let probe = FakeProbe {
            responses: Mutex::new(vec![Some((
                "C:\\Windows\\node.exe C:\\path\\to\\claude-code\\cli.js --resume foo".into(),
                started + 5_000,
            ))]),
        };
        assert!(is_process_alive_with(&probe, 1234, started));
    }

    #[test]
    fn dead_when_probe_returns_none() {
        let probe = FakeProbe {
            responses: Mutex::new(vec![None]),
        };
        assert!(!is_process_alive_with(&probe, 99999, 0));
    }

    #[test]
    fn dead_when_command_line_missing_cli_js() {
        let probe = FakeProbe {
            responses: Mutex::new(vec![Some((
                "node.exe -e console.log".into(),
                0,
            ))]),
        };
        assert!(!is_process_alive_with(&probe, 1, 0));
    }

    #[test]
    fn dead_when_creation_more_than_60s_off_started_at() {
        // PID reuse: same pid, but process started 5 minutes after the
        // session record claims.
        let started = 1778_852_400_000;
        let probe = FakeProbe {
            responses: Mutex::new(vec![Some((
                "node.exe ...claude-code/cli.js".into(),
                started + 300_000,
            ))]),
        };
        assert!(!is_process_alive_with(&probe, 1234, started));
    }

    #[test]
    fn parse_wmi_date_round_trips() {
        // 2026-05-04 09:30:00 UTC.
        let ms = parse_wmi_creation_date("20260504093000.000000+000").unwrap();
        // Verified vs Python:
        //   datetime(2026,5,4,9,30,0,tzinfo=timezone.utc).timestamp()*1000
        //   = 1_777_887_000_000
        assert_eq!(ms, 1_777_887_000_000);
    }
}
