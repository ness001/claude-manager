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
  // Round into the unit before deciding which suffix to use, otherwise the
  // boundary cases (e.g. 999_999 → "1000.0k", 999_999_999 → "1000.0M") leak
  // a "1000.0X" string. 999.95 is the largest value that still rounds to
  // "999.9" at one decimal — anything above promotes to the next unit.
  const k = n / 1000;
  if (k < 999.95) return `${k.toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a slice's share of the donut as a percent string. Spec §4.1 Row 2
 * requires the legend to show "model name, its share, and absolute token
 * count" — the share was missing. Tiny non-zero slices (< 0.05%) round to
 * "0.0%" with one decimal, which falsely reads as nothing. Surface them as
 * "<0.1%" instead so the user sees the slice exists but is negligible.
 */
function formatShare(tokens: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (tokens / total) * 100;
  if (pct > 0 && pct < 0.05) return "<0.1%";
  return `${pct.toFixed(1)}%`;
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
      <h3 className="text-xs uppercase tracking-wide text-text-muted">
        Model Usage
      </h3>

      <div className="flex flex-1 items-center gap-4">
        {isEmpty ? (
          <div
            role="img"
            aria-label="No model usage data"
            className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-bg-tertiary text-xs text-text-muted"
          >
            No data
          </div>
        ) : (
          <div
            data-testid="donut-chart"
            role="img"
            aria-label={`Model usage donut: ${data.length} ${data.length === 1 ? "model" : "models"}, ${formatTokens(total)} total tokens`}
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
                <span
                  data-testid="donut-legend-share"
                  className="text-text-muted tabular-nums"
                >
                  {formatShare(d.tokens, total)}
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
