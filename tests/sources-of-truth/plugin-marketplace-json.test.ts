// Source-of-truth test for marketplace.json (task #4: plugin-marketplace-json).
//
// Validates the shape contract documented in
// `docs/sources-of-truth/plugin-marketplace-json.yaml` against the canonical
// fixture in `tests/sources-of-truth/fixtures/plugin-marketplace-json.json`.
//
// Why this test exists:
//   - marketplace.json is the metadata-fallback source for plugins whose own
//     plugin.json is missing (DESIGN-CONTEXT §2.9, spec §6.5). If the shape
//     drifts, `read_manifest()` in src-tauri/src/plugins/commands.rs will
//     silently degrade and plugin cards in the UI will show empty
//     descriptions.
//   - It is also the public catalog joined to installed_plugins.json via the
//     registry key `name@marketplace`. The join only works if `name`s here
//     are stable strings.
//
// No mocks, no skipIf, no "or empty state" escape clauses.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── Type contract ───────────────────────────────────────────────────────
// Hand-authored to mirror the YAML. There is no matching exported TS type
// in `src/lib/` yet (Claude Manager only reads the manifest indirectly via
// the Rust `read_manifest` helper), so this interface IS the source of
// truth for the JSON shape on the frontend side.

interface OwnerOrAuthor {
  name: string;
  email?: string;
  url?: string;
}

interface MarketplaceMetadata {
  description?: string;
  version?: string;
}

type PluginSource =
  | string
  | {
      source: string;
      url: string;
    };

interface LspServerSpec {
  command: string;
  args?: string[];
  extensionToLanguage: Record<string, string>;
  startupTimeout?: number;
}

interface MarketplacePluginEntry {
  name: string;
  description: string;
  version?: string;
  author?: OwnerOrAuthor;
  source: PluginSource;
  category?: string;
  homepage?: string;
  keywords?: string[];
  tags?: string[];
  strict?: boolean;
  skills?: string[] | string;
  lspServers?: Record<string, LspServerSpec>;
}

interface MarketplaceManifest {
  $schema?: string;
  name: string;
  id?: string;
  description?: string;
  owner: OwnerOrAuthor;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePluginEntry[];
}

// Per DESIGN-CONTEXT §2.5 + spec §6.3: `version` is either semver or a
// 12-char git SHA prefix. Anchored on both ends to reject leading/trailing
// junk. Coordinated with inv-installed-plugins-registry (task #5 peer):
// installed_plugins.json's `version` follows the same rule, so the two
// validators stay in sync.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const GIT_SHA_PREFIX_RE = /^[0-9a-f]{12}$/;

function isAcceptableVersion(v: string): boolean {
  return SEMVER_RE.test(v) || GIT_SHA_PREFIX_RE.test(v);
}

// ── Fixture load ────────────────────────────────────────────────────────

const FIXTURE_PATH = join(
  __dirname,
  "fixtures",
  "plugin-marketplace-json.json",
);

