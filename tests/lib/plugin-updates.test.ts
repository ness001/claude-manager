// Tests for the update-detection helper — see plan T3.4 data-fixture line:
// "fixture comparing local gitCommitSha vs remote HEAD → emits
// `update-available` for mismatched plugins (DESIGN-CONTEXT §2.5)".

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkPluginUpdates,
  mergeRemoteSha,
  resetUpdateCache,
  UPDATE_CACHE_TTL_MS,
} from "../../src/lib/plugin-updates";
import type { PluginMeta } from "../../src/lib/plugin-types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function makePlugin(overrides: Partial<PluginMeta> = {}): PluginMeta {
  return {
    name: "alpha",
    marketplace: "m1",
    version: "1.0.0",
    gitCommitSha: "a".repeat(40),
    description: "",
    installPath: "/cache/m1/alpha/1.0.0",
    state: "active",
    skillCount: 0,
    agentCount: 0,
    hookCount: 0,
    hasClaudeMd: false,
    ...overrides,
  };
}

describe("plugin-updates", () => {
  beforeEach(() => {
    resetUpdateCache();
  });

  it("mergeRemoteSha flips active → update-available on SHA mismatch", () => {
    const out = mergeRemoteSha(
      makePlugin({ state: "active", gitCommitSha: "a".repeat(40) }),
      "b".repeat(40),
    );
    expect(out.state).toBe("update-available");
  });

  it("mergeRemoteSha keeps state when SHAs match", () => {
    const out = mergeRemoteSha(
      makePlugin({ state: "active", gitCommitSha: "a".repeat(40) }),
      "a".repeat(40),
    );
    expect(out.state).toBe("active");
  });

  it("mergeRemoteSha leaves broken/orphaned alone", () => {
    expect(
      mergeRemoteSha(
        makePlugin({ state: "broken" }),
        "b".repeat(40),
      ).state,
    ).toBe("broken");
    expect(
      mergeRemoteSha(
        makePlugin({ state: "orphaned" }),
        "b".repeat(40),
      ).state,
    ).toBe("orphaned");
  });

  it("checkPluginUpdates: marks mismatched plugins update-available", async () => {
    const plugins = [
      makePlugin({
        name: "alpha",
        marketplace: "m1",
        gitCommitSha: "a".repeat(40),
      }),
      makePlugin({
        name: "beta",
        marketplace: "m2",
        gitCommitSha: "c".repeat(40),
      }),
    ];
    const out = await checkPluginUpdates(plugins, {
      fetchRemoteHeads: async () => ({
        m1: "b".repeat(40),
        m2: "c".repeat(40),
      }),
    });
    expect(out[0].state).toBe("update-available");
    expect(out[1].state).toBe("active");
  });

  it("checkPluginUpdates uses the cache within TTL", async () => {
    const plugins = [makePlugin()];
    const fetcher = vi.fn().mockResolvedValue({ m1: "b".repeat(40) });
    let now = 1_000_000;
    await checkPluginUpdates(plugins, {
      fetchRemoteHeads: fetcher,
      now: () => now,
    });
    now += UPDATE_CACHE_TTL_MS - 1;
    await checkPluginUpdates(plugins, {
      fetchRemoteHeads: fetcher,
      now: () => now,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("checkPluginUpdates re-fetches after TTL expiry", async () => {
    const plugins = [makePlugin()];
    const fetcher = vi.fn().mockResolvedValue({ m1: "b".repeat(40) });
    let now = 1_000_000;
    await checkPluginUpdates(plugins, {
      fetchRemoteHeads: fetcher,
      now: () => now,
    });
    now += UPDATE_CACHE_TTL_MS + 1;
    await checkPluginUpdates(plugins, {
      fetchRemoteHeads: fetcher,
      now: () => now,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("checkPluginUpdates with force: true bypasses the cache", async () => {
    const plugins = [makePlugin()];
    const fetcher = vi.fn().mockResolvedValue({ m1: "b".repeat(40) });
    await checkPluginUpdates(plugins, { fetchRemoteHeads: fetcher });
    await checkPluginUpdates(plugins, {
      fetchRemoteHeads: fetcher,
      force: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
