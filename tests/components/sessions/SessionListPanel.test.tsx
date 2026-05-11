import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  // WCAG 1.3.1 Info & Relationships / 2.4.6 Headings & Labels: group labels
  // ("Pinned", "All Sessions", "Today", "/repos/api", …) are content
  // structure, not just visual decoration. Rendering them as plain <div>s
  // means screen-reader users navigating by heading get nothing — the
  // grouped list reads as a flat undifferentiated stream. Render the
  // group-header element as an <h3> so SR heading-navigation surfaces them.
  it("group-header renders as an <h3> for screen-reader heading navigation", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ sessionId: "p1", isPinned: true, displayName: "PinOne" }),
        makeSession({ sessionId: "n1", isPinned: false, displayName: "NormOne" }),
      ],
      viewMode: "my",
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

  it("New Session button is reachable", () => {
    render(<SessionListPanel />);
    const btn = screen.getByTestId("new-session-btn");
    expect(btn).toBeInTheDocument();
    // Until the IPC is wired, the button must be disabled with a tooltip
    // explaining why — clickable-but-dead is worse than visibly-not-yet.
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title");
  });

  // WCAG 4.1.2 (Name, Role, Value): the disabled "New Session" button
  // shows a "Coming soon …" tooltip on hover for sighted users, but the
  // accessible name was just "New Session" — a screen-reader user
  // navigating by buttons hears "New Session, button, dimmed" with no
  // hint that the dimmed state is intentional and reasonably concludes
  // the app is broken. Mirror the visual tooltip into aria-label so SR
  // and sighted users get the same affordance.
  it("New Session button announces (coming soon) status to assistive tech", () => {
    render(<SessionListPanel />);
    const btn = screen.getByTestId("new-session-btn");
    expect(btn.getAttribute("aria-label")).toBe("New Session (coming soon)");
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

  // WCAG 4.1.2 (Name, Role, Value) + WAI-ARIA Tabs APG: ViewModeToggle
  // renders role="tab" buttons; each has aria-controls pointing here. The
  // session-list scroll region must therefore render role="tabpanel" with
  // a matching id and aria-labelledby pointing at the active tab. Without
  // it, the role="tab" semantics announce a relationship that has no DOM
  // target. The panel re-groups in place rather than swapping, so the
  // labelledby tracks whichever tab is currently active.
  it("session-list scroll region is a tabpanel labelled by the active tab", () => {
    useSessionStore.setState({
      sessions: [makeSession({ sessionId: "x", displayName: "X" })],
      viewMode: "project",
    });
    render(<SessionListPanel />);
    const panel = document.getElementById("session-list-panel-tabpanel");
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("role")).toBe("tabpanel");
    expect(panel!.getAttribute("aria-labelledby")).toBe("view-mode-tab-project");
  });
});
