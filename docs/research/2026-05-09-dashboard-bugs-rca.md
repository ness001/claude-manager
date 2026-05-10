# Dashboard Bugs — Root Cause Analysis & Process Postmortem

> **Date:** 2026-05-09
> **Author:** Claude (assisted, all decisions logged inline at §7)
> **Trigger:** Ness reported four Dashboard defects in production: (1) "Active Since" shows no data, (2) ActivityChart only shows up to 4/7, (3) Quick Actions buttons all non-functional, (4) System Health shows wrong/bad data. Asked: *why didn't you find these — missing tools, weak spec verification, or context-window oversight?*
> **Status:** Root causes confirmed for all 4 bugs. Process gaps identified. Remediation plan locked in §8.

---

## 1. TL;DR

| Bug | Real cause | Class |
|---|---|---|
| 1. Active Since empty | `started_at` column never written by `upsertSession()` (`src/lib/session-loader.ts:178-209`); PID file value is read into memory but never passed to SQL | **Plan-task scope omission** |
| 2. Chart truncated to 4/7 | `~/.claude/stats-cache.json` is owned by Claude Code CLI, not us; user's CLI v2.1.98 has a bug that disables stats writes when a flag is set; cache last written 2026-04-09 | **External dependency stale, no UI signal** |
| 3. Quick Actions dead | All 4 buttons hardcoded `disabled` in `QuickActions.tsx`; comment marks "deferred to later phases"; no Phase 3 / 4 / sweep task ever picks them up | **Orphan placeholder** |
| 4. System Health wrong | Three of four indicator props (`mcpCount`, `pluginCount`, `cliVersion`) are never passed by parent; defaults render perma-warn state | **Orphan placeholder** |

The **structural lesson** is that all four bugs are downstream of two repeatable process failures (§4): weak Verification gates and unclaimed deferred scope. Both are fixable with mechanical rules, not effort.

## 2. Why each bug shipped (technical)

### 2.1 Active Since (Bug 1)

- `src/stores/dashboard-store.ts:122-129` queries `MIN(started_at) FROM sessions WHERE archived_at IS NULL`.
- Live SQLite (`%APPDATA%/com.claudemanager.app/db.sqlite`): 78 rows in `sessions`, but `COUNT(started_at) = 0` — every row's `started_at` is NULL.
- `src/lib/session-loader.ts:180-194` upserts only: `session_id, cwd, first_prompt, message_count, model, version, permission_mode, git_branch, kind, entrypoint, last_synced_at`. **`started_at` not in the column list.**
- `loadAllSessions()` (line 299) loads PID file data containing `startedAt` into a `pidsBySessionId` Map, then never passes it to `upsertSession()`.
- Phase 2 plan T2.5 (lines 387-388) lists the columns the upsert "must" write — `started_at` is not among them.

**Verdict:** The plan task scope itself omitted the column; the implementer faithfully followed the spec.

### 2.2 ActivityChart 4/7 (Bug 2)

See [stats-cache-investigation.md](./2026-05-09-stats-cache-investigation.md). One-line: claude-manager only reads the cache; the upstream CLI stopped writing it due to a known CLI bug; UI gives no staleness signal.

### 2.3 Quick Actions (Bug 3)

- `src/components/dashboard/QuickActions.tsx:5-6` comment: *"deferred to later phases"*; line 41: `disabled={true} aria-disabled="true"`, no `onClick`.
- Spec §4.1 lists New Session, Resume Latest, Open CWD, Rebuild Stats as required — but never **assigns the wire-up to a phase**.
- Phase 3 (plugins/skills/MCP), Phase 4 (dialogs/polish), and the UI defect sweep all touched Dashboard-adjacent code; **none picked up Quick Actions wiring**.
- Phase 4 T4.2 built a "New Session" dialog and `launch_session` Tauri command — but never connected the Dashboard button to it. The component exists; the wire is missing.
- UI defect sweep PR #22 saw the dead buttons and *worsened the situation*: instead of activating, it added `title="Coming soon"` to make the placeholder look intentional. That converts a bug into a quiet feature.

**Verdict:** Spec described WHAT, never declared WHEN. No task = no work = no feature, indefinitely.

### 2.4 System Health (Bug 4)

- `src/components/dashboard/SystemHealth.tsx:50-52` props default to `mcpCount=0, pluginCount=0, cliVersion="unknown"`.
- `src/sections/DashboardSection.tsx:80-100` (or thereabouts) **does not pass these props**.
- Status calc lines 82-84: zeroes/"unknown" → all "warn" forever.
- Tauri commands that *could* feed this exist: `read_claude_json`, `read_mcp_json`, `read_installed_plugins`, `read_settings_enabled_plugins`. None are called from the dashboard data path.
- No CLI version command exists at all.

