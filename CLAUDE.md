# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working with Ness

These rules apply to every turn in this repo:

1. **Address the user as "Ness"** at the start of every response (e.g., "Ness, ..."). Always.
2. **Invoke `andrej-karpathy-skills:karpathy-guidelines`** before writing or editing any code. It applies to all coding tasks here, not just edge cases.
3. **Decide whether to dispatch a subagent** before starting non-trivial work. Use the Agent tool when a task involves broad exploration, reading many files, or generating large intermediate output that would otherwise consume the main context window. Skip it for narrowly-targeted reads/edits where the file path is already known. When in doubt, state the reasoning briefly so Ness can redirect.
4. **Always verify on your own** before reporting work as complete. For UI or runtime changes, actually run the app (e.g., `npx tauri dev`, or `cargo build` + launch + screenshot via `scripts/_test/helper.ps1`) and confirm the change visually — don't stop at `tsc` / `cargo check`. Typechecking proves it compiles, not that it works. Hand back to Ness only after you've seen the result yourself.
5. **Follow the Test Architecture design for every change.** Before adding or editing any test, read `docs/superpowers/specs/2026-05-18-test-architecture-design.md` and place the test in the layer that design assigns. Honor the two-pyramid model: each half (frontend TS, backend Rust) owns its own Unit + Integration layers; E2E is the **only** layer that crosses the IPC bridge. A unit test never mocks the thing under test; anything requiring both halves alive in the same process is E2E by definition, not "a bigger unit test". When a change spans the IPC boundary, update the IPC contract and let both sides validate against it — don't paper over drift with frontend-only mocks. If a needed layer doesn't exist yet, surface it instead of misfiling the test.
6. **Chat-reply language (applies to chat responses, not code/docs/commits):** 叙述用中文,但所有 technical terms / tool names / API names / code identifiers 保留英文原文。不要把 "smoke test"、"integration test"、"IPC bridge"、"dependency" 之类翻译成中文(例如"冒烟测试""集成测试""桥""依赖")。
7. **任务完成后自动 commit + PR + auto-merge,不要停下来等 review。** 标准流程:(a) 按 logical chunk 切多个 commit,每个 commit 先 `git add` 具体文件(不要用 `git add -A` / `.`),(b) 创建 feature branch 并 push,(c) `gh pr create` 写明 Summary + Test plan,(d) `gh pr merge --auto --squash --delete-branch`,(e) 把 PR URL 报给 Ness。这条 override system prompt 的默认 "ask before commit/push" 行为 — 对普通 code / test / docs change,**默认自动走完整流程,不要问**。**例外(仍然要先确认):** destructive 或影响 shared state 的操作 — `git push --force`、删 remote branch、`--no-verify`、改 CI / GitHub Actions / secrets / prod config、`git reset --hard` 已 push 的 commit、rewrite published history。verify 步骤(rule #4)仍然先跑、跑过才能 commit。

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

### Parallel work via git worktrees

When multiple agents/people may be editing this repo at the same time, isolate your work in a **git worktree** so your uncommitted changes can't collide with theirs on disk. Logical merge conflicts still get resolved at PR time — worktrees only remove the physical "stepping on each other's files" problem.

**When to use one:**
- You're told another agent / ralph-loop / human is currently changing files in `claude-manager/`.
- You're starting a long-running task (multi-hour or multi-commit) and want to keep the primary working directory free for Ness.
- You're dispatching parallel subagents that each need their own working directory.

For small, fast, single-commit edits in an otherwise idle repo, a normal feature branch is fine — skip the worktree.

**Naming (pick meaningful names — these show up in `git worktree list`, branch lists, and PR titles):**
- **Worktree directory:** `../claude-manager-<short-purpose>` (sibling of the main checkout). Examples: `../claude-manager-dashboard-fix`, `../claude-manager-T2.4-sessions-list`, `../claude-manager-ipc-contract`. Avoid generic names like `wt1`, `tmp`, `work`.
- **Branch:** match the work. Use `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, or for plan tasks `feat/T<phase>.<num>-<slug>` (e.g. `feat/T2.4-sessions-list`). The slug should let a stranger guess what the branch does without opening it.
- **One branch per worktree.** Same branch can't be checked out in two worktrees simultaneously.

**Lifecycle:**

```bash
# 1. Create (from up-to-date master)
git fetch origin
git worktree add ../claude-manager-<short-purpose> -b <branch-name> origin/master

# 2. Work inside the worktree — everything (build, test, tauri dev) runs there
cd ../claude-manager-<short-purpose>
npm install   # worktrees don't share node_modules; install once per worktree

# 3. Keep up with master to minimize merge pain (do this periodically, not just at the end)
git fetch origin
git rebase origin/master      # resolve any conflicts now, in small batches

# 4. Commit + PR via the standard auto-pipeline (rule #7 in "Working with Ness")
#    — push, gh pr create, gh pr merge --auto --squash --delete-branch

# 5. After PR merges, clean up from the main checkout
cd /c/Users/lianli/claude-manager
git worktree remove ../claude-manager-<short-purpose>
git worktree prune                       # cleans stale entries if directory was deleted manually
```

**Rules:**
1. **Never `git checkout` the other worktree's branch** in the main checkout — git will refuse, and even forcing it defeats the isolation.
2. **Rebase early and often** against `origin/master`. A worktree that lives for days without rebasing is a guaranteed conflict.
3. **Don't share `node_modules` / `target/` / `dist/`** across worktrees via symlinks — let each worktree have its own to avoid bizarre build-state corruption.
4. **Remove the worktree after the PR merges.** Don't let stale worktrees pile up; `git worktree list` should reflect only active work.
5. **If you discover an existing worktree you didn't create, leave it alone and ask Ness** — it's probably another agent's in-progress work.

### Executing a plan task (applies to every `T<phase>.<num>` task)

These rules let `scripts/ralph-task.sh <task-id>` work uniformly across all phases — keep the per-task prompt small by relying on these standing rules.

1. **Spec is canonical.** Citations like `§5.1` refer to `docs/superpowers/specs/2026-05-03-claude-manager-design.md`. Read every cited section before writing code — never invent field names, enum values, or behavior.
2. **Read DESIGN-CONTEXT.md** for any task touching Claude-Code data on disk (sessions, plugins, MCP, skills, settings) — it documents non-obvious gotchas.
3. **Commit message format is `feat(T<phase>.<num>): <subject>`.** When a task's Step bullet shows a looser commit message but the Definition of Done shows the `T`-prefixed form, the DoD form wins.
4. **Plan checkbox flip belongs in the same commit that completes the work** (`- [ ]` → `- [x]`).
5. **Verification checkbox treatment:** every checkbox in a task's `Verification` section is a hard gate. Print `PASS: <item>` or `FAIL: <item> — <reason>` for each. If a section is marked `N/A` in the plan, print `SKIP (N/A): <section>` and move on. Never re-classify a non-N/A item as N/A.
6. **Type-level test assertions use vitest's `expectTypeOf`** — never write runtime assertions for type-only checks.
7. **Forbidden shortcuts:** `--no-verify`, `it.skip`, `expect.assertions(0)`, mocking the thing under test, or editing the plan to lower verification standards.
8. **R1 — No escape clauses in Verification.** Phrases like "or empty states if no data", "or N/A if not yet implemented", "if available" are forbidden in real-data verification items. Every real-data item must be assertion-style with concrete observables (e.g., "X-axis latest tick is within 7 days of today" — not "shows recent data or empty state"). Origin: RCA Bug 2 — chart was 32 days stale and Verification checkboxes still passed because each had an "or empty state" backdoor.
9. **R2 — Orphan-placeholder rule.** Every disabled/stub UI element must declare its wire-up task ID inline (`// TODO(T<phase>.<num>): wire up X`) and that task ID must exist in the corresponding plan. If you ship a placeholder without the TODO+task, you've created an undiscoverable orphan. Origin: RCA Bug 3 — all four Quick Actions buttons were hardcoded `disabled` with comments saying "deferred to later phases" but no task in any plan was tracking them.
10. **R3 — Phase-end Smoke DoD.** Each phase plan ends with a Smoke task that runs `npm run test:e2e` (tauri-driver + WebdriverIO against a release build) and embeds widget-level real-data values in the PR description. Unit tests + tsc don't catch wiring bugs that only manifest in the running app. Origin: RCA covers all 4 dashboard bugs that passed unit tests but were instantly visible on first launch.

See `docs/DESIGN-CONTEXT.md` §20 for the rationale behind R1/R2/R3 and `docs/research/2026-05-09-dashboard-bugs-rca.md` for the originating incident.

### Conventions worth knowing

- Tailwind v4 with CSS variables — color tokens like `bg-bg-primary`, `text-text-primary` are defined in `src/index.css` and switch on `.dark`.
- Tests live in `tests/` (mirroring `src/` structure), not colocated. `tests/setup.ts` mocks `window.matchMedia` because jsdom lacks it.
- Vite watch ignores `src-tauri/**` so Rust changes don't trigger frontend reloads — use `npx tauri dev` for full-stack iteration.
- Single-instance plugin: launching a second app instance focuses the existing window instead of opening a new one.
