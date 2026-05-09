# UI Defect Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to dispatch a fresh **Explore** subagent per section for discovery (protects main context), and a fresh general-purpose subagent per fix. One unchecked item = one iteration = one PR.

**Goal:** Sweep every section of Claude Manager for obvious UI defects (empty/zero counts when data exists, layout breakage, dead buttons, broken IPC) and ship a focused PR per defect with auto-merge after CI + local verification.

**Scope:** All sections — Sidebar, Dashboard, Sessions, Plugins, Skills, MCP Servers, Settings — plus global concerns (modals, toasts, theme, keyboard shortcuts, error boundaries).

**Out of scope:** New features, refactors not tied to a defect, perf tuning, visual redesigns, copy edits unless the existing copy is factually wrong.

---

## Conventions for every iteration

(General task-execution rules live in repo `CLAUDE.md`. Items below are sweep-specific.)

- **One defect per PR.** No bundling. Reviewers should see exactly one root cause per PR.
- **Discovery via subagent.** Dispatch a fresh `Explore` subagent for each section investigation so the main loop's context isn't polluted with screenshots and source dumps. Subagent returns: defect list with file:line + screenshot path + suggested category.
- **Skip already-fixed defects.** Before picking a target, check `git log --oneline origin/master..HEAD` and merged PRs (`gh pr list --state merged --search "fix(ui)"`) to avoid duplicates. Update this plan's checkboxes to reflect reality.
- **Local verify is a hard gate.** Before pushing: `npm test`, `cd src-tauri && cargo check`, `npm run build`, then `npx tauri dev` + manual click of the affected button + after-screenshot. Skip none.
- **Branch:** `fix/ui-<section>-<slug>` off `master`. Example: `fix/ui-plugins-reinstall-handler`.
- **Commit:** `fix(ui/<section>): <subject>`. Body must include: root cause (1 sentence), before/after screenshot paths, verification steps run.
- **PR template:** see "PR body template" below. Embed both screenshots inline (`![](docs/_screenshots/<branch>-before.png)`).
- **Auto-merge:** `gh pr merge --squash --auto` after CI passes. Branch protection must require the `ui-sweep-ci` workflow.
- **Loop ledger:** every fix flips `- [ ]` → `- [x]` in the same commit, with a trailing ` — PR #<n>` reference.

---

## CI requirements (one-time setup, first iteration)

The first iteration of the loop must create the CI before any fix PR can auto-merge. Add `.github/workflows/ui-sweep-ci.yml`:

- Trigger: `pull_request` targeting `master` with paths `src/**`, `src-tauri/**`, `tests/**`
- Jobs (parallel):
  1. `frontend` — `npm ci`, `npm run build` (includes `tsc`), `npm test`
  2. `rust` — `cd src-tauri && cargo check && cargo test`
- Required check name in branch protection: `frontend`, `rust`
- Cache npm + cargo registries

Optional second workflow `ui-sweep-screenshot.yml` runs on PR comment `/snap`: starts the app headless, runs the relevant smoke script, uploads PNGs as artifacts. Defer if Windows runner cost is a concern.

---

## Defect categories (the agent matches against this list)

| Category | Concrete signal |
|---|---|
| **Zero-count mismatch** | List shows "0 X" but underlying file/dir has > 0 entries. Verify by reading source data, not by trusting the UI. |
| **Empty state where data exists** | "No X configured" message but `loadX()` returned items in console. |
| **Dead button** | `onClick` missing, `=== undefined`, no-op handler, or callback prop never wired by parent. |
| **Broken IPC** | Button calls `invoke("foo")` where `foo` is not in `src-tauri/src/lib.rs`'s `invoke_handler!` list. Throws "command not found" at runtime. |
| **Layout overflow / clip** | Element `getBoundingClientRect` extends past parent at 1280×800. Text truncation without title tooltip. Cards overlap. |
| **Dark-mode contrast** | Text/background contrast ratio < 4.5:1 in `.dark` mode (WCAG AA). Most common: muted text on tertiary bg. |
| **Broken keyboard shortcut** | `Ctrl+1..6`, `Ctrl+,` documented but doesn't switch sections. Focus-trap bug. |
| **Stale data after action** | After add/edit/remove, list doesn't refresh. Optimistic update reverts on remount. |
| **False error state** | UI shows "broken" / "error" when underlying state is healthy (e.g., the original P0-1 fs-scope bug). |
| **Missing aria-label / role** | Icon-only button has no accessible name; UIAutomation can't find it. |

