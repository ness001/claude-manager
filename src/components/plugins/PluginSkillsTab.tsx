// Skills tab — see spec §6.6. List of skills with name + description.

import type { SkillInfo } from "../../lib/plugin-types";

interface PluginSkillsTabProps {
  skills: SkillInfo[];
}

export function PluginSkillsTab({ skills }: PluginSkillsTabProps) {
  if (skills.length === 0) {
    return (
      <div
        data-testid="skills-empty"
        role="status"
        aria-live="polite"
        className="text-sm text-text-muted"
      >
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
          {/* Name row: `truncate` keeps long bundled-skill names from
              breaking the card layout (qualified or namespaced skills
              regularly run 60+ chars), and the matching `title` lets
              sighted users recover the hidden tail on hover. Mirrors
              PR #225 (PluginAgentsTab name) and the broader truncation-
              recovery family (#167/#170/#171/#175/#223/#224 + PluginCard
              + SkillCard name). */}
          <span
            data-testid="skill-name"
            className="truncate text-sm font-medium text-text-primary"
            title={s.name}
          >
            {s.name}
          </span>
          <span className="text-xs text-text-secondary">{s.description}</span>
        </li>
      ))}
    </ul>
  );
}
