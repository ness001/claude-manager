// Custom Skill data model — see spec §7.
//
// Custom skills live at `~/.claude/skills/<dir>/SKILL.md` as directories,
// each containing a `SKILL.md` with YAML frontmatter (`name`, `description`).
// They are auto-loaded by Claude Code into every session — distinct from
// plugin-bundled skills, which live under `<plugin>/skills/`.

/** One custom skill discovered under `~/.claude/skills/`. */
export interface CustomSkill {
  /** From SKILL.md frontmatter `name`. Falls back to directory name. */
  name: string;
  /** From SKILL.md frontmatter `description`. May be empty. */
  description: string;
  /** Absolute path of the skill directory (`~/.claude/skills/<dir>`). */
  dirPath: string;
  /** Absolute path of the `SKILL.md` file inside `dirPath`. */
  skillMdPath: string;
}
