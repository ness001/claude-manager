// Model usage donut — see spec §4.1 Row 2 (right).
//
// CSS conic-gradient donut (no Recharts dependency for this one — keeps the
// layout cheap and theme-aware). Below the donut is a legend with each model
// name, its share, and absolute token count.

import { useMemo } from "react";

import type { ModelUsageEntry } from "../../stores/dashboard-store";

interface ModelDonutProps {
  data: ModelUsageEntry[];
}

/** Palette resolved via CSS vars so dark/light parity is automatic. */
const SEGMENT_VARS = [
  "var(--color-accent)",
  "var(--color-status-blue)",
  "var(--color-status-green)",
  "var(--color-status-yellow)",
  "var(--color-status-red)",
  "var(--color-text-muted)",
];

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function ModelDonut({ data }: ModelDonutProps) {
  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.tokens, 0),
    [data],
  );

  // Build the conic-gradient string: "color 0% 25%, color 25% 60%, ..."
  const conic = useMemo(() => {
    if (total === 0) return "var(--color-bg-tertiary)";
    let acc = 0;
    const stops: string[] = [];
    data.forEach((d, i) => {
      const slice = (d.tokens / total) * 100;
      const start = acc;
      const end = acc + slice;
      acc = end;
      stops.push(
        `${SEGMENT_VARS[i % SEGMENT_VARS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`,
      );
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [data, total]);

  const isEmpty = data.length === 0 || total === 0;

  return (
    <div
      data-testid="model-donut"
      data-empty={isEmpty ? "true" : "false"}
      className="flex h-full min-h-[240px] flex-col gap-3 rounded-md border border-border bg-card-bg p-4"
    >
      <div className="text-xs uppercase tracking-wide text-text-muted">
        Model Usage
      </div>

      <div className="flex flex-1 items-center gap-4">
        {isEmpty ? (
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-bg-tertiary text-xs text-text-muted">
            No data
          </div>
        ) : (
          <div
            data-testid="donut-chart"
            style={{ background: conic }}
            className="relative h-32 w-32 shrink-0 rounded-full"
          >
            {/* Hole — same color as the card background. */}
            <div className="absolute inset-3 rounded-full bg-card-bg flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs text-text-muted">Total</div>
                <div className="text-sm font-semibold text-text-primary tabular-nums">
                  {formatTokens(total)}
                </div>
              </div>
            </div>
          </div>
        )}

        <ul
          data-testid="donut-legend"
          className="flex-1 flex flex-col gap-1 text-xs min-w-0"
        >
          {data.map((d, i) => {
            const color = SEGMENT_VARS[i % SEGMENT_VARS.length];
            return (
              <li
                key={d.model}
                data-testid="donut-legend-item"
                className="flex items-center gap-2 min-w-0"
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: color }}
                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                />
                <span className="truncate text-text-secondary flex-1">
                  {d.model}
                </span>
                <span className="text-text-muted tabular-nums">
                  {formatTokens(d.tokens)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
