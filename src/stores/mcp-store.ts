// MCP server list state — see spec §8.3 (states), §17.7 (search behavior).
//
// Pure store: holds the loaded `McpServer[]`, search query, isLoading,
// most recent error, and the currently-editing server (drives the Add/Edit
// modal). `cwd` is the project path used for local- and project-scope
// writes — set by the caller before opening the form (T3.12 will wire
// this from the session store).
//
// `serversByScope` and `filterMcpServers` live outside the store so
// callers can `useMemo` them without triggering Zustand re-renders on
// every keystroke (same pattern as `filterPlugins`).
//
// `refreshStatus` is the only path that calls `check_mcp_status` —
// spec §8.3 warns the underlying CLI spawns servers, so the call is
// always opt-in (panel visible + user-initiated refresh).

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import {
  deleteMcpServer,
  loadMcpServers,
  mapStatusLine,
  saveMcpServer,
} from "../lib/mcp-loader";
import type { McpScope, McpServer } from "../lib/mcp-types";

interface McpStoreState {
  servers: McpServer[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  editingServer: McpServer | null;
  /** Project root used as `cwd` for local/project writes. */
  cwd: string;
  /** Project roots scanned for `<root>/.mcp.json`. */
  projectRoots: string[];

  loadServers: () => Promise<void>;
  addServer: (server: McpServer) => Promise<void>;
  updateServer: (server: McpServer) => Promise<void>;
  removeServer: (scope: McpScope, name: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  startEditing: (server: McpServer) => void;
  stopEditing: () => void;
  setCwd: (cwd: string) => void;
  setProjectRoots: (roots: string[]) => void;
}

export const useMcpStore = create<McpStoreState>((set, get) => ({
  servers: [],
  searchQuery: "",
  isLoading: false,
  error: null,
  editingServer: null,
  cwd: "",
  projectRoots: [],

  loadServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const servers = await loadMcpServers({
        projectRoots: get().projectRoots,
      });
      set({ servers, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) });
    }
  },

  addServer: async (server) => {
    // Clear any stale `error` from a prior failed action before starting a
    // new attempt. Without this, a previous `Couldn't …` banner stays
    // visible across a successful retry — the user fixes the underlying
    // problem (e.g. removes an invalid arg, restarts the `claude` daemon)
    // and the action succeeds, but the McpPanel banner still reads "Couldn't
    // refresh MCP status: …" because nothing in the success path clears it.
    // Mirrors `loadServers` (line 61) which already does this. Same defect
    // applied to updateServer / removeServer / refreshStatus below.
    set({ error: null });
    try {
      await saveMcpServer(server, { cwd: get().cwd });
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
    await get().loadServers();
  },

  updateServer: async (server) => {
    set({ error: null });
    try {
      await saveMcpServer(server, { cwd: get().cwd });
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
    await get().loadServers();
  },

  removeServer: async (scope, name) => {
    set({ error: null });
    try {
      await deleteMcpServer(scope, name, { cwd: get().cwd });
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
    await get().loadServers();
  },

  refreshStatus: async () => {
    set({ error: null });
    let raw: string;
    try {
      raw = await invoke<string>("check_mcp_status");
    } catch (err) {
      set({ error: errorMessage(err) });
      return;
    }
    const lineByName = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([\w.-]+)\s*:\s*(.*)$/);
      if (m) lineByName.set(m[1], m[2]);
    }
    set((state) => ({
      servers: state.servers.map((s) => {
        const line = lineByName.get(s.name);
        return line ? { ...s, status: mapStatusLine(line) } : s;
      }),
    }));
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  startEditing: (server) => set({ editingServer: server }),
  stopEditing: () => set({ editingServer: null }),
  setCwd: (cwd) => set({ cwd }),
  setProjectRoots: (projectRoots) => set({ projectRoots }),
}));

/** Group `servers` by scope. Result arrays preserve input order. */
export function serversByScope(
  servers: McpServer[],
): Record<McpScope, McpServer[]> {
  const out: Record<McpScope, McpServer[]> = {
    user: [],
    local: [],
    project: [],
  };
  for (const s of servers) out[s.scope].push(s);
  return out;
}

/** Free filter — search per spec §17.7 (MCP: name, command, args; plus
 *  url for sse/http per plan T3.10 case 5). Case-insensitive substring. */
export function filterMcpServers(
  servers: McpServer[],
  searchQuery: string,
): McpServer[] {
  const q = searchQuery.trim().toLowerCase();
  if (q === "") return servers;
  return servers.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true;
    if (s.command && s.command.toLowerCase().includes(q)) return true;
    if (s.args && s.args.some((a) => a.toLowerCase().includes(q))) return true;
    if (s.url && s.url.toLowerCase().includes(q)) return true;
    return false;
  });
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
