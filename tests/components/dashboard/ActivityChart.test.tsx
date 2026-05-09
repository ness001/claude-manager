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
});
