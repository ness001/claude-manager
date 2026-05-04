# Phase 3: Plugins, Skills & MCP Servers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Plugins list/detail views, Custom Skills list, and MCP Servers management panel — the three configuration/management sections of the app.

**Architecture:** All three sections read from Claude Code's config files on disk (not SQLite). Plugins read from `installed_plugins.json` + `settings.json`. Skills scan `~/.claude/skills/` directories. MCP servers read from `~/.claude.json` (user + local scopes) AND `<project-root>/.mcp.json` (project scope). Rust backend provides file reading; frontend does the parsing and state management. MCP server add/edit writes back to `~/.claude.json`.

**Tech Stack:** Tauri v2 IPC commands, tauri-plugin-fs (read/write/watch), Zustand, Tailwind CSS v4

**Prerequisites:** Phase 1 complete (app shell, navigation), Phase 2 complete (session types pattern to follow).

---

## File Structure

```
src-tauri/src/
├── plugins/
│   ├── mod.rs                        # Module declarations
│   └── commands.rs                   # IPC: read plugin registry, read plugin files, read settings
├── skills/
│   ├── mod.rs
│   └── commands.rs                   # IPC: scan skill directories, read SKILL.md frontmatter
├── mcp/
│   ├── mod.rs
│   └── commands.rs                   # IPC: read/write ~/.claude.json MCP config, run `claude mcp list`
src/
├── lib/
│   ├── plugin-types.ts               # PluginMeta, PluginState, PluginDetail, SkillInfo, AgentInfo, HookInfo
│   ├── skill-types.ts                # CustomSkill type
│   ├── mcp-types.ts                  # McpServer, McpServerState, McpScope, McpServerType
│   ├── plugin-loader.ts              # Load & merge installed_plugins.json + settings.json + file system checks
│   ├── skill-loader.ts               # Scan ~/.claude/skills/ directories, parse SKILL.md frontmatter
│   └── mcp-loader.ts                 # Load ~/.claude.json, extract MCP servers by scope, run status checks
├── stores/
│   ├── plugin-store.ts               # Plugin list state, selection, search, enable/disable toggle
│   ├── skill-store.ts                # Skill list state, search
│   └── mcp-store.ts                  # MCP server list by scope, add/edit/remove state, status refresh
├── components/
│   ├── plugins/
│   │   ├── PluginListView.tsx        # Full-page plugin card list with header, counts, search
│   │   ├── PluginCard.tsx            # Status dot, name, marketplace, description, version, toggle
│   │   ├── PluginDetailView.tsx      # Plugin detail: header + tabbed content (Skills/Agents/Hooks)
│   │   ├── PluginSkillsTab.tsx       # Tree view of plugin's skills with name/description
│   │   ├── PluginAgentsTab.tsx       # Tree view of plugin's agents with name/description
│   │   └── PluginHooksTab.tsx        # hooks.json content display
│   ├── skills/
│   │   ├── SkillsListView.tsx        # Full-page skill card list with header, search
│   │   └── SkillCard.tsx             # Skill name, description, file path, actions
│   └── mcp/
│       ├── McpPanel.tsx              # Full-page MCP view grouped by scope
│       ├── McpServerCard.tsx         # Status dot, name, type pill, scope pill, expand/collapse
│       ├── McpServerDetail.tsx       # Expanded: command, args, env, tools list
│       └── McpServerForm.tsx         # Add/Edit dialog: name, scope, type, command/URL, args, env, headers
├── sections/
│   ├── PluginsSection.tsx            # Replace placeholder — PluginListView or PluginDetailView
│   ├── SkillsSection.tsx             # Replace placeholder — SkillsListView
│   └── McpSection.tsx                # Replace placeholder — McpPanel
tests/
├── lib/
│   ├── plugin-loader.test.ts
│   ├── skill-loader.test.ts
│   └── mcp-loader.test.ts
└── stores/
    ├── plugin-store.test.ts
    └── mcp-store.test.ts
```

---

### Task 1: Plugin Types

