//! Session discovery, JSONL metadata parsing, and PID liveness detection.
//!
//! Frontend orchestrator (T2.5) calls into here through four IPC commands:
//!   - `discover_sessions`     — batch scan of `~/.claude/projects/**/*.jsonl`
//!   - `get_session_metadata`  — incremental re-parse of a single file
//!   - `read_jsonl_file`       — return raw lines for the conversation viewer
//!   - `read_pid_files`        — list PID files in `~/.claude/sessions/`

pub mod commands;
pub mod discovery;
pub mod parser;
pub mod pid;
