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
});
