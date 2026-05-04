# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a runnable Tauri v2 desktop app with React frontend, sidebar navigation, theme system, and SQLite database — the shell everything else plugs into.

**Architecture:** Tauri v2 Rust backend with React 19 + TypeScript frontend. Zustand for state, Tailwind CSS v4 for styling with CSS custom properties for theming. SQLite via tauri-plugin-sql for app-local persistence. Single-instance enforcement via tauri-plugin-single-instance.

**Tech Stack:** Tauri v2, React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, tauri-plugin-sql (SQLite), tauri-plugin-single-instance, tauri-plugin-fs, tauri-plugin-notification, tauri-plugin-path

---

## File Structure

```
claude-manager/
├── src-tauri/
│   ├── Cargo.toml                    # Rust deps: tauri 2, plugins (sql, fs, notification, single-instance, path)
│   ├── build.rs                      # tauri_build::build()
│   ├── tauri.conf.json               # Window config, plugin config — NO sql.preload (use dynamic loading)
│   ├── capabilities/
│   │   └── default.json              # Tauri v2 capability permissions
│   └── src/
│       ├── lib.rs                    # Tauri app builder, plugin registration, IPC command handlers
│       ├── main.rs                   # Windows subsystem entry point
│       └── db.rs                     # SQLite path resolution + schema constants
├── src/
│   ├── main.tsx                      # React entry point
│   ├── vite-env.d.ts                 # Vite client types (/// <reference types="vite/client" />)
│   ├── App.tsx                       # Root layout: sidebar + content area + theme + keyboard shortcuts
│   ├── index.css                     # Tailwind v4 directives (@import "tailwindcss", @theme) + dark mode overrides
│   ├── stores/
│   │   ├── theme-store.ts            # Zustand: mode (light/dark/system), resolved theme, setMode
│   │   └── navigation-store.ts       # Zustand: activeSection, navigateTo
│   ├── components/
│   │   ├── SidebarRail.tsx           # 48px icon sidebar with 6 nav items
│   │   ├── SidebarRailItem.tsx       # Single nav item (icon + label + active indicator)
│   │   └── ContentArea.tsx           # Section router — maps activeSection to component
│   ├── sections/
│   │   ├── DashboardSection.tsx      # Placeholder
│   │   ├── SessionsSection.tsx       # Placeholder
│   │   ├── PluginsSection.tsx        # Placeholder
│   │   ├── SkillsSection.tsx         # Placeholder
│   │   ├── McpSection.tsx            # Placeholder
│   │   └── SettingsSection.tsx       # Placeholder
│   └── lib/
│       └── db.ts                     # TypeScript DB helper: init schema, query wrappers
├── index.html
├── vite.config.ts                    # Vite + React + Tailwind v4 plugin + vitest config
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .gitignore
└── tests/
    ├── setup.ts                      # Vitest + testing-library setup
    ├── stores/
    │   ├── theme-store.test.ts
    │   └── navigation-store.test.ts
    └── components/
        ├── SidebarRail.test.tsx
        └── ContentArea.test.tsx
```

---

### Task 1: Scaffold Tauri v2 + React + Vite Project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts` (minimal "Hello" versions)

- [x] **Step 1: Try `npm create tauri-app@latest . -- --template react-ts --manager npm --force`**

If it fails due to existing files, create manually. Either way, verify the result matches the structure above.

- [x] **Step 2: Set up `package.json` with all dependencies**

Runtime deps: `@tauri-apps/api@^2`, `@tauri-apps/plugin-sql@^2`, `@tauri-apps/plugin-fs@^2`, `@tauri-apps/plugin-notification@^2`, `react@^19`, `react-dom@^19`, `zustand@^5`, `lucide-react@^0.400`.

> **Note:** `@tauri-apps/plugin-single-instance` and `@tauri-apps/plugin-path` are NOT npm packages. Single-instance is Rust-only (no JS API). Path utilities ship in core (`@tauri-apps/api/path`).

Dev deps: `@tauri-apps/cli@^2`, `@types/react@^19`, `@types/react-dom@^19`, `@testing-library/react@^16`, `@testing-library/jest-dom@^6`, `@vitejs/plugin-react@^4`, `jsdom@^25`, `tailwindcss@^4`, `@tailwindcss/vite@^4`, `typescript@^5.6`, `vite@^6`, `vitest@^3`.

