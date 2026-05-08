// Custom skills loader — see plan T3.6, spec §7.
//
// Thin wrapper around the Rust IPC `scan_custom_skills` command. The Rust
// side enumerates `~/.claude/skills/<dir>` directories that contain a
// parseable `SKILL.md` and returns one entry each. Plugin-bundled skills
// (under `~/.claude/plugins/...`) are NOT included by construction.

import { invoke } from "@tauri-apps/api/core";

import type { CustomSkill } from "./skill-types";

/** Wire shape returned by the Rust `scan_custom_skills` IPC. Matches
 *  `CustomSkillEntry` (serde rename_all = camelCase). */
export interface CustomSkillWire {
  name: string;
  description: string;
  dirPath: string;
  skillMdPath: string;
}

/** Scan `~/.claude/skills/` and return every custom skill, sorted by name. */
export async function loadCustomSkills(): Promise<CustomSkill[]> {
  const wire = await invoke<CustomSkillWire[]>("scan_custom_skills");
  return wire.map((w) => ({
    name: w.name.trim(),
    description: w.description.trim(),
    dirPath: w.dirPath,
    skillMdPath: w.skillMdPath,
  }));
}
