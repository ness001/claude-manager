// Tests for ModelDonut — T2.12.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ModelDonut } from "../../../src/components/dashboard/ModelDonut";

afterEach(() => cleanup());

describe("ModelDonut", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<ModelDonut data={[]} />);
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("renders empty state when data is empty", () => {
    render(<ModelDonut data={[]} />);
    expect(screen.getByTestId("model-donut").getAttribute("data-empty")).toBe("true");
    expect(screen.queryByTestId("donut-chart")).toBeNull();
  });

  it("legend shows model names + token counts (case)", () => {
    render(
      <ModelDonut
        data={[
          { model: "claude-opus-4.6", tokens: 12000 },
          { model: "claude-sonnet-4.6", tokens: 500 },
        ]}
      />,
    );
    const items = screen.getAllByTestId("donut-legend-item");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("claude-opus-4.6");
    // 12000 → "12.0k"
    expect(items[0].textContent).toContain("12.0k");
    expect(items[1].textContent).toContain("claude-sonnet-4.6");
    expect(items[1].textContent).toContain("500");
  });

  it("legend list has an accessible name (WCAG 2.4.6 / 1.3.1)", () => {
    render(
      <ModelDonut
        data={[{ model: "claude-opus-4.6", tokens: 100 }]}
      />,
    );
    const legend = screen.getByTestId("donut-legend");
    expect(legend.tagName).toBe("UL");
    expect(legend.getAttribute("aria-label")).toBe("Model usage breakdown");
  });

  it("conic-gradient style applied to the donut element", () => {
    render(
      <ModelDonut
        data={[
          { model: "a", tokens: 50 },
          { model: "b", tokens: 50 },
        ]}
      />,
    );
    const donut = screen.getByTestId("donut-chart");
    const style = donut.getAttribute("style") ?? "";
    expect(style).toContain("conic-gradient");
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6)", () => {
    // Defect: visual section label rendered as a <div>, so screen-reader
    // users couldn't navigate to it via the headings list. Mirrors PR #61
    // (SystemHealth) and PR #52 (SessionListPanel group headers).
    render(<ModelDonut data={[]} />);
    const heading = screen.getByRole("heading", { name: "Model Usage", level: 3 });
    expect(heading.tagName).toBe("H3");
  });

  // Boundary regression: token formatter promoted into the wrong unit at the
  // edge of each magnitude. 999_999 was rendering as "1000.0k" instead of
  // "1.0M" because the threshold check happened before rounding to one decimal.
  it.each([
    { tokens: 999, expected: "999" },
    { tokens: 1000, expected: "1.0k" },
    { tokens: 999_499, expected: "999.5k" },
    { tokens: 999_999, expected: "1.0M" }, // <-- previously "1000.0k"
    { tokens: 1_000_000, expected: "1.0M" },
    { tokens: 12_500_000, expected: "12.5M" },
  ])("legend formats $tokens tokens as $expected", ({ tokens, expected }) => {
    render(<ModelDonut data={[{ model: "m", tokens }]} />);
    const item = screen.getByTestId("donut-legend-item");
    expect(item.textContent).toContain(expected);
    // Specifically guard against the "1000.0k" leak.
    if (expected === "1.0M") {
      expect(item.textContent).not.toContain("1000.0k");
    }
  });

  // Spec §4.1 Row 2 — the legend is required to show "model name, its
  // share, and absolute token count". The share (percentage) was missing,
  // so users had to mentally divide tokens / total to know that
  // claude-opus = "1.4M of 2.0M total" was 70%. SR users had no access
  // at all (the donut's aria-label only reports model count + total).
  // Add a `donut-legend-share` span that renders the per-slice percent.
  it("legend shows the per-slice share as a percentage (spec §4.1 Row 2)", () => {
    render(
      <ModelDonut
        data={[
          { model: "claude-opus-4.6", tokens: 700 },
          { model: "claude-sonnet-4.6", tokens: 300 },
        ]}
      />,
    );
    const shares = screen.getAllByTestId("donut-legend-share");
    expect(shares).toHaveLength(2);
    expect(shares[0].textContent).toBe("70.0%");
    expect(shares[1].textContent).toBe("30.0%");
  });

  // Boundary: a tiny non-zero slice (e.g. 1 token out of 100_000) computes
  // to 0.001%, which rounds to "0.0%" with one decimal — falsely reading
  // as "this slice is nothing". Surface as "<0.1%" so the user sees the
  // slice exists but is negligible.
  it("legend shows '<0.1%' for a tiny non-zero slice (rounding floor)", () => {
    render(
      <ModelDonut
        data={[
          { model: "main", tokens: 99_999 },
          { model: "trace", tokens: 1 },
        ]}
      />,
    );
    const shares = screen.getAllByTestId("donut-legend-share");
    expect(shares[1].textContent).toBe("<0.1%");
    // And the main slice is announced normally.
    expect(shares[0].textContent).toBe("100.0%");
  });

  // The shares MUST sum to ~100% so the user can sanity-check the donut.
  // (Floating-point rounding may cost ±0.1, which is acceptable.)
  it("legend shares sum to ~100% across all slices", () => {
    render(
      <ModelDonut
        data={[
          { model: "a", tokens: 333 },
          { model: "b", tokens: 333 },
          { model: "c", tokens: 334 },
        ]}
      />,
    );
    const shares = screen.getAllByTestId("donut-legend-share");
    const sum = shares.reduce(
      (s, el) => s + parseFloat(el.textContent!.replace("%", "")),
      0,
    );
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.2);
  });

  // WCAG 1.1.1 (Non-text Content): the donut is a CSS conic-gradient div
  // — pure visual data with no programmatic equivalent. Screen-reader users
  // need an aria-label summarizing what the chart shows. The legend is
  // text-readable but isn't programmatically linked to the chart, so AT
  // landing on the donut alone (e.g. via headings nav into the section)
  // would otherwise hear nothing.
  it("donut chart exposes role='img' and an aria-label summarizing the data", () => {
    render(
      <ModelDonut
        data={[
          { model: "claude-opus-4.6", tokens: 12000 },
          { model: "claude-sonnet-4.6", tokens: 500 },
          { model: "claude-haiku-4.5", tokens: 250 },
        ]}
      />,
    );
    const donut = screen.getByTestId("donut-chart");
    expect(donut).toHaveAttribute("role", "img");
    const label = donut.getAttribute("aria-label") ?? "";
    // Mentions the model count + plural noun + total tokens (formatted).
    expect(label).toMatch(/3 models/);
    expect(label).toMatch(/12\.8k/);
    expect(label).toMatch(/total/i);
  });

  it("donut chart aria-label uses singular noun when only one model is present", () => {
    render(<ModelDonut data={[{ model: "claude-opus-4.6", tokens: 1000 }]} />);
    const donut = screen.getByTestId("donut-chart");
    expect(donut.getAttribute("aria-label")).toMatch(/1 model[^s]/);
  });

  it("empty state exposes role='img' with an aria-label so AT users know it's intentionally empty", () => {
    render(<ModelDonut data={[]} />);
    // The visual "No data" circle stands in for the donut. AT users would
    // otherwise hear only the section heading and skip past silently.
    const empty = screen.getByRole("img", { name: "No model usage data" });
    expect(empty).toBeInTheDocument();
  });

  // UX truncation recovery: model identifiers like
  // "claude-opus-4-5-20251101" routinely overflow the legend column and
  // get clipped by `truncate` with no way to recover the hidden tail.
  // Mirror the visible string into `title` so a hover tooltip shows the
  // full id. Mirrors the truncate+title family (PRs #167, #170, #171,
  // #175, #176, #179, #185).
  it("legend model name span mirrors its visible text into the `title` attribute", () => {
    const longModel = "claude-opus-4-5-20251101-extended-thinking-preview";
    render(<ModelDonut data={[{ model: longModel, tokens: 1234 }]} />);
    const item = screen.getByTestId("donut-legend-item");
    const nameSpan = item.querySelector("span.truncate") as HTMLElement | null;
    expect(nameSpan).not.toBeNull();
    expect(nameSpan!.textContent).toBe(longModel);
    expect(nameSpan!.getAttribute("title")).toBe(longModel);
  });
});
