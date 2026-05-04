import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SessionDetailPanel } from "../../../src/components/sessions/SessionDetailPanel";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta } from "../../../src/lib/session-types";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => true),
}));

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

describe("SessionDetailPanel", () => {
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
      render(<SessionDetailPanel />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("shows the empty state when no session is selected", () => {
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("session-detail-empty")).toHaveTextContent(
      "Select a session to view its conversation",
    );
    expect(screen.queryByTestId("session-info-bar")).not.toBeInTheDocument();
  });

  it("renders the SessionInfoBar when a session is selected", () => {
    const s = makeSession({ sessionId: "selected", state: "ended" });
    useSessionStore.setState({ sessions: [s], selectedId: "selected" });
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("session-info-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("session-detail-empty")).not.toBeInTheDocument();
  });

  it("falls back to empty state when selectedId points at an unknown session", () => {
    useSessionStore.setState({ sessions: [], selectedId: "ghost" });
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("session-detail-empty")).toBeInTheDocument();
  });
});
