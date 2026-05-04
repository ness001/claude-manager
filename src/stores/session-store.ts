// Session list state — see spec §5.3 (state filtering), §5.4 (view modes),
// §17.7 (search behavior).
//
// Pure store: holds the loaded `SessionMeta[]`, the current selection, the
// active view mode, the search query, and an isLoading flag. Actions mutate
// this state; derivation (filtering / grouping) lives outside the store as
// the standalone `filterSessions` helper so callers can `useMemo` it without
// triggering Zustand re-renders on every keystroke.

import { create } from "zustand";

import { loadAllSessions } from "../lib/session-loader";
import type { SessionMeta } from "../lib/session-types";

export type SessionViewMode = "my" | "project" | "timeline";

interface SessionState {
  sessions: SessionMeta[];
  selectedId: string | null;
  viewMode: SessionViewMode;
  searchQuery: string;
  isLoading: boolean;

  loadSessions: () => Promise<void>;
  selectSession: (id: string | null) => void;
  setViewMode: (mode: SessionViewMode) => void;
  setSearchQuery: (query: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  selectedId: null,
  viewMode: "my",
  searchQuery: "",
  isLoading: false,

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await loadAllSessions();
      set({ sessions, isLoading: false });
    } catch (err) {
      // Surface the error to the caller, but never leave isLoading stuck.
      set({ isLoading: false });
      throw err;
    }
  },
  selectSession: (id) => set({ selectedId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

/**
 * Derived filter — kept as a free function (not a store method that calls
 * `get()`) so React components can wrap it in `useMemo` and avoid the
 * referential-equality re-render trap (Zustand recomputes derived getters
 * on every state change).
 *
 * Rules (per spec §5.3, §17.7):
 *   - Drop `isSidechain === true` rows (sub-agent transcripts).
 *   - Drop archived rows in the default view modes (my/project/timeline);
 *     a future "archived" view will surface them explicitly.
 *   - Substring match (case-insensitive) on displayName, firstPrompt,
 *     tags, cwd.
 */
export function filterSessions(
  sessions: SessionMeta[],
  opts: { searchQuery: string; viewMode: SessionViewMode },
): SessionMeta[] {
  const q = opts.searchQuery.trim().toLowerCase();
  return sessions.filter((s) => {
    if (s.isSidechain) return false;
    if (s.state === "archived") return false;
    if (q === "") return true;
    if (s.displayName?.toLowerCase().includes(q)) return true;
    if (s.firstPrompt.toLowerCase().includes(q)) return true;
    if (s.cwd.toLowerCase().includes(q)) return true;
    if (s.tags.some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  });
}
