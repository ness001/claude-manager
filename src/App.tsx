import { useEffect } from "react";
import { SidebarRail } from "./components/SidebarRail";
import { ContentArea } from "./components/ContentArea";
import { useThemeStore } from "./stores/theme-store";
import {
  useNavigationStore,
  type Section,
} from "./stores/navigation-store";

// Ctrl+<key> -> Section. Ctrl+1..6 map to the six top-level sections;
// Ctrl+, is a conventional shortcut for Settings.
const SHORTCUTS: Record<string, Section> = {
  "1": "dashboard",
  "2": "sessions",
  "3": "plugins",
  "4": "skills",
  "5": "mcp",
  "6": "settings",
  ",": "settings",
};

function App() {
  const resolved = useThemeStore((s) => s.resolved);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const navigateTo = useNavigationStore((s) => s.navigateTo);

  // TODO(T1.7): On mount, load saved theme mode from SQLite app_settings table
  //             and call setMode(saved). Until then, cold start always uses default.

  // Apply / remove the `dark` class on <html> whenever the resolved theme changes.
  // Tailwind v4's `.dark` selector keys off this class to swap CSS variables.
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolved]);

  // When mode is "system", listen for OS-level prefers-color-scheme changes
  // and re-resolve via the store. Re-runs on `mode` change so switching to
  // "system" registers the listener; cleanup prevents duplicate listeners.
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setMode("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode, setMode]);

  // Global keyboard shortcuts: Ctrl+1..6 navigate to a section, Ctrl+, opens
  // Settings. Ignore when modifiers other than Ctrl are pressed, and skip
  // when focus is inside a text input so typing isn't hijacked.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const section = SHORTCUTS[e.key];
      if (section) {
        e.preventDefault();
        navigateTo(section);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigateTo]);

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary">
      <SidebarRail />
      <ContentArea />
    </div>
  );
}

export default App;
