# Phase 4: Dialogs & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the New Session dialog, PTY terminal plugin for live sessions, First Launch flow, Command Palette, and the full Settings section — completing all features in the spec.

**Architecture:** New Session dialog launches `claude` CLI via custom Rust PTY plugin (portable-pty crate, ConPTY on Windows). First Launch flow checks prerequisites, imports existing sessions, and runs a guided tour. Command Palette is a centered overlay with fuzzy search. Settings reads/writes multiple config files through Rust commands.

**Tech Stack:** Tauri v2, portable-pty (Rust crate), ConPTY (Windows), xterm.js, Zustand, Tailwind CSS v4

**Prerequisites:** Phase 1-3 complete (all sections functional except these features).

---

## File Structure

```
src-tauri/src/
├── pty/
│   ├── mod.rs                        # Module declarations
│   └── plugin.rs                     # Custom Tauri plugin: PTY creation, IPC events (pty-data, pty-input, pty-resize)
├── config/
│   ├── mod.rs                        # Module declarations
│   └── commands.rs                   # IPC: read/write settings.json, config.json, settings.local.json
├── launcher.rs                       # Build `claude` CLI command from session options, launch in PTY
src/
├── lib/
│   ├── pty-types.ts                  # PtySessionId, PtyOptions
│   ├── config-types.ts               # SettingsJson, ConfigJson, AppearanceSettings
│   └── launcher.ts                   # Build CLI args, invoke Rust launcher command
├── stores/
│   ├── pty-store.ts                  # Active PTY sessions, connect/disconnect
│   ├── command-palette-store.ts      # Palette open/close, search query, filtered commands
│   ├── settings-store.ts             # Settings state for all 7 sections
│   └── first-launch-store.ts         # Prerequisites check state, import progress, tour step
├── components/
│   ├── dialogs/
│   │   ├── NewSessionDialog.tsx      # Modal: working dir, name, model, permissions, effort, prompt, tags
│   │   └── CommandPalette.tsx        # Ctrl+K overlay: search + grouped command results
│   ├── terminal/
│   │   └── TerminalView.tsx          # xterm.js terminal connected to PTY via Tauri IPC events
│   ├── settings/
│   │   ├── SettingsLayout.tsx        # Two-column: section sidebar (200px) + content area
│   │   ├── GeneralSettings.tsx       # API base URL, auth token, default model, primary API key
│   │   ├── PermissionsSettings.tsx   # permissions.allow list, skipDangerousModePermissionPrompt
│   │   ├── PluginsSettings.tsx       # Toggle list linking to Plugins section
│   │   ├── EnvironmentSettings.tsx   # Key-value editor for env vars
│   │   ├── AppearanceSettings.tsx    # Theme toggle, terminal font, compact mode
│   │   ├── UsageStatsSettings.tsx    # Model token table, activity heatmap, export CSV/JSON
│   │   └── AdvancedSettings.tsx      # Raw JSON editor, config paths, debug info, reset app data
│   └── first-launch/
│       ├── PrereqCheck.tsx           # Step 1: CLI installed, config dir, API key, API reachable
│       ├── AutoImport.tsx            # Step 2: Progress bar, discovery stats, project import log
│       └── GuidedTour.tsx            # Step 3: 5-step spotlight overlay
├── sections/
│   └── SettingsSection.tsx          # Replace placeholder with SettingsLayout
tests/
├── lib/
│   └── launcher.test.ts             # CLI arg building tests
├── stores/
│   └── command-palette-store.test.ts
└── components/
    └── dialogs/
        └── NewSessionDialog.test.tsx
```

---

### Task 1: New Session Dialog Types & Launcher

**Files:**
- Create: `src/lib/config-types.ts` (session launch options portion — this file is CREATED here)
- Create: `src/lib/launcher.ts`
- Create: `tests/lib/launcher.test.ts`
- Create: `src-tauri/src/launcher.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests for CLI arg builder**

Test cases for `buildClaudeArgs(options)`:
- Default options → `["claude"]`
- With cwd → adds `--cwd <dir>`
- With model → adds `--model <model>` (supports aliases: "sonnet", "opus", or full model names)
- With permission mode → adds `--permission-mode <mode>` (6 options per spec §17 note 7)
- With effort → adds `--effort <level>`
- With initial prompt → adds `-p "<prompt>"`
- With name → adds `--name <name>`
- Resume → adds `--resume <sessionId>` (no other conflicting flags)
- Fork → adds `--resume <sessionId> --fork-session`
- Advanced: fallback-model, max-budget-usd, add-dir, worktree, bare flags

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement launcher.ts**

`buildClaudeArgs(options: SessionLaunchOptions): string[]` — Maps form fields to CLI flags per spec §10.

- [ ] **Step 4: Implement Rust launcher command**

`launch_session(args: Vec<String>)`: Build the full command (`claude` + args), launch via PTY (Task 3) or OS terminal (for non-embedded sessions). Return the PID for tracking.

For "Open in OS terminal": Use `cmd.exe /c start cmd /k "claude ..."` on Windows. Or Windows Terminal if available.

- [ ] **Step 5: Run tests — expect PASS**

**Verification**

*Unit tests* (`tests/lib/launcher.test.ts`):
- [ ] case 1: `buildClaudeArgs({})` returns `["claude"]` (no extra flags)
- [ ] case 2: every permission mode (`acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`) maps to `--permission-mode <mode>`
- [ ] case 3: every effort level (low / medium / high / max) maps to `--effort <level>`
- [ ] case 4: model aliases (`sonnet`, `opus`) and full model IDs both pass through `--model`
- [ ] case 5: resume + fork emits `--resume <id> --fork-session`; resume alone has no `--fork-session`
- [ ] case 6: advanced flags (`--fallback-model`, `--max-budget-usd`, `--add-dir`, `--worktree`, `--bare`) emitted only when set
- [ ] case 7: initial prompt is shell-safe — `-p "<prompt>"` preserves quotes/escapes for tricky inputs
- [ ] case 8: error path — invalid permission mode rejected (or typed-narrowed at compile time)

*Component / integration tests* — N/A (pure builder + Rust command; UI tested in Task 2).

*Data-fixture tests* — N/A (no config / SQLite / FS reads in this task).

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean after adding `launcher.rs`
- [ ] `cargo test` green if any unit tests added for `launch_session`

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (no hot path).

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] invoke `launch_session` with a benign argv (`["--version"]`) from devtools — process spawns and returns a PID
- [ ] "Open in OS terminal" path on Windows opens a new terminal with `claude` running
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §8 and §10
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.1): session launcher with CLI arg builder`

