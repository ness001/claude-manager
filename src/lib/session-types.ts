// Session data model — see spec §3, §5.1, §5.3, §5.8, §11.
//
// SessionMeta is assembled from four sources (see §5.1):
//   1. JSONL parse  — sessionId, cwd, firstPrompt, summary, messageCount, model,
//                      version, permissionMode, gitBranch, startedAt, durationMs,
//                      entrypoint, kind, slug, isSidechain, toolsUsed
//   2. PID file     — pid, isAlive
//   3. SQLite       — displayName, tags, groupId, isPinned, archivedAt, sortOrder
//   4. Computed     — state

/** Lifecycle of a session — see spec §5.3. */
export type SessionState = "alive" | "ended" | "orphaned" | "archived";

/** How the session was started. */
export type SessionKind = "interactive" | "headless" | "sdk";

/** Permission mode declared in the JSONL `permission-mode` line. */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

/**
 * Block content that may appear inside a JSONL message's `content` array.
 * Real JSONL data uses three shapes — see spec §5.8.
 */
export type JsonlContent =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | Array<{ type: "text"; text: string }>;
      is_error?: boolean;
    };

/**
 * Known JSONL `type` field values. Drawn from observed Claude Code transcripts.
 *
 * NOTE: per spec §5.7, no `progress` type exists in real JSONL — do not add it.
 */
export type JsonlMessageType =
  | "user"
  | "assistant"
  | "system"
  | "summary"
  | "permission-mode"
  | "file-history-snapshot"
  | "attachment"
  | "queue-operation"
  | "last-prompt";

/**
 * One parsed JSONL line.
 *
 * CRITICAL: `content` is `string | JsonlContent[]`. The first user message
 * is often a plain string, not an array — code that assumes array form will
 * crash on real fixtures. (See Phase 2 conventions.)
 */
export interface JsonlMessage {
  type: JsonlMessageType;
  content?: string | JsonlContent[];
  /** Present on assistant messages — model identifier. */
  model?: string;
  /** Present on most messages — Claude Code CLI version. */
  version?: string;
  /** Present on most messages — current git branch at message time. */
  gitBranch?: string;
  /** Sub-agent / nested-session marker. */
  isSidechain?: boolean;
  /** ISO timestamp when this message was logged. */
  timestamp?: string;
  /** Wrapper that some types use (e.g. assistant.message.model). */
  message?: {
    model?: string;
    content?: string | JsonlContent[];
  };
  /** Free-form fields — JSONL is heterogeneous; consumers should narrow by `type`. */
  [extra: string]: unknown;
}

/**
 * JSONL message types that should NOT appear in the conversation viewer.
 * Per spec §5.8 / §11 — exactly 5 entries.
 */
export const SKIP_TYPES: ReadonlySet<JsonlMessageType> = new Set([
  "permission-mode",
  "file-history-snapshot",
  "attachment",
  "queue-operation",
  "last-prompt",
]);

/**
 * Discriminated union of entries the conversation viewer renders.
 * Keep this exhaustive — `switch (entry.kind)` with no `default` branch
 * must type-check.
 */
export type ConversationEntry =
  | {
      kind: "user";
      text: string;
      turnNumber?: number;
    }
  | {
      kind: "assistant";
      text: string;
      model?: string;
      turnNumber?: number;
    }
  | {
      kind: "tool-call";
      toolName: string;
      toolInput: Record<string, unknown>;
      toolOutput?: string;
      isError?: boolean;
      turnNumber?: number;
    }
  | {
      kind: "system-divider";
      text: string;
      turnNumber?: number;
    }
  | {
      kind: "summary";
      text: string;
    };

/**
 * Contents of `~/.claude/sessions/{pid}.json` — see spec §5.1.
 * PID files are ephemeral; absence means the session has ended.
 */
export interface PidFileData {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: string;
  kind: SessionKind;
  entrypoint: string;
}

/**
 * Unified session metadata — see spec §5.1.
 * Field origins are documented in the four-source list at the top of this file.
 */
export interface SessionMeta {
  // ── From JSONL ─────────────────────────────────────────────
  sessionId: string;
  cwd: string;
  firstPrompt: string;
  summary?: string;
  messageCount: number;
  model?: string;
  version?: string;
  permissionMode?: PermissionMode;
  gitBranch?: string;
  startedAt: string;
  durationMs: number;
  entrypoint: string;
  kind: SessionKind;
  /** Only present in ~45% of sessions (system messages). */
  slug?: string;
  isSidechain: boolean;
  /** Distinct tool names observed in tool_use blocks. */
  toolsUsed: string[];

  // ── From PID file ──────────────────────────────────────────
  pid?: number;
  isAlive: boolean;

  // ── From SQLite (user-managed) ─────────────────────────────
  displayName?: string;
  tags: string[];
  groupId?: string;
  isPinned: boolean;
  archivedAt?: string;
  sortOrder: number;

  // ── Computed ───────────────────────────────────────────────
  state: SessionState;
  /**
   * Absolute path to the JSONL file backing this session, when known. Set
   * by `loadAllSessions()` so the conversation viewer can read the file
   * without re-resolving the path. `undefined` for orphaned sessions whose
   * JSONL was not seen during discovery.
   */
  jsonlPath?: string;
}

/** Activity chart period — see spec §4.1. Values must stay lowercase. */
export type ActivityPeriod = "7d" | "30d" | "90d" | "all";
