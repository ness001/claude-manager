# Claude Manager — Design Context & Key Decisions

> **Purpose:** Preserve all research findings, design decisions, and critical corrections so context is never lost between sessions.
> **Last updated:** 2026-05-03
> **Status:** Design complete, pending user review before implementation planning

---

## 1. What We're Building

A **single-window desktop app** called "Claude Manager" to manage the entire Claude Code ecosystem:
- **Sessions** — browse, resume, fork, tag, group, view conversations
- **Plugins** — manage installed plugins (which contain skills, agents, hooks)
- **MCP Servers** — configure and monitor Model Context Protocol servers
- **Dashboard** — activity stats, quick actions, system health
- **Settings** — Claude Code configuration, app preferences

### Tech Stack (Decided)

| Layer | Choice |
|---|---|
| Desktop framework | **Tauri v2** (Rust backend, Webview2) |
| Frontend | **React 19 + TypeScript + Vite** |
| State management | **Zustand** |
| Styling | **Tailwind CSS v4** + CSS custom properties |
| Charts | **Recharts** |
| Terminal | **xterm.js** + custom Rust PTY plugin (`portable-pty` crate) |
| Database | **SQLite** via `tauri-plugin-sql` (`%APPDATA%/claude-manager/`) |
| File watching | `tauri-plugin-fs` watch() + polling fallback |
| Markdown/code | `react-markdown` + `shiki` + `KaTeX` |
| Virtual scroll | `@tanstack/react-virtual` |
| Single instance | `tauri-plugin-single-instance` |
| Notifications | `tauri-plugin-notification` |

### App Layout (Decided)

- **Icon sidebar rail** (left): Dashboard, Sessions, Plugins, MCP, Settings
- **Content area** fills rest of window
- Panels have list + detail split view
- Command palette: `Ctrl+K`
- Keyboard nav: `Ctrl+1-5` for sections

---

## 2. Critical Corrections from Research

These were discovered by 8 paired agents (4 proposers + 4 verifiers) doing deep filesystem research. **Do not deviate from these findings.**

### 2.1 MCP Config Location
- **WRONG:** `settings.json`
- **CORRECT:** `~/.claude.json`
- User scope: `$.mcpServers.<name>`
- Local scope: `$.projects["<path>"].mcpServers.<name>` (per-project, private)
- Project scope: `<project-root>/.mcp.json` (shared, committed to git)
- Trust tracking: `enabledMcpjsonServers` / `disabledMcpjsonServers` arrays per project entry

### 2.2 sessions-index.json is STALE
- 17/20 JSONL files are NOT in the index
- 12 entries point to missing files
- **Use as speed hint only**, never as primary data source
- Correct approach: enumerate JSONL files directly from `~/.claude/projects/*/`

### 2.3 PID Files are Ephemeral
- Location: `~/.claude/sessions/{pid}.json`
- **Files are DELETED when a session ends** — only active sessions have PID files
- Format: `{"pid":1960,"sessionId":"ed977c3d-...","cwd":"...","startedAt":1777792808958,"kind":"interactive","entrypoint":"cli"}`
- Only ~3 exist at any given time

### 2.4 Process Detection
- Claude CLI runs as `node.exe`, NOT `claude.exe`
- Must check CommandLine for `claude-code/cli.js`
- Use PowerShell: `Get-WmiObject Win32_Process` (NOT `tasklist` which fails in bash)
- Cross-check process creation time vs `startedAt` to handle PID reuse

### 2.5 Plugin Version Format
- Can be semver: `"5.0.7"`
- OR 12-char git SHA: `"a5bcdd7e58cd"`
- `gitCommitSha` field has the full 40-char SHA

### 2.6 PTY Limitation
- `tauri-plugin-shell` does NOT support PTY
- Need custom Rust plugin using `portable-pty` crate (or ConPTY on Windows)
- Tauri IPC bridges PTY to frontend: `pty-data`, `pty-input`, `pty-resize` events

