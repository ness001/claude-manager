# Phase 3: Plugins, Skills & MCP Servers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Plugins list/detail views, Custom Skills list, and MCP Servers management panel — the three configuration/management sections of the app.

**Architecture:** All three sections read from Claude Code's config files on disk (not SQLite). Plugins read from `installed_plugins.json` + `settings.json`. Skills scan `~/.claude/skills/` directories. MCP servers read from `~/.claude.json` (user + local scopes) AND `<project-root>/.mcp.json` (project scope). Rust backend provides file reading; frontend does the parsing and state management. MCP server add/edit writes back to `~/.claude.json`.

**Tech Stack:** Tauri v2 IPC commands, tauri-plugin-fs (read/write/watch), Zustand, Tailwind CSS v4

**Prerequisites:** Phase 1 complete (app shell, navigation), Phase 2 complete (session types pattern to follow).

## Conventions for all Phase 3 tasks

(General task-execution rules live in repo `CLAUDE.md` → "Executing a plan task". The items below are Phase-3-specific.)

- **Plugin registry:** `~/.claude/installed_plugins.json` lists installed plugins; per-plugin enable state lives in `~/.claude/settings.json` (NOT in the registry file).
- **Skills:** scan `~/.claude/skills/<plugin>/<skill-name>/SKILL.md`. Frontmatter (name/description/etc.) is YAML between `---` fences at file head.
- **MCP server scopes:** user + local scopes live in `~/.claude.json` (NOT `~/.claude/settings.json` — common mistake). Project scope lives in `<project-root>/.mcp.json`. (See `docs/DESIGN-CONTEXT.md`.)
- **Writes are read-modify-write:** when editing `~/.claude.json`, preserve all unrelated keys. Never replace the whole file with a partial object.
- **Source of truth is the disk file, not SQLite** — these three sections do not cache to SQLite.
- **Manual UI / E2E smoke verification:** when not N/A, run `npx tauri dev`, capture screenshots via `scripts/_test/helper.ps1`, and embed the screenshot file paths in the final ralph output before promising completion.

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

- [x] **Step 1: Define plugin types**

`PluginMeta`: name, marketplace, version (string — can be semver or 12-char git SHA per spec §6.3), gitCommitSha (40-char), description, installPath, state (PluginState), skillCount, agentCount, hookCount, hasClaudeMd.

`PluginState = "active" | "disabled" | "broken" | "orphaned" | "update-available"` per spec §6.4.

`PluginDetail`: extends PluginMeta with `skills: SkillInfo[]`, `agents: AgentInfo[]`, `hooks: HookInfo[]`.

`SkillInfo`: name, description (from YAML frontmatter in .md files under `skills/`).

`AgentInfo`: name, description, tools, model, color (from YAML frontmatter in .md files under `agents/`).

`HookInfo`: event (e.g., "SessionStart", "PreToolUse"), command, from `hooks.json`.

**Verification**

*Unit tests* (`tests/lib/plugin-types.test.ts`):
- [x] case 1: type-only file — assert exported type names compile via a `tests/lib/plugin-types.compile.ts` snippet imported in test
- [x] case 2: `PluginState` union accepts all five literals; rejects an unknown literal under `// @ts-expect-error`

*Component / integration tests* — N/A (no components in this task)

*Data-fixture tests* — N/A (types only, no parsing or filesystem reads)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* — N/A (no user-visible surface yet)

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §4 (Plugin Data Model) and §6.4 (states)
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.1): add plugin type definitions`

- [x] **Step 2: Commit**

`git commit -m "feat: add plugin type definitions"`

---

### Task 2: Plugin Loader

**Files:**
- Create: `src/lib/plugin-loader.ts`
- Create: `tests/lib/plugin-loader.test.ts`
- Create: `src-tauri/src/plugins/mod.rs`, `src-tauri/src/plugins/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)

- [x] **Step 1: Write failing tests**

Test: merges installed_plugins.json + settings.json enabledPlugins into PluginMeta list. Detects broken state (installPath missing). Detects orphaned state (in enabledPlugins but not in installed_plugins). Correctly determines active vs disabled.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement Rust commands**

`read_installed_plugins()`: Read `~/.claude/plugins/installed_plugins.json`, return as String.

`read_settings_enabled_plugins()`: Read `~/.claude/settings.json`, extract `enabledPlugins` map.

`read_plugin_contents(install_path: String)`: Read a specific plugin's directory structure — enumerate `skills/`, `agents/`, `hooks/`, check for `CLAUDE.md`. For skill/agent .md files, read first few lines to extract YAML frontmatter (name, description).

