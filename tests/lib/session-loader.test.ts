// Tests for the session loader orchestrator (T2.5).
//
// Mocks at the module boundary:
//   - `@tauri-apps/api/core`     → `invoke` for discover_sessions / read_pid_files / read_jsonl_file
//   - `@tauri-apps/api/path`     → `homeDir` + `join` for the JSONL path reconstruction
//   - `../../src/lib/db`         → `dbSelect` / `dbExecute` so we don't open SQLite for real
// We never mock the unit under test (`session-loader`) itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const dbSelectMock = vi.fn();
const dbExecuteMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/home/test"),
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));
vi.mock("../../src/lib/db", () => ({
  dbSelect: (...args: unknown[]) => dbSelectMock(...args),
  dbExecute: (...args: unknown[]) => dbExecuteMock(...args),
}));

import {
  _resetSessionLoaderCacheForTests,
  loadAllSessions,
  loadSingleSession,
  type DiscoveredSession,
} from "../../src/lib/session-loader";

const baseDiscovered: DiscoveredSession = {
  sessionId: "sess-1",
  cwd: "C:\\src\\proj-a",
  firstPrompt: "hello, claude",
  model: "claude-opus-4.6",
  version: "2.1.98",
  permissionMode: "default",
  gitBranch: "main",
  slug: "chat-with-claude",
  isSidechain: false,
  kind: "interactive",
  entrypoint: "cli",
  messageCount: 5,
  fileSize: 4096,
  mtimeMs: 1_000,
  projectDir: "proj-a",
};

