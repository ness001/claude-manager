// Source-of-truth test for ~/.claude.json (the Claude Code primary user
// config — NOT settings.json). See docs/sources-of-truth/claude-json-config.yaml.
//
// Goals:
//   1. Load the sanitized fixture and assert every top-level key documented
//      in the YAML actually exists in real-world data.
//   2. For each `mcpServers` entry, assert it conforms to one of the three
//      transport schemas (stdio / sse / http), discriminated by `type`.
//   3. For each `projects.<path>` entry, assert it carries the trust map
//      arrays (`enabledMcpjsonServers`, `disabledMcpjsonServers`) and the
//      `mcpServers` map this app reads.
//   4. Bind the wire shape to `src/lib/mcp-types.ts` via `expectTypeOf` so
//      schema drift in either direction breaks the build.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  McpScope,
  McpServer,
  McpServerState,
  McpServerType,
} from "../../src/lib/mcp-types";

// ───────────────────────────────────────────────────────────────────────────
// Wire schema — mirrors what `src/lib/mcp-loader.ts` parses out of
// `~/.claude.json`. Kept private to this test file so a drift between the
// loader's expectations and the documented schema fails here.
// ───────────────────────────────────────────────────────────────────────────

interface ServerWireBase {
  env?: Record<string, string>;
}

interface StdioServerWire extends ServerWireBase {
  type?: "stdio"; // optional → loader defaults to stdio
  command: string;
  args?: string[];
}

interface SseServerWire extends ServerWireBase {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
}

