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

- [ ] _to be discovered_

### Dashboard — `src/sections/DashboardSection.tsx`

_Investigation pending. Likely focus: stat tiles showing 0 when stats-cache exists, recent-sessions list, quick-action buttons._

- [ ] _to be discovered_

### Sessions — `src/sections/SessionsSection.tsx`

_Investigation pending. Likely focus: session list render, JSONL preview, PID file freshness indicator._

- [ ] _to be discovered_

### Plugins — `src/sections/PluginsSection.tsx`

_Pre-seeded from prior debugging — these are known but the loop must still re-verify each before fixing (memory may be stale)._

- [ ] List shows 0 skills/0 agents/0 hooks for every plugin (list view doesn't fetch details — see `src/lib/plugin-loader.ts:135-139`)
- [ ] Reinstall button has no onClick handler (`src/components/plugins/PluginCard.tsx:115-128`)
- [ ] Remove button has no onClick handler (`src/components/plugins/PluginCard.tsx:115-128`)
- [ ] "Install Plugin" header button has no onClick handler (`src/components/plugins/PluginListView.tsx:59-65`)

### Skills — `src/sections/SkillsSection.tsx`

- [ ] Skill card has no Remove action (`src/components/skills/SkillCard.tsx`)
- [ ] _further investigation pending_

### MCP Servers — `src/sections/McpSection.tsx`

_Pre-seeded — partially investigated last session._

- [ ] Connect button calls non-existent IPC `connect_mcp_server` (`src/stores/mcp-store.ts:138`) — decide: implement Rust command, or remove the button per spec §8.3
- [ ] Restart button calls non-existent IPC `restart_mcp_server` (`src/stores/mcp-store.ts:128`) — same decision
- [ ] All servers show DISCONNECTED forever — verify whether `claude mcp list` parser regex `/^([\w.-]+)\s*:\s*(.*)$/` matches actual CLI output; if not, fix parser
- [ ] `View Tools` button has no onViewTools callback wired (`src/components/mcp/McpServerCard.tsx:88-94`)
- [ ] `View Logs` button has no onViewLogs callback wired (`src/components/mcp/McpServerCard.tsx:101`)
- [ ] _further investigation pending_

### Settings — `src/sections/SettingsSection.tsx`

_Investigation pending._

- [ ] _to be discovered_

### Global / cross-cutting

_Investigation pending. Candidates: theme toggle, modal escape-key, toast dismissal, error boundary fallback UI._

- [ ] _to be discovered_

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
