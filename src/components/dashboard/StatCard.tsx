// One stat tile — see spec §4.1 Row 1.
//
// Displays a large value, a label, and a colored accent stripe. The accent
// color is chosen by `accent` (one of four spec values) and resolved to a CSS
// var so it switches with the theme.

import type { ReactNode } from "react";

/** Accent colors per spec §4.1 Row 1 (Sessions / Messages / Longest / Active Since). */
export type StatAccent = "green" | "blue" | "yellow" | "mauve";

interface StatCardProps {
  /** Big value (string or number) shown prominently. */
  value: ReactNode;
  /** Short caption below the value. */
  label: string;
  /** Accent stripe + value tint color. */
  accent: StatAccent;
  /** Optional secondary line (used by "Longest Session" to show the name). */
  sublabel?: string;
}

/**
 * Map spec accents to existing CSS vars defined in src/index.css. We avoid
 * hard-coded hex so dark/light theme parity is automatic.
 *   green  → --color-status-green
 *   blue   → --color-status-blue
 *   yellow → --color-status-yellow
 *   mauve  → --color-accent  (the only mauve token in the design system)
 */
const ACCENT_VAR: Record<StatAccent, string> = {
  green: "var(--color-status-green)",
  blue: "var(--color-status-blue)",
  yellow: "var(--color-status-yellow)",
  mauve: "var(--color-accent)",
};

export function StatCard({ value, label, accent, sublabel }: StatCardProps) {
  const color = ACCENT_VAR[accent];
  return (
    <div
      data-testid="stat-card"
      data-accent={accent}
      className="relative flex flex-col gap-1 rounded-md border border-border bg-card-bg p-4 overflow-hidden"
    >
      {/* Left accent stripe — 4px wide, full height. */}
      <span
        data-testid="stat-accent"
        aria-hidden="true"
        style={{ backgroundColor: color }}
        className="absolute left-0 top-0 h-full w-1"
      />
      <div
        data-testid="stat-value"
        style={{ color }}
        className="text-2xl font-semibold tabular-nums"
      >
        {value}
      </div>
      {sublabel && (
        <div
          data-testid="stat-sublabel"
          className="text-xs text-text-secondary truncate"
        >
          {sublabel}
        </div>
      )}
      <div className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </div>
    </div>
  );
}