### 2.7 Permission Modes (6 total)
`acceptEdits` | `auto` | `bypassPermissions` | `default` | `dontAsk` | `plan`

### 2.8 Dual-Write Safety
Before resuming a session, verify no PID file in `sessions/` references that sessionId.

### 2.9 Plugin Metadata Fallback
Some plugins (e.g., `document-skills`) have NO `plugin.json`. Must fall back to `marketplace.json`.

### 2.10 `tasklist` Fails in Bash
Must use `cmd.exe /c "tasklist ..."` or `powershell.exe -Command "..."` for process detection.

---

## 3. Session Data Model

### Sources

| Property | Source | Type | Notes |
|---|---|---|---|
| pid | `sessions/{pid}.json` (filename + field) | number | File only exists while alive |
| sessionId | `sessions/{pid}.json` | UUID string | Primary key for resume |
| cwd | `sessions/{pid}.json` | string (path) | Used for project grouping |
| startedAt | `sessions/{pid}.json` | number (unix ms) | |
| kind | `sessions/{pid}.json` | string | "interactive" or "print" |
| entrypoint | `sessions/{pid}.json` | string | "cli" \| "vscode" etc. |
| firstPrompt | JSONL parse (index is stale) | string | First user message |
| summary | JSONL summary type or index | string | AI-generated |
| messageCount | Computed from JSONL | number | Count user+assistant only |
| isSidechain | sessions-index.json | boolean | Sub-agent sessions, hide from main list |
| permissionMode | JSONL first "permission-mode" line | string | 6 values |
| model | JSONL assistant message → message.model | string | e.g. "claude-opus-4.6-1m" |
| version | JSONL any message → version field | string | CLI version e.g. "2.1.98" |
| gitBranch | JSONL any message → gitBranch | string | |
| slug | JSONL system messages | string | Auto-name, only in 9/20 sessions |
| toolsUsed | Computed from JSONL tool_use blocks | string[] | |
| duration | Computed: last - first timestamp | number (ms) | |
| displayName | App SQLite | string \| null | User-set label |
| tags | App SQLite | string[] | User-defined with colors |
| groupId | App SQLite | string \| null | User-assigned group |
| isPinned | App SQLite | boolean | Float to top |
| archivedAt | App SQLite | number \| null | Hidden when set |

### Session States

| State | Detection | Visual | Actions |
|---|---|---|---|
| **ALIVE** | PID file exists + node.exe with cli.js in cmdline | Green dot (pulse), green border | View Live, Resume in Terminal, Open CWD, Tag/Rename, Stop (SIGTERM, confirm) |
| **ENDED** | No PID file; JSONL exists | Gray dot | Resume (`claude --resume {id}`), Fork (`--fork-session`), View Conversation, Open CWD, Tag/Rename/Archive |
| **ORPHANED** | Index entry but no JSONL file | Yellow dot, italic | Resume (may work), Open CWD, Delete from list |
| **ARCHIVED** | archivedAt set in SQLite | Hidden by default | Unarchive, View Conversation, Delete |

### Session Views

1. **My View (default)** — User organizes by custom tags/groups, drag-and-drop, pinned items at top
2. **By Project** — Auto-grouped by CWD path, collapsible, count badges
3. **Timeline** — Chronological: Today, Yesterday, This Week, by month

### Data Discovery Strategy

1. Enumerate `~/.claude/projects/*/` directories
2. Glob `*.jsonl` files per project (each = one session)
3. Parse first ~10 lines for metadata (sessionId, permissionMode, model, version, gitBranch)
4. Cross-reference with `~/.claude/sessions/*.json` PID files for alive status
5. Use `sessions-index.json` as speed optimization only (cache hit for summary, firstPrompt)
6. Validate: if JSONL mtime > index mtime, re-parse
7. Store computed metadata in app SQLite for fast subsequent loads

### Terminal / Conversation View

