import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SessionDetailPanel } from "../../../src/components/sessions/SessionDetailPanel";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta } from "../../../src/lib/session-types";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => true),
}));

vi.mock("@xterm/xterm", () => {
  const Terminal = vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    onData: vi.fn(),
    dispose: vi.fn(),
    rows: 24,
    cols: 80,
  }));
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  const FitAddon = vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  }));
  return { FitAddon };
});

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    sessionId: overrides.sessionId ?? "id-x",
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

  it("renders the TerminalPanel when a session is selected", () => {
    const s = makeSession({ sessionId: "selected", state: "ended" });
    useSessionStore.setState({ sessions: [s], selectedId: "selected" });
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
  });

  it("falls back to empty state when selectedId points at an unknown session", () => {
    useSessionStore.setState({ sessions: [], selectedId: "ghost" });
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("session-detail-empty")).toBeInTheDocument();
  });

  it("empty state is a polite live region (a11y: pane-change announce)", () => {
    render(<SessionDetailPanel />);
    const empty = screen.getByTestId("session-detail-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  it("detail pane is a named region landmark (<section aria-label='Session detail'>)", () => {
    const s = makeSession({ sessionId: "selected", state: "ended" });
    useSessionStore.setState({ sessions: [s], selectedId: "selected" });
    render(<SessionDetailPanel />);
    const panel = screen.getByTestId("session-detail-panel");
    expect(panel.tagName).toBe("SECTION");
    expect(panel.getAttribute("aria-label")).toBe("Session detail");
    const byRole = screen.getByRole("region", { name: "Session detail" });
    expect(byRole).toBe(panel);
  });
});
