# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working with Ness

These rules apply to every turn in this repo:

1. **Address the user as "Ness"** at the start of every response (e.g., "Ness, ..."). Always.
2. **Invoke `andrej-karpathy-skills:karpathy-guidelines`** before writing or editing any code. It applies to all coding tasks here, not just edge cases.
3. **Decide whether to dispatch a subagent** before starting non-trivial work. Use the Agent tool when a task involves broad exploration, reading many files, or generating large intermediate output that would otherwise consume the main context window. Skip it for narrowly-targeted reads/edits where the file path is already known. When in doubt, state the reasoning briefly so Ness can redirect.
4. **Always verify on your own** before reporting work as complete. For UI or runtime changes, actually run the app (e.g., `npx tauri dev`, or `cargo build` + launch + screenshot via `scripts/_test/helper.ps1`) and confirm the change visually — don't stop at `tsc` / `cargo check`. Typechecking proves it compiles, not that it works. Hand back to Ness only after you've seen the result yourself.

## Project

Claude Manager is a single-window Tauri v2 desktop app (Rust backend + React 19 + TypeScript + Vite frontend) for managing the Claude Code ecosystem: sessions, plugins, skills, MCP servers, dashboard, and settings. App data lives in `%APPDATA%/com.claudemanager.app/db.sqlite`.

## Common commands

```bash
npm run dev            # Vite dev server on port 1420 (frontend only)
npm run build          # tsc + vite build → dist/
npm test               # vitest run (jsdom env, setup in tests/setup.ts)
npm run test:watch     # vitest watch mode
npx vitest run path/to/file.test.tsx   # single test file
npx tauri dev          # full desktop app (Rust + frontend, hot reload)
npx tauri build        # production bundle
cd src-tauri && cargo check    # Rust-only typecheck (faster than tauri build)
```

There is no lint script configured. TypeScript compilation via `tsc` (run as part of `npm run build`) is the type-check.

## Architecture

### Tauri split (frontend ⇄ Rust)

- **Frontend**: `src/` — React 19 + Zustand stores + Tailwind v4 (CSS variables, `.dark` class on `<html>`).
- **Rust**: `src-tauri/src/` — minimal. `lib.rs` registers plugins (sql, fs, notification, single-instance) and exposes the `get_db_path` IPC command. `db.rs` only resolves the on-disk path — **the schema is owned by TypeScript**.
- **Capabilities**: `src-tauri/capabilities/default.json` — explicit allowlist of Tauri APIs the webview may call (sql, fs, notification). New APIs require entries here.

### SQLite schema lives in TypeScript

`src/lib/db.ts` is the single source of truth for the database:
- `getDb()` is a lazy singleton that opens `sqlite:<path-from-Rust>` once.
- `SCHEMA[]` array of `CREATE TABLE IF NOT EXISTS` runs on every open (idempotent).
- `MIGRATIONS` is keyed by the version it upgrades **to** (e.g., `MIGRATIONS[2]` migrates v1→v2). Bump `EXPECTED_VERSION` when adding one. Migrations run inside transactions.
- Rust never touches the schema or runs SQL — keep that boundary.

### State management

Two Zustand stores, both pure (no side effects):
- `src/stores/theme-store.ts` — `mode` (`light`|`dark`|`system`) and resolved theme. `App.tsx` owns the `<html>.dark` class toggle and the `prefers-color-scheme` listener.
- `src/stores/navigation-store.ts` — `activeSection` (one of 6 sections). `ContentArea.tsx` switches on it; sidebar items dispatch via `navigateTo`.

Keyboard shortcuts (`Ctrl+1..6`, `Ctrl+,`) are wired in `App.tsx` and skip when focus is in inputs.

### Section structure

Six top-level sections in `src/sections/`: Dashboard, Sessions, Plugins, Skills, MCP, Settings. Most are placeholders during Phase 1 — see plans below for what each becomes.

## Working with this codebase

### Spec-driven phases

This project is being built via a 4-phase plan tracked in `docs/superpowers/plans/`. Each phase has a checkbox list; tasks are referenced as `[T<phase>.<num>]` (e.g. `T1.6`). The full design spec is `docs/superpowers/specs/2026-05-03-claude-manager-design.md` and the design context (critical research findings) is `docs/DESIGN-CONTEXT.md`. **Read DESIGN-CONTEXT.md before designing anything Claude-Code-data-related** — it documents non-obvious gotchas (stale sessions-index.json, ephemeral PID files, `node.exe` not `claude.exe`, MCP configs in `~/.claude.json` not `settings.json`, etc.).

### Auto-execution workflow

Phases are executed by ralph-loop + subagent-driven-development. See `docs/AUTO-EXECUTION-WORKFLOW.md` for the full pipeline. Helper scripts:
- `scripts/auto-pr.sh <phase-number>` — push branch + create/update PR for a completed phase.
- `scripts/sync-pool.sh [branch]` — fetch + reset + npm install + build for a worktree (idempotent via `.pool-synced-at-<SHA>` markers; refuses dirty trees without `--force`).

### Conventions worth knowing

- Tailwind v4 with CSS variables — color tokens like `bg-bg-primary`, `text-text-primary` are defined in `src/index.css` and switch on `.dark`.
- Tests live in `tests/` (mirroring `src/` structure), not colocated. `tests/setup.ts` mocks `window.matchMedia` because jsdom lacks it.
- Vite watch ignores `src-tauri/**` so Rust changes don't trigger frontend reloads — use `npx tauri dev` for full-stack iteration.
- Single-instance plugin: launching a second app instance focuses the existing window instead of opening a new one.