**Verdict:** Same orphan-placeholder pattern as Bug 3 — UI shell shipped, data wiring task never created.

## 3. Why we (Claude) didn't catch these

The original question. Three layers, all confirmed:

### 3.1 Test stack is structurally blind to all four bug classes

`tests/setup.ts` mocks `@tauri-apps/api/window`. Per-test mocks at module boundary stub `dbSelect` and `readStatsCache` to return whatever the test wants. Result: every dashboard test passes against fabricated data shaped to satisfy assertions.

- Cannot detect Bug 1 (real DB returns NULL) — mocked DB returns whatever test gives it
- Cannot detect Bug 2 (real cache stale) — mocked reader returns synthetic complete series
- Cannot detect Bug 3 (button onClick is no-op) — tests assert "button is clickable", not "click does anything observable"
- Cannot detect Bug 4 (props never passed) — component tests instantiate the component WITH props, masking that the parent doesn't pass them

The PowerShell smoke scripts in `scripts/_test/` (helper.ps1, t313-smoke.ps1, etc.) take screenshots and use UIAutomation to click — but contain **zero assertions**. They are visual aids for a human reviewer, not gates.

There is **no Playwright, no WebDriverIO, no tauri-driver** anywhere in the repo. CI runs `npm test` (vitest) only.

### 3.2 Plan Verification gates are written as static checks, not behavioral assertions

Phase 2 T2.12 Verification (verbatim):
- "StatCard: renders value + label + accent stripe; verify each of 4 colors"
- "ActivityChart: populated state renders Recharts SVG with **N** data points"
- "QuickActions: 4 buttons present and clickable"
- "SystemHealth: indicator dot color reflects status"

None of these required real data, real interaction, or real wiring. "N data points" is N from the test fixture, not N from the live cache. "Clickable" means `disabled={false}` — ours says `disabled={true}` and still passes if the test sets it false.

T2.13 Verification *did* include a real-data line: *"navigate to Dashboard — stats / charts populated (or empty states if no data)"*. The escape hatch **"or empty states if no data"** is the killer — Active Since rendering "—" is an empty state, so the gate passes.

### 3.3 Spec declares features without scheduling them

§4.1 lists Quick Actions and SystemHealth fields as part of the dashboard. There's no phase-allocation table mapping each feature to a task ID. So when Phase 2 ships the UI shell with `disabled` and "later phases" comments, no follow-up phase is structurally required to pick them up.

### 3.4 Context-window? No — that wasn't the failure mode

This isn't a "ran out of context" problem. It's a "the rules of the game permit shipping placeholder UI as 'done'" problem. Process change is the lever, not bigger context.

## 4. The two repeatable process failures

