// Tests for RecentSessions — T2.12.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { RecentSessions } from "../../../src/components/dashboard/RecentSessions";
import { useNavigationStore } from "../../../src/stores/navigation-store";
import type { RecentSessionEntry } from "../../../src/stores/dashboard-store";

afterEach(() => cleanup());

beforeEach(() => {
  useNavigationStore.setState({ activeSection: "dashboard" });
});

function makeRows(n: number): RecentSessionEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    sessionId: `id-${i}`,
    displayName: `session ${i}`,
    messageCount: i + 1,
    startedAt: Date.now() - (i + 1) * 60_000,
  }));
}

describe("RecentSessions", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<RecentSessions data={makeRows(3)} />);
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("renders 8 entries", () => {
    render(<RecentSessions data={makeRows(8)} />);
    const rows = screen.getAllByTestId("recent-session-row");
    expect(rows).toHaveLength(8);
  });

  it("'View All Sessions' link triggers navigation to sessions", () => {
    render(<RecentSessions data={makeRows(2)} />);
    fireEvent.click(screen.getByTestId("view-all-sessions"));
    expect(useNavigationStore.getState().activeSection).toBe("sessions");
  });

  it("'View All Sessions' button has a focus-visible ring (WCAG 2.4.7)", () => {
    // Defect: the only hover affordance was a color swap + underline, both
    // of which are useless to keyboard users with no pointer hover state.
    // Mirrors the established trio used in PRs #17/#45/#48/#49/#56/#57/#67/#80.
    render(<RecentSessions data={makeRows(1)} />);
    const cls = screen.getByTestId("view-all-sessions").className;
    expect(cls).toContain("focus-visible:outline-none");
    expect(cls).toContain("focus-visible:ring-2");
    expect(cls).toContain("focus-visible:ring-accent");
  });

  it("renders empty state when data is empty", () => {
    render(<RecentSessions data={[]} />);
    expect(screen.getByText("No recent sessions")).toBeInTheDocument();
  });

  it("uses shared timeAgo() format", () => {
    // Five minutes ago → "5m ago".
    render(
      <RecentSessions
        data={[
          {
            sessionId: "x",
            displayName: "name",
            messageCount: 1,
            startedAt: Date.now() - 5 * 60_000,
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    expect(row.textContent).toContain("5m ago");
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6)", () => {
    // Defect: visual section label rendered as a <div>, so screen-reader
    // users couldn't navigate to it via the headings list. Mirrors PR #61
    // (SystemHealth), PR #63 (ModelDonut), PR #64 (QuickActions).
    render(<RecentSessions data={[]} />);
    const heading = screen.getByRole("heading", { name: "Recent Sessions", level: 3 });
    expect(heading.tagName).toBe("H3");
  });

  it("rows are non-interactive: no onClick + no hover-bg cue (spec §4.1 — only 'View All Sessions' is the documented affordance)", () => {
    // Defect: previously the row had `hover:bg-bg-tertiary` implying it was
    // clickable, but no click handler was wired. Either remove the misleading
    // hover or wire navigation. Spec §4.1 only documents the `View All
    // Sessions` link as the affordance, so we drop the hover cue rather than
    // invent unspecified navigation behavior.
    render(<RecentSessions data={makeRows(1)} />);
    const row = screen.getByTestId("recent-session-row");
    expect(row.className).not.toMatch(/hover:bg-/);
    expect(row.getAttribute("onclick")).toBeNull();
  });

  // Defect: row showed "1 msgs" for sessions with exactly one message.
  // Mirrors PR #87 (SessionCard) and PR #90 (SystemHealth MCP row).
  it.each([
    [0, "0 msgs"],
    [1, "1 msg"],
    [2, "2 msgs"],
  ])("pluralizes message count correctly (%i → %s)", (count, expected) => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "n",
            messageCount: count,
            startedAt: Date.now(),
          },
        ]}
      />,
    );
    const cell = screen.getByTestId("recent-session-msg-count");
    expect(cell.textContent).toBe(expected);
  });

  // WCAG 4.1.2 — bare "5 msgs" is opaque to SR users; mirror the visual
  // "messages" cue into the accessible name. Same pattern as SessionCard
  // (PR #250), SessionInfoBar message-count-badge, and AssistantMessage
  // model-badge (PR #247).
  it("recent-session-msg-count announces 'Messages: <n>' to assistive tech", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "n",
            messageCount: 17,
            startedAt: Date.now(),
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId("recent-session-msg-count").getAttribute("aria-label"),
    ).toBe("Messages: 17");
  });

  // Defect: row name has `truncate`, so long session names get clipped with
  // an ellipsis. Rows are non-interactive (see test above), so a sighted user
  // has NO way to recover the hidden tail — they'd have to switch to the
  // Sessions section and search. Mirror the visible string into `title` so
  // hover surfaces the full name. Mirrors PR #167 (SkillCard skill-path).
  it("session-name span mirrors its visible text into the `title` attribute (UX truncation recovery)", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "a really long session name that overflows",
            messageCount: 1,
            startedAt: Date.now(),
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    const nameSpan = row.querySelector("span.truncate") as HTMLElement | null;
    expect(nameSpan).not.toBeNull();
    expect(nameSpan!.getAttribute("title")).toBe(
      "a really long session name that overflows",
    );
  });

  it("untitled session falls back to the same '(untitled)' string in `title`", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "",
            messageCount: 1,
            startedAt: Date.now(),
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    const nameSpan = row.querySelector("span.truncate") as HTMLElement | null;
    expect(nameSpan).not.toBeNull();
    expect(nameSpan!.getAttribute("title")).toBe("(untitled)");
  });

  // UX: the visible "3h ago" / "Yesterday" string is great for scanning
  // but useless for forensics ("which session ran at 14:23?"). Surface
  // the absolute timestamp via a title tooltip on hover so users can
  // recover the exact time without leaving the dashboard. Mirrors the
  // truncate+title family (PRs #167, #170, #171, #175, #176, #179).
  it("relative-time span exposes the absolute timestamp via title tooltip", () => {
    const ts = new Date("2026-05-09T14:23:00").getTime();
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "Whatever",
            messageCount: 1,
            startedAt: ts,
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    // The time span is the only one whose textContent matches a timeAgo()
    // shape ("…ago", "Yesterday", a date) AND is NOT the message count.
    const spans = Array.from(row.querySelectorAll("span")) as HTMLElement[];
    const timeSpan = spans.find(
      (s) =>
        s.getAttribute("data-testid") !== "recent-session-msg-count" &&
        s.className.includes("tabular-nums"),
    );
    expect(timeSpan).toBeDefined();
    // The exact locale string varies by environment; assert it equals the
    // platform's own formatting of the same epoch — this guarantees the
    // tooltip is the absolute time rather than a copy of the relative.
    expect(timeSpan!.getAttribute("title")).toBe(new Date(ts).toLocaleString());
  });

  // Defensive: when startedAt is 0 / missing (RCA Bug 1 territory), the
  // tooltip must be omitted rather than render an empty string (which
  // some browsers display as a 1-px tooltip box). undefined → no attr.
  it("relative-time span omits title when startedAt is 0", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "Whatever",
            messageCount: 1,
            startedAt: 0,
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    const spans = Array.from(row.querySelectorAll("span")) as HTMLElement[];
    const timeSpan = spans.find(
      (s) =>
        s.getAttribute("data-testid") !== "recent-session-msg-count" &&
        s.className.includes("tabular-nums"),
    );
    expect(timeSpan).toBeDefined();
    expect(timeSpan!.hasAttribute("title")).toBe(false);
  });

  // UX: when `startedAt` is 0/missing (e.g. ENDED sessions with no PID
  // file), `timeAgo()` returns "" — leaving the time-ago slot visually
  // empty. Render an em-dash placeholder so the slot stays visibly
  // populated and AT users get a non-empty announcement. Mirrors PR
  // #210 (SessionCard).
  it("relative-time span shows an em-dash placeholder when startedAt is 0", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s",
            displayName: "Whatever",
            messageCount: 1,
            startedAt: 0,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("recent-session-time").textContent).toBe("—");
  });

  // WCAG 1.3.1 (Info and Relationships) / 4.1.2 (Name, Role, Value): the
  // row visually composes name + time-ago + message count, but the DOM is
  // three flat sibling spans with no programmatic linkage. SR users
  // walking by list items via the rotor see only the first text node per
  // <li> and lose the time + message count entirely. Promote each <li>
  // with a coherent aria-label combining the three pieces. Mirrors PR
  // #230 (SystemHealth indicator) and StatCard precedent.
  it("each <li> exposes a coherent name+msg+time aria-label (WCAG 1.3.1 / 4.1.2)", () => {
    // Pin a deterministic startedAt (~5min ago) so timeAgo() is stable.
    const fiveMinAgo = Date.now() - 5 * 60_000;
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s-1",
            displayName: "phase 2 work",
            messageCount: 3,
            startedAt: fiveMinAgo,
          },
        ]}
      />,
    );
    const row = screen.getByTestId("recent-session-row");
    const label = row.getAttribute("aria-label");
    expect(label).toContain("phase 2 work");
    expect(label).toContain("3 msgs");
    expect(label).toContain("—");
    // Sanity-check the format: "<name>: <msg> — <time>".
    expect(label).toMatch(/^phase 2 work: 3 msgs — /);
  });

  it("aria-label respects singular pluralization (n=1)", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s-1",
            displayName: "alpha",
            messageCount: 1,
            startedAt: Date.now() - 60_000,
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId("recent-session-row").getAttribute("aria-label"),
    ).toMatch(/^alpha: 1 msg — /);
  });

  // When startedAt is 0/missing the visible "—" placeholder is meaningless
  // to SR users, so the time clause must be omitted from the aria-label.
  it("aria-label omits time when startedAt is 0", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s-1",
            displayName: "alpha",
            messageCount: 7,
            startedAt: 0,
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId("recent-session-row").getAttribute("aria-label"),
    ).toBe("alpha: 7 msgs");
  });

  // Falls back to "(untitled)" when displayName is empty — matches the
  // existing visible-text fallback so the aria-label doesn't drift.
  it("aria-label uses (untitled) fallback when displayName is empty", () => {
    render(
      <RecentSessions
        data={[
          {
            sessionId: "s-1",
            displayName: "",
            messageCount: 2,
            startedAt: 0,
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId("recent-session-row").getAttribute("aria-label"),
    ).toBe("(untitled): 2 msgs");
  });

  // WCAG 1.3.1 (Info and Relationships): the <ul> rendered without an
  // accessible name, so screen-reader rotor users hit "list, 8 items" with
  // no hint of what the list represents. Bind to the existing visible
  // <h3> via aria-labelledby so the rotor announces "list, 8 items, Recent
  // Sessions". Mirrors PRs #235 / #236 / #237 / #238 / #230.
  it("recent-sessions <ul> is labelled by the Recent Sessions heading", () => {
    render(<RecentSessions data={makeRows(3)} />);
    const list = screen.getByTestId("recent-sessions-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-labelledby")).toBe("recent-sessions-heading");
    const heading = screen.getByRole("heading", { name: "Recent Sessions", level: 3 });
    expect(heading.id).toBe("recent-sessions-heading");
    const byRole = screen.getByRole("list", { name: "Recent Sessions" });
    expect(byRole).toBe(list);
  });
});
