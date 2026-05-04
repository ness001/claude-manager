import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  jsonlToConversationEntries,
  parseJsonlLine,
  parseJsonlMetadata,
} from "../../src/lib/jsonl-parser";

const fixtureDir = resolve(__dirname, "../fixtures/jsonl-parser");
const readFixture = (name: string): string[] =>
  readFileSync(resolve(fixtureDir, name), "utf8")
    .split(/\r?\n/)
    // mirror real-world: keep all lines incl. trailing blank or truncated
    .filter((l) => l.length > 0 || true)
    // …but for parsing convenience drop empty ones explicitly
    .filter((l) => l.length > 0);

// Plain-string user content (DESIGN-CONTEXT §2 / spec §11) — first user
// message often arrives as a bare string, not a content array.
const userStringLine = JSON.stringify({
  type: "user",
  message: { role: "user", content: "hello, claude" },
  sessionId: "s1",
  version: "2.1.98",
});

// User tool_result line (array content). is_error: true → red border path.
const userToolResultErrLine = JSON.stringify({
  type: "user",
  message: {
    role: "user",
    content: [
      {
        tool_use_id: "toolu_1",
        type: "tool_result",
        content: "boom",
        is_error: true,
      },
    ],
  },
});

const assistantTextLine = JSON.stringify({
  type: "assistant",
  message: {
    role: "assistant",
    model: "claude-opus-4.6",
    content: [{ type: "text", text: "Hi there!" }],
  },
});

