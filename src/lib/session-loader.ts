// Session-loading orchestrator — see spec §10 (data refresh) and §5.1.
//
// Pipeline (per task T2.5):
//   1. Call Rust `discover_sessions` once (single batch IPC).
//   2. Call Rust `read_pid_files` to derive ALIVE state.
//   3. Read existing rows from SQLite — preserves user-managed columns
//      (display_name, tags, group_id, is_pinned, archived_at, sort_order)
//      and lets us short-circuit re-parse when `last_synced_at` is recent
//      relative to the JSONL `mtime_ms`.
//   4. Upsert via `INSERT ... ON CONFLICT(session_id) DO UPDATE SET ...`
//      so user-managed columns are NEVER overwritten.
//   5. Merge JSONL metadata + PID liveness + SQLite user metadata into the
//      unified `SessionMeta` shape and return.
//
// `loadSingleSession(id)` reads the raw JSONL via Rust and parses to
// `ConversationEntry[]` for the conversation viewer.
//
// Critical (DESIGN-CONTEXT §2.8): when a PID file exists for a session, the
// session is alive. We never override that with "ended" based on stale data.

import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";

import { dbExecute, dbSelect } from "./db";
import {
  jsonlToConversationEntries,
} from "./jsonl-parser";
import type {
  ConversationEntry,
  PermissionMode,
  PidFileData,
  SessionKind,
  SessionMeta,
  SessionState,
} from "./session-types";

/** Wire shape of one entry returned by the Rust `discover_sessions` IPC. */
export interface DiscoveredSession {
  sessionId: string;
  cwd?: string;
  firstPrompt?: string;
  model?: string;
  version?: string;
  permissionMode?: string;
  gitBranch?: string;
  slug?: string;
  isSidechain: boolean;
  kind?: string;
  entrypoint?: string;
  messageCount: number;
  fileSize: number;
  mtimeMs: number;
  /** Slugified-CWD directory under `~/.claude/projects/`. */
  projectDir: string;
  /** Earliest `timestamp` field seen in JSONL metadata window (epoch ms),
   *  or null when no parseable timestamp exists. Source of truth for
   *  `sessions.started_at`. */
  startedAtMs?: number | null;
}

/** SQLite row shape for the `sessions` table (snake_case). */
interface SessionRow {
  session_id: string;
  display_name: string | null;
  tags: string | null;
  group_id: string | null;
  is_pinned: number | null;
  archived_at: number | null;
  sort_order: number | null;
  cwd: string | null;
  first_prompt: string | null;
  summary: string | null;
  message_count: number | null;
  model: string | null;
  version: string | null;
  permission_mode: string | null;
  git_branch: string | null;
  started_at: number | null;
  duration_ms: number | null;
  entrypoint: string | null;
  kind: string | null;
  last_synced_at: number | null;
}

/**
 * If a session was synced more recently than its JSONL was modified, we can
 * skip the re-parse step entirely. The threshold is the file's `mtime_ms` —
 * anything older than that means the on-disk content has changed and we
 * must trust the freshly-discovered metadata.
 */
function isCacheFresh(row: SessionRow | undefined, mtimeMs: number): boolean {
  if (!row) return false;
  if (row.last_synced_at == null) return false;
  return row.last_synced_at >= mtimeMs;
}

/** Tags are stored as a JSON string in SQLite; decode defensively. */
function decodeTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((s) => typeof s === "string")) return v;
  } catch {
    /* fall through */
  }
  return [];
}

/** Restricted PermissionMode coercion — anything off-list becomes undefined. */
function coercePermissionMode(s: string | null | undefined): PermissionMode | undefined {
  if (s === "default" || s === "acceptEdits" || s === "bypassPermissions" || s === "plan") {
    return s;
  }
  return undefined;
}

function coerceSessionKind(s: string | null | undefined): SessionKind {
  if (s === "interactive" || s === "headless" || s === "sdk") return s;
  // Real Claude Code emits "interactive" or "print"; anything else falls back.
  return "interactive";
}

/**
 * Compute the lifecycle state per spec §5.3.
 *   ALIVE   — PID file present (we trust the PID file as the alive signal
 *             per DESIGN-CONTEXT §2.8). Liveness re-verification via
 *             `is_process_alive` is deferred to a later phase.
 *   ENDED   — JSONL exists, no PID file, not archived.
 *   ORPHANED — SQLite row exists but JSONL was NOT discovered this scan.
 *   ARCHIVED — `archived_at` set in SQLite (overrides ENDED).
 */