**Files:**
- Create: `src/lib/plugin-types.ts`

- [ ] **Step 1: Define plugin types**

`PluginMeta`: name, marketplace, version (string — can be semver or 12-char git SHA per spec §6.3), gitCommitSha (40-char), description, installPath, state (PluginState), skillCount, agentCount, hookCount, hasClaudeMd.

`PluginState = "active" | "disabled" | "broken" | "orphaned" | "update-available"` per spec §6.4.

`PluginDetail`: extends PluginMeta with `skills: SkillInfo[]`, `agents: AgentInfo[]`, `hooks: HookInfo[]`.

`SkillInfo`: name, description (from YAML frontmatter in .md files under `skills/`).

`AgentInfo`: name, description, tools, model, color (from YAML frontmatter in .md files under `agents/`).

`HookInfo`: event (e.g., "SessionStart", "PreToolUse"), command, from `hooks.json`.

- [ ] **Step 2: Commit**

`git commit -m "feat: add plugin type definitions"`

---

### Task 2: Plugin Loader

**Files:**
- Create: `src/lib/plugin-loader.ts`
- Create: `tests/lib/plugin-loader.test.ts`
- Create: `src-tauri/src/plugins/mod.rs`, `src-tauri/src/plugins/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

- [ ] **Step 1: Write failing tests**

Test: merges installed_plugins.json + settings.json enabledPlugins into PluginMeta list. Detects broken state (installPath missing). Detects orphaned state (in enabledPlugins but not in installed_plugins). Correctly determines active vs disabled.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement Rust commands**

`read_installed_plugins()`: Read `~/.claude/plugins/installed_plugins.json`, return as String.

`read_settings_enabled_plugins()`: Read `~/.claude/settings.json`, extract `enabledPlugins` map.

`read_plugin_contents(install_path: String)`: Read a specific plugin's directory structure — enumerate `skills/`, `agents/`, `hooks/`, check for `CLAUDE.md`. For skill/agent .md files, read first few lines to extract YAML frontmatter (name, description).

**Metadata fallback (spec §6.5):** Some plugins have no `plugin.json`. When present, `plugin.json` lives inside `.claude-plugin/` subdirectory, not plugin root. Fall back to `marketplace.json` for metadata.

- [ ] **Step 4: Implement frontend plugin-loader.ts**

`loadPlugins()`:
1. Read installed_plugins.json (keyed by `{name}@{marketplace}`, value is ARRAY of installations — each array entry is a separate installation). Iterate each array entry to produce a separate `PluginMeta` per installation.
2. Read settings.json for enabledPlugins map
3. For each plugin installation, determine state: check if files exist at installPath (via Tauri fs `exists()`), check if enabled in settings. Map to PluginState.
4. Return `PluginMeta[]` sorted by name

`loadPluginDetail(plugin: PluginMeta)`:
1. Call Rust command to read plugin directory contents
2. Parse skill/agent frontmatter, hooks.json, CLAUDE.md existence
3. Return `PluginDetail`

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

`git commit -m "feat: add plugin loader with state detection"`

---

### Task 3: Plugin Store

**Files:**
- Create: `src/stores/plugin-store.ts`
- Create: `tests/stores/plugin-store.test.ts`

- [ ] **Step 1: Write failing tests**

Test: loads plugins, selects a plugin, search filters by name/description/marketplace, toggle enable/disable updates settings.json.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement plugin store**

State: `plugins: PluginMeta[]`, `selectedPlugin: PluginDetail | null`, `searchQuery: string`, `isLoading: boolean`.

Actions: `loadPlugins()`, `selectPlugin(name)` (loads detail), `setSearchQuery(q)`, `togglePlugin(name)` (flip enabled state, write to settings.json via Rust command).

Computed: `filteredPlugins()` — filter by search query matching name, description, marketplace (per spec §17.7).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

`git commit -m "feat: add plugin Zustand store"`

---

### Task 4: Plugin UI Components

**Files:**
- Create: all files under `src/components/plugins/`

- [ ] **Step 1: Implement PluginCard**

Card showing: status dot (colored per state §6.4), plugin name, marketplace source, description (truncated), version pill, component counts (N skills, N agents), enable/disable toggle switch. Broken plugins: red border + warning text + Reinstall/Remove buttons. Disabled plugins: 70% opacity.

- [ ] **Step 2: Implement PluginListView**

Header: "Plugins" title + stats (N installed, N active, N disabled) + [Install Plugin] button (opens terminal command hint) + [Check for Updates] button + search bar. Body: grid/list of PluginCards. Empty state per spec §17.6: "No plugins installed. Use `claude plugins install <name>` to add plugins."

**Update detection (spec §13):** "Check for Updates" compares local `gitCommitSha` against remote HEAD via `git ls-remote`. Cache result for 1hr. Mark plugins with mismatched SHAs as `update-available` state.

- [ ] **Step 3: Implement PluginDetailView**

Header: name, marketplace, version, status, action buttons (Open in File Browser, Open in VS Code — use `shell.open()` from Tauri). Tabbed content: Skills / Agents / Hooks tabs.

- [ ] **Step 4: Implement tab components**

`PluginSkillsTab`: List of skills with name + description from frontmatter.
`PluginAgentsTab`: List of agents with name + description + model + tools.
`PluginHooksTab`: Display hooks.json entries — event name + command.

- [ ] **Step 5: Commit**

`git commit -m "feat: add plugin list and detail UI components"`

---

### Task 5: Plugins Section Wiring

**Files:**
- Modify: `src/sections/PluginsSection.tsx`

- [ ] **Step 1: Wire up PluginsSection**

If no plugin selected → show PluginListView. If plugin selected → show PluginDetailView with back button. Load plugins on mount. Handle loading / empty states.

- [ ] **Step 2: Commit**

`git commit -m "feat: wire up Plugins section"`

---

### Task 6: Custom Skills Types & Loader

**Files:**
- Create: `src/lib/skill-types.ts`
- Create: `src/lib/skill-loader.ts`
- Create: `tests/lib/skill-loader.test.ts`
- Create: `src-tauri/src/skills/mod.rs`, `src-tauri/src/skills/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define types**

