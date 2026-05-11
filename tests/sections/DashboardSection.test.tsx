// Tests for DashboardSection (T2.13).
//
// Mocks at the module boundary:
//   - `../../src/lib/db`            → dbSelect (SQLite reads in dashboard-store)
//   - `../../src/lib/stats-reader`  → readStatsCache (chart series)
//   - global `fetch`                → SystemHealth's HEAD probe (non-blocking)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";

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
    loadError: null,
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

  // WCAG 1.3.1 (Info and Relationships): the four stat cards form a
  // coherent group of "key statistics" but were emitted as flat sibling
  // <div>s in a non-semantic <div className="grid">. Promote to
  // <ul aria-label="Key statistics"> + <li> so the SR rotor surfaces
  // "list, 4 items, Key statistics". Mirrors PRs #235/#236/#237/#238/#239.
  it("row 1 wraps stat cards in <ul aria-label='Key statistics'> with <li> per card", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const list = screen.getByTestId("dashboard-row-1");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-label")).toBe("Key statistics");
    const byRole = screen.getByRole("list", { name: "Key statistics" });
    expect(byRole).toBe(list);
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((li) => {
      expect(li.querySelector("[data-testid='stat-card']")).not.toBeNull();
    });
  });

  it("hides the load-error banner on a healthy load", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("dashboard-load-error")).toBeNull();
  });

  it("renders a soft load-error banner when the store reports loadError", async () => {
    dbSelectMock.mockReset();
    dbSelectMock.mockRejectedValue(new Error("disk on fire"));
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const banner = screen.getByTestId("dashboard-load-error");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner.textContent).toContain("disk on fire");
  });

  it("load-error banner uses theme-aware status-amber, not bare yellow-500 (WCAG 1.4.11)", async () => {
    // The original implementation used Tailwind's bare `yellow-500`
    // (#eab308) for border, background, and the AlertTriangle icon —
    // failing the 3:1 non-text contrast floor on light card-bg and
    // bypassing the codebase's theme-token convention. Pin both
    // positive (status-amber present) and negative (no bare
    // yellow-500) so a future refactor can't silently regress.
    // Mirrors PR #293 (ActivityChart staleness banner).
    dbSelectMock.mockReset();
    dbSelectMock.mockRejectedValue(new Error("disk on fire"));
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const banner = screen.getByTestId("dashboard-load-error");
    expect(banner.className).toContain("border-status-amber/40");
    expect(banner.className).toContain("bg-status-amber/10");
    expect(banner.className).not.toMatch(/yellow-500/);
    const icon = banner.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("class")).toContain("text-status-amber");
    expect(icon!.getAttribute("class")).not.toMatch(/yellow-500/);
  });

  // WCAG 1.3.1 (Info and Relationships) + 2.4.6 (Headings and Labels):
  // the section landmark previously had no accessible name AND the heading
  // hierarchy started at <h3> (the inner panel headings), skipping h1 and
  // h2 entirely. SR users navigating by landmark heard "section" with no
  // identifier; users navigating by heading found no top-level title.
  // Fix: add a visually-hidden <h1 id="dashboard-heading"> and point the
  // section's aria-labelledby at it. Visual layout is unchanged.
  it("section has an accessible name backed by a visually-hidden h1 (WCAG 2.4.6 / 1.3.1)", async () => {
    render(<DashboardSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const section = screen.getByTestId("dashboard-section");
    expect(section.getAttribute("aria-labelledby")).toBe("dashboard-heading");
    const heading = document.getElementById("dashboard-heading");
    expect(heading).not.toBeNull();
    expect(heading!.tagName).toBe("H1");
    expect(heading!.textContent).toBe("Dashboard");
    // Visually hidden but exposed to AT — `sr-only` is the canonical class.
    expect(heading!.className).toContain("sr-only");
  });
});