function computeState(opts: {
  hasJsonl: boolean;
  hasPid: boolean;
  archivedAt: number | null;
}): SessionState {
  if (opts.archivedAt != null) return "archived";
  if (opts.hasJsonl && opts.hasPid) return "alive";
  if (opts.hasJsonl) return "ended";
  return "orphaned";
}

/**
 * Module-scope caches — keyed by sessionId.
 *   `projectDirBySessionId` is populated by `loadAllSessions` so
 *     `loadSingleSession` can later reconstruct the JSONL path.
 *   `pathCache` memoizes the absolute JSONL path (one `homeDir()` lookup
 *     per process is plenty).
 */
const projectDirBySessionId = new Map<string, string>();
const pathCache = new Map<string, string>();
let claudeProjectsRoot: string | null = null;

async function resolveSessionPath(
  projectDir: string,
  sessionId: string,
): Promise<string> {
  const cached = pathCache.get(sessionId);
  if (cached) return cached;
  if (!claudeProjectsRoot) {
    const home = await homeDir();
    claudeProjectsRoot = await join(home, ".claude", "projects");
  }
  const path = await join(claudeProjectsRoot, projectDir, `${sessionId}.jsonl`);
  pathCache.set(sessionId, path);
  return path;
}

/** Test seam — clears the in-memory caches. */
export function _resetSessionLoaderCacheForTests(): void {
  pathCache.clear();
  projectDirBySessionId.clear();
  claudeProjectsRoot = null;
}

/**
 * Upsert one discovered session into SQLite. Uses `ON CONFLICT(session_id)
 * DO UPDATE SET ...` so user-managed columns (display_name, tags, group_id,
 * is_pinned, archived_at, sort_order) are NEVER touched. Plain `INSERT OR
 * REPLACE` would clobber them.
 */
async function upsertSession(d: DiscoveredSession, syncedAt: number): Promise<void> {
  await dbExecute(
    `INSERT INTO sessions (
       session_id, cwd, first_prompt, message_count, model, version,
       permission_mode, git_branch, kind, entrypoint, started_at, last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       cwd = excluded.cwd,
       first_prompt = excluded.first_prompt,
       message_count = excluded.message_count,
       model = excluded.model,
       version = excluded.version,
       permission_mode = excluded.permission_mode,
       git_branch = excluded.git_branch,
       kind = excluded.kind,
       entrypoint = excluded.entrypoint,
       started_at = COALESCE(excluded.started_at, sessions.started_at),
       last_synced_at = excluded.last_synced_at`,
    [
      d.sessionId,
      d.cwd ?? null,
      d.firstPrompt ?? null,
      d.messageCount,
      d.model ?? null,
      d.version ?? null,
      d.permissionMode ?? null,
      d.gitBranch ?? null,
      d.kind ?? null,
      d.entrypoint ?? null,
      d.startedAtMs ?? null,
      syncedAt,
    ],
  );
}

/**
 * Merge a discovered session, the matching SQLite row (if any), and PID
 * file (if any) into the unified `SessionMeta` shape returned to the UI.
 */
function buildSessionMeta(
  d: DiscoveredSession,
  row: SessionRow | undefined,
  pid: PidFileData | undefined,
  jsonlPath: string,
): SessionMeta {
  return {
    sessionId: d.sessionId,
    cwd: d.cwd ?? row?.cwd ?? "",
    firstPrompt: d.firstPrompt ?? row?.first_prompt ?? "",
    summary: row?.summary ?? undefined,
    messageCount: d.messageCount,
    model: d.model ?? row?.model ?? undefined,
    version: d.version ?? row?.version ?? undefined,
    permissionMode: coercePermissionMode(d.permissionMode ?? row?.permission_mode),
    gitBranch: d.gitBranch ?? row?.git_branch ?? undefined,
    startedAt: pid?.startedAt ?? "",
    durationMs: row?.duration_ms ?? 0,
    entrypoint: d.entrypoint ?? row?.entrypoint ?? "",
    kind: coerceSessionKind(d.kind ?? row?.kind),
    slug: d.slug,
    isSidechain: d.isSidechain,
    toolsUsed: [],
    pid: pid?.pid,
    isAlive: pid !== undefined,
    displayName: row?.display_name ?? undefined,
    tags: decodeTags(row?.tags ?? null),
    groupId: row?.group_id ?? undefined,
    isPinned: row?.is_pinned === 1,
    archivedAt: row?.archived_at != null ? String(row.archived_at) : undefined,
    sortOrder: row?.sort_order ?? 0,
    state: computeState({
      hasJsonl: true,
      hasPid: pid !== undefined,
      archivedAt: row?.archived_at ?? null,
    }),
    jsonlPath,
  };
}