- **App-started sessions:** Full xterm.js terminal via custom Rust PTY plugin
- **Alive external sessions:** Read-only JSONL tail with live updates. "Resume in Terminal" opens OS terminal
- **Ended sessions:** Read-only conversation viewer with virtual scrolling. Jump-to-date nav.
- **Large files:** Filter out progress lines (~80% of file). Parse first 50 msgs immediately, rest in Web Worker

---

## 4. Plugin Data Model

### Plugin Hierarchy

```
Plugin (e.g. superpowers@claude-plugins-official)
 ├── skills/          → SKILL.md with YAML frontmatter (name, description)
 ├── agents/          → .md with YAML frontmatter (name, description, tools, model, color)
 ├── hooks/           → hooks.json (SessionStart, PreToolUse events)
 ├── commands/        → deprecated, being replaced by skills
 └── CLAUDE.md        → loaded at session start
```

Custom skills (separate from plugins): `~/.claude/skills/` (8 found: ado-pr-review, connect-draft, copilot-issue-assign, copilot-pr-report, pr-build-report-analyzer, pr-review, run-learn-geneva-action, skill-creator)

### Key Files

| File | Purpose |
|---|---|
| `~/.claude/plugins/installed_plugins.json` | Plugin registry, keyed by `{name}@{marketplace}`, value is ARRAY of installations |
| `~/.claude/settings.json` → `enabledPlugins` | Enable/disable map (separate from installation) |
| `~/.claude/plugins/cache/*/install-counts-cache.json` | Download counts |
| `~/.claude/plugins/cache/*/blocklist.json` | Server-side blocklist |
| `~/.claude/plugins/cache/*/known_marketplaces.json` | Marketplace sources |

### Plugin States

| State | Condition | Visual |
|---|---|---|
| Active | installed + enabled + files exist | Green dot, toggle ON |
| Disabled | installed + enabledPlugins=false | Gray dot, toggle OFF, 70% opacity |
| Broken | installed + files missing at installPath | Red dot, warning. Reinstall/Remove |
| Orphaned | In enabledPlugins but NOT in installed_plugins | Yellow warning |
| Update Available | Local gitCommitSha != remote HEAD | Amber "Update" pill |

---

## 5. MCP Server Data Model

### Config Locations (CRITICAL)

| Scope | File | JSON Path |
|---|---|---|
| User | `~/.claude.json` | `$.mcpServers.<name>` |
| Local | `~/.claude.json` | `$.projects["<path>"].mcpServers.<name>` |
| Project | `<project-root>/.mcp.json` | Top-level or wrapped in `mcpServers` |

Precedence: project > local > user. Same name at multiple scopes → most specific wins (shadowed card dimmed with "Overridden" badge).

### Server Properties

| Property | Type | Notes |
|---|---|---|
| name | string | Config key, unique per scope |
| type | "stdio" \| "sse" \| "http" | |
| scope | "user" \| "local" \| "project" | |
| command | string (stdio) | "npx", "node", or full path |
| args | string[] (stdio) | |
| env | Record<string,string> (stdio) | Always {} even if empty |
| url | string (sse/http) | |
| headers | Record<string,string> (sse/http) | Can contain `${ENV_VAR}` placeholders |
| status | Computed via `claude mcp list` | Connected/Error/Disconnected |
| toolCount/tools[] | Runtime only | No CLI to list tools statically |

### Server States

| State | Dot | Actions |
|---|---|---|
| Connected | Green | Edit, Remove, Restart, View Tools, View Logs |
| Disconnected | Gray (hollow) | Edit, Remove, Connect, View Logs |
| Error | Red | Edit, Remove, Retry, View Logs (prominent) |
| Starting | Amber (pulse) | Cancel (if >10s) |

**WARNING:** `claude mcp list` and `get` actually SPAWN servers for health checks. Only use in trusted directories.

---

## 6. Dashboard