const assistantToolUseLine = JSON.stringify({
  type: "assistant",
  message: {
    role: "assistant",
    model: "claude-opus-4.6",
    content: [
      { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
    ],
  },
});

const turnDurationLine = JSON.stringify({
  type: "system",
  subtype: "turn_duration",
  durationMs: 1234,
});

const compactBoundaryLine = JSON.stringify({
  type: "system",
  subtype: "compact_boundary",
});

const summaryLine = JSON.stringify({
  type: "summary",
  summary: "User asked Claude to list files.",
});

describe("jsonl-parser", () => {
  // case 1 — user message with content as plain string
  it("case 1: user with string content → user entry with text", () => {
    const e = parseJsonlLine(userStringLine);
    expect(e).toEqual({ kind: "user", text: "hello, claude" });
  });

  // case 2 — user tool_result with is_error: true → tool-call entry, isError true
  it("case 2: user tool_result with is_error → tool-call entry isError true", () => {
    const e = parseJsonlLine(userToolResultErrLine);
    expect(e?.kind).toBe("tool-call");
    if (e?.kind === "tool-call") {
      expect(e.isError).toBe(true);
      expect(e.toolOutput).toContain("boom");
    }
  });

  // case 3 — assistant text → text + model
  it("case 3: assistant text array → assistant entry with text + model", () => {
    const e = parseJsonlLine(assistantTextLine);
    expect(e).toEqual({
      kind: "assistant",
      text: "Hi there!",
      model: "claude-opus-4.6",
    });
  });

  // case 4 — assistant tool_use → toolName + toolInput
  it("case 4: assistant tool_use → tool-call entry with toolName + toolInput", () => {
    const e = parseJsonlLine(assistantToolUseLine);
    expect(e?.kind).toBe("tool-call");
    if (e?.kind === "tool-call") {
      expect(e.toolName).toBe("Bash");
      expect(e.toolInput).toEqual({ command: "ls" });
    }
  });

  // case 5 — every SKIP_TYPES line → null
  it("case 5: each SKIP_TYPES line returns null", () => {
    const skipped = [
      "permission-mode",
      "file-history-snapshot",
      "attachment",
      "queue-operation",
      "last-prompt",
    ];
    for (const t of skipped) {
      const line = JSON.stringify({ type: t, anything: 1 });
      expect(parseJsonlLine(line)).toBeNull();
    }
  });

  // case 6 — malformed JSON returns null and does NOT throw
  it("case 6: malformed JSON line returns null without throwing", () => {
    expect(() => parseJsonlLine("{not json at all")).not.toThrow();
    expect(parseJsonlLine("{not json at all")).toBeNull();
  });

  // case 7 — truncated final line returns null without throwing
  it("case 7: truncated final line (no trailing newline) returns null without throwing", () => {
    const raw = readFileSync(resolve(fixtureDir, "truncated.jsonl"), "utf8");
    // Final line has no trailing newline.
    expect(raw.endsWith("\n")).toBe(false);
    const lines = raw.split(/\r?\n/);
    const last = lines[lines.length - 1];
    expect(last.length).toBeGreaterThan(0);
    expect(() => parseJsonlLine(last)).not.toThrow();
    expect(parseJsonlLine(last)).toBeNull();
  });

  // case 8 — parseJsonlMetadata extracts metadata from first 10 lines
  it("case 8: parseJsonlMetadata extracts firstPrompt, model, version, permissionMode, gitBranch, slug, isSidechain", () => {
    const lines = readFixture("normal.jsonl");
    const meta = parseJsonlMetadata(lines);
    expect(meta.firstPrompt).toBe("hello, claude");
    expect(meta.model).toBe("claude-opus-4.6");
    expect(meta.version).toBe("2.1.98");
    expect(meta.permissionMode).toBe("default");
    expect(meta.gitBranch).toBe("main");
    expect(meta.slug).toBe("chat-with-claude");
    expect(meta.isSidechain).toBe(false);
  });

  it("case 8b: version may be 12-char SHA", () => {
    const lines = readFixture("version-sha.jsonl");
    const meta = parseJsonlMetadata(lines);
    expect(meta.version).toBe("abc123def456");
    expect(meta.version!.length).toBe(12);
  });

  // case 9 — session with no slug → undefined (not present in 11/20 sessions)
  it("case 9: parseJsonlMetadata returns slug: undefined when absent", () => {
    const lines = readFixture("no-slug.jsonl");
    const meta = parseJsonlMetadata(lines);
    expect(meta.slug).toBeUndefined();
    // Other fields still extracted.
    expect(meta.firstPrompt).toBe("hi");
    expect(meta.model).toBe("claude-opus-4.6");
  });

  // case 10 — turn-number assignment increments on system/turn_duration
  it("case 10: jsonlToConversationEntries assigns sequential turn numbers on system/turn_duration", () => {
    const lines = [
      userStringLine,
      assistantTextLine,
      turnDurationLine,
      userStringLine,
      assistantTextLine,
      turnDurationLine,
    ];
    const entries = jsonlToConversationEntries(lines);
    // Expect 6 entries — 2 user, 2 assistant, 2 system-divider.
    expect(entries.map((e) => e.kind)).toEqual([
      "user",
      "assistant",
      "system-divider",
      "user",
      "assistant",
      "system-divider",
    ]);
    // Turn numbers: messages before the first divider are turn 1; after first
    // divider, turn 2; after second, turn 3 (no further messages but consistent).
    const userEntries = entries.filter((e) => e.kind === "user");
    const assistantEntries = entries.filter((e) => e.kind === "assistant");
    expect(userEntries[0].turnNumber).toBe(1);
    expect(assistantEntries[0].turnNumber).toBe(1);
    expect(userEntries[1].turnNumber).toBe(2);
    expect(assistantEntries[1].turnNumber).toBe(2);
  });

  // case 11 — noisy session w/ progress lines → only renderable entries kept
  it("case 11: noisy progress lines are skipped — count matches user+assistant only", () => {
    const lines = readFixture("noisy-progress.jsonl");
    const entries = jsonlToConversationEntries(lines);
    // Fixture: 1 user + 1 assistant + 8 progress.
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.kind).sort()).toEqual(["assistant", "user"]);
  });

  // System dividers — verify both subtypes round-trip
  it("system turn_duration → system-divider with Turn N — Xms label", () => {
    const e = parseJsonlLine(turnDurationLine);
    expect(e?.kind).toBe("system-divider");
    if (e?.kind === "system-divider") {
      expect(e.text).toMatch(/1234/);
    }
  });

  it("system compact_boundary → system-divider with Context compacted label", () => {
    const e = parseJsonlLine(compactBoundaryLine);
    expect(e?.kind).toBe("system-divider");
    if (e?.kind === "system-divider") {
      expect(e.text.toLowerCase()).toContain("compact");
    }
  });

  it("summary line → summary entry", () => {
    const e = parseJsonlLine(summaryLine);
    expect(e).toEqual({
      kind: "summary",
      text: "User asked Claude to list files.",
    });
  });

  // Perf budget — parsing 5MB JSONL (~5000 lines) under 200ms.
  it("perf: parsing 5000 synthesized lines completes < 200ms", () => {
    const big: string[] = [];
    for (let i = 0; i < 5000; i++) {
      big.push(
        i % 2 === 0 ? userStringLine : assistantTextLine,
      );
    }
    const t0 = performance.now();
    const out = jsonlToConversationEntries(big);
    const dt = performance.now() - t0;
    expect(out.length).toBe(5000);
    // 200ms budget per Phase 2 task spec.
    expect(dt).toBeLessThan(200);
  });
});
