// Stats-cache reader — see spec §6 (Dashboard data sources).
//
// Reads `~/.claude/stats-cache.json` via the Tauri FS plugin and returns a
// normalized shape suited for the Dashboard charts. The on-disk file is
// written by Claude Code itself; we treat it as untrusted input:
//   - missing file        → return EMPTY_STATS, do not throw
//   - malformed JSON      → return EMPTY_STATS, do not throw
//   - extra/unknown keys  → silently dropped
//   - hourCounts as object Record<string,number> OR array — both normalized
//     to a length-24 array indexed by hour-of-day (0..23). Real data uses
//     the object form keyed by stringified hours.
//
// We never expose Tauri error objects to callers; the Dashboard should be
// able to render with EMPTY_STATS as a no-op state.

import { homeDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";

/** One row in the dailyActivity series (per spec §6). */
export interface DailyActivityEntry {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

/** One row in the dailyModelTokens series (per spec §6). */
export interface DailyModelTokensEntry {
  date: string;
  tokensByModel: Record<string, number>;
}

/** Normalized shape returned by `readStatsCache`. */
export interface StatsData {
  costUSD: number;
  /** Length-24 array indexed by hour-of-day (0..23). */
  hourCounts: number[];
  dailyActivity: DailyActivityEntry[];
  dailyModelTokens: DailyModelTokensEntry[];
}

/** Default value returned when the file is missing/malformed. Construct
 *  fresh via `freshDefaults()` if the caller intends to mutate. */
export const EMPTY_STATS: StatsData = {
  costUSD: 0,
  hourCounts: Array.from({ length: 24 }, () => 0),
  dailyActivity: [],
  dailyModelTokens: [],
};

/** Resolve the absolute path to `~/.claude/stats-cache.json` on first use. */
let cachedPath: string | null = null;
async function resolveStatsPath(): Promise<string> {
  if (cachedPath !== null) return cachedPath;
  const home = await homeDir();
  cachedPath = await join(home, ".claude", "stats-cache.json");
  return cachedPath;
}

/** Test seam — clears the resolved path cache. */
export function _resetStatsReaderCacheForTests(): void {
  cachedPath = null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Normalize hourCounts from either:
 *   - object: Record<string, number> keyed by stringified hour (real data)
 *   - array:  number[] (length 24, by index)
 * Anything else (including missing) → all zeros.
 *
 * Out-of-range keys (e.g. "25", "-1", "foo") and non-numeric values are
 * silently dropped to 0.
 */
function normalizeHourCounts(raw: unknown): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  if (Array.isArray(raw)) {
    for (let i = 0; i < 24 && i < raw.length; i++) {
      out[i] = asNumber(raw[i]);
    }
    return out;
  }
  if (isPlainObject(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      // Reject keys that aren't a clean integer 0..23. parseInt would
      // accept "5x"; Number() rejects it. The strict integer check guards
      // against floats and whitespace.
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0 || n > 23) continue;
      out[n] = asNumber(v);
    }
    return out;
  }
  return out;
}

function normalizeDailyActivity(raw: unknown): DailyActivityEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DailyActivityEntry[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    out.push({
      date: asString(item.date),
      messageCount: asNumber(item.messageCount),
      sessionCount: asNumber(item.sessionCount),
      toolCallCount: asNumber(item.toolCallCount),
    });
  }
  return out;
}

function normalizeDailyModelTokens(raw: unknown): DailyModelTokensEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DailyModelTokensEntry[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const tokensByModel: Record<string, number> = {};
    if (isPlainObject(item.tokensByModel)) {
      for (const [model, n] of Object.entries(item.tokensByModel)) {
        tokensByModel[model] = asNumber(n);
      }
    }
    out.push({
      date: asString(item.date),
      tokensByModel,
    });
  }
  return out;
}

/** Build a fresh defaults object — independent from `EMPTY_STATS` so callers
 *  that mutate the result can't poison subsequent reads. */
function freshDefaults(): StatsData {
  return {
    costUSD: 0,
    hourCounts: Array.from({ length: 24 }, () => 0),
    dailyActivity: [],
    dailyModelTokens: [],
  };
}

/**
 * Read and shape the stats cache. Always resolves; never throws.
 */
export async function readStatsCache(): Promise<StatsData> {
  let path: string;
  try {
    path = await resolveStatsPath();
  } catch {
    return freshDefaults();
  }

  // Use exists() first so a missing file is a quick boolean rather than a
  // thrown error from readTextFile. The plan's case 2 explicitly requires
  // the missing-file path to not invoke readTextFile.
  let present = false;
  try {
    present = await exists(path);
  } catch {
    return freshDefaults();
  }
  if (!present) return freshDefaults();

  let raw: string;
  try {
    raw = await readTextFile(path);
  } catch {
    return freshDefaults();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return freshDefaults();
  }
  if (!isPlainObject(parsed)) return freshDefaults();

  return {
    costUSD: asNumber(parsed.costUSD),
    hourCounts: normalizeHourCounts(parsed.hourCounts),
    dailyActivity: normalizeDailyActivity(parsed.dailyActivity),
    dailyModelTokens: normalizeDailyModelTokens(parsed.dailyModelTokens),
  };
}
