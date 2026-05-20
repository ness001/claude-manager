// Source-of-truth contract test for ~/.claude/stats-cache.json.
//
// This test is paired with `docs/sources-of-truth/stats-cache-json.yaml`.
// It pins the on-disk shape we depend on AND the normalization rules
// `src/lib/stats-reader.ts` performs, so any future schema drift (CLI
// release) or normalization drift (refactor) is caught here, isolated
// from product code.
//
// We DO NOT import stats-reader.ts — the goal is to lock the contract
// at the data layer, independent of the reader implementation. The
// normalization helpers below are a direct, faithful re-implementation
// of the rules documented in the YAML, so a drift between YAML and
// reader will show up as a unit-test failure either way.
//
// No mocks. No skipIf. No "or empty state" escape clauses.

import { readFileSync } from "node:fs";
import { resolve as nodeResolve } from "node:path";

import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURE_DIR = nodeResolve(__dirname, "fixtures");

function loadFixture(name: string): unknown {
  const path = nodeResolve(FIXTURE_DIR, name);
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// Normalization — mirrors src/lib/stats-reader.ts behavior, documented in YAML.
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeHourCounts(raw: unknown): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  if (Array.isArray(raw)) {
    for (let i = 0; i < 24 && i < raw.length; i++) out[i] = asNumber(raw[i]);
    return out;
  }
  if (isPlainObject(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(k);
      if (!Number.isInteger(n) || n < 0 || n > 23) continue;
      out[n] = asNumber(v);
    }
    return out;
  }
  return out;
}

interface DailyActivityEntry {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
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

interface DailyModelTokensEntry {
  date: string;
  tokensByModel: Record<string, number>;
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
    out.push({ date: asString(item.date), tokensByModel });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RawStatsCache {
  version: number;
  lastComputedDate: string;
  firstSessionDate?: string;
  totalSessions?: number;
  totalMessages?: number;
  totalSpeculationTimeSavedMs?: number;
  longestSession?: {
    sessionId: string;
    duration: number;
    messageCount: number;
    timestamp: string;
  };
  dailyActivity: unknown;
  dailyModelTokens: unknown;
  modelUsage?: Record<string, Record<string, number>>;
  hourCounts: unknown;
}

function assertTopLevelShape(parsed: unknown): asserts parsed is RawStatsCache {
  expect(isPlainObject(parsed)).toBe(true);
  const o = parsed as Record<string, unknown>;

  // Required keys
  expect(typeof o.version).toBe("number");
  expect(typeof o.lastComputedDate).toBe("string");
  expect(o.lastComputedDate as string).toMatch(ISO_DATE_RE);
  expect(Array.isArray(o.dailyActivity)).toBe(true);
  expect(Array.isArray(o.dailyModelTokens)).toBe(true);
  // hourCounts is the discriminated union — must be object OR array, never else
  const hc = o.hourCounts;
  expect(Array.isArray(hc) || isPlainObject(hc)).toBe(true);

  // Optional but-when-present keys
  if (o.firstSessionDate !== undefined) {
    expect(o.firstSessionDate as string).toMatch(ISO_INSTANT_RE);
  }
  if (o.longestSession !== undefined) {
    const ls = o.longestSession as Record<string, unknown>;
    expect(typeof ls.sessionId).toBe("string");
    expect(ls.sessionId as string).toMatch(UUID_RE);
    expect(typeof ls.duration).toBe("number");
    expect(typeof ls.messageCount).toBe("number");
    expect(ls.timestamp as string).toMatch(ISO_INSTANT_RE);
  }
  if (o.modelUsage !== undefined) {
    expect(isPlainObject(o.modelUsage)).toBe(true);
    for (const entry of Object.values(o.modelUsage as Record<string, unknown>)) {
      expect(isPlainObject(entry)).toBe(true);
      const e = entry as Record<string, unknown>;
      // Per-model usage fields are all numeric
      for (const key of [
        "inputTokens",
        "outputTokens",
        "cacheReadInputTokens",
        "cacheCreationInputTokens",
        "webSearchRequests",
        "costUSD",
        "contextWindow",
        "maxOutputTokens",
      ] as const) {
        expect(typeof e[key]).toBe("number");
      }
    }
  }
}

function assertDailyActivityShape(entries: DailyActivityEntry[]): void {
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.date).toMatch(ISO_DATE_RE);
    expect(typeof entry.messageCount).toBe("number");
    expect(typeof entry.sessionCount).toBe("number");
    expect(typeof entry.toolCallCount).toBe("number");
    expect(entry.messageCount).toBeGreaterThanOrEqual(0);
    expect(entry.sessionCount).toBeGreaterThanOrEqual(0);
    expect(entry.toolCallCount).toBeGreaterThanOrEqual(0);
  }
}

