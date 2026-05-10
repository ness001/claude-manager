// Activity chart — see spec §4.1 Row 2 (left).
//
// Recharts stacked area chart with two toggles:
//   - Period:  7d / 30d / 90d / All  (lowercase consistently per ActivityPeriod)
//   - Series:  Messages vs Tool Calls
//
// IMPORTANT: period→days uses an EXPLICIT mapping table (PERIOD_TO_DAYS).
// The plan's case 1 calls out that `parseInt("7d")` works only by accident
// and warns against it. "all" maps to Infinity so the slice keeps everything.

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyActivityEntry } from "../../lib/stats-reader";
import type { ActivityPeriod } from "../../lib/session-types";

interface ActivityChartProps {
  data: DailyActivityEntry[];
  /** Optional override for "today" — for tests; defaults to Date.now(). */
  nowMs?: number;
}

type SeriesMode = "messages" | "toolCalls";

/**
 * Threshold (days) above which the staleness banner appears. Set to 3 to
 * match the SLA where stats-cache typically updates within 24h of a CLI
 * run; 3 days gives a comfortable margin for weekend gaps before warning.
 *
 * Origin: RCA Bug 2 — chart was 32 days stale because `stats-cache.json` is
 * owned by Claude Code CLI and the CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
 * pre-v2.1.105 bug disables stats writes machine-wide. claude-manager can't
 * fix the writer (architectural boundary, see
 * docs/research/2026-05-09-stats-cache-investigation.md decision §5), but it
 * can warn the user that what they're looking at is stale.
 */
const STALENESS_BANNER_THRESHOLD_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days between today (UTC midnight) and the latest entry's date (parsed as
 * UTC midnight). Returns null when the input is empty or no parseable date
 * exists. Always returns a non-negative integer (future dates clamp to 0 —
 * those are user-clock-skew, not staleness).
 */
function computeStalenessDays(
  data: DailyActivityEntry[],
  nowMs: number,
): number | null {
  if (data.length === 0) return null;
  let latestMs = -Infinity;
  for (const entry of data) {
    // dailyActivity dates are "YYYY-MM-DD" (per stats-cache schema). Parse
    // as UTC to avoid TZ jitter at day boundaries.
    const ts = Date.parse(`${entry.date}T00:00:00Z`);
    if (Number.isFinite(ts) && ts > latestMs) latestMs = ts;
  }
  if (!Number.isFinite(latestMs)) return null;
  // Floor `nowMs` to UTC midnight for an apples-to-apples day diff.
  const todayMidnight = Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
  const diffDays = Math.floor((todayMidnight - latestMs) / MS_PER_DAY);
  return diffDays < 0 ? 0 : diffDays;
}

/** Explicit period → window-in-days table. */
const PERIOD_TO_DAYS: Record<ActivityPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: Infinity,
};

const PERIOD_BUTTONS: ActivityPeriod[] = ["7d", "30d", "90d", "all"];

/** Slice the trailing N days of the daily series. Inputs are pre-sorted by date. */
function sliceTrailing(
  data: DailyActivityEntry[],
  period: ActivityPeriod,
): DailyActivityEntry[] {
  const days = PERIOD_TO_DAYS[period];
  if (!Number.isFinite(days)) return data;
  if (data.length <= days) return data;
  return data.slice(data.length - days);
}

export function ActivityChart({ data, nowMs = Date.now() }: ActivityChartProps) {
  const [period, setPeriod] = useState<ActivityPeriod>("7d");
  const [series, setSeries] = useState<SeriesMode>("messages");

  // Memoize the sliced series — re-computed only when input or period flips.
  // Spec perf budget §T2.12: re-render on period toggle < 50ms.
  const sliced = useMemo(() => sliceTrailing(data, period), [data, period]);
  const stalenessDays = useMemo(
    () => computeStalenessDays(data, nowMs),
    [data, nowMs],
  );
  const isStale =
    stalenessDays !== null && stalenessDays > STALENESS_BANNER_THRESHOLD_DAYS;

  if (data.length === 0) {
    return (
      <div
        data-testid="activity-chart"
        data-empty="true"
        className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-md border border-border bg-card-bg p-4 text-sm text-text-muted"
      >
        No activity yet
      </div>
    );
  }

  const dataKey: keyof DailyActivityEntry =
    series === "messages" ? "messageCount" : "toolCallCount";

  return (
    <div
      data-testid="activity-chart"
      data-empty="false"
      className="flex h-full min-h-[240px] flex-col gap-2 rounded-md border border-border bg-card-bg p-4"
    >
      {isStale ? (
        <div
          data-testid="activity-stale-banner"
          data-staleness-days={stalenessDays}
          role="alert"
          className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-xs text-text-primary"
        >
          <AlertTriangle size={12} className="shrink-0 text-yellow-500" aria-hidden />
          <span>
            Chart data is {stalenessDays} days old. Claude Code CLI writes
            <code className="mx-1 rounded bg-bg-tertiary px-1">~/.claude/stats-cache.json</code>
            — upgrade to v2.1.105+ if you have
            <code className="mx-1 rounded bg-bg-tertiary px-1">CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1</code>
            set, or run a fresh CLI session to refresh.
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Period"
          className="inline-flex items-center gap-1"
        >
          {PERIOD_BUTTONS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              data-testid={`period-${p}`}
              onClick={() => setPeriod(p)}
              className={[
                "rounded px-2 py-0.5 text-xs",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                period === p
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:bg-bg-tertiary",
              ].join(" ")}
            >
              {p === "all" ? "All" : p}
            </button>
          ))}
        </div>

        <div
          role="tablist"
          aria-label="Series"
          className="inline-flex items-center gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={series === "messages"}
            data-testid="series-messages"
            onClick={() => setSeries("messages")}
            className={[
              "rounded px-2 py-0.5 text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              series === "messages"
                ? "bg-bg-tertiary text-text-primary"
                : "text-text-secondary hover:bg-bg-tertiary",
            ].join(" ")}
          >
            Messages
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={series === "toolCalls"}
            data-testid="series-toolCalls"
            onClick={() => setSeries("toolCalls")}
            className={[
              "rounded px-2 py-0.5 text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              series === "toolCalls"
                ? "bg-bg-tertiary text-text-primary"
                : "text-text-secondary hover:bg-bg-tertiary",
            ].join(" ")}
          >
            Tool Calls
          </button>
        </div>
      </div>

      <div data-testid="chart-canvas" className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sliced} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              stroke="var(--color-border)"
            />
            <YAxis
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              stroke="var(--color-border)"
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="var(--color-accent)"
              fill="url(#activityFill)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Exported for unit-test access — the explicit mapping table referenced by
 *  the plan's case 1 ("uses explicit { 7d:7, 30d:30, 90d:90, all:Infinity }"). */
export const _PERIOD_TO_DAYS = PERIOD_TO_DAYS;
