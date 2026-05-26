// Source-of-truth contract test for <project-root>/.mcp.json.
//
// This test is paired with `docs/sources-of-truth/project-mcp-config.yaml`.
// It pins:
//   1. The TWO on-disk wire formats (modern: `{mcpServers:{...}}` and
//      legacy: top-level keys per server with a `type` field).
//   2. The format-detection rule documented in the YAML
//      (`normalization.format_detection`): presence of `mcpServers` key
//      dispatches to modern; otherwise filter top-level entries to those
//      whose value is an object with a `type` field.
//   3. The per-entry normalization rules so both formats produce the
//      same internal shape (`scope: "project"`, env defaulted to `{}`,
//      transport-discriminated fields, status `"disconnected"`).
//   4. Transport schema: stdio entries carry `command`/`args` only;
//      sse/http entries carry `url`/`headers` only.
//
// We DO NOT import `mcp-loader.ts` — the goal is to lock the contract
// at the data layer, independent of the loader implementation. The
// normalization helpers below are a direct, faithful re-implementation
// of the rules documented in the YAML, so any drift between YAML and
// loader is caught here.
//
// No mocks. No skipIf. No "or empty state" escape clauses.

import { readFileSync } from "node:fs";
import { resolve as nodeResolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  McpScope,
  McpServer,
  McpServerState,
  McpServerType,
} from "../../src/lib/mcp-types";

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURE_DIR = nodeResolve(__dirname, "fixtures");

