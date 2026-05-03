# Claude Manager — Design Specification

> **Version:** 1.0  
> **Date:** 2026-05-03  
> **Status:** Approved for implementation planning  
> **Visual mockups:** `docs/design-visuals/` (17+ HTML files)

---

## 1. Overview

Claude Manager is a single-window desktop application for managing the Claude Code ecosystem. It provides a GUI for browsing sessions, managing plugins and custom skills, configuring MCP servers, viewing usage statistics, and launching new sessions — replacing the need to interact with the CLI for management tasks.

### 1.1 Target Users

Users who run Claude Code regularly and want visibility into their sessions, plugins, and configuration without navigating raw JSON files and CLI commands.

### 1.2 Non-Goals

- Not a replacement for the Claude Code CLI itself — the CLI remains the primary coding interface
- Not a code editor or IDE
- No cloud sync, accounts, or remote features
- V2 data sources (tasks/, plans/, ide/*.lock, history.jsonl, subagents/, file-history/, debug/, backups/) are deferred

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Desktop framework | Tauri v2 | Rust backend, Webview2 on Windows |
| Frontend | React 19 + TypeScript + Vite | |
| State management | Zustand | Lightweight, no boilerplate |
| Styling | Tailwind CSS v4 | CSS custom properties for theming |
| Charts | Recharts | Area, donut, heatmap |
| Terminal | xterm.js + custom Rust PTY plugin | `portable-pty` crate / ConPTY on Windows |
| Database | SQLite via `tauri-plugin-sql` | `%APPDATA%/claude-manager/db.sqlite` |
| File watching | `tauri-plugin-fs` watch() | Polling fallback for reliability |
| Markdown rendering | react-markdown + shiki + KaTeX | Syntax highlighting + math |
| Virtual scrolling | @tanstack/react-virtual | Large conversation performance |
| Single instance | tauri-plugin-single-instance | |
| Notifications | tauri-plugin-notification | Native OS notifications |

---

## 3. Application Layout

### 3.1 Window Structure

```
+--------+-----------------------------------------------------+
| ICON   |                                                     |
| RAIL   |              CONTENT AREA                           |
| (48px) |                                                     |
|        |                                                     |
| 🏠 Dash|   (varies by section — list+detail, full-page,     |
| 📋 Sess|    or modal overlays)                               |
| 🧩 Plug|                                                     |
| 📝 Skil|                                                     |
| 🔌 MCP |                                                     |
| ⚙️ Sett|                                                     |
+--------+-----------------------------------------------------+
```

- **Icon sidebar rail** (48px, fixed left): 6 navigation items — Dashboard, Sessions, Plugins, Skills, MCP Servers, Settings
- Active item: highlighted background with accent left border
- **Content area**: fills remaining space; layout depends on section
- Sections with list+detail views: Sessions, Plugins

### 3.2 Keyboard Navigation

| Shortcut | Action |
|---|---|
| Ctrl+1–6 | Navigate to section |
| Ctrl+K | Command palette |
| Ctrl+N | New Session dialog |
| Ctrl+Shift+N | Quick start session (all defaults) |
| Ctrl+, | Open Settings |

### 3.3 Command Palette (Ctrl+K)

Centered overlay (520px wide) with search input and grouped results:

- **Navigation**: Go to each section (Ctrl+1–6)
- **Sessions**: New Session, Quick Session, Resume Latest, Search Sessions
- **Actions**: Rebuild Stats, Check Plugin Updates, Export Stats, Open Config Directory

Each item shows keyboard shortcut badge where applicable. Arrow keys to navigate, Enter to select, Esc to close.

**Mockup:** `command-palette.html`

---

## 4. Dashboard

Full-page view with stat cards, charts, recent sessions, quick actions, and system health.

### 4.1 Layout

**Row 1 — Stat Cards** (4 cards):
- Sessions count (green accent)
- Total messages (blue accent)
- Longest session by message count (yellow accent)
- "Active since" date (mauve accent)

Data source: computed from SQLite session metadata.

**Row 2 — Charts** (60/40 split):
- Left: Activity stacked area chart (Recharts). Period toggle: 7d / 30d / 90d / All. Messages vs Tool Calls toggle.
- Right: Model usage donut chart (conic-gradient). Legend with token counts per model.

Data source: `stats-cache.json` — fields: `dailyActivity`, `dailyModelTokens`, `hourCounts`.

**Row 3 — Info** (60/40 split):
- Left: Recent sessions list (last 8). Status dot + name + time ago + message count. "View All Sessions" link.
- Right top: Quick actions — New Session (prominent), Resume Latest, Open CWD, Rebuild Stats.
- Right bottom: System health — MCP connection status, plugin count, API reachability, CLI version.

**Mockup:** `dashboard.html`

---

## 5. Sessions

### 5.1 Data Sources

Session metadata is assembled from multiple sources:

| Property | Source | Notes |
|---|---|---|
| pid, sessionId, cwd, startedAt, kind, entrypoint | `~/.claude/sessions/{pid}.json` | PID file only exists while session is alive |
| firstPrompt, summary | JSONL parse (index as fallback only) | `sessions-index.json` is stale — use as speed hint |
| messageCount, duration, toolsUsed | Computed from JSONL | Count user+assistant messages only |
| permissionMode | First "permission-mode" JSONL line | |
| model | Assistant message → `message.model` | |
| version | Any JSONL message → `version` field | CLI version |
| gitBranch | Any JSONL message → `gitBranch` field | |
| slug | System messages in JSONL | Only present in ~45% of sessions |
| isSidechain | `sessions-index.json` | Sub-agent sessions, hide from main list |
| displayName, tags, groupId, isPinned, archivedAt | App SQLite | User-managed metadata |

### 5.2 Data Discovery

1. Enumerate `~/.claude/projects/*/` directories
2. Glob `*.jsonl` files per project directory (each file = one session)
3. Parse first ~10 lines of each JSONL for metadata
4. Cross-reference with `~/.claude/sessions/*.json` PID files for alive status
5. Use `sessions-index.json` as cache hit optimization only (never trust as primary)
6. Validate: if JSONL mtime > index mtime, re-parse
7. Store computed metadata in app SQLite for fast subsequent loads

### 5.3 Session States

| State | Detection | Status Dot | Available Actions |
|---|---|---|---|
| ALIVE | PID file exists + `node.exe` with `cli.js` in command line | Green (pulsing) | View Live, Resume in Terminal, Open CWD, Open in VS Code, Tag/Rename, Stop (SIGTERM, confirm) |
| ENDED | No PID file; JSONL exists | Gray | Resume, Fork, View Conversation, Open CWD, Open in VS Code, Tag/Rename, Archive |
| ORPHANED | Index entry but no JSONL file | Yellow, italic | Resume (may work), Open CWD, Delete from list |
| ARCHIVED | `archivedAt` set in SQLite | Hidden by default | Unarchive, View Conversation, Delete |

### 5.3.1 CLI Commands for Session Actions

| Action | Command | Notes |
|---|---|---|
| Resume | `claude --resume <sessionId>` | Opens in OS terminal (cmd.exe or WT). Must verify no PID file references this sessionId first. |
| Fork | `claude --resume <sessionId> --fork-session` | Creates new session branching from ended conversation. |
| Stop | Send `SIGTERM` to PID from PID file | Sequence: SIGTERM → wait 5s → SIGKILL if still alive. Confirm with user before sending. |
| New Session | `claude [--cwd <dir>] [--model <m>] [--permission-mode <pm>] [-p "<prompt>"]` | See section 10 for full flag mapping. |

**Critical:** ALIVE sessions must NOT show a "Resume" button — they are already running. Show "View Live" and "Resume in Terminal" instead.

**Process detection:** Claude CLI runs as `node.exe`, not `claude.exe`. Must check CommandLine for `claude-code/cli.js`. Use PowerShell `Get-WmiObject Win32_Process` (not `tasklist` which fails in bash). Cross-check process creation time vs `startedAt` to handle PID reuse.

**Dual-write safety:** Before resuming a session, verify no PID file in `sessions/` references that sessionId.

### 5.4 Session Views

Three view modes with a toggle in the list sidebar:

1. **My View (default)** — User-organized groups with custom tags. Drag-and-drop ordering. Pinned items float to top. Groups are collapsible with count badges.
2. **By Project** — Auto-grouped by CWD path. Collapsible groups with session count badges.
3. **Timeline** — Chronological: Today, Yesterday, This Week, then by month.

All views share the same search bar (searches name, firstPrompt, tags).

### 5.5 Session List Panel

Left sidebar (260px) with:
- "+ New Session" button (prominent, accent color)
- View mode toggle (My View / Project / Timeline)
- Search bar
- Session cards: status dot + name + tag pills + time ago

### 5.6 Session Detail Panel

Right content area showing the selected session:
- Info bar: session name, status badges (state, entrypoint, model, message count), action buttons
- Content depends on session state (see 5.7)

### 5.7 Terminal and Conversation Views

| Session State | Content View |
|---|---|
| ALIVE (app-started) | Full xterm.js terminal via custom Rust PTY plugin. Interactive. |
| ALIVE (external) | Read-only JSONL tail with live updates via FS watch. "Resume in Terminal" opens OS terminal. |
| ENDED | Read-only conversation viewer with virtual scrolling and jump-to-turn navigation. |

**Large file handling:** Parse first 50 messages immediately, rest in Web Worker. Virtual scrolling with `@tanstack/react-virtual`. Note: no `progress` type exists in actual JSONL — noise reduction comes from skipping internal types (permission-mode, file-history-snapshot, queue-operation, last-prompt).

**Mockups:** `session-detail-v2.html`, `session-views.html`, `conversation-viewer.html`

### 5.8 Conversation Viewer Message Types

| JSONL Type | Render? | Treatment |
|---|---|---|
| user (string) | Yes | User bubble, blue-gray bg (#2a2b3d), "You" label |
| user (tool_result) | Yes | Collapsible under preceding tool_use. Red border if is_error |
| assistant (text) | Yes | Markdown rendered (code blocks via shiki, LaTeX via KaTeX, tables). "Claude" label + model badge |
| assistant (tool_use) | Yes | Tool call block: name header + collapsible input/output. Blue left border. |
| system (turn_duration) | Separator | "— Turn N — Xms —" centered with horizontal lines |
| system (compact_boundary) | Divider | "--- Context compacted ---" muted dashed border |
| summary | Banner | "Session summary: {text}" |
| permission-mode | No | Metadata only |
| file-history-snapshot | No | Internal |
| attachment | No | Internal. Deferred to V2. |
| queue-operation | No | Internal |
| last-prompt | No | Cache |

---

## 6. Plugins

### 6.1 Plugin Data Model

Plugins are installed via the CLI and managed through `installed_plugins.json`. Each plugin can contain skills, agents, hooks, and a CLAUDE.md.

```
Plugin (e.g. superpowers@claude-plugins-official)
 ├── skills/     → .md files with YAML frontmatter (name, description)
 ├── agents/     → .md files with YAML frontmatter (name, description, tools, model, color)
 ├── hooks/      → hooks.json (SessionStart, PreToolUse events)
 ├── commands/   → deprecated, being replaced by skills
 └── CLAUDE.md   → loaded at session start
```

### 6.2 Key Files

| File | Purpose |
|---|---|
| `~/.claude/plugins/installed_plugins.json` | Plugin registry. Keyed by `{name}@{marketplace}`, value is ARRAY of installations. |
| `~/.claude/settings.json` → `enabledPlugins` | Enable/disable map (separate from installation) |
| `~/.claude/plugins/cache/{marketplace}/{plugin-name}/{version}/` | Plugin files on disk (3-level nesting) |
| `install-counts-cache.json` | Download counts |
| `blocklist.json` | Server-side blocklist |
| `known_marketplaces.json` | Marketplace sources |

### 6.3 Plugin Version Format

Versions can be:
- Semver: `"5.0.7"`
- 12-char git SHA: `"a5bcdd7e58cd"`

The `gitCommitSha` field has the full 40-char SHA for update comparison.

### 6.4 Plugin States

| State | Condition | Visual |
|---|---|---|
| Active | Installed + enabled + files exist | Green dot, toggle ON |
| Disabled | Installed + `enabledPlugins=false` | Gray dot, toggle OFF, 70% opacity |
| Broken | Installed + files missing at installPath | Red dot, warning text. Reinstall/Remove buttons. |
| Orphaned | In `enabledPlugins` but NOT in `installed_plugins` | Yellow warning |
| Update Available | Local `gitCommitSha` != remote HEAD | Amber "Update" pill |

### 6.5 Plugin List View

Full-page card list with:
- Header: title, installed/active/disabled counts, [Install Plugin] button, search bar
- Plugin cards: status dot, name, marketplace source, description, version pill, component counts, enable/disable toggle
- Broken plugins show red border, warning text, Reinstall/Remove buttons

**Metadata fallback:** Some plugins (e.g., `document-skills`) have NO `plugin.json`. When present, `plugin.json` lives inside the `.claude-plugin/` subdirectory, not the plugin root. Fall back to `marketplace.json` for metadata.

### 6.6 Plugin Detail View

Accessed by clicking a plugin card. Shows:
- Plugin header: name, marketplace, version, status, actions (Open in File Browser, Open in VS Code)
- Tabbed content: Skills / Agents / Hooks
- Each tab shows a tree view of the plugin's file structure with expandable items
- Skill/agent items show name and description from YAML frontmatter

**Mockups:** `plugin-list.html`, `plugin-detail-v2.html`

---

## 7. Custom Skills

Standalone skills that are NOT bundled inside plugins. These live at `~/.claude/skills/` as **directories**, each containing a `SKILL.md` file with YAML frontmatter (`name`, `description`). They are loaded into every Claude Code session automatically.

### 7.1 Skills List View

Dedicated panel accessible from the sidebar rail (📝 icon).

- Header: title, skill count, path (`~/.claude/skills/`), [+ Create Skill] button, search bar
- Skill cards: 📝 icon, name, description, file path, actions (Open in VS Code, Open in File Browser)
- Info box at bottom explaining what custom skills are and linking to the Plugins panel for plugin-bundled skills

**Mockup:** `skills-list.html`

---

## 8. MCP Servers

### 8.1 Config Locations

MCP server configurations live in `~/.claude.json` (NOT `settings.json`).

| Scope | File | JSON Path |
|---|---|---|
| User | `~/.claude.json` | `$.mcpServers.<name>` |
| Local | `~/.claude.json` | `$.projects["<path>"].mcpServers.<name>` |
| Project | `<project-root>/.mcp.json` | Top-level or wrapped in `mcpServers` |

**Precedence:** project > local > user. Same name at multiple scopes: most specific wins. Shadowed server card is dimmed with "Overridden by [scope]" badge.

**Trust tracking:** `enabledMcpjsonServers` / `disabledMcpjsonServers` arrays per project entry in `~/.claude.json`.

### 8.2 Server Properties

| Property | Type | Notes |
|---|---|---|
| name | string | Config key, unique per scope |
| type | "stdio" \| "sse" \| "http" | |
| scope | "user" \| "local" \| "project" | |
| command | string | stdio servers only |
| args | string[] | stdio servers only |
| env | Record<string, string> | Always `{}` even if empty |
| url | string | sse/http servers only |
| headers | Record<string, string> | Can contain `${ENV_VAR}` placeholders |
| status | Computed | Via `claude mcp list` |
| toolCount / tools[] | Runtime only | No CLI to list tools statically |

### 8.3 Server States

| State | Dot Color | Actions |
|---|---|---|
| Connected | Green | Edit, Remove, Restart, View Tools, View Logs |
| Disconnected | Gray (hollow) | Edit, Remove, Connect, View Logs |
| Error | Red | Edit, Remove, Retry, View Logs (prominent) |
| Starting | Amber (pulsing) | Cancel (if >10s) |

**Warning:** `claude mcp list` and `claude mcp get` actually SPAWN servers for health checks. Only invoke in trusted directories.

### 8.4 MCP Panel Layout

Full-page view grouped by scope:
- Scope headers: "User Scope (available in all projects)", "Local Scope (private to current project)", "Project Scope"
- Server cards: status dot, name, connection status pill, type pill, scope pill, actions (Edit, Remove)
- Expanded card shows: command, args, env vars, tools list
- [+ Add Server] button and [Refresh Status] button in header

**Mockup:** `mcp-servers.html`

---

## 9. Settings

### 9.1 Layout

Two-column layout:
- Left sidebar (200px): 7 section links with active indicator
- Right content: Section-specific form

### 9.2 Sections

| Section | Source File(s) | Contents |
|---|---|---|
| General / API | `settings.json` (env), `config.json` | API base URL, auth token (masked with reveal toggle), default model dropdown, small/fast model, primary API key |
| Permissions | `settings.json` + `settings.local.json` | `permissions.allow` list (100+ patterns), `skipDangerousModePermissionPrompt` (red warning if true) |
| Plugins | `settings.json` (`enabledPlugins`) | Toggle list linking to Plugins panel |
| Environment | `settings.json` (env) | Key-value editor for environment variables |
| Appearance | App SQLite only | Theme (Light/Dark/System), terminal font size/family, sidebar position, compact mode. Claude Code has ZERO theme settings — this is app-only. |
| Usage & Stats | `stats-cache.json` (read-only) | Model token table, activity heatmap, export CSV/JSON |
| Advanced | All config files | Raw JSON editor (Monaco), config file paths with "Open in File Browser", debug info, reset app data |

`settings.local.json` contains machine-specific overrides (mainly permissions), merged with `settings.json`.

**Mockup:** `settings.html`

---

## 10. New Session Dialog

Modal dialog (500px wide) for configuring and launching a new Claude Code session.

### 10.1 Form Fields

| Field | CLI Flag | Control | Notes |
|---|---|---|---|
| Working Directory | `--cwd` | Text input + Browse button | Recent CWDs from `history.jsonl` dropdown |
| Session Name | `--name` | Text input | Optional |
| Model | `--model` | Dropdown | Supports aliases: "sonnet", "opus", or full names |
| Permission Mode | `--permission-mode` | Radio group (2×3) | 6 options: default, auto, plan, acceptEdits, dontAsk, bypassPermissions. `bypassPermissions` has red tint. |
| Effort Level | `--effort` | Dropdown | low / medium / high / max |
| Initial Prompt | `-p` | Textarea (3 rows) | Optional |
| Tags | App-local | Tag pills with [+ New] | Stored in SQLite only |

### 10.2 Advanced Options (collapsed)

`--fallback-model`, `--max-budget-usd`, `--add-dir`, `--worktree`, `--bare`

### 10.3 Actions

- **Start Session**: launches `claude` with mapped flags, opens in embedded terminal
- **Cancel**: closes dialog
- **Quick start** (Ctrl+Shift+N): bypasses dialog, uses all defaults

**Mockup:** `new-session-dialog.html`

---

## 11. First Launch Flow

### 11.1 Step 1 — Prerequisites Check

Centered card checking:
- Claude Code CLI installed (`which claude`)
- Config directory exists (`~/.claude/`)
- API key configured (`config.json` → `primaryApiKey`)
- API reachable (HEAD request to ANTHROPIC_BASE_URL — non-blocking)

Each check shows green checkmark or yellow spinner. Continue button disabled until all pass. Skip link available.

### 11.2 Step 2 — Auto-Import

Scans all `~/.claude/projects/*/` directories, enumerates JSONL files, groups by project, creates SQLite entries. Shows:
- Progress bar with percentage
- Discovery stats: projects found, sessions found, messages indexed
- Log-style list of projects being imported

### 11.3 Step 3 — Tour (5 steps)

Spotlight overlay highlighting each section in sequence:
1. Dashboard
2. Sessions
3. MCP Servers
4. Quick Actions
5. Settings

Each step: spotlight ring on target, tooltip with title + description + step counter. Dismissible. "Replay Tour" available in Settings > Advanced.

**Mockup:** `first-launch.html`

---

## 12. Theme System

Two themes with CSS custom properties:

| Property | Light | Dark |
|---|---|---|
| bg-primary | #ffffff | #0f0f1a |
| bg-secondary | #f8f9fa | #1a1a2e |
| text-primary | #1a1a2e | #e8e8f0 |
| accent | #7C3AED | #8B5CF6 |
| border | #e5e7eb | #2d2d4a |

- System mode follows `prefers-color-scheme`
- 150ms CSS transition on theme switch
- Terminal theme can be overridden independently
- Stored in app SQLite (Appearance settings)

---

## 13. Data Refresh Strategy

| Data | Method | Refresh Interval |
|---|---|---|
| Session PID files | FS watch on `sessions/` dir + PID liveness poll | Watch: immediate. Liveness: 5s (visible), 30s (background) |
| Conversation JSONL | FS watch + incremental read (byte offset tracking) | Immediate on change for viewed session |
| MCP server status | `claude mcp list` poll | 15s (panel visible), 60s (background), 2s (after action) |
| Stats cache | Read on mount + window focus | Manual rebuild via Quick Action |
| Plugin updates | Git SHA comparison on panel open | Cached 1hr. Manual "Check for updates" button. |

---

## 14. PTY Plugin Architecture

`tauri-plugin-shell` does NOT support PTY. A custom Rust plugin is required.

### 14.1 Implementation

- Rust side: `portable-pty` crate (ConPTY on Windows)
- Tauri IPC events: `pty-data` (output), `pty-input` (keystrokes), `pty-resize` (terminal dimensions)
- Frontend: xterm.js connects via these IPC events
- One PTY per app-started session
- Lifecycle: created on "Start Session", destroyed on session end or app close

---

## 15. SQLite Schema

App-local database at `%APPDATA%/claude-manager/db.sqlite`.

### 15.1 Tables

**sessions**
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  display_name TEXT,
  tags TEXT,           -- JSON array
  group_id TEXT,
  is_pinned INTEGER DEFAULT 0,
  archived_at INTEGER,
  sort_order INTEGER,
  cwd TEXT,
  first_prompt TEXT,
  summary TEXT,
  message_count INTEGER,
  model TEXT,
  version TEXT,
  permission_mode TEXT,
  git_branch TEXT,
  started_at INTEGER,
  duration_ms INTEGER,
  entrypoint TEXT,
  kind TEXT,
  last_synced_at INTEGER
);
```

**tags**
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL
);
```

**groups**
```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER
);
```

**app_settings**
```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT  -- JSON
);
```

---

## 16. Key File Paths

```
~/.claude/                              # Claude Code config root
├── sessions/{pid}.json                 # Active session PID files (ephemeral)
├── projects/{encoded-path}/
│   ├── {sessionId}.jsonl               # Conversation logs
│   └── sessions-index.json             # STALE cache — speed hint only
├── plugins/
│   ├── installed_plugins.json          # Plugin registry
│   └── cache/{marketplace}/{plugin-name}/{version}/  # Plugin files
├── skills/                             # Custom standalone skills (directories with SKILL.md)
├── settings.json                       # Permissions, env vars, plugin enablement
├── settings.local.json                 # Machine-specific overrides
├── config.json                         # API key
├── stats-cache.json                    # Usage statistics
└── .claude.json (in ~/, NOT ~/.claude/)# Primary config: MCP servers, project settings, trust lists
```

---

## 17. Critical Implementation Notes

These were discovered by 8 paired research agents and must not be deviated from:

1. **MCP configs are in `~/.claude.json`**, not `settings.json`
2. **`sessions-index.json` is stale** — 17/20 JSONL files missing from index, 12 entries point to missing files. Use as speed hint only.
3. **PID files are ephemeral** — deleted when session ends. Typically ~6 exist at any time (varies by user activity).
4. **Claude CLI runs as `node.exe`** — check CommandLine for `claude-code/cli.js`, not process name.
5. **Plugin versions can be git SHAs** — not always semver.
6. **`tauri-plugin-shell` has no PTY support** — custom Rust plugin required.
7. **6 permission modes**: acceptEdits, auto, bypassPermissions, default, dontAsk, plan.
8. **Dual-write safety**: verify no PID file references a sessionId before resuming.
9. **Some plugins lack `plugin.json`** — fall back to `marketplace.json`.
10. **`tasklist` fails in bash** — use `cmd.exe /c "tasklist ..."` or `powershell.exe -Command "..."`.

---

## 17.5 Error Handling

| Scenario | Behavior |
|---|---|
| Claude CLI not found (`which claude` fails) | First Launch: block at prerequisites. Normal: banner at top "Claude CLI not found — Install instructions" with link. |
| API key missing / invalid | Settings > General shows red indicator. Dashboard system health shows "API: Not configured". |
| Corrupted JSONL (malformed JSON line) | Skip the malformed line, log warning. Show session with partial data + "⚠ N lines could not be parsed" note in conversation viewer. |
| Dead CWD (directory no longer exists) | Session card shows ⚠ icon. "Open CWD" and "Open in VS Code" buttons disabled with tooltip "Directory not found". Resume still allowed (Claude CLI handles missing CWDs). |
| JSONL file missing (index references it) | Mark session as ORPHANED state. |
| MCP server spawn fails | Red dot, "Error" status pill, expand card to show error message. "Retry" button prominent. |
| SQLite open/write fails | Fatal: show error dialog with "Reset Database" and "Open Data Directory" buttons. |
| Single-instance collision | `tauri-plugin-single-instance` handles this: focus existing window. If the existing window is unresponsive (>3s), offer "Force launch new instance" option. |

## 17.6 Loading & Empty States

| Panel | Loading State | Empty State |
|---|---|---|
| Dashboard | Skeleton cards (pulsing gray rectangles) for stat cards and charts | "No sessions found. Start your first session to see stats here." + New Session button |
| Session list | 4 skeleton cards in sidebar | "No sessions found" with illustration + "New Session" CTA |
| Conversation viewer | Centered spinner with "Loading conversation…" | "Select a session to view its conversation" |
| Plugin list | 3 skeleton cards | "No plugins installed. Use `claude plugins install <name>` to add plugins." |
| Skills list | 2 skeleton cards | "No custom skills found at `~/.claude/skills/`. Create a skill directory with a SKILL.md file to get started." |
| MCP Servers | 2 skeleton cards per scope group | "No MCP servers configured. Add one to extend Claude's capabilities." + [+ Add Server] button |
| Settings | Skeleton form fields | n/a (forms always have defaults) |

## 17.7 Search Behavior

All search bars share the same behavior:

- **Matching:** Case-insensitive substring match across searchable fields
- **Debounce:** 200ms after last keystroke before filtering
- **Highlight:** Matching text segments highlighted with accent background (`bg-accent/20`)
- **Scope per panel:**
  - Sessions: searches `displayName`, `firstPrompt`, `tags`, `cwd`
  - Plugins: searches `name`, `description`, `marketplace`
  - Skills: searches `name`, `description`
  - MCP Servers: searches `name`, `command`, `args`
  - Command palette: searches action `label`
- **Empty results:** "No results for '{query}'" with suggestion to clear filters

## 17.8 Performance Bounds

| Operation | Target | Notes |
|---|---|---|
| Initial cold start (first launch import) | <30s for 500 sessions | Parse first ~10 JSONL lines each, batch SQLite inserts |
| Warm start (subsequent launches) | <2s to interactive | Load from SQLite, check for new JSONL files only |
| Session list render | <100ms for 200 items | Virtual scrolling if >50 items |
| Conversation viewer open | <500ms for 5000-line JSONL | Parse first 50 messages sync, rest in Web Worker |
| Search filter | <50ms after debounce | In-memory filter on loaded data |

## 17.9 SQLite Migrations

Schema versioning via `app_settings` table:
- Key: `schema_version`, value: integer starting at `1`
- On app start, check current version vs expected version
- Run migration functions sequentially: `migrate_1_to_2()`, `migrate_2_to_3()`, etc.
- Each migration wrapped in a transaction — rollback on failure
- If migration fails: show error dialog, do not start app with mismatched schema

## 17.10 MCP Add/Edit Form Fields

The "Add Server" and "Edit" dialogs share the same form:

| Field | Control | Validation |
|---|---|---|
| Name | Text input | Required, unique within scope, alphanumeric + hyphens |
| Scope | Radio: User / Local | Required |
| Type | Radio: stdio / sse / http | Required, changes form fields below |
| Command (stdio) | Text input | Required for stdio |
| Args (stdio) | Tag-style multi-input | Optional |
| URL (sse/http) | Text input | Required for sse/http, must be valid URL |
| Headers (sse/http) | Key-value pair editor | Optional, supports `${ENV_VAR}` syntax |
| Env | Key-value pair editor | Optional |

Save action writes to `~/.claude.json` at the appropriate JSON path based on scope.

## 17.11 JSONL Concurrent Access

JSONL files are written by Claude CLI processes and read by Claude Manager simultaneously:

- **Read strategy:** Incremental read with byte offset tracking. On FS watch trigger, seek to last known offset and read new bytes.
- **Partial line handling:** If the last read chunk doesn't end with `\n`, buffer the partial line and retry on next trigger.
- **File truncation:** If file size < last offset, reset offset to 0 and re-parse (file was replaced, not appended).
- **Lock-free:** Never acquire locks on JSONL files — Claude CLI owns write access.
---

## 18. Visual Mockups Index

All mockups are in `docs/design-visuals/` and can be opened directly in a browser:

| Component | File |
|---|---|
| Dashboard | `dashboard.html` |
| Session list (3 views) | `session-views.html` |
| Session detail | `session-detail-v2.html` |
| Conversation viewer | `conversation-viewer.html` |
| Plugin list | `plugin-list.html` |
| Plugin detail | `plugin-detail-v2.html` |
| Skills list | `skills-list.html` |
| MCP Servers | `mcp-servers.html` |
| Settings | `settings.html` |
| New Session Dialog | `new-session-dialog.html` |
| First Launch Flow | `first-launch.html` |
| Command Palette | `command-palette.html` |
| Navigation/Layout | `nav-structure.html` |
