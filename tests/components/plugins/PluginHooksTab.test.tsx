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

  // WCAG 2.4.6 / 1.3.1 — bare <ul> is "list, N items" with no name.
  // Companion fix in this PR for PluginAgentsTab + PluginSkillsTab.
  it("hooks list has aria-label 'Bundled hooks'", () => {
    render(
      <PluginHooksTab hooks={[{ event: "SessionStart", command: "echo hi" }]} />,
    );
    const list = screen.getByTestId("hooks-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-label")).toBe("Bundled hooks");
  });

  // a11y: see PluginSkillsTab counterpart. Mirrors PRs #154/#155/#207/#212/#213.
  it("empty state is a polite live region (a11y: tab-load announce)", () => {
    render(<PluginHooksTab hooks={[]} />);
    const empty = screen.getByTestId("hooks-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  it("renders each hook as a <dl> term/description pair (WCAG 1.3.1)", () => {
    render(
      <PluginHooksTab
        hooks={[{ event: "SessionStart", command: "echo hi" }]}
      />,
    );
    const row = screen.getByTestId("hook-row");
    const dl = row.querySelector("dl");
    expect(dl).not.toBeNull();
    const dt = row.querySelector("dt");
    const dd = row.querySelector("dd");
    expect(dt?.textContent).toBe("SessionStart");
    expect(dd?.textContent).toBe("echo hi");
    // The command stays inside <code> for monospace semantics.
    expect(dd?.querySelector("code")?.textContent).toBe("echo hi");
  });
});