function loadFixture(): MarketplaceManifest {
  const text = readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(text) as MarketplaceManifest;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("source-of-truth: marketplace.json", () => {
  const manifest = loadFixture();

  describe("top-level schema", () => {
    it("has a non-empty `name` (marketplace identifier)", () => {
      expect(typeof manifest.name).toBe("string");
      expect(manifest.name.length).toBeGreaterThan(0);
      expect(manifest.name).toBe("example-marketplace");
    });

    it("has an `owner` object with a non-empty `name`", () => {
      expect(manifest.owner).toBeTypeOf("object");
      expect(typeof manifest.owner.name).toBe("string");
      expect(manifest.owner.name.length).toBeGreaterThan(0);
    });

    it("exposes a `description` (either top-level or under `metadata.description`)", () => {
      // The reader contract is: check both locations because real-world
      // marketplaces split between the two shapes. The fixture intentionally
      // sets BOTH so this assertion exercises the dual-location lookup.
      const topLevel = manifest.description;
      const nested = manifest.metadata?.description;
      const resolved = topLevel ?? nested;
      expect(typeof resolved).toBe("string");
      expect((resolved ?? "").length).toBeGreaterThan(0);
    });

    it("has a `plugins` array (catalog of available plugins)", () => {
      expect(Array.isArray(manifest.plugins)).toBe(true);
      // Fixture must exhibit variation — at least 3 entries per investigation
      // brief — so per-entry assertions below have meaningful coverage.
      expect(manifest.plugins.length).toBeGreaterThanOrEqual(3);
    });

    it("$schema, when present, is a URL string", () => {
      // $schema is optional but if set must be a URL — Anthropic's official
      // marketplace uses it; community marketplaces omit it.
      if (manifest.$schema !== undefined) {
        expect(typeof manifest.$schema).toBe("string");
        expect(manifest.$schema).toMatch(/^https?:\/\//);
      }
    });
  });

  describe("plugin entry shape (fallback-metadata contract)", () => {
    it("every plugin has a non-empty `name` (joins to installed_plugins.json key prefix)", () => {
      for (const p of manifest.plugins) {
        expect(typeof p.name).toBe("string");
        expect(p.name.length).toBeGreaterThan(0);
        // `name` is the part BEFORE `@` in registry keys — it must not
        // itself contain `@` or it would break splitRegistryKey() in
        // src/lib/plugin-loader.ts.
        expect(p.name.includes("@")).toBe(false);
      }
    });

    it("every plugin has a non-empty `description` (load-bearing for the UI fallback)", () => {
      // When plugin.json is absent, Claude Manager reads `description` from
      // here. Empty descriptions would render blank cards.
      for (const p of manifest.plugins) {
        expect(typeof p.description).toBe("string");
        expect(p.description.length).toBeGreaterThan(0);
      }
    });

    it("every plugin has a `source` of one of the two observed shapes", () => {
      for (const p of manifest.plugins) {
        const isStringSource = typeof p.source === "string";
        const isObjectSource =
          typeof p.source === "object" &&
          p.source !== null &&
          typeof (p.source as { source: unknown }).source === "string" &&
          typeof (p.source as { url: unknown }).url === "string";
        expect(isStringSource || isObjectSource).toBe(true);
      }
    });

    it("`version`, when present, is semver OR a 12-char git SHA prefix", () => {
      // Coordinated with inv-installed-plugins-registry (task #5): the same
      // rule applies to installed_plugins.json `version`. See
      // DESIGN-CONTEXT §2.5 and spec §6.3.
      let semverSeen = false;
      let shaSeen = false;
      let missingSeen = false;
      for (const p of manifest.plugins) {
        if (p.version === undefined) {
          missingSeen = true;
          continue;
        }
        expect(typeof p.version).toBe("string");
        expect(isAcceptableVersion(p.version)).toBe(true);
        if (SEMVER_RE.test(p.version)) semverSeen = true;
        if (GIT_SHA_PREFIX_RE.test(p.version)) shaSeen = true;
      }
      // The fixture must cover both formats AND an entry without `version`
      // so the validator doesn't silently regress on any of the three
      // observed shapes.
      expect(semverSeen).toBe(true);
      expect(shaSeen).toBe(true);
      expect(missingSeen).toBe(true);
    });

    it("`author`, when present, has a non-empty `name`", () => {
      for (const p of manifest.plugins) {
        if (p.author === undefined) continue;
        expect(typeof p.author.name).toBe("string");
        expect(p.author.name.length).toBeGreaterThan(0);
      }
    });

    it("`skills`, when present, is a string OR an array of strings", () => {
      for (const p of manifest.plugins) {
        if (p.skills === undefined) continue;
        if (typeof p.skills === "string") {
          expect(p.skills.length).toBeGreaterThan(0);
        } else {
          expect(Array.isArray(p.skills)).toBe(true);
          for (const s of p.skills) expect(typeof s).toBe("string");
        }
      }
    });

    it("`lspServers`, when present, maps server-name → { command, extensionToLanguage }", () => {
      for (const p of manifest.plugins) {
        if (p.lspServers === undefined) continue;
        for (const [serverName, spec] of Object.entries(p.lspServers)) {
          expect(serverName.length).toBeGreaterThan(0);
          expect(typeof spec.command).toBe("string");
          expect(spec.command.length).toBeGreaterThan(0);
          expect(typeof spec.extensionToLanguage).toBe("object");
          expect(spec.extensionToLanguage).not.toBeNull();
          // Every key must start with "." and every value must be a string.
          for (const [ext, lang] of Object.entries(spec.extensionToLanguage)) {
            expect(ext.startsWith(".")).toBe(true);
            expect(typeof lang).toBe("string");
            expect(lang.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("`tags`, when present, is an array of strings", () => {
      for (const p of manifest.plugins) {
        if (p.tags === undefined) continue;
        expect(Array.isArray(p.tags)).toBe(true);
        for (const t of p.tags) expect(typeof t).toBe("string");
      }
    });
  });

  describe("fixture exhibits the documented variation", () => {
    // The investigation brief requires the fixture to show variation across
    // the polymorphic fields. These assertions guard against future edits
    // that would water-down the fixture.

    it("includes at least one entry with a string `source` (relative path)", () => {
      const hits = manifest.plugins.filter((p) => typeof p.source === "string");
      expect(hits.length).toBeGreaterThan(0);
    });

    it("includes at least one entry with an object `source` (external URL)", () => {
      const hits = manifest.plugins.filter(
        (p) => typeof p.source === "object" && p.source !== null,
      );
      expect(hits.length).toBeGreaterThan(0);
    });

    it("includes at least one entry with `lspServers` defined", () => {
      const hits = manifest.plugins.filter((p) => p.lspServers !== undefined);
      expect(hits.length).toBeGreaterThan(0);
    });

    it("includes at least one entry with a `skills` array (skill-bundler plugin)", () => {
      const hits = manifest.plugins.filter((p) => Array.isArray(p.skills));
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  describe("relationship to installed_plugins.json", () => {
    // marketplace.json answers "what's AVAILABLE"; installed_plugins.json
    // answers "what's INSTALLED". The join key is the registry key
    // `<plugin.name>@<marketplace.name>`. This test documents (and locks in)
    // the shape that join depends on.

    it("plugins[].name + marketplace.name compose a valid registry key", () => {
      for (const p of manifest.plugins) {
        const registryKey = `${p.name}@${manifest.name}`;
        // Round-trip through the same split rule plugin-loader.ts uses
        // (lastIndexOf('@')) and confirm we recover both halves.
        const at = registryKey.lastIndexOf("@");
        expect(at).toBeGreaterThan(0);
        expect(registryKey.slice(0, at)).toBe(p.name);
        expect(registryKey.slice(at + 1)).toBe(manifest.name);
      }
    });
  });
});