`CustomSkill`: name, description, dirPath, skillMdPath. Per spec §7: skills live at `~/.claude/skills/` as directories, each containing `SKILL.md` with YAML frontmatter.

- [ ] **Step 2: Write failing tests**

Test: scans directory structure, parses SKILL.md frontmatter, handles missing/malformed files.

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Implement Rust command**

`scan_custom_skills()`: Enumerate `~/.claude/skills/` subdirectories. For each, check if `SKILL.md` exists, read and extract YAML frontmatter (name, description). Return list.

- [ ] **Step 5: Implement frontend skill-loader.ts**

`loadCustomSkills()`: Call Rust command, map to `CustomSkill[]`.

- [ ] **Step 6: Run tests — expect PASS**

- [ ] **Step 7: Commit**

`git commit -m "feat: add custom skills scanner"`

---

### Task 7: Skills Store & UI

**Files:**
- Create: `src/stores/skill-store.ts`
- Create: `src/components/skills/SkillsListView.tsx`, `src/components/skills/SkillCard.tsx`
- Modify: `src/sections/SkillsSection.tsx`

- [ ] **Step 1: Implement skill store**

State: `skills: CustomSkill[]`, `searchQuery: string`, `isLoading: boolean`.
Actions: `loadSkills()`, `setSearchQuery(q)`.

- [ ] **Step 2: Implement SkillCard**

Card: skill name, description, file path, actions (Open in VS Code, Open in File Browser).

- [ ] **Step 3: Implement SkillsListView**

Header: "Custom Skills" title + skill count + path (`~/.claude/skills/`) + [+ Create Skill] button (opens file browser to create directory) + search bar. Body: list of SkillCards. Info box at bottom explaining custom skills and linking to Plugins panel for plugin-bundled skills. Empty state per spec §17.6.

