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
});
