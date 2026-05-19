// Source-of-truth test for `~/.claude/plugins/installed_plugins.json`.
// Companion to docs/sources-of-truth/installed-plugins-registry.yaml.
//
// Invariants asserted (mirror the YAML's `invariants` block):
//   - top-level shape `{ version: number, plugins: object }`
//   - every key in `plugins` matches `<name>@<marketplace>`
//   - every value is an array; each entry has the documented required fields
//   - `version` is EITHER semver OR a 12-char hex SHA
//   - `gitCommitSha` (when present) is 40 hex chars
//   - `scope == "project"` entries carry a `projectPath`
//
// Type-level: the fixture installation entries are assignable to
// `RegistryInstallation` from src/lib/plugin-loader.ts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  InstalledPluginsFile,
  RegistryInstallation,
} from "../../src/lib/plugin-loader";

const FIXTURE_PATH = resolve(
  __dirname,
  "fixtures/installed-plugins-registry.json",
);

const KEY_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;
const SHORT_SHA_RE = /^[0-9a-f]{12}$/;
const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function loadFixture(): InstalledPluginsFile {
  const text = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(text) as InstalledPluginsFile;
}

describe("installed-plugins-registry (source of truth)", () => {
  const data = loadFixture();

  it("top-level shape is { version: number, plugins: object }", () => {
    expect(data).toBeTypeOf("object");
    expect(data).not.toBeNull();
    expect(typeof data.version).toBe("number");
    expect(data.plugins).toBeTypeOf("object");
    expect(data.plugins).not.toBeNull();
    expect(Array.isArray(data.plugins)).toBe(false);
  });

  it("fixture covers semver, gitShortSha, and multi-installation cases", () => {
    const plugins = data.plugins ?? {};
    const keys = Object.keys(plugins);
    // Guard against the fixture being trimmed to the point where the union /
    // multi-install branches stop being exercised.
    expect(keys.length).toBeGreaterThanOrEqual(3);

    const allVersions = keys.flatMap((k) =>
      (plugins[k] ?? []).map((e) => e.version),
    );
    expect(allVersions.some((v) => SEMVER_RE.test(v))).toBe(true);
    expect(allVersions.some((v) => SHORT_SHA_RE.test(v))).toBe(true);

    const hasMultiInstall = keys.some((k) => (plugins[k] ?? []).length > 1);
    expect(hasMultiInstall).toBe(true);
  });

  it.each(Object.keys(loadFixture().plugins ?? {}))(
    "key %s matches `<name>@<marketplace>` regex",
    (key) => {
      expect(key).toMatch(KEY_RE);
    },
  );

  it("every value is an array of installation entries", () => {
    for (const [key, value] of Object.entries(data.plugins ?? {})) {
      expect(Array.isArray(value), `value for ${key} must be array`).toBe(true);
      expect((value as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it("each installation entry has documented required fields", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        const where = `${key}[${i}]`;
        expect(typeof entry.installPath, `${where}.installPath`).toBe("string");
        expect(entry.installPath.length, `${where}.installPath non-empty`)
          .toBeGreaterThan(0);
        expect(typeof entry.version, `${where}.version`).toBe("string");
      }
    }
  });

  it("each `version` matches semver OR 12-char hex SHA", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        const where = `${key}[${i}].version=${entry.version}`;
        const ok = SEMVER_RE.test(entry.version) || SHORT_SHA_RE.test(entry.version);
        expect(ok, `${where} must be semver or 12-char hex SHA`).toBe(true);
      }
    }
  });

  it("`gitCommitSha` (when present) is 40-char lowercase hex", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        if (entry.gitCommitSha === undefined) continue;
        expect(
          entry.gitCommitSha,
          `${key}[${i}].gitCommitSha must be 40-char hex`,
        ).toMatch(FULL_SHA_RE);
      }
    }
  });

  it("short-SHA `version` equals first 12 chars of `gitCommitSha`", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        if (!SHORT_SHA_RE.test(entry.version)) continue;
        expect(
          entry.gitCommitSha,
          `${key}[${i}] short-SHA version requires a gitCommitSha`,
        ).toBeDefined();
        expect(entry.gitCommitSha!.slice(0, 12)).toBe(entry.version);
      }
    }
  });

  it("`scope == 'project'` entries carry a `projectPath`", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        if (entry.scope !== "project") continue;
        expect(
          typeof entry.projectPath,
          `${key}[${i}] project-scope must have projectPath`,
        ).toBe("string");
        expect((entry.projectPath ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  it("`installedAt` / `lastUpdated` (when present) are ISO-8601 UTC", () => {
    for (const [key, installations] of Object.entries(data.plugins ?? {})) {
      for (const [i, entry] of (installations ?? []).entries()) {
        if (entry.installedAt !== undefined) {
          expect(entry.installedAt, `${key}[${i}].installedAt`).toMatch(
            ISO_8601_RE,
          );
        }
        if (entry.lastUpdated !== undefined) {
          expect(entry.lastUpdated, `${key}[${i}].lastUpdated`).toMatch(
            ISO_8601_RE,
          );
        }
      }
    }
  });

  it("type-level: fixture entries conform to `RegistryInstallation`", () => {
    // Compile-time check against the wire type in plugin-loader.ts. The
    // assertion below is type-only — it fails at `tsc` time if the fixture's
    // declared shape drifts from the consumer's expectations.
    expectTypeOf<InstalledPluginsFile["plugins"]>().toEqualTypeOf<
      Record<string, RegistryInstallation[]> | undefined
    >();
    expectTypeOf<RegistryInstallation>().toMatchTypeOf<{
      installPath: string;
      version: string;
    }>();
  });
});
