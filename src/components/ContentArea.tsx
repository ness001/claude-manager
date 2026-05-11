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
      // WCAG 2.1.1 (Keyboard): the <main> landmark is the only scroll
      // container for sections whose content overflows the viewport (e.g.
      // long plugin / skill grids, the conversation viewer's outer wrap).
      // Mouse / trackpad users could scroll it via the wheel; keyboard-only
      // users could not — <main> is not focusable by default. Without
      // tabIndex={0} the clipped content below the fold was unreachable
      // without a mouse. Mirrors the same fix on the conversation-scroller
      // (already lives) and the AssistantMessage <pre> blocks (PR #195).
      tabIndex={0}
      className="flex-1 overflow-auto bg-bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <Component />
    </main>
  );
}
