// Source-of-Truth contract test for ~/.claude/projects/{cwd}/{sessionId}.jsonl
//
// Investigator: inv-session-jsonl (task #1)
//
// Loads the sanitized fixture, splits on newlines, parses every line, and
// asserts the contract documented in docs/sources-of-truth/session-jsonl-files.yaml:
//   - every `type` value is one of the documented set
//   - every documented type appears at least once in the fixture
//   - per-type required fields are present
//   - `permission-mode` entries' `mode` is in the documented enum
//   - the TS types in src/lib/session-types.ts still describe what we read
//
// No mocks, no skipIf, no escape clauses — the fixture is the unit under test.

import { describe, expect, expectTypeOf, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  SKIP_TYPES,
  type JsonlContent,
  type JsonlMessage,
  type JsonlMessageType,
  type PermissionMode,
} from "../../src/lib/session-types";

// ---------------------------------------------------------------------------
// Documented universe — must stay in lockstep with the YAML.
// ---------------------------------------------------------------------------

/** Every top-level `type` value documented in session-jsonl-files.yaml. */
const DOCUMENTED_TYPES = [
  "user",
  "assistant",
  "system",
  "permission-mode",
  "file-history-snapshot",
  "attachment",
  "queue-operation",
  "last-prompt",
  "custom-title",
  "ai-title",
  "agent-name",
  "pr-link",
] as const;
type DocumentedType = (typeof DOCUMENTED_TYPES)[number];

/** Every `system.subtype` value documented in session-jsonl-files.yaml. */
const DOCUMENTED_SYSTEM_SUBTYPES = [
  "turn_duration",
  "compact_boundary",
  "stop_hook_summary",
  "local_command",
  "informational",
] as const;

/** Full 6-value enum per DESIGN-CONTEXT §2.7 / spec §10. */
const DOCUMENTED_PERMISSION_MODES = [
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "default",
  "dontAsk",
  "plan",
] as const;

