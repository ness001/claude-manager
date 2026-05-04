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

  it("renders 4 buttons present and clickable", () => {
    render(<QuickActions />);
    expect(screen.getByTestId("action-new-session")).toBeInTheDocument();
    expect(screen.getByTestId("action-resume-latest")).toBeInTheDocument();
    expect(screen.getByTestId("action-open-cwd")).toBeInTheDocument();
    expect(screen.getByTestId("action-rebuild-stats")).toBeInTheDocument();
    // All four buttons exist.
    const root = screen.getByTestId("quick-actions");
    expect(root.querySelectorAll("button")).toHaveLength(4);
  });

  it("New Session button uses the prominent accent variant", () => {
    render(<QuickActions />);
    const btn = screen.getByTestId("action-new-session");
    expect(btn.className).toContain("bg-accent");
  });
});