Scripts: `dev`, `build`, `tauri`, `test` (vitest run), `test:watch` (vitest).

- [x] **Step 3: Configure Vite**

`vite.config.ts`: React plugin + Tailwind CSS v4 vite plugin. Dev server on port 1420, strict port, watch ignores `src-tauri/**`. Include vitest config block: globals true, jsdom environment, setup file, css false.

- [x] **Step 4: Create TypeScript configs**

`tsconfig.json`: target ES2021, jsx react-jsx, strict, bundler module resolution, include `src`.
`tsconfig.node.json`: target ES2022, include `vite.config.ts`.

- [x] **Step 5: Create `index.html` and minimal React entry**

Standard Vite HTML with `<div id="root">` and module script pointing to `src/main.tsx`. Minimal `App.tsx` that renders a div with theme classes.

- [x] **Step 6: Set up Tauri Rust backend**

`Cargo.toml` dependencies: `tauri@2`, `tauri-plugin-sql@2` (with `sqlite` feature), `tauri-plugin-fs@2`, `tauri-plugin-notification@2`, `tauri-plugin-single-instance@2`, `serde@1` (with derive), `serde_json@1`.

`lib.rs`: Register all 4 plugins (sql, fs, notification, single-instance). **Critical:** `use tauri::Manager;` is required for `get_webview_window` in the single-instance callback. **Note:** `tauri-plugin-path` is NOT a real Tauri v2 crate — path utilities are provided by `tauri::Manager::path()` directly in core.

`main.rs`: Windows subsystem attribute, calls `lib::run()`.

- [x] **Step 7: Configure Tauri (`tauri.conf.json` + capabilities)**

Window: 1200x800, min 900x600, title "Claude Manager", decorations true.
**Critical:** Do NOT include `plugins.sql.preload` — use dynamic `Database.load()` from TypeScript only.
Capabilities: core:default, sql (load/execute/select), fs (read/write/exists/mkdir/watch), notification. (No `path:default` — path is in core, not a separate plugin.)

- [x] **Step 8: Create `.gitignore`**

Include: `node_modules/`, `dist/`, `target/`, `*.db`, `.vite/`. Keep `Cargo.lock` (it's an application, not a library).

- [x] **Step 9: Install deps and verify**

`npm install`, then `npx tauri info` to confirm Tauri v2, Rust toolchain, and Webview2. Then `cd src-tauri && cargo check` to verify Rust compiles.

- [x] **Step 10: Commit**

`git add -A && git commit -m "feat: scaffold Tauri v2 + React 19 + Vite project"`

**Verification**

*Unit tests* — N/A (no application logic shipped in this task; scaffolding only).

*Component / integration tests* — N/A (no components beyond a "Hello" placeholder; real component tests start at T1.4).

*Data-fixture tests* — N/A (no SQLite / JSONL / `~/.claude/` reads in this task).

*Rust checks* — task touches `src-tauri/`:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green (no tests yet, so `0 passed` is acceptable)

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A (no scans or large list rendering in scaffold).

*Manual UI / E2E smoke*:
- [ ] `npm run dev` serves Vite on `http://localhost:1420`
- [ ] `npx tauri dev` opens a 1200x800 window titled "Claude Manager"
- [ ] DevTools Console: zero errors / React warnings
- *Existing notes:* `npx tauri info` confirms Tauri v2 + Rust toolchain + Webview2; `cd src-tauri && cargo check` verifies Rust compiles.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "Tech Stack" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.1): scaffold Tauri v2 + React 19 + Vite project`

---

### Task 2: Tailwind CSS v4 + Theme System

**Files:**
- Create: `src/index.css`
- Create: `src/stores/theme-store.ts`
- Create: `tests/setup.ts`, `tests/stores/theme-store.test.ts`

- [x] **Step 1: Create vitest setup file**

`tests/setup.ts`: Import `@testing-library/jest-dom/vitest` for DOM matchers. Also add a global `window.matchMedia` mock (jsdom doesn't implement it) — return a mock that matches `prefers-color-scheme: dark` as false by default, with `addEventListener`/`removeEventListener` stubs.

- [x] **Step 2: Write failing tests for theme store**

Test file: `tests/stores/theme-store.test.ts`. Test cases:
- Defaults to dark mode (mode="dark", resolved="dark")
- `setMode("light")` → mode and resolved both become "light"
- `setMode("dark")` → switches back
- `setMode("system")` → resolved follows `matchMedia` result (mock `matchMedia` to return dark=true, verify resolved="dark")

- [x] **Step 3: Run tests — expect FAIL (module not found)**

- [x] **Step 4: Implement theme store**

`src/stores/theme-store.ts`: Zustand store with `mode` (light/dark/system), `resolved` (light/dark), `setMode`. The `resolveTheme` helper checks `window.matchMedia("(prefers-color-scheme: dark)")` when mode is "system".

- [x] **Step 5: Run tests — expect PASS**

- [x] **Step 6: Create `src/index.css` with Tailwind v4 theme**

**Critical:** Use `@import "tailwindcss"` (v4 syntax), NOT `@tailwind base/components/utilities` (v3 syntax).

Define all theme colors in `@theme {}` block using CSS custom property syntax: `--color-bg-primary: #0f0f1a;`. **Critical:** Tailwind v4 uses `--color-*` naming convention (e.g., `--color-bg-primary`, `--color-accent`), NOT v3-style JS config. See spec §12 for the exact color values. Both light (as base) and dark (via `.dark` class with CSS custom property reassignment). Colors needed: bg-primary, bg-secondary, bg-tertiary, text-primary, text-secondary, text-muted, accent, accent-hover, border, border-strong, status-green/yellow/red/blue, sidebar-bg, sidebar-active, card-bg, user-bubble.

