// Tests for the plugin store (T3.3). Mocks at the module boundary:
//   - `../../src/lib/plugin-loader` → loadPlugins / loadPluginDetail
//   - `@tauri-apps/api/core`        → invoke (only the write_plugin_enabled
//                                      command is exercised here)
// We never mock the store under test (`plugin-store`) itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPluginsMock = vi.fn();
const loadPluginDetailMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("../../src/lib/plugin-loader", () => ({
  loadPlugins: (...args: unknown[]) => loadPluginsMock(...args),
  loadPluginDetail: (...args: unknown[]) => loadPluginDetailMock(...args),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  filterPlugins,
  pluginKey,
  usePluginStore,
} from "../../src/stores/plugin-store";
import type {
  PluginDetail,
  PluginMeta,
} from "../../src/lib/plugin-types";

function makePlugin(overrides: Partial<PluginMeta> = {}): PluginMeta {
  return {
    name: "alpha",
    marketplace: "official",
    version: "1.0.0",
    gitCommitSha: "0".repeat(40),
    description: "the alpha plugin",
    installPath: "/cache/official/alpha/1.0.0",
    state: "active",
    skillCount: 0,
    agentCount: 0,
    hookCount: 0,
    hasClaudeMd: false,
    ...overrides,
  };
}

beforeEach(() => {
  usePluginStore.setState({
    plugins: [],
    selectedPlugin: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  });
  loadPluginsMock.mockReset();
  loadPluginDetailMock.mockReset();
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("plugin-store", () => {
  it("initial state matches spec", () => {
    const s = usePluginStore.getState();
    expect(s.plugins).toEqual([]);
    expect(s.selectedPlugin).toBeNull();
    expect(s.searchQuery).toBe("");
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeNull();
  });

  // case 1: loadPlugins() populates `plugins` and clears `isLoading`.
  it("case 1: loadPlugins() populates plugins and clears isLoading", async () => {
    const list = [makePlugin({ name: "a" }), makePlugin({ name: "b" })];
    loadPluginsMock.mockResolvedValue(list);

    const promise = usePluginStore.getState().loadPlugins();
    expect(usePluginStore.getState().isLoading).toBe(true);
    await promise;

    const s = usePluginStore.getState();
    expect(s.plugins).toEqual(list);
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeNull();
  });

  // case 2: selectPlugin(meta) populates selectedPlugin with detail.
  it("case 2: selectPlugin populates selectedPlugin with detail", async () => {
    const meta = makePlugin();
    const detail: PluginDetail = {
      ...meta,
      description: "rich description",
      skills: [{ name: "s", description: "d" }],
      agents: [],
      hooks: [],
      skillCount: 1,
    };
    loadPluginDetailMock.mockResolvedValue(detail);

    await usePluginStore.getState().selectPlugin(meta);
    expect(usePluginStore.getState().selectedPlugin).toEqual(detail);

    await usePluginStore.getState().selectPlugin(null);
    expect(usePluginStore.getState().selectedPlugin).toBeNull();
  });

  // case 3: setSearchQuery filters by name, description, marketplace
  // (free helper — store just stores the query).
  it("case 3: filterPlugins matches name, description, marketplace", () => {
    const list = [
      makePlugin({ name: "alpha", description: "x", marketplace: "m1" }),
      makePlugin({ name: "beta", description: "the YAK plugin", marketplace: "m1" }),
      makePlugin({ name: "gamma", description: "z", marketplace: "obsidian-skills" }),
    ];
    expect(filterPlugins(list, "alpha").map((p) => p.name)).toEqual(["alpha"]);
    expect(filterPlugins(list, "yak").map((p) => p.name)).toEqual(["beta"]);
    expect(filterPlugins(list, "obsidian").map((p) => p.name)).toEqual(["gamma"]);
    // empty query returns full list
    expect(filterPlugins(list, "").length).toBe(3);
    // case-insensitive
    expect(filterPlugins(list, "GAMMA").map((p) => p.name)).toEqual(["gamma"]);
  });

  // case 4: togglePlugin flips enabled state and triggers settings.json
  // write (mocked Rust command).
  it("case 4: togglePlugin flips enabled state and writes via IPC", async () => {
    const meta = makePlugin({ state: "active" });
    usePluginStore.setState({ plugins: [meta] });
    invokeMock.mockResolvedValue(undefined);

    await usePluginStore.getState().togglePlugin(meta);

    const calls = invokeMock.mock.calls.filter(
      (c) => c[0] === "write_plugin_enabled",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ key: pluginKey(meta), enabled: false });
    expect(usePluginStore.getState().plugins[0].state).toBe("disabled");

    // Toggling again flips back.
    await usePluginStore.getState().togglePlugin(usePluginStore.getState().plugins[0]);
    const calls2 = invokeMock.mock.calls.filter(
      (c) => c[0] === "write_plugin_enabled",
    );
    expect(calls2).toHaveLength(2);
    expect(calls2[1][1]).toEqual({ key: pluginKey(meta), enabled: true });
    expect(usePluginStore.getState().plugins[0].state).toBe("active");
  });

  // case 5: error path — Rust command rejects → store sets error state,
  // no partial mutation.
  it("case 5: write_plugin_enabled rejection rolls back optimistic state", async () => {
    const meta = makePlugin({ state: "active" });
    usePluginStore.setState({ plugins: [meta] });
    invokeMock.mockRejectedValue(new Error("disk full"));

    await expect(
      usePluginStore.getState().togglePlugin(meta),
    ).rejects.toThrow("disk full");

    // State rolled back; error recorded.
    expect(usePluginStore.getState().plugins[0].state).toBe("active");
    expect(usePluginStore.getState().error).toContain("disk full");
  });

  it("loadPlugins error sets error state and clears isLoading", async () => {
    loadPluginsMock.mockRejectedValue(new Error("loader boom"));
    await usePluginStore.getState().loadPlugins();
    expect(usePluginStore.getState().isLoading).toBe(false);
    expect(usePluginStore.getState().error).toContain("loader boom");
    expect(usePluginStore.getState().plugins).toEqual([]);
  });
});
