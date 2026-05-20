import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  filterSessions,
  useSessionStore,
} from "../../src/stores/session-store";
import type { SessionMeta } from "../../src/lib/session-types";

// Mock the session-loader so the store under test doesn't reach for Tauri IPC
// or SQLite. We're testing the store, not the loader (loader is covered by
// T2.5 tests).
const loadAllSessionsMock = vi.fn();
vi.mock("../../src/lib/session-loader", () => ({
  loadAllSessions: (...args: unknown[]) => loadAllSessionsMock(...args),
}));

/** Build a minimal SessionMeta — only fields the store cares about are set. */
function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: overrides.sessionId ?? "id-" + Math.random().toString(36).slice(2),
    cwd: "/repos/foo",
    firstPrompt: "do the thing",
    messageCount: 5,
    startedAt: 0,
    durationMs: 0,
    entrypoint: "interactive",
    kind: "interactive",
    isSidechain: false,
    toolsUsed: [],
    isAlive: false,
    tags: [],
    isPinned: false,
    sortOrder: 0,
    state: "ended",
    ...overrides,
  };
}

describe("session-store", () => {
  beforeEach(() => {
    // Reset the store to its initial shape so tests don't bleed.
    useSessionStore.setState({
      sessions: [],
      selectedId: null,
      viewMode: "my",
      searchQuery: "",
      isLoading: false,
    });
    loadAllSessionsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("case 1: initial state matches spec", () => {
    const s = useSessionStore.getState();
    expect(s.sessions).toEqual([]);
    expect(s.selectedId).toBeNull();
    expect(s.viewMode).toBe("my");
    expect(s.searchQuery).toBe("");
    expect(s.isLoading).toBe(false);
  });

  it("case 2: setViewMode updates mode and does NOT reset selection", () => {
    useSessionStore.setState({ selectedId: "abc" });
    useSessionStore.getState().setViewMode("project");
    const s = useSessionStore.getState();
    expect(s.viewMode).toBe("project");
    expect(s.selectedId).toBe("abc");
  });

  it("case 3: setSearchQuery filters case-insensitively across name, firstPrompt, tags, cwd (spec §17.7)", () => {
    const sessions: SessionMeta[] = [
      makeSession({
        sessionId: "a",
        displayName: "Refactor Auth",
        firstPrompt: "fix login",
        tags: ["urgent"],
        cwd: "/repos/api",
      }),
      makeSession({
        sessionId: "b",
        firstPrompt: "WRITE DOCS",
        tags: [],
        cwd: "/repos/docs",
      }),
      makeSession({
        sessionId: "c",
        firstPrompt: "explore data",
        tags: ["urgent", "spike"],
        cwd: "/repos/data",
      }),
    ];

    // displayName match (case-insensitive)
    expect(filterSessions(sessions, { searchQuery: "auth", viewMode: "my" }).map((s) => s.sessionId)).toEqual(["a"]);
    // firstPrompt match (case-insensitive — query is lowercase, content uppercase)
    expect(filterSessions(sessions, { searchQuery: "docs", viewMode: "my" }).map((s) => s.sessionId)).toEqual(["b"]);
    // tags match
    expect(
      filterSessions(sessions, { searchQuery: "urgent", viewMode: "my" }).map((s) => s.sessionId).sort(),
    ).toEqual(["a", "c"]);
    // cwd match
    expect(filterSessions(sessions, { searchQuery: "/repos/data", viewMode: "my" }).map((s) => s.sessionId)).toEqual([
      "c",
    ]);
  });

  it("case 4: selectSession updates selectedId", () => {
    useSessionStore.getState().selectSession("xyz");
    expect(useSessionStore.getState().selectedId).toBe("xyz");
    useSessionStore.getState().selectSession(null);
    expect(useSessionStore.getState().selectedId).toBeNull();
  });

  it("case 5: filteredSessions excludes isSidechain === true sessions", () => {
    const sessions: SessionMeta[] = [
      makeSession({ sessionId: "main", isSidechain: false }),
      makeSession({ sessionId: "sub", isSidechain: true }),
    ];
    const out = filterSessions(sessions, { searchQuery: "", viewMode: "my" });
    expect(out.map((s) => s.sessionId)).toEqual(["main"]);
  });

  it("case 6: filteredSessions excludes archived sessions in default views", () => {
    const sessions: SessionMeta[] = [
      makeSession({ sessionId: "live", state: "ended" }),
      makeSession({ sessionId: "old", state: "archived", archivedAt: "12345" }),
    ];

    // Default view modes (my / project / timeline) should hide archived.
    for (const viewMode of ["my", "project", "timeline"] as const) {
      const out = filterSessions(sessions, { searchQuery: "", viewMode });
      expect(out.map((s) => s.sessionId)).toEqual(["live"]);
    }
  });

  it("case 7: loadSessions calls session-loader and populates store", async () => {
    const seeded: SessionMeta[] = [
      makeSession({ sessionId: "one" }),
      makeSession({ sessionId: "two" }),
    ];
    loadAllSessionsMock.mockResolvedValueOnce(seeded);

    expect(useSessionStore.getState().isLoading).toBe(false);
    const promise = useSessionStore.getState().loadSessions();
    // While in flight, isLoading should be true.
    expect(useSessionStore.getState().isLoading).toBe(true);
    await promise;

    const after = useSessionStore.getState();
    expect(after.isLoading).toBe(false);
    expect(after.sessions).toBe(seeded);
    expect(loadAllSessionsMock).toHaveBeenCalledTimes(1);
  });

  it("loadSessions clears isLoading even when loader rejects", async () => {
    loadAllSessionsMock.mockRejectedValueOnce(new Error("boom"));
    await expect(useSessionStore.getState().loadSessions()).rejects.toThrow("boom");
    expect(useSessionStore.getState().isLoading).toBe(false);
  });
});