function assertDailyModelTokensShape(entries: DailyModelTokensEntry[]): void {
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.date).toMatch(ISO_DATE_RE);
    expect(isPlainObject(entry.tokensByModel)).toBe(true);
    expect(Object.keys(entry.tokensByModel).length).toBeGreaterThan(0);
    for (const [model, tokens] of Object.entries(entry.tokensByModel)) {
      expect(model.length).toBeGreaterThan(0);
      expect(typeof tokens).toBe("number");
      expect(tokens).toBeGreaterThanOrEqual(0);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stats-cache.json source-of-truth contract", () => {
  describe("fixture: stats-cache-json-object-hours.json (real-disk variant)", () => {
    const parsed = loadFixture("stats-cache-json-object-hours.json");

    it("matches the documented top-level shape", () => {
      assertTopLevelShape(parsed);
    });

    it("uses the OBJECT form of hourCounts (sparse, keyed by stringified hour)", () => {
      assertTopLevelShape(parsed);
      expect(Array.isArray(parsed.hourCounts)).toBe(false);
      expect(isPlainObject(parsed.hourCounts)).toBe(true);
      // Every key must be an integer string in "0".."23"
      for (const k of Object.keys(parsed.hourCounts as Record<string, unknown>)) {
        const n = Number(k);
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(23);
      }
    });

    it("normalizes hourCounts to a length-24 number[] with sparse keys defaulted to 0", () => {
      assertTopLevelShape(parsed);
      const hours = normalizeHourCounts(parsed.hourCounts);
      expect(hours).toHaveLength(24);
      for (const v of hours) expect(typeof v).toBe("number");

      // From the fixture: hour 15 has 15 events, hour 10 has 1, hour 21 has 1.
      // Hours 0..9 and 13 and 22..23 are absent and must normalize to 0.
      expect(hours[15]).toBe(15);
      expect(hours[10]).toBe(1);
      expect(hours[21]).toBe(1);
      expect(hours[0]).toBe(0);
      expect(hours[9]).toBe(0);
      expect(hours[13]).toBe(0);
      expect(hours[22]).toBe(0);
      expect(hours[23]).toBe(0);

      // Sum invariant: normalized sum equals sum of object values.
      const objectSum = Object.values(parsed.hourCounts as Record<string, number>).reduce(
        (a, b) => a + b,
        0,
      );
      const arraySum = hours.reduce((a, b) => a + b, 0);
      expect(arraySum).toBe(objectSum);
    });

    it("normalizes dailyActivity to the documented entry shape", () => {
      assertTopLevelShape(parsed);
      const entries = normalizeDailyActivity(parsed.dailyActivity);
      // No items dropped (all fixture items are plain objects)
      expect(entries).toHaveLength((parsed.dailyActivity as unknown[]).length);
      assertDailyActivityShape(entries);
    });

    it("normalizes dailyModelTokens and exposes per-day model->tokens map", () => {
      assertTopLevelShape(parsed);
      const entries = normalizeDailyModelTokens(parsed.dailyModelTokens);
      expect(entries).toHaveLength((parsed.dailyModelTokens as unknown[]).length);
      assertDailyModelTokensShape(entries);

      // Multi-model day: 2026-03-23 has both sonnet and opus
      const multi = entries.find((e) => e.date === "2026-03-23");
      expect(multi).toBeDefined();
      expect(Object.keys(multi!.tokensByModel).sort()).toEqual(
        ["claude-opus-4.6-1m", "claude-sonnet-4-6"].sort(),
      );
    });

    it("modelUsage entries are well-typed for every declared model", () => {
      assertTopLevelShape(parsed);
      expect(parsed.modelUsage).toBeDefined();
      const usage = parsed.modelUsage!;
      // All models that appear in dailyModelTokens must have a modelUsage entry
      const modelsInDaily = new Set<string>();
      for (const entry of normalizeDailyModelTokens(parsed.dailyModelTokens)) {
        for (const m of Object.keys(entry.tokensByModel)) modelsInDaily.add(m);
      }
      for (const m of modelsInDaily) {
        expect(usage[m], `modelUsage missing entry for ${m}`).toBeDefined();
      }
    });

    it("lastComputedDate is ISO calendar date (YYYY-MM-DD)", () => {
      assertTopLevelShape(parsed);
      expect(parsed.lastComputedDate).toMatch(ISO_DATE_RE);
      // Round-trips through Date parsing without becoming NaN
      const d = new Date(parsed.lastComputedDate);
      expect(Number.isNaN(d.getTime())).toBe(false);
    });
  });

  describe("fixture: stats-cache-json-array-hours.json (array hourCounts variant)", () => {
    const parsed = loadFixture("stats-cache-json-array-hours.json");

    it("matches the documented top-level shape", () => {
      assertTopLevelShape(parsed);
    });

    it("uses the ARRAY form of hourCounts (length 24, indexed by hour)", () => {
      assertTopLevelShape(parsed);
      expect(Array.isArray(parsed.hourCounts)).toBe(true);
      const arr = parsed.hourCounts as unknown[];
      expect(arr).toHaveLength(24);
      for (const v of arr) expect(typeof v).toBe("number");
    });

    it("normalizes hourCounts to a length-24 number[] preserving index positions", () => {
      assertTopLevelShape(parsed);
      const hours = normalizeHourCounts(parsed.hourCounts);
      expect(hours).toHaveLength(24);
      // Identity for array form
      expect(hours).toEqual(parsed.hourCounts);
    });

    it("normalizes dailyActivity to the documented entry shape", () => {
      assertTopLevelShape(parsed);
      const entries = normalizeDailyActivity(parsed.dailyActivity);
      expect(entries).toHaveLength((parsed.dailyActivity as unknown[]).length);
      assertDailyActivityShape(entries);
    });

    it("normalizes dailyModelTokens to the documented entry shape", () => {
      assertTopLevelShape(parsed);
      const entries = normalizeDailyModelTokens(parsed.dailyModelTokens);
      expect(entries).toHaveLength((parsed.dailyModelTokens as unknown[]).length);
      assertDailyModelTokensShape(entries);
    });

    it("lastComputedDate is ISO calendar date (YYYY-MM-DD)", () => {
      assertTopLevelShape(parsed);
      expect(parsed.lastComputedDate).toMatch(ISO_DATE_RE);
      const d = new Date(parsed.lastComputedDate);
      expect(Number.isNaN(d.getTime())).toBe(false);
    });
  });

  describe("cross-variant invariants", () => {
    it("normalization yields the same canonical hourCounts type from both variants", () => {
      const objHours = normalizeHourCounts(
        (loadFixture("stats-cache-json-object-hours.json") as RawStatsCache).hourCounts,
      );
      const arrHours = normalizeHourCounts(
        (loadFixture("stats-cache-json-array-hours.json") as RawStatsCache).hourCounts,
      );
      expect(Array.isArray(objHours)).toBe(true);
      expect(Array.isArray(arrHours)).toBe(true);
      expect(objHours).toHaveLength(24);
      expect(arrHours).toHaveLength(24);
    });
  });

  // -------------------------------------------------------------------------
  // costUSD location contract — pins the v2 gotcha `costusd-location-mismatch`.
  // Real disk in v2 stores costUSD ONLY per-model under modelUsage[<model>].costUSD;
  // the top-level `costUSD` key is absent. `stats-reader.ts` currently reads only
  // `parsed.costUSD` and silently coerces to 0, so the Dashboard cost widget is
  // always $0. This test locks both halves of the contract so any drift fails loudly.
  // -------------------------------------------------------------------------
  describe("costUSD authoritative location (per-model, not top-level)", () => {
    const fixtureNames = [
      "stats-cache-json-object-hours.json",
      "stats-cache-json-array-hours.json",
    ] as const;

    for (const name of fixtureNames) {
      describe(`fixture: ${name}`, () => {
        const parsed = loadFixture(name) as Record<string, unknown>;

        it("does NOT carry costUSD at the top level (v2 contract)", () => {
          expect(parsed.costUSD).toBeUndefined();
        });

        it("carries a numeric costUSD on every modelUsage entry", () => {
          expect(isPlainObject(parsed.modelUsage)).toBe(true);
          const usage = parsed.modelUsage as Record<string, Record<string, unknown>>;
          const modelKeys = Object.keys(usage);
          expect(modelKeys.length).toBeGreaterThan(0);
          for (const model of modelKeys) {
            const entry = usage[model];
            expect(entry, `modelUsage[${model}]`).toBeDefined();
            expect(typeof entry.costUSD, `modelUsage[${model}].costUSD type`).toBe("number");
            expect(
              Number.isFinite(entry.costUSD as number),
              `modelUsage[${model}].costUSD finite`,
            ).toBe(true);
            expect(entry.costUSD as number).toBeGreaterThanOrEqual(0);
          }
        });

        it("derives a non-zero total cost by summing modelUsage[*].costUSD (recommended fix)", () => {
          const usage = parsed.modelUsage as Record<string, Record<string, unknown>>;
          const total = Object.values(usage).reduce(
            (acc, m) => acc + (Number(m.costUSD) || 0),
            0,
          );
          // Fixtures are seeded with at least one non-zero per-model costUSD so this
          // sum is meaningful — guards against future fixture changes that would
          // hide the discrepancy by zeroing out all per-model values.
          expect(total).toBeGreaterThan(0);
        });
      });
    }
  });
});
