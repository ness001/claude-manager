import { create } from "zustand";

export type Section =
  | "dashboard"
  | "sessions"
  | "plugins"
  | "skills"
  | "mcp"
  | "settings";

interface NavigationState {
  activeSection: Section;
  navigateTo: (section: Section) => void;
}

/**
 * Navigation store: pure state. Tracks which top-level section is active.
 * No side effects — routing/persistence (if any) live elsewhere.
 */
export const useNavigationStore = create<NavigationState>((set) => ({
  activeSection: "dashboard",
  navigateTo: (section) => set({ activeSection: section }),
}));
