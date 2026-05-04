// Tests for the dashboard Zustand store (T2.8).
//
// Mocks at the module boundary:
//   - `../../src/lib/db`            → dbSelect (SQLite aggregate queries)
//   - `../../src/lib/stats-reader`  → readStatsCache (stats-cache.json)
// We never mock the unit under test (`dashboard-store`) itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbSelectMock = vi.fn();
const readStatsCacheMock = vi.fn();

vi.mock("../../src/lib/db", () => ({
  dbSelect: (...args: unknown[]) => dbSelectMock(...args),
}));
vi.mock("../../src/lib/stats-reader", () => ({
  readStatsCache: (...args: unknown[]) => readStatsCacheMock(...args),
}));

import { useDashboardStore } from "../../src/stores/dashboard-store";

/** Reset store + mocks between tests so state never bleeds. */
beforeEach(() => {
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dashboard-store", () => {
  it("case 1: initial state — all numeric 0, all arrays empty, isLoading false", () => {
    const s = useDashboardStore.getState();
    expect(s.totalSessions).toBe(0);
    expect(s.totalMessages).toBe(0);
    expect(s.longestSession).toBeNull();
    expect(s.activeSince).toBeNull();
    expect(s.activityData).toEqual([]);
    expect(s.modelUsage).toEqual([]);
    expect(s.recentSessions).toEqual([]);
    expect(s.isLoading).toBe(false);
  });

  it("case 2: loadDashboard sets isLoading true then false; populates aggregates", async () => {
    // Aggregate query: count, sum(message_count), min(started_at)
    // Longest query: name + messageCount
    // Recent query: 8 rows
    dbSelectMock.mockImplementation((sql: string) => {
      if (sql.includes("COUNT(")) {
        return Promise.resolve([
          { totalSessions: 42, totalMessages: 1234, activeSince: 1_700_000_000_000 },
        ]);
      }
      if (sql.includes("ORDER BY message_count DESC")) {
        return Promise.resolve([
          { name: "Refactor auth", message_count: 257 },
        ]);
      }
      if (sql.includes("ORDER BY started_at DESC")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    readStatsCacheMock.mockResolvedValue({
      costUSD: 0,
      hourCounts: Array(24).fill(0),
      dailyActivity: [],
      dailyModelTokens: [],
    });

    expect(useDashboardStore.getState().isLoading).toBe(false);
    const promise = useDashboardStore.getState().loadDashboard();
    expect(useDashboardStore.getState().isLoading).toBe(true);
    await promise;

    const s = useDashboardStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.totalSessions).toBe(42);
    expect(s.totalMessages).toBe(1234);
    expect(s.longestSession).toEqual({ name: "Refactor auth", messageCount: 257 });
    expect(s.activeSince).toBe(1_700_000_000_000);
  });

  it("case 3: activityData + modelUsage populated from stats-reader response", async () => {
    dbSelectMock.mockResolvedValue([]); // any DB call returns []
    readStatsCacheMock.mockResolvedValue({
      costUSD: 1,
      hourCounts: Array(24).fill(0),
      dailyActivity: [
        { date: "2026-05-01", messageCount: 10, sessionCount: 2, toolCallCount: 3 },
        { date: "2026-05-02", messageCount: 5, sessionCount: 1, toolCallCount: 1 },
      ],
      dailyModelTokens: [
        { date: "2026-05-01", tokensByModel: { sonnet: 1000, opus: 500 } },
        { date: "2026-05-02", tokensByModel: { sonnet: 200 } },
      ],
    });

    await useDashboardStore.getState().loadDashboard();
    const s = useDashboardStore.getState();
    expect(s.activityData).toHaveLength(2);
    expect(s.activityData[0]).toEqual({
      date: "2026-05-01",
      messageCount: 10,
      sessionCount: 2,
      toolCallCount: 3,
    });
    // modelUsage aggregates tokensByModel across all days, sorted by tokens desc.
    expect(s.modelUsage).toEqual([
      { model: "sonnet", tokens: 1200 },
      { model: "opus", tokens: 500 },
    ]);
  });

  it("case 4: recentSessions returns 8 most recent (ORDER BY started_at DESC LIMIT 8)", async () => {
    const recentRows = Array.from({ length: 8 }, (_, i) => ({
      session_id: `id-${i}`,
      display_name: `Sess ${i}`,
      first_prompt: `prompt ${i}`,
      message_count: 10 + i,
      started_at: 1_700_000_000_000 - i * 1000,
    }));
    let recentSql = "";
    dbSelectMock.mockImplementation((sql: string) => {
      if (sql.includes("ORDER BY started_at DESC")) {
        recentSql = sql;
        return Promise.resolve(recentRows);
      }
      return Promise.resolve([]);
    });
    readStatsCacheMock.mockResolvedValue({
      costUSD: 0,
      hourCounts: Array(24).fill(0),
      dailyActivity: [],
      dailyModelTokens: [],
    });

    await useDashboardStore.getState().loadDashboard();
    const s = useDashboardStore.getState();
    expect(s.recentSessions).toHaveLength(8);
    expect(recentSql).toMatch(/LIMIT\s+8/);
    expect(s.recentSessions[0].sessionId).toBe("id-0");
    expect(s.recentSessions[0].displayName).toBe("Sess 0");
    expect(s.recentSessions[0].messageCount).toBe(10);
    expect(s.recentSessions[0].startedAt).toBe(1_700_000_000_000);
  });

  it("case 5: failed SQLite read → falls back to safe defaults, does NOT throw", async () => {
    dbSelectMock.mockRejectedValue(new Error("sqlite is sad"));
    readStatsCacheMock.mockResolvedValue({
      costUSD: 0,
      hourCounts: Array(24).fill(0),
      dailyActivity: [],
      dailyModelTokens: [],
    });

    await expect(useDashboardStore.getState().loadDashboard()).resolves.toBeUndefined();
    const s = useDashboardStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.totalSessions).toBe(0);
    expect(s.totalMessages).toBe(0);
    expect(s.longestSession).toBeNull();
    expect(s.activeSince).toBeNull();
    expect(s.recentSessions).toEqual([]);
  });

  it("integration: mocks resolve correctly during loadDashboard — no unhandled rejections", async () => {
    dbSelectMock.mockResolvedValue([]);
    readStatsCacheMock.mockResolvedValue({
      costUSD: 0,
      hourCounts: Array(24).fill(0),
      dailyActivity: [],
      dailyModelTokens: [],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await useDashboardStore.getState().loadDashboard();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