Body: no margin, system font stack, antialiased. HTML: 150ms transition on bg/color. Dark scrollbar styling.

- [x] **Step 7: Commit**

`git commit -m "feat: add Tailwind CSS v4 theme system with dark/light/system modes"`

**Verification**

*Unit tests* (`tests/stores/theme-store.test.ts`):
- [ ] case 1: default state → `mode === "dark"` and `resolved === "dark"`
- [ ] case 2: `setMode("light")` → both `mode` and `resolved` become `"light"`
- [ ] case 3: `setMode("dark")` switches back to `"dark"`
- [ ] case 4: `setMode("system")` with `matchMedia` mocked to `matches: true` → `resolved === "dark"`
- [ ] case 5 (edge): `setMode("system")` with `matchMedia` mocked to `matches: false` → `resolved === "light"`

*Component / integration tests* — N/A (App.tsx is not yet wired; theme class is applied at T1.6, where component-level dark/light parity is exercised).

*Data-fixture tests* — N/A (no SQLite / JSONL / `~/.claude/` reads; theme persistence is layered in at T1.6 after T1.7 ships the DB).

*Rust checks* — N/A (no `src-tauri/` changes in this task).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A.

*Manual UI / E2E smoke* — N/A at this step (App not wired; manual smoke deferred to T1.6).
- *Existing notes:* `tests/setup.ts` mocks `window.matchMedia` (jsdom does not implement it) returning `prefers-color-scheme: dark` as `false` by default; tests then override per case. Tailwind v4 syntax: `@import "tailwindcss"` + `@theme {}` block with `--color-*` custom properties (NOT v3 `@tailwind base/components/utilities`).

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "Tech Stack" + §7 "Settings — Appearance" (theme is app-local) of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.2): add Tailwind CSS v4 theme system with dark/light/system modes`

---

### Task 3: Navigation Store

**Files:**
- Create: `src/stores/navigation-store.ts`
- Create: `tests/stores/navigation-store.test.ts`

- [x] **Step 1: Write failing tests**

Test: defaults to "dashboard", can navigate to each of the 6 sections (dashboard, sessions, plugins, skills, mcp, settings).

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement navigation store**

Export `Section` type as a TypeScript union type: `type Section = "dashboard" | "sessions" | "plugins" | "skills" | "mcp" | "settings"`. Use a union type (not enum) — this is idiomatic for Zustand/React. Export `useNavigationStore` with `activeSection` + `navigateTo`.

- [x] **Step 4: Run tests — expect PASS**

- [x] **Step 5: Commit**

`git commit -m "feat: add navigation store with 6 sections"`

**Verification**

*Unit tests* (`tests/stores/navigation-store.test.ts`):
- [ ] case 1: initial state → `activeSection === "dashboard"`
- [ ] case 2: `navigateTo("sessions")` → `activeSection === "sessions"`
- [ ] case 3: round-trip through all 6 sections (`dashboard`, `sessions`, `plugins`, `skills`, `mcp`, `settings`) each updates `activeSection`
- [ ] case 4 (type-level): `Section` union enforced — passing an invalid string fails `tsc --noEmit`

*Component / integration tests* — N/A (no component consumes this store until T1.4 / T1.5).

*Data-fixture tests* — N/A (no SQLite / JSONL / `~/.claude/` reads; navigation state is in-memory only).

*Rust checks* — N/A (no `src-tauri/` changes).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A.

*Manual UI / E2E smoke* — N/A at this step (deferred to T1.6).
- *Existing notes:* `Section` is a TypeScript union (`"dashboard" | "sessions" | "plugins" | "skills" | "mcp" | "settings"`), not an enum — idiomatic for Zustand/React.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "App Layout" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.3): add navigation store with 6 sections`

