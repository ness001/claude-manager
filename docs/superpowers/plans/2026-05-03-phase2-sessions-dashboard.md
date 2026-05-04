# Phase 2: Sessions & Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the session data pipeline (discover JSONL files, parse metadata, sync to SQLite) and the two primary views — session list with detail panel, and dashboard with stats/charts/quick actions.

**Architecture:** Rust backend commands discover and parse Claude Code session files in batch, store metadata in SQLite. React frontend uses Zustand stores backed by Tauri IPC. Session list is a split-pane layout with search and 3 view modes. Dashboard reads from `stats-cache.json` and SQLite. Conversation viewer renders JSONL messages with virtual scrolling via `@tanstack/react-virtual`.

**Tech Stack:** Tauri v2 IPC commands, SQLite via tauri-plugin-sql, tauri-plugin-fs (watch), Zustand, @tanstack/react-virtual, Recharts, react-markdown, shiki, KaTeX

**Prerequisites:** Phase 1 complete (app shell, sidebar, theme, SQLite schema, navigation).

## Conventions for all Phase 2 tasks

(General task-execution rules live in repo `CLAUDE.md` → "Executing a plan task". The items below are Phase-2-specific.)

- **Claude data on disk:** sessions live under `~/.claude/projects/<slug>/*.jsonl`; PID files under `~/.claude/sessions/*.pid`; aggregate stats at `~/.claude/stats-cache.json`. On Windows `~` = `%USERPROFILE%`.
- **`sessions-index.json` is stale** — never trust it as the source of truth for live sessions. Re-derive from JSONL + PID file scan. (See `docs/DESIGN-CONTEXT.md`.)
- **PID files are ephemeral** — a missing PID file means "ended", not "never existed". Cross-check against process liveness, not file presence.
- **Process name is `node.exe` (Windows) / `node` — not `claude`.** Liveness checks must look for the right executable.
- **JSONL `content` is `string | JsonlContent[]`.** First user message is often a plain string. Any code that assumes array form will crash on real fixtures.
- **Manual UI / E2E smoke verification:** when not N/A, run `npx tauri dev`, capture screenshots via `scripts/_test/helper.ps1`, and embed the screenshot file paths in the final ralph output before promising completion.

---

## File Structure

```
src-tauri/src/
├── sessions/
│   ├── mod.rs                        # Module declarations
│   ├── discovery.rs                  # Enumerate ~/.claude/projects/*/, glob JSONL files
│   ├── parser.rs                     # Parse JSONL metadata (first ~10 lines per file)
│   ├── pid.rs                        # Read PID files from ~/.claude/sessions/, check process liveness
│   └── commands.rs                   # Tauri IPC commands: discover_sessions, get_session_metadata, read_jsonl_file
src/
├── lib/
│   ├── session-types.ts              # TypeScript types: SessionMeta, JsonlMessage, ConversationEntry, PidFileData
│   ├── jsonl-parser.ts               # Frontend JSONL line parser (string → typed message objects)
│   ├── stats-reader.ts               # Read & shape ~/.claude/stats-cache.json via Tauri fs
│   └── session-loader.ts             # Orchestrator: call Rust commands, sync to SQLite, build session list
├── stores/
│   ├── session-store.ts              # Session list state: sessions[], filters, selection, viewMode, search
│   └── dashboard-store.ts            # Dashboard state: stats, activity data, model usage
├── components/
│   ├── sessions/
│   │   ├── SessionListPanel.tsx      # Left sidebar (260px): new session button, view toggle, search, session cards
│   │   ├── SessionCard.tsx           # Individual session card: status dot, name, tags, time ago
│   │   ├── SessionDetailPanel.tsx    # Right panel: info bar + conversation viewer or placeholder
│   │   ├── SessionInfoBar.tsx        # Status badges (state, model, messages), action buttons
│   │   ├── SessionSearch.tsx         # Search input with 200ms debounce
│   │   └── ViewModeToggle.tsx        # My View / Project / Timeline toggle
│   ├── conversation/
│   │   ├── ConversationViewer.tsx    # Virtual-scrolled message list via @tanstack/react-virtual
│   │   ├── UserMessage.tsx           # User bubble (blue-gray bg)
│   │   ├── AssistantMessage.tsx      # Markdown-rendered assistant message (react-markdown + shiki + KaTeX)
│   │   ├── ToolCallBlock.tsx         # Collapsible tool_use + tool_result pair
│   │   ├── SystemDivider.tsx         # Turn separator / compact boundary
│   │   └── SummaryBanner.tsx         # Session summary display
│   └── dashboard/
│       ├── StatCard.tsx              # Single stat: value + label + accent color
│       ├── ActivityChart.tsx         # Stacked area chart (Recharts) with period toggle
│       ├── ModelDonut.tsx            # Model usage donut (conic-gradient CSS)
│       ├── RecentSessions.tsx        # Last 8 sessions with status dots
│       ├── QuickActions.tsx          # Action buttons: New Session, Resume Latest, etc.
│       └── SystemHealth.tsx          # MCP/API/CLI status indicators
├── sections/
│   ├── SessionsSection.tsx           # Replace placeholder — split pane: SessionListPanel + SessionDetailPanel
│   └── DashboardSection.tsx          # Replace placeholder — full dashboard layout
└── lib/
    └── time-utils.ts                 # Shared timeAgo() helper (used by SessionCard + RecentSessions)
tests/
├── lib/
│   ├── jsonl-parser.test.ts
│   └── stats-reader.test.ts
├── stores/
│   └── session-store.test.ts
└── components/
    └── sessions/
        └── SessionCard.test.tsx
```

---

### Task 1: TypeScript Types for Session Data

**Files:**
- Create: `src/lib/session-types.ts`

- [x] **Step 1: Define all types**

Refer to spec §5.1 for `SessionMeta` fields. Include ALL fields:
- From JSONL: `sessionId`, `cwd`, `firstPrompt`, `summary`, `messageCount`, `model`, `version`, `permissionMode`, `gitBranch`, `startedAt`, `durationMs`, `entrypoint`, `kind`, `slug`, `isSidechain`, `toolsUsed` (computed: distinct tool names from tool_use blocks)
- From PID file: `pid`, `isAlive`
- From SQLite (user-managed): `displayName`, `tags` (string[]), `groupId`, `isPinned`, `archivedAt`, `sortOrder`
- Computed: `state` ("alive" | "ended" | "orphaned" | "archived")

