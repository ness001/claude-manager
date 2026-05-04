// Plugin list state — see spec §6.4 (states), §17.7 (search behavior).
//
// Pure store: holds the loaded `PluginMeta[]`, the current selection (full
// `PluginDetail`), the search query, isLoading, and the most recent error.
// `filterPlugins` lives outside the store so callers can `useMemo` it
// without triggering Zustand re-renders on every keystroke (same pattern
// as `filterSessions`).
//
// `selectPlugin(plugin)` calls `loadPluginDetail` to hydrate the detail
// view. `togglePlugin(plugin)` flips the enabled state and persists to
// `settings.json` via the Rust `write_plugin_enabled` IPC.

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { loadPluginDetail, loadPlugins } from "../lib/plugin-loader";
import type { PluginDetail, PluginMeta } from "../lib/plugin-types";

/** Compose the registry key the way `installed_plugins.json` keys it. */
export function pluginKey(plugin: Pick<PluginMeta, "name" | "marketplace">): string {
  return `${plugin.name}@${plugin.marketplace}`;
}

interface PluginStoreState {
  plugins: PluginMeta[];
  selectedPlugin: PluginDetail | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  loadPlugins: () => Promise<void>;
  selectPlugin: (plugin: PluginMeta | null) => Promise<void>;
  setSearchQuery: (query: string) => void;
  togglePlugin: (plugin: PluginMeta) => Promise<void>;
}

export const usePluginStore = create<PluginStoreState>((set, get) => ({
  plugins: [],
  selectedPlugin: null,
  searchQuery: "",
  isLoading: false,
  error: null,

  loadPlugins: async () => {
    set({ isLoading: true, error: null });
    try {
      const plugins = await loadPlugins();
      set({ plugins, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) });
    }
  },

  selectPlugin: async (plugin) => {
    if (plugin == null) {
      set({ selectedPlugin: null });
      return;
    }
    try {
      const detail = await loadPluginDetail(plugin);
      set({ selectedPlugin: detail, error: null });
    } catch (err) {
      set({ error: errorMessage(err) });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  togglePlugin: async (plugin) => {
    const key = pluginKey(plugin);
    const wasEnabled = plugin.state === "active";
    const nextEnabled = !wasEnabled;
    const nextState = nextEnabled ? "active" : "disabled";

    // Optimistic update — flipped back on error so no partial mutation
    // sticks (plan case 5).
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.installPath === plugin.installPath && p.name === plugin.name
          ? { ...p, state: nextState }
          : p,
      ),
    }));

    try {
      await invoke("write_plugin_enabled", { key, enabled: nextEnabled });
    } catch (err) {
      // Roll back the optimistic mutation.
      set((state) => ({
        plugins: state.plugins.map((p) =>
          p.installPath === plugin.installPath && p.name === plugin.name
            ? { ...p, state: plugin.state }
            : p,
        ),
        error: errorMessage(err),
      }));
      throw err;
    }

    // Re-derive other entries that share the same key — flipping enable
    // state affects every installation row of the same plugin.
    set((state) => ({
      plugins: state.plugins.map((p) =>
        pluginKey(p) === key && p.state !== "broken" && p.state !== "orphaned"
          ? { ...p, state: nextState }
          : p,
      ),
    }));
    void get();
  },
}));

/**
 * Free filter — search per spec §17.7 (Plugins: name, description,
 * marketplace, case-insensitive substring).
 */
export function filterPlugins(
  plugins: PluginMeta[],
  searchQuery: string,
): PluginMeta[] {
  const q = searchQuery.trim().toLowerCase();
  if (q === "") return plugins;
  return plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.marketplace.toLowerCase().includes(q),
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