- **Stat cards:** Sessions: 31 | Messages: 18,760 | Longest: 923 msgs | Since: Feb 3
- **Activity chart:** Stacked area (Recharts), 7d/30d/90d/All toggle
- **Model donut:** opus-4.6: 184.7M tokens, sonnet-4-6: 587K, opus-4.5: 53K
- **Recent sessions:** Last 8, clickable
- **Quick actions:** New Session, Resume Latest, Open CWD, Rebuild Stats
- **System health:** MCP status, plugin count, API reachable, CLI version
- Data from `stats-cache.json` — has `costUSD`, `hourCounts` (GitHub-style heatmap), `dailyActivity`, `dailyModelTokens`

---

## 7. Settings

| Section | Source | Key Fields |
|---|---|---|
| General/API | settings.json (env), config.json | ANTHROPIC_BASE_URL, AUTH_TOKEN, MODEL, SMALL_FAST_MODEL, primaryApiKey |
| Permissions | settings.json + settings.local.json | permissions.allow (100+ patterns), skipDangerousModePermissionPrompt |
| Plugins | settings.json (enabledPlugins) | Toggle list |
| Environment | settings.json (env) | Key-value editor |
| Appearance | App SQLite (NOT Claude config) | Theme, font size, sidebar position, compact mode |
| Usage & Stats | stats-cache.json (read-only) | Model tokens, activity heatmap, export CSV/JSON |
| Advanced | All config files | Raw JSON editor (Monaco), config paths, debug info, reset |

Claude Code has ZERO theme settings. Appearance is purely the manager app's domain.

---

## 8. New Session Dialog

CLI flags mapped to UI:
- Working Directory → `--` (plus Browse, recent CWDs from history.jsonl)
- Session Name → `--name`
- Model → `--model` (aliases: "sonnet", "opus", or full names)
- Permission Mode → `--permission-mode` (6 options)
- Effort Level → `--effort` (low | medium | high | max)
- Initial Prompt → `-p` flag or stdin
- Tags → App-local (SQLite)
- Advanced (collapsed): `--fallback-model`, `--max-budget-usd`, `--add-dir`, `--worktree`, `--bare`
- Quick start: `Ctrl+Shift+N` starts with all defaults

---

## 9. First Launch Flow

1. **Prerequisites check:** CLI installed? Config dir exists? API key? API reachable?
2. **Auto-import:** Scan all projects, enumerate JSONL files, group by project, create SQLite entries. Progress bar.
3. **Tour (5 steps):** Spotlight overlay: Dashboard → Sessions → MCP → Quick Actions → Settings. Dismissible.

---

## 10. Data Refresh Strategy

| Data | Method | Interval |
|---|---|---|
| Session PID files | FS watch + PID liveness poll | Immediate + 5s visible / 30s background |
| Conversation JSONL | FS watch + incremental read (byte offset) | Immediate on change for viewed session |
| MCP status | `claude mcp list` poll | 15s visible / 60s background / 2s after action |
| Stats cache | Read on mount + window focus | Manual rebuild |
| Plugin updates | Git SHA comparison | Cached 1hr, manual check |

---

## 11. JSONL Message Types & Rendering

| Type | Render? | Treatment |
|---|---|---|
| user (string) | Yes | User bubble, left-aligned, blue-gray bg |
| user (tool_result) | Yes | Collapsible under preceding tool_use. Red border if is_error |
| assistant (text) | Yes | Markdown rendered (code, LaTeX, tables) |
| assistant (tool_use) | Yes | Tool call block. Name header + collapsible input/output |
| system (turn_duration) | Separator | "Turn N — Xms" centered |
| system (compact_boundary) | Divider | "--- Context compacted ---" muted |
| summary | Banner | "Session summary: {text}" |
| permission-mode | No | Metadata only |
| file-history-snapshot | No | Undo tracking only |
| progress | No | Ephemeral; ~80% of file lines |
| attachment | No* | *skill_listing and mcp_instructions may be badges |
| queue-operation | No | Internal |
| last-prompt | No | Cache |

---