- [ ] **Step 6: Commit**

`git commit -m "feat: add session launcher with CLI arg builder"`

---

### Task 2: New Session Dialog UI

**Files:**
- Create: `src/components/dialogs/NewSessionDialog.tsx`
- Create: `tests/components/dialogs/NewSessionDialog.test.tsx`

- [ ] **Step 1: Write failing tests**

Test: renders all form fields, validates working directory not empty on submit, model dropdown has expected options, permission mode shows 6 radio options, bypassPermissions has red tint.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement NewSessionDialog**

Modal dialog (500px wide) per spec §10. Form fields:
- **Working Directory**: text input + Browse button (via Tauri dialog.open). Recent CWDs dropdown sourced from SQLite sessions table (distinct CWDs, most recent first — simpler than parsing `history.jsonl`).
- **Session Name**: optional text input
- **Model**: dropdown — "sonnet", "opus", or full model names
- **Permission Mode**: radio group (2x3 grid) — 6 options per spec. `bypassPermissions` has red tint/warning.
- **Effort Level**: dropdown — low/medium/high/max
- **Initial Prompt**: textarea (3 rows), optional
- **Tags**: tag pill input with [+ New] button (stored in SQLite only)
- **Advanced Options** (collapsed by default): fallback-model, max-budget-usd, add-dir, worktree (checkbox), bare (checkbox)

Actions: "Start Session" (accent button, launches via launcher.ts) + "Cancel". Quick start shortcut (Ctrl+Shift+N) bypasses dialog entirely.

- [ ] **Step 4: Wire dialog into App.tsx**

Add state/handler for showing dialog. Ctrl+N opens it. Ctrl+Shift+N quick-starts.

- [ ] **Step 5: Run tests — expect PASS**

**Verification**

*Unit tests* — covered by `tests/lib/launcher.test.ts` (Task 1); no additional unit tests needed for the dialog itself.

*Component / integration tests* (`tests/components/dialogs/NewSessionDialog.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` for `launch_session`, `@tauri-apps/plugin-sql` for recent CWDs, `@tauri-apps/plugin-fs` for Browse, `@tauri-apps/plugin-dialog` for the directory picker):
- [ ] mounts without console errors and renders all form fields (cwd, name, model, permission radios, effort, prompt, tags, advanced collapsed)
- [ ] interaction: submit with empty Working Directory → inline validation error, `launch_session` NOT invoked
- [ ] interaction: filling cwd + clicking "Start Session" → `launch_session` called with mapped argv
- [ ] interaction: 6 permission radios render and are selectable; `bypassPermissions` row carries the red-tint warning class
- [ ] interaction: 4 effort options render in dropdown
- [ ] interaction: Recent CWDs dropdown populated from mocked SQLite query
- [ ] interaction: Advanced section toggles open and exposes fallback-model / max-budget-usd / add-dir / worktree / bare
- [ ] keyboard: `Ctrl+Shift+N` quick-start path bypasses the dialog and launches with defaults
- [ ] dark + light theme parity
- [ ] dialog focus-trap + Esc closes

*Data-fixture tests*:
- [ ] fixture at `tests/fixtures/new-session/recent-cwds.json` — mix of valid + nonexistent paths; component shows all but the launcher (Task 1) refuses nonexistent paths
- [ ] write path produces valid JSON when persisting last-used options to app SQLite (round-trip parse)

