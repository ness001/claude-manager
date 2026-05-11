// Tests for SkillCard — renders fields + invokes shell open for actions.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";

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

  // UX/a11y: SKILL.md frontmatter `description` is documented as "may be
  // empty". When empty, the previous code rendered an empty <p> element,
  // which (a) still consumed a `gap-2` slot in the flex column (visible
  // dead vertical space between the name row and the path code), and
  // (b) created an empty paragraph that some screen readers announce as
  // an empty pause. Render the <p> only when there is text to show.
  it("omits the description <p> entirely when description is empty", () => {
    render(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.queryByTestId("skill-description")).not.toBeInTheDocument();
  });

  it("renders the description <p> when non-empty", () => {
    render(<SkillCard skill={SKILL} />);
    const desc = screen.getByTestId("skill-description");
    expect(desc.tagName).toBe("P");
    expect(desc.textContent).toBe("the alpha skill");
  });

  // UX gap: skill paths are routinely long (e.g.
  // C:\Users\…\.claude\skills\my-skill\skill.md) and the `truncate`
  // CSS clips them with an ellipsis. Without `title`, sighted users
  // have NO way to recover the hidden tail of the path — they'd have to
  // open the file just to read where it lives. Mirror the visible
  // string into title so hover surfaces the full path.
  it("skill-path mirrors its visible text into the `title` attribute (UX truncation recovery)", () => {
    render(<SkillCard skill={SKILL} />);
    const codeEl = screen.getByTestId("skill-path");
    expect(codeEl.getAttribute("title")).toBe(SKILL.skillMdPath);
  });

  // UX bug: the skill name span has `truncate` but no `title`, so long
  // skill names get clipped with no recovery — sighted users have no
  // way to read the hidden tail. Mirror the visible string into `title`
  // (same family as PR #167 SkillCard path, PR #170 RecentSessions,
  // PR #171 SystemHealth, PR #175 SessionCard, PluginCard name).
  it("skill name span mirrors its visible text into the `title` attribute (UX truncation recovery)", () => {
    const longName = "anthropic-experimental-conversational-memory-with-vector-embeddings-skill";
    render(<SkillCard skill={{ ...SKILL, name: longName }} />);
    const span = screen.getByText(longName);
    expect(span.className).toContain("truncate");
    expect(span.getAttribute("title")).toBe(longName);
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

  // WCAG 4.1.2 (Name, Role, Value): each button label is fully readable on
  // its own ("Open in VS Code", "Open in File Browser") so the leading
  // lucide icon is decorative — without aria-hidden, screen readers may
  // announce the SVG's computed name redundantly. Mirrors PRs #53 / #55.
  it("decorative icons inside action buttons are aria-hidden", () => {
    render(<SkillCard skill={SKILL} />);
    for (const id of ["open-vscode-btn", "open-folder-btn"]) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // Defect: openShell rejection (deleted dir, missing handler for vscode://,
  // shell allowlist denial) was swallowed into console.error — the user
  // clicked the button and got zero feedback. Mirrors PR #91 (PluginListView
  // Check-for-Updates silent-failure).
  it("'Open in VS Code' rejection surfaces an inline alert", async () => {
    openMock.mockRejectedValueOnce(new Error("no handler"));
    render(<SkillCard skill={SKILL} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-vscode-btn"));
    });
    const alert = screen.getByTestId("skill-open-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("no handler");
  });

  it("'Open in File Browser' rejection surfaces an inline alert", async () => {
    openMock.mockRejectedValueOnce(new Error("ENOENT"));
    render(<SkillCard skill={SKILL} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-folder-btn"));
    });
    expect(screen.getByTestId("skill-open-error").textContent).toContain(
      "ENOENT",
    );
  });

  it("a successful retry clears the prior error", async () => {
    openMock.mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce(undefined);
    render(<SkillCard skill={SKILL} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-folder-btn"));
    });
    expect(screen.getByTestId("skill-open-error")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-folder-btn"));
    });
    expect(screen.queryByTestId("skill-open-error")).toBeNull();
  });

  // WCAG 2.4.7 (Focus Visible): both action buttons rely on the default
  // browser focus ring, which Tauri's webview renders inconsistently across
  // platforms — keyboard users can lose track of focus. Other action buttons
  // in the app standardize on the focus-visible:ring-accent trio (#117 / #118
  // / #119); these two should match.
  it.each([
    ["open-vscode-btn"],
    ["open-folder-btn"],
  ])("%s exposes a visible focus ring (WCAG 2.4.7)", (testId) => {
    render(<SkillCard skill={SKILL} />);
    const btn = screen.getByTestId(testId);
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });
});