Define `SessionState = "alive" | "ended" | "orphaned" | "archived"` per spec §5.3.

Define `JsonlMessage` type. **Critical:** `content` field must be `string | JsonlContent[]` — real JSONL data has plain strings for the first user message, not always arrays.

Define `JsonlContent` (text block, tool_use block, tool_result block).

Define `JsonlMessageType` union covering all known types: user, assistant, system, summary, permission-mode, file-history-snapshot, attachment, queue-operation, last-prompt. Define `SKIP_TYPES` set for types that should not render in conversation viewer (per spec §5.8).

Define `ConversationEntry` for rendered messages: discriminated union by `kind` (user, assistant, tool-call, system-divider, summary). Include `text`, `model`, `toolName`, `toolInput`, `toolOutput`, `isError`, `turnNumber` as applicable.

Define `PidFileData`: `pid`, `sessionId`, `cwd`, `startedAt`, `kind`, `entrypoint`.

Define `ActivityPeriod = "7d" | "30d" | "90d" | "all"` (lowercase consistently).

- [x] **Step 2: Commit**

`git commit -m "feat: add TypeScript types for session data model"`

**Verification**

*Unit tests* (`tests/lib/session-types.test.ts`):
- [x] case 1: `SessionState` union accepts all four values ("alive" | "ended" | "orphaned" | "archived") via type-level assertion
- [x] case 2: `JsonlMessage.content` accepts both `string` and `JsonlContent[]` (compile-time assertion against fixture line)
- [x] case 3: `SKIP_TYPES` set contains all 5 non-rendered types from spec §5.8 / §11
- [x] case 4: `ConversationEntry` discriminated union exhaustiveness — `switch(kind)` with no default still type-checks

*Component / integration tests* — N/A (types-only module, no runtime surface)

*Data-fixture tests* — N/A (no I/O; types are validated indirectly by Task 2 parser fixtures)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`
- [x] `ActivityPeriod` literals are lowercase ("7d" | "30d" | "90d" | "all")

*Perf budget* — N/A (types-only)

*Manual UI / E2E smoke* — N/A (no UI surface)
- *Existing notes:* (none — task originally had no verification section)

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §3, §5.1, §5.3, §5.8, §11
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T2.1): TypeScript types for session data model`

---

### Task 2: JSONL Parser (Frontend)

**Files:**
- Create: `src/lib/jsonl-parser.ts`
- Create: `tests/lib/jsonl-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Parse a user message line with string content → extracts text
- Parse a user message line with array content (tool_result) → extracts correctly
- Parse an assistant message with text content → extracts text + model
- Parse an assistant message with tool_use content → extracts tool name + input
- Parse a system message (turn_duration) → creates system-divider entry
- Parse a summary message → creates summary entry
- Skip `permission-mode`, `file-history-snapshot`, `attachment`, `queue-operation`, `last-prompt` lines → return null
- Handle malformed JSON line → return null (don't throw)
- `parseJsonlMetadata(lines)` → extracts firstPrompt, model, version, permissionMode, gitBranch, slug, isSidechain from first ~10 lines

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement parser**

`parseJsonlLine(line: string) → ConversationEntry | null`: Parse JSON, check type against SKIP_TYPES, map to ConversationEntry.

`parseJsonlMetadata(lines: string[]) → Partial<SessionMeta>`: Scan first ~10 lines extracting metadata fields. **Critical:** Handle `content` as both `string` and `JsonlContent[]`.

`jsonlToConversationEntries(lines: string[]) → ConversationEntry[]`: Map all lines through `parseJsonlLine`, filter nulls. Assign sequential turn numbers on system/turn_duration boundaries.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

`git commit -m "feat: add frontend JSONL parser with metadata extraction"`

**Verification**

*Unit tests* (`tests/lib/jsonl-parser.test.ts`):
- [ ] case 1: user message with `content` as plain string → `ConversationEntry { kind: "user", text }` (DESIGN-CONTEXT §2 / spec §11)
- [ ] case 2: user message with `content` as `tool_result` array (with `is_error: true`) → tool-call entry with `isError: true`
- [ ] case 3: assistant message with text block array → extracts `text` + `model`
- [ ] case 4: assistant message with `tool_use` block → extracts `toolName` + `toolInput`
- [ ] case 5: each SKIP_TYPES line returns `null` (permission-mode, file-history-snapshot, attachment, queue-operation, last-prompt)
- [ ] case 6: malformed JSON line returns `null` (does NOT throw)
- [ ] case 7: truncated final line (no trailing newline) returns `null` without throwing
- [ ] case 8: `parseJsonlMetadata` extracts firstPrompt, model, version (12-char SHA), permissionMode, gitBranch, slug, isSidechain from first 10 lines
- [ ] case 9: session with NO `slug` field — `parseJsonlMetadata` returns `slug: undefined` (spec §3 — slug present in only 9/20 files)
- [ ] case 10: `jsonlToConversationEntries` assigns sequential turn numbers on `system/turn_duration` boundaries
- [ ] case 11: noisy session with ~80% `progress` lines — they are skipped, output count matches user+assistant+tool only

*Component / integration tests* — N/A (pure parser, no React surface)

*Data-fixture tests* (task reads JSONL):
- [ ] fixture `tests/fixtures/jsonl-parser/normal.jsonl` — happy path session
- [ ] fixture `tests/fixtures/jsonl-parser/with-permission-mode.jsonl` — DESIGN-CONTEXT §2.7 (one of 6 permission modes)
- [ ] fixture `tests/fixtures/jsonl-parser/version-sha.jsonl` — `version` field as 12-char SHA (spec §3)
- [ ] fixture `tests/fixtures/jsonl-parser/no-slug.jsonl` — DESIGN-CONTEXT §2 / spec §3
- [ ] fixture `tests/fixtures/jsonl-parser/noisy-progress.jsonl` — ~80% `progress` lines
- [ ] fixture `tests/fixtures/jsonl-parser/truncated.jsonl` — final line cut mid-JSON
- [ ] parser returns expected normalized `ConversationEntry[]` shape per fixture
- [ ] (DB) — N/A (no schema change in this task)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (large JSONL):
- [ ] parsing 5MB JSONL (≈5000 lines) completes < 200ms in vitest (synchronous path)
- [ ] mean across 20 fixture files (total ≈5MB) < 500ms

*Manual UI / E2E smoke* — N/A (parser has no UI surface; verified via Task 11)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §3, §5.1, §5.8, §11
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.2): frontend JSONL parser with metadata extraction`

