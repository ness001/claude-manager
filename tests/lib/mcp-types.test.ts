// Type-level tests for mcp-types — see plan T3.8.
// We use vitest's expectTypeOf for compile-time assertions.

import { describe, it, expectTypeOf } from "vitest";
import type {
  McpScope,
  McpServer,
  McpServerState,
  McpServerType,
} from "../../src/lib/mcp-types";
import { MCP_TYPES_COMPILE_OK } from "./mcp-types.compile";

describe("mcp-types", () => {
  it("exported type names compile (via mcp-types.compile.ts)", () => {
    expectTypeOf(MCP_TYPES_COMPILE_OK).toEqualTypeOf<true>();
  });

  it("case 1: McpScope / McpServerType / McpServerState unions accept exactly the documented literals", () => {
    expectTypeOf<McpScope>().toEqualTypeOf<"user" | "local" | "project">();
    expectTypeOf<McpServerType>().toEqualTypeOf<"stdio" | "sse" | "http">();
    expectTypeOf<McpServerState>().toEqualTypeOf<
      "connected" | "disconnected" | "error" | "starting"
    >();

    // @ts-expect-error — "global" is not in the McpScope union.
    const _badScope: McpScope = "global";
    void _badScope;
    // @ts-expect-error — "websocket" is not in the McpServerType union.
    const _badType: McpServerType = "websocket";
    void _badType;
    // @ts-expect-error — "ready" is not in the McpServerState union.
    const _badState: McpServerState = "ready";
    void _badState;
  });

  it("case 2: McpServer permits isTrusted on project-scope construction (and treats it as boolean | undefined)", () => {
    // Project-scope: isTrusted may be true, false, or omitted.
    const projectTrue: McpServer = {
      name: "p",
      type: "stdio",
      scope: "project",
      status: "connected",
      command: "x",
      args: [],
      env: {},
      isOverridden: false,
      isTrusted: true,
    };
    const projectFalse: McpServer = { ...projectTrue, isTrusted: false };
    const projectOmitted: McpServer = {
      name: "p",
      type: "stdio",
      scope: "project",
      status: "connected",
      command: "x",
      args: [],
      env: {},
      isOverridden: false,
    };
    void projectTrue;
    void projectFalse;
    void projectOmitted;

    // The field type is exactly `boolean | undefined` (i.e. optional boolean).
    expectTypeOf<McpServer["isTrusted"]>().toEqualTypeOf<boolean | undefined>();

    // @ts-expect-error — non-boolean values are rejected.
    const bad: McpServer = { ...projectTrue, isTrusted: "yes" };
    void bad;
  });
});
