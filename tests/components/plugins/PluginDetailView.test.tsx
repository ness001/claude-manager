// Tests for PluginDetailView — tab switching renders the correct tab body.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { PluginDetailView } from "../../../src/components/plugins/PluginDetailView";
import type { PluginDetail } from "../../../src/lib/plugin-types";

const openShellMock = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => openShellMock(...args),
}));

function makeDetail(overrides: Partial<PluginDetail> = {}): PluginDetail {
  return {
    name: "alpha",
    marketplace: "official",
    version: "1.0.0",
    gitCommitSha: "0".repeat(40),
    description: "the alpha plugin",
    installPath: "/cache/official/alpha/1.0.0",
    state: "active",
    skillCount: 1,
    agentCount: 1,
    hookCount: 1,
    hasClaudeMd: false,
    skills: [{ name: "skill-1", description: "the skill" }],
    agents: [
      {
        name: "agent-1",
        description: "the agent",
        model: "claude-sonnet-4-6",
        tools: ["Read", "Bash"],
      },
    ],
    hooks: [{ event: "SessionStart", command: "echo hi" }],
    ...overrides,
  };
}

describe("PluginDetailView", () => {
  afterEach(() => {
    cleanup();
    openShellMock.mockReset();
  });

  it("mounts without console errors", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      render(<PluginDetailView plugin={makeDetail()} />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("default tab is Skills", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    expect(screen.getByTestId("skills-list")).toBeInTheDocument();
    expect(screen.queryByTestId("agents-list")).toBeNull();
    expect(screen.queryByTestId("hooks-list")).toBeNull();
  });

  it("clicking Agents tab shows agent rows", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("tab-agents"));
    expect(screen.getByTestId("agents-list")).toBeInTheDocument();
    expect(screen.queryByTestId("skills-list")).toBeNull();
  });

  it("clicking Hooks tab shows hook rows", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("tab-hooks"));
    expect(screen.getByTestId("hooks-list")).toBeInTheDocument();
    expect(screen.queryByTestId("skills-list")).toBeNull();
  });

  it("Open in File Browser invokes shell.open with the install path", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("open-folder-btn"));
    expect(openShellMock).toHaveBeenCalledWith(
      "/cache/official/alpha/1.0.0",
    );
  });

  it("Open in VS Code invokes shell.open with vscode:// scheme", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("open-vscode-btn"));
    expect(openShellMock).toHaveBeenCalledWith(
      "vscode://file//cache/official/alpha/1.0.0",
    );
  });

  // WCAG 2.4.7 Focus Visible: tab buttons must show a keyboard-focus ring.
  // Mirrors PR #49 (ActivityChart Period/Series tabs) and PR #48 (ViewModeToggle).
  it("tab buttons carry the focus-visible ring classes", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    for (const id of ["tab-skills", "tab-agents", "tab-hooks"]) {
      const btn = screen.getByTestId(id);
      expect(btn.className).toContain("focus-visible:ring-2");
      expect(btn.className).toContain("focus-visible:ring-accent");
    }
  it("Open in VS Code converts Windows backslashes to forward slashes (URI scheme)", () => {
    // installed_plugins.json on Windows stores backslash-separated paths
    // (see plugin-loader.ts → installPath). The vscode://file/ URI scheme
    // requires forward slashes; backslashes silently break the open.
    render(
      <PluginDetailView
        plugin={makeDetail({
          installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\foo\\bar\\1.0.0",
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("open-vscode-btn"));
    expect(openShellMock).toHaveBeenCalledWith(
      "vscode://file/C:/Users/me/.claude/plugins/cache/foo/bar/1.0.0",
    );
  // WCAG 4.1.2 (Name, Role, Value): decorative lucide icons next to button
  // text labels must be aria-hidden so SR users don't hear the SVG name
  // ("FolderOpen", "ExternalLink") redundantly with the button label.
  // Mirrors PR #58 (SkillCard) and PR #55 (QuickActions).
  it("header button icons are aria-hidden", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    for (const id of ["open-folder-btn", "open-vscode-btn"]) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
