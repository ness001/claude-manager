// Tests for PluginAgentsTab.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PluginAgentsTab } from "../../../src/components/plugins/PluginAgentsTab";

describe("PluginAgentsTab", () => {
  afterEach(() => cleanup());

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<PluginAgentsTab agents={[]} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("renders agent rows with model + tools", () => {
    render(
      <PluginAgentsTab
        agents={[
          {
            name: "agent-1",
            description: "the agent",
            model: "claude-sonnet-4-6",
            tools: ["Read", "Bash"],
          },
        ]}
      />,
    );
    const rows = screen.getAllByTestId("agent-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("agent-1");
    expect(screen.getByTestId("agent-model").textContent).toContain(
      "claude-sonnet-4-6",
    );
    expect(screen.getByTestId("agent-tools").textContent).toContain(
      "Read, Bash",
    );
  });

  it("empty list shows the empty message", () => {
    render(<PluginAgentsTab agents={[]} />);
    expect(screen.getByTestId("agents-empty")).toBeInTheDocument();
  });
});