*Rust checks* — N/A (no `src-tauri/` changes in this task).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (small modal).

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] `Ctrl+N` opens the dialog; Browse picks a directory; Start Session launches a real `claude` session
- [ ] `Ctrl+Shift+N` quick-start launches with defaults, no dialog
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §8 and §10
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.2): New Session dialog`

- [ ] **Step 6: Commit**

`git commit -m "feat: add New Session dialog"`

---

### Task 3: Custom PTY Plugin (Rust)

**Files:**
- Create: `src-tauri/src/pty/mod.rs`, `src-tauri/src/pty/plugin.rs`
- Modify: `src-tauri/Cargo.toml` (add `portable-pty`)
- Modify: `src-tauri/src/lib.rs` (register plugin)

- [ ] **Step 1: Add portable-pty dependency**

Add `portable-pty = "0.8.1"` to `Cargo.toml` dependencies (pin to specific patch version to avoid breaking changes). Verify it compiles with current Rust stable and Tauri v2's MSRV before proceeding.

- [ ] **Step 2: Implement PTY plugin**

Custom Tauri plugin with IPC events per spec §14:
- `pty_create(command, args, cwd, cols, rows)`: Create a PTY using `portable-pty::CommandBuilder` with ConPTY backend on Windows. Store PTY handle in plugin state (HashMap<PtyId, PtyHandle>). Spawn reader thread that emits `pty-data` events with output bytes.
- `pty_write(pty_id, data)`: Send keystrokes to PTY stdin.
- `pty_resize(pty_id, cols, rows)`: Resize the PTY.
- `pty_destroy(pty_id)`: Kill the child process and clean up.

**Critical: PTY exit handling.** The reader thread must detect EOF on the PTY output (child process exited), emit a `pty-exit` event with the exit code to the frontend, and clean up the HashMap entry. Without this, the frontend shows a dead terminal with no indication the process ended. Handle both explicit `pty_destroy` calls and autonomous process exit (e.g., user types `/exit`, CLI crashes).

One PTY per app-started session. Lifecycle: created on "Start Session", destroyed on session end or app close.

- [ ] **Step 3: Register plugin in lib.rs**

`.plugin(pty::plugin::init())`

- [ ] **Step 4: Verify compilation**

`cargo check` — expect clean. Also write a basic Rust integration test: create a PTY with a simple command (e.g., `echo hello`), read output, verify it contains "hello", then destroy.

**Verification**

*Unit tests* — Rust-side only; see *Rust checks* below.

*Component / integration tests* — N/A (no JS changes in this task; PTY consumer covered in Task 4 with mocked IPC).

*Data-fixture tests* — N/A.

*Rust checks* (`src-tauri/src/pty/`):
- [ ] `cd src-tauri && cargo check` clean with `portable-pty = "0.8.1"` pinned
- [ ] `cargo test pty::` green: spawn → write → read → resize → destroy lifecycle on a benign command (`echo hello` / `cmd /c echo hello` on Windows)
- [ ] EOF / autonomous-exit path emits a `pty-exit` event with exit code, then removes the PTY from the HashMap
- [ ] explicit `pty_destroy` kills child and cleans state (no zombie handles)
- [ ] resize updates cols/rows without errors on Windows ConPTY backend

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors (no JS changes, but verify nothing else regressed)

*Perf budget* — N/A here (terminal throughput measured in Task 4).

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] from devtools, invoke `pty_create` with `cmd /c dir`, observe `pty-data` events streaming, then `pty-exit` fires with code 0
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §14 and DESIGN-CONTEXT §2.6 (custom plugin, ConPTY on Windows, IPC events `pty-data`/`pty-input`/`pty-resize`/`pty-exit`)
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.3): custom Rust PTY plugin with ConPTY support`

- [ ] **Step 5: Commit**

`git commit -m "feat: add custom Rust PTY plugin with ConPTY support"`

---

### Task 4: Terminal View (xterm.js)

**Files:**
- Create: `src/lib/pty-types.ts`
- Create: `src/stores/pty-store.ts`
- Create: `src/components/terminal/TerminalView.tsx`

- [ ] **Step 1: Add xterm.js dependency**

`npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links` (Note: package was renamed to `@xterm/xterm` in v5+, NOT the old `xterm` package)

- [ ] **Step 2: Implement PTY store**

State: `activePty: { id: string; sessionId: string } | null`.
Actions: `createPty(sessionId, command, args, cwd)`, `destroyPty()`.

- [ ] **Step 3: Implement TerminalView**

React component wrapping xterm.js Terminal instance. On mount:
1. Create Terminal with theme colors from CSS custom properties
2. Load fit addon for auto-resize
3. Connect to PTY via Tauri IPC events:
   - Listen for `pty-data` events → write to terminal
   - Listen for `pty-exit` events → show "Process exited (code N)" message, disable input
   - On terminal data (keystrokes) → emit `pty-input` event
   - On resize → emit `pty-resize` event
4. Clean up on unmount

Integrate into SessionDetailPanel: when a session is ALIVE and app-started, show TerminalView instead of conversation viewer (per spec §5.7).

**Verification**

*Unit tests* (`tests/stores/pty-store.test.ts`):
- [ ] case 1: `createPty` sets `activePty` and invokes mocked `pty_create`
- [ ] case 2: `destroyPty` clears `activePty` and invokes mocked `pty_destroy`
- [ ] case 3: error path — `pty_create` rejection leaves store in a clean state

