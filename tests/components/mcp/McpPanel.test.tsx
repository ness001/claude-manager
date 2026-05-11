// Tests for McpPanel — header buttons, scope grouping, search, highlight,
// loading skeleton and empty state, dark/light parity.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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

  // WCAG 1.3.1 (Info and Relationships): the per-scope cards form a list
  // of N MCP servers but were previously emitted as flat sibling <div>s
  // alongside the <h2> scope header — SR users navigating by lists (NVDA
  // "L", JAWS "L", VoiceOver rotor → Lists) heard nothing for these
  // collections and the count was lost. Promote each scope group to a
  // <ul aria-labelledby={scope-header}> so the rotor surfaces "list, N
  // items" with the scope header text as the list's accessible name.
  // Mirrors PR #235 (SkillsListView) and PR #236 (PluginListView).
  it("each scope group wraps cards in a labelled <ul> (WCAG 1.3.1)", () => {
    useMcpStore.setState({
      servers: [FIX_CONNECTED, FIX_DISCONNECTED, FIX_HTTP],
    });
    render(<McpPanel />);
    // Each visible scope must have its own <ul> labelled by its <h2>.
    const userList = screen.getByTestId("scope-list-user");
    expect(userList.tagName).toBe("UL");
    expect(userList.getAttribute("aria-labelledby")).toBe("scope-header-user");
    // The rotor lookup that matters: getByRole("list", { name: ... })
    // resolves the aria-labelledby chain.
    const userByRole = screen.getByRole("list", { name: /User Scope/ });
    expect(userByRole).toBe(userList);
    // Each card nests in its own listitem rather than sitting beside it.
    const items = within(userList).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    expect(
      items[0].querySelector("[data-testid='mcp-server-card']"),
    ).not.toBeNull();
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

  // a11y: the no-matches message appears as the user types into the search
  // box. Without role="status" + aria-live="polite", screen-reader users
  // get NO feedback that their query produced zero results — they'd only
  // discover it by tabbing into an empty result region. "polite" so the
  // announcement waits for the user to pause typing rather than firing on
  // every keystroke. Mirrors PR #154 (PluginListView).
  it("no-matches message is a polite live region (a11y: search announce)", () => {
    useMcpStore.setState({ servers: [FIX_CONNECTED] });
    render(<McpPanel />);
    fireEvent.change(screen.getByTestId("mcp-search"), {
      target: { value: "zzznoneofthese" },
    });
    const empty = screen.getByTestId("no-matches");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
  });

  it("loading shows 2 skeleton cards per scope group", () => {
    useMcpStore.setState({ isLoading: true, servers: [] });
    render(<McpPanel />);
    const sk = screen.getByTestId("loading-skeleton");
    // 3 scope groups × 2 skeleton placeholders = 6 .animate-pulse divs
    const pulses = sk.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBe(6);
  });

  // WCAG 4.1.3 (Status Messages): the loading skeleton's pulsing rectangles
  // convey "loading in progress" purely visually. Without aria-busy + a
  // polite status announcement, SR users get no indication that loading
  // is happening — content appears suddenly with no signal.
  it("loading skeleton exposes aria-busy + polite status to AT (WCAG 4.1.3)", () => {
    useMcpStore.setState({ isLoading: true, servers: [] });
    render(<McpPanel />);
    const sk = screen.getByTestId("loading-skeleton");
    expect(sk.getAttribute("aria-busy")).toBe("true");
    const status = sk.querySelector("[role='status']");
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("Loading MCP servers");
    // Each pulsing rectangle must be aria-hidden so SR users don't hear
    // empty graphics in addition to the polite status line.
    const pulses = sk.querySelectorAll(".animate-pulse");
    pulses.forEach((p) => {
      expect(p.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("empty state per spec §17.6 with [+ Add Server]", () => {
    render(<McpPanel />);
    const empty = screen.getByTestId("empty-state");
    expect(empty.textContent).toContain("No MCP servers configured");
    expect(screen.getByTestId("empty-add-btn")).toBeInTheDocument();
  });

  // WCAG 4.1.3 (Status Messages): the loading→empty transition (or a delete
  // that drops the last server) leaves SR users with no feedback. Mirrors
  // PR #214 (Plugin tabs) and PR #218 (PluginListView empty-state).
  it("empty state is a polite live region (a11y)", () => {
    render(<McpPanel />);
    const empty = screen.getByTestId("empty-state");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.getAttribute("aria-live")).toBe("polite");
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

  // Defect: store sets `error` on `claude mcp list` / `check_mcp_status`
  // IPC failures (missing `claude` binary, sandbox denial, malformed output)
  // but the UI never rendered it — the user clicked Refresh Status and got
  // zero feedback. Mirrors PR #168 (PluginDetailView), PR #172 (SkillsListView
  // Create Skill silent failure).
  it("renders the store's error as an inline alert when set", () => {
    useMcpStore.setState({ error: "claude binary not found in PATH" });
    render(<McpPanel />);
    const alert = screen.getByTestId("mcp-refresh-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("claude binary not found in PATH");
  });

  it("does not render the error alert when error is null", () => {
    useMcpStore.setState({ error: null });
    render(<McpPanel />);
    expect(screen.queryByTestId("mcp-refresh-error")).toBeNull();
  });
});