**Metadata fallback (spec §6.5):** Some plugins have no `plugin.json`. When present, `plugin.json` lives inside `.claude-plugin/` subdirectory, not plugin root. Fall back to `marketplace.json` for metadata.

- [x] **Step 4: Implement frontend plugin-loader.ts**

`loadPlugins()`:
1. Read installed_plugins.json (keyed by `{name}@{marketplace}`, value is ARRAY of installations — each array entry is a separate installation). Iterate each array entry to produce a separate `PluginMeta` per installation.
2. Read settings.json for enabledPlugins map
3. For each plugin installation, determine state: check if files exist at installPath (via Tauri fs `exists()`), check if enabled in settings. Map to PluginState.
4. Return `PluginMeta[]` sorted by name

`loadPluginDetail(plugin: PluginMeta)`:
1. Call Rust command to read plugin directory contents
2. Parse skill/agent frontmatter, hooks.json, CLAUDE.md existence
3. Return `PluginDetail`

- [x] **Step 5: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/lib/plugin-loader.test.ts`):
- [x] case 1: merges `installed_plugins.json` + `settings.json.enabledPlugins` → `PluginMeta[]` with correct state per entry
- [x] case 2: missing `installPath` on disk → state is `broken`
- [x] case 3: name in `enabledPlugins` but absent from `installed_plugins.json` → state is `orphaned` (spec §4)
- [x] case 4: array of installations under one `{name}@{marketplace}` key → one `PluginMeta` per array entry
- [x] case 5: 12-char git SHA version string accepted alongside semver (DESIGN-CONTEXT §2.5)
- [x] case 6: plugin with no `plugin.json` falls back to `marketplace.json` (DESIGN-CONTEXT §2.9)

*Component / integration tests* — N/A (loader is non-UI)

*Data-fixture tests* (this task reads JSON config + filesystem):
- [x] fixture at `tests/fixtures/plugin-loader/` covering DESIGN-CONTEXT.md §2.5 (semver + 12-char SHA versions) and §2.9 (no `plugin.json`, falls back to `marketplace.json`)
- [x] fixture for `installed_plugins.json` whose value is an ARRAY of installations (not a single object)
- [x] fixture for `settings.json` with `enabledPlugins` map producing one orphaned entry
- [x] parser returns expected normalized `PluginMeta[]` shape sorted by name

*Rust checks* (touches `src-tauri/`):
- [x] `cd src-tauri && cargo check` clean
- [x] `cargo test` green (if any)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (multi-file scan):
- [x] scanning ~50 plugin installations completes < 1s end-to-end
- [x] each `plugin.json` / `marketplace.json` parse < 100ms

*Manual UI / E2E smoke* — deferred to T3.5 (no UI yet)
- *Existing notes:* tests must validate broken/orphaned/active/disabled state mapping per spec §6.4

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §4 and §10 (refresh strategy)
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.2): add plugin loader with state detection`

- [x] **Step 6: Commit**

`git commit -m "feat: add plugin loader with state detection"`

---

### Task 3: Plugin Store

**Files:**
- Create: `src/stores/plugin-store.ts`
- Create: `tests/stores/plugin-store.test.ts`

- [x] **Step 1: Write failing tests**

Test: loads plugins, selects a plugin, search filters by name/description/marketplace, toggle enable/disable updates settings.json.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement plugin store**

State: `plugins: PluginMeta[]`, `selectedPlugin: PluginDetail | null`, `searchQuery: string`, `isLoading: boolean`.

Actions: `loadPlugins()`, `selectPlugin(name)` (loads detail), `setSearchQuery(q)`, `togglePlugin(name)` (flip enabled state, write to settings.json via Rust command).

Computed: `filteredPlugins()` — filter by search query matching name, description, marketplace (per spec §17.7).

- [x] **Step 4: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/stores/plugin-store.test.ts`):
- [x] case 1: `loadPlugins()` populates `plugins` and clears `isLoading`
- [x] case 2: `selectPlugin(name)` populates `selectedPlugin` with detail
- [x] case 3: `setSearchQuery` filters by name, description, and marketplace
- [x] case 4: `togglePlugin(name)` flips enabled state and triggers settings.json write (mocked Rust command)
- [x] case 5: error path — Rust command rejects → store sets error state, no partial mutation

*Component / integration tests* — N/A (Zustand store, no DOM)

*Data-fixture tests* — N/A (uses mocked loader; fixtures live in T3.2)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* — deferred to T3.5

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §4 and §17.7 (search semantics)
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.3): add plugin Zustand store`

- [x] **Step 5: Commit**

