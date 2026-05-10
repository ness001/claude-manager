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

/**
 * Human-readable label for the <main> landmark per active section. Without
 * an accessible name, screen-reader users navigating by landmarks (NVDA "D",
 * VoiceOver rotor) hear only "main" — they can't tell which of the six
 * sections is currently mounted, especially since the sidebar nav and the
 * <main> landmark swap content independently. WCAG 2.4.1 / ARIA APG.
 */
const SECTION_LABEL: Record<Section, string> = {
  dashboard: "Dashboard",
  sessions: "Sessions",
  plugins: "Plugins",
  skills: "Skills",
  mcp: "MCP Servers",
  settings: "Settings",
};

export function ContentArea() {
  const activeSection = useNavigationStore((s) => s.activeSection);
  const Component = SECTION_MAP[activeSection];
  return (
    <main
      aria-label={SECTION_LABEL[activeSection]}
      className="flex-1 overflow-auto bg-bg-primary"
    >
      <Component />
    </main>
  );
}
