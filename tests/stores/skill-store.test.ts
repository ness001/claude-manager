// Tests for the skills store (T3.7). Mocks at the module boundary:
//   - `../../src/lib/skill-loader` → loadCustomSkills
// We never mock the store under test (`skill-store`) itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadCustomSkillsMock = vi.fn();

vi.mock("../../src/lib/skill-loader", () => ({
  loadCustomSkills: (...args: unknown[]) => loadCustomSkillsMock(...args),
}));

import { filterSkills, useSkillStore } from "../../src/stores/skill-store";
import type { CustomSkill } from "../../src/lib/skill-types";

function makeSkill(overrides: Partial<CustomSkill> = {}): CustomSkill {
  return {
    name: "alpha",
    description: "the alpha skill",
    dirPath: "/h/.claude/skills/alpha",
    skillMdPath: "/h/.claude/skills/alpha/SKILL.md",
    ...overrides,
  };
}

beforeEach(() => {
  useSkillStore.setState({
    skills: [],
    searchQuery: "",
    isLoading: false,
    error: null,
  });
  loadCustomSkillsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSkillStore", () => {
  it("case 1: loadSkills() populates skills and clears isLoading", async () => {
    const skills = [makeSkill(), makeSkill({ name: "beta", dirPath: "/h/.claude/skills/beta" })];
    loadCustomSkillsMock.mockResolvedValueOnce(skills);
    await useSkillStore.getState().loadSkills();
    const s = useSkillStore.getState();
    expect(s.skills).toEqual(skills);
    expect(s.isLoading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("case 2: setSearchQuery + filterSkills filters by name and description", () => {
    const skills = [
      makeSkill({ name: "alpha", description: "first one" }),
      makeSkill({ name: "beta", description: "second one", dirPath: "/h/b" }),
      makeSkill({ name: "gamma", description: "alpha-flavored", dirPath: "/h/g" }),
    ];
    useSkillStore.setState({ skills });
    useSkillStore.getState().setSearchQuery("alpha");
    expect(useSkillStore.getState().searchQuery).toBe("alpha");
    const filtered = filterSkills(skills, "alpha");
    expect(filtered.map((s) => s.name)).toEqual(["alpha", "gamma"]);
    // Description-only match works:
    expect(filterSkills(skills, "second").map((s) => s.name)).toEqual(["beta"]);
    // Case-insensitive:
    expect(filterSkills(skills, "ALPHA").map((s) => s.name)).toEqual([
      "alpha",
      "gamma",
    ]);
  });

  it("case 3: error path — loader rejects → store records error, no partial mutation", async () => {
    useSkillStore.setState({ skills: [makeSkill({ name: "preexisting" })] });
    loadCustomSkillsMock.mockRejectedValueOnce(new Error("FS denied"));
    await useSkillStore.getState().loadSkills();
    const s = useSkillStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.error).toBe("FS denied");
    // Pre-existing skills untouched (no partial mutation).
    expect(s.skills).toHaveLength(1);
    expect(s.skills[0].name).toBe("preexisting");
  });
});
