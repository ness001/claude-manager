// Tests for PluginListView — header counts, search, empty state copy
// (spec §17.6), and the Check-for-Updates handler invokes the IPC.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";

import { PluginListView } from "../../../src/components/plugins/PluginListView";
import { usePluginStore } from "../../../src/stores/plugin-store";
import { resetUpdateCache } from "../../../src/lib/plugin-updates";
import type { PluginMeta } from "../../../src/lib/plugin-types";

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
    description: "alpha description",
    installPath: "/cache/official/alpha/1.0.0",
    state: "active",
    skillCount: 0,
    agentCount: 0,
    hookCount: 0,
    hasClaudeMd: false,
    ...overrides,
  };
}

describe("PluginListView", () => {
  beforeEach(() => {
    usePluginStore.setState({
      plugins: [],
      selectedPlugin: null,
      searchQuery: "",
      isLoading: false,
      error: null,
    });
    invokeMock.mockReset();
    resetUpdateCache();
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
      render(<PluginListView />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("empty state copy matches spec §17.6", () => {
    render(<PluginListView />);
    const empty = screen.getByTestId("empty-state");
    expect(empty.textContent).toContain("No plugins installed");
    expect(empty.textContent).toContain("claude plugins install");
  });

  it("header stats reflect store contents", () => {
    usePluginStore.setState({
      plugins: [
        makePlugin({ name: "a", state: "active" }),
        makePlugin({ name: "b", state: "active" }),
        makePlugin({ name: "c", state: "disabled" }),
        makePlugin({ name: "d", state: "broken" }),
      ],
    });
    render(<PluginListView />);
    expect(screen.getByTestId("stat-installed").textContent).toBe("4 installed");
    expect(screen.getByTestId("stat-active").textContent).toBe("2 active");
    expect(screen.getByTestId("stat-disabled").textContent).toBe("1 disabled");
  });

  it("search filters the grid and shows a no-matches message", () => {
    usePluginStore.setState({
      plugins: [
        makePlugin({ name: "alpha", description: "first plugin" }),
        makePlugin({ name: "beta", description: "second plugin" }),
      ],
    });
    render(<PluginListView />);
    const search = screen.getByTestId("plugin-search");
    fireEvent.change(search, { target: { value: "alpha" } });
    expect(screen.getAllByTestId("plugin-card")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByTestId("no-matches")).toBeInTheDocument();
  });

  // a11y: the no-matches message appears as the user types into the search
  // box. Without role="status" + aria-live="polite", screen-reader users
  // get NO feedback that their query produced zero results — they'd only
  // discover it by tabbing into an empty result region. "polite" so the
  // announcement waits for the user to pause typing rather than firing on
  // every keystroke.
  it("no-matches message is a polite live region (a11y: search announce)", () => {
    usePluginStore.setState({
      plugins: [makePlugin({ name: "alpha", description: "first" })],
    });
    render(<PluginListView />);
    fireEvent.change(screen.getByTestId("plugin-search"), {
      target: { value: "zzz" },
    });
    const empty = screen.getByTestId("no-matches");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  // WCAG 4.1.2 (Name, Role, Value): a placeholder is not an accessible name
  // (it disappears once the user types). Mirrors PRs #45 (SessionSearch),
  // #50 (McpPanel), #51 (SkillsListView).
  it("search input has an accessible name; magnifying-glass icon is aria-hidden", () => {
    render(<PluginListView />);
    const input = screen.getByTestId("plugin-search");
    expect(input.getAttribute("aria-label")).toBe("Search plugins");
    const icon = input.parentElement!.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("aria-hidden")).toBe("true");
  });

  it("Check for Updates click calls the IPC and updates state", async () => {
    const local = makePlugin({
      name: "alpha",
      gitCommitSha: "a".repeat(40),
      marketplace: "m1",
    });
    usePluginStore.setState({ plugins: [local] });
    invokeMock.mockResolvedValue({ m1: "b".repeat(40) });

    render(<PluginListView />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-updates-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });

    const calls = invokeMock.mock.calls.filter(
      (c) => c[0] === "check_plugin_updates",
    );
    expect(calls).toHaveLength(1);
    expect(usePluginStore.getState().plugins[0].state).toBe("update-available");
  });

  // Regression: the handler used to lack a catch{}, so a rejected IPC
  // (registry down, fetch error, etc.) silently swallowed the failure —
  // the spinner stopped, but the user got no signal that the check
  // failed and the plugin list silently went stale.
  it("Check for Updates surfaces an error when the IPC rejects", async () => {
    const local = makePlugin({
      name: "alpha",
      gitCommitSha: "a".repeat(40),
      marketplace: "m1",
    });
    usePluginStore.setState({ plugins: [local] });
    invokeMock.mockRejectedValue(new Error("registry unreachable"));

    render(<PluginListView />);
    expect(screen.queryByTestId("check-updates-error")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("check-updates-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });

    const err = screen.getByTestId("check-updates-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("registry unreachable");
    // Spinner stopped + button is interactable again.
    expect(
      (screen.getByTestId("check-updates-btn") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("Check for Updates clears a previous error on the next successful run", async () => {
    const local = makePlugin({
      name: "alpha",
      gitCommitSha: "a".repeat(40),
      marketplace: "m1",
    });
    usePluginStore.setState({ plugins: [local] });
    invokeMock.mockRejectedValueOnce(new Error("nope"));

    render(<PluginListView />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-updates-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("check-updates-error")).toBeInTheDocument();

    invokeMock.mockResolvedValueOnce({ m1: "b".repeat(40) });
    resetUpdateCache(); // force the second checkPluginUpdates to hit IPC again
    await act(async () => {
      fireEvent.click(screen.getByTestId("check-updates-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("check-updates-error")).toBeNull();
  });

  it("perf: rendering 50 PluginCards completes in < 200ms", () => {
    const plugins: PluginMeta[] = Array.from({ length: 50 }, (_, i) =>
      makePlugin({
        name: `p${i}`,
        installPath: `/cache/m/p${i}/1.0.0`,
        marketplace: i % 2 === 0 ? "m1" : "m2",
      }),
    );
    usePluginStore.setState({ plugins });
    const start = performance.now();
    render(<PluginListView />);
    const elapsed = performance.now() - start;
    expect(screen.getAllByTestId("plugin-card")).toHaveLength(50);
    expect(elapsed).toBeLessThan(200);
  });

  it("dark + light theme parity: status-dot keeps the same utility class", () => {
    usePluginStore.setState({
      plugins: [makePlugin({ state: "active" })],
    });
    const { unmount } = render(<PluginListView />);
    const lightClass = screen.getByTestId("status-dot").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      render(<PluginListView />);
      const darkClass = screen.getByTestId("status-dot").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  it("Install Plugin button is disabled until IPC is wired", () => {
    render(<PluginListView />);
    const btn = screen.getByTestId("install-plugin-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title");
  });

  // WCAG 4.1.2 (Name, Role, Value): each header button has a fully readable
  // text label ("Install Plugin", "Check for Updates"), so the leading
  // lucide icon is decorative — without aria-hidden, screen readers may
  // announce the SVG's computed name redundantly. Mirrors the SkillCard
  // (PR #96), McpServerCard, and PluginCard fixes.
  it("decorative icons inside header buttons are aria-hidden", () => {
    render(<PluginListView />);
    for (const id of ["install-plugin-btn", "check-updates-btn"]) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing through the Plugins
  // page need a visible focus indicator on the Check for Updates button
  // (the only enabled header control; Install Plugin is disabled). Mirrors
  // PRs #17/#45/#48/#49/#56/#57/#67/#111/#112.
  it("Check for Updates button has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<PluginListView />);
    const btn = screen.getByTestId("check-updates-btn");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  // Disabled-state visual affordance — when Check for Updates is disabled
  // (during an in-flight check, or when the plugin list is empty), the
  // browser default cursor on a `<button disabled>` is still `default`,
  // and the existing `hover:bg-bg-tertiary` rule still fires on hover —
  // making the button look interactive when it isn't. Mirror the
  // Install Plugin stub above (which uses `cursor-not-allowed`) and
  // suppress the hover background while disabled.
  it("Check for Updates shows disabled affordances (cursor + no hover bg)", () => {
    render(<PluginListView />);
    const btn = screen.getByTestId("check-updates-btn");
    expect(btn.className).toContain("disabled:cursor-not-allowed");
    expect(btn.className).toContain("disabled:hover:bg-transparent");
  });

  // WCAG 2.4.7 Focus Visible — the search input previously used
  // `focus:outline-none focus:border-accent`, which (a) strips the browser
  // default outline for *every* focus including mouse, and (b) replaces it
  // with a 1-px border-color shift that's barely visible against
  // bg-bg-tertiary. Mirrors the McpPanel search-input fix in PR #138.
  it("search input has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<PluginListView />);
    const input = screen.getByTestId("plugin-search");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-accent");
    expect(input.className).not.toMatch(/(^|\s)focus:outline-none(\s|$)/);
  });

  // UX bug: WebView2 (Tauri's webview) does not consistently honor the
  // `<input type=search>` browser-default Escape-to-clear behavior, and
  // even when it does, focus jumps off the input — the user has to click
  // back into the field before they can type a new query. Wire an
  // explicit Escape handler so the field clears and stays focused.
  // Mirrors the McpPanel fix in PR #151.
  it("Escape clears the search query while keeping focus on the input", () => {
    render(<PluginListView />);
    const input = screen.getByTestId("plugin-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "alpha" } });
    expect(input.value).toBe("alpha");
    input.focus();
    expect(document.activeElement).toBe(input);
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(false); // default prevented
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  // The Escape handler is gated on a non-empty query so an empty-state
  // Esc keystroke does NOT preventDefault — leaves room for outer
  // dialog/modal handlers to receive it.
  it("Escape on an empty search field is a no-op (does not preventDefault)", () => {
    render(<PluginListView />);
    const input = screen.getByTestId("plugin-search") as HTMLInputElement;
    expect(input.value).toBe("");
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(true); // default NOT prevented
    expect(input.value).toBe("");
  });

  // CLAUDE.md R2 (Orphan-placeholder rule): the Install Plugin header button
  // is disabled until the IPC ships. The source MUST reference the open
  // tracker in docs/superpowers/plans/2026-05-08-ui-defect-sweep.md (line
  // 295) so the placeholder isn't an undiscoverable orphan. Mirrors PR #105.
  it("PluginListView source has an R2 wire-up TODO for the Install Plugin stub", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../src/components/plugins/PluginListView.tsx",
      ),
      "utf8",
    );
    expect(src).toMatch(/TODO\(ui-defect-sweep#L295\)[\s\S]*install-plugin-btn/);
  });
});
