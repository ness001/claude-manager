import type { ComponentType } from "react";
import {
  useNavigationStore,
  type Section,
} from "../stores/navigation-store";
import { DashboardSection } from "../sections/DashboardSection";
import { SessionsSection } from "../sections/SessionsSection";
import { PluginsSection } from "../sections/PluginsSection";
import { SkillsSection } from "../sections/SkillsSection";
import { McpSection } from "../sections/McpSection";
import { SettingsSection } from "../sections/SettingsSection";

const SECTION_MAP: Record<Section, ComponentType> = {
  dashboard: DashboardSection,
  sessions: SessionsSection,
  plugins: PluginsSection,
  skills: SkillsSection,
  mcp: McpSection,
  settings: SettingsSection,
};

export function ContentArea() {
  const activeSection = useNavigationStore((s) => s.activeSection);
  const Component = SECTION_MAP[activeSection];
  return (
    <main className="flex-1 overflow-auto bg-bg-primary">
      <Component />
    </main>
  );
}