## 12. V2 Candidates (Discovered Data Sources)

These were found during research but deferred from v1:
- `tasks/` — Per-session task lists with status, dependencies
- `plans/` — Markdown implementation plans
- `ide/*.lock` — Connected IDE instances
- `history.jsonl` — Full prompt history (searchable recall)
- `subagents/` — Sub-agent conversations per session
- `file-history/` — File modification tracking
- `debug/` — Debug logs (some 100MB+)
- `backups/` — Auto-backups of .claude.json

---

## 13. Key File Paths

```
~/.claude/                              # Claude Code config root
├── sessions/{pid}.json                 # Active session PID files (ephemeral)
├── projects/{encoded-path}/
│   ├── {sessionId}.jsonl               # Conversation logs
│   └── sessions-index.json             # STALE cache
├── plugins/
│   ├── installed_plugins.json          # Plugin registry
│   └── cache/{marketplace}/{version}/  # Plugin files
├── skills/                             # Custom skills (8 found)
├── settings.json                       # Permissions, env vars, plugin enablement
├── settings.local.json                 # Machine-specific overrides
├── config.json                         # API key
├── history.jsonl                       # Prompt history
├── stats-cache.json                    # Usage statistics
├── tasks/{sessionId}/                  # Task lists
├── plans/                              # Implementation plans
├── ide/{pid}.lock                      # IDE connections
├── debug/{sessionId}.txt               # Debug logs
├── file-history/{sessionId}/           # File backups
├── backups/                            # Config backups
└── .claude.json (in ~/)                # MCP server configs (NOT in ~/.claude/)
```

---

## 14. User Preferences (from conversation)

- Actions should say "Open in File Browser" (Windows Explorer) and "Open in VS Code" — NOT "Open in IDE" or "View in Browser"
- Active sessions should NOT show "Resume" button — they're already alive
- Sessions panel is in the sidebar (confirmed in main navigation discussion)
- Default session view is "My View" (user-organized by tags/groups); other views: By Project, Timeline
- Property correctness and behavior correctness are top priority
- UI/UX should follow best practices, not guesswork
- Research real interfaces and properties rather than guessing

---

## 15. Visual Design Document

All visual mockups are saved locally in the project (no server needed):

- **Standalone viewer (open in browser):** `claude-manager/docs/design-visuals/consolidated-design-standalone.html`
- **Raw content fragments (all 9 files from brainstorming):**
  - `consolidated-design.html` — full verified design (main reference)
  - `session-detail.html` / `session-detail-v2.html` — session detail iterations
  - `session-views.html` — My View / By Project / Timeline mockups
  - `plugin-detail.html` / `plugin-detail-combined.html` / `plugin-detail-v2.html` — plugin detail iterations
  - `mcp-servers.html` — MCP panel mockup
  - `nav-structure.html` — navigation/layout structure

To view: double-click `consolidated-design-standalone.html` in Explorer — it opens directly in a browser with dark theme styling.

