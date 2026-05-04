// Frontend JSONL parser — see spec §3, §5.1, §5.8, §11.
//
// Two responsibilities:
//   1. Map each JSONL line to a `ConversationEntry` for the viewer (or null
//      if the line is internal noise / unparseable).
//   2. Scan the first ~10 lines of a session file for `SessionMeta` fields.
//
// Real JSONL gotchas (DESIGN-CONTEXT §2 / spec §11):
//   - `message.content` is `string | JsonlContent[]` — first user message is
//     often a bare string.
//   - `permission-mode`, `file-history-snapshot`, `attachment`,
//     `queue-operation`, `last-prompt` lines are skipped (SKIP_TYPES).
//   - `progress` and other unknown types: also not rendered.
//   - System dividers are `{ type: "system", subtype: "turn_duration" }` or
//     `{ type: "system", subtype: "compact_boundary" }`.

import {
  SKIP_TYPES,
  type ConversationEntry,
  type JsonlContent,
  type JsonlMessage,
  type JsonlMessageType,
  type PermissionMode,
  type SessionMeta,
} from "./session-types";

/** First-10-lines metadata window (spec §5.2). */
const METADATA_WINDOW = 10;

const isSkipType = (t: unknown): t is JsonlMessageType =>
  typeof t === "string" && SKIP_TYPES.has(t as JsonlMessageType);

/**
 * Get the `content` field whether the line uses the wrapped `message.content`
 * shape (real JSONL) or the flat `content` shape (some test fixtures + spec).
 */
function readContent(
  line: JsonlMessage,
): string | JsonlContent[] | undefined {
  if (line.message?.content !== undefined) return line.message.content;
  return line.content;
}

function readModel(line: JsonlMessage): string | undefined {
  return line.message?.model ?? line.model;
}

/** Concatenate all text blocks from a content array. */
function joinText(content: JsonlContent[] | string): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (c): c is Extract<JsonlContent, { type: "text" }> => c.type === "text",
    )
    .map((c) => c.text)
    .join("\n");
}

/** Extract a tool_use block from a content array (first one wins). */
function findToolUse(
  content: JsonlContent[],
): Extract<JsonlContent, { type: "tool_use" }> | undefined {
  return content.find(
    (c): c is Extract<JsonlContent, { type: "tool_use" }> =>
      c.type === "tool_use",
  );
}

/** Extract a tool_result block from a content array (first one wins). */
function findToolResult(
  content: JsonlContent[],
): Extract<JsonlContent, { type: "tool_result" }> | undefined {
  return content.find(
    (c): c is Extract<JsonlContent, { type: "tool_result" }> =>
      c.type === "tool_result",
  );
}

function toolResultText(
  block: Extract<JsonlContent, { type: "tool_result" }>,
): string {
  if (typeof block.content === "string") return block.content;
  return block.content.map((c) => c.text).join("\n");
}

/**
 * Parse a single JSONL line to a renderable ConversationEntry.
 * Returns null for unparseable lines, SKIP_TYPES, unknown types, or lines
 * with no renderable content (e.g. an `assistant` line with only metadata).
 */