---

### Task 4: Sidebar Rail Component

**Files:**
- Create: `src/components/SidebarRail.tsx`, `src/components/SidebarRailItem.tsx`
- Create: `tests/components/SidebarRail.test.tsx`

- [x] **Step 1: Write failing tests**

Test: renders all 6 nav items (by aria-label), highlights active section (data-active attribute), navigates on click.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Implement SidebarRailItem**

Button with `aria-label`, `data-active`, icon, label text. Active state: accent color + left border indicator. Use `lucide-react` icons — NOT emoji characters (emoji rendering varies across platforms).

- [x] **Step 4: Implement SidebarRail**

48px wide nav column. 6 items: Dashboard, Sessions, Plugins, Skills, MCP Servers, Settings. Reads `activeSection` from navigation store.

- [x] **Step 5: Run tests — expect PASS**

- [x] **Step 6: Commit**

`git commit -m "feat: add SidebarRail component with 6 nav items"`

**Verification**

*Unit tests* — N/A (no pure logic; component-level only).

*Component / integration tests* (`tests/components/SidebarRail.test.tsx`, RTL + jsdom):
- [ ] mounts without console errors
- [ ] renders all 6 nav items by `aria-label` (`Dashboard`, `Sessions`, `Plugins`, `Skills`, `MCP Servers`, `Settings`)
- [ ] interaction: click on "Sessions" → navigation store `activeSection === "sessions"` and the corresponding `SidebarRailItem` has `data-active="true"`
- [ ] active item shows the left-border accent indicator (assert class / computed style)
- [ ] dark + light theme parity: toggle `document.documentElement.classList` between empty and `"dark"`, assert key tokens (active accent, sidebar bg) resolve in each

*Data-fixture tests* — N/A.

*Rust checks* — N/A.

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A.

