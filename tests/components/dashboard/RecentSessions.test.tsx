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
});