export function parseJsonlLine(line: string): ConversationEntry | null {
  let parsed: JsonlMessage;
  try {
    parsed = JSON.parse(line) as JsonlMessage;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const t = parsed.type;
  if (typeof t !== "string") return null;
  if (isSkipType(t)) return null;

  switch (t) {
    case "user": {
      const content = readContent(parsed);
      if (content === undefined) return null;
      // String content → plain user message.
      if (typeof content === "string") {
        return { kind: "user", text: content };
      }
      // Array content — may be a tool_result wrapper.
      const tr = findToolResult(content);
      if (tr) {
        return {
          kind: "tool-call",
          // Frontend has no preceding tool_use to bind to in this entry;
          // ConversationViewer is responsible for pairing.
          toolName: "",
          toolInput: {},
          toolOutput: toolResultText(tr),
          isError: tr.is_error === true,
        };
      }
      // Fallback: array of text blocks (rare).
      const text = joinText(content);
      if (!text) return null;
      return { kind: "user", text };
    }

    case "assistant": {
      const content = readContent(parsed);
      const model = readModel(parsed);
      if (content === undefined) return null;
      if (typeof content === "string") {
        return { kind: "assistant", text: content, model };
      }
      const toolUse = findToolUse(content);
      if (toolUse) {
        return {
          kind: "tool-call",
          toolName: toolUse.name,
          toolInput: toolUse.input,
        };
      }
      const text = joinText(content);
      if (!text) return null;
      return { kind: "assistant", text, model };
    }

    case "system": {
      const subtype = (parsed as { subtype?: unknown }).subtype;
      if (subtype === "turn_duration") {
        const ms = (parsed as { durationMs?: unknown }).durationMs;
        const text =
          typeof ms === "number"
            ? `— Turn — ${ms}ms —`
            : "— Turn —";
        return { kind: "system-divider", text };
      }
      if (subtype === "compact_boundary") {
        return {
          kind: "system-divider",
          text: "--- Context compacted ---",
        };
      }
      return null;
    }

    case "summary": {
      const text = (parsed as { summary?: unknown }).summary;
      if (typeof text !== "string") return null;
      return { kind: "summary", text };
    }

    default:
      // Unknown type (e.g. "progress") — silently drop.
      return null;
  }
}

/**
 * Scan the first ~10 lines of a session file for SessionMeta fields.
 * Returns a partial — caller fills in the rest from filesystem + SQLite.
 */
export function parseJsonlMetadata(lines: string[]): Partial<SessionMeta> {
  const out: Partial<SessionMeta> = {};
  const window = lines.slice(0, METADATA_WINDOW);

  for (const raw of window) {
    let line: JsonlMessage;
    try {
      line = JSON.parse(raw) as JsonlMessage;
    } catch {
      continue;
    }
    if (!line || typeof line !== "object") continue;

    // version: any line that has it.
    if (out.version === undefined && typeof line.version === "string") {
      out.version = line.version;
    }
    // gitBranch: any line that has it.
    if (out.gitBranch === undefined && typeof line.gitBranch === "string") {
      out.gitBranch = line.gitBranch;
    }
    // isSidechain: any line; default to false at the end if still undefined.
    if (out.isSidechain === undefined && typeof line.isSidechain === "boolean") {
      out.isSidechain = line.isSidechain;
    }
    // permissionMode: from the explicit `permission-mode` line OR a hint
    // field on any other line (real JSONL writes both).
    if (out.permissionMode === undefined) {
      const pm =
        (line as { permissionMode?: unknown }).permissionMode ??
        (line as { ["permission-mode"]?: unknown })["permission-mode"];
      if (
        typeof pm === "string" &&
        (pm === "default" ||
          pm === "acceptEdits" ||
          pm === "bypassPermissions" ||
          pm === "plan")
      ) {
        out.permissionMode = pm as PermissionMode;
      }
    }
    // slug: only present in ~45% of sessions (DESIGN-CONTEXT §3 / spec §3).
    if (out.slug === undefined && typeof line.slug === "string") {
      out.slug = line.slug;
    }
    // model: from first assistant message.
    if (out.model === undefined) {
      const m = readModel(line);
      if (typeof m === "string") out.model = m;
    }
    // firstPrompt: text of the first user message (string or text-block array).
    if (out.firstPrompt === undefined && line.type === "user") {
      const c = readContent(line);
      if (typeof c === "string") {
        out.firstPrompt = c;
      } else if (Array.isArray(c)) {
        const text = joinText(c);
        if (text) out.firstPrompt = text;
      }
    }
  }

  return out;
}

/**
 * Map every JSONL line through `parseJsonlLine`, drop nulls, and assign
 * sequential turn numbers. A new turn begins on `system/turn_duration`.
 */
export function jsonlToConversationEntries(
  lines: string[],
): ConversationEntry[] {
  const out: ConversationEntry[] = [];
  let turn = 1;

  for (const raw of lines) {
    const entry = parseJsonlLine(raw);
    if (!entry) continue;

    if (entry.kind === "system-divider") {
      // Tag with the turn that just ended, then advance.
      out.push({ ...entry, turnNumber: turn });
      turn += 1;
      continue;
    }
    if (entry.kind === "summary") {
      out.push(entry);
      continue;
    }
    out.push({ ...entry, turnNumber: turn });
  }

  return out;
}
