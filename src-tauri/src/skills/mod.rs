//! Custom skills discovery — see plan T3.6, spec §7.
//!
//! Custom skills live at `~/.claude/skills/<dir>/SKILL.md`. Each directory
//! containing a `SKILL.md` file becomes one entry; the YAML frontmatter
//! (`name`, `description`) is parsed by the same tiny reader the plugin
//! scanner uses (see `plugins::commands::read_frontmatter`). Directories
//! without `SKILL.md` are skipped. Malformed frontmatter (no opening `---`)
//! → directory is skipped (not surfaced as an error: spec §7 has no error
//! state for skills).

pub mod commands;
