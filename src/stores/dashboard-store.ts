// Dashboard state — see spec §4.1, §6.
//
// Pulls aggregates from SQLite (sessions table) and chart series from
// `~/.claude/stats-cache.json` via the stats-reader. One-shot loader; FS
// watchers and live updates are deferred to Phase 4 Task 10 (per T2.13 note).
//
// Failure handling: any error in the SQLite reads is caught and the store
// falls back to safe defaults so the Dashboard renders empty states instead
// of crashing. The error message is captured on `loadError` so the UI can
// surface a soft "couldn't load stats" banner. Stats-reader already swallows
// its own errors and returns EMPTY_STATS on failure, so we don't double-wrap it.

import { create } from "zustand";

import { dbSelect } from "../lib/db";
import { readStatsCache, type DailyActivityEntry } from "../lib/stats-reader";

/** Dashboard "Recent sessions" list row — see spec §4.1 Row 3. */
export interface RecentSessionEntry {
  sessionId: string;
  /** Falls back to firstPrompt when display_name is null. */
  displayName: string;
  messageCount: number;
  /** Epoch ms; 0 when started_at is missing. */
  startedAt: number;
}

/** Aggregate token totals per model — see spec §4.1 Row 2 right (donut). */
export interface ModelUsageEntry {
  model: string;
  tokens: number;
}

interface DashboardState {
  totalSessions: number;
  totalMessages: number;
  /** Single longest-by-message-count session, or null when no sessions exist. */
  longestSession: { name: string; messageCount: number } | null;
  /** Earliest session start (epoch ms), or null when no sessions exist. */
  activeSince: number | null;
  activityData: DailyActivityEntry[];
  modelUsage: ModelUsageEntry[];
  recentSessions: RecentSessionEntry[];
  isLoading: boolean;
  /** Non-null when the most recent SQLite read failed; UI surfaces it as a soft banner. */
  loadError: string | null;

  loadDashboard: () => Promise<void>;
}

const INITIAL_STATE = {
  totalSessions: 0,
  totalMessages: 0,
  longestSession: null,
  activeSince: null,
  activityData: [],
  modelUsage: [],
  recentSessions: [],
  isLoading: false,
  loadError: null,
} satisfies Omit<DashboardState, "loadDashboard">;

/** Aggregate query row shape. */
interface AggregateRow {
  totalSessions: number | null;
  totalMessages: number | null;
  activeSince: number | null;
}

/** Longest-session query row. */
interface LongestRow {
  name: string | null;
  message_count: number | null;
}

/** Recent-session query row. */
interface RecentRow {
  session_id: string;
  display_name: string | null;
  first_prompt: string | null;
  message_count: number | null;
  started_at: number | null;
}

/**
 * Sum tokens-by-model across the daily series, returning a list sorted by
 * tokens descending. Empty input yields an empty array (donut renders an
 * empty state in that case — handled by the component layer).
 */
function aggregateModelUsage(
  daily: { tokensByModel: Record<string, number> }[],
): ModelUsageEntry[] {
  const totals = new Map<string, number>();
  for (const day of daily) {
    for (const [model, n] of Object.entries(day.tokensByModel)) {
      totals.set(model, (totals.get(model) ?? 0) + n);
    }
  }
  return Array.from(totals.entries())
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}

export const useDashboardStore = create<DashboardState>((set) => ({
  ...INITIAL_STATE,

  loadDashboard: async () => {
    set({ isLoading: true, loadError: null });

    // Stats cache never throws — it returns EMPTY_STATS on any error.
    const stats = await readStatsCache();

    // SQLite reads are wrapped together; a failure in any of them resets
    // the SQLite-derived fields to safe defaults but still surfaces the
    // chart series we already have, plus a non-null loadError so the UI
    // can warn the user that stats may be stale.
    let agg: AggregateRow = { totalSessions: 0, totalMessages: 0, activeSince: null };
    let longest: LongestRow | undefined;
    let recents: RecentRow[] = [];
    let loadError: string | null = null;
    try {
      const aggRows = await dbSelect<AggregateRow>(
        `SELECT
           COUNT(session_id) AS totalSessions,
           COALESCE(SUM(message_count), 0) AS totalMessages,
           MIN(started_at) AS activeSince
         FROM sessions
         WHERE archived_at IS NULL`,
      );
      if (aggRows.length > 0) agg = aggRows[0];

      const longestRows = await dbSelect<LongestRow>(
        `SELECT
           COALESCE(display_name, first_prompt) AS name,
           message_count
         FROM sessions
         WHERE archived_at IS NULL
         ORDER BY message_count DESC
         LIMIT 1`,
      );
      longest = longestRows[0];

      recents = await dbSelect<RecentRow>(
        `SELECT session_id, display_name, first_prompt, message_count, started_at
         FROM sessions
         WHERE archived_at IS NULL
         ORDER BY started_at DESC
         LIMIT 8`,
      );
    } catch (err) {
      // Fall back to safe defaults; do not throw. Capture the message so
      // the Dashboard can render a soft "couldn't load stats" banner
      // instead of silently showing zeros.
      agg = { totalSessions: 0, totalMessages: 0, activeSince: null };
      longest = undefined;
      recents = [];
      loadError = err instanceof Error ? err.message : "Failed to load dashboard stats";
    }

    set({
      totalSessions: agg.totalSessions ?? 0,
      totalMessages: agg.totalMessages ?? 0,
      longestSession:
        longest && longest.name && longest.message_count != null
          ? { name: longest.name, messageCount: longest.message_count }
          : null,
      activeSince: agg.activeSince,
      activityData: stats.dailyActivity,
      modelUsage: aggregateModelUsage(stats.dailyModelTokens),
      recentSessions: recents.map((r) => ({
        sessionId: r.session_id,
        displayName: r.display_name ?? r.first_prompt ?? "",
        messageCount: r.message_count ?? 0,
        startedAt: r.started_at ?? 0,
      })),
      isLoading: false,
      loadError,
    });
  },
}));
