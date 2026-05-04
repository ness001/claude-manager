// Tests for PluginSkillsTab.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PluginSkillsTab } from "../../../src/components/plugins/PluginSkillsTab";

describe("PluginSkillsTab", () => {
  afterEach(() => cleanup());

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<PluginSkillsTab skills={[]} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("renders one row per skill", () => {
    render(
      <PluginSkillsTab
        skills={[
          { name: "s1", description: "first skill" },
          { name: "s2", description: "second skill" },
        ]}
      />,
    );
    const rows = screen.getAllByTestId("skill-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("s1");
    expect(rows[0].textContent).toContain("first skill");
  });

  it("empty list shows the empty message", () => {
    render(<PluginSkillsTab skills={[]} />);
    expect(screen.getByTestId("skills-empty")).toBeInTheDocument();
  });
});
