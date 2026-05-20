// Source-of-truth contract test for the installed-plugin directory layout
// under `~/.claude/plugins/cache/{marketplace}/{plugin-name}/{version}/`.
//
// This test pins the on-disk shape that src/lib/plugin-loader.ts (TS) and
// src-tauri/src/plugins/commands.rs (Rust `read_plugin_contents`) read at
// runtime. See docs/sources-of-truth/plugin-directory-layout.yaml for the
// full schema, references, and gotchas.
//
// The happy-path fixture mirrors the `.claude-plugin/plugin.json` variant —
// the canonical and ONLY location the Rust loader probes (commands.rs:272-289),
// matching real installs (superpowers, ralph-skills, karpathy-skills,
// obsidian) — plus one skill, one agent, one hooks.json, and a CLAUDE.md at
// the root. A sibling fixture (`example-plugin-no-manifest/`) pins the
// fallback path: NO plugin.json + per-plugin
// `.claude-plugin/marketplace.json` (matching `anthropic-agent-skills/*`).

import { describe, it, expect, expectTypeOf } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type {
  AgentInfo,
  HookInfo,
  PluginMeta,
  SkillInfo,
} from "../../src/lib/plugin-types";

const PLUGIN_ROOT = resolve(
  __dirname,
  "fixtures",
  "plugin-directory-layout",
  "example-plugin",
);

// Fallback fixture: a plugin shipping NO plugin.json, only a per-plugin
// `.claude-plugin/marketplace.json`. Pins the loader's actual fallback path
// (src-tauri/src/plugins/commands.rs:272-289) — which is per-plugin, NOT
// marketplace-root.
const NO_MANIFEST_PLUGIN_ROOT = resolve(
  __dirname,
  "fixtures",
  "plugin-directory-layout",
  "example-plugin-no-manifest",
);

// ─── tiny frontmatter parser ─────────────────────────────────────────────
// Mirrors the Rust scanner's read_frontmatter (commands.rs): grab the block
// between the first pair of `---` markers and parse each `key: value` line.
// `tools` gets the bracket-strip + comma-split treatment so the test parses
// the same flow-sequence shape the Rust scanner accepts.

interface ParsedFrontmatter {
  raw: Record<string, string>;
  tools?: string[];
}