---

## Per-section investigation procedure

Dispatch `Explore` subagent with:

```
Investigate the <SectionName> section of this Tauri app for UI defects.

Steps:
1. Read src/sections/<Section>.tsx and every component it renders (follow imports 2 levels deep).
2. For each interactive element (button, link, input), trace the onClick/onChange to its handler. Flag any: missing handler, no-op, calls invoke() with command not in src-tauri/src/lib.rs, or props-callback not provided by parent.
3. Read the underlying loader (src/lib/<section>-loader.ts) and store. Identify count fields shown in UI; verify they match what the loader produces.
4. Run scripts/_test/t<X>-smoke.ps1 if it exists; else navigate via Invoke-Rail "<SectionLabel>" + Snap-Print. Save screenshot path.
5. Return a categorized list: [{category, location: "file:line", evidence: "screenshot path or quoted code", suggested fix sketch}]. Hard cap: top 5 defects, ordered by user-visible severity.

Do NOT fix anything. Report only.
```

Main loop picks the #1 defect from the report, then dispatches a general-purpose subagent for the fix.

---

## Per-defect fix procedure

```
1. git checkout master && git pull
2. git checkout -b fix/ui-<section>-<slug>
3. mkdir -p docs/_screenshots && cp <before.png> docs/_screenshots/<branch>-before.png
4. Implement fix (root cause, no symptom patches per CLAUDE.md karpathy rules)
5. npm test && cd src-tauri && cargo check && cd .. && npm run build
6. npx tauri dev (background) → manual click affected control → capture after.png
7. cp <after.png> docs/_screenshots/<branch>-after.png
8. Tick the checkbox in this plan file in the same commit
9. git commit -m "fix(ui/<section>): <subject>" with body: root cause + screenshots + verification
10. git push -u origin HEAD
11. gh pr create --title "..." --body-file <generated body> --base master
12. gh pr merge --squash --auto
13. git checkout master && git pull
```

If CI fails: do NOT force-merge. Investigate, push fix to same branch, let auto-merge re-trigger.

---

## Iteration procedure (the ralph-loop reads this each turn)

Each ralph-loop iteration runs these steps in order. Do not skip steps.

### 1. Sync

```bash
git fetch origin master
```

### 2. Wait for prior fix PRs (subagent)

Dispatch a general-purpose subagent named `pr-watcher` with this task:

> Poll `gh pr list --state open --search "fix(ui)" --author @me` every 60s for up to 30 minutes. For each open PR, check `statusCheckRollup`. Return a structured report:
> - **merged** — list PRs that landed during the wait
> - **failing** — for each failing PR: `{pr_number, failing_job, log_excerpt, root_cause_hypothesis, suggested_fix}` (fetch the failing job log via `gh run view <run-id> --log-failed`)
> - **conflicting** — for each conflict: `{pr_number, conflicting_files}`
> - **still_running** — list PRs whose checks are still in progress at the 30-min cap
>
> Return when all open `fix/ui-*` PRs are either merged, have actionable feedback, or hit the 30-min cap. Do NOT modify any code.

Wait for `pr-watcher` to return before continuing.

### 3. Handle feedback

If `pr-watcher` reported failing or conflicting PRs, **fix those first**:
- Push the fix to the existing branch (do NOT open a new PR)
- For conflicts: rebase onto `origin/master`, resolve, force-push with lease
- Re-run local verify (step 6 below) before pushing

Only proceed to step 4 when all prior `fix/ui-*` PRs are merged or have a fresh fix pushed.

### 4. Pick next defect (Explore subagent)

For the next section in the ledger that has unchecked items, dispatch an `Explore` subagent with the prompt from "Per-section investigation procedure" above. Skip already-checked items. Pick the #1 defect from the returned list.

