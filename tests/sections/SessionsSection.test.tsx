// Tests for SessionsSection (T2.13).
//
// Mocks at the module boundary:
//   - `../../src/lib/session-loader` → loadAllSessions (the loader is called
//     by sessionStore.loadSessions on mount)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";

const loadAllSessionsMock = vi.fn();

vi.mock("../../src/lib/session-loader", () => ({
  loadAllSessions: (...args: unknown[]) => loadAllSessionsMock(...args),
  // Re-export the symbol the orchestrator file would expose; the test seam
  // for path caches is unused here but keeps the module shape intact.
  _resetSessionLoaderCacheForTests: () => {},
}));

// SessionInfoBar reads `exists()` to check the CWD. Stub so the click test
// doesn't fire an unmocked Tauri IPC under jsdom.
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => true),
}));

import { SessionsSection } from "../../src/sections/SessionsSection";
import { useSessionStore } from "../../src/stores/session-store";
import type { SessionMeta } from "../../src/lib/session-types";

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: overrides.sessionId ?? "id-x",
    cwd: "/repos/foo",
    firstPrompt: "do the thing",
    messageCount: 5,
    startedAt: "",
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

beforeEach(() => {
  useSessionStore.setState({
    sessions: [],
    selectedId: null,
    viewMode: "my",
    searchQuery: "",
    isLoading: false,
  });
  loadAllSessionsMock.mockReset();
  loadAllSessionsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("SessionsSection", () => {
  it("mounts without console errors", async () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<SessionsSection />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("invokes loadSessions exactly once on mount", async () => {
    const spy = vi.spyOn(useSessionStore.getState(), "loadSessions");
    render(<SessionsSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders the split-pane layout: 260px list panel + flex detail panel", async () => {
    render(<SessionsSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("session-list-panel")).toBeInTheDocument();
    expect(screen.getByTestId("session-detail-empty")).toBeInTheDocument();
    const aside = screen.getByTestId("session-list-panel");
    expect(aside.className).toMatch(/w-\[260px\]/);
  });

  it("renders skeleton cards while sessions are loading (spec §17.6)", async () => {
    useSessionStore.setState({ isLoading: true, sessions: [] });
    render(<SessionsSection />);
    expect(screen.getByTestId("session-list-skeleton")).toBeInTheDocument();
    expect(screen.getAllByTestId("session-card-skeleton")).toHaveLength(4);
    // Real list panel is not rendered in this branch.
    expect(screen.queryByTestId("session-list-panel")).not.toBeInTheDocument();
    // Drain the loadSessions() promise to silence act() warnings.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it("empty state: 'No sessions found' + New Session CTA when sessions=[]", async () => {
    render(<SessionsSection />);
    // Allow loadSessions() promise + state updates to flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("No sessions found")).toBeInTheDocument();
    expect(screen.getByTestId("new-session-btn")).toBeInTheDocument();
  });

  it("clicking a session updates SessionDetailPanel to that session", async () => {
    const sess = makeSession({
      sessionId: "abc",
      displayName: "Pick me",
      state: "ended",
    });
    // Make loadAllSessions resolve with the seeded session so the loader
    // populates the store and exits the skeleton branch.
    loadAllSessionsMock.mockResolvedValueOnce([sess]);
    render(<SessionsSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Initially nothing is selected → empty state on the right.
    expect(screen.getByTestId("session-detail-empty")).toBeInTheDocument();
    // Click the card.
    fireEvent.click(screen.getByTestId("session-card"));
    // After click, info bar replaces the empty state.
    expect(screen.queryByTestId("session-detail-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-info-bar")).toBeInTheDocument();
  });
});
