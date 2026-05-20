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

  it("falls back to empty state when selectedId points at an unknown session", () => {
    useSessionStore.setState({ sessions: [], selectedId: "ghost" });
    render(<SessionDetailPanel />);
    expect(screen.getByTestId("session-detail-empty")).toBeInTheDocument();
  });

  // a11y: the empty-state copy ("Select a session to view its conversation")
  // and the no-jsonl placeholder ("No conversation file available…") both
  // appear/disappear based on user actions (selecting/deselecting a session,
  // or selecting one with no JSONL). Without role="status" + aria-live="polite",
  // screen-reader users get NO feedback that the right pane changed — they'd
  // only discover the new copy by tab-hunting. Mirrors PRs #154 (PluginListView),
  // #155 (McpPanel), #207 (SkillsListView).
  it("empty state is a polite live region (a11y: pane-change announce)", () => {
    render(<SessionDetailPanel />);
    const empty = screen.getByTestId("session-detail-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  it("no-jsonl placeholder is a polite live region (a11y: pane-change announce)", () => {
    const s = makeSession({ sessionId: "selected", state: "ended" });
    // jsonlPath omitted → triggers the placeholder branch.
    useSessionStore.setState({ sessions: [s], selectedId: "selected" });
    render(<SessionDetailPanel />);
    const ph = screen.getByTestId("conversation-viewer-placeholder");
    expect(ph.getAttribute("role")).toBe("status");
    expect(ph.getAttribute("aria-live")).toBe("polite");
  });

  // WCAG 2.4.1 (Bypass Blocks) + 1.3.1 (Info and Relationships):
  // SessionListPanel exposes <aside aria-label="Session list">. Its sibling
  // detail pane was just a <div> — no landmark, no name — so SR users
  // could jump to the list region but not the detail region. Promote
  // wrapper to <section aria-label="Session detail">.
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
