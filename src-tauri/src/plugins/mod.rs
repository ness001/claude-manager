//! Plugin discovery and metadata reading.
//!
//! Two responsibilities, exposed as IPC commands (see `commands.rs`):
//!   1. Pass through the raw config files the frontend needs to merge
//!      (`installed_plugins.json` + `settings.json` enabled map).
//!   2. Walk a single plugin's install directory and return a structured
//!      summary (skill/agent/hook frontmatter + manifest).
//!
//! The frontend owns the merge + state derivation; Rust just reads bytes
//! and parses simple structures.

pub mod commands;
pub mod log;
