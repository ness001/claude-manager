//! MCP server config reading and writing.
//!
//! Spec §8.1 — config locations:
//!   user      → `~/.claude.json` $.mcpServers.<name>
//!   local     → `~/.claude.json` $.projects["<cwd>"].mcpServers.<name>
//!   project   → `<project_root>/.mcp.json` (top-level or wrapped)
//!
//! Rust just reads/writes raw JSON; the frontend owns parsing and merge
//! semantics. Writes are atomic via write-to-temp-then-rename so a crash
//! mid-write can never corrupt `~/.claude.json`.
//!
//! `check_mcp_status` is gated behind a trait so unit tests never spawn
//! the real `claude mcp list` subprocess (spec §8.3 warning — the CLI
//! actually starts servers for health checks).

pub mod commands;
