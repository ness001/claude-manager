// Tests for SkillCard — renders fields + invokes shell open for actions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));

import { SkillCard } from "../../../src/components/skills/SkillCard";
import type { CustomSkill } from "../../../src/lib/skill-types";

const SKILL: CustomSkill = {
  name: "alpha",
  description: "the alpha skill",
  dirPath: "/h/.claude/skills/alpha",
  skillMdPath: "/h/.claude/skills/alpha/SKILL.md",
};

beforeEach(() => {
  openMock.mockReset();
});
afterEach(() => cleanup());

describe("SkillCard", () => {
  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<SkillCard skill={SKILL} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("renders name, description, and file path", () => {
    render(<SkillCard skill={SKILL} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("the alpha skill")).toBeInTheDocument();
    expect(screen.getByTestId("skill-path").textContent).toBe(
      SKILL.skillMdPath,
    );
  });

  it("'Open in VS Code' invokes shell open with vscode:// URI", () => {
    render(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByTestId("open-vscode-btn"));
    expect(openMock).toHaveBeenCalledWith(`vscode://file/${SKILL.skillMdPath}`);
  });

  it("'Open in File Browser' invokes shell open with the dirPath", () => {
    render(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByTestId("open-folder-btn"));
    expect(openMock).toHaveBeenCalledWith(SKILL.dirPath);
  });

  it("'Open in VS Code' converts Windows backslashes to forward slashes (URI scheme)", () => {
    // On Windows, skillMdPath comes from the FS as a backslash-separated path
    // (e.g. "C:\\Users\\me\\.claude\\skills\\alpha\\SKILL.md"). The
    // vscode://file/ URI scheme requires forward slashes, otherwise the
    // open silently no-ops.
    const winSkill: CustomSkill = {
      ...SKILL,
      skillMdPath: "C:\\Users\\me\\.claude\\skills\\alpha\\SKILL.md",
    };
    render(<SkillCard skill={winSkill} />);
    fireEvent.click(screen.getByTestId("open-vscode-btn"));
    expect(openMock).toHaveBeenCalledWith(
      "vscode://file/C:/Users/me/.claude/skills/alpha/SKILL.md",
    );
  });
});