beforeEach(() => {
  invokeMock.mockReset();
  dbSelectMock.mockReset();
  dbExecuteMock.mockReset();
  _resetSessionLoaderCacheForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session-loader: loadAllSessions", () => {
  // case 1: single batch IPC for discover_sessions.
  it("case 1: calls invoke('discover_sessions') exactly once", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions();

    const discoverCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "discover_sessions",
    );
    expect(discoverCalls).toHaveLength(1);
  });

  // case 2: PID file present → state "alive". PID file missing → state "ended".
  it("case 2: cross-references PID files for alive vs ended state", async () => {
    const aliveDiscovered = { ...baseDiscovered, sessionId: "sess-alive" };
    const endedDiscovered = { ...baseDiscovered, sessionId: "sess-ended" };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [aliveDiscovered, endedDiscovered];
      if (cmd === "read_pid_files") {
        return [
          {
            pid: 1234,
            sessionId: "sess-alive",
            cwd: "C:\\src",
            startedAt: 1778852400000,
            kind: "interactive",
            entrypoint: "cli",
          },
        ];
      }
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    const out = await loadAllSessions();
    const byId = new Map(out.map((s) => [s.sessionId, s]));
    expect(byId.get("sess-alive")?.state).toBe("alive");
    expect(byId.get("sess-alive")?.isAlive).toBe(true);
    expect(byId.get("sess-alive")?.pid).toBe(1234);
    expect(byId.get("sess-ended")?.state).toBe("ended");
    expect(byId.get("sess-ended")?.isAlive).toBe(false);
  });

  // case 3: SQLite upsert uses ON CONFLICT DO UPDATE SET and preserves
  // user-managed columns by NOT mentioning them in the SET clause.
  it("case 3: upsert SQL uses ON CONFLICT DO UPDATE and never touches user-managed columns", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions();

    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    const sql = (dbExecuteMock.mock.calls[0][0] as string).toLowerCase();
    expect(sql).toContain("on conflict(session_id) do update set");
    // User-managed columns must be absent from the UPDATE SET clause.
    const setClause = sql.split("do update set")[1];
    for (const forbidden of [
      "display_name",
      "tags",
      "group_id",
      "is_pinned",
      "archived_at",
      "sort_order",
    ]) {
      expect(setClause).not.toContain(forbidden);
    }
    // …and we must NOT use the all-overwriting alternative.
    expect(sql).not.toContain("insert or replace");
  });

  // RCA Bug 1: started_at must be in the upsert column list AND in the
  // bound parameters (regression guard for docs/research/2026-05-09-dashboard-bugs-rca.md §2.1).
  it("RCA Bug 1: upsert writes started_at from DiscoveredSession.startedAtMs", async () => {
    const withTs = { ...baseDiscovered, startedAtMs: 1_777_902_531_652 };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [withTs];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions();

    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    const sql = (dbExecuteMock.mock.calls[0][0] as string).toLowerCase();
    const params = dbExecuteMock.mock.calls[0][1] as unknown[];

    expect(sql).toContain("started_at");
    // The bound startedAtMs value must appear in the params array.
    expect(params).toContain(1_777_902_531_652);
  });

  // RCA Bug 1 corollary: if startedAtMs is missing, COALESCE preserves any
  // existing started_at value rather than nulling it.
  it("RCA Bug 1: started_at COALESCE preserves prior value when current scan has no timestamp", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered]; // no startedAtMs
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions();

    const sql = (dbExecuteMock.mock.calls[0][0] as string).toLowerCase();
    expect(sql).toContain("coalesce(excluded.started_at, sessions.started_at)");
  });

  // case 3b: the merged SessionMeta surfaces user-managed columns from SQLite.
  it("case 3b: merged SessionMeta surfaces displayName/tags/isPinned/etc from SQLite", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([
      {
        session_id: "sess-1",
        display_name: "My Renamed Session",
        tags: JSON.stringify(["work", "urgent"]),
        group_id: "grp-42",
        is_pinned: 1,
        archived_at: null,
        sort_order: 7,
        cwd: null,
        first_prompt: null,
        summary: "Auto-generated summary",
        message_count: 5,
        model: null,
        version: null,
        permission_mode: null,
        git_branch: null,
        started_at: null,
        duration_ms: 12_345,
        entrypoint: null,
        kind: null,
        last_synced_at: 0,
      },
    ]);
    dbExecuteMock.mockResolvedValue(undefined);

    const [meta] = await loadAllSessions();
    expect(meta.displayName).toBe("My Renamed Session");
    expect(meta.tags).toEqual(["work", "urgent"]);
    expect(meta.groupId).toBe("grp-42");
    expect(meta.isPinned).toBe(true);
    expect(meta.sortOrder).toBe(7);
    expect(meta.summary).toBe("Auto-generated summary");
    expect(meta.durationMs).toBe(12_345);
  });

  // case 4: re-parse skipped when SQLite last_synced_at >= JSONL mtime_ms.
  it("case 4: skips upsert when last_synced_at is fresher than mtime_ms", async () => {
    const fresh = { ...baseDiscovered, mtimeMs: 1_000 };
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [fresh];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([
      {
        session_id: "sess-1",
        display_name: null,
        tags: null,
        group_id: null,
        is_pinned: 0,
        archived_at: null,
        sort_order: 0,
        cwd: null,
        first_prompt: null,
        summary: null,
        message_count: 5,
        model: null,
        version: null,
        permission_mode: null,
        git_branch: null,
        started_at: null,
        duration_ms: null,
        entrypoint: null,
        kind: null,
        last_synced_at: 5_000, // newer than mtimeMs
      },
    ]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions();
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  // case 5: dual-write safety — alive PID file beats any "ended" inference.
  it("case 5: alive PID file forces state='alive' even when SQLite would imply ended", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") {
        return [
          {
            pid: 7777,
            sessionId: "sess-1",
            cwd: "C:\\src",
            startedAt: 1778852400000,
            kind: "interactive",
            entrypoint: "cli",
          },
        ];
      }
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    const [meta] = await loadAllSessions();
    expect(meta.state).toBe("alive");
    expect(meta.isAlive).toBe(true);
  });

  // Additional invariant: orphan = in SQLite but not on disk this scan.
  it("additional: SQLite-only sessions are returned as state='orphaned'", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return []; // nothing on disk
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([
      {
        session_id: "sess-orphan",
        display_name: "lost session",
        tags: null,
        group_id: null,
        is_pinned: 0,
        archived_at: null,
        sort_order: 0,
        cwd: "C:\\old",
        first_prompt: "where am i",
        summary: null,
        message_count: 2,
        model: null,
        version: null,
        permission_mode: null,
        git_branch: null,
        started_at: null,
        duration_ms: null,
        entrypoint: null,
        kind: null,
        last_synced_at: 100,
      },
    ]);

    const out = await loadAllSessions();
    expect(out).toHaveLength(1);
    expect(out[0].state).toBe("orphaned");
  });

  // Additional invariant: archived overrides ended.
  it("additional: archived_at set in SQLite → state='archived'", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([
      {
        session_id: "sess-1",
        display_name: null,
        tags: null,
        group_id: null,
        is_pinned: 0,
        archived_at: 1_700_000_000_000,
        sort_order: 0,
        cwd: null,
        first_prompt: null,
        summary: null,
        message_count: null,
        model: null,
        version: null,
        permission_mode: null,
        git_branch: null,
        started_at: null,
        duration_ms: null,
        entrypoint: null,
        kind: null,
        last_synced_at: 0,
      },
    ]);
    dbExecuteMock.mockResolvedValue(undefined);

    const [meta] = await loadAllSessions();
    expect(meta.state).toBe("archived");
  });

  // Orchestration order: discover → read_pid_files → SQLite SELECT → SQLite UPSERT.
  it("integration: orchestration order matches the documented pipeline", async () => {
    const callOrder: string[] = [];
    invokeMock.mockImplementation(async (cmd: string) => {
      callOrder.push(`invoke:${cmd}`);
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockImplementation(async () => {
      callOrder.push("dbSelect");
      return [];
    });
    dbExecuteMock.mockImplementation(async () => {
      callOrder.push("dbExecute");
    });

    await loadAllSessions();

    expect(callOrder).toEqual([
      "invoke:discover_sessions",
      "invoke:read_pid_files",
      "dbSelect",
      "dbExecute",
    ]);
  });
});

