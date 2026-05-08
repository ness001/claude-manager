// Compile-time smoke for mcp-types — referenced by mcp-types.test.ts.
// Importing this module is enough to assert that the type names resolve.

import type {
  McpScope,
  McpServer,
  McpServerState,
  McpServerType,
} from "../../src/lib/mcp-types";

const _scope: McpScope = "user";
const _type: McpServerType = "stdio";
const _state: McpServerState = "connected";

// User-scope stdio server (most common shape).
const _userStdio: McpServer = {
  name: "fs",
  type: _type,
  scope: _scope,
  status: _state,
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  env: {},
  isOverridden: false,
};

// Project-scope http server with trust flag set.
const _projectHttp: McpServer = {
  name: "remote",
  type: "http",
  scope: "project",
  status: "disconnected",
  url: "https://example.com/mcp",
  headers: { Authorization: "Bearer ${TOKEN}" },
  env: {},
  isOverridden: false,
  isTrusted: true,
};

// Shadowed local-scope entry pointing at the winning project scope.
const _shadowed: McpServer = {
  name: "fs",
  type: "stdio",
  scope: "local",
  status: "disconnected",
  command: "npx",
  args: [],
  env: {},
  isOverridden: true,
  overriddenBy: "project",
};

void _userStdio;
void _projectHttp;
void _shadowed;

export const MCP_TYPES_COMPILE_OK = true as const;