*Manual UI / E2E smoke* — deferred to T1.6 (App not yet wired).
- *Existing notes:* Uses `lucide-react` icons (NOT emoji — emoji rendering varies across platforms). 48px wide rail. Active state: accent color + left border indicator.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "App Layout" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.4): add SidebarRail component with 6 nav items`

---

### Task 5: Content Area + Section Placeholders

**Files:**
- Create: `src/components/ContentArea.tsx`
- Create: `src/sections/DashboardSection.tsx`, `SessionsSection.tsx`, `PluginsSection.tsx`, `SkillsSection.tsx`, `McpSection.tsx`, `SettingsSection.tsx`
- Create: `tests/components/ContentArea.test.tsx`

- [x] **Step 1: Write failing tests**

Test: renders correct section heading when navigating to each of the 6 sections.

- [x] **Step 2: Run tests — expect FAIL**

- [x] **Step 3: Create 6 placeholder sections**

Each renders a heading + brief description. Dashboard → "Dashboard", Sessions → "Sessions", etc. MCP section heading is "MCP Servers" (not "MCP").

- [x] **Step 4: Implement ContentArea**

Maps `activeSection` from navigation store to the corresponding component. Simple object lookup + render.

- [x] **Step 5: Run tests — expect PASS**

- [x] **Step 6: Commit**

`git commit -m "feat: add ContentArea section router with 6 placeholder sections"`

**Verification**

*Unit tests* — N/A (router is a pure object lookup with no branching logic worth isolating from the component test).

*Component / integration tests* (`tests/components/ContentArea.test.tsx`, RTL + jsdom):
- [ ] mounts without console errors
- [ ] for each `activeSection` in `{dashboard, sessions, plugins, skills, mcp, settings}`, the correct heading is rendered (e.g. `mcp` → "MCP Servers", not "MCP")
- [ ] interaction: calling `navigateTo("plugins")` on the navigation store re-renders ContentArea with the Plugins heading
- [ ] all 6 placeholder sections mount individually without errors
- [ ] dark + light theme parity (toggle `document.documentElement.classList`, assert text + bg tokens)

*Data-fixture tests* — N/A.

*Rust checks* — N/A.

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A.

*Manual UI / E2E smoke* — deferred to T1.6.
- *Existing notes:* Each placeholder renders heading + brief description. MCP section heading is "MCP Servers" (not "MCP"). ContentArea is a simple object lookup keyed by `activeSection`.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "App Layout" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.5): add ContentArea section router with 6 placeholder sections`

---

### Task 6: Wire Up App.tsx — Layout + Theme + Keyboard Shortcuts

**Files:**
- Modify: `src/App.tsx`

- [x] **Step 1: Implement full App layout**

Flex row: `<SidebarRail />` + `<ContentArea />`, full viewport height, theme classes applied.

**Theme wiring:** Subscribe to `resolved` theme from store. Apply/remove `dark` class on `document.documentElement`. Also subscribe to `mode` — when mode is "system", register a `matchMedia` change listener. **Critical:** The `useEffect` for the system theme listener must re-run when `mode` changes (include `mode` in dependency array), otherwise switching to "system" mode won't register the listener. **Critical:** Return a cleanup function from the `useEffect` that removes the listener — without cleanup, toggling system mode on/off accumulates duplicate listeners.

**Theme persistence:** After SQLite is initialized (Task 7), load saved theme mode from `app_settings` table and call `setMode()`. Without this, cold starts always reset to the default mode.

**Keyboard shortcuts:** `Ctrl+1-6` → navigate to section. `Ctrl+,` → settings. Listen on `keydown`, check `ctrlKey` only (not shift/alt/meta). **Critical:** Call `e.preventDefault()` on matched shortcuts to prevent Chromium defaults (e.g., `Ctrl+N` opens new window). Also skip shortcuts if the active element is an `<input>`, `<textarea>`, or `[contenteditable]`.

- [x] **Step 2: Run all tests — expect all PASS**

- [x] **Step 3: Commit**

`git commit -m "feat: wire up App layout with sidebar, content area, theme, and keyboard shortcuts"`

**Verification**

*Unit tests* — N/A (App.tsx wiring is exercised through its component test; no isolated pure logic to unit-test separately).

*Component / integration tests* (`tests/components/App.test.tsx`, RTL + jsdom; mock `@tauri-apps/api/core` + `@tauri-apps/plugin-sql` for the persistence path):
- [ ] mounts without console errors
- [ ] applies `dark` class on `document.documentElement` when `resolved === "dark"`; removes it when `"light"`
- [ ] interaction: dispatch `keydown` `Ctrl+1` → navigation store `activeSection === "dashboard"`; `Ctrl+2..6` map in order to `sessions, plugins, skills, mcp, settings`
- [ ] `Ctrl+,` → `activeSection === "settings"`
- [ ] shortcut handler is skipped when `document.activeElement` is an `<input>`, `<textarea>`, or `[contenteditable]`
- [ ] `e.preventDefault()` is called on matched shortcuts (assert via spy)
- [ ] when `mode === "system"`, a `matchMedia` change listener is registered; switching `mode` away from `"system"` removes it (no leak)
- [ ] dark + light theme parity (toggle `document.documentElement.classList`, assert SidebarRail + ContentArea key tokens)

