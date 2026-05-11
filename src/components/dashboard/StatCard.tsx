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

/**
 * Value-text color per accent. Diverges from ACCENT_VAR only for `yellow`,
 * because the stripe yellow (#eab308) on the white card-bg gives ~1.6:1
 * contrast — well below WCAG 1.4.3's 3:1 large-text floor. The stripe is
 * decorative (aria-hidden) so it can stay vivid; the value text needs the
 * darker `--color-status-yellow-text` to be readable in light mode.
 */
const VALUE_COLOR_VAR: Record<StatAccent, string> = {
  green: "var(--color-status-green)",
  blue: "var(--color-status-blue)",
  yellow: "var(--color-status-yellow-text)",
  mauve: "var(--color-accent)",
};

export function StatCard({ value, label, accent, sublabel }: StatCardProps) {
  const stripeColor = ACCENT_VAR[accent];
  const valueColor = VALUE_COLOR_VAR[accent];
  // Coherent SR announcement (WCAG 1.3.1 / 4.1.2): the card visually
  // composes value + label (+ sublabel) into one tile, but the DOM is three
  // separate divs with no programmatic linkage. AT users walking the
  // dashboard hear "42 … Phase 2 work … Active Since" in DOM order — value
  // first with no context, label LAST. Promote the root to `role="group"`
  // with an `aria-label` that combines the parts in natural reading order
  // ("Active Since: 42 — Phase 2 work") so SR users get one self-contained
  // announcement per tile. The visible layout is unchanged.
  //
  // ReactNode `value` is coerced to a string for the label — only the
  // primitive shapes used at the call sites (numbers, formatted date
  // strings) are supported here; if a caller passes a complex JSX value in
  // the future the label degrades to "[object Object]" which is still
  // better than the prior empty announcement.
  const valueText =
    value === null || value === undefined ? "" : String(value);
  const ariaLabel = sublabel
    ? `${label}: ${valueText} — ${sublabel}`
    : `${label}: ${valueText}`;
  return (
    <div
      data-testid="stat-card"
      data-accent={accent}
      role="group"
      aria-label={ariaLabel}
      className="relative flex flex-col gap-1 rounded-md border border-border bg-card-bg p-4 overflow-hidden"
    >
      {/* Left accent stripe — 4px wide, full height. */}
      <span
        data-testid="stat-accent"
        aria-hidden="true"
        style={{ backgroundColor: stripeColor }}
        className="absolute left-0 top-0 h-full w-1"
      />
      <div
        data-testid="stat-value"
        style={{ color: valueColor }}
        className="text-2xl font-semibold tabular-nums"
      >
        {value}
      </div>
      {sublabel && (
        <div
          data-testid="stat-sublabel"
          className="text-xs text-text-secondary truncate"
          title={sublabel}
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