- [ ] **Step 4: Wire up SkillsSection**

Replace placeholder with SkillsListView. Load skills on mount.

- [ ] **Step 5: Commit**

`git commit -m "feat: add Skills list view"`

---

### Task 8: MCP Types

**Files:**
- Create: `src/lib/mcp-types.ts`

- [ ] **Step 1: Define MCP types**

`McpScope = "user" | "local" | "project"`.
`McpServerType = "stdio" | "sse" | "http"`.
`McpServerState = "connected" | "disconnected" | "error" | "starting"`.

`McpServer`: name, type, scope, status (McpServerState), command (stdio), args (stdio), env, url (sse/http), headers (sse/http), toolCount, tools, isOverridden, overriddenBy (scope name if shadowed).

Per spec §8.1: configs are in `~/.claude.json` (NOT settings.json). Three scopes with precedence: project > local > user. Same name at multiple scopes → most specific wins, shadowed server is dimmed.

**Trust tracking (spec §8.1):** `~/.claude.json` has `enabledMcpjsonServers` and `disabledMcpjsonServers` arrays per project entry. These determine whether `.mcp.json` project-scope servers are trusted. The McpServer type must include `isTrusted: boolean | undefined` (only applicable to project-scope servers).

- [ ] **Step 2: Commit**

`git commit -m "feat: add MCP server type definitions"`

---

### Task 9: MCP Loader