function readFrontmatter(filePath: string): ParsedFrontmatter {
  const text = readFileSync(filePath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`No frontmatter block in ${filePath}`);
  // Append a sentinel column-0 line so the lookahead matches the last key's
  // value (JS RegExp has no `\Z` anchor — use a synthetic terminator).
  const body = match[1] + "\n__END__:";
  const raw: Record<string, string> = {};
  // Greedy multi-line capture: a key starts at column 0; its value runs
  // until the next column-0 key. Handles single-line and multi-line
  // (`description: |`-style) values uniformly.
  const lineRe =
    /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*([\s\S]*?)(?=^[A-Za-z_][A-Za-z0-9_-]*:)/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(body)) !== null) {
    if (m[1] === "__END__") continue;
    raw[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  let tools: string[] | undefined;
  if (raw.tools !== undefined) {
    tools = raw.tools
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((t) => t.trim().replace(/^["']|["']$/g, ""))
      .filter((t) => t.length > 0);
  }
  return { raw, tools };
}

// ─── manifest / hooks types reflected from the fixture ──────────────────

interface PluginJson {
  name: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string } | string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  [extra: string]: unknown;
}

interface HookCommand {
  type: string;
  command: string;
  async?: boolean;
}
interface MatcherEntry {
  matcher?: string;
  hooks: HookCommand[];
}
interface HooksJson {
  hooks: Record<string, MatcherEntry[]>;
  [extra: string]: unknown;
}

// ─── tests ───────────────────────────────────────────────────────────────

describe("source of truth: plugin directory layout", () => {
  describe("required paths exist", () => {
    it.each([
      [".claude-plugin/plugin.json", "manifest (canonical and ONLY loader-probed location)"],
      ["skills/foo-skill/SKILL.md", "skill"],
      ["agents/bar-agent.md", "agent"],
      ["hooks/hooks.json", "hooks definition"],
      ["CLAUDE.md", "plugin-scoped CLAUDE.md"],
    ])("%s — %s", (rel) => {
      expect(existsSync(resolve(PLUGIN_ROOT, rel))).toBe(true);
    });

    it("plugin.json is at <plugin-root>/.claude-plugin/plugin.json (the loader's canonical probe)", () => {
      // Explicit pin: per commands.rs:272-289 the Rust loader probes ONLY
      // `<root>/.claude-plugin/plugin.json` — root-level `plugin.json` is
      // not supported today. Spec §6.5 documents the nested location too.
      expect(
        existsSync(resolve(PLUGIN_ROOT, ".claude-plugin", "plugin.json")),
      ).toBe(true);
      // And confirm we are NOT relying on a root-level plugin.json — the
      // loader would not see one if present, but the canonical fixture
      // must not pretend otherwise.
      expect(existsSync(resolve(PLUGIN_ROOT, "plugin.json"))).toBe(false);
    });
  });

  describe("fallback: plugin with no plugin.json (per-plugin marketplace.json)", () => {
    // Pins the actual loader fallback (commands.rs:272-289):
    //   <installPath>/.claude-plugin/plugin.json (missing)
    //   → <installPath>/.claude-plugin/marketplace.json (used)
    // The marketplace-root path
    // `cache/{marketplace}/.claude-plugin/marketplace.json` does NOT exist
    // on disk and is NOT probed.

    it("has NO plugin.json at root or under .claude-plugin/", () => {
      expect(existsSync(resolve(NO_MANIFEST_PLUGIN_ROOT, "plugin.json"))).toBe(
        false,
      );
      expect(
        existsSync(
          resolve(NO_MANIFEST_PLUGIN_ROOT, ".claude-plugin", "plugin.json"),
        ),
      ).toBe(false);
    });

    it("has marketplace.json at <plugin-root>/.claude-plugin/marketplace.json (per-plugin, NOT marketplace-root)", () => {
      expect(
        existsSync(
          resolve(NO_MANIFEST_PLUGIN_ROOT, ".claude-plugin", "marketplace.json"),
        ),
      ).toBe(true);
    });

    it("marketplace.json exposes a non-empty plugins[] with name + description (the loader picks plugins[0])", () => {
      const mp = JSON.parse(
        readFileSync(
          resolve(NO_MANIFEST_PLUGIN_ROOT, ".claude-plugin", "marketplace.json"),
          "utf8",
        ),
      ) as { plugins: Array<{ name: string; description: string }> };
      expect(Array.isArray(mp.plugins)).toBe(true);
      expect(mp.plugins.length).toBeGreaterThan(0);
      const first = mp.plugins[0];
      expect(typeof first.name).toBe("string");
      expect(first.name.length).toBeGreaterThan(0);
      expect(typeof first.description).toBe("string");
      expect(first.description.length).toBeGreaterThan(0);
    });
  });

  describe("plugin.json schema", () => {
    const manifest: PluginJson = JSON.parse(
      readFileSync(
        resolve(PLUGIN_ROOT, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    );

    it("has required `name` (string)", () => {
      expect(typeof manifest.name).toBe("string");
      expect(manifest.name.length).toBeGreaterThan(0);
    });

    it("has a `description` string (surfaced as PluginMeta.description)", () => {
      expect(typeof manifest.description).toBe("string");
      expect((manifest.description as string).length).toBeGreaterThan(0);
    });

    it("has a `version` string (semver-shaped)", () => {
      expect(typeof manifest.version).toBe("string");
      // Spec §6.3 permits semver OR 12-char SHA. The fixture uses semver so
      // we pin the dotted form here; SHA shape is documented in the YAML.
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("documents optional metadata fields (author, homepage, repository, license, keywords)", () => {
      // These are advisory per the YAML — assert their types when present.
      if (manifest.author !== undefined) {
        const a = manifest.author;
        const isObj =
          typeof a === "object" && a !== null && typeof a.name === "string";
        const isStr = typeof a === "string";
        expect(isObj || isStr).toBe(true);
      }
      if (manifest.homepage !== undefined) {
        expect(() => new URL(manifest.homepage as string)).not.toThrow();
      }
      if (manifest.repository !== undefined) {
        expect(typeof manifest.repository).toBe("string");
      }
      if (manifest.license !== undefined) {
        expect(typeof manifest.license).toBe("string");
      }
      if (manifest.keywords !== undefined) {
        expect(Array.isArray(manifest.keywords)).toBe(true);
        for (const k of manifest.keywords) expect(typeof k).toBe("string");
      }
    });
  });

  describe("skills/<name>/SKILL.md frontmatter", () => {
    const fm = readFrontmatter(
      resolve(PLUGIN_ROOT, "skills", "foo-skill", "SKILL.md"),
    );

    it("exposes `name` and `description` strings", () => {
      expect(typeof fm.raw.name).toBe("string");
      expect(fm.raw.name.length).toBeGreaterThan(0);
      expect(typeof fm.raw.description).toBe("string");
      expect(fm.raw.description.length).toBeGreaterThan(0);
    });
  });

  describe("agents/<name>.md frontmatter (AgentInfo fields)", () => {
    const fm = readFrontmatter(
      resolve(PLUGIN_ROOT, "agents", "bar-agent.md"),
    );

    it("exposes required `name` and `description` strings", () => {
      expect(typeof fm.raw.name).toBe("string");
      expect(fm.raw.name.length).toBeGreaterThan(0);
      expect(typeof fm.raw.description).toBe("string");
      expect(fm.raw.description.length).toBeGreaterThan(0);
    });

    it("recognises optional `tools` (flow-sequence string[])", () => {
      expect(Array.isArray(fm.tools)).toBe(true);
      expect((fm.tools as string[]).length).toBeGreaterThan(0);
      for (const t of fm.tools as string[]) {
        expect(typeof t).toBe("string");
        expect(t.length).toBeGreaterThan(0);
      }
    });

    it("recognises optional `model` string", () => {
      expect(typeof fm.raw.model).toBe("string");
      expect(fm.raw.model.length).toBeGreaterThan(0);
    });

    it("recognises optional `color` string", () => {
      expect(typeof fm.raw.color).toBe("string");
      expect(fm.raw.color.length).toBeGreaterThan(0);
    });
  });

  describe("hooks/hooks.json schema", () => {
    const hooks: HooksJson = JSON.parse(
      readFileSync(resolve(PLUGIN_ROOT, "hooks", "hooks.json"), "utf8"),
    );

    it("has a top-level `hooks` object with at least one event key", () => {
      expect(typeof hooks.hooks).toBe("object");
      expect(hooks.hooks).not.toBeNull();
      expect(Object.keys(hooks.hooks).length).toBeGreaterThan(0);
    });

    it("each event maps to an array of matcher entries with shaped commands", () => {
      for (const [event, entries] of Object.entries(hooks.hooks)) {
        expect(typeof event).toBe("string");
        expect(Array.isArray(entries)).toBe(true);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          if (entry.matcher !== undefined) {
            expect(typeof entry.matcher).toBe("string");
          }
          expect(Array.isArray(entry.hooks)).toBe(true);
          expect(entry.hooks.length).toBeGreaterThan(0);
          for (const cmd of entry.hooks) {
            expect(typeof cmd.type).toBe("string");
            expect(cmd.type.length).toBeGreaterThan(0);
            expect(typeof cmd.command).toBe("string");
            expect(cmd.command.length).toBeGreaterThan(0);
            if (cmd.async !== undefined) {
              expect(typeof cmd.async).toBe("boolean");
            }
          }
        }
      }
    });

    it("documents the SessionStart event (most common in real plugins)", () => {
      expect(hooks.hooks.SessionStart).toBeDefined();
      expect(Array.isArray(hooks.hooks.SessionStart)).toBe(true);
    });
  });

  describe("type-level contract with src/lib/plugin-types.ts", () => {
    // Pin the shapes the loader consumes — if anyone narrows or widens
    // these types upstream, the test should be the first thing to fail.
    it("PluginMeta fields", () => {
      expectTypeOf<PluginMeta>().toHaveProperty("name").toEqualTypeOf<string>();
      expectTypeOf<PluginMeta>()
        .toHaveProperty("marketplace")
        .toEqualTypeOf<string>();
      expectTypeOf<PluginMeta>()
        .toHaveProperty("version")
        .toEqualTypeOf<string>();
      expectTypeOf<PluginMeta>()
        .toHaveProperty("installPath")
        .toEqualTypeOf<string>();
      expectTypeOf<PluginMeta>()
        .toHaveProperty("hasClaudeMd")
        .toEqualTypeOf<boolean>();
    });

    it("SkillInfo fields", () => {
      expectTypeOf<SkillInfo>().toEqualTypeOf<{
        name: string;
        description: string;
      }>();
    });

    it("AgentInfo optional fields match documented frontmatter", () => {
      expectTypeOf<AgentInfo>().toHaveProperty("name").toEqualTypeOf<string>();
      expectTypeOf<AgentInfo>()
        .toHaveProperty("description")
        .toEqualTypeOf<string>();
      expectTypeOf<AgentInfo>()
        .toHaveProperty("tools")
        .toEqualTypeOf<string[] | undefined>();
      expectTypeOf<AgentInfo>()
        .toHaveProperty("model")
        .toEqualTypeOf<string | undefined>();
      expectTypeOf<AgentInfo>()
        .toHaveProperty("color")
        .toEqualTypeOf<string | undefined>();
    });

    it("HookInfo fields", () => {
      expectTypeOf<HookInfo>().toEqualTypeOf<{
        event: string;
        command: string;
      }>();
    });
  });
});
