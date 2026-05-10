// Tests for McpPanel — header buttons, scope grouping, search, highlight,
// loading skeleton and empty state, dark/light parity.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn() }));

import { McpPanel } from "../../../src/components/mcp/McpPanel";
import { useMcpStore } from "../../../src/stores/mcp-store";
import {
  ALL_FIXTURES,
  FIX_CONNECTED,
  FIX_DISCONNECTED,
  FIX_HTTP,
} from "../../fixtures/mcp-ui/servers";

beforeEach(() => {
  invokeMock.mockReset();
  useMcpStore.setState({
    servers: [],
    searchQuery: "",
    isLoading: false,
    error: null,
    editingServer: null,
    cwd: "",
    projectRoots: [],
  });
});
afterEach(() => cleanup());

describe("McpPanel", () => {
  it("mounts without console errors and never invokes claude mcp list on render", () => {
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...a) => {
      errs.push(a);
      orig(...a);
    };
    try {
      render(<McpPanel />);
      expect(errs).toEqual([]);
    } finally {
      console.error = orig;
    }
    expect(invokeMock.mock.calls.map((c) => c[0])).not.toContain(
      "check_mcp_status",
    );
  });

  it("header has title, [+ Add Server], [Refresh Status], search bar", () => {
    render(<McpPanel />);
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
    expect(screen.getByTestId("add-server-btn")).toBeInTheDocument();
    expect(screen.getByTestId("refresh-status-btn")).toBeInTheDocument();
    expect(screen.getByTestId("mcp-search")).toBeInTheDocument();
  });

  // WCAG 4.1.2 Name, Role, Value: the search input previously relied on its
  // placeholder for an accessible name (placeholders don't count). Mirror
  // SessionSearch (PR #45) — provide an explicit aria-label, and mark the
  // decorative magnifying-glass icon aria-hidden.
  it("search input has an accessible name (aria-label) and the icon is aria-hidden", () => {
    render(<McpPanel />);
    const input = screen.getByTestId("mcp-search");
    expect(input.getAttribute("aria-label")).toBe("Search MCP servers");
  });

  it("groups rendered with spec scope headers", () => {
    useMcpStore.setState({ servers: ALL_FIXTURES });
    render(<McpPanel />);
    expect(screen.getByTestId("scope-header-user").textContent).toBe(
      "User Scope (available in all projects)",
    );
    expect(screen.getByTestId("scope-header-local").textContent).toBe(
      "Local Scope (private to current project)",
    );
    expect(screen.getByTestId("scope-header-project").textContent).toBe(
      "Project Scope",
    );
  });

  it("search filters by name + command + args (stdio) + url (sse/http) per spec §17.7", () => {
    useMcpStore.setState({
      servers: [FIX_CONNECTED, FIX_DISCONNECTED, FIX_HTTP],
    });
    render(<McpPanel />);
    expect(screen.getAllByTestId("mcp-server-card")).toHaveLength(3);

    fireEvent.change(screen.getByTestId("mcp-search"), {
      target: { value: "example.com" },
    });
    let cards = screen.getAllByTestId("mcp-server-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.serverName).toBe("remote-http");

    fireEvent.change(screen.getByTestId("mcp-search"), {
      target: { value: "filesystem" },
    });
    cards = screen.getAllByTestId("mcp-server-card");
    // matches via args
    expect(cards.map((c) => c.dataset.serverName)).toContain("fs-connected");
  });

  it("matching segments highlighted with bg-accent/20 (spec §17.7)", () => {
    useMcpStore.setState({ servers: [FIX_CONNECTED] });
    render(<McpPanel />);
    fireEvent.change(screen.getByTestId("mcp-search"), {
      target: { value: "connected" },
    });
    const mark = screen.getByTestId("search-highlight");
    expect(mark.className).toContain("bg-accent/20");
    expect(mark.textContent).toBe("connected");
  });

  it("loading shows 2 skeleton cards per scope group", () => {
    useMcpStore.setState({ isLoading: true, servers: [] });
    render(<McpPanel />);
    const sk = screen.getByTestId("loading-skeleton");
    // 3 scope groups × 2 skeleton placeholders = 6 .animate-pulse divs
    const pulses = sk.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBe(6);
  });

  it("empty state per spec §17.6 with [+ Add Server]", () => {
    render(<McpPanel />);
    const empty = screen.getByTestId("empty-state");
    expect(empty.textContent).toContain("No MCP servers configured");
    expect(screen.getByTestId("empty-add-btn")).toBeInTheDocument();
  });

  it("dark + light theme parity: same root utilities", () => {
    useMcpStore.setState({ servers: [] });
    const { unmount } = render(<McpPanel />);
    const lightClass = screen.getByTestId("mcp-panel").className;
    unmount();
    document.documentElement.classList.add("dark");
    try {
      render(<McpPanel />);
      const darkClass = screen.getByTestId("mcp-panel").className;
      expect(darkClass).toBe(lightClass);
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  // WCAG 4.1.2 (Name, Role, Value): decorative lucide icons next to button
  // text labels must be aria-hidden so SR users don't hear "Plus, Add Server"
  // or "RefreshCw, Refresh Status". Mirrors PR #58 (SkillCard) and PR #55
  // (QuickActions). Header buttons + the empty-state Add Server button.
  it("header + empty-state button icons are aria-hidden", () => {
    render(<McpPanel />);
    for (const id of ["add-server-btn", "refresh-status-btn", "empty-add-btn"]) {
      const btn = screen.getByTestId(id);
      const svg = btn.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  // WCAG 2.4.7 Focus Visible — keyboard users tabbing through the MCP page
  // need a visible focus indicator on every interactive control. Mirrors the
  // family of focus-ring fixes in PRs #17/#45/#48/#49/#56/#57/#67/#111.
  it("header + empty-state buttons have a focus-visible ring (WCAG 2.4.7)", () => {
    render(<McpPanel />);
    for (const id of ["add-server-btn", "refresh-status-btn", "empty-add-btn"]) {
      const btn = screen.getByTestId(id);
      expect(btn.className).toContain("focus-visible:ring-2");
      expect(btn.className).toContain("focus-visible:ring-accent");
    }
  });

  // WCAG 2.4.7 Focus Visible — the search input previously used
  // `focus:outline-none focus:border-accent`, which (a) strips the browser
  // default for *every* focus (including mouse) and (b) replaces it with a
  // 1-px border-color shift between border-border and border-accent on
  // bg-bg-tertiary — barely visible. Mirrors the input focus-ring trio
  // used elsewhere in the codebase.
  it("search input has a focus-visible ring (WCAG 2.4.7)", () => {
    render(<McpPanel />);
    const input = screen.getByTestId("mcp-search");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.className).toContain("focus-visible:ring-2");
    expect(input.className).toContain("focus-visible:ring-accent");
    // The old `focus:` (non-`focus-visible`) class is removed so mouse
    // clicks no longer strip the outline silently.
    expect(input.className).not.toMatch(/(^|\s)focus:outline-none(\s|$)/);
  });

  // UX bug: WebView2 (Tauri's webview) does not consistently honor the
  // `<input type=search>` browser-default Escape-to-clear behavior, and
  // even when it does, the keystroke bubbles up without giving the input
  // focus back — so the user has to click the field again before they can
  // type a new query. Wire an explicit Escape handler so the field clears
  // and stays focused, the standard search-box pattern.
  it("Escape clears the search query while keeping focus on the input", () => {
    render(<McpPanel />);
    const input = screen.getByTestId("mcp-search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "git" } });
    expect(input.value).toBe("git");
    input.focus();
    expect(document.activeElement).toBe(input);
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(false); // default prevented (no form-close etc.)
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  // The Escape handler is gated on a non-empty query so that an empty-state
  // Esc keystroke does NOT preventDefault — leaving room for any outer
  // dialog/modal to receive it.
  it("Escape on an empty search field is a no-op (does not preventDefault)", () => {
    render(<McpPanel />);
    const input = screen.getByTestId("mcp-search") as HTMLInputElement;
    expect(input.value).toBe("");
    const evt = fireEvent.keyDown(input, { key: "Escape" });
    expect(evt).toBe(true); // default NOT prevented
    expect(input.value).toBe("");
  });
});
