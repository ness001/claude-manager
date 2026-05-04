// Tests for the plugin loader (T3.2). Mocks at the module boundary:
//   - `@tauri-apps/api/core` → invoke (read_installed_plugins,
//     read_settings_enabled_plugins, read_plugin_contents)
//   - `@tauri-apps/plugin-fs` → exists() for installPath checks
// We never mock the unit under test (`plugin-loader`) itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const invokeMock = vi.fn();
const existsMock = vi.fn<(p: string) => Promise<boolean>>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: (p: string) => existsMock(p),
}));

import {
  derivePluginState,
  extractEnabledPlugins,
  loadPluginDetail,
  loadPlugins,
} from "../../src/lib/plugin-loader";
import type { PluginMeta } from "../../src/lib/plugin-types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "plugin-loader");
const REGISTRY = readFileSync(
  path.join(FIXTURES, "installed_plugins.json"),
  "utf8",
);
const SETTINGS = readFileSync(path.join(FIXTURES, "settings.json"), "utf8");

beforeEach(() => {
  invokeMock.mockReset();
  existsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Default `exists` that says: every fixture installPath exists EXCEPT
 *  the one under `missing-on-disk`. */
function defaultExists(p: string): Promise<boolean> {
  return Promise.resolve(!p.includes("missing-on-disk"));
}

function setupInvoke() {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "read_installed_plugins") return REGISTRY;
    if (cmd === "read_settings_enabled_plugins") return SETTINGS;
    throw new Error(`unexpected invoke ${cmd}`);
  });
}

describe("plugin-loader: loadPlugins", () => {
  // case 1: merges installed_plugins.json + settings.json.enabledPlugins
  // → PluginMeta[] with correct state per entry.
  it("case 1: merges registry + enabledPlugins into PluginMeta[]", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const byName = new Map(out.map((p) => [p.name, p]));

    expect(byName.get("doc-skills")?.state).toBe("active");
    expect(byName.get("doc-skills")?.marketplace).toBe(
      "anthropic-agent-skills",
    );
    expect(byName.get("doc-skills")?.version).toBe("a5bcdd7e58cd");
  });

  // case 2: missing installPath on disk → state is "broken".
  it("case 2: missing installPath → broken", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const broken = out.filter((p) => p.name === "broken-plugin");
    expect(broken).toHaveLength(1);
    expect(broken[0].state).toBe("broken");
  });

  // case 3: enabled name absent from installed_plugins → orphaned (spec §6.4).
  it("case 3: enabled key not in registry → orphaned", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const ghost = out.filter((p) => p.name === "ghost");
    expect(ghost).toHaveLength(1);
    expect(ghost[0].state).toBe("orphaned");
    expect(ghost[0].marketplace).toBe("vanished-marketplace");
    expect(ghost[0].installPath).toBe("");
  });

  // case 4: array of installations under one key → one PluginMeta per entry.
  it("case 4: one PluginMeta per installation array entry", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const sp = out.filter((p) => p.name === "superpowers");
    expect(sp).toHaveLength(2);
    const installPaths = sp.map((p) => p.installPath).sort();
    expect(installPaths).toEqual([
      "/fixture/cache/claude-plugins-official/superpowers/5.0.7",
      "/fixture/cache/claude-plugins-official/superpowers/5.0.7-USER",
    ]);
    // Both should be active (registry + enabled + path exists).
    expect(sp.every((p) => p.state === "active")).toBe(true);
  });

  // case 5: 12-char git SHA version accepted alongside semver
  // (DESIGN-CONTEXT §2.5).
  it("case 5: 12-char SHA versions and semver versions both flow through", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const ds = out.find((p) => p.name === "doc-skills");
    const sp = out.find((p) => p.name === "superpowers");
    expect(ds?.version).toBe("a5bcdd7e58cd"); // 12-char SHA
    expect(ds?.gitCommitSha).toHaveLength(40);
    expect(sp?.version).toBe("5.0.7"); // semver
    expect(sp?.gitCommitSha).toHaveLength(40);
  });

  // case 6: plugin with no plugin.json falls back to marketplace.json
  // (DESIGN-CONTEXT §2.9). Exercised through loadPluginDetail: when the
  // Rust contents wire reports `manifestDescription` from marketplace.json,
  // the merged PluginDetail.description reflects that fallback.
  it("case 6: detail merges manifest description (marketplace.json fallback)", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_plugin_contents") {
        return {
          skills: [{ name: "s", description: "d" }],
          agents: [],
          hooks: [],
          hasClaudeMd: false,
          // Rust resolved this from marketplace.json (no plugin.json):
          manifestName: "doc-skills",
          manifestDescription: "from marketplace.json",
        };
      }
      throw new Error(`unexpected invoke ${cmd}`);
    });
    const meta: PluginMeta = {
      name: "doc-skills",
      marketplace: "anthropic-agent-skills",
      version: "a5bcdd7e58cd",
      gitCommitSha: "a".repeat(40),
      description: "", // empty from list-load (no manifest fetched yet)
      installPath: "/fixture/cache/anthropic-agent-skills/doc-skills/x",
      state: "active",
      skillCount: 0,
      agentCount: 0,
      hookCount: 0,
      hasClaudeMd: false,
    };
    const detail = await loadPluginDetail(meta);
    expect(detail.description).toBe("from marketplace.json");
    expect(detail.skillCount).toBe(1);
  });

  // Output is sorted by name (stability for the list view).
  it("output is sorted by name", async () => {
    setupInvoke();
    existsMock.mockImplementation(defaultExists);

    const out = await loadPlugins();
    const names = out.map((p) => p.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  // Perf budget (plan T3.2): scanning ~50 plugin installations < 1s
  // end-to-end. We run with a synthetic registry of 50 entries; the
  // mocked `exists` resolves immediately so this measures only the
  // loader's own work.
  it("perf: 50 installations parse + state-derive < 1s", async () => {
    const synthetic: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      synthetic[`plug-${i}@m`] = [
        {
          installPath: `/fake/p-${i}`,
          version: "1.0.0",
          gitCommitSha: "0".repeat(40),
        },
      ];
    }
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_installed_plugins")
        return JSON.stringify({ plugins: synthetic });
      if (cmd === "read_settings_enabled_plugins") return "";
      throw new Error(`unexpected invoke ${cmd}`);
    });
    existsMock.mockResolvedValue(true);

    const t0 = performance.now();
    const out = await loadPlugins();
    const elapsed = performance.now() - t0;
    expect(out).toHaveLength(50);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("plugin-loader: pure helpers", () => {
  it("derivePluginState matches spec §6.4 truth table", () => {
    expect(
      derivePluginState({ inRegistry: true, enabled: true, pathExists: true }),
    ).toBe("active");
    expect(
      derivePluginState({ inRegistry: true, enabled: false, pathExists: true }),
    ).toBe("disabled");
    expect(
      derivePluginState({ inRegistry: true, enabled: true, pathExists: false }),
    ).toBe("broken");
    expect(
      derivePluginState({ inRegistry: false, enabled: true, pathExists: true }),
    ).toBe("orphaned");
  });

  it("extractEnabledPlugins handles missing/malformed input", () => {
    expect(extractEnabledPlugins("")).toEqual({});
    expect(extractEnabledPlugins("{not json")).toEqual({});
    expect(extractEnabledPlugins('{"enabledPlugins":{"a@b":true}}')).toEqual({
      "a@b": true,
    });
  });
});
