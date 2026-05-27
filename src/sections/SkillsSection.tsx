import { useEffect } from "react";

import { SkillsListView } from "../components/skills/SkillsListView";
import { useSkillStore } from "../stores/skill-store";

export function SkillsSection() {
  const loadSkills = useSkillStore((s) => s.loadSkills);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  return (
    <section
      data-testid="skills-section"
      aria-label="Custom Skills"
      className="flex h-full w-full"
    >
      <SkillsListView />
    </section>
  );
}
