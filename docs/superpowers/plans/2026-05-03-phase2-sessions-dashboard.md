# Phase 2: Sessions & Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the session data pipeline (discover JSONL files, parse metadata, sync to SQLite) and the two primary views — session list with detail panel, and dashboard with stats/charts/quick actions.

**Architecture:** Rust backend commands discover and parse Claude Code session files in batch, store metadata in SQLite. React frontend uses Zustand stores backed by Tauri IPC. Session list is a split-pane layout with search and 3 view modes. Dashboard reads from `stats-cache.json` and SQLite. Conversation viewer renders JSONL messages with virtual scrolling via `@tanstack/react-virtual`.

**Tech Stack:** Tauri v2 IPC commands, SQLite via tauri-plugin-sql, tauri-plugin-fs (watch), Zustand, @tanstack/react-virtual, Recharts, react-markdown, shiki, KaTeX

**Prerequisites:** Phase 1 complete (app shell, sidebar, theme, SQLite schema, navigation).

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

- [ ] **Step 1: Define all types**

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

- [ ] **Step 2: Commit**

`git commit -m "feat: add TypeScript types for session data model"`

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

---

### Task 3: Shared Utilities

**Files:**
- Create: `src/lib/time-utils.ts`

- [ ] **Step 1: Implement `timeAgo(timestamp: number): string`**

Converts epoch ms to human-readable relative time: "just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Jan 15". Single implementation shared by SessionCard and RecentSessions (avoid duplication). Return empty string for falsy input. Clamp future timestamps to "just now".

- [ ] **Step 2: Commit**

`git commit -m "feat: add shared time utility"`

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

---

### Task 8: Dashboard Store

**Files:**
- Create: `src/stores/dashboard-store.ts`

- [ ] **Step 1: Implement dashboard store**

State: `totalSessions`, `totalMessages`, `longestSession` (name + count), `activeSince`, `activityData[]`, `modelUsage[]`, `recentSessions[]`, `isLoading`.

Action: `loadDashboard()` — queries SQLite for session aggregates, reads stats-cache.json for chart data, gets recent 8 sessions.

- [ ] **Step 2: Commit**

`git commit -m "feat: add dashboard Zustand store"`

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
