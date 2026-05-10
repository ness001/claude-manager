// Tests for PluginCard — covers §6.4 status colors, §6.5 broken/disabled
// rendering, and the toggle → store wiring.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PluginCard } from "../../../src/components/plugins/PluginCard";
import { usePluginStore } from "../../../src/stores/plugin-store";
import type {
  PluginMeta,
  PluginState,
} from "../../../src/lib/plugin-types";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function makePlugin(overrides: Partial<PluginMeta> = {}): PluginMeta {
  return {
    name: "alpha",
    marketplace: "official",
    version: "1.0.0",
    gitCommitSha: "0".repeat(40),
    description: "the alpha plugin",
    installPath: "/cache/official/alpha/1.0.0",
    state: "active",
    skillCount: 2,
    agentCount: 1,
    hookCount: 0,
    hasClaudeMd: false,
    ...overrides,
  };
}

describe("PluginCard", () => {
  beforeEach(() => {
    usePluginStore.setState({
      plugins: [],
      selectedPlugin: null,
      searchQuery: "",
      isLoading: false,
      error: null,
    });
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<PluginCard plugin={makePlugin()} selected={false} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  const stateCases: Array<{ state: PluginState; bg: string }> = [
    { state: "active", bg: "bg-status-green" },
    { state: "disabled", bg: "bg-text-muted" },
    { state: "broken", bg: "bg-status-red" },
    { state: "orphaned", bg: "bg-status-yellow" },
    { state: "update-available", bg: "bg-status-amber" },
  ];
  it.each(stateCases)("status dot color — $state", ({ state, bg }) => {
    render(<PluginCard plugin={makePlugin({ state })} selected={false} />);
    const dot = screen.getByTestId("status-dot");
    expect(dot.className).toContain(bg);
  });

  // WCAG 1.4.1 (Use of Color) + 4.1.2 (Name, Role, Value): the colored dot
  // is the only state indicator for active/disabled/broken/orphaned. Mirror
  // SessionCard (PR #41): role="img" + per-state aria-label.
  const ariaCases: Array<{ state: PluginState; label: string }> = [
    { state: "active", label: "Active" },
    { state: "disabled", label: "Disabled" },
    { state: "broken", label: "Broken" },
    { state: "orphaned", label: "Orphaned" },
    { state: "update-available", label: "Update available" },
  ];
  it.each(ariaCases)(
    "status dot exposes state to assistive tech — $state",
    ({ state, label }) => {
      render(<PluginCard plugin={makePlugin({ state })} selected={false} />);
      const dot = screen.getByTestId("status-dot");
      expect(dot.getAttribute("role")).toBe("img");
      expect(dot.getAttribute("aria-label")).toBe(label);
    },
  );

  it("broken plugin renders red border + Reinstall/Remove buttons", () => {
    render(
      <PluginCard plugin={makePlugin({ state: "broken" })} selected={false} />,
    );
    const card = screen.getByTestId("plugin-card");
    expect(card.className).toContain("border-status-red");
    expect(screen.getByTestId("broken-warning")).toBeInTheDocument();
    expect(screen.getByTestId("reinstall-btn")).toBeInTheDocument();
    expect(screen.getByTestId("remove-btn")).toBeInTheDocument();
  });

  // Reinstall has no IPC backing yet — render it disabled with an
  // explanatory tooltip rather than as a clickable lie.
  it("Reinstall button is disabled with an explanatory title (no IPC backing yet)", () => {
    render(
      <PluginCard plugin={makePlugin({ state: "broken" })} selected={false} />,
    );
    const btn = screen.getByTestId("reinstall-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title.length).toBeGreaterThan(0);
    expect(btn.title.toLowerCase()).toContain("not yet wired");
  });

  // Same treatment for Remove — no `claude plugin uninstall` IPC yet.
  it("Remove button is disabled with an explanatory title (no IPC backing yet)", () => {
    render(
      <PluginCard plugin={makePlugin({ state: "broken" })} selected={false} />,
    );
    const btn = screen.getByTestId("remove-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title.length).toBeGreaterThan(0);
    expect(btn.title.toLowerCase()).toContain("not yet wired");
  });

  it("disabled plugin renders 70% opacity (opacity-70 utility)", () => {
    render(
      <PluginCard
        plugin={makePlugin({ state: "disabled" })}
        selected={false}
      />,
    );
    const card = screen.getByTestId("plugin-card");
    expect(card.className).toContain("opacity-70");
  });

  it("toggle switch click → calls store togglePlugin once", async () => {
    const meta = makePlugin({ state: "active" });
    usePluginStore.setState({ plugins: [meta] });
    render(<PluginCard plugin={meta} selected={false} />);
    const toggle = screen.getByTestId("enable-toggle");
    fireEvent.click(toggle);
    // togglePlugin calls invoke("write_plugin_enabled", ...)
    await Promise.resolve();
    await Promise.resolve();
    const writes = invokeMock.mock.calls.filter(
      (c) => c[0] === "write_plugin_enabled",
    );
    expect(writes).toHaveLength(1);
  });

  it("update-available shows the Update pill alongside the version pill", () => {
    render(
      <PluginCard
        plugin={makePlugin({ state: "update-available" })}
        selected={false}
      />,
    );
    expect(screen.getByTestId("version-pill")).toBeInTheDocument();
    expect(screen.getByTestId("update-pill")).toBeInTheDocument();
  });

  // WCAG 2.4.7 (Focus Visible): the card body button is the keyboard target
  // for selecting a plugin. Without focus-visible:ring, tabbing through the
  // plugin list gives no indication of the current row. Mirrors the family
  // of focus-ring fixes in PRs #17/#45/#48/#49/#56.
  it("card body button has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<PluginCard plugin={makePlugin()} selected={false} />);
    const body = screen.getByTestId("plugin-card-body");
    expect(body.className).toContain("focus-visible:ring-2");
    expect(body.className).toContain("focus-visible:ring-accent");
  });

  // WCAG 4.1.2 Name, Role, Value — the enable/disable switch had role="switch"
  // and aria-checked but no accessible name. Screen readers announced "switch,
  // on" with no indication of WHAT the switch controls. Per ARIA APG (Switch
  // pattern), every switch must have an accessible name. Use the plugin name
  // and an action verb that flips with state so the announcement is unambiguous.
  it("enable toggle has an accessible name that includes the plugin name (WCAG 4.1.2)", () => {
    const active = makePlugin({ name: "my-plugin", state: "active" });
    render(<PluginCard plugin={active} selected={false} />);
    const toggle = screen.getByTestId("enable-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Disable my-plugin");
  });

  it("enable toggle aria-label flips when the plugin is currently disabled (WCAG 4.1.2)", () => {
    const disabled = makePlugin({ name: "other-plugin", state: "disabled" });
    render(<PluginCard plugin={disabled} selected={false} />);
    const toggle = screen.getByTestId("enable-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Enable other-plugin");
  });

  // WCAG 2.4.7 (Focus Visible): the enable/disable switch is keyboard-
  // focusable but had no focus-visible ring at all — Tab into it and the
  // cursor disappears for keyboard users. When toggleOn the bar itself is
  // accent-purple, so a plain accent ring would blend in; we need the
  // offset trio (matches #117 / #118 / #119).
  it("enable toggle has a visible focus ring with offset (WCAG 2.4.7)", () => {
    render(<PluginCard plugin={makePlugin({ state: "active" })} selected={false} />);
    const toggle = screen.getByTestId("enable-toggle");
    expect(toggle.className).toContain("focus-visible:outline-none");
    expect(toggle.className).toContain("focus-visible:ring-2");
    expect(toggle.className).toContain("focus-visible:ring-accent");
    expect(toggle.className).toContain("focus-visible:ring-offset-2");
    expect(toggle.className).toContain("focus-visible:ring-offset-bg-primary");
  });

  // CLAUDE.md R2 (Orphan-placeholder rule): every disabled stub must declare
  // its wire-up tracker inline so the placeholder isn't an undiscoverable
  // orphan. The Reinstall + Remove buttons in PluginCard are disabled until
  // the `claude plugins install/uninstall` IPC ships; both must reference
  // the open tracker in docs/superpowers/plans/2026-05-08-ui-defect-sweep.md
  // (lines 293–294). Mirrors PR #105 (QuickActions).
  it("PluginCard source has R2 wire-up TODOs for the Reinstall + Remove stubs", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/components/plugins/PluginCard.tsx"),
      "utf8",
    );
    expect(src).toMatch(/TODO\(ui-defect-sweep#L293\)[\s\S]*Reinstall/);
    expect(src).toMatch(/TODO\(ui-defect-sweep#L294\)[\s\S]*Remove/);
  });
});
