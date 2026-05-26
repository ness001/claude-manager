// Session list state — see spec §5.3 (state filtering), §5.4 (view modes),
// §17.7 (search behavior).
//
// Pure store: holds the loaded `SessionMeta[]`, the current selection, the
// active view mode, the search query, and an isLoading flag. Actions mutate
// this state; derivation (filtering / grouping) lives outside the store as
// the standalone `filterSessions` helper so callers can `useMemo` it without
// triggering Zustand re-renders on every keystroke.

import { create } from "zustand";

import { invoke } from "@tauri-apps/api/core";
import { loadAllSessions } from "../lib/session-loader";
import { dbExecute } from "../lib/db";
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
  /**
   * Update a session's user-managed `displayName` in-memory. SQLite
   * persistence is wired up in a later phase; this keeps the editable name
   * field on `SessionInfoBar` (T2.10) reactive without round-tripping yet.
   */
  setSessionDisplayName: (id: string, name: string) => void;
  archiveSession: (id: string) => Promise<void>;
  unarchiveSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  stopSession: (pid: number) => Promise<void>;
  launchSession: (args: string[], cwd?: string) => Promise<void>;
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
  setSessionDisplayName: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === id ? { ...s, displayName: name } : s,
      ),
    })),
  archiveSession: async (id) => {
    await dbExecute(
      "UPDATE sessions SET archived_at = ? WHERE session_id = ?",
      [Date.now(), id],
    );
    const sessions = await loadAllSessions();
    set({ sessions, selectedId: null });
  },
  unarchiveSession: async (id) => {
    await dbExecute(
      "UPDATE sessions SET archived_at = NULL WHERE session_id = ?",
      [id],
    );
    const sessions = await loadAllSessions();
    set({ sessions });
  },
  deleteSession: async (id) => {
    await dbExecute("DELETE FROM sessions WHERE session_id = ?", [id]);
    const sessions = await loadAllSessions();
    set({ sessions, selectedId: null });
  },
  stopSession: async (pid) => {
    await invoke("kill_session_process", { pid });
    const sessions = await loadAllSessions();
    set({ sessions });
  },
  launchSession: async (args, cwd) => {
    await invoke("launch_claude_session", { args, cwd: cwd || null });
  },
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