*Component / integration tests* (`tests/components/terminal/TerminalView.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/event` `listen` and `@tauri-apps/api/core` `invoke` — DO NOT spawn a real shell):
- [ ] mounts without console errors and creates an xterm Terminal instance
- [ ] interaction: emitted `pty-data` event payload is written to the terminal (assert via terminal buffer or a write spy)
- [ ] interaction: typed keystrokes (`onData`) emit `pty-input` with payload
- [ ] interaction: container resize emits `pty-resize` with cols/rows
- [ ] interaction: `pty-exit` event renders the "Process exited (code N)" line and disables input
- [ ] cleanup on unmount: listeners removed, `pty_destroy` invoked
- [ ] dark + light theme parity (theme colors sourced from CSS custom properties)

*Data-fixture tests* — N/A (no config / SQLite / FS reads).

*Rust checks* — N/A (no `src-tauri/` changes; consumed plugin from Task 3).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget*:
- [ ] sustained `pty-data` throughput of 1000 lines/sec without dropping frames or queue overflow (synthetic test feeding the terminal in a tight loop with mocked events)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] start a new session from the dialog; terminal mounts and shows the `claude` prompt
- [ ] type `ls` (or `dir` on Windows) — output renders
- [ ] resize the window — terminal redraws and child process sees new size
- [ ] dark + light render correctly (theme colors update)
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §5.7 and DESIGN-CONTEXT §2.6
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.4): xterm.js terminal view with PTY integration`

- [ ] **Step 4: Commit**

`git commit -m "feat: add xterm.js terminal view with PTY integration"`

---

### Task 5: Command Palette

**Files:**
- Create: `src/stores/command-palette-store.ts`
- Create: `src/components/dialogs/CommandPalette.tsx`
- Create: `tests/stores/command-palette-store.test.ts`

- [ ] **Step 1: Write failing tests**

Test: palette starts closed, opens/closes, filters commands by search query, matches partial text.

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement command palette store**

State: `isOpen: boolean`, `searchQuery: string`.
Actions: `open()`, `close()`, `setQuery(q)`.

Define command registry with groups per spec §3.3:
- **Navigation**: Go to Dashboard, Sessions, Plugins, Skills, MCP, Settings (with Ctrl+1-6 badges)
- **Sessions**: New Session, Quick Session, Resume Latest (find most recent ENDED session and run `claude --resume <id>`), Search Sessions
- **Actions**: Rebuild Stats, Check Plugin Updates, Export Stats, Open Config Directory

Each command: `{ id, label, group, shortcut?, action: () => void }`.

Computed: `filteredCommands()` — case-insensitive substring match on `label`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Implement CommandPalette**

Centered overlay (520px wide), semi-transparent backdrop. Search input at top. Grouped results below. Each item: label + keyboard shortcut badge where applicable. Arrow key navigation, Enter to select, Esc to close. Per spec §3.3.

- [ ] **Step 6: Wire into App.tsx**

Ctrl+K opens palette. Render `<CommandPalette />` in App.tsx when open.

**Verification**

*Unit tests* (`tests/stores/command-palette-store.test.ts`):
- [ ] case 1: starts closed (`isOpen === false`, empty `searchQuery`)
- [ ] case 2: `open()` / `close()` / `setQuery(q)` mutate state correctly
- [ ] case 3: `filteredCommands()` is case-insensitive substring match on `label`
- [ ] case 4: fuzzy ranking — exact prefix > word-start > substring; ties broken by group order
- [ ] case 5: recents bias — recently invoked commands rank above equally-scoring fresh entries
- [ ] case 6: empty query returns the full grouped registry (Navigation / Sessions / Actions)
- [ ] case 7: error / edge — query of pure whitespace behaves like empty; non-matching query yields empty list

*Component / integration tests* (`tests/components/dialogs/CommandPalette.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` if any command actions invoke Rust):
- [ ] mounts without console errors when `isOpen=true`
- [ ] interaction: `Ctrl+K` opens the palette, focus lands on the search input
- [ ] interaction: typing filters the visible list; arrow keys move selection; Enter invokes the selected command's `action`
- [ ] interaction: Esc closes
- [ ] empty-state: query with zero matches shows a "No commands" placeholder
- [ ] dark + light theme parity
- [ ] dialog focus-trap + Esc closes

*Data-fixture tests* — N/A (in-memory registry only).

*Rust checks* — N/A.

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (registry is small).

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] `Ctrl+K` opens palette anywhere in the app
- [ ] type "sett" → "Go to Settings" ranks first; Enter routes to Settings section
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §3.3
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.5): Command Palette (Ctrl+K)`

- [ ] **Step 7: Commit**

`git commit -m "feat: add Command Palette (Ctrl+K)"`

---

### Task 6: Settings Types & Config Commands