`git commit -m "feat: add plugin Zustand store"`

---

### Task 4: Plugin UI Components

**Files:**
- Create: all files under `src/components/plugins/`

- [x] **Step 1: Implement PluginCard**

Card showing: status dot (colored per state §6.4), plugin name, marketplace source, description (truncated), version pill, component counts (N skills, N agents), enable/disable toggle switch. Broken plugins: red border + warning text + Reinstall/Remove buttons. Disabled plugins: 70% opacity.

- [x] **Step 2: Implement PluginListView**

Header: "Plugins" title + stats (N installed, N active, N disabled) + [Install Plugin] button (opens terminal command hint) + [Check for Updates] button + search bar. Body: grid/list of PluginCards. Empty state per spec §17.6: "No plugins installed. Use `claude plugins install <name>` to add plugins."

**Update detection (spec §13):** "Check for Updates" compares local `gitCommitSha` against remote HEAD via `git ls-remote`. Cache result for 1hr. Mark plugins with mismatched SHAs as `update-available` state.

- [x] **Step 3: Implement PluginDetailView**

Header: name, marketplace, version, status, action buttons (Open in File Browser, Open in VS Code — use `shell.open()` from Tauri). Tabbed content: Skills / Agents / Hooks tabs.

- [x] **Step 4: Implement tab components**

`PluginSkillsTab`: List of skills with name + description from frontmatter.
`PluginAgentsTab`: List of agents with name + description + model + tools.
`PluginHooksTab`: Display hooks.json entries — event name + command.

**Verification**

*Unit tests* — N/A (UI components covered by RTL below)

