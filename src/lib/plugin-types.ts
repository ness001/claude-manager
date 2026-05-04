// Plugin data model — see spec §6.1 (data model), §6.3 (version format),
// §6.4 (states), §6.5 (metadata fallback).
//
// Plugins are installed via the CLI and registered in
// `~/.claude/plugins/installed_plugins.json`. Per-plugin enable state lives in
// `~/.claude/settings.json` → `enabledPlugins` (NOT in the registry).

/** Lifecycle of a plugin — see spec §6.4. */
export type PluginState =
  | "active"
  | "disabled"
  | "broken"
  | "orphaned"
  | "update-available";

/**
 * Skill bundled inside a plugin under `<plugin>/skills/<name>/SKILL.md`.
 * `name` and `description` come from the YAML frontmatter at the head of
 * the .md file (see spec §6.1).
 */
export interface SkillInfo {
  name: string;
  description: string;
}

/**
 * Agent bundled inside a plugin under `<plugin>/agents/<name>.md`.
 * Frontmatter fields per spec §6.1.
 */
export interface AgentInfo {
  name: string;
  description: string;
  /** Allowed tools, e.g. ["Read", "Bash"]. */
  tools?: string[];
  /** Model identifier the agent prefers, e.g. "claude-sonnet-4-6". */
  model?: string;
  /** UI hint color from frontmatter. */
  color?: string;
}

/**
 * Hook entry parsed from `<plugin>/hooks/hooks.json` — see spec §6.1.
 * `event` is the lifecycle event name (e.g. "SessionStart", "PreToolUse");
 * `command` is the shell command the harness runs.
 */
export interface HookInfo {
  event: string;
  command: string;
}

/**
 * Plugin registry entry assembled from
 *   1. `installed_plugins.json` (one entry per installation array element)
 *   2. `settings.json.enabledPlugins`
 *   3. filesystem checks at `installPath`
 *
 * See spec §6.1 / §6.4 for field origins and state derivation.
 */
export interface PluginMeta {
  /** Plugin name as registered in `installed_plugins.json`. */
  name: string;
  /** Marketplace source, e.g. "claude-plugins-official". */
  marketplace: string;
  /**
   * Version string. Per spec §6.3 this can be either semver
   * ("5.0.7") or a 12-char git SHA ("a5bcdd7e58cd").
   */
  version: string;
  /** Full 40-char git SHA used for update comparison (spec §6.3). */
  gitCommitSha: string;
  description: string;
  /** Absolute install path on disk. */
  installPath: string;
  /** Derived per spec §6.4. */
  state: PluginState;
  skillCount: number;
  agentCount: number;
  hookCount: number;
  /** Whether `<installPath>/CLAUDE.md` exists. */
  hasClaudeMd: boolean;
}

/**
 * Plugin meta enriched with the contents of its skills/agents/hooks
 * directories — populated only for the currently-selected plugin (see
 * spec §6.6 detail view).
 */
export interface PluginDetail extends PluginMeta {
  skills: SkillInfo[];
  agents: AgentInfo[];
  hooks: HookInfo[];
}
