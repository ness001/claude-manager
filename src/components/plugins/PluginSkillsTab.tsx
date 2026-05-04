// Skills tab — see spec §6.6. List of skills with name + description.

import type { SkillInfo } from "../../lib/plugin-types";

interface PluginSkillsTabProps {
  skills: SkillInfo[];
}

export function PluginSkillsTab({ skills }: PluginSkillsTabProps) {
  if (skills.length === 0) {
    return (
      <div data-testid="skills-empty" className="text-sm text-text-muted">
        No skills bundled.
      </div>
    );
  }
  return (
    <ul data-testid="skills-list" className="flex flex-col gap-2">
      {skills.map((s) => (
        <li
          key={s.name}
          data-testid="skill-row"
          className="flex flex-col gap-0.5 rounded-md border border-border p-2"
        >
          <span className="text-sm font-medium text-text-primary">
            {s.name}
          </span>
          <span className="text-xs text-text-secondary">{s.description}</span>
        </li>
      ))}
    </ul>
  );
}