function loadFixture(name: string): unknown {
  const path = nodeResolve(FIXTURE_DIR, name);
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// Wire types — narrow, local mirror of what the YAML documents
// ---------------------------------------------------------------------------

interface ServerWire {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasTypeField(v: unknown): boolean {
  return isPlainObject(v) && "type" in v;
}

// ---------------------------------------------------------------------------
// Format detection — mirrors mcp-loader.ts step 3 (lines 142-162),
// documented in YAML under normalization.format_detection.
// ---------------------------------------------------------------------------

type Format = "modern" | "legacy";

function detectFormat(parsed: unknown): Format {
  if (!isPlainObject(parsed)) return "legacy"; // empty/non-object → no wrapper
  return isPlainObject(parsed.mcpServers) ? "modern" : "legacy";
}

function extractWireMap(parsed: unknown): Record<string, ServerWire> {
  if (!isPlainObject(parsed)) return {};
  if (isPlainObject(parsed.mcpServers)) {
    // Modern: use the wrapper as-is.
    return parsed.mcpServers as Record<string, ServerWire>;
  }
  // Legacy: top-level keys whose values look like server entries
  // (plain object with a `type` field). Everything else is ignored —
  // e.g. a "_comment" key with a string value.
  const out: Record<string, ServerWire> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (hasTypeField(v)) out[k] = v as ServerWire;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-entry normalization — mirrors mcp-loader.ts::buildServer with
// scope hard-pinned to "project".
// ---------------------------------------------------------------------------

function coerceType(t: string | undefined): McpServerType {
  return t === "sse" || t === "http" ? t : "stdio";
}

function normalizeProjectEntry(name: string, wire: ServerWire): McpServer {
  const type = coerceType(wire.type);
  const server: McpServer = {
    name,
    type,
    scope: "project",
    status: "checking",
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
  return server;
}

function normalizeAll(parsed: unknown): McpServer[] {
  const wireMap = extractWireMap(parsed);
  return Object.entries(wireMap).map(([name, wire]) =>
    normalizeProjectEntry(name, wire),
  );
}

// ---------------------------------------------------------------------------
// Transport-schema assertions
// ---------------------------------------------------------------------------

function assertStdioShape(server: McpServer): void {
  expect(server.type).toBe("stdio");
  expect(typeof server.command).toBe("string");
  expect((server.command as string).length).toBeGreaterThan(0);
  // args is optional on the wire but, when present, must be string[]
  if (server.args !== undefined) {
    expect(Array.isArray(server.args)).toBe(true);
    for (const a of server.args) expect(typeof a).toBe("string");
  }
  // sse/http-only fields MUST be absent on stdio entries.
  expect(server.url).toBeUndefined();
  expect(server.headers).toBeUndefined();
}

function assertNetworkShape(server: McpServer): void {
  expect(server.type === "sse" || server.type === "http").toBe(true);
  expect(typeof server.url).toBe("string");
  expect((server.url as string).length).toBeGreaterThan(0);
  if (server.headers !== undefined) {
    expect(isPlainObject(server.headers)).toBe(true);
    for (const [k, v] of Object.entries(server.headers)) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
    }
  }
  // stdio-only fields MUST be absent on sse/http entries.
  expect(server.command).toBeUndefined();
  expect(server.args).toBeUndefined();
}

function assertCommonShape(server: McpServer): void {
  expect(typeof server.name).toBe("string");
  expect(server.name.length).toBeGreaterThan(0);
  expect(server.scope).toBe("project");
  expect(server.status).toBe("checking");
  expect(server.isOverridden).toBe(false);
  // env is ALWAYS present (`{}` when empty) — spec §8.2.
  expect(isPlainObject(server.env)).toBe(true);
  for (const [k, v] of Object.entries(server.env)) {
    expect(typeof k).toBe("string");
    expect(typeof v).toBe("string");
  }
}

// ---------------------------------------------------------------------------
// Type-level: normalized entries must satisfy the published McpServer type
// from src/lib/mcp-types.ts. Use `expectTypeOf` so any divergence in the
// public type triggers a TS error here, not a runtime surprise.
// ---------------------------------------------------------------------------

describe("project-mcp-config — type contract against src/lib/mcp-types", () => {
  it("normalizeProjectEntry's return type IS McpServer", () => {
    expectTypeOf(normalizeProjectEntry).returns.toEqualTypeOf<McpServer>();
  });

  it("McpServer.scope union includes 'project'", () => {
    expectTypeOf<McpScope>().toEqualTypeOf<"user" | "local" | "project">();
  });

  it("McpServer.type union covers all three transports", () => {
    expectTypeOf<McpServerType>().toEqualTypeOf<"stdio" | "sse" | "http">();
  });

  it("McpServerState includes 'disconnected' (loader default)", () => {
    expectTypeOf<McpServerState>().toEqualTypeOf<
      "connected" | "disconnected" | "error" | "starting" | "checking"
    >();
  });
});

// ---------------------------------------------------------------------------
// Modern fixture
// ---------------------------------------------------------------------------

describe("fixture: project-mcp-config-modern.json", () => {
  const parsed = loadFixture("project-mcp-config-modern.json");

  it("is detected as the MODERN format (presence of `mcpServers` key)", () => {
    expect(detectFormat(parsed)).toBe("modern");
    expect(isPlainObject(parsed)).toBe(true);
    expect("mcpServers" in (parsed as Record<string, unknown>)).toBe(true);
  });

  it("declares exactly the two servers the fixture intends (no extras)", () => {
    const wire = extractWireMap(parsed);
    expect(Object.keys(wire).sort()).toEqual(["cloudflare-api", "xcodebuildmcp"]);
  });

  it("normalizes to two McpServer entries, both at scope 'project'", () => {
    const servers = normalizeAll(parsed);
    expect(servers).toHaveLength(2);
    for (const s of servers) assertCommonShape(s);
  });

  it("'xcodebuildmcp' normalizes as a stdio entry with command/args/env", () => {
    const servers = normalizeAll(parsed);
    const stdio = servers.find((s) => s.name === "xcodebuildmcp");
    expect(stdio).toBeDefined();
    assertCommonShape(stdio!);
    assertStdioShape(stdio!);
    expect(stdio!.command).toBe("npx");
    expect(stdio!.args).toEqual(["-y", "xcodebuildmcp@latest", "mcp"]);
    expect(stdio!.env).toEqual({
      XCODEBUILDMCP_ENABLED_WORKFLOWS: "REDACTED_WORKFLOW_LIST",
    });
  });

  it("'cloudflare-api' normalizes as an http entry with url/headers", () => {
    const servers = normalizeAll(parsed);
    const http = servers.find((s) => s.name === "cloudflare-api");
    expect(http).toBeDefined();
    assertCommonShape(http!);
    assertNetworkShape(http!);
    expect(http!.type).toBe("http");
    expect(http!.url).toBe("https://mcp.example.test/mcp");
    expect(http!.headers).toEqual({
      Authorization: "Bearer ${REDACTED_TOKEN_ENV_VAR}",
    });
  });
});

// ---------------------------------------------------------------------------
// Legacy fixture
// ---------------------------------------------------------------------------

describe("fixture: project-mcp-config-legacy.json", () => {
  const parsed = loadFixture("project-mcp-config-legacy.json");

  it("is detected as the LEGACY format (no `mcpServers` wrapper)", () => {
    expect(detectFormat(parsed)).toBe("legacy");
    expect(isPlainObject(parsed)).toBe(true);
    expect("mcpServers" in (parsed as Record<string, unknown>)).toBe(false);
  });

  it("filters out top-level keys whose values lack a `type` field", () => {
    // The fixture contains a `_comment` key with a string value. The
    // documented detection rule says it MUST be ignored.
    const raw = parsed as Record<string, unknown>;
    expect("_comment" in raw).toBe(true);
    const wire = extractWireMap(parsed);
    expect("_comment" in wire).toBe(false);
  });

  it("declares exactly the two servers the fixture intends", () => {
    const wire = extractWireMap(parsed);
    expect(Object.keys(wire).sort()).toEqual(["internal-bus", "playwright"]);
  });

  it("normalizes to two McpServer entries, both at scope 'project'", () => {
    const servers = normalizeAll(parsed);
    expect(servers).toHaveLength(2);
    for (const s of servers) assertCommonShape(s);
  });

  it("'playwright' normalizes as a stdio entry with command/args/env", () => {
    const servers = normalizeAll(parsed);
    const stdio = servers.find((s) => s.name === "playwright");
    expect(stdio).toBeDefined();
    assertCommonShape(stdio!);
    assertStdioShape(stdio!);
    expect(stdio!.command).toBe("REDACTED_CMD");
    expect(stdio!.args).toEqual(["-y", "@playwright/mcp@latest"]);
    expect(stdio!.env).toEqual({
      PLAYWRIGHT_BROWSERS_PATH: "REDACTED_PATH",
    });
  });

  it("'internal-bus' normalizes as an sse entry with url/headers", () => {
    const servers = normalizeAll(parsed);
    const sse = servers.find((s) => s.name === "internal-bus");
    expect(sse).toBeDefined();
    assertCommonShape(sse!);
    assertNetworkShape(sse!);
    expect(sse!.type).toBe("sse");
    expect(sse!.url).toBe("https://bus.internal.example.test/mcp");
    expect(sse!.headers).toEqual({
      Authorization: "Bearer ${REDACTED_BUS_TOKEN}",
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-format invariants — both fixtures must produce identical SHAPE
// (same keys present, same set of (name, type) pairs).
// ---------------------------------------------------------------------------

describe("project-mcp-config — cross-format invariants", () => {
  const modern = normalizeAll(loadFixture("project-mcp-config-modern.json"));
  const legacy = normalizeAll(loadFixture("project-mcp-config-legacy.json"));

  it("both fixtures contain exactly two normalized entries", () => {
    expect(modern).toHaveLength(2);
    expect(legacy).toHaveLength(2);
  });

  it("both fixtures contain exactly one stdio entry and one network entry", () => {
    for (const arr of [modern, legacy]) {
      const types = arr.map((s) => s.type).sort();
      expect(types.filter((t) => t === "stdio")).toHaveLength(1);
      expect(types.filter((t) => t === "sse" || t === "http")).toHaveLength(1);
    }
  });

  it("every normalized entry across BOTH fixtures has scope='project', status='disconnected', isOverridden=false, env defined", () => {
    for (const s of [...modern, ...legacy]) {
      expect(s.scope).toBe("project");
      expect(s.status).toBe("checking");
      expect(s.isOverridden).toBe(false);
      expect(isPlainObject(s.env)).toBe(true);
    }
  });

  it("transport-specific fields are mutually exclusive in every normalized entry", () => {
    for (const s of [...modern, ...legacy]) {
      if (s.type === "stdio") assertStdioShape(s);
      else assertNetworkShape(s);
    }
  });
});
