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
});
