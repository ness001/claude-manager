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

  // a11y: see PluginSkillsTab counterpart. Mirrors PRs #154/#155/#207/#212/#213.
  it("empty state is a polite live region (a11y: tab-load announce)", () => {
    render(<PluginAgentsTab agents={[]} />);
    const empty = screen.getByTestId("agents-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  // WCAG 1.3.1 (Info and Relationships): "model: <value>" and "tools:
  // <value>" are key/value pairs. The previous flat-<span> rendering hid
  // that relationship from AT — SR users heard one undifferentiated string.
  // <dl>/<dt>/<dd> exposes the term-description association so screen
  // readers can announce them as discrete pairs and navigate them via the
  // rotor. Mirrors PR #199 (PluginHooksTab event/command).
  it("model + tools render as <dl>/<dt>/<dd> term-description pairs (WCAG 1.3.1)", () => {
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
    const model = screen.getByTestId("agent-model");
    const tools = screen.getByTestId("agent-tools");
    // Each pair lives inside a <dl> and uses <dt> for the term, <dd> for
    // the value. Querying via tagName keeps the assertion semantic-pure.
    expect(model.closest("dl")).not.toBeNull();
    expect(tools.closest("dl")).not.toBeNull();
    expect(model.querySelector("dt")?.textContent).toBe("model:");
    expect(model.querySelector("dd")?.textContent).toBe("claude-sonnet-4-6");
    expect(tools.querySelector("dt")?.textContent).toBe("tools:");
    expect(tools.querySelector("dd")?.textContent).toBe("Read, Bash");
  });

  // The <dl> wrapper must not appear when neither model nor tools is set —
  // an empty key/value list announces nothing useful and just creates an
  // extra DOM landmark for SR users to step through.
  it("does not render the <dl> when neither model nor tools is set", () => {
    render(
      <PluginAgentsTab
        agents={[
          {
            name: "agent-bare",
            description: "no model, no tools",
          },
        ]}
      />,
    );
    const row = screen.getByTestId("agent-row");
    expect(row.querySelector("dl")).toBeNull();
  });
});