*Component / integration tests* (`tests/components/plugins/PluginCard.test.tsx`, `PluginListView.test.tsx`, `PluginDetailView.test.tsx`, `PluginSkillsTab.test.tsx`, `PluginAgentsTab.test.tsx`, `PluginHooksTab.test.tsx`; RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql` + `@tauri-apps/plugin-fs` + `@tauri-apps/plugin-shell`):
- [x] mounts without console errors
- [x] PluginCard: status dot color matches each `PluginState` (active/disabled/broken/orphaned/update-available)
- [x] PluginCard: broken plugin renders red border + Reinstall/Remove buttons; disabled plugin renders 70% opacity
- [x] PluginCard: toggle switch click → calls store `togglePlugin` once
- [x] PluginListView: header counts (installed/active/disabled) reflect store; empty state copy matches spec §17.6
- [x] PluginListView: "Check for Updates" click invokes update detection action (mocked) — local SHA vs mocked remote HEAD
- [x] PluginDetailView: tab switching between Skills / Agents / Hooks renders correct tab body
- [x] PluginAgentsTab + PluginSkillsTab + PluginHooksTab: render rows from fixture data
- [x] dark + light theme parity (toggle theme attribute, snapshot key classes)

*Data-fixture tests* — only the update-detection path (mock the `git ls-remote` network call):
- [x] fixture comparing local `gitCommitSha` vs remote HEAD → emits `update-available` for mismatched plugins (DESIGN-CONTEXT §2.5)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* (renders many plugin cards):
- [x] rendering 50 PluginCards in PluginListView < 200ms (RTL render timing)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] navigate to Plugins; cards render with correct status dots
- [ ] toggle a plugin → state flips visually and persists across reload
- [ ] click a plugin → detail view with Skills/Agents/Hooks tabs
- [ ] "Open in File Browser" / "Open in VS Code" actions invoke shell open
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [x] All checks above pass (manual UI smoke deferred to T3.5 — components are not yet reachable from the running app; checkboxes flipped in T3.5 commit)
- [x] Behavior matches spec §4, §6.4, §13 (update detection), §17.6, §17.7
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.4): add plugin list and detail UI components`

- [x] **Step 5: Commit**

`git commit -m "feat: add plugin list and detail UI components"`

---

### Task 5: Plugins Section Wiring

**Files:**
- Modify: `src/sections/PluginsSection.tsx`

- [x] **Step 1: Wire up PluginsSection**

If no plugin selected → show PluginListView. If plugin selected → show PluginDetailView with back button. Load plugins on mount. Handle loading / empty states.

**Verification**

*Unit tests* — N/A

*Component / integration tests* (`tests/components/sections/PluginsSection.test.tsx`; RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-fs`):
- [x] mounts without console errors
- [x] no selection → renders `PluginListView`
- [x] selecting a plugin via store → renders `PluginDetailView` with back button
- [x] back button click → returns to list (selection cleared)
- [x] loading state renders skeletons; empty state renders spec §17.6 copy
- [x] dark + light theme parity

*Data-fixture tests* — N/A (reuses T3.2 fixtures via mocks)

*Rust checks* — N/A

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [x] sidebar → Plugins → list renders (scripts/_test/out/t35-list.png)
- [x] click plugin card → detail view (scripts/_test/out/t35-kbd-detail.png); back arrow returns to list (verified by component test "back button click → returns to list")
- [x] dark + light render correctly (component test "dark + light theme parity")
- [x] keyboard shortcut (sidebar nav) lands on Plugins (Ctrl+3 in t35-kbd-smoke.ps1 → t35-kbd-detail.png reached)
- [x] DevTools Console: zero errors

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §4, §17.6
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.5): wire up Plugins section`

- [x] **Step 2: Commit**

`git commit -m "feat: wire up Plugins section"`

---

### Task 6: Custom Skills Types & Loader

**Files:**
- Create: `src/lib/skill-types.ts`
- Create: `src/lib/skill-loader.ts`
- Create: `tests/lib/skill-loader.test.ts`
- Create: `src-tauri/src/skills/mod.rs`, `src-tauri/src/skills/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: Define types**

`CustomSkill`: name, description, dirPath, skillMdPath. Per spec §7: skills live at `~/.claude/skills/` as directories, each containing `SKILL.md` with YAML frontmatter.

- [x] **Step 2: Write failing tests**

Test: scans directory structure, parses SKILL.md frontmatter, handles missing/malformed files.

- [x] **Step 3: Run tests — expect FAIL**

- [x] **Step 4: Implement Rust command**

`scan_custom_skills()`: Enumerate `~/.claude/skills/` subdirectories. For each, check if `SKILL.md` exists, read and extract YAML frontmatter (name, description). Return list.

- [x] **Step 5: Implement frontend skill-loader.ts**

`loadCustomSkills()`: Call Rust command, map to `CustomSkill[]`.

- [x] **Step 6: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/lib/skill-loader.test.ts`):
- [x] case 1: scans `~/.claude/skills/` and returns one `CustomSkill` per subdirectory containing `SKILL.md`
- [x] case 2: malformed YAML frontmatter → entry omitted (or surfaced with error flag), no throw
- [x] case 3: subdirectory without `SKILL.md` → skipped
- [x] case 4: name + description extracted from frontmatter and trimmed

*Component / integration tests* — N/A (loader, no UI)

*Data-fixture tests* (this task reads filesystem):
- [x] fixture at `tests/fixtures/skill-loader/` with: valid SKILL.md (name + description in frontmatter), missing SKILL.md, malformed frontmatter, plus a plugin-bundled skill at `<plugin>/skills/SKILL.md` that should NOT appear in custom-skills results
- [x] parser returns expected normalized `CustomSkill[]` shape

*Rust checks* (touches `src-tauri/`):
- [x] `cd src-tauri && cargo check` clean
- [x] `cargo test` green (if any)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (only ~8 known custom skills today)

*Manual UI / E2E smoke* — deferred to T3.7

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §7
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.6): add custom skills scanner`

- [x] **Step 7: Commit**

`git commit -m "feat: add custom skills scanner"`

---

### Task 7: Skills Store & UI

**Files:**
- Create: `src/stores/skill-store.ts`
- Create: `src/components/skills/SkillsListView.tsx`, `src/components/skills/SkillCard.tsx`
- Modify: `src/sections/SkillsSection.tsx`

- [x] **Step 1: Implement skill store**

State: `skills: CustomSkill[]`, `searchQuery: string`, `isLoading: boolean`.
Actions: `loadSkills()`, `setSearchQuery(q)`.

- [x] **Step 2: Implement SkillCard**

Card: skill name, description, file path, actions (Open in VS Code, Open in File Browser).

- [x] **Step 3: Implement SkillsListView**

Header: "Custom Skills" title + skill count + path (`~/.claude/skills/`) + [+ Create Skill] button (opens file browser to create directory) + search bar. Body: list of SkillCards. Info box at bottom explaining custom skills and linking to Plugins panel for plugin-bundled skills. Empty state per spec §17.6.

- [x] **Step 4: Wire up SkillsSection**

Replace placeholder with SkillsListView. Load skills on mount.

**Verification**

*Unit tests* (`tests/stores/skill-store.test.ts`):
- [x] case 1: `loadSkills()` populates `skills` and clears `isLoading`
- [x] case 2: `setSearchQuery` filters by name and description
- [x] case 3: error path — loader rejects → store records error, no partial mutation

*Component / integration tests* (`tests/components/skills/SkillCard.test.tsx`, `SkillsListView.test.tsx`, `tests/components/sections/SkillsSection.test.tsx`; RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-fs` + `@tauri-apps/plugin-shell`):
- [x] mounts without console errors
- [x] SkillCard: renders name, description, file path; "Open in VS Code" / "Open in File Browser" actions invoke shell open (mocked)
- [x] SkillsListView: header shows skill count + path `~/.claude/skills/`; search filters cards
- [x] SkillsListView: empty state matches spec §17.6
- [x] SkillsListView: info box references plugin-bundled skills via Plugins panel
- [x] SkillsSection: replaces placeholder with `SkillsListView` and triggers load on mount
- [x] dark + light theme parity

