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

  // a11y: plugin tabs are async-rendered (skills/hooks/agents data loads
  // when the user clicks into a plugin). Empty-state text appears in-place
  // without any AT cue. role="status" + aria-live="polite" makes screen
  // readers announce "No skills bundled." when the tab populates. Mirrors
  // the live-region family used in PRs #154/#155/#207/#212/#213.
  it("empty state is a polite live region (a11y: tab-load announce)", () => {
    render(<PluginSkillsTab skills={[]} />);
    const empty = screen.getByTestId("skills-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  // Layout + UX truncation recovery: long bundled-skill names regularly
  // run 60+ chars and used to wrap onto multiple lines, breaking the
  // skill-row card layout. `truncate` keeps the row to one line; the
  // matching `title` lets sighted users hover to read the hidden tail.
  // Same family as PR #225 (PluginAgentsTab name) and the broader
  // truncation-recovery sweep (#167/#170/#171/#175/#223/#224 + PluginCard
  // + SkillCard name).
  it("skill name span has truncate + title for layout/UX recovery", () => {
    const longName =
      "anthropic-experimental-conversational-memory-with-vector-embeddings-skill";
    render(
      <PluginSkillsTab skills={[{ name: longName, description: "x" }]} />,
    );
    const span = screen.getByTestId("skill-name");
    expect(span.className).toContain("truncate");
    expect(span.getAttribute("title")).toBe(longName);
    expect(span.textContent).toBe(longName);
  });
});
