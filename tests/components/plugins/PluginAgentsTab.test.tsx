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

  // WCAG 2.4.6 / 1.3.1 — bare <ul> is "list, N items" in the SR rotor
  // with no collection name. aria-label promotes it to a recognizably
  // named landmark. Mirrors PR #235 (SkillsListView grid → "Skills"),
  // PR #236 (PluginListView grid → "Plugins").
  it("agents list has aria-label 'Bundled agents'", () => {
    render(
      <PluginAgentsTab agents={[{ name: "a1", description: "d" }]} />,
    );
    const list = screen.getByTestId("agents-list");
    expect(list.tagName).toBe("UL");
    expect(list.getAttribute("aria-label")).toBe("Bundled agents");
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

  // Layout + UX truncation recovery: long bundled-agent names (60+ chars
  // are common) used to wrap and break the card layout. `truncate` keeps
  // the row to one line; the matching `title` lets sighted users hover
  // to read the hidden tail. Same family as PR #167/#170/#171/#175/#223/
  // #224 + PluginCard name.
  it("agent name span has truncate + title for layout/UX recovery", () => {
    const longName =
      "anthropic-experimental-conversational-memory-with-vector-embeddings-agent";
    render(
      <PluginAgentsTab
        agents={[{ name: longName, description: "x" }]}
      />,
    );
    const span = screen.getByTestId("agent-name");
    expect(span.className).toContain("truncate");
    expect(span.getAttribute("title")).toBe(longName);
    expect(span.textContent).toBe(longName);
  });
});
