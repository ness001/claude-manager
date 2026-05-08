// Fixture servers covering all four states, all three types, and a
// shadowed pair. Used by component tests in tests/components/mcp/ to
// exercise card variants without going through the loader.

import type { McpServer } from "../../../src/lib/mcp-types";

export const FIX_CONNECTED: McpServer = {
  name: "fs-connected",
  type: "stdio",
  scope: "user",
  status: "connected",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
  env: { TOKEN: "secret-value" },
  isOverridden: false,
};

export const FIX_DISCONNECTED: McpServer = {
  name: "fs-disconnected",
  type: "stdio",
  scope: "user",
  status: "disconnected",
  command: "npx",
  args: [],
  env: {},
  isOverridden: false,
};

export const FIX_ERROR: McpServer = {
  name: "fs-error",
  type: "stdio",
  scope: "local",
  status: "error",
  command: "broken-cmd",
  args: [],
  env: {},
  isOverridden: false,
};

export const FIX_STARTING: McpServer = {
  name: "fs-starting",
  type: "stdio",
  scope: "local",
  status: "starting",
  command: "slow-cmd",
  args: [],
  env: {},
  isOverridden: false,
};

export const FIX_HTTP: McpServer = {
  name: "remote-http",
  type: "http",
  scope: "project",
  status: "connected",
  url: "https://api.example.com/mcp",
  headers: { Authorization: "Bearer ${API_TOKEN}" },
  env: {},
  isOverridden: false,
  isTrusted: true,
};

export const FIX_SSE: McpServer = {
  name: "remote-sse",
  type: "sse",
  scope: "project",
  status: "disconnected",
  url: "https://sse.example.com/stream",
  headers: {},
  env: {},
  isOverridden: false,
};

// Shadowed pair: same name, project wins, user is overridden.
export const FIX_SHADOWED_USER: McpServer = {
  name: "shared",
  type: "stdio",
  scope: "user",
  status: "disconnected",
  command: "user-cmd",
  args: [],
  env: {},
  isOverridden: true,
  overriddenBy: "project",
};

export const FIX_SHADOWED_WINNER: McpServer = {
  name: "shared",
  type: "stdio",
  scope: "project",
  status: "connected",
  command: "project-cmd",
  args: ["--project"],
  env: {},
  isOverridden: false,
};

export const ALL_FIXTURES: McpServer[] = [
  FIX_CONNECTED,
  FIX_DISCONNECTED,
  FIX_ERROR,
  FIX_STARTING,
  FIX_HTTP,
  FIX_SSE,
  FIX_SHADOWED_USER,
  FIX_SHADOWED_WINNER,
];
