// Tests for ActivityChart — T2.12.
//
// We mock recharts' ResponsiveContainer because jsdom returns 0 for
// getBoundingClientRect, which prevents the chart SVG from ever rendering.
// The mock keeps the children in the DOM so we can still verify the toggle
// wiring + the period→days mapping.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-shim" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    ),
  };
});

import {
  ActivityChart,
  _PERIOD_TO_DAYS,
} from "../../../src/components/dashboard/ActivityChart";
import type { DailyActivityEntry } from "../../../src/lib/stats-reader";

afterEach(() => cleanup());

function makeData(days: number): DailyActivityEntry[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    messageCount: i,
    sessionCount: 1,
    toolCallCount: i * 2,
  }));
}

describe("ActivityChart", () => {
  it("uses explicit period→days mapping (case 1)", () => {
    expect(_PERIOD_TO_DAYS).toEqual({
      "7d": 7,
      "30d": 30,
      "90d": 90,
      all: Infinity,
    });
  });

  it("renders empty state when activityData=[] (case 2)", () => {
    render(<ActivityChart data={[]} />);
    const chart = screen.getByTestId("activity-chart");
    expect(chart.getAttribute("data-empty")).toBe("true");
    expect(chart.textContent).toContain("No activity yet");
  });

  // a11y: the "No activity yet" copy appears asynchronously after the
  // dashboard's stats-cache resolves to an empty/missing payload. Without
  // role="status" + aria-live="polite", screen-reader users get silence
  // and can't tell whether the load is still pending, errored, or
  // resolved-with-zero-data. Mirrors PRs #154 (PluginListView), #155
  // (McpPanel), #207 (SkillsListView), #212 (SessionDetailPanel).
  it("empty state is a polite live region (a11y: zero-activity announce)", () => {
    render(<ActivityChart data={[]} />);
    const chart = screen.getByTestId("activity-chart");
    expect(chart.getAttribute("role")).toBe("status");
    expect(chart.getAttribute("aria-live")).toBe("polite");
  });

  // WCAG 1.1.1 (Non-text Content): the chart canvas is an SVG data graphic.
  // Without role="img" + a descriptive aria-label, the entire chart is
  // invisible to screen readers. The label must summarize the visible data
  // (series, window, sample count, peak) so AT users get the actionable
  // shape, not silence.
  it("chart-canvas exposes a descriptive role=img + aria-label (WCAG 1.1.1)", () => {
    render(<ActivityChart data={makeData(7)} />);
    const canvas = screen.getByTestId("chart-canvas");
    expect(canvas.getAttribute("role")).toBe("img");
    const label = canvas.getAttribute("aria-label") ?? "";
    // Default series is "messages", default period is "7d".
    expect(label).toContain("Messages");
    expect(label).toContain("last 7d");
    expect(label).toContain("7 data points");
    // makeData uses messageCount=i (i=0..6), so peak is 6 on day 07.
    expect(label).toContain("peak 6");
    expect(label).toContain("2026-01-07");
  });

  it("aria-label uses 'no activity' when window has zero peak (WCAG 1.1.1)", () => {
    const zeroData: DailyActivityEntry[] = [
      { date: "2026-01-01", messageCount: 0, sessionCount: 0, toolCallCount: 0 },
      { date: "2026-01-02", messageCount: 0, sessionCount: 0, toolCallCount: 0 },
    ];
    render(<ActivityChart data={zeroData} />);
    const label = screen.getByTestId("chart-canvas").getAttribute("aria-label") ?? "";
    expect(label).toContain("no activity in window");
  });

  // WCAG 1.3.1 (Info and Relationships) / 2.4.6 (Headings and Labels):
  // sibling dashboard sections (SystemHealth, ModelDonut, RecentSessions,
  // QuickActions) all expose an <h3>"Section Name"</h3> heading so SR
  // users can navigate to them via the headings list (NVDA "H", JAWS "H").
  // ActivityChart was the only one missing — the chart was effectively
  // skipped over in the rotor. Mirrors PRs #61, #63, #64.
  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6) — populated", () => {
    render(<ActivityChart data={makeData(7)} />);
    const heading = screen.getByRole("heading", { name: "Activity", level: 3 });
    expect(heading.tagName).toBe("H3");
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6) — empty", () => {
    render(<ActivityChart data={[]} />);
    const heading = screen.getByRole("heading", { name: "Activity", level: 3 });
    expect(heading.tagName).toBe("H3");
  });

  it("mounts populated state without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<ActivityChart data={makeData(20)} />);
      const chart = screen.getByTestId("activity-chart");
      expect(chart.getAttribute("data-empty")).toBe("false");
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("clicking 7d/30d/90d/All toggles updates rendered range", () => {
    render(<ActivityChart data={makeData(100)} />);
    // The default period is 7d.
    expect(screen.getByTestId("period-7d").getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByTestId("period-30d"));
    expect(screen.getByTestId("period-30d").getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByTestId("period-90d"));
    expect(screen.getByTestId("period-90d").getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByTestId("period-all"));
    expect(screen.getByTestId("period-all").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("Messages vs Tool Calls toggle switches series", () => {
    render(<ActivityChart data={makeData(10)} />);
    expect(screen.getByTestId("series-messages").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("series-toolCalls"));
    expect(screen.getByTestId("series-toolCalls").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("series-messages").getAttribute("aria-selected")).toBe("false");
  });

  it("renders 90 data points under 100ms (perf budget)", () => {
    const data = makeData(90);
    const t0 = performance.now();
    render(<ActivityChart data={data} />);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(100);
  });

  it("re-render on period toggle under 50ms (perf budget — memoized)", () => {
    render(<ActivityChart data={makeData(90)} />);
    const t0 = performance.now();
    fireEvent.click(screen.getByTestId("period-30d"));
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(50);
  });

  // WCAG 2.4.7 Focus Visible: the Period (7d/30d/90d/All) and Series
  // (Messages/Tool Calls) tab buttons only carried hover/active color
  // classes. Keyboard users tabbing through them had no visible focus
  // indicator. Same defect class as ViewModeToggle (PR #48).
  it("each Period and Series tab carries a focus-visible ring class", () => {
    render(<ActivityChart data={makeData(7)} />);
    const ids = [
      "period-7d",
      "period-30d",
      "period-90d",
      "period-all",
      "series-messages",
      "series-toolCalls",
    ];
    for (const id of ids) {
      const btn = screen.getByTestId(id);
      expect(btn.className).toContain("focus-visible:ring-2");
      expect(btn.className).toContain("focus-visible:ring-accent");
    }
  });

  // RCA Bug 2: chart was 32 days stale and Verification checkboxes still
  // passed because each had an "or empty state" backdoor. The fix is a
  // visible warning surfacing the staleness so the user knows to act
  // (typically: upgrade Claude Code CLI past v2.1.105 — see
  // docs/research/2026-05-09-stats-cache-investigation.md §6).
  describe("staleness banner (RCA Bug 2)", () => {
    // Pin "today" to 2026-01-31 UTC midnight so makeData() (Jan dates)
    // produces deterministic staleness regardless of when tests run.
    const TODAY_2026_01_31 = Date.UTC(2026, 0, 31);

    it("renders no banner when latest entry is within 3 days", () => {
      // makeData(7) ends on 2026-01-07; pin "today" to 2026-01-09 (2-day gap).
      render(
        <ActivityChart data={makeData(7)} nowMs={Date.UTC(2026, 0, 9)} />,
      );
      expect(screen.queryByTestId("activity-stale-banner")).toBeNull();
    });

    it("renders no banner when latest entry is exactly at threshold (3 days)", () => {
      // makeData(7) latest = 2026-01-07; today = 2026-01-10 → 3 days exactly,
      // which is the threshold. Banner only fires when > 3.
      render(
        <ActivityChart data={makeData(7)} nowMs={Date.UTC(2026, 0, 10)} />,
      );
      expect(screen.queryByTestId("activity-stale-banner")).toBeNull();
    });

    it("renders banner with correct day count when stale by 4 days", () => {
      // makeData(7) latest = 2026-01-07; today = 2026-01-11 → 4 days.
      render(
        <ActivityChart data={makeData(7)} nowMs={Date.UTC(2026, 0, 11)} />,
      );
      const banner = screen.getByTestId("activity-stale-banner");
      expect(banner.getAttribute("data-staleness-days")).toBe("4");
      expect(banner.getAttribute("role")).toBe("alert");
    });

    it("renders banner with 24-day count for the originating RCA scenario", () => {
      // RCA recorded latest entry 2026-01-07 vs today 2026-01-31 → 24 days
      // stale. (The originating production incident was 32 days; we use 24
      // here to keep makeData() reusable.)
      render(
        <ActivityChart data={makeData(7)} nowMs={TODAY_2026_01_31} />,
      );
      const banner = screen.getByTestId("activity-stale-banner");
      expect(banner.getAttribute("data-staleness-days")).toBe("24");
      // Banner must surface the actionable hint (CLI upgrade) per
      // stats-cache-investigation.md §6 — not just a generic "stale" string.
      expect(banner.textContent).toContain("Claude Code CLI");
      expect(banner.textContent).toContain("v2.1.105");
    });

    it("uses the theme-aware status-amber token, not the bare yellow-500 palette (WCAG 1.4.11)", () => {
      // The original implementation used Tailwind's bare `yellow-500`
      // (#eab308) for border, background, and the AlertTriangle icon —
      // failing the 3:1 non-text contrast floor on light card-bg and
      // bypassing the codebase's theme-token convention. Pin both the
      // positive (status-amber present) and negative (no bare yellow-500)
      // so a future refactor can't silently regress.
      render(
        <ActivityChart data={makeData(7)} nowMs={TODAY_2026_01_31} />,
      );
      const banner = screen.getByTestId("activity-stale-banner");
      expect(banner.className).toContain("border-status-amber/40");
      expect(banner.className).toContain("bg-status-amber/10");
      expect(banner.className).not.toMatch(/yellow-500/);
      const icon = banner.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon!.getAttribute("class")).toContain("text-status-amber");
      expect(icon!.getAttribute("class")).not.toMatch(/yellow-500/);
    });

    it("renders no banner when data is empty (handled by the empty state)", () => {
      render(<ActivityChart data={[]} nowMs={TODAY_2026_01_31} />);
      // Empty state is the "No activity yet" placeholder, not a banner.
      expect(screen.queryByTestId("activity-stale-banner")).toBeNull();
      expect(screen.getByTestId("activity-chart").getAttribute("data-empty")).toBe(
        "true",
      );
    });
  });

  // WAI-ARIA Authoring Practices "Tabs" pattern (automatic activation):
  // both tablists in this chart need roving tabindex + arrow/Home/End nav
  // so keyboard users aren't stranded on a single tab. Mirrors PR #94's
  // ViewModeToggle fix.
  describe("WAI-ARIA tabs keyboard navigation", () => {
    const data = makeData(7);

    it("Period tablist: only the selected tab has tabIndex=0 (roving)", () => {
      render(<ActivityChart data={data} />);
      // Default period is "7d".
      expect(screen.getByTestId("period-7d").getAttribute("tabindex")).toBe("0");
      for (const p of ["30d", "90d", "all"]) {
        expect(screen.getByTestId(`period-${p}`).getAttribute("tabindex")).toBe(
          "-1",
        );
      }
    });

    it("Period tablist: ArrowRight moves selection forward and wraps", () => {
      render(<ActivityChart data={data} />);
      const tab7d = screen.getByTestId("period-7d");
      tab7d.focus();
      fireEvent.keyDown(tab7d, { key: "ArrowRight" });
      expect(screen.getByTestId("period-30d").getAttribute("aria-selected")).toBe(
        "true",
      );
      // Wrap from "all" → "7d".
      const tabAll = screen.getByTestId("period-all");
      tabAll.focus();
      fireEvent.keyDown(tabAll, { key: "ArrowRight" });
      expect(screen.getByTestId("period-7d").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("Period tablist: ArrowLeft wraps from first tab to last", () => {
      render(<ActivityChart data={data} />);
      const tab7d = screen.getByTestId("period-7d");
      tab7d.focus();
      fireEvent.keyDown(tab7d, { key: "ArrowLeft" });
      expect(screen.getByTestId("period-all").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("Period tablist: Home selects first, End selects last", () => {
      render(<ActivityChart data={data} />);
      const tab7d = screen.getByTestId("period-7d");
      tab7d.focus();
      fireEvent.keyDown(tab7d, { key: "End" });
      expect(screen.getByTestId("period-all").getAttribute("aria-selected")).toBe(
        "true",
      );
      const tabAll = screen.getByTestId("period-all");
      tabAll.focus();
      fireEvent.keyDown(tabAll, { key: "Home" });
      expect(screen.getByTestId("period-7d").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("Series tablist: only the selected tab has tabIndex=0 (roving)", () => {
      render(<ActivityChart data={data} />);
      // Default series is "messages".
      expect(screen.getByTestId("series-messages").getAttribute("tabindex")).toBe(
        "0",
      );
      expect(screen.getByTestId("series-toolCalls").getAttribute("tabindex")).toBe(
        "-1",
      );
    });

    it("Series tablist: ArrowRight toggles to toolCalls and wraps back", () => {
      render(<ActivityChart data={data} />);
      const m = screen.getByTestId("series-messages");
      m.focus();
      fireEvent.keyDown(m, { key: "ArrowRight" });
      expect(
        screen.getByTestId("series-toolCalls").getAttribute("aria-selected"),
      ).toBe("true");
      const tc = screen.getByTestId("series-toolCalls");
      tc.focus();
      fireEvent.keyDown(tc, { key: "ArrowRight" });
      expect(
        screen.getByTestId("series-messages").getAttribute("aria-selected"),
      ).toBe("true");
    });

    it("Series tablist: Home/End select first/last", () => {
      render(<ActivityChart data={data} />);
      const m = screen.getByTestId("series-messages");
      m.focus();
      fireEvent.keyDown(m, { key: "End" });
      expect(
        screen.getByTestId("series-toolCalls").getAttribute("aria-selected"),
      ).toBe("true");
      const tc = screen.getByTestId("series-toolCalls");
      tc.focus();
      fireEvent.keyDown(tc, { key: "Home" });
      expect(
        screen.getByTestId("series-messages").getAttribute("aria-selected"),
      ).toBe("true");
    });
  });
});
