// Tests for the MCP loader (T3.9). The Rust side reads JSON files; the
// loader's job is to parse, merge by scope precedence, and never spawn
// `claude mcp list` unless explicitly asked. We mock at the IPC boundary
// (`@tauri-apps/api/core`), never the unit under test.

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import {
  loadMcpServers,
  saveMcpServer,
  deleteMcpServer,
  mapStatusLine,
} from "../../src/lib/mcp-loader";
import type { McpServer } from "../../src/lib/mcp-types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "mcp-loader");
const CLAUDE_JSON = readFileSync(path.join(FIXTURES, "claude.json"), "utf8");
const PROJECT_MCP_JSON = readFileSync(
  path.join(FIXTURES, "project-root", ".mcp.json"),
  "utf8",
);

const PROJECT_ROOT = "C:/work/proj-a";

/** Wire mock for `read_claude_json` + `read_mcp_json`. */
function setupReads(opts: {
  claudeJson?: string;
  projectMcpJson?: string;
} = {}) {
  invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "read_claude_json") {
      return Promise.resolve(opts.claudeJson ?? CLAUDE_JSON);
    }
    if (cmd === "read_mcp_json") {
      void args;
      return Promise.resolve(opts.projectMcpJson ?? PROJECT_MCP_JSON);
    }
    if (cmd === "check_mcp_status") {
      throw new Error(
        `loader must not call check_mcp_status during loadMcpServers (test asserts gating)`,
      );
    }
    return Promise.resolve("");
  });
}

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadMcpServers", () => {
  it("case 1: parses user-scope servers from $.mcpServers in ~/.claude.json", async () => {
    setupReads({ projectMcpJson: "" });
    const servers = await loadMcpServers({ projectRoots: [] });
    const userOnly = servers.filter((s) => s.scope === "user");
    const names = userOnly.map((s) => s.name).sort();
    expect(names).toEqual(["fs", "remote-only-user", "shared"]);
    const fs = userOnly.find((s) => s.name === "fs")!;
    expect(fs.type).toBe("stdio");
    expect(fs.command).toBe("npx");
    expect(fs.env).toEqual({});
  });

  it("case 2: parses local-scope servers from $.projects[<cwd>].mcpServers", async () => {
    setupReads({ projectMcpJson: "" });
    const servers = await loadMcpServers({ projectRoots: [] });
    const local = servers.filter((s) => s.scope === "local");
    const names = local.map((s) => s.name).sort();
    expect(names).toEqual(["local-only", "shared"]);
    const localShared = local.find((s) => s.name === "shared")!;
    expect(localShared.command).toBe("local-cmd");
  });

  it("case 3: parses project-scope from <root>/.mcp.json; missing file → empty list, no throw", async () => {
    setupReads();
    const servers = await loadMcpServers({ projectRoots: [PROJECT_ROOT] });
    const proj = servers.filter((s) => s.scope === "project");
    expect(proj.map((s) => s.name).sort()).toEqual([
      "proj-trusted",
      "proj-untrusted",
      "shared",
    ]);

    // Missing file → empty (Rust returns "" for ENOENT).
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "read_claude_json") return Promise.resolve("{}");
      if (cmd === "read_mcp_json") return Promise.resolve("");
      throw new Error("unexpected " + cmd);
    });
    const empty = await loadMcpServers({ projectRoots: ["/nope"] });
    expect(empty).toEqual([]);
  });

  it("case 4: scope precedence (project > local > user); shadowed flagged", async () => {
    setupReads();
    const servers = await loadMcpServers({ projectRoots: [PROJECT_ROOT] });
    const shared = servers.filter((s) => s.name === "shared");
    expect(shared).toHaveLength(3);

    // Project wins, others marked overridden.
    const winner = shared.find((s) => !s.isOverridden)!;
    expect(winner.scope).toBe("project");
    expect(winner.command).toBe("project-cmd");

    const localShadow = shared.find((s) => s.scope === "local")!;
    expect(localShadow.isOverridden).toBe(true);
    expect(localShadow.overriddenBy).toBe("project");

    const userShadow = shared.find((s) => s.scope === "user")!;
    expect(userShadow.isOverridden).toBe(true);
    expect(userShadow.overriddenBy).toBe("project");
  });

  it("case 5: stdio server fixture (command + args + env) round-trips", async () => {
    setupReads({ projectMcpJson: "" });
    const servers = await loadMcpServers({ projectRoots: [] });
    const localShared = servers.find(
      (s) => s.scope === "local" && s.name === "shared",
    )!;
    expect(localShared.type).toBe("stdio");
    expect(localShared.command).toBe("local-cmd");
    expect(localShared.args).toEqual(["--local"]);
    expect(localShared.env).toEqual({ FOO: "bar" });
  });

  it("case 6: sse / http fixtures with ${ENV_VAR} placeholder headers preserved verbatim", async () => {
    setupReads({ projectMcpJson: "" });
    const servers = await loadMcpServers({ projectRoots: [] });
    const http = servers.find((s) => s.name === "remote-only-user")!;
    expect(http.type).toBe("http");
    expect(http.url).toBe("https://api.example.com/mcp");
    expect(http.headers).toEqual({ Authorization: "Bearer ${API_TOKEN}" });

    const sse = servers.find((s) => s.name === "local-only")!;
    expect(sse.type).toBe("sse");
    expect(sse.url).toBe("https://sse.example.com/stream");
  });

  it("case 7: isTrusted derived from enabledMcpjsonServers / disabledMcpjsonServers (project-scope only)", async () => {
    setupReads();
    const servers = await loadMcpServers({ projectRoots: [PROJECT_ROOT] });
    const trusted = servers.find(
      (s) => s.scope === "project" && s.name === "proj-trusted",
    )!;
    expect(trusted.isTrusted).toBe(true);

    const untrusted = servers.find(
      (s) => s.scope === "project" && s.name === "proj-untrusted",
    )!;
    expect(untrusted.isTrusted).toBe(false);

    // Project entry not in either list → undefined.
    const unknown = servers.find(
      (s) => s.scope === "project" && s.name === "shared",
    )!;
    expect(unknown.isTrusted).toBeUndefined();

    // Non-project scopes never carry isTrusted.
    for (const s of servers) {
      if (s.scope !== "project") expect(s.isTrusted).toBeUndefined();
    }
  });

  it("case 8: check_mcp_status is NEVER called during loadMcpServers (spec §8.3 warning)", async () => {
    setupReads();
    await loadMcpServers({ projectRoots: [PROJECT_ROOT] });
    const calls = invokeMock.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("check_mcp_status");
  });

  it("case 9: status mapping covers connected, disconnected, error, starting", () => {
    expect(mapStatusLine("✔ connected")).toBe("connected");
    expect(mapStatusLine("✘ disconnected")).toBe("disconnected");
    expect(mapStatusLine("error: timeout")).toBe("error");
    expect(mapStatusLine("starting...")).toBe("starting");
    // Unknown → disconnected (safe default).
    expect(mapStatusLine("???")).toBe("disconnected");
  });

  it("case 10: saveMcpServer round-trips through atomic write Rust command", async () => {
    invokeMock.mockResolvedValue(undefined);
    const server: McpServer = {
      name: "new-srv",
      type: "stdio",
      scope: "user",
      status: "disconnected",
      command: "x",
      args: [],
      env: {},
      isOverridden: false,
    };
    await saveMcpServer(server, { cwd: "" });
    const call = invokeMock.mock.calls.find(
      (c) => c[0] === "write_mcp_server",
    );
    expect(call).toBeTruthy();
    const args = call![1] as { scope: string; name: string; configJson: string; cwd: string };
    expect(args.scope).toBe("user");
    expect(args.name).toBe("new-srv");
    const cfg = JSON.parse(args.configJson);
    expect(cfg.command).toBe("x");
    // Loader must NOT pass loader-only fields back to disk.
    expect(cfg.scope).toBeUndefined();
    expect(cfg.isOverridden).toBeUndefined();
  });

  it("case 11: deleteMcpServer hits the correct Rust command per scope", async () => {
    invokeMock.mockResolvedValue(undefined);
    await deleteMcpServer("user", "fs", { cwd: "" });
    await deleteMcpServer("local", "shared", { cwd: PROJECT_ROOT });
    await deleteMcpServer("project", "proj-trusted", { cwd: PROJECT_ROOT });
    const calls = invokeMock.mock.calls.filter(
      (c) => c[0] === "remove_mcp_server",
    );
    expect(calls).toHaveLength(3);
    expect((calls[0][1] as { scope: string }).scope).toBe("user");
    expect((calls[1][1] as { scope: string; cwd: string }).cwd).toBe(
      PROJECT_ROOT,
    );
    expect((calls[2][1] as { scope: string }).scope).toBe("project");
  });
});
