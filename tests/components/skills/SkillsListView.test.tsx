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
const openShellMock = vi.fn(async (_p: string) => undefined);
vi.mock("@tauri-apps/plugin-shell", () => ({ open: (p: string) => openShellMock(p) }));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(async () => "/h"),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

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

  it("clicking Create Skill resolves $HOME before passing to openShell (no literal ~)", async () => {
    // Regression: openShell does not expand `~`, so passing the literal
    // `~/.claude/skills/` silently fails on most platforms. The handler must
    // resolve homeDir() + join(...) and pass the absolute path.
    openShellMock.mockClear();
    render(<SkillsListView />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("create-skill-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(openShellMock).toHaveBeenCalledTimes(1);
    const arg = openShellMock.mock.calls[0]?.[0] as string;
    expect(arg.startsWith("~")).toBe(false);
    expect(arg).toBe("/h/.claude/skills");
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

  // WCAG 4.1.2 Name, Role, Value: the skill-search input previously relied on
  // its placeholder for an accessible name (placeholders don't count). Mirror
  // SessionSearch (PR #45) and McpPanel (PR #50) — explicit aria-label on the
  // input.
  it("search input has an accessible name (aria-label)", () => {
    render(<SkillsListView />);
    expect(screen.getByTestId("skill-search").getAttribute("aria-label")).toBe(
      "Search skills",
    );
  });

  // WCAG 4.1.2 (Name, Role, Value): decorative lucide icon next to button
  // text label "Create Skill" must be aria-hidden so SR users don't hear
  // "Plus, Create Skill". Mirrors PR #58 (SkillCard) and PR #55 (QuickActions).
  it("Create Skill button icon is aria-hidden", () => {
    render(<SkillsListView />);
    const btn = screen.getByTestId("create-skill-btn");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing through the Skills page
  // need a visible focus indicator on every interactive control. Mirrors the
  // family of focus-ring fixes in PRs #17/#45/#48/#49/#56/#57/#67.
  it("Create Skill button has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<SkillsListView />);
    const btn = screen.getByTestId("create-skill-btn");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  it("Plugins panel link has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<SkillsListView />);
    const link = screen.getByTestId("plugins-panel-link");
    expect(link.className).toContain("focus-visible:ring-2");
    expect(link.className).toContain("focus-visible:ring-accent");
  });

  // WCAG 2.4.7 Focus Visible — the search input previously used
  // `focus:outline-none focus:border-accent`, same flaw fixed for McpPanel
  // in PR #138. Mirrors PluginListView search-input fix.
  it("search input has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<SkillsListView />);
    const input = screen.getByTestId("skill-search");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-accent");
    expect(input.className).not.toMatch(/(^|\s)focus:outline-none(\s|$)/);
  });

  // a11y: the no-matches message appears as the user types into the search
  // box. Without role="status" + aria-live="polite", screen-reader users
  // get NO feedback that their query produced zero results — they'd only
  // discover it by tabbing into an empty result region. "polite" so the
  // announcement waits for the user to pause typing rather than firing on
  // every keystroke. Mirrors PluginListView (PR #154) and McpPanel (PR #155).
  it("no-matches message is a polite live region (a11y: search announce)", () => {
    useSkillStore.setState({ skills: [makeSkill({ name: "alpha" })] });
    render(<SkillsListView />);
    fireEvent.change(screen.getByTestId("skill-search"), {
      target: { value: "zzz" },
    });
    const empty = screen.getByTestId("no-matches");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  // UX bug: WebView2 (Tauri's webview) does not consistently honor the
  // `<input type=search>` browser-default Escape-to-clear behavior, and
  // even when it does, focus jumps off the input — the user has to click
  // back into the field before they can type a new query. Wire an
  // explicit Escape handler so the field clears and stays focused.
  // Mirrors PRs #151 (McpPanel), #152 (PluginListView), #153 (SessionSearch).
  it("Escape clears the search query while keeping focus on the input", () => {
    useSkillStore.setState({
      skills: [makeSkill({ name: "alpha" })],
      searchQuery: "alpha",
    });
    render(<SkillsListView />);
    const input = screen.getByTestId("skill-search") as HTMLInputElement;
    expect(input.value).toBe("alpha");
    input.focus();
    expect(document.activeElement).toBe(input);
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(false); // default prevented
    expect(useSkillStore.getState().searchQuery).toBe("");
    expect(document.activeElement).toBe(input);
  });

  // The Escape handler is gated on a non-empty query so an empty-state
  // Esc keystroke does NOT preventDefault — leaves room for outer
  // dialog/modal handlers to receive it.
  it("Escape on an empty search field is a no-op (does not preventDefault)", () => {
    render(<SkillsListView />);
    const input = screen.getByTestId("skill-search") as HTMLInputElement;
    expect(input.value).toBe("");
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(true); // default NOT prevented
    expect(input.value).toBe("");
  });

  // Defect: openShell rejection (missing dir, Tauri shell allowlist denial,
  // no OS file-browser handler) was swallowed into console.error — the user
  // clicked the button and got zero feedback. Mirrors PR #168 (PluginDetailView
  // Open in File Browser/VS Code silent failure) and the SkillCard
  // skill-open-error pattern.
  it("Create Skill rejection surfaces an inline alert", async () => {
    openShellMock.mockRejectedValueOnce(new Error("ENOENT"));
    render(<SkillsListView />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("create-skill-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const alert = screen.getByTestId("skill-create-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("ENOENT");
  });

  it("a successful retry clears the prior Create Skill error", async () => {
    openShellMock
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValueOnce(undefined);
    render(<SkillsListView />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("create-skill-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("skill-create-error")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("create-skill-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId("skill-create-error")).toBeNull();
  });
});
