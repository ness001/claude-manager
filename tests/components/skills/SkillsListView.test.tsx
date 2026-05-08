// Tests for SkillsListView — header counts, search filter, empty state,
// and the info-box link to the Plugins panel.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { SkillsListView } from "../../../src/components/skills/SkillsListView";
import { useSkillStore } from "../../../src/stores/skill-store";
import { useNavigationStore } from "../../../src/stores/navigation-store";
import type { CustomSkill } from "../../../src/lib/skill-types";

function makeSkill(over: Partial<CustomSkill> = {}): CustomSkill {
  return {
    name: "alpha",
    description: "first one",
    dirPath: "/h/.claude/skills/alpha",
    skillMdPath: "/h/.claude/skills/alpha/SKILL.md",
    ...over,
  };
}

beforeEach(() => {
  useSkillStore.setState({
    skills: [],
    searchQuery: "",
    isLoading: false,
    error: null,
  });
  useNavigationStore.setState({ activeSection: "skills" });
});
afterEach(() => cleanup());

describe("SkillsListView", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<SkillsListView />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("header shows skill count + path ~/.claude/skills/", () => {
    useSkillStore.setState({
      skills: [
        makeSkill(),
        makeSkill({ name: "beta", dirPath: "/h/.claude/skills/beta" }),
      ],
    });
    render(<SkillsListView />);
    expect(screen.getByTestId("stat-skill-count").textContent).toBe("2 skills");
    expect(screen.getByTestId("stat-skills-path").textContent).toBe(
      "~/.claude/skills/",
    );
  });

  it("search filters cards", () => {
    useSkillStore.setState({
      skills: [
        makeSkill({ name: "alpha", description: "first" }),
        makeSkill({ name: "beta", description: "second", dirPath: "/h/b" }),
      ],
    });
    render(<SkillsListView />);
    expect(screen.getAllByTestId("skill-card")).toHaveLength(2);
    act(() => {
      fireEvent.change(screen.getByTestId("skill-search"), {
        target: { value: "beta" },
      });
    });
    const cards = screen.getAllByTestId("skill-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.skillName).toBe("beta");
  });

  it("empty state matches spec §17.6", () => {
    render(<SkillsListView />);
    const empty = screen.getByTestId("empty-state");
    expect(empty.textContent).toContain("No custom skills found");
    expect(empty.textContent).toContain("~/.claude/skills/");
    expect(empty.textContent).toContain("SKILL.md");
  });

  it("info box references plugin-bundled skills via Plugins panel", () => {
    render(<SkillsListView />);
    const aside = screen.getByTestId("plugins-info-box");
    expect(aside.textContent).toMatch(/Plugin-bundled skills/i);
    fireEvent.click(screen.getByTestId("plugins-panel-link"));
    expect(useNavigationStore.getState().activeSection).toBe("plugins");
  });

  it("dark + light theme parity: same root utilities", () => {
    const { unmount } = render(<SkillsListView />);
    const lightClass = screen.getByTestId("skill-list-view").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      render(<SkillsListView />);
      const darkClass = screen.getByTestId("skill-list-view").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });
});
