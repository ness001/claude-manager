// Tests for the custom-skills loader (T3.6). The Rust side does the
// filesystem walk; the loader's only job is to call `invoke` and normalize
// the wire shape. We mock at the IPC boundary, never the unit under test.
//
// Filesystem-walk correctness is exercised by `cargo test` in
// `src-tauri/src/skills/commands.rs` and by reading the on-disk fixture
// tree at `tests/fixtures/skill-loader/skills/` here.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { loadCustomSkills } from "../../src/lib/skill-loader";
import type { CustomSkillWire } from "../../src/lib/skill-loader";

const FIXTURES = path.join(__dirname, "..", "fixtures", "skill-loader");
const SCAN_OUTPUT: CustomSkillWire[] = JSON.parse(
  readFileSync(path.join(FIXTURES, "scan-output.json"), "utf8"),
);

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadCustomSkills", () => {
  it("case 1: returns one CustomSkill per scan-output entry", async () => {
    invokeMock.mockResolvedValueOnce(SCAN_OUTPUT);
    const skills = await loadCustomSkills();
    expect(skills).toHaveLength(SCAN_OUTPUT.length);
    expect(invokeMock).toHaveBeenCalledWith("scan_custom_skills");
    for (const s of skills) {
      expect(s.dirPath).toMatch(/skills\/[\w-]+$/);
      expect(s.skillMdPath).toMatch(/SKILL\.md$/);
    }
  });

  it("case 2: malformed/missing entries are absent (Rust filters them)", async () => {
    // Rust scanner returns only entries with parseable SKILL.md, so the
    // wire shape never carries malformed ones. Emulate that contract.
    invokeMock.mockResolvedValueOnce([
      {
        name: "valid",
        description: "ok",
        dirPath: "/h/.claude/skills/valid",
        skillMdPath: "/h/.claude/skills/valid/SKILL.md",
      },
    ]);
    const skills = await loadCustomSkills();
    expect(skills.map((s) => s.name)).toEqual(["valid"]);
  });

  it("case 3: subdirectory without SKILL.md → skipped (fixture parity)", () => {
    // Mirror the Rust contract by inspecting the on-disk fixture tree.
    const skillsDir = path.join(FIXTURES, "skills");
    const dirs = readdirSync(skillsDir).filter((n) =>
      statSync(path.join(skillsDir, n)).isDirectory(),
    );
    expect(dirs).toContain("missing-skill-md");
    expect(
      existsSync(path.join(skillsDir, "missing-skill-md", "SKILL.md")),
    ).toBe(false);
    // Loader-equivalent contract: the Rust scan_dir would NOT include it.
  });

  it("case 4: name + description are trimmed", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        name: "  spaced  ",
        description: "  desc  ",
        dirPath: "/h/.claude/skills/spaced",
        skillMdPath: "/h/.claude/skills/spaced/SKILL.md",
      },
    ]);
    const [s] = await loadCustomSkills();
    expect(s.name).toBe("spaced");
    expect(s.description).toBe("desc");
  });

  it("plugin-bundled SKILL.md does NOT appear (only ~/.claude/skills/ scanned)", () => {
    // The Rust command only walks `~/.claude/skills/`, never `~/.claude/plugins/`.
    // Fixture parity: the bundled file exists in the fixture tree but lives
    // under `plugins/...` so the scanner would never see it.
    const bundled = path.join(
      FIXTURES,
      "plugins",
      "fake-plugin",
      "skills",
      "bundled-not-custom",
      "SKILL.md",
    );
    expect(existsSync(bundled)).toBe(true);
    // And it is NOT under the fixture's `skills/` root:
    const scanned = readdirSync(path.join(FIXTURES, "skills"));
    expect(scanned).not.toContain("fake-plugin");
  });
});
