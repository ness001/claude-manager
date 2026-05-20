// Source-of-truth test for `~/.claude/skills/` — see
// docs/sources-of-truth/custom-skills-directory.yaml.
//
// Investigator: inv-custom-skills-directory (task #3, team sot-investigation).
// Reviewer: inv-plugin-marketplace (task #4).
//
// Asserts the on-disk shape of a single custom skill against sanitized
// fixtures committed under tests/sources-of-truth/fixtures/. The fixtures
// mirror the *contract* the Rust scanner relies on
// (src-tauri/src/skills/commands.rs); the test re-implements the contract
// in TypeScript and pins both sides to the same fixtures so divergence
// between the Rust scanner and TypeScript consumers becomes a test failure.
//
// No js-yaml dependency (not in package.json — see investigation notes).
// The Rust parser is a minimal flat key:value reader; we mirror its
// behavior exactly so the test exercises the real contract, not a richer
// YAML parser's lenience.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { CustomSkill } from "../../src/lib/skill-types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURES_ROOT = resolve(
  __dirname,
  "fixtures",
  "custom-skills-directory",
);

// Pinned fixture inventory. New fixtures must be added here AND to disk —
// the explicit list keeps the test from silently widening when someone drops
// an unrelated file under the fixtures dir.
const FIXTURE_DIRS = ["example-skill", "example-skill-no-name"] as const;
type FixtureDirName = (typeof FIXTURE_DIRS)[number];

// ---------------------------------------------------------------------------
// Frontmatter parser — mirrors src-tauri/src/skills/commands.rs::read_frontmatter
// (commands.rs:74-100). Flat key:value pairs only; strips surrounding
// straight quotes; returns null when the leading `---` fence is missing.
// ---------------------------------------------------------------------------

interface ParsedSkillFile {
  frontmatter: Record<string, string>;
  body: string;
}

const FRONTMATTER_FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseSkillMd(text: string): ParsedSkillFile | null {
  const match = FRONTMATTER_FENCE.exec(text);
  if (match === null) {
    return null;
  }
  const [, fmBlock, body] = match;
  const frontmatter: Record<string, string> = {};
  for (const rawLine of fmBlock.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body };
}

// Mirrors the Rust derivedFields.effectiveName resolution
// (commands.rs:55-59): trim the frontmatter name; if empty, fall back to the
// directory name.
function effectiveName(
  frontmatter: Record<string, string>,
  dirName: string,
): string {
  const trimmed = (frontmatter.name ?? "").trim();
  return trimmed.length > 0 ? trimmed : dirName;
}

// Build the CustomSkill wire record for a fixture dir — exercises the same
// derivation logic the Rust IPC command would apply.
function buildCustomSkill(dirName: FixtureDirName): CustomSkill {
  const dirPath = join(FIXTURES_ROOT, dirName);
  const skillMdPath = join(dirPath, "SKILL.md");
  const text = readFileSync(skillMdPath, "utf8");
  const parsed = parseSkillMd(text);
  if (parsed === null) {
    throw new Error(
      `Fixture ${dirName}/SKILL.md has no parseable frontmatter — ` +
        `fixture invariant broken.`,
    );
  }
  return {
    name: effectiveName(parsed.frontmatter, dirName),
    description: (parsed.frontmatter.description ?? "").trim(),
    dirPath,
    skillMdPath,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("source of truth: ~/.claude/skills/{skill-dir}/SKILL.md", () => {
  it("fixtures root exists and is a directory", () => {
    const stat = statSync(FIXTURES_ROOT);
    expect(stat.isDirectory()).toBe(true);
  });

  it("contains exactly the pinned fixture directories", () => {
    const onDisk = readdirSync(FIXTURES_ROOT)
      .filter((name) => statSync(join(FIXTURES_ROOT, name)).isDirectory())
      .sort();
    expect(onDisk).toEqual([...FIXTURE_DIRS].sort());
  });

  describe.each(FIXTURE_DIRS)("fixture %s", (dirName) => {
    const dirPath = join(FIXTURES_ROOT, dirName);
    const skillMdPath = join(dirPath, "SKILL.md");

    it("is a directory (custom skills are directories, not files)", () => {
      expect(statSync(dirPath).isDirectory()).toBe(true);
    });

    it("contains a SKILL.md file (required by the scanner)", () => {
      expect(statSync(skillMdPath).isFile()).toBe(true);
    });

    it("SKILL.md has YAML frontmatter delimited by `---` fences", () => {
      const text = readFileSync(skillMdPath, "utf8");
      const parsed = parseSkillMd(text);
      expect(parsed).not.toBeNull();
      // Body is allowed to be empty, but the fence must be present.
      expect(text.startsWith("---")).toBe(true);
    });

    it("frontmatter is a flat key/value map (matches Rust parser shape)", () => {
      const parsed = parseSkillMd(readFileSync(skillMdPath, "utf8"));
      expect(parsed).not.toBeNull();
      // Each value must be a string — no nested objects, no arrays.
      for (const [k, v] of Object.entries(parsed!.frontmatter)) {
        expect(typeof k).toBe("string");
        expect(typeof v).toBe("string");
      }
    });

    it("builds into a CustomSkill record with the documented derived fields", () => {
      const skill = buildCustomSkill(dirName);
      expect(skill.dirPath).toBe(dirPath);
      expect(skill.skillMdPath).toBe(skillMdPath);
      expect(typeof skill.name).toBe("string");
      expect(skill.name.length).toBeGreaterThan(0);
      expect(typeof skill.description).toBe("string");
    });
  });

  it("effectiveName: uses frontmatter.name when present", () => {
    const skill = buildCustomSkill("example-skill");
    // The fixture's frontmatter sets `name: example-skill` explicitly. Even
    // though it happens to equal the directory name, the value comes from
    // the parsed frontmatter — we assert that by re-parsing.
    const parsed = parseSkillMd(readFileSync(skill.skillMdPath, "utf8"))!;
    expect(parsed.frontmatter.name).toBe("example-skill");
    expect(skill.name).toBe(parsed.frontmatter.name);
  });

  it("effectiveName: falls back to dir name when frontmatter.name is missing", () => {
    const skill = buildCustomSkill("example-skill-no-name");
    const parsed = parseSkillMd(readFileSync(skill.skillMdPath, "utf8"))!;
    expect(parsed.frontmatter.name).toBeUndefined();
    expect(skill.name).toBe("example-skill-no-name");
  });

  it("description: present and non-empty for both fixtures", () => {
    // description is optional per the source-of-truth, but both fixtures
    // intentionally set it — exercising the "happy path" parse + trim.
    for (const dirName of FIXTURE_DIRS) {
      const skill = buildCustomSkill(dirName);
      expect(skill.description.length).toBeGreaterThan(0);
    }
  });

  it("matches the CustomSkill TypeScript interface shape", () => {
    // Type-level assertion against the production type. Runtime fields above
    // already cover value semantics; this guards against silent drift if
    // src/lib/skill-types.ts changes its field set.
    expectTypeOf(buildCustomSkill).returns.toEqualTypeOf<CustomSkill>();
    expectTypeOf<CustomSkill>().toHaveProperty("name").toEqualTypeOf<string>();
    expectTypeOf<CustomSkill>()
      .toHaveProperty("description")
      .toEqualTypeOf<string>();
    expectTypeOf<CustomSkill>()
      .toHaveProperty("dirPath")
      .toEqualTypeOf<string>();
    expectTypeOf<CustomSkill>()
      .toHaveProperty("skillMdPath")
      .toEqualTypeOf<string>();
  });
});
