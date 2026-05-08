// SkillsSection wires the SkillsListView and triggers loadSkills on mount.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";

const loadCustomSkillsMock = vi.fn(async () => []);
vi.mock("../../../src/lib/skill-loader", () => ({
  loadCustomSkills: (...args: unknown[]) => loadCustomSkillsMock(...args),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { SkillsSection } from "../../../src/sections/SkillsSection";
import { useSkillStore } from "../../../src/stores/skill-store";

beforeEach(() => {
  useSkillStore.setState({
    skills: [],
    searchQuery: "",
    isLoading: false,
    error: null,
  });
  loadCustomSkillsMock.mockReset();
  loadCustomSkillsMock.mockResolvedValue([]);
});
afterEach(() => cleanup());

describe("SkillsSection", () => {
  it("mounts without console errors", async () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      await act(async () => {
        render(<SkillsSection />);
        await Promise.resolve();
      });
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("replaces placeholder with SkillsListView and triggers load on mount", async () => {
    await act(async () => {
      render(<SkillsSection />);
      await Promise.resolve();
    });
    expect(screen.getByTestId("skill-list-view")).toBeInTheDocument();
    expect(loadCustomSkillsMock).toHaveBeenCalledTimes(1);
  });

  it("dark + light theme parity: section keeps the same root utilities", async () => {
    const { unmount } = render(<SkillsSection />);
    const lightClass = screen.getByTestId("skills-section").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      await act(async () => {
        render(<SkillsSection />);
        await Promise.resolve();
      });
      const darkClass = screen.getByTestId("skills-section").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });
});