const FIXTURE_PATH = path.join(
  __dirname,
  "fixtures",
  "session-jsonl-files.jsonl",
);

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadFixture(): JsonlMessage[] {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as JsonlMessage);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sources-of-truth: ~/.claude/projects/{cwd}/{sessionId}.jsonl", () => {
  const lines = loadFixture();

  it("loaded a non-trivial fixture", () => {
    // YAML claims 18 lines covering 12 top-level types.
    expect(lines.length).toBe(18);
  });

  it("every line has a `type` field that is one of the documented values", () => {
    for (const line of lines) {
      expect(typeof line.type).toBe("string");
      expect(DOCUMENTED_TYPES).toContain(line.type as DocumentedType);
    }
  });

  it("every documented type appears at least once in the fixture", () => {
    const observed = new Set(lines.map((l) => l.type as string));
    for (const t of DOCUMENTED_TYPES) {
      expect(
        observed.has(t),
        `fixture missing coverage for type="${t}"`,
      ).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Per-type required-field assertions
  // -----------------------------------------------------------------------

  describe("required fields per documented type", () => {
    const byType = new Map<string, JsonlMessage[]>();
    for (const l of lines) {
      const arr = byType.get(l.type as string) ?? [];
      arr.push(l);
      byType.set(l.type as string, arr);
    }

    it("user: uuid, sessionId, timestamp, message.{role,content}", () => {
      for (const l of byType.get("user")!) {
        const m = l as JsonlMessage & {
          uuid: string;
          sessionId: string;
          timestamp: string;
          message: { role: string; content: unknown };
          parentUuid: string | null;
          isSidechain: boolean;
        };
        expect(m.uuid).toMatch(UUID);
        expect(m.sessionId).toMatch(UUID);
        expect(m.timestamp).toMatch(ISO_INSTANT);
        expect(m.message).toBeDefined();
        expect(m.message.role).toBe("user");
        expect(m.message.content).toBeDefined();
        expect(typeof m.isSidechain).toBe("boolean");
        // parentUuid must be present (string or null)
        expect("parentUuid" in m).toBe(true);
        // content is string OR array
        const c = m.message.content;
        const ok =
          typeof c === "string" || (Array.isArray(c) && c.length > 0);
        expect(ok).toBe(true);
      }
    });

    it("assistant: uuid, sessionId, timestamp, message.{id,role,model,content:array}", () => {
      for (const l of byType.get("assistant")!) {
        const m = l as JsonlMessage & {
          uuid: string;
          sessionId: string;
          timestamp: string;
          message: {
            id: string;
            role: string;
            model: string;
            content: JsonlContent[];
          };
        };
        expect(m.uuid).toMatch(UUID);
        expect(m.sessionId).toMatch(UUID);
        expect(m.timestamp).toMatch(ISO_INSTANT);
        expect(m.message).toBeDefined();
        expect(typeof m.message.id).toBe("string");
        expect(m.message.id.length).toBeGreaterThan(0);
        expect(m.message.role).toBe("assistant");
        expect(typeof m.message.model).toBe("string");
        expect(m.message.model.length).toBeGreaterThan(0);
        expect(Array.isArray(m.message.content)).toBe(true);
        expect(m.message.content.length).toBeGreaterThan(0);
        // Every block has a `type`.
        for (const block of m.message.content) {
          expect(["text", "tool_use", "tool_result"]).toContain(
            (block as { type: string }).type,
          );
        }
      }
    });

    it("system: subtype is one of the documented values + invariants", () => {
      for (const l of byType.get("system")!) {
        const s = l as JsonlMessage & {
          subtype: string;
          uuid: string;
          timestamp: string;
          sessionId: string;
        };
        expect(DOCUMENTED_SYSTEM_SUBTYPES).toContain(
          s.subtype as (typeof DOCUMENTED_SYSTEM_SUBTYPES)[number],
        );
        expect(s.uuid).toMatch(UUID);
        expect(s.timestamp).toMatch(ISO_INSTANT);
        expect(s.sessionId).toMatch(UUID);
        if (s.subtype === "turn_duration") {
          expect(typeof (s as { durationMs: number }).durationMs).toBe(
            "number",
          );
          expect(typeof (s as { messageCount: number }).messageCount).toBe(
            "number",
          );
        }
        if (s.subtype === "compact_boundary") {
          expect(
            (s as { compactMetadata: { trigger: string; preTokens: number } })
              .compactMetadata,
          ).toBeDefined();
        }
        if (s.subtype === "stop_hook_summary") {
          expect(
            Array.isArray((s as { hookInfos: unknown[] }).hookInfos),
          ).toBe(true);
          expect(
            typeof (s as { preventedContinuation: boolean })
              .preventedContinuation,
          ).toBe("boolean");
        }
      }
    });

    it("permission-mode: type + permissionMode + sessionId only", () => {
      for (const l of byType.get("permission-mode")!) {
        const p = l as JsonlMessage & {
          permissionMode: string;
          sessionId: string;
        };
        expect(typeof p.permissionMode).toBe("string");
        expect(p.sessionId).toMatch(UUID);
      }
    });

    it("file-history-snapshot: messageId + snapshot.{messageId,trackedFileBackups,timestamp}", () => {
      for (const l of byType.get("file-history-snapshot")!) {
        const f = l as JsonlMessage & {
          messageId: string;
          snapshot: {
            messageId: string;
            trackedFileBackups: Record<string, unknown>;
            timestamp: string;
          };
          isSnapshotUpdate: boolean;
        };
        expect(f.messageId).toMatch(UUID);
        expect(f.snapshot).toBeDefined();
        expect(f.snapshot.messageId).toBe(f.messageId);
        expect(typeof f.snapshot.trackedFileBackups).toBe("object");
        expect(f.snapshot.timestamp).toMatch(ISO_INSTANT);
        expect(typeof f.isSnapshotUpdate).toBe("boolean");
      }
    });

    it("attachment: uuid + sessionId + timestamp + attachment.type", () => {
      for (const l of byType.get("attachment")!) {
        const a = l as JsonlMessage & {
          uuid: string;
          sessionId: string;
          timestamp: string;
          attachment: { type: string };
        };
        expect(a.uuid).toMatch(UUID);
        expect(a.sessionId).toMatch(UUID);
        expect(a.timestamp).toMatch(ISO_INSTANT);
        expect(a.attachment).toBeDefined();
        expect(typeof a.attachment.type).toBe("string");
        expect(a.attachment.type.length).toBeGreaterThan(0);
      }
    });

    it("queue-operation: operation + sessionId + timestamp", () => {
      for (const l of byType.get("queue-operation")!) {
        const q = l as JsonlMessage & {
          operation: string;
          sessionId: string;
          timestamp: string;
        };
        expect(typeof q.operation).toBe("string");
        expect(q.sessionId).toMatch(UUID);
        expect(q.timestamp).toMatch(ISO_INSTANT);
      }
    });

    it("last-prompt: sessionId + (leafUuid OR lastPrompt)", () => {
      for (const l of byType.get("last-prompt")!) {
        const p = l as JsonlMessage & {
          sessionId: string;
          leafUuid?: string;
          lastPrompt?: string;
        };
        expect(p.sessionId).toMatch(UUID);
        const hasAnchor =
          typeof p.leafUuid === "string" || typeof p.lastPrompt === "string";
        expect(hasAnchor).toBe(true);
      }
    });

    it("custom-title / ai-title / agent-name: sessionId + the title field", () => {
      for (const l of byType.get("custom-title")!) {
        expect(typeof (l as { customTitle: string }).customTitle).toBe(
          "string",
        );
        expect((l as { sessionId: string }).sessionId).toMatch(UUID);
      }
      for (const l of byType.get("ai-title")!) {
        expect(typeof (l as { aiTitle: string }).aiTitle).toBe("string");
        expect((l as { sessionId: string }).sessionId).toMatch(UUID);
      }
      for (const l of byType.get("agent-name")!) {
        expect(typeof (l as { agentName: string }).agentName).toBe("string");
        expect((l as { sessionId: string }).sessionId).toMatch(UUID);
      }
    });

    it("pr-link: sessionId + prNumber + prUrl + prRepository + timestamp", () => {
      for (const l of byType.get("pr-link")!) {
        const p = l as JsonlMessage & {
          sessionId: string;
          prNumber: number;
          prUrl: string;
          prRepository: string;
          timestamp: string;
        };
        expect(p.sessionId).toMatch(UUID);
        expect(typeof p.prNumber).toBe("number");
        expect(p.prUrl).toMatch(/^https?:\/\//);
        expect(typeof p.prRepository).toBe("string");
        expect(p.timestamp).toMatch(ISO_INSTANT);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Enum coverage
  // -----------------------------------------------------------------------

  describe("enums", () => {
    it("every permission-mode entry's `permissionMode` is in the 6-value enum", () => {
      const pms = lines.filter((l) => l.type === "permission-mode");
      expect(pms.length).toBeGreaterThan(0);
      for (const p of pms) {
        const mode = (p as { permissionMode: string }).permissionMode;
        expect(DOCUMENTED_PERMISSION_MODES).toContain(
          mode as (typeof DOCUMENTED_PERMISSION_MODES)[number],
        );
      }
    });

    it("every system.subtype is in the documented set", () => {
      const sys = lines.filter((l) => l.type === "system");
      expect(sys.length).toBeGreaterThanOrEqual(
        DOCUMENTED_SYSTEM_SUBTYPES.length,
      );
      const observed = new Set(
        sys.map((s) => (s as { subtype: string }).subtype),
      );
      for (const sub of DOCUMENTED_SYSTEM_SUBTYPES) {
        expect(
          observed.has(sub),
          `fixture missing system subtype "${sub}"`,
        ).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Cross-reference: tool_use ↔ tool_result pairing on `tool_use_id`
  // -----------------------------------------------------------------------

  it("every tool_result.tool_use_id has a matching assistant tool_use.id", () => {
    const toolUseIds = new Set<string>();
    const toolResultIds = new Set<string>();
    for (const l of lines) {
      if (l.type === "assistant") {
        const content = (
          l as { message: { content: JsonlContent[] } }
        ).message.content;
        for (const b of content) {
          if (b.type === "tool_use") toolUseIds.add(b.id);
        }
      }
      if (l.type === "user") {
        const content = (l as { message: { content: unknown } }).message
          .content;
        if (Array.isArray(content)) {
          for (const b of content as JsonlContent[]) {
            if (b.type === "tool_result") toolResultIds.add(b.tool_use_id);
          }
        }
      }
    }
    expect(toolUseIds.size).toBeGreaterThan(0);
    expect(toolResultIds.size).toBeGreaterThan(0);
    for (const trId of toolResultIds) {
      expect(toolUseIds.has(trId), `unmatched tool_result.tool_use_id ${trId}`)
        .toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Sanity: SKIP_TYPES set in source still matches what we don't render
  // -----------------------------------------------------------------------

  it("SKIP_TYPES exported from session-types covers all non-rendered legacy types", () => {
    // Spec §5.8 explicit non-rendered types that ARE narrowed by the TS type:
    const expectedSkip: JsonlMessageType[] = [
      "permission-mode",
      "file-history-snapshot",
      "attachment",
      "queue-operation",
      "last-prompt",
    ];
    for (const t of expectedSkip) {
      expect(SKIP_TYPES.has(t)).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Type-level assertions against src/lib/session-types.ts
  // -----------------------------------------------------------------------

  describe("type-level: src/lib/session-types.ts contract", () => {
    it("PermissionMode is the narrowed 4-member subset of the on-disk enum", () => {
      expectTypeOf<PermissionMode>().toEqualTypeOf<
        "default" | "acceptEdits" | "bypassPermissions" | "plan"
      >();
    });

    it("JsonlMessage.type narrows to the documented union", () => {
      expectTypeOf<JsonlMessage["type"]>().toEqualTypeOf<JsonlMessageType>();
      // Sanity: at least one of our documented runtime types is a member.
      expectTypeOf<"user">().toMatchTypeOf<JsonlMessageType>();
      expectTypeOf<"system">().toMatchTypeOf<JsonlMessageType>();
    });

    it("JsonlContent is the 3-variant block union", () => {
      type Variants = JsonlContent["type"];
      expectTypeOf<Variants>().toEqualTypeOf<
        "text" | "tool_use" | "tool_result"
      >();
    });
  });
});