interface HttpServerWire extends ServerWireBase {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

type AnyServerWire = StdioServerWire | SseServerWire | HttpServerWire;

interface ProjectEntryWire {
  mcpServers?: Record<string, AnyServerWire>;
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  mcpContextUris?: string[];
  hasTrustDialogAccepted?: boolean;
  // …plus many CLI-owned fields we don't touch.
  [k: string]: unknown;
}

interface ClaudeJsonWire {
  mcpServers?: Record<string, AnyServerWire>;
  projects?: Record<string, ProjectEntryWire>;
  // …plus many CLI-owned top-level fields we don't touch.
  [k: string]: unknown;
}

// ───────────────────────────────────────────────────────────────────────────
// Top-level keys documented in claude-json-config.yaml. If the CLI ships
// a new key, add it here AND to the YAML's `untouched_keys` list.
// ───────────────────────────────────────────────────────────────────────────

const DOCUMENTED_TOP_LEVEL_KEYS = [
  // Claude Manager touches:
  "mcpServers",
  "projects",
  // CLI owns; we preserve verbatim:
  "autoUpdates",
  "autoUpdatesProtectedForNative",
  "btwUseCount",
  "cachedChromeExtensionInstalled",
  "cachedStatsigGates",
  "changelogLastFetched",
  "clientDataCache",
  "firstStartTime",
  "githubRepoPaths",
  "hasCompletedOnboarding",
  "hasSeenTasksHint",
  "hasUsedBackslashReturn",
  "ideHintShownCount",
  "installMethod",
  "lastPlanModeUse",
  "lastReleaseNotesSeen",
  "metricsStatusCache",
  "migrationVersion",
  "numStartups",
  "officialMarketplaceAutoInstallAttempted",
  "officialMarketplaceAutoInstalled",
  "opus45MigrationComplete",
  "opus47LaunchSeenCount",
  "opusProMigrationComplete",
  "promptQueueUseCount",
  "seenNotifications",
  "showSpinnerTree",
  "skillUsage",
  "sonnet1m45MigrationComplete",
  "sonnet45MigrationComplete",
  "thinkingMigrationComplete",
  "tipsHistory",
  "unpinOpus47LaunchEffort",
  "userID",
] as const;

const FIXTURE_PATH = join(
  __dirname,
  "fixtures",
  "claude-json-config.json",
);

function loadFixture(): ClaudeJsonWire {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  const parsed = JSON.parse(raw) as ClaudeJsonWire;
  return parsed;
}

// ───────────────────────────────────────────────────────────────────────────
// Discriminator: classify a wire entry exactly the way mcp-loader.ts does
// (default = stdio when `type` is missing). Returns the canonical
// `McpServerType` union from src/lib/mcp-types.ts.
// ───────────────────────────────────────────────────────────────────────────

function classifyTransport(entry: AnyServerWire): McpServerType {
  const t = (entry as { type?: string }).type;
  if (t === "sse" || t === "http") return t;
  return "stdio";
}

// Conformance check for one server wire entry against the transport's
// required/forbidden field set. Throws via expect() on first mismatch.
function assertServerConforms(name: string, entry: AnyServerWire): void {
  const transport = classifyTransport(entry);

  // `env` MAY be absent on disk; loader fills it with `{}`. When present,
  // it must be a plain object of string→string.
  if ("env" in entry && entry.env !== undefined) {
    expect(typeof entry.env, `${name}.env`).toBe("object");
    for (const [k, v] of Object.entries(entry.env)) {
      expect(typeof k, `${name}.env key`).toBe("string");
      expect(typeof v, `${name}.env[${k}]`).toBe("string");
    }
  }

  if (transport === "stdio") {
    const stdio = entry as StdioServerWire;
    expect(typeof stdio.command, `${name}.command (stdio)`).toBe("string");
    if (stdio.args !== undefined) {
      expect(Array.isArray(stdio.args), `${name}.args is array`).toBe(true);
      for (const a of stdio.args)
        expect(typeof a, `${name}.args item`).toBe("string");
    }
    // Forbidden for stdio:
    expect("url" in entry, `${name}.url forbidden for stdio`).toBe(false);
    expect("headers" in entry, `${name}.headers forbidden for stdio`).toBe(
      false,
    );
  } else {
    // sse | http — same shape, different `type` discriminator.
    const netLike = entry as SseServerWire | HttpServerWire;
    expect(netLike.type, `${name}.type`).toBe(transport);
    expect(typeof netLike.url, `${name}.url`).toBe("string");
    // url must look like a URL.
    expect(() => new URL(netLike.url), `${name}.url parses`).not.toThrow();
    if (netLike.headers !== undefined) {
      expect(typeof netLike.headers, `${name}.headers`).toBe("object");
      for (const [k, v] of Object.entries(netLike.headers)) {
        expect(typeof k, `${name}.headers key`).toBe("string");
        expect(typeof v, `${name}.headers[${k}]`).toBe("string");
      }
    }
    // Forbidden for sse/http:
    expect("command" in entry, `${name}.command forbidden for ${transport}`).toBe(
      false,
    );
    expect("args" in entry, `${name}.args forbidden for ${transport}`).toBe(
      false,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("source of truth: ~/.claude.json", () => {
  const data = loadFixture();

  describe("top-level shape", () => {
    it("contains every documented top-level key", () => {
      const present = new Set(Object.keys(data));
      const missing = DOCUMENTED_TOP_LEVEL_KEYS.filter((k) => !present.has(k));
      expect(missing, `missing documented keys: ${missing.join(", ")}`).toEqual(
        [],
      );
    });

    it("has an `mcpServers` object map", () => {
      expect(data.mcpServers).toBeDefined();
      expect(typeof data.mcpServers).toBe("object");
      expect(Array.isArray(data.mcpServers)).toBe(false);
    });

    it("has a `projects` object map", () => {
      expect(data.projects).toBeDefined();
      expect(typeof data.projects).toBe("object");
      expect(Array.isArray(data.projects)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // user-scope mcpServers
  // ─────────────────────────────────────────────────────────────────────────
  describe("user-scope mcpServers", () => {
    const mcp = data.mcpServers ?? {};
    const entries = Object.entries(mcp);

    it("has at least one entry to exercise the schema", () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    it("covers all three transports (stdio, sse, http)", () => {
      const transports = new Set(
        entries.map(([, e]) => classifyTransport(e)),
      );
      expect(transports.has("stdio")).toBe(true);
      expect(transports.has("sse")).toBe(true);
      expect(transports.has("http")).toBe(true);
    });

    it.each(Object.entries(data.mcpServers ?? {}))(
      "entry %s conforms to its transport schema",
      (name, entry) => {
        assertServerConforms(`user.${name}`, entry);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // projects map
  // ─────────────────────────────────────────────────────────────────────────
  describe("projects map", () => {
    const projects = Object.entries(data.projects ?? {});

    it("contains at least two project entries (fixture invariant)", () => {
      expect(projects.length).toBeGreaterThanOrEqual(2);
    });

    it.each(Object.entries(data.projects ?? {}))(
      "project %s carries trust-map arrays + mcpServers map",
      (path, entry) => {
        expect(typeof path).toBe("string");
        expect(path.length).toBeGreaterThan(0);

        // Trust arrays must be arrays of string (per claude-json-config.yaml).
        expect(
          Array.isArray(entry.enabledMcpjsonServers),
          `${path}.enabledMcpjsonServers is array`,
        ).toBe(true);
        for (const n of entry.enabledMcpjsonServers ?? [])
          expect(typeof n).toBe("string");

        expect(
          Array.isArray(entry.disabledMcpjsonServers),
          `${path}.disabledMcpjsonServers is array`,
        ).toBe(true);
        for (const n of entry.disabledMcpjsonServers ?? [])
          expect(typeof n).toBe("string");

        // local-scope mcpServers MAY be empty {}, but the key must exist
        // for the loader's `project.mcpServers ?? {}` to be safe to assume.
        expect(entry.mcpServers, `${path}.mcpServers`).toBeDefined();
        expect(typeof entry.mcpServers).toBe("object");
      },
    );

    it("local-scope entries each conform to a transport schema", () => {
      let checked = 0;
      for (const [path, entry] of Object.entries(data.projects ?? {})) {
        for (const [name, srv] of Object.entries(entry.mcpServers ?? {})) {
          assertServerConforms(`local[${path}].${name}`, srv);
          checked += 1;
        }
      }
      // The alpha project in the fixture has one local-scope server.
      expect(checked).toBeGreaterThanOrEqual(1);
    });

    it("at least one project lists enabled+disabled project-scope names (trust-map invariant)", () => {
      const enabledCount = projects.reduce(
        (n, [, p]) => n + (p.enabledMcpjsonServers?.length ?? 0),
        0,
      );
      const disabledCount = projects.reduce(
        (n, [, p]) => n + (p.disabledMcpjsonServers?.length ?? 0),
        0,
      );
      expect(enabledCount).toBeGreaterThan(0);
      expect(disabledCount).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Type-level binding to src/lib/mcp-types.ts
  // ─────────────────────────────────────────────────────────────────────────
  describe("type-level alignment with src/lib/mcp-types.ts", () => {
    it("McpServerType enumerates exactly the three documented transports", () => {
      expectTypeOf<McpServerType>().toEqualTypeOf<"stdio" | "sse" | "http">();
    });

    it("McpScope enumerates exactly the three documented scopes", () => {
      expectTypeOf<McpScope>().toEqualTypeOf<"user" | "local" | "project">();
    });

    it("McpServerState enumerates exactly the four documented states", () => {
      expectTypeOf<McpServerState>().toEqualTypeOf<
        "connected" | "disconnected" | "error" | "starting" | "checking"
      >();
    });

    it("McpServer mandatory fields match the documented shape", () => {
      // Picking exact-required fields catches accidental optional/required flips.
      expectTypeOf<McpServer>().toHaveProperty("name").toBeString();
      expectTypeOf<McpServer>().toHaveProperty("type").toEqualTypeOf<McpServerType>();
      expectTypeOf<McpServer>().toHaveProperty("scope").toEqualTypeOf<McpScope>();
      expectTypeOf<McpServer>().toHaveProperty("status").toEqualTypeOf<McpServerState>();
      expectTypeOf<McpServer>()
        .toHaveProperty("env")
        .toEqualTypeOf<Record<string, string>>();
      expectTypeOf<McpServer>().toHaveProperty("isOverridden").toBeBoolean();
    });

    it("a stdio fixture entry is assignable to an McpServer when projected", () => {
      // Synthesize an McpServer from the first stdio user-scope wire entry.
      const stdio = Object.entries(data.mcpServers ?? {})
        .map(([name, e]) => ({ name, e }))
        .find((x) => classifyTransport(x.e) === "stdio")!;
      const wire = stdio.e as StdioServerWire;
      const projected: McpServer = {
        name: stdio.name,
        type: "stdio",
        scope: "user",
        status: "checking",
        env: wire.env ?? {},
        command: wire.command,
        args: wire.args,
        isOverridden: false,
      };
      expectTypeOf(projected).toMatchTypeOf<McpServer>();
      expect(projected.type).toBe("stdio");
    });

    it("an http fixture entry is assignable to an McpServer when projected", () => {
      const http = Object.entries(data.mcpServers ?? {})
        .map(([name, e]) => ({ name, e }))
        .find((x) => classifyTransport(x.e) === "http")!;
      const wire = http.e as HttpServerWire;
      const projected: McpServer = {
        name: http.name,
        type: "http",
        scope: "user",
        status: "checking",
        env: wire.env ?? {},
        url: wire.url,
        headers: wire.headers,
        isOverridden: false,
      };
      expectTypeOf(projected).toMatchTypeOf<McpServer>();
      expect(projected.type).toBe("http");
    });
  });
});