**Files:**
- Create: `src/lib/config-types.ts` (extend with settings types — this file was CREATED in Task 1, MODIFY here)
- Create: `src-tauri/src/config/mod.rs`, `src-tauri/src/config/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Define settings types**

`SettingsJson`: permissions (allow list), env vars, enabledPlugins map, skipDangerousModePermissionPrompt.
`ConfigJson`: primaryApiKey, ANTHROPIC_BASE_URL.
`AppearanceSettings`: theme, terminalFontSize, terminalFontFamily, compactMode. These are stored in app SQLite (app_settings table), NOT in Claude Code config.

- [ ] **Step 2: Implement Rust config commands**

`read_settings_json()`: Read `~/.claude/settings.json`.
`write_settings_json(content: String)`: Write back. **Critical:** Use atomic write-to-temp-then-rename for all config writes to prevent corruption if the app crashes mid-write.
`read_settings_local_json()`: Read `~/.claude/settings.local.json` (machine-specific overrides, mainly permissions).
`read_config_json()`: Read `~/.claude/config.json` (API key).
`write_config_json(content: String)`: Write back (atomic write).
`read_claude_json()`: Read `~/.claude.json`. (If this Rust command was already created in Phase 3, reuse it. Otherwise add it here.)
`write_claude_json(content: String)`: Write back (atomic write). Needed for MCP server and any other `~/.claude.json` modifications.

- [ ] **Step 3: Register commands**

**Verification**

*Unit tests* (`tests/lib/config-types.test.ts`):
- [ ] case 1: `SettingsJson` parser accepts a real-world `~/.claude/settings.json` fixture
- [ ] case 2: `ConfigJson` parser tolerates missing optional fields (`ANTHROPIC_BASE_URL`)
- [ ] case 3: error path — malformed JSON surfaces a typed error, never silently coerces

*Component / integration tests* — N/A (no UI yet; Settings UI lands in Task 8).

*Data-fixture tests*:
- [ ] fixtures at `tests/fixtures/settings/` covering: minimal `settings.json`, full `settings.json` with all 6 permission modes referenced, missing `settings.local.json`, missing `config.json`, missing `~/.claude.json`
- [ ] write path produces valid JSON for each file (round-trip parse byte-stable modulo whitespace)
- [ ] atomic write: temp-file-then-rename; simulate mid-write crash by killing between temp write and rename → original file intact
- [ ] never write malformed JSON: reject upstream when `JSON.parse` fails before invoking the Rust write command

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean after adding `config/mod.rs` and `config/commands.rs`
- [ ] `cargo test config::` green: read-missing-file returns typed error; write uses temp-then-rename (verify temp file path during write, original unchanged on simulated rename failure)
- [ ] reuses existing `read_claude_json` if Phase 3 already added it

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A.

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] from devtools, invoke each new command; reads return real file contents, writes round-trip without corruption
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §7 (Settings) and §9.2
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.6): config file read/write commands`

- [ ] **Step 4: Commit**

`git commit -m "feat: add config file read/write commands"`

---

### Task 7: Settings Store

**Files:**
- Create: `src/stores/settings-store.ts`

- [ ] **Step 1: Implement settings store**

State: `activeSettingsSection: string` (7 sections), `settingsData` (loaded from config files), `appearanceSettings` (from SQLite), `isLoading`, `isDirty`.

Actions: `loadSettings()` (read all config files + SQLite appearance row), `saveSettings(section, data)` (write to appropriate file), `setActiveSection(section)`.

7 sections per spec §9.2: General/API, Permissions, Plugins, Environment, Appearance, Usage & Stats, Advanced. Each reads from different source files.

**Verification**

*Unit tests* (`tests/stores/settings-store.test.ts`):
- [ ] case 1: `loadSettings()` populates `settingsData` from mocked Rust commands (settings.json, settings.local.json, config.json, ~/.claude.json) + appearance from SQLite
- [ ] case 2: `setActiveSection(s)` updates only `activeSettingsSection`; switching sections does not refetch unless dirty
- [ ] case 3: `saveSettings(section, data)` routes to the correct backing file (e.g. Permissions → settings.json + settings.local.json merge; Appearance → SQLite)
- [ ] case 4: `isDirty` flips on local edits and clears after successful save
- [ ] case 5: error path — Rust read failure leaves store in `isLoading=false` with a typed error; no partial state

*Component / integration tests* — N/A (UI lands in Task 8).

*Data-fixture tests*:
- [ ] fixtures at `tests/fixtures/settings-store/` covering empty, partial, and full settings trees across all 7 sections
- [ ] write path produces valid JSON (round-trip parse) for each section's target file

*Rust checks* — N/A (consumes Task 6 commands).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A.

