/**
 * Source-of-truth contract test for ~/.claude/projects/{slug}/sessions-index.json
 *
 * This file is OWNED by the Claude Code CLI; Claude Manager only reads it,
 * and treats it as advisory (see docs/sources-of-truth/sessions-index-cache.yaml,
 * docs/DESIGN-CONTEXT.md §2.2). The asserts below pin the on-disk shape we
 * observed across every sessions-index.json file on inv-sessions-index-cache's
 * machine on 2026-05-18. If a CLI release ever changes the shape, this test
 * fails — which is exactly the signal we want.
 *
 * The fixture is a sanitized copy of the busiest real index on disk
 * (15 entries from ~/.claude/projects/C--Users-lianli/). Stable fake UUIDs
 * replace real session IDs; firstPrompt/summary/projectPath/fullPath are
 * redacted. Timestamps (fileMtime, created, modified) are real values, kept
 * because the staleness signal depends on them.
 *
 * The real file this fixture mirrors was severely stale: 15/15 entries
 * point to JSONLs that no longer exist on disk, and 48 actual JSONLs in
 * the same project are not in the index. The fixture preserves that
 * dynamic — see the staleness section near the bottom of this test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, expectTypeOf } from "vitest";

// ---------------------------------------------------------------------------
// Wire shape — observed schema. There is no shipping Claude Manager type for
// the index file (commands.rs::read_sidechain_overlay reads it as untyped
// serde_json::Value on purpose). We declare the shape locally and use
// expectTypeOf to keep the runtime asserts and the type in lock-step.
// ---------------------------------------------------------------------------
interface SessionsIndexEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

interface SessionsIndexFile {
  version: number;
  entries: SessionsIndexEntry[];
  originalPath?: string;
}

const FIXTURE_PATH = join(
  __dirname,
  "fixtures",
  "sessions-index-cache.json",
);

const raw = readFileSync(FIXTURE_PATH, "utf-8");
const parsed: unknown = JSON.parse(raw);

// Cast for the suite. Each describe block asserts the shape that earns the cast.
const index = parsed as SessionsIndexFile;

describe("sessions-index.json — top-level shape", () => {
  it("is a JSON object (not bare array)", () => {
    expect(parsed).toBeTypeOf("object");
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed)).toBe(false);
  });

  it("has the three top-level keys we observed: version, entries, originalPath", () => {
    expect(Object.keys(parsed as object).sort()).toEqual(
      ["entries", "originalPath", "version"],
    );
  });

  it("version === 1 (the only schema version seen in the wild)", () => {
    expect(index.version).toBe(1);
  });

  it("entries is an array with at least one element", () => {
    expect(Array.isArray(index.entries)).toBe(true);
    expect(index.entries.length).toBeGreaterThan(0);
  });

  it("originalPath is a non-empty string (sanitized in fixture)", () => {
    expect(typeof index.originalPath).toBe("string");
    expect(index.originalPath!.length).toBeGreaterThan(0);
  });

  it("matches the declared SessionsIndexFile type", () => {
    expectTypeOf(index).toEqualTypeOf<SessionsIndexFile>();
  });
});

describe("sessions-index.json — per-entry required fields", () => {
  // Field name → runtime typeof check.
  const REQUIRED_FIELDS: Record<keyof SessionsIndexEntry, string> = {
    sessionId: "string",
    fullPath: "string",
    fileMtime: "number",
    firstPrompt: "string",
    summary: "string",
    messageCount: "number",
    created: "string",
    modified: "string",
    gitBranch: "string",
    projectPath: "string",
    isSidechain: "boolean",
  };

  it("every entry has every required key (no optional metadata at this level)", () => {
    const expectedKeys = Object.keys(REQUIRED_FIELDS).sort();
    for (const [i, entry] of index.entries.entries()) {
      expect(Object.keys(entry).sort(), `entry[${i}] keys`).toEqual(
        expectedKeys,
      );
    }
  });

  it("every entry's field types match the declared shape", () => {
    for (const [i, entry] of index.entries.entries()) {
      for (const [field, expectedType] of Object.entries(REQUIRED_FIELDS)) {
        expect(
          typeof (entry as Record<string, unknown>)[field],
          `entry[${i}].${field}`,
        ).toBe(expectedType);
      }
    }
  });

  it("sessionId is a valid v4-shaped UUID", () => {
    // Loose UUID regex — accepts any version, since the CLI's source UUID
    // version is not part of the contract.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [i, entry] of index.entries.entries()) {
      expect(entry.sessionId, `entry[${i}].sessionId`).toMatch(uuidRe);
    }
  });

  it("fileMtime is a positive epoch-ms integer (not seconds)", () => {
    for (const [i, entry] of index.entries.entries()) {
      expect(entry.fileMtime, `entry[${i}].fileMtime`).toBeGreaterThan(0);
      expect(
        Number.isInteger(entry.fileMtime),
        `entry[${i}].fileMtime is integer`,
      ).toBe(true);
      // 10-digit (1_000_000_000) would be seconds → reject. ms is 13-digit.
      expect(
        entry.fileMtime,
        `entry[${i}].fileMtime is ms not seconds`,
      ).toBeGreaterThan(1_000_000_000_000);
    }
  });

  it("created/modified parse as ISO-8601 Zulu timestamps and modified >= created", () => {
    const isoZRe =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    for (const [i, entry] of index.entries.entries()) {
      expect(entry.created, `entry[${i}].created`).toMatch(isoZRe);
      expect(entry.modified, `entry[${i}].modified`).toMatch(isoZRe);
      const cMs = Date.parse(entry.created);
      const mMs = Date.parse(entry.modified);
      expect(Number.isNaN(cMs)).toBe(false);
      expect(Number.isNaN(mMs)).toBe(false);
      expect(mMs, `entry[${i}].modified >= created`).toBeGreaterThanOrEqual(
        cMs,
      );
    }
  });

  it("messageCount is a non-negative integer", () => {
    for (const [i, entry] of index.entries.entries()) {
      expect(Number.isInteger(entry.messageCount)).toBe(true);
      expect(
        entry.messageCount,
        `entry[${i}].messageCount`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("gitBranch may be the empty string (no-branch marker)", () => {
    // Documenting behavior: the CLI writes "" not null/undefined when there
    // is no branch. This test fails if any entry deviates AND uses something
    // else (null/undefined), which would mean the schema drifted.
    for (const [i, entry] of index.entries.entries()) {
      expect(typeof entry.gitBranch, `entry[${i}].gitBranch type`).toBe(
        "string",
      );
    }
  });

  it("entry matches the declared SessionsIndexEntry type", () => {
    expectTypeOf(index.entries[0]).toEqualTypeOf<SessionsIndexEntry>();
  });
});

describe("sessions-index.json — staleness signal", () => {
  // This block documents the staleness contract the source-of-truth YAML
  // pins: cached entry is valid iff entry.fileMtime === fs mtime of the
  // JSONL `fullPath` points at. The fixture is INTENTIONALLY stale — it
  // is a snapshot of a real on-disk index whose underlying JSONLs were
  // long-since renamed or deleted (15/15 entries dangling in the source).
  //
  // We cannot run a live fs.statSync against `<sanitized>\...` paths in
  // the fixture, so the test asserts the staleness *signal shape*: every
  // entry carries the timestamps and path needed to evaluate the rule.

  it("every entry exposes the three fields needed to compute staleness", () => {
    // The rule is:  isFresh := entry.fileMtime === fs.statSync(entry.fullPath).mtimeMs
    // Therefore each entry MUST carry fullPath, fileMtime, and a stable id.
    for (const [i, entry] of index.entries.entries()) {
      expect(entry.fullPath, `entry[${i}].fullPath`).toBeTruthy();
      expect(entry.fileMtime, `entry[${i}].fileMtime`).toBeGreaterThan(0);
      expect(entry.sessionId, `entry[${i}].sessionId`).toBeTruthy();
    }
  });

  it("fixture's newest fileMtime is older than the date this fixture was captured", () => {
    // Captured 2026-05-18. The newest entry mtime in this fixture is from
    // April 2026, illustrating that the on-disk index lagged 30+ days
    // behind the JSONLs it was supposed to cache. We assert that the
    // newest mtime in the file precedes the capture date — i.e. the
    // fixture is, by construction, a stale snapshot.
    const captureMs = Date.parse("2026-05-18T00:00:00.000Z");
    const newestEntryMs = Math.max(
      ...index.entries.map((e) => e.fileMtime),
    );
    expect(
      newestEntryMs,
      "newest entry fileMtime must be older than capture date — fixture demonstrates staleness",
    ).toBeLessThan(captureMs);
  });

  it("fullPath is an absolute Windows-style path (matches CLI's writer)", () => {
    // The CLI writes Windows paths with backslashes on Windows. Sanitized
    // fixture preserves that, since callers normalise on this assumption.
    for (const [i, entry] of index.entries.entries()) {
      expect(
        entry.fullPath,
        `entry[${i}].fullPath uses backslashes`,
      ).toContain("\\");
      expect(
        entry.fullPath,
        `entry[${i}].fullPath ends with .jsonl`,
      ).toMatch(/\.jsonl$/);
    }
  });
});
