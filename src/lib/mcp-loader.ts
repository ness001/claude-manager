// MCP server loader — see spec §8.1, §8.3, §10.
//
// Pipeline:
//   1. Read `~/.claude.json` (raw string via Rust `read_claude_json`).
//   2. Extract user-scope from `$.mcpServers`.
//   3. Extract local-scope from `$.projects[<cwd>].mcpServers` for each
//      project entry.
//   4. For each known project root the caller passes in, read
//      `<root>/.mcp.json` for project-scope entries; cross-reference
//      `enabledMcpjsonServers` / `disabledMcpjsonServers` in the matching
//      `$.projects[<root>]` entry to derive `isTrusted` (project-scope only).
//   5. Resolve precedence project > local > user. Same-named entries at
//      lower scopes are flagged `isOverridden` + `overriddenBy`.
//
// Status (`claude mcp list`) is NOT fetched here — spec §8.3 warns that
// the CLI spawns servers for health checks, so it stays opt-in via
// `refreshMcpStatus()` (T3.10).

import { invoke } from "@tauri-apps/api/core";

import type {
  McpScope,
  McpServer,
  McpServerState,
  McpServerType,
} from "./mcp-types";

/** Wire shape of one server entry inside `~/.claude.json` or `.mcp.json`. */
interface ServerWire {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface ProjectEntry {
  mcpServers?: Record<string, ServerWire>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

interface ClaudeJson {
  mcpServers?: Record<string, ServerWire>;
  projects?: Record<string, ProjectEntry>;
}

interface ProjectMcpJson {
  mcpServers?: Record<string, ServerWire>;
  // Older shape: top-level keys ARE the servers (no wrapper).
  // Detected by the absence of `mcpServers` and presence of any object
  // value with a `type` field.
  [k: string]: unknown;
}

/** Best-effort JSON parse — never throws. */
function parseJsonOr<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Coerce wire `type` to a known union; default `stdio`. */
function coerceType(t: string | undefined): McpServerType {
  return t === "sse" || t === "http" ? t : "stdio";
}

/** Build an `McpServer` from a wire entry. `env` defaults to `{}`. */
function buildServer(args: {
  name: string;
  scope: McpScope;
  wire: ServerWire;
  isTrusted?: boolean;
}): McpServer {
  const { name, scope, wire, isTrusted } = args;
  const type = coerceType(wire.type);
  const server: McpServer = {
    name,
    type,
    scope,
    status: "disconnected",
    env: wire.env ?? {},
    isOverridden: false,
  };
  if (type === "stdio") {
    if (wire.command !== undefined) server.command = wire.command;
    if (wire.args !== undefined) server.args = wire.args;
  } else {
    if (wire.url !== undefined) server.url = wire.url;
    if (wire.headers !== undefined) server.headers = wire.headers;
  }
  if (scope === "project" && isTrusted !== undefined) {
    server.isTrusted = isTrusted;
  }
  return server;
}

/** Map a single line of `claude mcp list` output to a state. Unknown
 *  → `disconnected` (the safe default — UI shows hollow gray dot). */
export function mapStatusLine(line: string): McpServerState {
  const l = line.toLowerCase();
  if (l.includes("starting")) return "starting";
  if (l.includes("error")) return "error";
  if (l.includes("connected") && !l.includes("disconnected"))
    return "connected";
  if (l.includes("disconnected")) return "disconnected";
  return "disconnected";
}

/**
 * Load all MCP servers across user + local + project scopes.
 *
 * `projectRoots` are the project paths the caller wants to scan for
 * `<root>/.mcp.json`. Typically the CWDs known from the session store.
 * Empty list → only user + local scopes are loaded.
 */
export async function loadMcpServers(opts: {
  projectRoots: string[];
}): Promise<McpServer[]> {
  const claudeJsonText = await invoke<string>("read_claude_json");
  const claude = parseJsonOr<ClaudeJson>(claudeJsonText, {});

  const all: McpServer[] = [];

  // 1. User scope.
  for (const [name, wire] of Object.entries(claude.mcpServers ?? {})) {
    all.push(buildServer({ name, scope: "user", wire }));
  }

  // 2. Local scope — entries under each $.projects[<cwd>].mcpServers.
  for (const project of Object.values(claude.projects ?? {})) {
    for (const [name, wire] of Object.entries(project.mcpServers ?? {})) {
      all.push(buildServer({ name, scope: "local", wire }));
    }
  }

  // 3. Project scope — read each <root>/.mcp.json in parallel.
  const projectFiles = await Promise.all(
    opts.projectRoots.map(async (root) => {
      const text = await invoke<string>("read_mcp_json", {
        projectRoot: root,
      });
      return { root, text };
    }),
  );
  for (const { root, text } of projectFiles) {
    const parsed = parseJsonOr<ProjectMcpJson>(text, {});
    const wireMap =
      parsed.mcpServers ??
      // Fallback: top-level keys treated as servers when no wrapper.
      (Object.fromEntries(
        Object.entries(parsed).filter(
          ([, v]) =>
            v !== null &&
            typeof v === "object" &&
            "type" in (v as Record<string, unknown>),
        ),
      ) as Record<string, ServerWire>);

    const projectEntry = claude.projects?.[root];
    const enabled = new Set(projectEntry?.enabledMcpjsonServers ?? []);
    const disabled = new Set(projectEntry?.disabledMcpjsonServers ?? []);

    for (const [name, wire] of Object.entries(wireMap)) {
      let isTrusted: boolean | undefined;
      if (enabled.has(name)) isTrusted = true;
      else if (disabled.has(name)) isTrusted = false;
      all.push(buildServer({ name, scope: "project", wire, isTrusted }));
    }
  }

  // 4. Precedence project > local > user. For each name with multiple
  //    scopes, the most-specific wins; lower scopes are flagged.
  const scopeRank: Record<McpScope, number> = {
    project: 3,
    local: 2,
    user: 1,
  };
  const winnerByName = new Map<string, McpScope>();
  for (const s of all) {
    const cur = winnerByName.get(s.name);
    if (cur === undefined || scopeRank[s.scope] > scopeRank[cur]) {
      winnerByName.set(s.name, s.scope);
    }
  }
  for (const s of all) {
    const winner = winnerByName.get(s.name)!;
    if (winner !== s.scope) {
      s.isOverridden = true;
      s.overriddenBy = winner;
    }
  }

  return all;
}

/** Strip loader-only fields and call the Rust write command. */
export async function saveMcpServer(
  server: McpServer,
  opts: { cwd: string },
): Promise<void> {
  const { name, type, scope } = server;
  const cfg: ServerWire & { type: McpServerType } = { type };
  if (type === "stdio") {
    if (server.command !== undefined) cfg.command = server.command;
    if (server.args !== undefined) cfg.args = server.args;
  } else {
    if (server.url !== undefined) cfg.url = server.url;
    if (server.headers !== undefined) cfg.headers = server.headers;
  }
  cfg.env = server.env;
  await invoke("write_mcp_server", {
    scope,
    name,
    configJson: JSON.stringify(cfg),
    cwd: opts.cwd,
  });
}

export async function deleteMcpServer(
  scope: McpScope,
  name: string,
  opts: { cwd: string },
): Promise<void> {
  await invoke("remove_mcp_server", { scope, name, cwd: opts.cwd });
}
