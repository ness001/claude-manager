import {
  Home,
  MessageSquare,
  Puzzle,
  BookOpen,
  Plug,
  Settings as SettingsIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  useNavigationStore,
  type Section,
} from "../stores/navigation-store";
import { SidebarRailItem } from "./SidebarRailItem";

interface RailItemConfig {
  section: Section;
  label: string;
  Icon: ComponentType<{ className?: string; size?: number }>;
}

const ITEMS: RailItemConfig[] = [
  { section: "dashboard", label: "Dashboard", Icon: Home },
  { section: "sessions", label: "Sessions", Icon: MessageSquare },
  { section: "plugins", label: "Plugins", Icon: Puzzle },
  { section: "skills", label: "Skills", Icon: BookOpen },
  { section: "mcp", label: "MCP Servers", Icon: Plug },
  { section: "settings", label: "Settings", Icon: SettingsIcon },
];

/**
 * Fixed-width (48px) vertical icon rail. Reads the active section from
 * the navigation store and dispatches navigateTo on click.
 */
export function SidebarRail() {
  const activeSection = useNavigationStore((s) => s.activeSection);
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  return (
    <nav
      aria-label="Primary"
      className="flex h-screen w-12 flex-col bg-sidebar-bg"
    >
      {ITEMS.map(({ section, label, Icon }) => (
        <SidebarRailItem
          key={section}
          label={label}
          Icon={Icon}
          active={activeSection === section}
          onClick={() => navigateTo(section)}
        />
      ))}
    </nav>
  );
}