describe("session-loader: loadSingleSession", () => {
  // case 6: read_jsonl_file is invoked and parsed entries are returned.
  it("case 6: invokes read_jsonl_file and returns ConversationEntry[]", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "discover_sessions") return [baseDiscovered];
      if (cmd === "read_pid_files") return [];
      if (cmd === "read_jsonl_file") {
        return [
          JSON.stringify({
            type: "user",
            message: { role: "user", content: "ping" },
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              role: "assistant",
              model: "claude-opus-4.6",
              content: [{ type: "text", text: "pong" }],
            },
          }),
        ];
      }
      throw new Error(`unexpected invoke ${cmd}`);
    });
    dbSelectMock.mockResolvedValue([]);
    dbExecuteMock.mockResolvedValue(undefined);

    await loadAllSessions(); // populate the projectDir cache
    const entries = await loadSingleSession("sess-1");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "user", text: "ping" });
    expect(entries[1]).toMatchObject({
      kind: "assistant",
      text: "pong",
      model: "claude-opus-4.6",
    });

    // Verify the path reconstruction goes through `~/.claude/projects/<projectDir>/<id>.jsonl`.
    const readCall = invokeMock.mock.calls.find((c) => c[0] === "read_jsonl_file");
    expect(readCall).toBeDefined();
    const arg = readCall![1] as { path: string };
    expect(arg.path).toContain("proj-a");
    expect(arg.path.endsWith("sess-1.jsonl")).toBe(true);
  });

  it("loadSingleSession throws when no prior loadAllSessions call cached the projectDir", async () => {
    await expect(loadSingleSession("never-seen")).rejects.toThrow(
      /unknown sessionId/i,
    );
  });
});