---

### Task 3: Shared Utilities

**Files:**
- Create: `src/lib/time-utils.ts`

- [ ] **Step 1: Implement `timeAgo(timestamp: number): string`**

Converts epoch ms to human-readable relative time: "just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Jan 15". Single implementation shared by SessionCard and RecentSessions (avoid duplication). Return empty string for falsy input. Clamp future timestamps to "just now".

- [ ] **Step 2: Commit**

`git commit -m "feat: add shared time utility"`

**Verification**

*Unit tests* (`tests/lib/time-utils.test.ts`):
- [ ] case 1: `timeAgo(Date.now() - 30_000)` → `"just now"`
- [ ] case 2: `timeAgo(Date.now() - 5*60_000)` → `"5m ago"`
- [ ] case 3: `timeAgo(Date.now() - 2*3600_000)` → `"2h ago"`
- [ ] case 4: timestamp from yesterday (calendar boundary) → `"Yesterday"`
- [ ] case 5: timestamp 3 days ago → `"3d ago"`
- [ ] case 6: timestamp older than 7 days → `"Jan 15"`-style date string
- [ ] case 7: `timeAgo(0)` / `timeAgo(NaN)` / `timeAgo(undefined as any)` → `""`
- [ ] case 8: future timestamp (`Date.now() + 60_000`) → clamped to `"just now"`

*Component / integration tests* — N/A (pure function, exercised by SessionCard test in T2.9)

