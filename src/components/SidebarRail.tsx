import {
  Home,
  MessageSquare,
  Puzzle,
  BookOpen,
  Plug,
  Settings as SettingsIcon,
} from "lucide-react";
import { useRef, type ComponentType, type KeyboardEvent } from "react";
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
 *
 * Keyboard model: ArrowDown/ArrowUp move focus to the next/previous rail
 * item (wrapping); Home/End jump to first/last. Activation still happens
 * via Enter/Space (native button behavior) — focus and selection are
 * decoupled, matching the WAI-ARIA APG keyboard guidance for vertical
 * navigation rails. Without this, keyboard users were trapped Tab-stepping
 * through all 6 items with no way to jump.
 */
export function SidebarRail() {
  const activeSection = useNavigationStore((s) => s.activeSection);
  const navigateTo = useNavigationStore((s) => s.navigateTo);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>, idx: number) {
    let next = idx;
    switch (e.key) {
      case "ArrowDown":
        next = (idx + 1) % ITEMS.length;
        break;
      case "ArrowUp":
        next = (idx - 1 + ITEMS.length) % ITEMS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = ITEMS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    itemRefs.current[next]?.focus();
  }

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-12 flex-col bg-sidebar-bg"
    >
      {ITEMS.map(({ section, label, Icon, shortcut }, idx) => (
        <SidebarRailItem
          key={section}
          label={label}
          Icon={Icon}
          shortcut={shortcut}
          active={activeSection === section}
          onClick={() => navigateTo(section)}
          onKeyDown={(e) => onKeyDown(e, idx)}
          buttonRef={(el) => {
            itemRefs.current[idx] = el;
          }}
        />
      ))}
    </nav>
  );
}