If the next section's ledger is empty (`_to be discovered_`), the Explore subagent populates it; the loop iteration is "discovery only" — no fix PR this turn — and ends after committing the populated checklist (`docs(plan): seed <section> ledger`).

### 5. Branch

```bash
git checkout -b fix/ui-<section>-<slug> origin/master
```

### 6. Fix + local verify (HARD GATE)

Implement the root-cause fix per CLAUDE.md karpathy rules. Update tests. Then run **all** of the following — every one must pass before push:

```bash
npx tsc --noEmit
npm test
cd src-tauri && cargo check --locked && cd ..
npm run build
```

For changes with positive UI behavior to verify (not pure deletions):

```bash
npx tauri dev   # in background
# manually invoke the affected control
# capture screenshot to docs/_screenshots/<branch>-after.png
```

If any gate fails, fix and re-run until green. Do NOT push with a failing gate.

### 7. Commit

Commit message format: `fix(ui/<section>): <subject>`. Body MUST contain:
- Root cause (1 paragraph)
- Fix description (1 paragraph)
- Local verification list (each gate from step 6 with ✓)
- Plan reference (path + checkbox text)
- Tick the checkbox in this plan file with ` — PR #<n>` (use placeholder if PR not yet created; fix in step 8)

### 8. Push + PR + auto-merge

```bash
git push -u origin HEAD
gh pr create --base master --title "..." --body-file <generated>
gh pr merge --squash --auto
```

If the placeholder PR number in the plan was wrong, push a follow-up commit fixing it (or amend before push).

### 9. Loop

Return to step 1 for the next iteration. The ralph-loop's stop hook re-feeds the same prompt; the agent reads this section again and continues from step 1.

---

## Done condition

Output `<promise>UI_DEFECT_SWEEP_PLAN_FULLY_CHECKED</promise>` if and ONLY if **all** of the following hold simultaneously:

1. Every checkbox in every section ledger is `- [x]` with a `— PR #<n>` reference, OR explicitly marked `~~not a defect~~ — investigated, see PR #<n>`.
2. A clean-sweep iteration has dispatched the Explore subagent against every section in the same loop turn and returned **zero new candidates** in every section.
3. The clean-sweep iteration's screenshots are committed under `docs/_screenshots/clean-sweep-<date>/`.
4. `gh pr list --state open --search "fix(ui)"` returns empty.
5. No `fix/ui-*` PR is in failing-checks state on GitHub.

If any condition fails, do not output the promise. Continue iterating.

---

## Anti-loop guard

If the same PR fails CI 3+ consecutive iterations after fix attempts:
- Do NOT continue blind retries
- Stop the loop turn early
- Leave a comment on the PR via `gh pr comment <n>` describing what was tried and why it's stuck
- Wait for human input next iteration (the loop will re-feed the prompt; the human may have addressed the PR by then)

---

## PR body template

```markdown
## Root cause
<one paragraph — what was actually broken and why>

## Fix
<one paragraph — what changed and why this is the minimal fix>

## Before
![before](docs/_screenshots/<branch>-before.png)

## After
![after](docs/_screenshots/<branch>-after.png)

## Local verification
- [x] `npm test` passes
- [x] `cd src-tauri && cargo check` passes
- [x] `npm run build` passes
- [x] Manually clicked affected control in `npx tauri dev` — observed expected behavior
- [x] Verified no regression in adjacent controls in same section

## Defect category
<one of the categories from the plan>

## Plan reference
docs/superpowers/plans/2026-05-08-ui-defect-sweep.md → <section> → <checkbox text>
```

---

## Section ledgers

Each section starts empty. The Explore subagent populates checkboxes during its investigation iteration; subsequent iterations tick them off as PRs land. New checkboxes may be added at any time — the loop is done only when a full clean sweep adds none.

### Sidebar — `src/components/Sidebar.tsx`

_Investigation pending. Likely focus: rail button accessible names, active-state visual, keyboard navigation, collapse/expand if applicable._

