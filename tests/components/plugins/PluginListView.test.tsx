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
});
