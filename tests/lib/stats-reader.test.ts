// Tests for the stats-cache.json reader (T2.7).
//
// Mocks at the module boundary:
//   - `@tauri-apps/plugin-fs`  → `readTextFile` / `exists`
//   - `@tauri-apps/api/path`   → `homeDir` + `join` for ~/.claude path resolution
// We never mock the unit under test (`stats-reader`) itself. The fixture
// content on disk is the authoritative input — fs mocks just shuttle it
// through the same surface the production code will use.

import { readFileSync } from "node:fs";
import { join as nodeJoin, resolve as nodeResolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readTextFileMock = vi.fn();
const existsMock = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  exists: (...args: unknown[]) => existsMock(...args),
}));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/home/test"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));

import { readStatsCache, EMPTY_STATS } from "../../src/lib/stats-reader";

const fixtureDir = nodeResolve(__dirname, "..", "fixtures", "stats-reader");
const validFixture = readFileSync(nodeJoin(fixtureDir, "stats-cache.json"), "utf-8");
const malformedFixture = readFileSync(nodeJoin(fixtureDir, "malformed.json"), "utf-8");

beforeEach(() => {
  readTextFileMock.mockReset();
  existsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stats-reader: readStatsCache", () => {
  // case 1: valid file — returns shape with costUSD, hourCounts, dailyActivity, dailyModelTokens
  it("case 1: reads valid stats-cache.json → returns normalized shape", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(validFixture);

    const stats = await readStatsCache();

    expect(stats.costUSD).toBe(12.34);
    expect(stats.dailyActivity).toHaveLength(2);
    expect(stats.dailyActivity[0]).toEqual({
      date: "2026-02-03",
      messageCount: 18,
      sessionCount: 1,
      toolCallCount: 1,
    });
    expect(stats.dailyModelTokens).toHaveLength(2);
    expect(stats.dailyModelTokens[1].tokensByModel).toEqual({
      "claude-opus-4.6": 12000,
      "claude-sonnet-4.6": 500,
    });
    // hourCounts is normalized to a 24-element array regardless of input shape.
    expect(stats.hourCounts).toHaveLength(24);
    expect(stats.hourCounts[9]).toBe(4);
    expect(stats.hourCounts[10]).toBe(1);
    expect(stats.hourCounts[14]).toBe(7);
    expect(stats.hourCounts[15]).toBe(15);
    expect(stats.hourCounts[23]).toBe(2);
    expect(stats.hourCounts[0]).toBe(0);
  });

  // case 2: missing file — returns defaults, does not throw
  it("case 2: missing file → returns EMPTY_STATS without throwing", async () => {
    existsMock.mockResolvedValue(false);
    readTextFileMock.mockRejectedValue(new Error("ENOENT: no such file"));

    const stats = await readStatsCache();

    expect(stats).toEqual(EMPTY_STATS);
    // Must NOT have called readTextFile after exists() said false (early return).
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  // case 2b: even if exists() check is skipped and readTextFile rejects,
  // reader still returns defaults rather than propagating.
  it("case 2b: readTextFile rejection → returns defaults", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockRejectedValue(new Error("EACCES"));

    const stats = await readStatsCache();

    expect(stats).toEqual(EMPTY_STATS);
  });

  // case 3: malformed JSON — returns defaults, does not throw
  it("case 3: malformed JSON → returns defaults", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(malformedFixture);

    const stats = await readStatsCache();

    expect(stats).toEqual(EMPTY_STATS);
  });

  // case 4: extra/unknown keys are ignored without erroring
  it("case 4: extra/unknown keys are ignored", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        costUSD: 1,
        hourCounts: {},
        dailyActivity: [],
        dailyModelTokens: [],
        someUnknownKey: "ignored",
        nestedJunk: { a: 1, b: [2, 3] },
        version: 99,
        totalSpeculationTimeSavedMs: 12345,
      }),
    );

    const stats = await readStatsCache();

    expect(stats).toEqual({
      costUSD: 1,
      hourCounts: Array.from({ length: 24 }, () => 0),
      dailyActivity: [],
      dailyModelTokens: [],
    });
    // Extra keys must NOT appear on the returned object.
    expect(Object.keys(stats).sort()).toEqual(
      ["costUSD", "dailyActivity", "dailyModelTokens", "hourCounts"].sort(),
    );
  });

  // hourCounts shape tolerance — accept array OR object, normalize to length-24 array.
  it("normalizes hourCounts: accepts an array of 24 numbers", async () => {
    const arr = Array.from({ length: 24 }, (_, i) => i);
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ hourCounts: arr, dailyActivity: [], dailyModelTokens: [] }),
    );

    const stats = await readStatsCache();

    expect(stats.hourCounts).toEqual(arr);
  });

  // hourCounts shape tolerance — non-numeric / out-of-range entries clamp to 0.
  it("normalizes hourCounts: invalid keys/values become 0", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        hourCounts: { "5": 2, "25": 99, "-1": 99, foo: 4, "12": "not-a-number" },
        dailyActivity: [],
        dailyModelTokens: [],
      }),
    );

    const stats = await readStatsCache();

    expect(stats.hourCounts[5]).toBe(2);
    expect(stats.hourCounts[12]).toBe(0);
    // No entry was written for 25, -1, or "foo".
    expect(stats.hourCounts.reduce((a, b) => a + b, 0)).toBe(2);
  });

  // missing top-level fields fall back to safe defaults (not undefined).
  it("missing top-level fields fall back to defaults", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(JSON.stringify({}));

    const stats = await readStatsCache();

    expect(stats).toEqual(EMPTY_STATS);
  });

  // file content is empty string → defaults
  it("empty string file → returns defaults", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue("");

    const stats = await readStatsCache();

    expect(stats).toEqual(EMPTY_STATS);
  });
});

describe("stats-reader: path resolution", () => {
  it("reads ~/.claude/stats-cache.json (homeDir + join)", async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(validFixture);

    await readStatsCache();

    // Both exists() and readTextFile() should target the same resolved path.
    expect(existsMock).toHaveBeenCalledWith("/home/test/.claude/stats-cache.json");
    expect(readTextFileMock).toHaveBeenCalledWith("/home/test/.claude/stats-cache.json");
  });
});