- [x] Rail buttons missing `aria-current="page"`, no focus-visible ring for keyboard nav, tooltip didn't show the documented `Ctrl+N` shortcut (`src/components/SidebarRail.tsx`, `src/components/SidebarRailItem.tsx`) — PR #17
- [ ] _further investigation pending_

### Dashboard — `src/sections/DashboardSection.tsx`

_Investigation pending. Likely focus: stat tiles showing 0 when stats-cache exists, recent-sessions list, quick-action buttons._

- [x] QuickActions: all 4 buttons (New Session / Resume Latest / Open CWD / Rebuild Stats) are dead — no `onClick` handlers (`src/components/dashboard/QuickActions.tsx:36-51`). Minimal fix: render `disabled` + `aria-disabled` + `title="Coming soon"` until handler wiring lands in a later phase — PR #22
- [x] Dashboard store silently swallows SQLite load errors and renders empty stats (`src/stores/dashboard-store.ts:104-169`) — added `loadError: string | null` to the store; DashboardSection renders a soft yellow banner (role="alert") when set, so users know stats may be stale instead of seeing silent zeros — PR #25
- [x] SystemHealth status dots are color-only (`aria-hidden="true"` on each dot, `src/components/dashboard/SystemHealth.tsx:124`) — SR users get no status signal at all, and MCP/Plugins/CLI rows have no visible status word either. Fixed by giving each dot `role="img"` + `aria-label={STATUS_LABEL[status]}`. Sighted color-blind users still need visible status text on MCP/Plugins/CLI rows — that's a deeper redesign deferred to a follow-up. — PR #<TBD>

### Sessions — `src/sections/SessionsSection.tsx`

_Investigation pending. Likely focus: session list render, JSONL preview, PID file freshness indicator._

- [x] `SessionListPanel.test.tsx` "Timeline view" test flaked daily within ~2h after midnight — `now - 26h` straddled a calendar boundary, so the "yesterday" assertion failed because the session got bucketed as "This Week" instead. Anchor the test with `vi.useFakeTimers` + a fixed local-noon "now" — PR #20
- [x] "+ New Session" button is dead — no `onClick` handler (`src/components/sessions/SessionListPanel.tsx:189-196`). Same situation as Dashboard QuickActions: the button looks interactive but does nothing because backend wiring is later-phase. Minimal fix: disable + tooltip until wired. — PR #26
- [x] `SessionInfoBar.handleAction` is a no-op for every action except the `stop` confirmation prompt (`src/components/sessions/SessionInfoBar.tsx:142-153`). After the user confirms "Stop", nothing happens — no SIGTERM, no toast, no error. Code comment acknowledges this as deferred. Disabled all action buttons with `title="Coming soon"` (dead-CWD case still wins with "Directory not found"); removed the unreachable `handleAction` since every button is now `disabled`. — PR #31
- [x] `setSessionDisplayName` updates only the in-memory Zustand store (`src/stores/session-store.ts:57-62`); SQLite persistence is explicitly deferred per `src/lib/session-loader.ts:28-31`. The user renames a session, sees it persist visually, and loses the rename on next reload. Took the "label the rename UI as session-scoped" branch — added `title="Renames are session-scoped — not yet saved across reloads"` and an SR-friendly `aria-label="Session name (session-scoped — not yet saved across reloads)"` to the input. Persistence wiring stays for a later phase when DB schema work is in scope. — PR #33
- [x] Dead-CWD warning AlertTriangle icon has no `aria-label` (`src/components/sessions/SessionInfoBar.tsx:181-188`). Parent span carries `title="Directory not found"` but screen readers won't always surface that. Add `aria-label="Directory not found"` on the icon (or `aria-hidden` + a screen-reader-only span). — PR #24

### Plugins — `src/sections/PluginsSection.tsx`

_Pre-seeded from prior debugging — these are known but the loop must still re-verify each before fixing (memory may be stale)._

