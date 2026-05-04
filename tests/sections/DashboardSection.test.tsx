// Tests for DashboardSection (T2.13).
//
// Mocks at the module boundary:
//   - `../../src/lib/db`            → dbSelect (SQLite reads in dashboard-store)
//   - `../../src/lib/stats-reader`  → readStatsCache (chart series)
//   - global `fetch`                → SystemHealth's HEAD probe (non-blocking)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const dbSelectMock = vi.fn();
const readStatsCacheMock = vi.fn();

vi.mock("../../src/lib/db", () => ({
  dbSelect: (...args: unknown[]) => dbSelectMock(...args),
}));
vi.mock("../../src/lib/stats-reader", () => ({
  readStatsCache: (...args: unknown[]) => readStatsCacheMock(...args),
}));

import { DashboardSection } from "../../src/sections/DashboardSection";
import { useDashboardStore } from "../../src/stores/dashboard-store";

beforeEach(() => {
  // Reset store between tests so layout assertions aren't polluted.
  useDashboardStore.setState({
    totalSessions: 0,
    totalMessages: 0,
    longestSession: null,
    activeSince: null,
    activityData: [],
    modelUsage: [],
    recentSessions: [],
    isLoading: false,
  });
  dbSelectMock.mockReset();
  readStatsCacheMock.mockReset();
  // Default mock: no data, but resolves cleanly so loadDashboard doesn't throw.
  dbSelectMock.mockResolvedValue([]);
  readStatsCacheMock.mockResolvedValue({
    costUSD: 0,
    hourCounts: Array(24).fill(0),
    dailyActivity: [],
    dailyModelTokens: [],
  });
  // SystemHealth fires a HEAD request — stub it so jsdom doesn't error.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DashboardSection", () => {
  it("mounts without console errors", async () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<DashboardSection />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("invokes loadDashboard exactly once on mount", async () => {
    const spy = vi.spyOn(useDashboardStore.getState(), "loadDashboard");
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("renders the spec §4.1 layout: 3 rows with 4 stat cards in row 1", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("dashboard-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-row-3")).toBeInTheDocument();
    // Row 1: 4 stat cards.
    const cards = screen.getAllByTestId("stat-card");
    expect(cards).toHaveLength(4);
  });

  it("row 2 contains ActivityChart + ModelDonut, row 3 has Recent + Quick + Health", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("activity-chart")).toBeInTheDocument();
    expect(screen.getByTestId("model-donut")).toBeInTheDocument();
    expect(screen.getByTestId("recent-sessions")).toBeInTheDocument();
    expect(screen.getByTestId("quick-actions")).toBeInTheDocument();
    expect(screen.getByTestId("system-health")).toBeInTheDocument();
  });

  it("uses spec accent colors on the four stat cards", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const accents = screen
      .getAllByTestId("stat-card")
      .map((el) => el.getAttribute("data-accent"));
    expect(accents).toEqual(["green", "blue", "yellow", "mauve"]);
  });
});
