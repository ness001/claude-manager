// Plugin update detection — see spec §13 (1hr cache) and DESIGN-CONTEXT §2.5.
//
// Pure logic lives here so the merging / cache behavior is unit-testable
// without spinning up the IPC. The actual `git ls-remote` shell-out lives in
// the Rust `check_plugin_updates` command.

import { invoke } from "@tauri-apps/api/core";

import type { PluginMeta } from "./plugin-types";

/** Cache the result for one hour per spec §13. */
export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  /** Map of marketplace → remote HEAD SHA. */
  remoteHeads: Record<string, string>;
  /** epoch-ms when this entry was written. */
  fetchedAt: number;
}

let cache: CacheEntry | null = null;

/** Reset the in-memory cache — exposed for tests. */
export function resetUpdateCache(): void {
  cache = null;
}

/**
 * Returns plugins with `state` rewritten to `update-available` for any plugin
 * whose `gitCommitSha` differs from its marketplace's remote HEAD.
 *
 * Plugins already in `broken` or `orphaned` state are left alone (they have
 * bigger problems than being out-of-date).
 *
 * If `force` is true, ignores the cache.
 */
export async function checkPluginUpdates(
  plugins: PluginMeta[],
  options: {
    /** Override IPC for tests. */
    fetchRemoteHeads?: (marketplaces: string[]) => Promise<Record<string, string>>;
    /** Override clock for tests. */
    now?: () => number;
    /** Skip cache check (used by the manual "Check for Updates" button). */
    force?: boolean;
  } = {},
): Promise<PluginMeta[]> {
  const now = options.now ?? Date.now;
  const force = options.force ?? false;
  const fetchRemoteHeads =
    options.fetchRemoteHeads ?? defaultFetchRemoteHeads;

  let remoteHeads: Record<string, string>;
  if (!force && cache && now() - cache.fetchedAt < UPDATE_CACHE_TTL_MS) {
    remoteHeads = cache.remoteHeads;
  } else {
    const marketplaces = Array.from(
      new Set(plugins.map((p) => p.marketplace)),
    );
    remoteHeads = await fetchRemoteHeads(marketplaces);
    cache = { remoteHeads, fetchedAt: now() };
  }

  return plugins.map((p) => mergeRemoteSha(p, remoteHeads[p.marketplace]));
}

/**
 * Merge a single plugin's local SHA against the marketplace's remote SHA.
 * Exported so the data-fixture test can exercise it directly without going
 * through the IPC boundary.
 */
export function mergeRemoteSha(
  plugin: PluginMeta,
  remoteSha: string | undefined,
): PluginMeta {
  if (!remoteSha) return plugin;
  if (plugin.state === "broken" || plugin.state === "orphaned") return plugin;
  if (plugin.gitCommitSha && plugin.gitCommitSha !== remoteSha) {
    return { ...plugin, state: "update-available" };
  }
  return plugin;
}

async function defaultFetchRemoteHeads(
  marketplaces: string[],
): Promise<Record<string, string>> {
  return await invoke<Record<string, string>>("check_plugin_updates", {
    marketplaces,
  });
}
