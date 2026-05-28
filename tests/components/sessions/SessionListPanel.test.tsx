import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { SessionListPanel } from "../../../src/components/sessions/SessionListPanel";
import { useSessionStore } from "../../../src/stores/session-store";
import type { SessionMeta } from "../../../src/lib/session-types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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

describe("SessionListPanel", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      selectedId: null,
      viewMode: "my",
      searchQuery: "",
      isLoading: false,
      groups: [],
      collapsedGroups: new Set(),
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

  it("Group view: sessions render under their group's header + Ungrouped fallback", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "g1", groupId: "team-a", displayName: "InTeamA" }),
        makeSession({ sessionId: "u1", displayName: "Unfiled" }),
      ],
      viewMode: "my",
      groups: [{ id: "team-a", name: "Team A", sortOrder: 0 }],
    });
    render(<SessionListPanel />);
    const headers = screen.getAllByTestId("group-header").map((h) => h.textContent ?? "");
    expect(headers.some((t) => t.includes("Team A"))).toBe(true);
    expect(headers.some((t) => t.includes("Ungrouped"))).toBe(true);
  });

  // WCAG 1.3.1 Info & Relationships / 2.4.6 Headings & Labels: group labels
  // ("Pinned", "All Sessions", "Today", "/repos/api", …) are content
  // structure, not just visual decoration. Rendering them as plain <div>s
  // means screen-reader users navigating by heading get nothing — the
  // grouped list reads as a flat undifferentiated stream. Render the
  // group-header element as an <h3> so SR heading-navigation surfaces them.
  it("group-header renders as an <h3> for screen-reader heading navigation", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "p1", displayName: "One" }),
        makeSession({ sessionId: "n1", displayName: "Two" }),
      ],
      viewMode: "my",
      groups: [],
    });
    render(<SessionListPanel />);
    for (const h of screen.getAllByTestId("group-header")) {
      expect(h.tagName).toBe("H3");
    }
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
    // Anchor to a fixed local-noon "now" so day-boundary math is
    // deterministic — the test used to flake within ~2h after midnight
    // because `now - 26h` could fall 2 calendar days back instead of 1.
    const fixedNow = new Date(2026, 4, 15, 12, 0, 0); // 2026-05-15 12:00 local
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    const now = fixedNow.getTime();
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "today", startedAt: now - 60_000 }),
        makeSession({ sessionId: "yest", startedAt: now - 26 * 3600_000 }),
        makeSession({ sessionId: "wk", startedAt: now - 4 * 24 * 3600_000 }),
      ],
      viewMode: "timeline",
    });
    render(<SessionListPanel />);
    const labels = screen.getAllByTestId("group-header").map((h) => h.textContent ?? "");
    expect(labels.some((t) => t.startsWith("Today"))).toBe(true);
    expect(labels.some((t) => t.startsWith("Yesterday"))).toBe(true);
    expect(labels.some((t) => t.startsWith("This Week"))).toBe(true);

    vi.useRealTimers();
  });

  it("virtual scroller activates when filtered.length > 50 (spec §17.8)", () => {
    const many: SessionMeta[] = Array.from({ length: 60 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: many, viewMode: "my" });
    render(<SessionListPanel />);
    expect(screen.getByTestId("virtual-scroller")).toBeInTheDocument();
  });

  // WCAG 2.1.1 (Keyboard) + WAI-ARIA APG: a scrollable region must be
  // keyboard-focusable so keyboard-only users can scroll it. The virtual
  // scroller activates above 50 sessions; without tabIndex={0} keyboard
  // users could only move focus card-by-card, not skim. role="region" +
  // aria-label promotes the focusable scroller to a named landmark.
  // Mirrors ConversationViewer's same fix.
  it("virtual scroller is keyboard-focusable + named region (WCAG 2.1.1)", () => {
    const many: SessionMeta[] = Array.from({ length: 60 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: many, viewMode: "my" });
    render(<SessionListPanel />);
    const scroller = screen.getByTestId("virtual-scroller");
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.getAttribute("role")).toBe("region");
    expect(scroller.getAttribute("aria-label")).toBe("Sessions (scrollable)");
    // Focus ring must be visible on keyboard focus (WCAG 2.4.7).
    expect(scroller.className).toContain("focus-visible:ring-2");
    expect(scroller.className).toContain("focus-visible:ring-accent");
  });

  it("under threshold renders without the virtual scroller", () => {
    const few: SessionMeta[] = Array.from({ length: 10 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: few, viewMode: "my" });
    render(<SessionListPanel />);
    expect(screen.queryByTestId("virtual-scroller")).not.toBeInTheDocument();
  });

  // WCAG 2.1.1 (Keyboard): the virtual scroller above 50 sessions was already
  // made keyboard-focusable, but the ≤50-session non-virtual branch — the
  // overwhelmingly common case — rendered a bare scrollable <div>. Keyboard-
  // only users on a tall list could not arrow-scroll the region; they had to
  // Tab through every card. Mirror the virtual-scroller fix.
  it("non-virtual scroller is keyboard-focusable + named region (WCAG 2.1.1)", () => {
    const few: SessionMeta[] = Array.from({ length: 10 }, (_, i) =>
      makeSession({ sessionId: `s${i}` }),
    );
    useSessionStore.setState({ sessions: few, viewMode: "my" });
    render(<SessionListPanel />);
    const scroller = screen.getByTestId("non-virtual-scroller");
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.getAttribute("role")).toBe("region");
    expect(scroller.getAttribute("aria-label")).toBe("Sessions (scrollable)");
    expect(scroller.className).toContain("focus-visible:ring-2");
    expect(scroller.className).toContain("focus-visible:ring-accent");
  });

  it("empty state when no sessions are present", () => {
    render(<SessionListPanel />);
    expect(screen.getByText("No sessions found")).toBeInTheDocument();
  });

  // a11y: the empty/no-matches block is shown either on initial empty load
  // ("No sessions found") OR when the user types a query that filters out
  // every session ("No matches for 'X'"). The latter is the load-bearing
  // case — without role="status" + aria-live="polite", screen-reader users
  // who type into the filter get NO feedback that their query produced zero
  // results. Polite (not assertive) so the announcement waits for the user
  // to pause typing rather than firing on every keystroke. Mirrors
  // PluginListView (#154), McpPanel (#155), and SkillsListView (#157).
  it("no-matches/empty block is a polite live region (a11y: search announce)", () => {
    useSessionStore.setState({
      sessions: [makeSession({ sessionId: "s1", projectName: "alpha" })],
      searchQuery: "zzz-no-match",
      viewMode: "my",
    });
    render(<SessionListPanel />);
    const empty = screen.getByTestId("session-list-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
    expect(empty.textContent).toContain("No matches");
  });

  it("New Session button is reachable and enabled", () => {
    render(<SessionListPanel />);
    const btn = screen.getByTestId("new-session-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("New Session button has no (coming soon) aria-label", () => {
    render(<SessionListPanel />);
    const btn = screen.getByTestId("new-session-btn");
    expect(btn.getAttribute("aria-label")).toBeNull();
  });

  // WCAG 4.1.2 (Name, Role, Value): the decorative Plus lucide icon next to
  // the visible "New Session" label must be aria-hidden so screen readers
  // don't announce "Plus, New Session". Mirrors PR #58 (SkillCard) and PR
  // #68 (SkillsListView Create Skill).
  it("New Session button icon is aria-hidden", () => {
    render(<SessionListPanel />);
    const btn = screen.getByTestId("new-session-btn");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
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

  // WCAG 2.4.1 / WAI-ARIA Naming Landmarks — the <aside> sidebar is a
  // top-level landmark (semantic <aside> exposes role="complementary" to
  // AT). Without an aria-label, NVDA's "D" landmark cycle and VoiceOver's
  // rotor announce only "complementary", which is indistinguishable from
  // any other unnamed aside on the page (e.g. the future plugin sidebar).
  // Mirrors PR #114 which gave <main> per-section aria-labels.
  it("session list <aside> landmark has aria-label='Session list' (WCAG 2.4.1)", () => {
    render(<SessionListPanel />);
    const panel = screen.getByTestId("session-list-panel");
    expect(panel.tagName).toBe("ASIDE");
    expect(panel.getAttribute("aria-label")).toBe("Session list");
  });

  // WCAG 1.3.1 (Info and Relationships): each group's cards form a labelled
  // collection under the <h3> group header. Without a <ul>/<li> wrapper, SR
  // rotor's Lists view (NVDA/JAWS "L", VoiceOver rotor → Lists) heard
  // nothing for the cards and the per-group count was lost. Mirrors PRs
  // #235/#236/#237/#238/#239/#240/#241.
  it("non-virtual session groups wrap cards in <ul aria-labelledby>/<li>", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "p1", displayName: "One" }),
        makeSession({ sessionId: "p2", displayName: "Two" }),
        makeSession({ sessionId: "n1", displayName: "Three" }),
      ],
      viewMode: "my",
      groups: [],
    });
    render(<SessionListPanel />);
    const ungroupedList = screen.getByTestId("session-group-list-ungrouped");
    expect(ungroupedList.tagName).toBe("UL");
    const headerId = ungroupedList.getAttribute("aria-labelledby");
    expect(headerId).toBe("session-group-ungrouped");
    const headerEl = document.getElementById(headerId!);
    expect(headerEl?.tagName).toBe("H3");
    expect(headerEl?.textContent).toContain("Ungrouped");
    const items = ungroupedList.querySelectorAll(":scope > li");
    expect(items).toHaveLength(3);
    items.forEach((li) => {
      expect(li.querySelector("[data-testid='session-card']")).not.toBeNull();
    });
  });

  it("group container has no gap-1 class (Bug 1 fix: no blank space)", () => {
    useSessionStore.setState({
      sessions: [makeSession({ sessionId: "s1" })],
      viewMode: "my",
      groups: [],
    });
    render(<SessionListPanel />);
    const header = screen.getByTestId("group-header");
    const container = header.closest("div.flex.flex-col");
    expect(container).not.toBeNull();
    expect(container!.className).not.toContain("gap-1");
  });

  it("default collapse: only first group expanded when >1 groups exist", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "a1", startedAt: Date.now() }),
        makeSession({ sessionId: "a2", startedAt: Date.now() - 3600_000 }),
        makeSession({ sessionId: "a3", startedAt: Date.now() - 86400_000 }),
      ],
      viewMode: "timeline",
      collapsedGroups: new Set(),
    });
    render(<SessionListPanel />);
    const headers = screen.getAllByTestId("group-header");
    expect(headers.length).toBeGreaterThan(1);
    // First group's sessions should be visible
    const firstGroupCards = screen.getAllByTestId("session-card");
    // Only sessions from the first (expanded) group should be rendered
    expect(firstGroupCards.length).toBeLessThan(3);
  });

  describe("integration: expand/collapse", () => {
    const fixedNow = new Date(2026, 4, 15, 12, 0, 0);

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
      const now = fixedNow.getTime();
      useSessionStore.setState({
        sessions: [
          makeSession({ sessionId: "t1", startedAt: now - 60_000 }),
          makeSession({ sessionId: "t2", startedAt: now - 120_000 }),
          makeSession({ sessionId: "y1", startedAt: now - 26 * 3600_000 }),
        ],
        viewMode: "timeline",
        collapsedGroups: new Set(),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("click a group header collapses its sessions", () => {
      render(<SessionListPanel />);
      const headers = screen.getAllByTestId("group-header");
      // Default collapse: first group expanded, second collapsed
      // First group ("Today") has 2 sessions visible
      expect(screen.getAllByTestId("session-card")).toHaveLength(2);

      // Click first group header to collapse it
      fireEvent.click(headers[0]);
      expect(screen.queryAllByTestId("session-card")).toHaveLength(0);
    });

    it("click a collapsed header expands its sessions", () => {
      render(<SessionListPanel />);
      const headers = screen.getAllByTestId("group-header");
      // Second group ("Yesterday") is collapsed by default — 0 of its cards visible
      // Only first group's 2 cards are shown
      expect(screen.getAllByTestId("session-card")).toHaveLength(2);

      // Click second group header to expand it
      fireEvent.click(headers[1]);
      // Now both groups' sessions are visible: 2 + 1 = 3
      expect(screen.getAllByTestId("session-card")).toHaveLength(3);
    });

    it("collapse state persists across re-renders", () => {
      const { unmount } = render(<SessionListPanel />);
      // Default: Today expanded (2 cards), Yesterday collapsed (0 cards)
      expect(screen.getAllByTestId("session-card")).toHaveLength(2);

      // Collapse the first group (Today) via click
      const headers = screen.getAllByTestId("group-header");
      fireEvent.click(headers[0]);
      expect(screen.queryAllByTestId("session-card")).toHaveLength(0);

      // Unmount and re-mount without resetting the store
      unmount();
      render(<SessionListPanel />);
      // collapsedGroups persists in the store: both Today and Yesterday
      // are collapsed. The default-collapse effect skips because
      // collapsedGroups.size > 0. All groups remain collapsed.
      expect(screen.queryAllByTestId("session-card")).toHaveLength(0);
    });
  });
});