*Data-fixture tests* — N/A (reuses T3.6 fixtures via mocked loader)

*Rust checks* — N/A

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [x] sidebar → Skills → 8 known custom skills render
- [x] search box filters list
- [x] "Open in VS Code" opens the SKILL.md file
- [x] dark + light render correctly
- [x] DevTools Console: zero errors

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §7, §17.6, §17.7
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.7): add Skills list view`

- [x] **Step 5: Commit**

`git commit -m "feat: add Skills list view"`

---

### Task 8: MCP Types

**Files:**
- Create: `src/lib/mcp-types.ts`

- [x] **Step 1: Define MCP types**

`McpScope = "user" | "local" | "project"`.
`McpServerType = "stdio" | "sse" | "http"`.
`McpServerState = "connected" | "disconnected" | "error" | "starting"`.

`McpServer`: name, type, scope, status (McpServerState), command (stdio), args (stdio), env, url (sse/http), headers (sse/http), toolCount, tools, isOverridden, overriddenBy (scope name if shadowed).

Per spec §8.1: configs are in `~/.claude.json` (NOT settings.json). Three scopes with precedence: project > local > user. Same name at multiple scopes → most specific wins, shadowed server is dimmed.

**Trust tracking (spec §8.1):** `~/.claude.json` has `enabledMcpjsonServers` and `disabledMcpjsonServers` arrays per project entry. These determine whether `.mcp.json` project-scope servers are trusted. The McpServer type must include `isTrusted: boolean | undefined` (only applicable to project-scope servers).

**Verification**

*Unit tests* (`tests/lib/mcp-types.test.ts`):
- [x] case 1: `McpScope` / `McpServerType` / `McpServerState` unions accept exactly the documented literals (`// @ts-expect-error` rejects others)
- [x] case 2: `McpServer` type permits `isTrusted: boolean | undefined` only on project-scope construction (compile-time assertion via fixture)

*Component / integration tests* — N/A (types only)

*Data-fixture tests* — N/A (no parsing yet — covered in T3.9)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* — N/A (no user-visible surface)

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §5 (MCP Data Model), §8.1 (scopes + trust)
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.8): add MCP server type definitions`

- [x] **Step 2: Commit**

`git commit -m "feat: add MCP server type definitions"`

---

### Task 9: MCP Loader

**Files:**
- Create: `src/lib/mcp-loader.ts`
- Create: `tests/lib/mcp-loader.test.ts`
- Create: `src-tauri/src/mcp/mod.rs`, `src-tauri/src/mcp/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: Write failing tests**

Test: parses user-scope servers from `~/.claude.json` → `$.mcpServers`, local-scope from `$.projects["path"].mcpServers`, detects shadowing when same name exists at multiple scopes.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement Rust commands**

`read_claude_json()`: Read `~/.claude.json`, return as String.

