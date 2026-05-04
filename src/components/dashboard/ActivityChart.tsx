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
}

type SeriesMode = "messages" | "toolCalls";

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

export function ActivityChart({ data }: ActivityChartProps) {
  const [period, setPeriod] = useState<ActivityPeriod>("7d");
  const [series, setSeries] = useState<SeriesMode>("messages");

  // Memoize the sliced series — re-computed only when input or period flips.
  // Spec perf budget §T2.12: re-render on period toggle < 50ms.
  const sliced = useMemo(() => sliceTrailing(data, period), [data, period]);

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
