import { describe, it, expectTypeOf } from "vitest";
import {
  SKIP_TYPES,
  type ActivityPeriod,
  type ConversationEntry,
  type JsonlContent,
  type JsonlMessage,
  type JsonlMessageType,
  type SessionState,
} from "../../src/lib/session-types";

describe("session-types", () => {
  // case 1: SessionState union accepts all four values via type-level assertion.
  it("case 1: SessionState union accepts alive | ended | orphaned | archived", () => {
    expectTypeOf<"alive">().toMatchTypeOf<SessionState>();
    expectTypeOf<"ended">().toMatchTypeOf<SessionState>();
    expectTypeOf<"orphaned">().toMatchTypeOf<SessionState>();
    expectTypeOf<"archived">().toMatchTypeOf<SessionState>();
    // Exhaustiveness: the union has exactly these four members.
    expectTypeOf<SessionState>().toEqualTypeOf<
      "alive" | "ended" | "orphaned" | "archived"
    >();
  });

  // case 2: JsonlMessage.content accepts both `string` and `JsonlContent[]`
  //         (compile-time assertion against fixture line shapes).
  it("case 2: JsonlMessage.content accepts string and JsonlContent[]", () => {
    // Real fixture: first user message often arrives as a plain string.
    const stringFixture: JsonlMessage = {
      type: "user",
      content: "hello, claude",
    };
    // Real fixture: assistant messages arrive as content blocks.
    const arrayFixture: JsonlMessage = {
      type: "assistant",
      content: [
        { type: "text", text: "hi there" },
        { type: "tool_use", id: "t1", name: "Bash", input: { cmd: "ls" } },
      ],
    };
    expectTypeOf(stringFixture.content).toEqualTypeOf<
      string | JsonlContent[] | undefined
    >();
    expectTypeOf(arrayFixture.content).toEqualTypeOf<
      string | JsonlContent[] | undefined
    >();
  });

  // case 3: SKIP_TYPES contains all 5 non-rendered types from spec §5.8 / §11.
  it("case 3: SKIP_TYPES contains the 5 non-rendered JSONL types", () => {
    const expected: ReadonlyArray<JsonlMessageType> = [
      "permission-mode",
      "file-history-snapshot",
      "attachment",
      "queue-operation",
      "last-prompt",
    ];
    expectTypeOf(SKIP_TYPES).toEqualTypeOf<ReadonlySet<JsonlMessageType>>();
    if (SKIP_TYPES.size !== 5) {
      throw new Error(`SKIP_TYPES.size === ${SKIP_TYPES.size}, expected 5`);
    }
    for (const t of expected) {
      if (!SKIP_TYPES.has(t)) throw new Error(`SKIP_TYPES missing "${t}"`);
    }
  });

  // case 4: ConversationEntry discriminated union exhaustiveness —
  //         `switch(kind)` with no default still type-checks.
  it("case 4: ConversationEntry switch(kind) is exhaustive without default", () => {
    function render(entry: ConversationEntry): string {
      switch (entry.kind) {
        case "user":
          return entry.text;
        case "assistant":
          return entry.text;
        case "tool-call":
          return entry.toolName;
        case "system-divider":
          return entry.text;
        case "summary":
          return entry.text;
      }
      // No `default`. If this function returns `string` (not `string | undefined`),
      // exhaustiveness is proven by the type system.
    }
    expectTypeOf(render).returns.toEqualTypeOf<string>();
  });

  // Extra invariant from CLAUDE.md "Executing a plan task" rule + plan task spec:
  // ActivityPeriod literals are lowercase.
  it("ActivityPeriod literals are lowercase", () => {
    expectTypeOf<ActivityPeriod>().toEqualTypeOf<
      "7d" | "30d" | "90d" | "all"
    >();
  });
});