*Data-fixture tests* — N/A (no I/O)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* — N/A
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec (relative time format used in SessionCard + RecentSessions)
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.3): shared time utility`

---

### Task 4: Rust Backend — Session Discovery & Parsing

**Files:**
- Create: `src-tauri/src/sessions/mod.rs`, `discovery.rs`, `parser.rs`, `pid.rs`, `commands.rs`
- Modify: `src-tauri/src/lib.rs` (add mod sessions, register commands)
- Modify: `src-tauri/Cargo.toml` (add `glob` only if needed — prefer `std::fs::read_dir` with manual filtering)

- [ ] **Step 1: Implement `discovery.rs`**

`discover_session_files() → Vec<SessionFileInfo>`: Enumerate `~/.claude/projects/*/` directories, find all `*.jsonl` files. Return file path, project directory, file size, mtime. Use `std::fs::read_dir` with `.jsonl` extension filter (no extra crate needed).

Resolve `~` to the user's home directory. On Windows, use `dirs::home_dir()` or `std::env::var("USERPROFILE")`.

- [ ] **Step 2: Implement `parser.rs`**

`parse_jsonl_metadata(path: &str) → SessionMetadata`: Read only the first ~10 lines of the JSONL file (BufReader + take). Parse each line as JSON, extract: sessionId (from line content or filename), firstPrompt, model, version, permissionMode, gitBranch, slug, isSidechain, kind, entrypoint. Count total lines for messageCount.

**Critical:** Handle `content` as both a JSON string and a JSON array. The first user message often has `content` as a bare string.

For `messageCount`: count only `user` and `assistant` type lines (per spec §5.1), not all newlines. Parse the `type` field from each JSON line — system messages, permission-mode, file-history-snapshot etc. should not be counted. A fast approach: parse only the `type` key from each line (partial JSON check), not a full deserialize.

`read_jsonl_file(path: &str) → Vec<String>`: Read all lines of the JSONL file. Return as a Vec of raw JSON strings for frontend parsing.

- [ ] **Step 3: Implement `pid.rs`**

`read_pid_files() → Vec<PidFileData>`: Read all JSON files from `~/.claude/sessions/`. Parse each into PidFileData struct.

`is_process_alive(pid: u32, started_at: i64) → bool`: Shell out to PowerShell `Get-WmiObject Win32_Process -Filter "ProcessId = {pid}"` (NOT `Get-CimInstance` — spec §17.4 specifies `Get-WmiObject` for better compatibility with PowerShell 5.1 that ships with Windows). Check: (1) process exists, (2) CommandLine contains `cli.js`, (3) **CreationDate** is within 60s of `startedAt` to handle PID reuse. Use a timeout (5s) on the PowerShell command to prevent hanging.

- [ ] **Step 4: Implement `commands.rs`**

Three IPC commands:

`discover_sessions()`: Call discovery + parse metadata for ALL sessions in a single batch. Also read `sessions-index.json` from each project directory to extract `isSidechain` — this file is stale for most fields but is the **exclusive source** for `isSidechain`. Return `Vec<SessionMetadata>`. **Critical:** This must be a single batch command, not N sequential IPC calls from the frontend. The spec requires <30s for 500 sessions on first launch.

`get_session_metadata(path: String)`: Parse metadata for a single session file. Used for incremental updates.

`read_jsonl_file(path: String)`: Read and return all lines of a single JSONL file.

`read_pid_files()`: Read all PID files from `~/.claude/sessions/` and return as `Vec<PidFileData>`.

- [ ] **Step 5: Register in lib.rs**

Add `mod sessions;` and register all 4 commands (`discover_sessions`, `get_session_metadata`, `read_jsonl_file`, `read_pid_files`) in `invoke_handler`.

- [ ] **Step 6: Verify Rust compiles** — `cargo check`

- [ ] **Step 7: Commit**

`git commit -m "feat: add Rust session discovery, JSONL parsing, and PID detection"`

**Verification**

*Unit tests* — covered by `cargo test` below; no JS-side unit tests for this Rust task

*Component / integration tests* — N/A (no React surface in this task; IPC is exercised by T2.5 + T2.13)

*Data-fixture tests* (task reads JSONL + PID files + `~/.claude/`):
- [ ] fixture `tests/fixtures/rust-sessions/projects/<proj>/<sessionId>.jsonl` × 6 (mirrors T2.2 set: normal, permission-mode, version-SHA, no-slug, noisy-progress, truncated)
- [ ] fixture `tests/fixtures/rust-sessions/sessions-index.json` — STALE manifest (17/20 missing, 12 dangling per DESIGN-CONTEXT §2.2); discovery must trust filesystem and only consult it for `isSidechain`
- [ ] fixture `tests/fixtures/rust-sessions/sessions/<sessionId>.json` — active PID file with full schema (DESIGN-CONTEXT §2.3, §2.8)
- [ ] fixture `tests/fixtures/rust-sessions/sessions/<dead>.json` — stale PID file pointing to a guaranteed-dead PID
- [ ] fixture for session referenced by stale `sessions-index.json` but with NO JSONL on disk → discovery omits it
- [ ] parser returns expected `SessionMetadata` shape (sessionId, firstPrompt, model, version, permissionMode, gitBranch, slug, isSidechain, kind, entrypoint, messageCount)
- [ ] `messageCount` counts only `user` + `assistant` lines (spec §5.1), not all newlines
- [ ] (DB) — N/A (no schema change)

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean (zero warnings on new modules)
- [ ] `cargo test sessions::` green
- [ ] PowerShell process query is mocked / abstracted via a trait so `is_process_alive` tests do NOT spawn real processes (DESIGN-CONTEXT §2.4, §2.10)
- [ ] process detection matches `node.exe` with `cli.js` in CommandLine via `Get-WmiObject` — NOT `claude.exe`, NOT `tasklist`, NOT `Get-CimInstance` (DESIGN-CONTEXT §2.4, §2.10; spec §17.4)
- [ ] PowerShell invocation has 5s timeout

*Type-check + lint gate* — N/A (Rust task; covered by `cargo check`)

*Perf budget* (multi-file scan):
- [ ] `discover_sessions` over 500 sessions completes < 30s on first launch (spec target)
- [ ] `discover_sessions` is a SINGLE batch IPC, not N sequential calls

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] in DevTools: `await window.__TAURI__.core.invoke("discover_sessions")` returns array
- [ ] `read_pid_files` returns array (possibly empty)
- [ ] DevTools Console: zero errors
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §3, §5.1, §17.4
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.4): Rust session discovery, JSONL parsing, and PID detection`

---

### Task 5: Session Loader (Frontend Orchestrator)

**Files:**
- Create: `src/lib/session-loader.ts`

- [ ] **Step 1: Implement session loading pipeline**

`loadAllSessions()`:
1. Call `invoke("discover_sessions")` — single batch Rust command
2. Cross-reference with PID files via `invoke("read_pid_files")` for alive status
3. Load existing sessions from SQLite
4. Merge: for sessions already in SQLite with recent `lastSyncedAt`, skip re-parse
5. Upsert new/updated sessions to SQLite

**Critical:** Use `INSERT INTO sessions (...) ON CONFLICT(session_id) DO UPDATE SET cwd=..., first_prompt=..., message_count=..., ...` — preserve user-managed columns (`display_name`, `tags`, `group_id`, `is_pinned`, `archived_at`, `sort_order`). Do NOT use `INSERT OR REPLACE` which overwrites everything.

6. Return full session list merged with SQLite user metadata

`loadSingleSession(sessionId)`: Load JSONL file, parse to ConversationEntry[], return for conversation viewer.

- [ ] **Step 2: Commit**

`git commit -m "feat: add session loader with SQLite sync"`

**Verification**

*Unit tests* (`tests/lib/session-loader.test.ts`):
- [ ] case 1: `loadAllSessions()` calls `invoke("discover_sessions")` exactly once (single batch, not N calls)
- [ ] case 2: cross-references PID files — sessions whose PID file is present and "alive" get `state: "alive"`; missing PID file → `"ended"`
- [ ] case 3: SQLite upsert uses `ON CONFLICT(session_id) DO UPDATE SET` and preserves `display_name`, `tags`, `group_id`, `is_pinned`, `archived_at`, `sort_order`
- [ ] case 4: session already in SQLite with recent `lastSyncedAt` → re-parse skipped
- [ ] case 5: dual-write safety — when a PID file exists and is alive, loader does NOT mark session as "ended" (DESIGN-CONTEXT §2.8)
- [ ] case 6: `loadSingleSession(id)` calls `invoke("read_jsonl_file")` and returns parsed `ConversationEntry[]`

*Component / integration tests* (`tests/lib/session-loader.test.ts`, mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql`):
- [ ] mock IPC + SQL plugins; assert orchestration order: discover → read_pid_files → SQLite read → SQLite upsert
- [ ] no console errors during full pipeline run

*Data-fixture tests* (task reads JSONL via Rust + writes SQLite):
- [ ] fixture from T2.4 — mocked `discover_sessions` response of 20 sessions including stale-index, missing-jsonl, no-slug, alive-with-pid (DESIGN-CONTEXT §2.2, §2.3, §2.8)
- [ ] loader produces expected merged shape per fixture
- [ ] (DB) migration check — N/A (no schema change in this task; uses existing v1 schema)

*Rust checks* — N/A (no `src-tauri/` changes — task only consumes existing IPC commands)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (multi-file scan):
- [ ] full pipeline for 500 sessions completes < 30s end-to-end (spec)
- [ ] subsequent reload (warm SQLite) < 2s

*Manual UI / E2E smoke* — N/A in isolation; verified via T2.13 wiring
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §10 (data refresh), §5.1
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.5): session loader with SQLite sync`

---

### Task 6: Session Store (Zustand)

**Files:**
- Create: `src/stores/session-store.ts`
- Create: `tests/stores/session-store.test.ts`

- [ ] **Step 1: Write failing tests**

Test: initial state (empty sessions, no selection), setViewMode changes mode, setSearchQuery filters, selectSession updates selectedId, filteredSessions returns correct subset.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement session store**

State: `sessions: SessionMeta[]`, `selectedId: string | null`, `viewMode: "my" | "project" | "timeline"`, `searchQuery: string`, `isLoading: boolean`.

Actions: `loadSessions()` (calls session-loader), `selectSession(id)`, `setViewMode(mode)`, `setSearchQuery(query)`.

Derived: `filteredSessions()` — filter by search query (case-insensitive, matches displayName, firstPrompt, tags, cwd per spec §17.7). Also filter out `isSidechain = true` sessions. Also filter out archived unless view mode explicitly shows them.

**Performance note:** Don't put `filteredSessions()` as a store method that calls `get()`. Instead, compute it as a derived selector outside the store, or use `useMemo` in the component. This prevents unnecessary re-renders (Zustand uses referential equality).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

`git commit -m "feat: add session Zustand store with filtering and view modes"`

**Verification**

*Unit tests* (`tests/stores/session-store.test.ts`):
- [ ] case 1: initial state — `sessions: []`, `selectedId: null`, `viewMode: "my"`, `searchQuery: ""`, `isLoading: false`
- [ ] case 2: `setViewMode("project")` updates mode and does not reset selection
- [ ] case 3: `setSearchQuery("foo")` filters sessions case-insensitively across `displayName`, `firstPrompt`, `tags`, `cwd` (spec §17.7)
- [ ] case 4: `selectSession(id)` updates `selectedId`
- [ ] case 5: `filteredSessions` excludes `isSidechain === true` sessions
- [ ] case 6: `filteredSessions` excludes archived sessions unless view mode shows them
- [ ] case 7: `loadSessions()` integration — calls session-loader (mocked) and populates store

*Component / integration tests* — N/A (store is exercised through SessionListPanel in T2.9 + T2.13)

*Data-fixture tests* — N/A (store is in-memory; data shapes covered by T2.5)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`
- [ ] `filteredSessions` is a derived selector or `useMemo`-computed in components, NOT a store method using `get()` (referential-equality re-render guard)

*Perf budget* — N/A (in-memory filter; perf measured at component layer in T2.9)

*Manual UI / E2E smoke* — N/A (no UI surface in this task)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §17.7, §5.3
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.6): session Zustand store with filtering and view modes`

---

### Task 7: Stats Reader

**Files:**
- Create: `src/lib/stats-reader.ts`
- Create: `tests/lib/stats-reader.test.ts`

- [ ] **Step 1: Write failing tests**

Test: reads mock stats-cache.json structure, extracts dailyActivity, dailyModelTokens, hourCounts. Handles missing file gracefully.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement stats reader**

Read `~/.claude/stats-cache.json` via Tauri FS plugin. Parse and return shaped data for charts. Handle file-not-found (return empty/default data).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

`git commit -m "feat: add stats-cache.json reader"`

**Verification**

*Unit tests* (`tests/lib/stats-reader.test.ts`):
- [ ] case 1: reads valid `stats-cache.json` → returns shape with `costUSD`, `hourCounts`, `dailyActivity`, `dailyModelTokens`
- [ ] case 2: missing file (Tauri FS rejects) → returns empty/default `{ dailyActivity: [], dailyModelTokens: [], hourCounts: [], costUSD: 0 }` and does NOT throw
- [ ] case 3: malformed JSON → returns defaults and does NOT throw
- [ ] case 4: extra/unknown keys are ignored without erroring

*Component / integration tests* — N/A (pure reader; mock `@tauri-apps/plugin-fs` in unit tests)

*Data-fixture tests* (task reads `~/.claude/stats-cache.json`):
- [ ] fixture `tests/fixtures/stats-reader/stats-cache.json` matching the per-spec schema (`costUSD`, `hourCounts[24]`, `dailyActivity[]`, `dailyModelTokens[]`)
- [ ] fixture `tests/fixtures/stats-reader/missing/` — directory with no file, asserts graceful default
- [ ] fixture `tests/fixtures/stats-reader/malformed.json` — bad JSON, asserts graceful default
- [ ] reader returns expected normalized shape
- [ ] (DB) — N/A

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (single small JSON file)

*Manual UI / E2E smoke* — N/A (verified via Dashboard in T2.13)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §6 (Dashboard data sources)
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.7): stats-cache.json reader`

---

### Task 8: Dashboard Store

**Files:**
- Create: `src/stores/dashboard-store.ts`

- [ ] **Step 1: Implement dashboard store**

State: `totalSessions`, `totalMessages`, `longestSession` (name + count), `activeSince`, `activityData[]`, `modelUsage[]`, `recentSessions[]`, `isLoading`.

Action: `loadDashboard()` — queries SQLite for session aggregates, reads stats-cache.json for chart data, gets recent 8 sessions.

- [ ] **Step 2: Commit**

`git commit -m "feat: add dashboard Zustand store"`

**Verification**

*Unit tests* (`tests/stores/dashboard-store.test.ts`):
- [ ] case 1: initial state — all numeric fields 0, all arrays empty, `isLoading: false`
- [ ] case 2: `loadDashboard()` sets `isLoading: true` then false; populates `totalSessions`, `totalMessages`, `longestSession`, `activeSince` from mocked SQLite query
- [ ] case 3: `activityData` + `modelUsage` populated from mocked stats-reader response
- [ ] case 4: `recentSessions` returns 8 most recent (mocked SQLite ORDER BY started_at DESC LIMIT 8)
- [ ] case 5: failed SQLite read → store falls back to safe defaults, does NOT throw

*Component / integration tests* (mock `@tauri-apps/plugin-sql` + `@tauri-apps/plugin-fs`):
- [ ] mocks resolve correctly during `loadDashboard()`; no unhandled rejections

*Data-fixture tests* (task reads SQLite + `stats-cache.json`):
- [ ] reuses T2.7 fixture for `stats-cache.json`
- [ ] fixture seed for SQLite — 20 sessions covering archived, alive, ended, no-firstPrompt, varying message counts
- [ ] (DB) — N/A (no schema change; reads existing v1 schema)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (small aggregate queries)

*Manual UI / E2E smoke* — N/A (verified through DashboardSection in T2.13)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §6
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.8): dashboard Zustand store`

---

### Task 9: Session List UI Components

**Files:**
- Create: `src/components/sessions/SessionCard.tsx`, `SessionSearch.tsx`, `ViewModeToggle.tsx`, `SessionListPanel.tsx`
- Create: `tests/components/sessions/SessionCard.test.tsx`

- [ ] **Step 1: Write failing test for SessionCard**

Test: renders session name (displayName or firstPrompt truncated), shows status dot with correct color (green=alive, gray=ended, yellow=orphaned), shows time ago, shows tag pills.

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement SessionCard**

Compact card showing: status dot (colored per state, pulsing for alive), display name or firstPrompt (truncated), tag pills, time ago (using shared `timeAgo`), message count. Click selects the session.

- [ ] **Step 4: Implement SessionSearch**

Controlled input synced with store's `searchQuery`. 200ms debounce on input change. **Important:** Use controlled `value` prop (not `defaultValue`) so external clears (e.g., section switch) are reflected.

- [ ] **Step 5: Implement ViewModeToggle**

Three-button group: My View / Project / Timeline. Updates store's `viewMode`.

- [ ] **Step 6: Implement SessionListPanel**

260px wide left panel. Layout: "+ New Session" button (accent) → ViewModeToggle → SessionSearch → scrollable list of SessionCards. **Critical:** Use `@tanstack/react-virtual` (`useVirtualizer`) when `filteredSessions.length > 50` (per spec §17.8 virtual scrolling requirement). Groups sessions based on viewMode:
- My View: by user-defined groups, pinned first
- Project: by CWD path
- Timeline: Today/Yesterday/This Week/by month

- [ ] **Step 7: Run test — expect PASS**

- [ ] **Step 8: Commit**

`git commit -m "feat: add session list panel with cards, search, and view modes"`

**Verification**

*Unit tests* — N/A (logic lives in store T2.6; this task is presentational)

*Component / integration tests* (`tests/components/sessions/SessionCard.test.tsx`, `SessionSearch.test.tsx`, `ViewModeToggle.test.tsx`, `SessionListPanel.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql`):
- [ ] mounts without console errors (each component)
- [ ] SessionCard: renders displayName when set, else truncated firstPrompt
- [ ] SessionCard: status dot color — green (alive, with pulse class), gray (ended), yellow (orphaned), neutral (archived)
- [ ] SessionCard: shows tag pills, timeAgo, message count
- [ ] SessionCard: click → calls `selectSession(id)` on store
- [ ] SessionSearch: typing fires `setSearchQuery` after 200ms debounce (use `vi.useFakeTimers`)
- [ ] SessionSearch: uses controlled `value` (external clear updates input)
- [ ] ViewModeToggle: clicking each of three buttons updates `viewMode`
- [ ] SessionListPanel: groups by viewMode (My View / Project / Timeline) — assert section headings
- [ ] SessionListPanel: virtual scrolling kicks in when `filteredSessions.length > 50` (assert via presence of `useVirtualizer` container)
- [ ] dark + light theme parity — status dot, tag pill, and selected-card backgrounds resolve via CSS vars in both modes

*Data-fixture tests* — N/A (uses store mocks; underlying data covered by T2.5 fixtures)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (list rendering):
- [ ] render 100 sessions in `SessionListPanel` — first paint < 100ms (measure with `performance.now()` in test)
- [ ] render 500 sessions — virtualized DOM keeps node count < 30 (only visible rows)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] click "+ New Session" — button is reachable (action wired in later phase OK)
- [ ] type in search — list filters live
- [ ] toggle view modes — grouping changes
- [ ] click a card — selection highlight applied
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors / React key warnings (each grouped section uses stable keys)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §5, §17.7, §17.8
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.9): session list panel with cards, search, and view modes`

---

### Task 10: Session Detail Panel

**Files:**
- Create: `src/components/sessions/SessionDetailPanel.tsx`, `SessionInfoBar.tsx`

- [ ] **Step 1: Implement SessionInfoBar**

Shows: session name (editable), status badges (state pill, model badge, message count, entrypoint badge). Action buttons vary by state per spec §5.3:
- ALIVE: View Live, Resume in Terminal, Open CWD, Open in VS Code, Tag/Rename, **Stop (SIGTERM, with confirmation)**
- ENDED: Resume, Fork, Open CWD, Open in VS Code, Tag/Rename, Archive
- ORPHANED: Resume, Open CWD, Delete
- ARCHIVED: Unarchive, View Conversation, Delete

**Important:** ALIVE sessions must NOT show "Resume" — they show "View Live" and "Resume in Terminal" instead.

**Dead CWD handling (spec §17.5):** Check if CWD exists via Tauri FS `exists()`. If CWD doesn't exist, show warning icon on the session card and disable "Open CWD" / "Open in VS Code" buttons.

- [ ] **Step 2: Implement SessionDetailPanel**

Right content area. If no session selected: empty state "Select a session to view". If session selected: SessionInfoBar at top + ConversationViewer below (or placeholder until Task 11).

- [ ] **Step 3: Commit**

`git commit -m "feat: add session detail panel with info bar"`

**Verification**

*Unit tests* — N/A (presentational; behavior covered by component tests below)

*Component / integration tests* (`tests/components/sessions/SessionInfoBar.test.tsx`, `SessionDetailPanel.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-fs`):
- [ ] mounts without console errors
- [ ] SessionDetailPanel with no selection → "Select a session to view" empty state
- [ ] SessionInfoBar action set per state (spec §5.3):
  - [ ] ALIVE → View Live, Resume in Terminal, Open CWD, Open in VS Code, Tag/Rename, Stop. Does NOT show plain "Resume"
  - [ ] ENDED → Resume, Fork, Open CWD, Open in VS Code, Tag/Rename, Archive
  - [ ] ORPHANED → Resume, Open CWD, Delete
  - [ ] ARCHIVED → Unarchive, View Conversation, Delete
- [ ] Stop button on ALIVE shows confirmation dialog before invoking SIGTERM
- [ ] Dead-CWD handling (spec §17.5): mocked `exists()` returns false → warning icon shown, "Open CWD" + "Open in VS Code" buttons disabled
- [ ] name field is editable — typing fires update action
- [ ] dark + light theme parity for status pill / model badge colors

*Data-fixture tests* — N/A (uses mocked SessionMeta objects; CWD existence mocked via `@tauri-apps/plugin-fs`)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (small panel; no large lists)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] select an ALIVE session → action set matches spec §5.3 (no "Resume")
- [ ] select an ENDED session → "Resume" + "Fork" present
- [ ] click Stop on ALIVE → confirm dialog appears
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §5.3, §17.5
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.10): session detail panel with info bar`

---

### Task 11: Conversation Viewer

**Files:**
- Create: `src/components/conversation/ConversationViewer.tsx`, `UserMessage.tsx`, `AssistantMessage.tsx`, `ToolCallBlock.tsx`, `SystemDivider.tsx`, `SummaryBanner.tsx`

- [ ] **Step 1: Implement message components**

`UserMessage`: User bubble with blue-gray bg (`bg-user-bubble`), "You" label, text content. Handle both string and array content.

`AssistantMessage`: "Claude" label + model badge. Render text via `react-markdown` with `shiki` for code blocks and `KaTeX` for math. Handle text content blocks from content array.

`ToolCallBlock`: Tool name header with blue left border. Collapsible input JSON and output. Red border if `is_error`. Pair tool_use with following tool_result.

`SystemDivider`: For `turn_duration` type → centered "— Turn N — Xms —" with horizontal lines. For `compact_boundary` → dashed "--- Context compacted ---" line.

`SummaryBanner`: Highlighted banner with summary text.

- [ ] **Step 2: Implement ConversationViewer**

**Critical:** Must use `@tanstack/react-virtual` (`useVirtualizer`) for virtual scrolling. The spec requires <500ms to open 5000-line JSONL files. Render only visible entries.

Load JSONL via `invoke("read_jsonl_file", { path })`, parse through `jsonlToConversationEntries()`. Show loading spinner initially. Parse first 50 messages synchronously for immediate display; for large files, parse remainder in a Web Worker (or at minimum, in chunks via `requestIdleCallback`).

Handle corrupted lines: skip + show "⚠ N lines could not be parsed" note per spec §17.5.

**Jump-to-turn navigation (spec §5.7):** For ENDED sessions, provide a mechanism to jump between turns — e.g., a turn index sidebar, keyboard shortcuts (Ctrl+Up/Down), or a turn number input. Show the total turn count and allow navigating by turn number.

- [ ] **Step 3: Commit**

`git commit -m "feat: add conversation viewer with virtual scrolling and message components"`

**Verification**

*Unit tests* — N/A (rendering logic; covered by component tests)

*Component / integration tests* (`tests/components/conversation/*.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core`):
- [ ] mounts without console errors (each: ConversationViewer, UserMessage, AssistantMessage, ToolCallBlock, SystemDivider, SummaryBanner)
- [ ] UserMessage: renders both `string` content and `JsonlContent[]` content variants (spec §11)
- [ ] AssistantMessage: renders markdown via react-markdown; code block uses shiki; `$x^2$` renders via KaTeX
- [ ] AssistantMessage: shows model badge
- [ ] ToolCallBlock: renders tool name + input JSON + output, collapsible
- [ ] ToolCallBlock: red border when paired tool_result has `is_error: true`
- [ ] SystemDivider: `turn_duration` → "— Turn N — Xms —"; `compact_boundary` → dashed "--- Context compacted ---"
- [ ] SummaryBanner: renders summary text in highlighted banner
- [ ] ConversationViewer: corrupted lines skipped + "⚠ N lines could not be parsed" note shown (spec §17.5)
- [ ] ConversationViewer: jump-to-turn navigation works (spec §5.7) — Ctrl+Up/Down or turn input scrolls to target turn
- [ ] dark + light theme parity (user bubble bg, code block, KaTeX colors)

*Data-fixture tests* (task reads JSONL):
- [ ] fixture per renderable JSONL message type (spec §11): user-text, user-tool_result (with `is_error`), assistant-text-markdown, assistant-tool_use, system-turn_duration, system-compact_boundary, summary
- [ ] fixture exercising SKIP_TYPES inputs (permission-mode, file-history-snapshot, attachment, queue-operation, last-prompt) → produce zero rendered nodes
- [ ] fixture for truncated final line — viewer shows warning, no crash
- [ ] (DB) — N/A

*Rust checks* — N/A (consumes existing `read_jsonl_file` IPC from T2.4)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (large JSONL + virtualization):
- [ ] open 5000-line / 5MB JSONL → first paint of first 50 messages < 500ms (spec target)
- [ ] virtualized DOM keeps rendered node count proportional to viewport (< 50 entries) for 5000-line file
- [ ] remainder parsed in Web Worker or `requestIdleCallback` chunks (UI thread not blocked > 50ms)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] open a real session > 1000 messages — scrolling stays smooth
- [ ] markdown / code / math render correctly
- [ ] tool_use + tool_result pair renders together; error case shows red border
- [ ] keyboard shortcut: Ctrl+Down jumps to next turn
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors / React key warnings
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §5.7, §5.8, §11, §17.5, §17.8
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.11): conversation viewer with virtual scrolling and message components`

---

### Task 12: Dashboard UI Components

**Files:**
- Create: `src/components/dashboard/StatCard.tsx`, `ActivityChart.tsx`, `ModelDonut.tsx`, `RecentSessions.tsx`, `QuickActions.tsx`, `SystemHealth.tsx`

- [ ] **Step 1: Implement StatCard**

Reusable card: large value, label text, colored accent stripe. Used for 4 dashboard stats: Sessions (green), Messages (blue), Longest Session (yellow, show name + count), Active Since (mauve).

- [ ] **Step 2: Implement ActivityChart**

Recharts stacked area chart. Period toggle: 7d / 30d / 90d / All (lowercase consistently in both types and UI). Data from `dashboardStore.activityData`. Toggle between Messages vs Tool Calls view.

**Note:** Use explicit period-to-days mapping (e.g., `{ "7d": 7, "30d": 30, ... }`) instead of `parseInt("7d")` which works by accident.

- [ ] **Step 3: Implement ModelDonut**

CSS conic-gradient donut chart showing model usage distribution. Legend with model names + token counts.

- [ ] **Step 4: Implement RecentSessions**

List of last 8 sessions: status dot + name + time ago + message count. "View All Sessions" link navigates to Sessions section. Uses shared `timeAgo()` helper.

- [ ] **Step 5: Implement QuickActions**

Button grid: New Session (prominent accent button), Resume Latest, Open CWD, Rebuild Stats.

- [ ] **Step 6: Implement SystemHealth**

Status indicators: MCP connection count, plugin count, API reachability (HEAD request to ANTHROPIC_BASE_URL, non-blocking), CLI version. Green/yellow/red dots.

- [ ] **Step 7: Commit**

`git commit -m "feat: add dashboard UI components"`

**Verification**

*Unit tests* (`tests/components/dashboard/*.test.tsx`, period mapping):
- [ ] case 1: ActivityChart period mapping uses explicit `{ "7d": 7, "30d": 30, "90d": 90, "all": Infinity }` table — NOT `parseInt("7d")`
- [ ] case 2: empty `activityData[]` → empty state message rather than Recharts blank canvas

*Component / integration tests* (`tests/components/dashboard/*.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql` + `@tauri-apps/plugin-fs`):
- [ ] mounts without console errors (each: StatCard, ActivityChart, ModelDonut, RecentSessions, QuickActions, SystemHealth)
- [ ] StatCard: renders value + label + accent stripe; verify each of 4 colors (green / blue / yellow / mauve)
- [ ] ActivityChart: empty state when `activityData=[]`; populated state renders Recharts SVG with N data points
- [ ] ActivityChart: clicking 7d/30d/90d/All toggles updates rendered range
- [ ] ActivityChart: Messages vs Tool Calls toggle switches series
- [ ] ModelDonut: legend shows model names + token counts; conic-gradient style applied
- [ ] RecentSessions: renders 8 entries; "View All Sessions" link triggers navigation
- [ ] QuickActions: 4 buttons present and clickable
- [ ] SystemHealth: indicator dot color reflects status; API check is non-blocking (mocked HEAD)
- [ ] dark + light theme parity — chart axis colors, donut segment colors, status dots all resolve via CSS vars in both modes

*Data-fixture tests* (task reads `stats-cache.json`):
- [ ] reuses T2.7 fixture (`costUSD`, `hourCounts`, `dailyActivity`, `dailyModelTokens`)
- [ ] (DB) — N/A

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`
- [ ] `ActivityPeriod` literals lowercase ("7d" | "30d" | "90d" | "all") consistent with types

*Perf budget* (charts):
- [ ] ActivityChart with 90 data points renders < 100ms
- [ ] re-render on period toggle < 50ms (memoize derived series)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] dashboard renders with real `stats-cache.json` (or empty states)
- [ ] toggle period 7d → 30d → 90d → All
- [ ] toggle Messages ↔ Tool Calls
- [ ] dark + light render correctly (chart legibility)
- [ ] DevTools Console: zero errors / React key warnings (Recharts cells have stable keys)
- *Existing notes:* (none)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §6, §4.1
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.12): dashboard UI components`

---

### Task 13: Section Integration & Wiring

**Files:**
- Modify: `src/sections/DashboardSection.tsx` (replace placeholder)
- Modify: `src/sections/SessionsSection.tsx` (replace placeholder)

- [ ] **Step 1: Wire up DashboardSection**

Replace placeholder with full dashboard layout per spec §4.1:
- Row 1: 4 StatCards in a grid
- Row 2: ActivityChart (60%) + ModelDonut (40%)
- Row 3: RecentSessions (60%) + QuickActions (top 40%) + SystemHealth (bottom 40%)

Call `dashboardStore.loadDashboard()` on mount.

**Note:** FS watchers and live session updates are deferred to Phase 4 Task 10. Phase 2 provides one-shot data loading only.

- [ ] **Step 2: Wire up SessionsSection**

Replace placeholder with split-pane layout: `SessionListPanel` (260px left) + `SessionDetailPanel` (flex right).

Call `sessionStore.loadSessions()` on mount.

Handle loading states: skeleton cards per spec §17.6. Handle empty state: "No sessions found" + New Session CTA.

- [ ] **Step 3: Run all tests — expect PASS**

- [ ] **Step 4: Dev build verification**

`npx tauri dev` — Dashboard shows stats/charts (or empty states if no data). Sessions shows session list from real `~/.claude/` data. Clicking a session shows conversation viewer.

- [ ] **Step 5: Commit**

`git commit -m "feat: wire up Dashboard and Sessions sections — Phase 2 complete"`

**Verification**

*Unit tests* — N/A (integration task; no isolated logic)

*Component / integration tests* (`tests/sections/DashboardSection.test.tsx`, `SessionsSection.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql` + `@tauri-apps/plugin-fs`):
- [ ] mounts without console errors (both sections)
- [ ] DashboardSection layout (spec §4.1): Row 1 = 4 StatCards in grid; Row 2 = ActivityChart (60%) + ModelDonut (40%); Row 3 = RecentSessions (60%) + QuickActions + SystemHealth (40% column)
- [ ] DashboardSection: `dashboardStore.loadDashboard()` invoked once on mount
- [ ] SessionsSection layout: 260px left `SessionListPanel` + flex right `SessionDetailPanel`
- [ ] SessionsSection: `sessionStore.loadSessions()` invoked once on mount
- [ ] SessionsSection loading state — skeleton cards present (spec §17.6) while `isLoading: true`
- [ ] SessionsSection empty state — "No sessions found" + New Session CTA when `sessions.length === 0`
- [ ] interaction: click a session in list → `SessionDetailPanel` updates to that session
- [ ] dark + light theme parity for both sections

*Data-fixture tests* — N/A in this task (relies on mocks; underlying fixtures covered by T2.5, T2.7)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (multi-file scan + list rendering):
- [ ] full Sessions section first paint with 100 real sessions < 1s after IPC return
- [ ] full Dashboard section first paint < 500ms after data return
- [ ] no FS watchers wired up in Phase 2 (deferred to Phase 4 Task 10 per task note)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] navigate to Dashboard — stats / charts populated (or empty states if no data)
- [ ] navigate to Sessions — list shows real `~/.claude/` sessions
- [ ] click a session — conversation viewer renders
- [ ] keyboard shortcut: section switch shortcut from Phase 1 still works
- [ ] dark + light render correctly across both sections
- [ ] DevTools Console: zero errors / React key warnings
- *Existing notes:*
  - Step 3 (existing): "Run all tests — expect PASS"
  - Step 4 (existing): "Dev build verification — `npx tauri dev` — Dashboard shows stats/charts (or empty states if no data). Sessions shows session list from real `~/.claude/` data. Clicking a session shows conversation viewer."

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §4.1, §6, §17.6
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T2.13): wire up Dashboard and Sessions sections — Phase 2 complete`