*Data-fixture tests* — only relevant once persistence (T1.7) is wired:
- [ ] with `app_settings.theme_mode = "light"` mocked, App calls `setMode("light")` on mount

*Rust checks* — N/A (no `src-tauri/` changes in this task).

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A.

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] window opens; clicking each of the 6 sidebar icons switches the content area
- [ ] `Ctrl+1` through `Ctrl+6` and `Ctrl+,` work; do NOT trigger Chromium defaults (e.g. `Ctrl+N` new window)
- [ ] focusing a text input and pressing `Ctrl+1` does NOT navigate
- [ ] dark + light render correctly; toggling system OS theme with `mode === "system"` flips colors live
- [ ] DevTools Console: zero errors / React warnings (no duplicate-listener warnings after toggling system mode on/off repeatedly)
- *Existing notes:* `useEffect` for the system theme listener must include `mode` in its dependency array AND return a cleanup that removes the listener — without this, switching to "system" doesn't register, and toggling on/off accumulates duplicate listeners. Theme persistence reads `app_settings` after T1.7 ships. Shortcuts check `ctrlKey` only (not shift/alt/meta) and call `e.preventDefault()` on match.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "App Layout" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.6): wire up App layout with sidebar, content area, theme, and keyboard shortcuts`

---

### Task 7: SQLite Database Initialization

**Files:**
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod db` + IPC command)
- Create: `src/lib/db.ts`

- [x] **Step 1: Implement Rust DB path helper**

`db.rs`: Function to resolve DB path using `app.path().app_data_dir()` (provided by `tauri::Manager` trait — no extra plugin needed in Tauri v2). Create the directory if it doesn't exist. Return the path as a String.

**Note:** Schema is owned by TypeScript only. Do NOT define or execute schema SQL in Rust. The Rust side only resolves the DB file path.

- [x] **Step 2: Register IPC command in lib.rs**

Add `mod db;`, create `#[tauri::command] fn get_db_path(app: AppHandle) -> Result<String, String>`. Register in `invoke_handler`.

- [x] **Step 3: Create TypeScript DB helper**

`src/lib/db.ts`: Lazy singleton `Database` instance. On first call, invoke `get_db_path` from Rust, then `Database.load(...)`. Run all CREATE TABLE IF NOT EXISTS statements (4 tables from spec §15: `sessions`, `tags`, `groups`, `app_settings`, plus `INSERT OR IGNORE` for `schema_version = '1'`). Export `getDb()`, `dbSelect<T>()`, `dbExecute()` wrappers.

**Schema migration (spec §17.9):** On `getDb()` init, read `schema_version` from `app_settings`. If current < expected, run sequential migration functions (`migrate_1_to_2()`, etc.), each wrapped in a transaction. Rollback on failure. For v1, there's nothing to migrate — just set version. But the migration framework must exist for future phases.

**Critical:** Schema lives in TypeScript only. Don't duplicate schema execution in Rust.

- [x] **Step 4: Commit**

`git commit -m "feat: add SQLite database initialization with schema v1"`

**Verification**

*Unit tests* (`tests/lib/db.test.ts`, mock `@tauri-apps/api/core` `invoke` + `@tauri-apps/plugin-sql` `Database.load`):
- [ ] case 1: `getDb()` invokes `get_db_path` Rust command exactly once across multiple calls (singleton)
- [ ] case 2: subsequent `getDb()` calls return the same instance
- [ ] case 3: `dbSelect<T>()` and `dbExecute()` forward to the underlying `Database` API and propagate errors

*Component / integration tests* — N/A (no UI surface for the DB layer in T1.7; consumed by later phases).

*Data-fixture tests* — task reads SQLite at `~/.claude-manager/`-style app data dir:
- [ ] fixture at `tests/fixtures/T1.7/` containing (a) an empty dir → fresh DB initialized, (b) a pre-existing `v0` DB (no `schema_version` row) → migration sets it to `1`
- [ ] after init, all 4 tables exist: `sessions`, `tags`, `groups`, `app_settings` (assert via `SELECT name FROM sqlite_master WHERE type='table'`)
- [ ] `INSERT OR IGNORE` for `schema_version = '1'` is idempotent — re-opening does NOT re-create tables or duplicate the version row
- [ ] migration: open at v(N-1) = `0` (no row), call `getDb()`, assert `app_settings.schema_version` row equals `1`
- [ ] migration framework: `migrate_1_to_2()` slot exists and is wrapped in a transaction (rolls back on failure) even though it is a no-op for v1

