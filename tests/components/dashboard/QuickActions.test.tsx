// Tests for QuickActions — T2.12.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { QuickActions } from "../../../src/components/dashboard/QuickActions";

afterEach(() => cleanup());

describe("QuickActions", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<QuickActions />);
    } finally {
      console.error = orig;
    }
    expect(errs).toEqual([]);
  });

  it("renders 4 buttons present and disabled (handlers deferred to later phase)", () => {
    render(<QuickActions />);
    expect(screen.getByTestId("action-new-session")).toBeInTheDocument();
    expect(screen.getByTestId("action-resume-latest")).toBeInTheDocument();
    expect(screen.getByTestId("action-open-cwd")).toBeInTheDocument();
    expect(screen.getByTestId("action-rebuild-stats")).toBeInTheDocument();
    // All four buttons exist.
    const root = screen.getByTestId("quick-actions");
    const buttons = root.querySelectorAll("button");
    expect(buttons).toHaveLength(4);
    // Buttons are disabled until handler wiring lands.
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it("New Session button uses the prominent accent variant", () => {
    render(<QuickActions />);
    const btn = screen.getByTestId("action-new-session");
    expect(btn.className).toContain("bg-accent");
  });

  // WCAG 4.1.2 (Name, Role, Value): each button already carries its label as
  // text content, so the leading lucide icon is decorative — without
  // aria-hidden, screen readers may announce the SVG's computed name (e.g.
  // "Plus") redundantly with the button text.
  it("decorative icons are hidden from assistive tech (aria-hidden)", () => {
    render(<QuickActions />);
    const ids = [
      "action-new-session",
      "action-resume-latest",
      "action-open-cwd",
      "action-rebuild-stats",
    ];
    for (const id of ids) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("section label uses an <h3> heading (WCAG 1.3.1 / 2.4.6)", () => {
    // Defect: visual section label rendered as a <div>, so screen-reader
    // users couldn't navigate to it via the headings list. Mirrors PR #61
    // (SystemHealth) and PR #63 (ModelDonut).
    render(<QuickActions />);
    const heading = screen.getByRole("heading", { name: "Quick Actions", level: 3 });
    expect(heading.tagName).toBe("H3");
  });
});
