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
    // All three panels mount (WAI-ARIA Tabs Pattern + IDREF resolution); only
    // the active one is visible. Inactive panels are toggled via `hidden`.
    expect(screen.getByTestId("tabpanel-skills").hasAttribute("hidden")).toBe(false);
    expect(screen.getByTestId("tabpanel-agents").hasAttribute("hidden")).toBe(true);
    expect(screen.getByTestId("tabpanel-hooks").hasAttribute("hidden")).toBe(true);
  });

  it("clicking Agents tab shows agent rows", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("tab-agents"));
    expect(screen.getByTestId("agents-list")).toBeInTheDocument();
    expect(screen.getByTestId("tabpanel-agents").hasAttribute("hidden")).toBe(false);
    expect(screen.getByTestId("tabpanel-skills").hasAttribute("hidden")).toBe(true);
  });

  it("clicking Hooks tab shows hook rows", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    fireEvent.click(screen.getByTestId("tab-hooks"));
    expect(screen.getByTestId("hooks-list")).toBeInTheDocument();
    expect(screen.getByTestId("tabpanel-hooks").hasAttribute("hidden")).toBe(false);
    expect(screen.getByTestId("tabpanel-skills").hasAttribute("hidden")).toBe(true);
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
  });

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
  });

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

  // WCAG 2.4.7 (Focus Visible): the two header action buttons (Open in File
  // Browser, Open in VS Code) are wired interactive controls that shell out
  // to the OS — but they had no focus ring at all, relying on the browser
  // default which Tauri's WebView renders inconsistently across platforms.
  // Mirrors PRs #117 / #118 / #119 / #125 / #126 / #128 / #129 / #132 / #133.
  it("header action buttons expose a visible focus ring (WCAG 2.4.7)", () => {
    render(<PluginDetailView plugin={makeDetail()} />);
    for (const id of ["open-folder-btn", "open-vscode-btn"]) {
      const btn = screen.getByTestId(id);
      expect(btn.className).toContain("focus-visible:outline-none");
      expect(btn.className).toContain("focus-visible:ring-2");
      expect(btn.className).toContain("focus-visible:ring-accent");
    }
  });

  // WAI-ARIA APG "Tabs" pattern (automatic activation): the tablist needs
  // roving tabindex + arrow / Home / End key support, and the panel must
  // declare role=tabpanel + aria-labelledby pointing at the active tab.
  // Mirrors PR #94 (ViewModeToggle) and PR #97 (ActivityChart).
  describe("WAI-ARIA tabs keyboard navigation", () => {
    it("only the selected tab has tabIndex=0 (roving)", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      // Default tab is "skills".
      expect(screen.getByTestId("tab-skills").getAttribute("tabindex")).toBe("0");
      for (const t of ["agents", "hooks"]) {
        expect(screen.getByTestId(`tab-${t}`).getAttribute("tabindex")).toBe("-1");
      }
    });

    it("ArrowRight moves selection forward and wraps", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      const skills = screen.getByTestId("tab-skills");
      skills.focus();
      fireEvent.keyDown(skills, { key: "ArrowRight" });
      expect(screen.getByTestId("tab-agents").getAttribute("aria-selected")).toBe(
        "true",
      );
      // Wrap from "hooks" → "skills".
      const hooks = screen.getByTestId("tab-hooks");
      hooks.focus();
      fireEvent.keyDown(hooks, { key: "ArrowRight" });
      expect(screen.getByTestId("tab-skills").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("ArrowLeft wraps from first to last", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      const skills = screen.getByTestId("tab-skills");
      skills.focus();
      fireEvent.keyDown(skills, { key: "ArrowLeft" });
      expect(screen.getByTestId("tab-hooks").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("Home / End jump to first / last", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      const skills = screen.getByTestId("tab-skills");
      skills.focus();
      fireEvent.keyDown(skills, { key: "End" });
      expect(screen.getByTestId("tab-hooks").getAttribute("aria-selected")).toBe(
        "true",
      );
      const hooks = screen.getByTestId("tab-hooks");
      hooks.focus();
      fireEvent.keyDown(hooks, { key: "Home" });
      expect(screen.getByTestId("tab-skills").getAttribute("aria-selected")).toBe(
        "true",
      );
    });

    it("active tab and panel are linked by aria-controls / aria-labelledby", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      const tab = screen.getByTestId("tab-skills");
      const panel = screen.getByTestId("tabpanel-skills");
      expect(panel.getAttribute("role")).toBe("tabpanel");

      const tabId = tab.getAttribute("id");
      const panelId = panel.getAttribute("id");
      expect(tabId).toBeTruthy();
      expect(panelId).toBeTruthy();
      expect(tab.getAttribute("aria-controls")).toBe(panelId);
      expect(panel.getAttribute("aria-labelledby")).toBe(tabId);

      // After switching tabs, the panel re-points at the new active tab.
      fireEvent.click(screen.getByTestId("tab-agents"));
      const agentsTab = screen.getByTestId("tab-agents");
      const agentsPanel = screen.getByTestId("tabpanel-agents");
      expect(agentsPanel.getAttribute("aria-labelledby")).toBe(
        agentsTab.getAttribute("id"),
      );
      expect(agentsTab.getAttribute("aria-controls")).toBe(
        agentsPanel.getAttribute("id"),
      );
    });

    // Regression for the 2/3-dangling-IDREF defect: previously only the
    // active tab's panel was rendered, so the OTHER two tabs' aria-controls
    // pointed at ids that did not exist anywhere in the document. Per
    // WAI-ARIA, every IDREF must resolve to an element in the DOM. Per the
    // WAI-ARIA Tabs Pattern, all panels should live in the DOM with
    // visibility toggled via the `hidden` attribute. Mirrors PR #189
    // (ToolCallBlock) and PR #191 (McpServerCard) IDREF-class fixes.
    it("ALL three tabs' aria-controls resolve to a real panel (no dangling IDREFs)", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      // Default state: skills is the active tab. The previous bug only
      // exposed itself for the two INACTIVE tabs — agents + hooks.
      for (const tabName of ["skills", "agents", "hooks"] as const) {
        const tab = screen.getByTestId(`tab-${tabName}`);
        const controlsId = tab.getAttribute("aria-controls");
        expect(controlsId).toBeTruthy();
        const panel = document.getElementById(controlsId!);
        expect(panel, `tab-${tabName} aria-controls must resolve`).not.toBeNull();
        expect(panel!.getAttribute("role")).toBe("tabpanel");
        expect(panel!.getAttribute("aria-labelledby")).toBe(tab.getAttribute("id"));
      }
    });

    // Visibility model: all three panels are in the DOM (so IDREFs resolve)
    // but only the active one is visible — inactive panels are toggled off
    // via the `hidden` attribute (which browsers treat as
    // `display:none !important`, so flex layout excludes them too).
    it("inactive tabpanels are hidden via the `hidden` attribute; only one is visible", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      // Skills active by default.
      expect(screen.getByTestId("tabpanel-skills").hasAttribute("hidden")).toBe(false);
      expect(screen.getByTestId("tabpanel-agents").hasAttribute("hidden")).toBe(true);
      expect(screen.getByTestId("tabpanel-hooks").hasAttribute("hidden")).toBe(true);
      // Switch to agents → only agents is visible.
      fireEvent.click(screen.getByTestId("tab-agents"));
      expect(screen.getByTestId("tabpanel-skills").hasAttribute("hidden")).toBe(true);
      expect(screen.getByTestId("tabpanel-agents").hasAttribute("hidden")).toBe(false);
      expect(screen.getByTestId("tabpanel-hooks").hasAttribute("hidden")).toBe(true);
    });
  });
});
