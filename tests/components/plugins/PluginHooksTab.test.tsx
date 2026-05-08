// Tests for PluginHooksTab.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PluginHooksTab } from "../../../src/components/plugins/PluginHooksTab";

describe("PluginHooksTab", () => {
  afterEach(() => cleanup());

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<PluginHooksTab hooks={[]} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("renders one row per hook", () => {
    render(
      <PluginHooksTab
        hooks={[
          { event: "SessionStart", command: "echo hi" },
          { event: "PreToolUse", command: "do something" },
        ]}
      />,
    );
    const rows = screen.getAllByTestId("hook-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("SessionStart");
    expect(rows[0].textContent).toContain("echo hi");
  });

  it("empty list shows the empty message", () => {
    render(<PluginHooksTab hooks={[]} />);
    expect(screen.getByTestId("hooks-empty")).toBeInTheDocument();
  });
});
