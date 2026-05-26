// Tests for PluginDetailView — tab switching renders the correct tab body.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act, waitFor } from "@testing-library/react";

import { PluginDetailView } from "../../../src/components/plugins/PluginDetailView";
import { usePluginStore } from "../../../src/stores/plugin-store";
import type { PluginDetail, PluginState } from "../../../src/lib/plugin-types";

const openShellMock = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => openShellMock(...args),
}));

// `uninstallPlugin` in the store calls `invoke("uninstall_plugin")` and then
// `loadPlugins()` (which itself invokes more commands). Mock invoke and the
// plugin-loader so unit tests don't try to reach Tauri or the real disk.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
const loadPluginsMock = vi.fn();
vi.mock("../../../src/lib/plugin-loader", () => ({
  loadPlugins: () => loadPluginsMock(),
  loadPluginDetail: vi.fn(),
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

  // a11y: WAI-ARIA Toolbar pattern — Open in File Browser + Open in VS
  // Code form a related action group scoped to this plugin. Mirrors PRs
  // #246/#248/#249/#253.
  it("action row is a named toolbar landmark scoped to plugin name", () => {
    render(<PluginDetailView plugin={makeDetail({ name: "alpha" })} />);
    const toolbar = screen.getByTestId("plugin-detail-actions-toolbar");
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    expect(toolbar.getAttribute("aria-label")).toBe("Actions for alpha");
    // The two action buttons live inside the toolbar.
    expect(toolbar.contains(screen.getByTestId("open-folder-btn"))).toBe(true);
    expect(toolbar.contains(screen.getByTestId("open-vscode-btn"))).toBe(true);
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

  // Regression: openShell rejects when the install path is missing
  // (broken plugin), the OS has no handler for vscode:// (VS Code not
  // installed), or the Tauri shell allowlist forbids the path. The
  // handlers used to only `console.error` — the user clicked, nothing
  // happened, and they had no idea why. Surface inline as role=alert.
  // Mirrors SkillCard / SessionInfoBar.
  it("Open in File Browser surfaces an error inline when openShell rejects", async () => {
    openShellMock.mockReset().mockRejectedValue(new Error("path not found"));
    render(<PluginDetailView plugin={makeDetail()} />);
    expect(screen.queryByTestId("plugin-open-error")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-folder-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const err = screen.getByTestId("plugin-open-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("path not found");
  });

  it("Open in VS Code surfaces an error inline when openShell rejects", async () => {
    openShellMock.mockReset().mockRejectedValue(new Error("no vscode handler"));
    render(<PluginDetailView plugin={makeDetail()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("open-vscode-btn"));
      await Promise.resolve();
      await Promise.resolve();
    });
    const err = screen.getByTestId("plugin-open-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toContain("no vscode handler");
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

  // WCAG 4.1.2 (Name, Role, Value): the metadata sub-line under the
  // plugin name renders three opaque values joined by middots
  // ("official · v1.0.0 · active"). SR users hear them as a flat token
  // stream with no role context. Each value should expose its dimension
  // via aria-label (Marketplace / Version / State) and the decorative
  // middots should be aria-hidden so SR users don't hear "middle dot"
  // noise. Mirrors the opaque-badge sweep on PluginCard (PRs #246/#247/
  // #279) and SessionInfoBar (#250/#252/#271).
  it("metadata line splits into labeled spans (Marketplace/Version/State) with hidden middots", () => {
    render(
      <PluginDetailView
        plugin={makeDetail({
          marketplace: "community",
          version: "2.4.1",
          state: "update-available",
        })}
      />,
    );
    expect(
      screen.getByTestId("plugin-detail-marketplace").getAttribute("aria-label"),
    ).toBe("Marketplace: community");
    expect(
      screen.getByTestId("plugin-detail-version").getAttribute("aria-label"),
    ).toBe("Version: 2.4.1");
    expect(
      screen.getByTestId("plugin-detail-state").getAttribute("aria-label"),
    ).toBe("State: update-available");
    // Visible text is unchanged: "v" prefix on version, the lowercase
    // values otherwise — the metadata div's textContent reads as the
    // original "<marketplace> · v<version> · <state>" cadence.
    expect(
      screen
        .getByTestId("plugin-detail-marketplace")
        .parentElement?.textContent?.trim()
        .replace(/\s+/g, " "),
    ).toBe("community · v2.4.1 · update-available");
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

  // Layout + UX truncation recovery: long plugin names (qualified or
  // namespaced plugins regularly run 60+ chars) used to wrap onto multiple
  // lines, breaking the header `flex items-center justify-between` row and
  // pushing the right-side action buttons (Open in File Browser / Open in
  // VS Code) off the visible row. `truncate` keeps the <h2> to one line;
  // the matching `title` lets sighted users hover to read the hidden tail.
  // Same family as PR #225 (PluginAgentsTab name), #226 (PluginSkillsTab
  // name), #224 (McpServerCard name), #223 (SkillCard name), and the
  // broader truncation-recovery sweep (#167/#170/#171/#175 + PluginCard).
  it("plugin name <h2> has truncate + title for layout/UX recovery", () => {
    const longName =
      "anthropic-experimental-conversational-memory-with-vector-embeddings-plugin";
    render(<PluginDetailView plugin={makeDetail({ name: longName })} />);
    const h2 = screen.getByTestId("plugin-detail-name");
    expect(h2.tagName).toBe("H2");
    expect(h2.className).toContain("truncate");
    expect(h2.getAttribute("title")).toBe(longName);
    expect(h2.textContent).toBe(longName);
    // The flex column wrapping the <h2> needs `min-w-0` so `truncate`
    // actually engages — without it, the column is sized to the intrinsic
    // name width and the action buttons get pushed off the row.
    expect(h2.parentElement?.className).toContain("min-w-0");
  });

  // a11y: WCAG 1.3.1 + WAI-ARIA APG — the detail-view <section> must be a
  // labelled landmark bound to the visible plugin-name <h2> so SR rotor
  // users routing by landmarks (NVDA D, JAWS R, VoiceOver rotor →
  // Landmarks) jump to a region named after the currently-shown plugin
  // instead of an anonymous "section". Mirrors PRs #266 (PluginListView),
  // #267 (SkillsListView), #268 (McpPanel), and the dashboard
  // region-landmark sweep (#262/#263/#264/#265).
  it("root <section> is a labelled region bound to the visible plugin-name <h2>", () => {
    const plugin = makeDetail({ name: "my-plugin" });
    render(<PluginDetailView plugin={plugin} />);
    const root = screen.getByTestId("plugin-detail-view");
    expect(root.tagName).toBe("SECTION");
    const labelledBy = root.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    const heading = document.getElementById(labelledBy!);
    expect(heading).not.toBeNull();
    expect(heading!.tagName).toBe("H2");
    expect(heading!.getAttribute("data-testid")).toBe("plugin-detail-name");
    expect(heading!.textContent).toBe("my-plugin");
  });

  // Spec §6.7 — active plugins need a UI route to `claude plugins uninstall`.
  // PluginCard only surfaces Remove on broken cards; the store action existed
  // without any caller for active plugins (R2 half-built). The detail view is
  // the right home: it's the per-plugin landing surface that already groups
  // every other plugin-scoped action (Open in File Browser / VS Code).
  describe("Uninstall action (spec §6.7)", () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      invokeMock.mockReset();
      invokeMock.mockResolvedValue(0);
      loadPluginsMock.mockReset();
      loadPluginsMock.mockResolvedValue([]);
      usePluginStore.setState({
        plugins: [],
        selectedPlugin: null,
        searchQuery: "",
        isLoading: false,
        error: null,
      });
      confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    });
    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("is visible for active plugins inside the actions toolbar", () => {
      render(<PluginDetailView plugin={makeDetail({ state: "active" })} />);
      const btn = screen.getByTestId("detail-uninstall-btn");
      expect(btn.tagName).toBe("BUTTON");
      expect(btn.getAttribute("aria-label")).toBe("Uninstall alpha");
      const toolbar = screen.getByTestId("plugin-detail-actions-toolbar");
      expect(toolbar.contains(btn)).toBe(true);
    });

    const visibleStates: PluginState[] = ["active", "disabled", "update-available"];
    it.each(visibleStates)(
      "renders for state=%s (uninstall is meaningful when CLI has a live install to remove)",
      (state) => {
        render(<PluginDetailView plugin={makeDetail({ state })} />);
        expect(screen.queryByTestId("detail-uninstall-btn")).not.toBeNull();
      },
    );

    const hiddenStates: PluginState[] = ["broken", "orphaned"];
    it.each(hiddenStates)(
      "is hidden for state=%s (PluginCard already exposes the recovery affordance)",
      (state) => {
        render(<PluginDetailView plugin={makeDetail({ state })} />);
        expect(screen.queryByTestId("detail-uninstall-btn")).toBeNull();
      },
    );

    it("clicking confirms then calls uninstall_plugin IPC with name@marketplace", async () => {
      render(
        <PluginDetailView
          plugin={makeDetail({ name: "alpha", marketplace: "official" })}
        />,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId("detail-uninstall-btn"));
      });
      expect(confirmSpy).toHaveBeenCalledOnce();
      // First invoke call is `uninstall_plugin`; subsequent ones come from
      // the store's post-uninstall loadPlugins(). Pin the first.
      expect(invokeMock.mock.calls[0][0]).toBe("uninstall_plugin");
      expect(invokeMock.mock.calls[0][1]).toEqual({ key: "alpha@official" });
    });

    it("declining the confirm dialog is a no-op (no IPC fired)", async () => {
      confirmSpy.mockReturnValue(false);
      render(<PluginDetailView plugin={makeDetail()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("detail-uninstall-btn"));
      });
      expect(confirmSpy).toHaveBeenCalledOnce();
      expect(invokeMock).not.toHaveBeenCalled();
    });

    // Surface failures inline. Matches the openError pattern above + the
    // toggleError pattern on PluginCard — silent failure is the family bug.
    it("surfaces uninstall errors inline as role=alert", async () => {
      invokeMock.mockReset().mockRejectedValue(new Error("claude not in PATH"));
      render(<PluginDetailView plugin={makeDetail()} />);
      await act(async () => {
        fireEvent.click(screen.getByTestId("detail-uninstall-btn"));
      });
      await waitFor(() => {
        expect(screen.queryByTestId("plugin-uninstall-error")).not.toBeNull();
      });
      const err = screen.getByTestId("plugin-uninstall-error");
      expect(err.getAttribute("role")).toBe("alert");
      expect(err.textContent).toContain("claude not in PATH");
    });

    // Decorative icon next to the text label must be aria-hidden (WCAG 4.1.2),
    // mirroring the existing assertion for open-folder-btn / open-vscode-btn.
    it("button icon is aria-hidden", () => {
      render(<PluginDetailView plugin={makeDetail()} />);
      const btn = screen.getByTestId("detail-uninstall-btn");
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    });
  });
});
