// MCP server data model — see spec §8.1 (config locations + scopes),
// §8.2 (server properties), §8.3 (server states).
//
// MCP server configurations live in `~/.claude.json` (NOT settings.json).
// Three scopes with precedence project > local > user; same name at
// multiple scopes → most specific wins, the shadowed entry is dimmed
// with an "Overridden by [scope]" badge.

/** Where the server is configured — see spec §8.1. */
export type McpScope = "user" | "local" | "project";

/** Transport type — see spec §8.2. */
export type McpServerType = "stdio" | "sse" | "http";

/** Runtime status — see spec §8.3. */
export type McpServerState =
  | "connected"
  | "disconnected"
  | "error"
  | "starting"
  | "checking";

/**
 * MCP server entry assembled from `~/.claude.json` (user/local) or
 * a `<project-root>/.mcp.json` file (project), plus optional runtime
 * status from `claude mcp list`.
 *
 * Field applicability:
 *   - `command` / `args` are stdio-only
 *   - `url` / `headers` are sse|http-only
 *   - `env` is always present (`{}` if empty) per spec §8.2
 *   - `tools` / `toolCount` are runtime-only and may be undefined
 *   - `isOverridden` is true when a more specific scope shadows this entry;
 *     `overriddenBy` names the winning scope.
 *   - `isTrusted` only applies to project-scope entries — derived from
 *     `enabledMcpjsonServers` / `disabledMcpjsonServers` arrays per spec §8.1.
 */
export interface McpServer {
  name: string;
  type: McpServerType;
  scope: McpScope;
  status: McpServerState;
  command?: string;
  args?: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  toolCount?: number;
  tools?: string[];
  isOverridden: boolean;
  overriddenBy?: McpScope;
  /** Only meaningful when `scope === "project"`; undefined elsewhere. */
  isTrusted?: boolean;
}
