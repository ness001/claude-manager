// Tests for StatCard — T2.12 case "renders value + label + accent stripe;
// verify each of 4 colors (green / blue / yellow / mauve)".

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatCard, type StatAccent } from "../../../src/components/dashboard/StatCard";

afterEach(() => cleanup());

function withConsoleErrors(fn: () => void): unknown[] {
  const errs: unknown[] = [];
  const orig = console.error;
  console.error = (...a) => {
    errs.push(a);
    orig(...a);
  };
  try {
    fn();
  } finally {
    console.error = orig;
  }
  return errs;
}

describe("StatCard", () => {
  it("mounts without console errors", () => {
    expect(
      withConsoleErrors(() =>
        render(<StatCard value={42} label="Sessions" accent="green" />),
      ),
    ).toEqual([]);
  });

  it("renders value and label", () => {
    render(<StatCard value={123} label="Total Messages" accent="blue" />);
    expect(screen.getByTestId("stat-value").textContent).toBe("123");
    expect(screen.getByText("Total Messages")).toBeInTheDocument();
  });

  it("renders sublabel when provided (Longest Session use case)", () => {
    render(
      <StatCard value={89} label="Longest Session" accent="yellow" sublabel="my-session" />,
    );
    expect(screen.getByTestId("stat-sublabel").textContent).toBe("my-session");
  });

  const accentCases: Array<{ accent: StatAccent; cssVar: string }> = [
    { accent: "green", cssVar: "--color-status-green" },
    { accent: "blue", cssVar: "--color-status-blue" },
    { accent: "yellow", cssVar: "--color-status-yellow" },
    { accent: "mauve", cssVar: "--color-accent" },
  ];
  it.each(accentCases)(
    "accent stripe uses CSS var for $accent (theme-aware)",
    ({ accent, cssVar }) => {
      render(<StatCard value={1} label="x" accent={accent} />);
      const stripe = screen.getByTestId("stat-accent");
      // Inline style should reference the CSS var so dark/light parity holds.
      expect(stripe.getAttribute("style")).toContain(`var(${cssVar})`);
      const card = screen.getByTestId("stat-card");
      expect(card.getAttribute("data-accent")).toBe(accent);
    },
  );

  // WCAG 1.4.3 (large-text contrast ≥3:1): the stripe yellow #eab308 on the
  // light card-bg #ffffff is only ~1.6:1, so the value text MUST use the
  // darker `--color-status-yellow-text` token (#a16207 light) instead. The
  // stripe is decorative (aria-hidden) and may stay vivid.
  it("yellow accent value text uses --color-status-yellow-text (not the stripe yellow)", () => {
    render(<StatCard value={42} label="Longest Session" accent="yellow" />);
    const valueStyle = screen.getByTestId("stat-value").getAttribute("style") ?? "";
    expect(valueStyle).toContain("var(--color-status-yellow-text)");
    // Must NOT reference the bare stripe yellow var (it's #eab308 — fails contrast).
    expect(valueStyle).not.toMatch(/var\(--color-status-yellow\)/);
  });

  // UX bug: the sublabel div has `truncate` but no `title`, so a long
  // session name (the "Longest Session" use case) gets clipped with no
  // recovery — sighted users have no way to read the hidden tail. Mirror
  // the visible string into `title`. Mirrors PR #167 (SkillCard), PR #170
  // (RecentSessions), PR #171 (SystemHealth), PR #175 (SessionCard),
  // PR #176 (PluginCard).
  it("sublabel mirrors its visible text into the `title` attribute (UX truncation recovery)", () => {
    const longName =
      "Refactor authentication middleware to support multiple OIDC providers and migrate session storage to Redis";
    render(
      <StatCard
        value={89}
        label="Longest Session"
        accent="yellow"
        sublabel={longName}
      />,
    );
    const sub = screen.getByTestId("stat-sublabel");
    expect(sub.className).toContain("truncate");
    expect(sub.getAttribute("title")).toBe(longName);
  });

  // WCAG 1.3.1 / 4.1.2 — the StatCard visually composes value + label
  // (+ sublabel) into one tile, but the DOM is three separate divs with
  // no programmatic linkage. AT users walking the dashboard heard
  // "42 … Phase 2 work … Active Since" in DOM order — value first with
  // no context, label LAST. Promote the root to `role="group"` with an
  // `aria-label` that combines the parts in natural reading order so SR
  // users get one coherent announcement per tile.
  it("root has role='group' with an aria-label combining label + value (WCAG 1.3.1 / 4.1.2)", () => {
    render(<StatCard value={42} label="Sessions" accent="green" />);
    const card = screen.getByTestId("stat-card");
    expect(card.getAttribute("role")).toBe("group");
    expect(card.getAttribute("aria-label")).toBe("Sessions: 42");
  });

  it("aria-label appends the sublabel when present (Longest Session use case)", () => {
    render(
      <StatCard
        value={89}
        label="Longest Session"
        accent="yellow"
        sublabel="my-session"
      />,
    );
    expect(
      screen.getByTestId("stat-card").getAttribute("aria-label"),
    ).toBe("Longest Session: 89 — my-session");
  });

  // Coercion: ReactNode value is forced to a string. The two non-numeric
  // call sites pass formatted date strings ("Active Since"), so verify a
  // string value flows through unchanged.
  it("aria-label coerces a string value through verbatim (Active Since use case)", () => {
    render(
      <StatCard value={"3 days ago"} label="Active Since" accent="mauve" />,
    );
    expect(
      screen.getByTestId("stat-card").getAttribute("aria-label"),
    ).toBe("Active Since: 3 days ago");
  });
});
