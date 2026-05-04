import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Resolve a ThemeMode to a concrete light/dark value.
 * For "system", consult the OS-level prefers-color-scheme media query.
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "dark";
  }
  return mode;
}

/**
 * Theme store: pure state. Persistence (T1.6/T1.7) and DOM class toggling
 * (App.tsx in T1.6) live elsewhere — this store has no side effects.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  mode: "dark",
  resolved: "dark",
  setMode: (mode) => set({ mode, resolved: resolveTheme(mode) }),
}));
