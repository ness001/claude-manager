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
  shortcut: string;
}

const ITEMS: RailItemConfig[] = [
  { section: "dashboard", label: "Dashboard", Icon: Home, shortcut: "Ctrl+1" },
  { section: "sessions", label: "Sessions", Icon: MessageSquare, shortcut: "Ctrl+2" },
  { section: "plugins", label: "Plugins", Icon: Puzzle, shortcut: "Ctrl+3" },
  { section: "skills", label: "Skills", Icon: BookOpen, shortcut: "Ctrl+4" },
  { section: "mcp", label: "MCP Servers", Icon: Plug, shortcut: "Ctrl+5" },
  { section: "settings", label: "Settings", Icon: SettingsIcon, shortcut: "Ctrl+6" },
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
      className="flex h-full w-12 flex-col bg-sidebar-bg"
    >
      {ITEMS.map(({ section, label, Icon, shortcut }) => (
        <SidebarRailItem
          key={section}
          label={label}
          Icon={Icon}
          shortcut={shortcut}
          active={activeSection === section}
          onClick={() => navigateTo(section)}
        />
      ))}
    </nav>
  );
}