**Files:**
- Create: `src/lib/mcp-loader.ts`
- Create: `tests/lib/mcp-loader.test.ts`
- Create: `src-tauri/src/mcp/mod.rs`, `src-tauri/src/mcp/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests**

Test: parses user-scope servers from `~/.claude.json` → `$.mcpServers`, local-scope from `$.projects["path"].mcpServers`, detects shadowing when same name exists at multiple scopes.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement Rust commands**

`read_claude_json()`: Read `~/.claude.json`, return as String.

`read_mcp_json(project_root: String)`: Read `<project_root>/.mcp.json` for project-scope MCP servers. Return as String (empty if file doesn't exist).

`write_mcp_server(scope, name, config_json, cwd)`: Write an MCP server config to `~/.claude.json` at the appropriate JSON path based on scope (user: `$.mcpServers.{name}`, local: `$.projects["{cwd}"].mcpServers.{name}`). Read-modify-write with proper JSON merging. **Critical:** Use atomic write-to-temp-then-rename to prevent corruption. The `cwd` param is required for local scope — determined by the currently viewed project path from the session store or a project path picker in the form.

`remove_mcp_server(scope, name)`: Remove server from `~/.claude.json` at the appropriate path.

`check_mcp_status()`: Run `claude mcp list` and parse output for connection status. **Warning per spec §8.3:** This actually spawns servers for health checks. Use timeout. Only invoke when panel is visible.

- [ ] **Step 4: Implement frontend mcp-loader.ts**

`loadMcpServers()`:
1. Read `~/.claude.json`
2. Extract user-scope servers from `mcpServers`
3. Extract local-scope servers from `projects.*.mcpServers`
4. **Read `.mcp.json` from known project roots** (from session store's known CWDs) for project-scope servers. Cross-reference with `enabledMcpjsonServers`/`disabledMcpjsonServers` in `~/.claude.json` to determine trust status.
5. Merge with precedence resolution (project > local > user). Mark shadowed servers (`isOverridden`, `overriddenBy`).
6. Optionally check status via `check_mcp_status()`

`saveMcpServer(server: McpServer)`: Call Rust write command.
`deleteMcpServer(scope, name)`: Call Rust remove command.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

`git commit -m "feat: add MCP server loader with scope resolution"`

---

### Task 10: MCP Store

**Files:**
- Create: `src/stores/mcp-store.ts`
- Create: `tests/stores/mcp-store.test.ts`

- [ ] **Step 1: Write failing tests**

Test: loads servers grouped by scope, adds a server, removes a server, refreshes status.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement MCP store**

State: `servers: McpServer[]`, `searchQuery: string`, `isLoading: boolean`, `editingServer: McpServer | null` (for form dialog).

Actions: `loadServers()`, `addServer(server)`, `updateServer(server)`, `removeServer(scope, name)`, `refreshStatus()`, `restartServer(name)`, `connectServer(name)`, `setSearchQuery(q)`, `startEditing(server)`, `stopEditing()`.

Computed: `serversByScope()` — group into user/local/project arrays.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

`git commit -m "feat: add MCP Zustand store"`

---

### Task 11: MCP UI Components

**Files:**
- Create: all files under `src/components/mcp/`

- [ ] **Step 1: Implement McpServerCard**

Card: status dot (green=connected, gray hollow=disconnected, red=error, amber pulsing=starting per spec §8.3). Name, type pill (stdio/sse/http), scope pill (user/local/project). Expand/collapse toggle. Actions vary by connection state per spec §8.3:
- Connected: Restart, View Tools, View Logs, Edit, Remove
- Disconnected: Connect, View Logs, Edit, Remove
- Error: Retry, View Logs (prominent), Edit, Remove
- Starting: Cancel (if >10s), View Logs

Remove requires confirmation dialog. Shadowed servers are dimmed with "Overridden by [scope]" badge.

- [ ] **Step 2: Implement McpServerDetail**

Expanded card content: command + args (for stdio), URL (for sse/http), env vars (masked values with reveal), headers, tools list if available.

- [ ] **Step 3: Implement McpServerForm**

Modal dialog for Add/Edit. Fields per spec §17.10:
- Name: text, required, unique within scope, alphanumeric + hyphens
- Scope: radio User/Local, required
- Type: radio stdio/sse/http, required — changes which fields show below
- Command (stdio): text, required for stdio
- Args (stdio): tag-style multi-input
- URL (sse/http): text, required, URL validation
- Headers (sse/http): key-value pair editor, supports `${ENV_VAR}` syntax
- Env: key-value pair editor

Save action calls mcp-loader's `saveMcpServer()`.

- [ ] **Step 4: Implement McpPanel**

Header: "MCP Servers" title + [+ Add Server] button + [Refresh Status] button + search bar. Body: grouped by scope with scope headers ("User Scope (available in all projects)", "Local Scope", "Project Scope"). Each group lists its McpServerCards. Empty state per spec §17.6.

**Search scope (spec §17.7):** Search filters by `name`, `command`, `args` (for stdio) and `url` (for sse/http).

**Search highlighting:** All search results across Plugins, Skills, and MCP should highlight matching text segments with `bg-accent/20` (spec §17.7).

**Loading states (spec §17.6):** Show skeleton cards during load — 3 skeleton cards for plugins, 2 for skills, 2 per scope group for MCP.

- [ ] **Step 5: Commit**

`git commit -m "feat: add MCP server UI components"`

---

### Task 12: MCP Section Wiring

**Files:**
- Modify: `src/sections/McpSection.tsx`

- [ ] **Step 1: Wire up McpSection**

Replace placeholder with McpPanel. Load servers on mount. Refresh status on 15s interval when panel visible, 60s when backgrounded, 2s after action (per spec §13). Show McpServerForm as modal when adding/editing.

- [ ] **Step 2: Commit**

`git commit -m "feat: wire up MCP Servers section"`

---

### Task 13: Integration Verification

- [ ] **Step 1: Run all tests** — `npx vitest run` — expect PASS

- [ ] **Step 2: Rust compilation** — `cargo check` — expect clean

- [ ] **Step 3: Dev build verification**

`npx tauri dev` — Navigate to Plugins, Skills, MCP sections. Verify:
- Plugins: shows installed plugins from `~/.claude/plugins/` with correct states
- Skills: shows custom skills from `~/.claude/skills/`
- MCP: shows servers from `~/.claude.json`, can add/edit/remove servers

- [ ] **Step 4: Commit**

`git commit -m "chore: Phase 3 Plugins/Skills/MCP complete"`