*Manual UI / E2E smoke* — deferred to Task 8 once UI is wired.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §7 and §9.2
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.7): settings Zustand store`

- [ ] **Step 2: Commit**

`git commit -m "feat: add settings Zustand store"`

---

### Task 8: Settings UI Components

**Files:**
- Create: all files under `src/components/settings/`
- Modify: `src/sections/SettingsSection.tsx`

- [ ] **Step 1: Implement SettingsLayout**

Two-column layout per spec §9.1: left sidebar (200px) with 7 section links + active indicator, right content area renders active section component.

- [ ] **Step 2: Implement GeneralSettings**

Fields: API base URL (text), auth token (masked with reveal toggle), default model (dropdown), small/fast model (dropdown), primary API key (masked). Read from `config.json` + `settings.json` env vars.

- [ ] **Step 3: Implement PermissionsSettings**

Read from `settings.json` + `settings.local.json` (merged). Show `permissions.allow` list (editable, can add/remove patterns). Show `skipDangerousModePermissionPrompt` toggle with red warning if true.

- [ ] **Step 4: Implement PluginsSettings**

Toggle list of all plugins (mirrors enabledPlugins from settings.json). Each item links to the Plugins section for details.

- [ ] **Step 5: Implement EnvironmentSettings**

Key-value editor for `settings.json` → `env` object. Add/remove/edit rows.

- [ ] **Step 6: Implement AppearanceSettings**

Theme toggle: Light / Dark / System (stored in app SQLite). Terminal font size slider, terminal font family dropdown. **Sidebar position** (left/right per spec §9.2). Compact mode toggle. **Note per spec §9.2:** Claude Code has ZERO theme settings — appearance is app-only.

- [ ] **Step 7: Implement UsageStatsSettings**

Read from `~/.claude/stats-cache.json` (read-only display). Model token usage table. Activity heatmap. Export buttons: CSV and JSON.

- [ ] **Step 8: Implement AdvancedSettings**

Raw JSON editor (use a textarea or lightweight code editor — Monaco is heavy, consider CodeMirror or a simple pre/textarea). Config file paths with "Open in File Browser" buttons. Debug info (app version, Tauri version, Claude CLI version, OS). Reset app data button (confirmation dialog, clears SQLite).

"Replay Tour" button → triggers first-launch tour.

- [ ] **Step 9: Wire up SettingsSection**

Replace placeholder with SettingsLayout. Load settings on mount. Handle save/cancel per section.

**Verification**

*Unit tests* — covered indirectly via store tests (Task 7); per-component pure-helper tests where present (`tests/components/settings/<helpers>.test.ts`):
- [ ] case 1: env-vars editor helper rejects duplicate keys
- [ ] case 2: permissions allow-list helper deduplicates and sorts patterns
- [ ] case 3: JSON-editor save guard rejects content where `JSON.parse` throws (Advanced section)

*Component / integration tests* (`tests/components/settings/*.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core`, `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-fs`; substitute Monaco with a textarea via mock since RTL/jsdom does not run Monaco):
- [ ] mounts without console errors for each of the 7 section components
- [ ] interaction (General): masked auth token + reveal toggle works
- [ ] interaction (Permissions): adding a pattern and saving invokes write with merged settings.json + settings.local.json; toggling `skipDangerousModePermissionPrompt` shows red warning
- [ ] interaction (Plugins): toggle persists into `enabledPlugins`
- [ ] interaction (Environment): add / edit / remove env-var rows
- [ ] interaction (Appearance): theme switch applies immediately; sidebar position toggle persists
- [ ] interaction (Usage & Stats): export CSV + JSON buttons trigger downloads with mocked stats-cache
- [ ] interaction (Advanced): malformed JSON in editor disables Save and shows parse error; valid JSON saves; "Replay Tour" triggers first-launch tour; Reset App Data shows confirmation
- [ ] sidebar: 7 section links, active indicator follows `activeSettingsSection`
- [ ] dark + light theme parity
- [ ] dialog focus-trap + Esc closes (for Reset confirmation modal)

*Data-fixture tests*:
- [ ] fixture at `tests/fixtures/settings-ui/` mirroring real `~/.claude/` files
- [ ] write path produces valid JSON (round-trip parse) for every section's save action; corrupt JSON in Advanced editor never reaches disk

*Rust checks* — N/A (consumes Task 6 commands).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget*:
- [ ] Permissions allow-list with 100+ patterns: virtualized list, first paint < 100ms

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] navigate to Settings, click each of the 7 sections — content renders, no console errors
- [ ] edit a value in General, save, re-open — value persisted in `config.json`
- [ ] Advanced JSON editor: paste invalid JSON → Save disabled; fix → Save enabled
- [ ] dark + light render correctly across all sections
- [ ] keyboard: tab order traverses sidebar then content
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §7 and §9.1 / §9.2
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.8): Settings section with all 7 subsections`

- [ ] **Step 10: Commit**

`git commit -m "feat: add Settings section with all 7 subsections"`

---

### Task 9: First Launch Flow

**Files:**
- Create: `src/stores/first-launch-store.ts`
- Create: `src/components/first-launch/PrereqCheck.tsx`, `AutoImport.tsx`, `GuidedTour.tsx`

- [ ] **Step 1: Implement first-launch store**

State: `hasCompletedFirstLaunch: boolean` (from SQLite app_settings), `currentStep: 1 | 2 | 3`, `prereqStatus` (per check), `importProgress`, `tourStep`.

Actions: `checkPrereqs()`, `startImport()`, `advanceTour()`, `completeFirstLaunch()`.

On app start, check `app_settings.first_launch_completed`. If not set, show first-launch flow instead of normal app.

- [ ] **Step 2: Implement PrereqCheck (Step 1)**

Centered card per spec §11.1. Four checks:
1. Claude Code CLI installed: use `std::process::Command::new("where").arg("claude")` on Windows (NOT `which` — that's Unix-only). Check exit code for success.
2. Config directory exists: check `~/.claude/` via Tauri fs
3. API key configured: read `config.json` → `primaryApiKey`
4. API reachable: HEAD request to ANTHROPIC_BASE_URL (non-blocking, don't block on failure)

Each shows green checkmark or yellow spinner. Continue button enabled when all critical checks pass. Skip link available.

- [ ] **Step 3: Implement AutoImport (Step 2)**

Per spec §11.2. Scans `~/.claude/projects/*/`, enumerates JSONL files, groups by project, creates SQLite entries (same pipeline as session-loader). Shows:
- Progress bar with percentage
- Stats: projects found, sessions found, messages indexed
- Log-style list of projects being imported

- [ ] **Step 4: Implement GuidedTour (Step 3)**

5-step spotlight overlay per spec §11.3:
1. Dashboard — highlight sidebar icon + content area
2. Sessions — highlight sidebar icon
3. MCP Servers — highlight sidebar icon
4. Quick Actions — highlight area in dashboard
5. Settings — highlight sidebar icon

Each step: spotlight ring on target element, tooltip with title + description + step counter (e.g., "2/5"). Next/Skip/Done buttons. Dismissible.

- [ ] **Step 5: Wire into App.tsx**

Check first-launch state on mount. If incomplete, render first-launch flow instead of normal layout. After completion, write `first_launch_completed = true` to SQLite and show normal app.

**Verification**

*Unit tests* (`tests/stores/first-launch-store.test.ts`):
- [ ] case 1: starts at `currentStep=1` when `hasCompletedFirstLaunch=false`
- [ ] case 2: `checkPrereqs()` populates `prereqStatus` for each of the 4 checks (CLI present/absent, config dir exists/missing, API key set/unset, API reachable/unreachable)
- [ ] case 3: `startImport()` advances `importProgress` deterministically with mocked importer
- [ ] case 4: `advanceTour()` walks 1 → 5; `completeFirstLaunch()` writes `first_launch_completed=true` to SQLite
- [ ] case 5: error path — failing API reachability check is non-blocking (does not prevent Continue)

*Component / integration tests* (`tests/components/first-launch/*.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` for `where claude` / fs / fetch, `@tauri-apps/plugin-sql` for SQLite, mock importer):
- [ ] mounts without console errors
- [ ] PrereqCheck: each of the 4 prereqs renders green / yellow / red across all combinations; Continue disabled until critical checks pass; Skip link works
- [ ] AutoImport: progress bar advances as mocked importer emits events; stats render (projects / sessions / messages); per-project log appends
- [ ] GuidedTour: each of the 5 steps renders with spotlight + tooltip + "N/5" counter; Next advances; Skip dismisses; Done completes
- [ ] dark + light theme parity
- [ ] dialog focus-trap + Esc closes (where applicable)

*Data-fixture tests*:
- [ ] fixture at `tests/fixtures/first-launch/` covering: no `~/.claude/`, partial `~/.claude/projects/`, full multi-project tree
- [ ] write path produces valid JSON / valid SQLite rows after import (round-trip read)

*Rust checks* — only if a new prereq command (`check_cli_installed` running `where claude`) is added:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green for the prereq command

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget* — N/A (one-time flow).

*Manual UI / E2E smoke* (run `npx tauri dev` after wiping SQLite via Settings → Advanced → Reset):
- [ ] first launch flow appears instead of the normal app
- [ ] PrereqCheck shows real status for the dev box
- [ ] AutoImport scans real `~/.claude/projects/` and reports realistic numbers
- [ ] GuidedTour: 5 steps render with spotlights on the correct sidebar icons / dashboard areas
- [ ] after completion, app reloads into normal layout; relaunching does NOT re-show the flow
- [ ] dark + light render correctly
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §9 (First Launch) and §11.1 / §11.2 / §11.3
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.9): First Launch flow with prerequisites, import, and tour`

- [ ] **Step 6: Commit**

`git commit -m "feat: add First Launch flow with prerequisites, import, and tour"`

---

### Task 10: Data Refresh & File Watching

**Files:**
- Modify: `src/stores/session-store.ts` (add FS watchers)
- Modify: `src/stores/mcp-store.ts` (add polling)

- [ ] **Step 1: Implement session FS watchers**

Per spec §13:
- Watch `~/.claude/sessions/` directory for PID file changes → update alive/ended states immediately
- PID liveness poll: 5s when Sessions section visible, 30s when backgrounded
- Watch JSONL file of currently-viewed session → incremental read for live updates (byte offset tracking per spec §17.11)
- On file change: if mtime > lastSyncedAt, re-parse metadata

Use `tauri-plugin-fs` → `watch()` API. Add polling fallback for reliability.

- [ ] **Step 2: Implement incremental JSONL reading**

Per spec §17.11. **Must be a Rust IPC command** (`read_jsonl_incremental(path, offset) → { lines: Vec<String>, new_offset: u64 }`) for performance with large files:
- Track byte offset per session file
- On FS watch trigger: seek to last offset, read new bytes
- Partial line handling: buffer incomplete lines, retry on next trigger
- File truncation: if size < last offset, reset to 0 and re-parse
- Never acquire locks (Claude CLI owns write access)

- [ ] **Step 3: Implement MCP status polling**

MCP status refresh intervals per spec §13: 15s when panel visible, 60s background, 2s after action.

- [ ] **Step 4: Implement stats refresh**

Read stats-cache.json on mount + window focus. Manual rebuild via Quick Action button.

Plugin update checks: git SHA comparison on panel open, cached 1hr.

**Verification**

*Unit tests* (`tests/stores/refresh.test.ts`):
- [ ] case 1: PID-liveness poll interval flips between 5s (visible) and 30s (backgrounded) per spec §13
- [ ] case 2: incremental JSONL reader honors byte offsets — second call returns only new lines
- [ ] case 3: file-truncation path resets offset to 0 and re-parses
- [ ] case 4: partial-line buffering — incomplete trailing line held until next read completes it
- [ ] case 5: MCP polling cadence: 15s visible / 60s background / 2s post-action
- [ ] case 6: stats refresh triggers on mount and window focus, not on every render
- [ ] case 7: plugin SHA cache honors 1hr TTL

*Component / integration tests* — N/A (store-level logic; UI consumes via existing components).

*Data-fixture tests*:
- [ ] fixture at `tests/fixtures/refresh/` with JSONL files exercising: append-only growth, mid-line append (partial line), truncation-then-append
- [ ] read path produces valid parsed records (round-trip verified)

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean after adding `read_jsonl_incremental`
- [ ] `cargo test` green: append, truncate, partial-line cases for the incremental reader; never acquires write locks (asserted via opening with read-only handle)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable`

*Perf budget*:
- [ ] incremental JSONL read on a 50 MB file completes within 50ms when only a few KB is appended (no full re-parse)
- [ ] FS watcher wakeups do not exceed 1 re-parse per appended chunk (no thrash)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] start a real `claude` session in another terminal; sessions section flips to ALIVE within 5s
- [ ] open the live session — conversation viewer streams new messages as the JSONL grows
- [ ] kill the process — session flips to ENDED within 5s
- [ ] MCP panel updates within 15s of an external change
- [ ] DevTools Console: zero errors

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §13 and §17.11
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T4.10): data refresh with FS watchers and polling`

- [ ] **Step 5: Commit**

`git commit -m "feat: add data refresh with FS watchers and polling"`

---

### Task 11: Final Integration & Verification

**Verification**

*Unit tests*:
- [ ] case 1: full vitest suite green (`npx vitest run`) across all Phase 4 tasks
- [ ] case 2: no test marked `.skip` or `.todo` slipped in unintentionally

*Component / integration tests* — covered by per-task suites; this task just gates them as a whole.
- [ ] all RTL component suites pass with mocks for `@tauri-apps/api/core`, `@tauri-apps/plugin-sql`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-notification`, and PTY IPC events
- [ ] dark + light theme parity verified across every Phase 4 component
- [ ] dialog focus-trap + Esc closes for all dialogs (New Session, Command Palette, Reset confirmation)

*Data-fixture tests*:
- [ ] every Phase 4 fixture under `tests/fixtures/` exercised at least once by a test
- [ ] all write paths produce valid JSON (round-trip parse) with no malformed writes leaked to user files

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green for `pty::`, `config::`, and JSONL incremental reader

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `any` / `@ts-ignore` / `eslint-disable` introduced anywhere in Phase 4
- [ ] notifications path: assert `@tauri-apps/plugin-notification` is invoked with the expected payload on session-end events

*Perf budget* (spec §17.8):
- [ ] warm start <2s to interactive
- [ ] session list render <100ms for 200 items
- [ ] conversation viewer open <500ms for large JSONL
- [ ] search filter <50ms after debounce
- [ ] terminal sustains 1000 lines/sec without dropping (Task 4 budget)
- [ ] permissions allow-list virtualization first paint <100ms (Task 8 budget)

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] reset via Settings > Advanced > Reset, then walk the entire first-launch flow end-to-end
- [ ] dark + light render correctly across every section
- [ ] every keyboard shortcut works (Ctrl+1-6, Ctrl+N, Ctrl+Shift+N, Ctrl+K, Esc)
- [ ] DevTools Console: zero errors during a 5-minute exploratory session
- *Existing notes:*

  - [ ] **Step 1: Run all tests** — `npx vitest run` — expect all PASS

  - [ ] **Step 2: Rust compilation** — `cargo check` — expect clean

  - [ ] **Step 3: Full feature verification**

  `npx tauri dev` — verify all features end-to-end:
  - First launch flow (reset via Settings > Advanced > Reset)
  - Dashboard with real stats
  - Session browsing, search, 3 view modes
  - Conversation viewer for ended sessions
  - Terminal for new sessions started from dialog
  - Plugin list with real installed plugins
  - Skills list with real custom skills
  - MCP server management (view, add, edit, remove)
  - Command palette (Ctrl+K)
  - All Settings sections
  - Theme switching (light/dark/system)
  - All keyboard shortcuts

  - [ ] **Step 4: Performance check**

  Verify spec §17.8 bounds:
  - Warm start: <2s to interactive
  - Session list render: <100ms for 200 items
  - Conversation viewer open: <500ms for large JSONL
  - Search filter: <50ms after debounce

  - [ ] **Step 5: Final commit**

  `git commit -m "chore: Phase 4 Dialogs & Polish complete — all features implemented"`

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §3.3, §5.7, §7, §8, §9, §10, §13, §14, §17.8, §17.11 (all Phase 4 sections)
- [ ] Plan checkbox `[x]` for every Task 4.1–4.11
- [ ] Commit: `chore(T4.11): Phase 4 Dialogs & Polish complete`