- [x] List shows 0 skills/0 agents/0 hooks for every plugin (list view doesn't fetch details — see `src/lib/plugin-loader.ts:135-139`) — PR #19
- [x] Reinstall button has no onClick handler (`src/components/plugins/PluginCard.tsx:115-128`) — disabled with explanatory tooltip until IPC is wired (no `claude plugin install` IPC exists yet) — PR #23
- [ ] Remove button has no onClick handler (`src/components/plugins/PluginCard.tsx:115-128`)
- [ ] "Install Plugin" header button has no onClick handler (`src/components/plugins/PluginListView.tsx:59-65`)

### Skills — `src/sections/SkillsSection.tsx`

- [x] Skill card has no Remove action (`src/components/skills/SkillCard.tsx`) — not a defect: spec §7.1 lists only "Open in VS Code" and "Open in File Browser"; SkillCard matches spec exactly. Custom-skill removal is intentionally a manual filesystem action.
- [x] `+ Create Skill` button passes literal `~/.claude/skills/` to `openShell`, which does not expand `~` — silent no-op on most platforms (`src/components/skills/SkillsListView.tsx:14,33`). Fixed by resolving `homeDir() + join(...)` before the shell open. — PR #35
- [ ] _further investigation pending_

### MCP Servers — `src/sections/McpSection.tsx`

_Pre-seeded — partially investigated last session._

- [x] Connect button calls non-existent IPC `connect_mcp_server` — removed button + dead store method per spec §8.3 (status is opt-in via Refresh) — PR #14
- [x] Restart button calls non-existent IPC `restart_mcp_server` — removed button + dead store method (no `claude mcp restart` CLI subcommand) — PR #14
- [ ] All servers show DISCONNECTED forever — verify whether `claude mcp list` parser regex `/^([\w.-]+)\s*:\s*(.*)$/` matches actual CLI output; if not, fix parser
- [x] `View Tools` button has no onViewTools callback wired (`src/components/mcp/McpServerCard.tsx:88-94`) — button now renders `disabled` + `aria-disabled` + `title="Coming soon"` whenever the callback is absent (current parent behavior); stays interactive when a callback is wired so future panel work activates it without further changes — PR #30
- [ ] `View Logs` button has no onViewLogs callback wired (`src/components/mcp/McpServerCard.tsx:101`)
- [ ] _further investigation pending_

### Settings — `src/sections/SettingsSection.tsx`

_Investigation pending._

- [ ] _to be discovered_

### Global / cross-cutting

_Investigation pending. Candidates: theme toggle, modal escape-key, toast dismissal, error boundary fallback UI._

- [x] No top-level React error boundary — any unhandled render error in any section blanks the entire window with no user feedback (`src/main.tsx` previously rendered `<App />` bare). Fixed by adding `ErrorBoundary` component and wrapping `<App />` in `main.tsx`; fallback shows the error message + a Reload button (`role="alert"`). — PR #37
- [ ] _further investigation pending_

---

## Done criteria

The promise `UI_DEFECT_SWEEP_PLAN_FULLY_CHECKED` is true if and only if **all** of the following hold:

1. Every checkbox in every section ledger above is `- [x]` with a `— PR #<n>` reference, OR explicitly marked `~~not a defect~~ — investigated, see PR #<n> discussion`.
2. A final full-sweep iteration has dispatched the Explore subagent against every section in the same loop turn and returned **zero new candidates** in every section.
3. The clean-sweep iteration's screenshots are committed under `docs/_screenshots/clean-sweep-<date>/`.
4. `gh pr list --state open --search "fix(ui)"` returns empty.

If any condition fails, do not output the promise. Continue iterating.

---

## Anti-patterns the loop must refuse

- **Bundling fixes.** Two defects in one PR even if "they're related" — split them.
- **Skipping local verify.** "tsc passed" is not enough — must launch the app.
- **Symptom patches.** Hiding the broken button instead of fixing/removing it. Catching errors silently. Lying via try/catch.
- **Editing this plan to lower the bar.** Adding "(skipped because complex)" without ticking via a real fix PR. Reclassifying a defect as "not a bug" without evidence in the PR discussion.
- **False promise.** Outputting `<promise>UI_DEFECT_SWEEP_PLAN_FULLY_CHECKED</promise>` while open `fix/ui-*` PRs exist or unchecked items remain.