*Rust checks* — task touches `src-tauri/`:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green (path helper unit test if added; otherwise `0 passed` is acceptable)
- [ ] `get_db_path` registered in `invoke_handler` and creates the app data dir if missing

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced

*Perf budget* — N/A (single-file DB open, not a multi-file scan).

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] on first launch, the SQLite file appears at the resolved app data dir; on second launch, no schema errors
- [ ] DevTools Console: zero errors related to `Database.load` or `invoke("get_db_path")`
- *Existing notes:* Schema lives in TypeScript only — Rust resolves the file path via `app.path().app_data_dir()` (Tauri v2 `Manager` trait, no extra plugin). `tauri-plugin-path` is NOT a real Tauri v2 crate. Migration framework runs sequential `migrate_N_to_N+1` functions in transactions; v1 has nothing to migrate, just sets the version.

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "Tech Stack — Database" + §15 "Key File Paths" + §17.9 "Schema Migration" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `feat(T1.7): add SQLite database initialization with schema v1`

---

### Task 8: Full Build Verification

- [x] **Step 1: Run all tests** — `npx vitest run` — expect all PASS

- [x] **Step 2: Check Rust compilation** — `cd src-tauri && cargo check` — expect clean

- [x] **Step 3: Dev build** — `npx tauri dev` — app window opens with dark theme, sidebar with 6 icons, clicking items switches sections, Ctrl+1-6 works

- [x] **Step 4: Final commit**

`git commit -m "chore: Phase 1 Foundation complete"`

**Verification**

*Unit tests* — N/A (T1.8 is itself a meta-verification step; per-task unit tests are owned by T1.2 and T1.3).

*Component / integration tests* — N/A (owned by T1.4 / T1.5 / T1.6).

*Data-fixture tests* — N/A (owned by T1.7).

*Rust checks*:
- [ ] `cd src-tauri && cargo check` clean
- [ ] `cargo test` green

*Type-check + lint gate*:
- [ ] `npx tsc --noEmit` zero errors across the whole `src/` tree
- [ ] no new `// @ts-ignore`, `eslint-disable`, or `any` introduced anywhere in Phase 1

*Perf budget* — N/A.

*Manual UI / E2E smoke* (run `npx tauri dev`):
- [ ] app window opens with dark theme by default
- [ ] sidebar shows 6 lucide icons (Dashboard, Sessions, Plugins, Skills, MCP Servers, Settings)
- [ ] clicking each sidebar item switches the section
- [ ] `Ctrl+1` through `Ctrl+6` navigate; `Ctrl+,` jumps to Settings
- [ ] DevTools Console: zero errors / React warnings
- *Existing notes:* `npx vitest run` all PASS; `cd src-tauri && cargo check` clean; `npx tauri dev` opens window with dark theme + sidebar with 6 icons + click & `Ctrl+1-6` working.

*Per-task DoD audit — confirm each prior task is fully signed off:*
- [ ] T1.1 DoD checklist satisfied (scaffold + cargo check + manual smoke + commit)
- [ ] T1.2 DoD checklist satisfied (theme-store unit tests + tsc clean + commit)
- [ ] T1.3 DoD checklist satisfied (navigation-store unit tests + tsc clean + commit)
- [ ] T1.4 DoD checklist satisfied (SidebarRail component test + tsc clean + commit)
- [ ] T1.5 DoD checklist satisfied (ContentArea component test + tsc clean + commit)
- [ ] T1.6 DoD checklist satisfied (App component test + manual smoke + commit)
- [ ] T1.7 DoD checklist satisfied (DB unit + data-fixture tests + cargo check + commit)

*Definition of Done*:
- [ ] All checks above pass
- [ ] Behavior matches spec §1 "Tech Stack" + §1 "App Layout" + §15 "Key File Paths" of `2026-05-03-claude-manager-design.md`
- [ ] Plan checkbox `[x]`
- [ ] Commit: `chore(T1.8): Phase 1 Foundation complete`