| Failure | What it allowed |
|---|---|
| **F1. Verification gates accept mocked-data behavior as proof of real-data behavior** | Bugs 1, 2, 4 |
| **F2. Spec can describe a feature without assigning a task ID; "deferred to later phases" is accepted without naming the phase** | Bugs 3, 4 (and Bug 1's `started_at` omission is a degenerate case — the column was implicitly deferred but no follow-up exists) |

## 5. Tooling decision: tauri-driver + WebdriverIO

User-stated requirement: cross-platform.

Considered:
- **A. Extend PowerShell + UIAutomation** (existing scripts/_test/ stack). Windows-only. No DOM access — only AccessibilityName/Value, which React's complex DOMs render unreliably. Rejected: violates cross-platform requirement, fragile.
- **B. tauri-driver + WebdriverIO**. Officially supported, cross-platform (msedgedriver on Windows, WebKitWebDriver on macOS, webkit2gtk-driver on Linux), gives real DOM. Adds CI complexity. **Chosen.**
- **C. Playwright with Tauri community shim**. Better DX than WDIO, but the Tauri integration is community-maintained and lags releases. Rejected: don't bet on unofficial path.

**Decision: B.** Land in `tests/e2e/` with WDIO + tauri-driver. CI matrix: Windows + Linux (macOS deferred — no current macOS user, can add later).

## 6. Spec/process decision: orphan-placeholder rule + assertion-style verification

Two rules to add to `CLAUDE.md` "Executing a plan task":

**R1. No "or empty states if no data" escape clauses.** All real-data Verification items must be assertion-style with a concrete observable. Example transformation:
- BEFORE: *"Dashboard shows stats / charts populated (or empty states if no data)"*
- AFTER: *"Dashboard's Active Since stat shows a date in YYYY-MM-DD format (not '—'); ActivityChart's rightmost X-axis label is within 1 day of today; if either fails, the task is not done."*

**R2. Orphan placeholder rule.** Any disabled UI element, stub component, or "later phase" comment must declare the wire-up task ID in the same commit that introduces it. Format: `// TODO(T<phase>.<num>): wire up <thing>`. The plan task with that ID must exist (CI can grep for orphans). If the wiring isn't yet planned, the placeholder isn't allowed to ship — either schedule it or delete the UI.

Add **R3 Phase Smoke DoD**: every phase plan ends with a Smoke task that runs the full e2e suite, captures screenshots of every section, and embeds widget-level real-data values in the PR description.

## 7. Decision Log (chronological, this conversation)

| # | Decision | Rationale | Reversible? |
|---|---|---|---|
| 1 | Investigate root cause before fixing any bug | User explicitly asked "why didn't you find these" — process > patch | Yes |
| 2 | Use 4 parallel Explore subagents for the initial audit | 4 independent questions, none shared context, ideal parallel work | N/A — past |
| 3 | Tooling option B (tauri-driver + WDIO) | User stated cross-platform requirement | Yes — can swap to Playwright later |
| 4 | "Wide" spec template revision (rules R1+R2+R3, not just R1) | The audit found 6 orphan items; R1 alone wouldn't have caught them | Yes |
| 5 | Install sqlite3 CLI to inspect live DB (option A in earlier menu) | User chose A; faster than driving via app | N/A |
| 6 | Investigate stats-cache writer in parallel (option D) | User chose D; chose root-cause over workaround | N/A |
| 7 | **Do NOT take stats-cache writing into claude-manager** | Architectural boundary; CLI bug has upstream fix; two writers = corruption risk. See [stats-cache-investigation.md §5](./2026-05-09-stats-cache-investigation.md). | Yes — but high cost to revisit |
| 8 | Add `started_at` to upsert column list AND extract from PID file | The data exists in memory; only the SQL omits it. Minimal correct fix. | Yes |
| 9 | Add staleness banner to Dashboard for stale stats-cache | UX fix sibling to "Rebuild Stats" wire-up; doesn't cross architectural boundary | Yes |
| 10 | Create `2026-05-09-dashboard-activation.md` plan file for the 6 orphans | Formalize the orphan items as scheduled tasks; precondition for R2 enforcement | Yes |
| 11 | All these decisions documented in this file (§7) before user returns | User asked decisions to be written into docs for review | N/A |
| 12 | Continue execution while user is away rather than wait | User said "你帮我自己决策"; risk = false; reversibility = high | Yes (rollback via git) |
| 13 | CI matrix Windows + Linux only (macOS skipped initially) | Tauri v2 WebDriver officially does not support macOS; community shims unstable; no current macOS user | Yes — add when official |
| 14 | Pre-build app outside test loop (`test:e2e:build` script does it; `test:e2e` assumes existing binary) | Faster red-green iteration during development | Yes |
| 15 | **Defer fully-green e2e harness**; land scaffolding + open issue. Diagnostic findings: tauri-driver successfully starts session on Win11 with msedgedriver 148 matching WebView2 148, but the WebDriver session attaches to `about:blank` (handle exists, body empty) rather than the SPA context — known tauri-driver/WebView2 multi-process gotcha. Documented in §10 below. | Spending more time fighting tauri-driver attach context blocks all other RCA remediation work. The harness scaffolding is committed (wdio.conf.ts, tsconfig.e2e.json, tests/e2e/dashboard.spec.ts, npm scripts). Real Bug 1 fix can be verified with vitest + sqlite live read; full e2e adoption is a follow-on task. | Yes |

## 8. Concrete remediation order

(Translates to TaskList state at time of writing.)

1. ✅ Diagnose Bug 1/2 (Tasks #3, #9) — done; root causes confirmed
2. ✅ Stats-cache investigation (this doc + sibling) — done
3. ⏳ Set up tauri-driver + WDIO harness (Task #2) — next
4. ⏳ Red-green prove harness on current bugs (Task #1)
5. ⏳ Fix Bug 1: extend `upsertSession` columns + pass PID `startedAt` (Task #4 part 1)
6. ⏳ Fix Bug 2 *correctly*: staleness banner + period-toggle relabel (Task #4 part 2 — does NOT take over cache writing)
7. ⏳ Write `docs/superpowers/plans/2026-05-09-dashboard-activation.md` for 6 orphans (Task #5)
8. ⏳ Update CLAUDE.md with R1/R2 (Task #6)
9. ⏳ Add R3 phase Smoke DoD (Task #7)

Bugs 3 and 4 are NOT fixed in this RCA's scope — they're scheduled into the activation plan. Fixing them now without R2 in place would just hide the process gap.

## 9. Open questions for Ness on return

- **Q1.** OK with v2.1.105+ CLI upgrade as the user-side action for stats freshness? (We surface the issue in UI; we don't try to fix it in claude-manager.)
- **Q2.** macOS skipped from CI matrix initially — agree?
- **Q3.** "Rebuild Stats" Quick Action correct behavior: invoke `claude /usage` via Tauri shell. Acceptable? (Alternative: launch a terminal panel pre-typed with the command for user confirmation. Safer but more friction.)
- **Q4.** Staleness threshold: 1 day strict, or 24h rolling? (Going with 1 day strict for now; trivial to change.)
- **Q5.** E2E harness deferred-green status (decision #15 + §10). Two options: (a) spend a focused effort to crack the tauri-driver attach issue before any other Bug fix; (b) ship Bug 1 fix verified via vitest + sqlite live read, file the e2e attach-fix as a follow-on. I went with (b) per "don't block other work" reasoning. Confirm?

---

## 10. E2E harness — deferred-green status (added 2026-05-09 mid-execution)

### What works

- `cargo install tauri-driver --locked` → `tauri-driver.exe v2.0.6` installed at `~/.cargo/bin/`
- msedgedriver 148.0.3967.54 installed at `~/.cargo/bin/`, matching the **highest installed WebView2 runtime** (148.0.3967.54). Note: WebView2 runtime version, NOT Edge browser version, is what matters for tauri-driver — confirmed by trial of 147 (failed) → 148 (session created).
- `npm install --save-dev @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter webdriverio @types/mocha ts-node tsx`
- `wdio.conf.ts` at repo root (ESM-style, uses `import.meta.url`)
- `tsconfig.e2e.json` for the e2e tree (separate from main `tsconfig.json` which `include`s only `src`)
- `tests/e2e/dashboard.spec.ts` with assertion-style tests for all 4 RCA bugs (red-green spec, currently red as expected)
- `npm run test:e2e` script wired
- WDIO 9.27.1 successfully starts tauri-driver, gets a session (`Session ID: <uuid>`), reports correct driver `webview2 148.0.3967.54 windows`

### What's blocked

After session creation, `browser.getUrl()` returns `about:blank` and `document.body.innerHTML` is empty, even though the app is running and visible in another window. Single window handle present (`1E74D2601EE...`). The driver is not attached to the SPA's WebView2 context.

This is a known class of issue with tauri-driver on Windows — WebView2 spawns multiple processes (browser/host/renderer) and msedgedriver's default attach picks the wrong one, or attaches before the SPA navigates from about:blank to its content.

### Candidate fixes (not yet tried)

1. **Add startup delay in `beforeSession`**: increase the existing 1s wait to 5-10s and re-check window handles after wait
2. **Switch to all window handles + URL filter**: enumerate handles after wait, switch to the one whose `getUrl()` is not about:blank
3. **`tauri:options.webviewOptions`** — check tauri-driver source for capability fields that hint about target webview
4. **Manual `--native-driver` arg**: pass the explicit msedgedriver path to tauri-driver and use verbose flag to read its connect logs
5. **Try the Tauri webdriver-example repo's exact wdio config** to find the delta vs ours

### Decision: defer to follow-on (decision #15)

The harness scaffolding is committed and reproducible. Cracking the about:blank attach issue could take hours of trial-and-error against an undocumented tauri-driver internal. Meanwhile Bug 1 (the real Active-Since fix) can be **verified more cheaply and more truthfully** by:

1. Running the fix in `npx tauri dev`
2. Querying live SQLite with sqlite3 CLI (already installed) — `SELECT MIN(started_at) FROM sessions` should return a non-NULL epoch
3. Adding a vitest unit test that asserts the upsert SQL string contains `started_at` (catches future regression of the same omission)

This is enough verification for Bug 1 without blocking on e2e. Bug 2 (staleness banner) is a UI-only check verifiable by screenshot.

A new task **#10 "Crack tauri-driver about:blank attach issue and turn the dashboard.spec.ts red"** has been created to track the follow-on. It is a precondition for Phase Smoke DoD (rule R3) being enforceable, but does not block Bug 1/2 fixes.
