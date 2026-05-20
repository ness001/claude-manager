// Source-of-truth contract test for ~/.claude/sessions/{pid}.json.
//
// Pins the on-disk shape that claude-manager reads to compute SessionMeta
// (spec §5.1) and derive ALIVE state (spec §5.3). The fixture is a verbatim
// copy of a real file with username + project name redacted — see
// docs/sources-of-truth/sessions-pid-files.yaml for the full schema, the
// liveness contract, and the rationale for every assertion below.
//
// Notable: the documented TS interface `PidFileData` claims `startedAt:
// string`, but the on-disk shape (and what the liveness ±60s math actually
// needs) is INTEGER epoch ms. This test asserts the on-disk truth so the
// type mismatch (gotcha "rust-startedat-type-mismatch" in the YAML) cannot
// be hidden by a passing test suite.

import { describe, expect, expectTypeOf, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PidFileData, SessionKind } from "../../src/lib/session-types";

const FIXTURE_PATH = resolve(
  __dirname,
  "fixtures",
  "sessions-pid-files.json",
);

// Observed enum values per the YAML — kept in sync there.
const KIND_VALUES: readonly string[] = ["interactive", "headless", "sdk"];
const ENTRYPOINT_VALUES: readonly string[] = ["cli", "vscode"];
const STATUS_VALUES: readonly string[] = ["idle", "busy"];

/**
 * Shape of the fixture as it actually exists on disk — strictly a
 * superset of the TS PidFileData interface, with `startedAt` typed as
 * `number` (epoch ms) to match reality rather than the buggy TS type.
 * If/when src/lib/session-types.ts is corrected, swap this for
 * `PidFileData` directly.
 */
interface PidFileOnDisk {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  kind: string;
  entrypoint: string;
  // Optional fields observed on real files but not yet in PidFileData:
  version?: string;
  peerProtocol?: number;
  status?: string;
  updatedAt?: number;
  name?: string;
  procStart?: string;
}

function loadFixture(): PidFileOnDisk {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as PidFileOnDisk;
}

describe("source of truth: ~/.claude/sessions/{pid}.json", () => {
  const data = loadFixture();

  // ── Required fields (per YAML `required: true`) ──────────────────

  it("has a positive-integer `pid`", () => {
    expect(typeof data.pid).toBe("number");
    expect(Number.isInteger(data.pid)).toBe(true);
    expect(data.pid).toBeGreaterThan(0);
  });

  it("has a UUID-shaped `sessionId`", () => {
    expect(typeof data.sessionId).toBe("string");
    // Loose UUID v4-ish shape — 8-4-4-4-12 hex.
    expect(data.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("has a non-empty string `cwd`", () => {
    expect(typeof data.cwd).toBe("string");
    expect(data.cwd.length).toBeGreaterThan(0);
  });

  it("has an INTEGER `startedAt` (epoch ms) — NOT a string, despite the TS type", () => {
    // Asserting integer here is load-bearing: the Rust struct
    // `PidFileData.started_at: String` (and the TS `string` equivalent)
    // will silently reject every real file because serde refuses
    // integer→String coercion. If this test ever passes with a string,
    // someone has rewritten the fixture to hide the type bug.
    expect(typeof data.startedAt).toBe("number");
    expect(Number.isInteger(data.startedAt)).toBe(true);
    // Plausible epoch-ms range: after 2020-01-01, before year 2100.
    expect(data.startedAt).toBeGreaterThan(1_577_836_800_000);
    expect(data.startedAt).toBeLessThan(4_102_444_800_000);
  });

  it("has a `kind` whose value is one of the documented enum values", () => {
    expect(typeof data.kind).toBe("string");
    expect(KIND_VALUES).toContain(data.kind);
  });

  it("has an `entrypoint` whose value is one of the documented enum values", () => {
    expect(typeof data.entrypoint).toBe("string");
    expect(ENTRYPOINT_VALUES).toContain(data.entrypoint);
  });

  // ── Optional-but-observed fields (per YAML) ──────────────────────

  it("when `version` is present it is a semver-ish string", () => {
    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe("string");
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("when `peerProtocol` is present it is a positive integer", () => {
    expect(data.peerProtocol).toBeDefined();
    expect(typeof data.peerProtocol).toBe("number");
    expect(Number.isInteger(data.peerProtocol as number)).toBe(true);
    expect(data.peerProtocol as number).toBeGreaterThan(0);
  });

  it("when `status` is present it is one of the documented enum values", () => {
    expect(data.status).toBeDefined();
    expect(typeof data.status).toBe("string");
    expect(STATUS_VALUES).toContain(data.status);
  });

  it("when `updatedAt` is present it is an integer >= startedAt", () => {
    expect(data.updatedAt).toBeDefined();
    expect(typeof data.updatedAt).toBe("number");
    expect(Number.isInteger(data.updatedAt as number)).toBe(true);
    expect(data.updatedAt as number).toBeGreaterThanOrEqual(data.startedAt);
  });

  it("when `name` is present it is a string", () => {
    expect(data.name).toBeDefined();
    expect(typeof data.name).toBe("string");
  });

  // ── Fixture sanitization safety guard ────────────────────────────

  it("fixture safety guard: no real Windows username or private project name leaked", () => {
    // The sanitization step replaces `lianli` (the original author's
    // Windows username) with `<user>` and the private project slug
    // `laa-workspace` with `example-project`. If a contributor pastes a
    // raw file over this fixture, those substitutions will be missing
    // and this assertion will fail.
    expect(data.cwd).toContain("<user>");
    expect(data.cwd).not.toMatch(/lianli/i);
    expect(data.cwd).not.toMatch(/laa-workspace/i);
    if (data.name !== undefined) {
      expect(data.name).not.toMatch(/dev\.azure\.com/i);
      expect(data.name).not.toMatch(/laa-workspace/i);
    }
  });

  // ── Type-level pin: the (currently buggy) TS interface stays in scope ─

  it("type-level: PidFileData fields are pinned (compile-time check)", () => {
    // `expectTypeOf` is the project convention for type-only assertions
    // (CLAUDE.md "Executing a plan task" rule 6). We pin the shape of
    // the PidFileData interface here so accidental drift in
    // src/lib/session-types.ts will fail the build, not just this test.
    // Historical note: this field was incorrectly typed `string` for a
    // while — see gotcha "rust-startedat-type-mismatch" in the YAML.
    type Expected = {
      pid: number;
      sessionId: string;
      cwd: string;
      startedAt: number; // epoch ms — matches the on-disk JSON shape
      kind: SessionKind;
      entrypoint: string;
    };
    expectTypeOf<PidFileData>().toEqualTypeOf<Expected>();
  });
});
