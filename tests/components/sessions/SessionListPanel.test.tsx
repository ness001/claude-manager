import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SessionListPanel } from "../../../src/components/sessions/SessionListPanel";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta } from "../../../src/lib/session-types";

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: overrides.sessionId ?? "id-" + Math.random().toString(36).slice(2),
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

describe("SessionListPanel", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      selectedId: null,
      viewMode: "my",
      searchQuery: "",
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<SessionListPanel />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("My View: pinned sessions render under a 'Pinned' header", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "p1", isPinned: true, displayName: "PinOne" }),
        makeSession({ sessionId: "n1", isPinned: false, displayName: "NormOne" }),
      ],
      viewMode: "my",
    });
    render(<SessionListPanel />);
    const headers = screen.getAllByTestId("group-header").map((h) => h.textContent ?? "");
    expect(headers.some((t) => t.startsWith("Pinned"))).toBe(true);
    expect(headers.some((t) => t.startsWith("All Sessions"))).toBe(true);
  });

  it("Project view: groups by cwd path", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "a", cwd: "/repos/api" }),
        makeSession({ sessionId: "b", cwd: "/repos/api" }),
        makeSession({ sessionId: "c", cwd: "/repos/web" }),
      ],
      viewMode: "project",
    });
    render(<SessionListPanel />);
    const headerLabels = screen
      .getAllByTestId("group-header")
      .map((h) => h.textContent ?? "");
    expect(headerLabels.some((t) => t.startsWith("/repos/api"))).toBe(true);
    expect(headerLabels.some((t) => t.startsWith("/repos/web"))).toBe(true);
  });

  it("Timeline view: emits Today / Yesterday / This Week buckets", () => {
    const now = Date.now();
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "today", startedAt: new Date(now - 60_000).toISOString() }),
        makeSession({ sessionId: "yest", startedAt: new Date(now - 26 * 3600_000).toISOString() }),
        makeSession({ sessionId: "wk", startedAt: new Date(now - 4 * 24 * 3600_000).toISOString() }),
      ],
      viewMode: "timeline",
    });
    render(<SessionListPanel />);
    const labels = screen.getAllByTestId("group-header").map((h) => h.textContent ?? "");
    expect(labels.some((t) => t.startsWith("Today"))).toBe(true);
    expect(labels.some((t) => t.startsWith("Yesterday"))).toBe(true);
    expect(labels.some((t) => t.startsWith("This Week"))).toBe(true);
  });

  it("virtual scroller activates when filtered.length > 50 (spec §17.8)", () => {
    const many: SessionMeta[] = Array.from({ length: 60 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: many, viewMode: "my" });
    render(<SessionListPanel />);
    expect(screen.getByTestId("virtual-scroller")).toBeInTheDocument();
  });

  it("under threshold renders without the virtual scroller", () => {
    const few: SessionMeta[] = Array.from({ length: 10 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: few, viewMode: "my" });
    render(<SessionListPanel />);
    expect(screen.queryByTestId("virtual-scroller")).not.toBeInTheDocument();
  });

  it("empty state when no sessions are present", () => {
    render(<SessionListPanel />);
    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  it("New Session button is reachable", () => {
    render(<SessionListPanel />);
    expect(screen.getByTestId("new-session-btn")).toBeInTheDocument();
  });

  // Perf gate per spec §17.8 — render 100 sessions in well under 100ms.
  it("renders 100 sessions within the spec perf budget (<100ms)", () => {
    const many: SessionMeta[] = Array.from({ length: 100 }, (_, i) =>
      makeSession({ sessionId: `s${i}`, displayName: `Session ${i}` }),
    );
    useSessionStore.setState({ sessions: many, viewMode: "my" });
    const t0 = performance.now();
    render(<SessionListPanel />);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });
});
