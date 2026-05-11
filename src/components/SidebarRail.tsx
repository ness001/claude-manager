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
  /** Optional secondary shortcut surfaced via aria-keyshortcuts only. */
  extraKeyshortcut?: string;
}

const ITEMS: RailItemConfig[] = [
  { section: "dashboard", label: "Dashboard", Icon: Home, shortcut: "Ctrl+1" },
  { section: "sessions", label: "Sessions", Icon: MessageSquare, shortcut: "Ctrl+2" },
  { section: "plugins", label: "Plugins", Icon: Puzzle, shortcut: "Ctrl+3" },
  { section: "skills", label: "Skills", Icon: BookOpen, shortcut: "Ctrl+4" },
  { section: "mcp", label: "MCP Servers", Icon: Plug, shortcut: "Ctrl+5" },
  // Settings has a second conventional shortcut wired in App.tsx (Ctrl+,).
  // Surface it via aria-keyshortcuts so SR users can discover the
  // alternative without polluting the visible tooltip.
  {
    section: "settings",
    label: "Settings",
    Icon: SettingsIcon,
    shortcut: "Ctrl+6",
    extraKeyshortcut: "Ctrl+,",
  },
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
 *
 * Tab model: only the active rail item is in the Tab sequence
 * (`tabIndex=0`); the rest are `tabIndex=-1`. This is the standard WAI-ARIA
 * roving-tabindex pattern — without it, Tab walks all 6 items one at a time
 * and the arrow-key roving above is incomplete.
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
      {/* WAI-ARIA APG navigation pattern + WCAG 1.3.1 (Info and Relationships):
          a <nav> rail of N items should expose its links as a list so the SR
          rotor surfaces "navigation, Primary, list, 6 items" — without the
          <ul>/<li> wrapper, the 6 buttons are flat siblings inside <nav> and
          the count is lost. Mirrors PRs #235/#236/#237/#238/#239/#240
          (collection containers). The flex column layout is element-agnostic. */}
      <ul className="flex flex-col">
        {ITEMS.map(({ section, label, Icon, shortcut, extraKeyshortcut }, idx) => (
          <li key={section}>
            <SidebarRailItem
              label={label}
              Icon={Icon}
              shortcut={shortcut}
              extraKeyshortcut={extraKeyshortcut}
              active={activeSection === section}
              tabIndex={activeSection === section ? 0 : -1}
              onClick={() => navigateTo(section)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              buttonRef={(el) => {
                itemRefs.current[idx] = el;
              }}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
