// Tests for the MCP store (T3.10). Mocks at module boundaries:
//   - `../../src/lib/mcp-loader` → loadMcpServers / saveMcpServer /
//     deleteMcpServer / mapStatusLine
//   - `@tauri-apps/api/core`     → invoke (check_mcp_status, restart, connect)
// We never mock the store under test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadMcpServersMock = vi.fn();
const saveMcpServerMock = vi.fn();
const deleteMcpServerMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("../../src/lib/mcp-loader", async () => {
  const actual =
    await vi.importActual<typeof import("../../src/lib/mcp-loader")>(
      "../../src/lib/mcp-loader",
    );
  return {
    ...actual,
    loadMcpServers: (...args: unknown[]) => loadMcpServersMock(...args),
    saveMcpServer: (...args: unknown[]) => saveMcpServerMock(...args),
    deleteMcpServer: (...args: unknown[]) => deleteMcpServerMock(...args),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  filterMcpServers,
  serversByScope,
  useMcpStore,
} from "../../src/stores/mcp-store";
import type { McpServer } from "../../src/lib/mcp-types";

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    name: "fs",
    type: "stdio",
    scope: "user",
    status: "disconnected",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    env: {},
    isOverridden: false,
    ...overrides,
  };
}

beforeEach(() => {
  useMcpStore.setState({
    servers: [],
    searchQuery: "",
    isLoading: false,
    error: null,
    editingServer: null,
    cwd: "",
  });
  loadMcpServersMock.mockReset();
  saveMcpServerMock.mockReset();
  deleteMcpServerMock.mockReset();
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMcpStore", () => {
  it("case 1: loadServers populates state and serversByScope groups them", async () => {
    const list: McpServer[] = [
      makeServer({ name: "a", scope: "user" }),
      makeServer({ name: "b", scope: "local" }),
      makeServer({ name: "c", scope: "project", isTrusted: true }),
    ];
    loadMcpServersMock.mockResolvedValueOnce(list);
    await useMcpStore.getState().loadServers();
    expect(useMcpStore.getState().servers).toEqual(list);
    expect(useMcpStore.getState().isLoading).toBe(false);

    const grouped = serversByScope(useMcpStore.getState().servers);
    expect(grouped.user.map((s) => s.name)).toEqual(["a"]);
    expect(grouped.local.map((s) => s.name)).toEqual(["b"]);
    expect(grouped.project.map((s) => s.name)).toEqual(["c"]);
  });

  it("case 2: addServer / updateServer / removeServer call writers and refresh state", async () => {
    const initial = [makeServer({ name: "a", scope: "user" })];
    loadMcpServersMock.mockResolvedValue(initial);
    await useMcpStore.getState().loadServers();

    saveMcpServerMock.mockResolvedValue(undefined);
    deleteMcpServerMock.mockResolvedValue(undefined);

    const newSrv = makeServer({ name: "b", scope: "user" });
    loadMcpServersMock.mockResolvedValueOnce([...initial, newSrv]);
    await useMcpStore.getState().addServer(newSrv);
    expect(saveMcpServerMock).toHaveBeenCalledWith(
      newSrv,
      expect.objectContaining({ cwd: "" }),
    );
    expect(useMcpStore.getState().servers.map((s) => s.name)).toEqual([
      "a",
      "b",
    ]);

    const updated = { ...newSrv, command: "uvx" };
    loadMcpServersMock.mockResolvedValueOnce([initial[0], updated]);
    await useMcpStore.getState().updateServer(updated);
    expect(saveMcpServerMock).toHaveBeenCalledTimes(2);

    loadMcpServersMock.mockResolvedValueOnce([initial[0]]);
    await useMcpStore.getState().removeServer("user", "b");
    expect(deleteMcpServerMock).toHaveBeenCalledWith(
      "user",
      "b",
      expect.objectContaining({ cwd: "" }),
    );
    expect(useMcpStore.getState().servers.map((s) => s.name)).toEqual(["a"]);
  });

  it("case 3: refreshStatus updates server.status from mocked check_mcp_status; never spawns the real CLI", async () => {
    const list = [
      makeServer({ name: "a", status: "disconnected" }),
      makeServer({ name: "b", status: "disconnected" }),
    ];
    loadMcpServersMock.mockResolvedValueOnce(list);
    await useMcpStore.getState().loadServers();

    invokeMock.mockResolvedValueOnce(
      "a: ✔ connected\nb: error: timeout\n",
    );
    await useMcpStore.getState().refreshStatus();

    const calls = invokeMock.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(["check_mcp_status"]);
    const after = useMcpStore.getState().servers;
    expect(after.find((s) => s.name === "a")!.status).toBe("connected");
    expect(after.find((s) => s.name === "b")!.status).toBe("error");
  });

  it("case 3b: refreshStatus parses ACTUAL `claude mcp list` output captured 2026-05-09 — regression guard for 'all servers DISCONNECTED forever' defect", async () => {
    // Captured live from `claude mcp list` on Windows, claude CLI shipped
    // with claude-code 2.1.x. The header line ("Checking MCP server
    // health...") and blank line must be ignored; the data lines have a
    // trailing " - ✓ Connected" / " - ✗ Failed to connect" suffix that
    // the regex captures into the rest, then mapStatusLine substring-
    // matches "connected"/"disconnected"/"error" out of it.
    //
    // Plan defect 2026-05-08-ui-defect-sweep §MCP "All servers show
    // DISCONNECTED forever" — verified the regex /^([\w.-]+)\s*:\s*(.*)$/
    // + mapStatusLine() substring matcher correctly classify both
    // connected and disconnected lines from the current CLI version.
    const list = [
      makeServer({ name: "playwright", status: "disconnected" }),
      makeServer({ name: "pencil", status: "disconnected" }),
      makeServer({ name: "broken-one", status: "disconnected" }),
    ];
    loadMcpServersMock.mockResolvedValueOnce(list);
    await useMcpStore.getState().loadServers();

    const captured = [
      "Checking MCP server health...",
      "",
      "playwright: npx -y @playwright/mcp@latest - ✓ Connected",
      "pencil: C:\\Users\\u\\.pencil\\mcp\\out\\srv.exe --app vscode - ✓ Connected",
      "broken-one: node /missing/server.js - ✗ Failed to connect",
      "",
    ].join("\n");
    invokeMock.mockResolvedValueOnce(captured);
    await useMcpStore.getState().refreshStatus();

    const after = useMcpStore.getState().servers;
    expect(after.find((s) => s.name === "playwright")!.status).toBe("connected");
    expect(after.find((s) => s.name === "pencil")!.status).toBe("connected");
    // "Failed to connect" lacks the substring "connected" cleanly (it
    // contains it inside "to connect"? actually "to connect" does NOT
    // contain "connected"). Let mapStatusLine fall through to its
    // default: "disconnected". This is the correct safe default per
    // mcp-loader.ts:103.
    expect(after.find((s) => s.name === "broken-one")!.status).toBe(
      "disconnected",
    );
  });

  it("case 5: filterMcpServers matches name + command + args (stdio) and url (sse/http)", () => {
    const all: McpServer[] = [
      makeServer({ name: "filesystem", command: "npx", args: ["-y", "fs-pkg"] }),
      makeServer({
        name: "remote",
        type: "http",
        command: undefined,
        args: undefined,
        url: "https://api.example.com/mcp",
      }),
      makeServer({ name: "alpha", command: "alpha-cmd", args: [] }),
    ];

    expect(filterMcpServers(all, "file").map((s) => s.name)).toEqual([
      "filesystem",
    ]);
    expect(filterMcpServers(all, "alpha-cmd").map((s) => s.name)).toEqual([
      "alpha",
    ]);
    expect(filterMcpServers(all, "fs-pkg").map((s) => s.name)).toEqual([
      "filesystem",
    ]);
    expect(filterMcpServers(all, "example.com").map((s) => s.name)).toEqual([
      "remote",
    ]);
    // Empty query → all.
    expect(filterMcpServers(all, "").length).toBe(3);
    // Case-insensitive.
    expect(filterMcpServers(all, "FILE").map((s) => s.name)).toEqual([
      "filesystem",
    ]);
  });

  it("case 6: startEditing / stopEditing toggle editingServer cleanly", () => {
    const srv = makeServer({ name: "a" });
    useMcpStore.getState().startEditing(srv);
    expect(useMcpStore.getState().editingServer).toEqual(srv);
    useMcpStore.getState().stopEditing();
    expect(useMcpStore.getState().editingServer).toBeNull();
  });

  it("case 7: error path — write rejection rolls back optimistic state", async () => {
    const initial = [makeServer({ name: "a", scope: "user" })];
    loadMcpServersMock.mockResolvedValueOnce(initial);
    await useMcpStore.getState().loadServers();

    saveMcpServerMock.mockRejectedValueOnce(new Error("boom"));
    const newSrv = makeServer({ name: "b", scope: "user" });
    await expect(useMcpStore.getState().addServer(newSrv)).rejects.toThrow(
      "boom",
    );

    // No reload happened, so list stays as before; error is set.
    expect(useMcpStore.getState().servers.map((s) => s.name)).toEqual(["a"]);
    expect(useMcpStore.getState().error).toContain("boom");
  });
});