/** Build a SessionMeta for an orphan — SQLite row exists, JSONL does not. */
function buildOrphanMeta(row: SessionRow): SessionMeta {
  return {
    sessionId: row.session_id,
    cwd: row.cwd ?? "",
    firstPrompt: row.first_prompt ?? "",
    summary: row.summary ?? undefined,
    messageCount: row.message_count ?? 0,
    model: row.model ?? undefined,
    version: row.version ?? undefined,
    permissionMode: coercePermissionMode(row.permission_mode),
    gitBranch: row.git_branch ?? undefined,
    startedAt: "",
    durationMs: row.duration_ms ?? 0,
    entrypoint: row.entrypoint ?? "",
    kind: coerceSessionKind(row.kind),
    slug: undefined,
    isSidechain: false,
    toolsUsed: [],
    pid: undefined,
    isAlive: false,
    displayName: row.display_name ?? undefined,
    tags: decodeTags(row.tags),
    groupId: row.group_id ?? undefined,
    isPinned: row.is_pinned === 1,
    archivedAt: row.archived_at != null ? String(row.archived_at) : undefined,
    sortOrder: row.sort_order ?? 0,
    state: computeState({
      hasJsonl: false,
      hasPid: false,
      archivedAt: row.archived_at,
    }),
  };
}

/**
 * Run the full session-loading pipeline.
 *
 * Returns the merged session list. Sessions whose PID file is present are
 * marked ALIVE; sessions that exist in SQLite but were not rediscovered on
 * the filesystem are marked ORPHANED.
 */
export async function loadAllSessions(): Promise<SessionMeta[]> {
  const discovered = await invoke<DiscoveredSession[]>("discover_sessions");
  const pidFiles = await invoke<PidFileData[]>("read_pid_files");
  const pidsBySessionId = new Map(pidFiles.map((p) => [p.sessionId, p]));

  // Read every existing row in one query — cheap, and lets us preserve the
  // user-managed columns + spot orphans in a single pass.
  const rows = await dbSelect<SessionRow>("SELECT * FROM sessions");
  const rowsBySessionId = new Map(rows.map((r) => [r.session_id, r]));

  const syncedAt = Date.now();
  for (const d of discovered) {
    projectDirBySessionId.set(d.sessionId, d.projectDir);
    const row = rowsBySessionId.get(d.sessionId);
    if (!isCacheFresh(row, d.mtimeMs)) {
      await upsertSession(d, syncedAt);
    }
  }

  const out: SessionMeta[] = [];
  const seen = new Set<string>();
  for (const d of discovered) {
    const row = rowsBySessionId.get(d.sessionId);
    const jsonlPath = await resolveSessionPath(d.projectDir, d.sessionId);
    out.push(buildSessionMeta(d, row, pidsBySessionId.get(d.sessionId), jsonlPath));
    seen.add(d.sessionId);
  }
  // Orphans: SQLite rows that did NOT come back from discover_sessions.
  for (const row of rows) {
    if (seen.has(row.session_id)) continue;
    out.push(buildOrphanMeta(row));
  }
  return out;
}

/**
 * Load a single session's raw JSONL and return parsed conversation entries.
 * The session must have been seen by a prior `loadAllSessions()` call so
 * the loader knows which project directory holds it.
 */
export async function loadSingleSession(
  sessionId: string,
): Promise<ConversationEntry[]> {
  const projectDir = projectDirBySessionId.get(sessionId);
  if (!projectDir) {
    throw new Error(
      `loadSingleSession: unknown sessionId "${sessionId}". Call loadAllSessions() first.`,
    );
  }
  const path = await resolveSessionPath(projectDir, sessionId);
  const lines = await invoke<string[]>("read_jsonl_file", { path });
  return jsonlToConversationEntries(lines);
}
