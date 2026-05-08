import { describe, it, expectTypeOf } from "vitest";
import type { PluginState } from "../../src/lib/plugin-types";
import { PLUGIN_TYPES_COMPILE_OK } from "./plugin-types.compile";

describe("plugin-types", () => {
  // case 1: type-only file — exported type names compile via the
  // adjacent `plugin-types.compile.ts` snippet.
  it("case 1: exported type names compile (via plugin-types.compile.ts)", () => {
    expectTypeOf(PLUGIN_TYPES_COMPILE_OK).toEqualTypeOf<true>();
    if (PLUGIN_TYPES_COMPILE_OK !== true) {
      throw new Error("plugin-types compile snippet did not load");
    }
  });

  // case 2: PluginState union accepts all five literals; rejects an
  // unknown literal under `// @ts-expect-error`.
  it("case 2: PluginState union accepts the 5 documented literals", () => {
    expectTypeOf<"active">().toMatchTypeOf<PluginState>();
    expectTypeOf<"disabled">().toMatchTypeOf<PluginState>();
    expectTypeOf<"broken">().toMatchTypeOf<PluginState>();
    expectTypeOf<"orphaned">().toMatchTypeOf<PluginState>();
    expectTypeOf<"update-available">().toMatchTypeOf<PluginState>();
    expectTypeOf<PluginState>().toEqualTypeOf<
      "active" | "disabled" | "broken" | "orphaned" | "update-available"
    >();
    // @ts-expect-error — "unknown" is not a member of the PluginState union.
    const _bad: PluginState = "unknown";
    void _bad;
  });
});
