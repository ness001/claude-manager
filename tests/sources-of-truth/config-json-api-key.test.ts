// Source-of-truth contract test for ~/.claude/config.json.
//
// This test pins the shape we rely on for the General / API settings section
// (spec §9.2) and the first-launch API-key prerequisite check (spec §11.1).
// It also acts as a SAFETY GUARD: the `primaryApiKey` field must match
// /REDACTED/i so that a future contributor cannot silently land a real key by
// dropping their own ~/.claude/config.json on top of the fixture.
//
// See docs/sources-of-truth/config-json-api-key.yaml for the full schema.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ConfigJson {
  _comment?: string;
  primaryApiKey: string;
  ANTHROPIC_BASE_URL?: string;
  [extra: string]: unknown;
}

const FIXTURE_PATH = resolve(
  __dirname,
  "fixtures",
  "config-json-api-key.json",
);

function loadFixture(): ConfigJson {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw) as ConfigJson;
}

describe("source of truth: ~/.claude/config.json", () => {
  const cfg = loadFixture();

  it("has a string `primaryApiKey` with the documented `sk-ant-` prefix", () => {
    expect(typeof cfg.primaryApiKey).toBe("string");
    expect(cfg.primaryApiKey.length).toBeGreaterThan(0);
    expect(cfg.primaryApiKey.startsWith("sk-ant-")).toBe(true);
  });

  it("fixture safety guard: `primaryApiKey` must look REDACTED (no real keys committed)", () => {
    // This is the load-bearing assertion. If you are a contributor and this
    // test starts failing, you almost certainly copied your own
    // ~/.claude/config.json over the fixture. Revert and use the synthetic
    // `sk-ant-REDACTED-FIXTURE-VALUE` form instead.
    expect(cfg.primaryApiKey).toMatch(/REDACTED/i);
  });

  it("when `ANTHROPIC_BASE_URL` is present it is a parseable URL string", () => {
    // The field is optional on real disk (CLI only writes it when the user
    // has configured a custom endpoint), but the fixture sets it so we can
    // pin the type contract.
    expect(cfg.ANTHROPIC_BASE_URL).toBeDefined();
    expect(typeof cfg.ANTHROPIC_BASE_URL).toBe("string");
    expect(() => new URL(cfg.ANTHROPIC_BASE_URL as string)).not.toThrow();
  });

  it("documents the fixture is synthetic via a `_comment` field", () => {
    // JSON has no comment syntax, so we encode the warning inline. Removing
    // this would weaken the human signal that the file is a stub.
    expect(typeof cfg._comment).toBe("string");
    expect(cfg._comment).toMatch(/synthetic|fixture/i);
  });
});
