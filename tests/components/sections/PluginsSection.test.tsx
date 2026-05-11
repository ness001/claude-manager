// Tests for PluginsSection wiring — list ↔ detail switch and back button.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";

import { PluginsSection } from "../../../src/sections/PluginsSection";
import { usePluginStore } from "../../../src/stores/plugin-store";
import type {
  PluginDetail,
  PluginMeta,
} from "../../../src/lib/plugin-types";

// Mock the loader IPC at the module boundary so loadPlugins() doesn't try
// to talk to Tauri.
vi.mock("../../../src/lib/plugin-loader", () => ({
  loadPlugins: vi.fn(async () => []),
  loadPluginDetail: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

function makePlugin(overrides: Partial<PluginMeta> = {}): PluginMeta {
  return {
    name: "alpha",
    marketplace: "official",
    version: "1.0.0",
    gitCommitSha: "0".repeat(40),
    description: "the alpha plugin",
    installPath: "/cache/official/alpha/1.0.0",
    state: "active",
    skillCount: 0,
    agentCount: 0,
    hookCount: 0,
    hasClaudeMd: false,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PluginDetail> = {}): PluginDetail {
  return {
    ...makePlugin(),
    skills: [],
    agents: [],
    hooks: [],
    ...overrides,
  };
}

describe("PluginsSection", () => {
  beforeEach(() => {
    usePluginStore.setState({
      plugins: [],
      selectedPlugin: null,
      searchQuery: "",
      isLoading: false,
      error: null,
    });
  });
  afterEach(() => cleanup());

  it("mounts without console errors", async () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...args) => {
      errs.push(args);
      orig(...args);
    };
    try {
      await act(async () => {
        render(<PluginsSection />);
        await Promise.resolve();
      });
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
  });

  it("no selection → renders PluginListView", async () => {
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    expect(screen.getByTestId("plugin-list-view")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-detail-view")).toBeNull();
  });

  it("selecting a plugin via store → renders PluginDetailView with back button", async () => {
    usePluginStore.setState({
      plugins: [makePlugin()],
      selectedPlugin: makeDetail(),
    });
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    expect(screen.getByTestId("plugin-detail-view")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-back-btn")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-list-view")).toBeNull();
  });

  it("back button click → returns to list (selection cleared)", async () => {
    usePluginStore.setState({
      plugins: [makePlugin()],
      selectedPlugin: makeDetail(),
    });
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("plugin-back-btn"));
      await Promise.resolve();
    });
    expect(usePluginStore.getState().selectedPlugin).toBeNull();
    expect(screen.getByTestId("plugin-list-view")).toBeInTheDocument();
  });

  // WCAG 4.1.2 (Name, Role, Value): the decorative ArrowLeft lucide icon
  // next to the visible "Back to plugins" label must be aria-hidden so screen
  // readers don't announce "ArrowLeft, Back to plugins". Mirrors PR #58
  // (SkillCard) and PR #66 (PluginDetailView header buttons).
  it("back button icon is aria-hidden", async () => {
    usePluginStore.setState({
      plugins: [makePlugin()],
      selectedPlugin: makeDetail(),
    });
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    const btn = screen.getByTestId("plugin-back-btn");
    const svg = btn.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  // WCAG 2.4.7 (Focus Visible): the Back-to-plugins button is a wired,
  // keyboard-operable control that clears the plugin selection — but it had
  // no focus ring at all, relying on the browser default which Tauri's
  // WebView renders inconsistently across platforms. Mirrors the trio used
  // in PRs #117 / #118 / #119 / #125 / #126 / #128 / #129 / #132.
  it("back button exposes a visible focus ring (WCAG 2.4.7)", async () => {
    usePluginStore.setState({
      plugins: [makePlugin()],
      selectedPlugin: makeDetail(),
    });
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    const btn = screen.getByTestId("plugin-back-btn");
    expect(btn.className).toContain("focus-visible:outline-none");
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("focus-visible:ring-accent");
  });

  it("loading state renders skeletons; empty state renders spec §17.6 copy", async () => {
    usePluginStore.setState({ isLoading: true, plugins: [] });
    const { unmount } = render(<PluginsSection />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
    unmount();

    usePluginStore.setState({ isLoading: false, plugins: [] });
    await act(async () => {
      render(<PluginsSection />);
      await Promise.resolve();
    });
    expect(screen.getByTestId("empty-state").textContent).toContain(
      "No plugins installed",
    );
  });

  it("dark + light theme parity: section keeps the same root utilities", async () => {
    const { unmount } = render(<PluginsSection />);
    const lightClass = screen.getByTestId("plugins-section").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      await act(async () => {
        render(<PluginsSection />);
        await Promise.resolve();
      });
      const darkClass = screen.getByTestId("plugins-section").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  // WCAG 1.3.1 (Info and Relationships) + 2.4.6 (Headings and Labels): the
  // outer <section data-testid="plugins-section"> contributes a region
  // landmark only when it carries an accessible name. Mirrors the
  // McpSection / SkillsSection convention. Both code paths (list view and
  // detail view) must expose the same aria-label so SR users can locate
  // "Plugins" by landmark navigation regardless of which sub-view is open.
  it("outer <section> exposes aria-label='Plugins' in list view", () => {
    render(<PluginsSection />);
    expect(
      screen.getByTestId("plugins-section").getAttribute("aria-label"),
    ).toBe("Plugins");
  });

  it("outer <section> exposes aria-label='Plugins' in detail view", () => {
    usePluginStore.setState({
      selectedPlugin: makeDetail({ name: "alpha" }),
    });
    render(<PluginsSection />);
    expect(
      screen.getByTestId("plugins-section").getAttribute("aria-label"),
    ).toBe("Plugins");
  });
});