Original brainstorming session source (may not persist): `C:\Users\lianli\.superpowers\brainstorm\398-1777793527\content\`

---

## 16. Brainstorming Workflow & Task Status

We are following the **superpowers:brainstorming** skill workflow. This is a rigid process that must be followed in order. Here is the full checklist with current status:

| # | Task | Status | Description |
|---|---|---|---|
| 2 | Explore project context | **COMPLETED** | Read files, docs, checked Claude Code data structures |
| 3 | Offer visual companion | **COMPLETED** | User accepted; companion served at http://localhost:62775 |
| 9 | Ask clarifying questions | **COMPLETED** | Covered: app layout, navigation, session views, actions, all 5 panels |
| 4 | Propose 2-3 approaches | **COMPLETED** | Presented options for layout, navigation, session management, terminal |
| 11 | Sessions component — deep design | **COMPLETED** | Proposer + verifier agents aligned on data model, states, views, terminal |
| 10 | Plugins component — deep design | **COMPLETED** | Proposer + verifier agents aligned on hierarchy, states, detail view |
| 12 | MCP Servers component — deep design | **COMPLETED** | Proposer + verifier agents aligned on config locations, states, panel layout |
| 13 | Dashboard + Settings + Others — deep design | **COMPLETED** | Proposer + verifier agents aligned on dashboard layout, settings sections, new session, first launch |
| 1 | Present design | **IN PROGRESS** | Consolidated all 8 agent findings into visual at localhost. User has NOT yet reviewed. |
| 7 | Write design doc | **PENDING** | Save formal spec to `docs/superpowers/specs/2026-05-03-claude-manager-design.md` and commit |
| 6 | Spec self-review | **PENDING** | Check for placeholders, contradictions, ambiguity, scope issues |
| 5 | User reviews written spec | **PENDING** | Ask user to review the final spec file before proceeding |
| 8 | Transition to implementation | **PENDING** | Invoke `writing-plans` skill to create detailed implementation plan |

### What the 8 agents did

We spawned **4 proposer + 4 verifier agents** (8 total) to deeply research each component:

1. **Sessions proposer + verifier** — Investigated PID files, JSONL format, session states, terminal options. Verifier caught: stale index, ephemeral PIDs, `node.exe` not `claude.exe`, slug only in 9/20 sessions.
2. **Plugins proposer + verifier** — Investigated installed_plugins.json, plugin hierarchy, skills/agents/hooks formats. Verifier caught: version can be git SHA, some plugins lack plugin.json, installations are arrays.
3. **MCP proposer + verifier** — Investigated server configs, scopes, CLI commands. Verifier caught: configs in `.claude.json` NOT `settings.json`, trust system, OAuth support.
4. **Dashboard/Settings/Others proposer + verifier** — Investigated stats-cache.json, settings files, new session CLI flags, first launch flow. Verifier caught: 6 permission modes, effort levels, additional data sources.

All findings were synthesized into the consolidated design HTML and the 10 critical corrections listed in Section 2 above.

### What needs to happen next (in order)

1. **User reviews consolidated design** at http://localhost:62775 (or reads DESIGN-CONTEXT.md)
2. **Write formal spec** to `docs/superpowers/specs/2026-05-03-claude-manager-design.md` and git commit
3. **Spec self-review** — scan for TBD/TODO, contradictions, ambiguity, scope issues
4. **User reviews written spec** — gate before implementation
5. **Invoke `writing-plans` skill** — creates detailed implementation plan (this is the ONLY skill invoked after brainstorming)

### Important workflow rules

- The brainstorming skill is **rigid** — follow exactly, don't skip steps
- **writing-plans** is the ONLY skill invoked after brainstorming (not frontend-design, not mcp-builder)
- Each section of the design was presented and discussed incrementally during brainstorming
- The user prefers consolidated review checkpoints over incremental reviews

---

## 17. Conversation Decisions Log

Key decisions made during the brainstorming conversation:

1. **Framework:** Tauri v2 (user had no preference, we recommended over Electron for performance)
2. **Layout:** Combination of icon sidebar rail + dashboard home with clickable items (user chose combo of options A+D)
3. **Session detail:** Combination of inline expand + side panel (user chose combo of B+C)
4. **Default session view:** "My View" (user-organized) with alternative views By Project and Timeline
5. **Terminal approach:** Full PTY for app-started sessions, JSONL tail for external, read-only viewer for ended
6. **Agent research:** User requested paired proposer+verifier agents (8 total) to reach alignment before presenting
7. **Review style:** User wants agents to align internally, then present consolidated results at single checkpoint
8. **Session resume:** `claude --resume {sessionId}` works for ended sessions. `claude --continue` resumes most recent. `--fork-session` creates a branch.
9. **Action labels:** "Open in File Browser" (not "Open in IDE"), "Open in VS Code" (not "View in Browser")
10. **Alive sessions:** Show "View Live" and "Resume in Terminal" — NOT "Resume" button
