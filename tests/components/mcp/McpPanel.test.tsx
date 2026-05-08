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
});