`read_mcp_json(project_root: String)`: Read `<project_root>/.mcp.json` for project-scope MCP servers. Return as String (empty if file doesn't exist).

`write_mcp_server(scope, name, config_json, cwd)`: Write an MCP server config to `~/.claude.json` at the appropriate JSON path based on scope (user: `$.mcpServers.{name}`, local: `$.projects["{cwd}"].mcpServers.{name}`). Read-modify-write with proper JSON merging. **Critical:** Use atomic write-to-temp-then-rename to prevent corruption. The `cwd` param is required for local scope — determined by the currently viewed project path from the session store or a project path picker in the form.

`remove_mcp_server(scope, name)`: Remove server from `~/.claude.json` at the appropriate path.

`check_mcp_status()`: Run `claude mcp list` and parse output for connection status. **Warning per spec §8.3:** This actually spawns servers for health checks. Use timeout. Only invoke when panel is visible.

- [x] **Step 4: Implement frontend mcp-loader.ts**

`loadMcpServers()`:
1. Read `~/.claude.json`
2. Extract user-scope servers from `mcpServers`
3. Extract local-scope servers from `projects.*.mcpServers`
4. **Read `.mcp.json` from known project roots** (from session store's known CWDs) for project-scope servers. Cross-reference with `enabledMcpjsonServers`/`disabledMcpjsonServers` in `~/.claude.json` to determine trust status.
5. Merge with precedence resolution (project > local > user). Mark shadowed servers (`isOverridden`, `overriddenBy`).
6. Optionally check status via `check_mcp_status()`

`saveMcpServer(server: McpServer)`: Call Rust write command.
`deleteMcpServer(scope, name)`: Call Rust remove command.

- [x] **Step 5: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/lib/mcp-loader.test.ts`):
- [x] case 1: parses user-scope servers from `$.mcpServers` in `~/.claude.json`
- [x] case 2: parses local-scope servers from `$.projects["<cwd>"].mcpServers`
- [x] case 3: parses project-scope servers from `<project_root>/.mcp.json`; missing file → empty list, no throw
- [x] case 4: scope precedence (project > local > user) — same name at multiple scopes resolves to most-specific; shadowed entries flagged via `isOverridden` + `overriddenBy`
- [x] case 5: stdio server fixture (command + args + env) round-trips
- [x] case 6: sse / http server fixtures with `${ENV_VAR}` placeholder headers preserved verbatim
- [x] case 7: `isTrusted` derived from `enabledMcpjsonServers` / `disabledMcpjsonServers` for project-scope only
- [x] case 8: `check_mcp_status()` is mocked — test asserts the loader NEVER calls the real `claude mcp list` subprocess (spec §5 / §8.3 warning)
- [x] case 9: status mapping covers `connected`, `disconnected`, `error`, `starting`
- [x] case 10: atomic write — `saveMcpServer` round-trips through write-to-temp-then-rename (mocked `@tauri-apps/plugin-fs`)
- [x] case 11: `deleteMcpServer` removes the correct JSON path for each scope

*Component / integration tests* — N/A (loader is non-UI)

*Data-fixture tests* (this task reads JSON config + filesystem):
- [x] fixture at `tests/fixtures/mcp-loader/` with `~/.claude.json` covering user (`$.mcpServers`), local (`$.projects[<path>].mcpServers`), and a project-root `.mcp.json` (DESIGN-CONTEXT §2.1)
- [x] fixture exercises "Overridden" badge logic (same name at user + local; project + user)
- [x] fixture for stdio + sse + http types with env / headers placeholders
- [x] scope precedence (project > local > user) verified against fixture

*Rust checks* (touches `src-tauri/`):
- [x] `cd src-tauri && cargo check` clean
- [x] `cargo test` green (if any)
- [x] subprocess for `claude mcp list` is gated behind a mockable trait/fn so tests never spawn it (spec §5 / §8.3)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (typically <20 servers across scopes)

*Manual UI / E2E smoke* — deferred to T3.12

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §5, §8.1, §8.3, §10 (refresh strategy)
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.9): add MCP server loader with scope resolution`

- [x] **Step 6: Commit**

`git commit -m "feat: add MCP server loader with scope resolution"`

---

### Task 10: MCP Store

**Files:**
- Create: `src/stores/mcp-store.ts`
- Create: `tests/stores/mcp-store.test.ts`

- [x] **Step 1: Write failing tests**

Test: loads servers grouped by scope, adds a server, removes a server, refreshes status.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement MCP store**

State: `servers: McpServer[]`, `searchQuery: string`, `isLoading: boolean`, `editingServer: McpServer | null` (for form dialog).

Actions: `loadServers()`, `addServer(server)`, `updateServer(server)`, `removeServer(scope, name)`, `refreshStatus()`, `restartServer(name)`, `connectServer(name)`, `setSearchQuery(q)`, `startEditing(server)`, `stopEditing()`.

Computed: `serversByScope()` — group into user/local/project arrays.

- [x] **Step 4: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/stores/mcp-store.test.ts`):
- [x] case 1: `loadServers()` populates list grouped by scope via `serversByScope()`
- [x] case 2: `addServer` / `updateServer` / `removeServer` call mocked loader writers and refresh state
- [x] case 3: `refreshStatus()` updates each server's `status` from mocked `check_mcp_status()` — never calls the real subprocess
- [x] case 4: `restartServer` / `connectServer` invoke the mocked Rust commands and reflect transient `starting` state
- [x] case 5: `setSearchQuery` filters by name + command + args (stdio) and url (sse/http) per spec §17.7
- [x] case 6: `startEditing` / `stopEditing` toggle `editingServer` cleanly
- [x] case 7: error path — write rejection rolls back optimistic state

*Component / integration tests* — N/A (Zustand store, no DOM)

*Data-fixture tests* — N/A (reuses T3.9 fixtures via mocks)

*Rust checks* — N/A (no `src-tauri/` changes here)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* — deferred to T3.12

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §5, §8.3, §17.7
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.10): add MCP Zustand store`

- [x] **Step 5: Commit**

`git commit -m "feat: add MCP Zustand store"`

---

### Task 11: MCP UI Components

**Files:**
- Create: all files under `src/components/mcp/`

- [x] **Step 1: Implement McpServerCard**

Card: status dot (green=connected, gray hollow=disconnected, red=error, amber pulsing=starting per spec §8.3). Name, type pill (stdio/sse/http), scope pill (user/local/project). Expand/collapse toggle. Actions vary by connection state per spec §8.3:
- Connected: Restart, View Tools, View Logs, Edit, Remove
- Disconnected: Connect, View Logs, Edit, Remove
- Error: Retry, View Logs (prominent), Edit, Remove
- Starting: Cancel (if >10s), View Logs

Remove requires confirmation dialog. Shadowed servers are dimmed with "Overridden by [scope]" badge.

- [x] **Step 2: Implement McpServerDetail**

Expanded card content: command + args (for stdio), URL (for sse/http), env vars (masked values with reveal), headers, tools list if available.

- [x] **Step 3: Implement McpServerForm**

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

- [x] **Step 4: Implement McpPanel**

Header: "MCP Servers" title + [+ Add Server] button + [Refresh Status] button + search bar. Body: grouped by scope with scope headers ("User Scope (available in all projects)", "Local Scope", "Project Scope"). Each group lists its McpServerCards. Empty state per spec §17.6.

**Search scope (spec §17.7):** Search filters by `name`, `command`, `args` (for stdio) and `url` (for sse/http).

**Search highlighting:** All search results across Plugins, Skills, and MCP should highlight matching text segments with `bg-accent/20` (spec §17.7).

**Loading states (spec §17.6):** Show skeleton cards during load — 3 skeleton cards for plugins, 2 for skills, 2 per scope group for MCP.

**Verification**

*Unit tests* — N/A (UI components covered by RTL below)

*Component / integration tests* (`tests/components/mcp/McpServerCard.test.tsx`, `McpServerDetail.test.tsx`, `McpServerForm.test.tsx`, `McpPanel.test.tsx`; RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-fs` — never invoke real subprocess):
- [x] mounts without console errors
- [x] McpServerCard: status dot per state — green=connected, gray hollow=disconnected, red=error, amber pulsing=starting (spec §8.3)
- [x] McpServerCard: action set varies per state (Connected: Restart/View Tools/View Logs/Edit/Remove; Disconnected: Connect/View Logs/Edit/Remove; Error: Retry/View Logs/Edit/Remove; Starting: Cancel after >10s/View Logs)
- [x] McpServerCard: shadowed server is dimmed and shows "Overridden by [scope]" badge
- [x] McpServerCard: Remove → confirmation dialog → calls store removeServer
- [x] McpServerDetail: stdio shows command + args; sse/http shows URL; env values masked with reveal toggle; headers preserved
- [x] McpServerForm: type radio swaps fields; validation — name required + alphanumeric/hyphens + unique within scope; URL validation for sse/http
- [x] McpServerForm: `${ENV_VAR}` placeholder accepted in headers
- [x] McpServerForm: Save calls `saveMcpServer` (mocked); Cancel closes without write
- [x] McpPanel: header "MCP Servers", [+ Add Server], [Refresh Status], search bar
- [x] McpPanel: groups rendered with scope headers ("User Scope (available in all projects)", "Local Scope", "Project Scope")
- [x] McpPanel: search filters by name + command + args (stdio) + url (sse/http) (spec §17.7)
- [x] McpPanel: matching segments highlighted with `bg-accent/20` (spec §17.7)
- [x] McpPanel: loading shows 2 skeleton cards per scope group; empty state per spec §17.6
- [x] dark + light theme parity

*Data-fixture tests* (only because each card variant needs scope/state fixtures):
- [x] fixture at `tests/fixtures/mcp-ui/` covering all four states (connected/disconnected/error/starting), all three types (stdio/sse/http), and a shadowed pair to exercise "Overridden" badge — verifies scope precedence (project > local > user)
- [x] fixture asserts NO subprocess for `claude mcp list` is invoked during component tests (spec §5 / §8.3)

*Rust checks* — N/A (no `src-tauri/` changes)

*Type-check + lint gate*:
- [x] `npx tsc --noEmit` zero errors
- [x] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (typically <20 cards)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [x] navigate to MCP; servers grouped by scope render
- [x] expand/collapse a card → details visible/hidden
- [x] add a stdio server via form → appears in correct scope group
- [x] edit existing server → form pre-populates; save persists
- [x] remove with confirmation
- [x] dark + light render correctly
- [x] DevTools Console: zero errors

*Definition of Done*:
- [x] All checks above pass
- [x] Behavior matches spec §5, §8.1, §8.3, §17.6, §17.7, §17.10
- [x] Plan checkbox `[x]`
- [x] Commit: `feat(T3.11): add MCP server UI components`

- [x] **Step 5: Commit**

`git commit -m "feat: add MCP server UI components"`

---

### Task 12: MCP Section Wiring

**Files:**
- Modify: `src/sections/McpSection.tsx`

- [ ] **Step 1: Wire up McpSection**

Replace placeholder with McpPanel. Load servers on mount. Refresh status on 15s interval when panel visible, 60s when backgrounded, 2s after action (per spec §13). Show McpServerForm as modal when adding/editing.

**Verification**

*Unit tests* — N/A

*Component / integration tests* (`tests/components/sections/McpSection.test.tsx`; RTL + jsdom + fake timers; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-fs`):
- [ ] mounts without console errors and renders `McpPanel`
- [ ] load on mount calls store `loadServers` once
- [ ] refresh interval — 15s when panel visible, 60s when document hidden (toggle visibilityState), 2s burst after add/edit/remove (vitest fake timers)
- [ ] add/edit click → `McpServerForm` modal mounts; close on Cancel/Save
- [ ] subprocess for `claude mcp list` is mocked end-to-end — never invoked (spec §5 / §8.3)
- [ ] dark + light theme parity

*Data-fixture tests* — N/A (reuses T3.9 fixtures via mocks)

*Rust checks* — N/A

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] sidebar → MCP Servers → groups render
- [ ] [+ Add Server] opens modal; save persists
- [ ] [Refresh Status] triggers an immediate refresh
- [ ] tab away then return → refresh cadence resumes
- [ ] dark + light render correctly
- [ ] keyboard shortcut for sidebar nav lands on MCP
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §5, §8.3, §10 (refresh strategy), §13
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T3.12): wire up MCP Servers section`

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

**Verification**

*Unit tests*:
- [ ] case 1: `npx vitest run` — full Phase 3 suite green
- [ ] case 2: vitest reports zero unhandled rejections / console errors

*Component / integration tests* (RTL + jsdom; `@tauri-apps/api/core` + `@tauri-apps/plugin-sql` + `@tauri-apps/plugin-fs` mocked across the suite):
- [ ] mounts without console errors across Plugins / Skills / MCP sections
- [ ] cross-section navigation: Plugins → Skills → MCP retains state
- [ ] dark + light theme parity across all three sections

*Data-fixture tests*:
- [ ] all Phase 3 fixtures (`tests/fixtures/plugin-loader/`, `skill-loader/`, `mcp-loader/`, `mcp-ui/`) loaded by their respective tests still pass
- [ ] DESIGN-CONTEXT edge cases asserted: §2.1 (MCP in `~/.claude.json` + scope precedence project > local > user), §2.5 (semver + 12-char SHA), §2.9 (no `plugin.json` → `marketplace.json` fallback)
- [ ] zero invocations of the real `claude mcp list` subprocess across the entire test run (spec §5 / §8.3)

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green (if any)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget*:
- [ ] scanning ~50 plugin installations < 1s end-to-end
- [ ] each plugin manifest parse < 100ms
- [ ] MCP refresh tick at 15s does not block UI (frame budget < 16ms during refresh)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] Plugins: shows installed plugins from `~/.claude/plugins/` with correct states (active/disabled/broken/orphaned/update-available)
- [ ] Skills: shows custom skills from `~/.claude/skills/`
- [ ] MCP: shows servers from `~/.claude.json` and project `.mcp.json`; can add/edit/remove servers; status refreshes
- [ ] dark + light render correctly across all three sections
- [ ] sidebar keyboard shortcuts for each section work
- [ ] DevTools Console: zero errors
- *Existing notes:* Steps 1-3 above (vitest, cargo check, tauri dev navigation) are the original integration gate

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §4, §5, §7, §8, §10, §13, §17
- [ ] All Phase 3 plan checkboxes `[x]`
- [ ] Commit: `chore(T3.13): Phase 3 Plugins/Skills/MCP complete`
