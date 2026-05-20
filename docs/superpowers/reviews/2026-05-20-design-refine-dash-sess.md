# Dashboard + Sessions design refinement — 2026-05-20

> Scope: §4 Dashboard (spec lines 94–122) and §5 Sessions (lines 123–230) of
> `docs/superpowers/specs/2026-05-03-claude-manager-design.md`. Code anchors:
> `src/sections/DashboardSection.tsx`, `src/sections/SessionsSection.tsx`,
> `src/components/dashboard/*`, `src/components/sessions/*`,
> `src/stores/{dashboard,session}-store.ts`.

## Summary

- §4 is **under-specified at the data layer**: it names data sources but never
  enumerates Quick Action wiring, SystemHealth data wiring, hourCounts heatmap
  presence, "Active Since" semantics, model donut color/segment ordering, or
  the stats-cache staleness banner that is already shipped in code
  (`ActivityChart.tsx:46`). All four RCA bugs are downstream of these gaps and
  the spec still doesn't close them.
- §5 has **two functional contradictions with code as shipped**:
  (1) §5.5 prescribes a tag-pills row that exists in code (`SessionCard.tsx:106-129`)
  but no spec section defines where tags come from, how they are created, or
  who edits them (§5.1 only lists `tags` as "App SQLite, user-managed"); and
  (2) §5.4 "My View" is supposed to support "drag-and-drop ordering" and
  "groups" but `SessionListPanel.groupMy()` (`SessionListPanel.tsx:47-58`)
  ships only "Pinned" + "All Sessions" with **no task ID referenced** — an
  orphan placeholder per CLAUDE.md R2.
- §5.6/§5.7 mention `state="alive (app-started)"` vs `state="alive (external)"`
  but the `SessionState` type (`session-types.ts` via
  `SessionCard.tsx:11`) is a flat `alive | ended | orphaned | archived`. The
  distinction is not in the data model — code cannot honor it.
- §4.1 Row 3 "Quick actions" lists four buttons (New / Resume Latest /
  Open CWD / Rebuild Stats) but the spec **never assigns a task ID** to any of
  them. `QuickActions.tsx:27-36` carries `TODO(T4.1/T4.2/T4.5)` comments per
  R2, yet T4.5 ("Command Palette") is a single bucket task — Rebuild Stats
  semantics (invoke `claude /usage`, per RCA decision #9/Q3) are not part of
  the spec at all.
- §5.5 sidebar width is fixed at 260px with no minimum-content rules; long
  CWD names in "By Project" view (which uses `cwd` as the bucket *label*,
  `SessionListPanel.tsx:71`) overflow the panel because no truncation contract
  exists in spec.
- The spec contains **zero R1-compliant Verification text for the Dashboard
  or Sessions** (R1/R2/R3 are CLAUDE.md execution-time rules but the spec
  drives plan Verification phrasing). §4.1 Row 1 says "computed from SQLite
  session metadata" with no acceptance criterion; the §4.1 Row 3 "Quick
  actions" line has no observable. This is the originating shape that
  produced RCA Bug 1 and Bug 3.

## §4 Dashboard — functional gaps

| # | Gap | Spec says | Code does | Cite |
|---|---|---|---|---|
| D-F1 | Quick Actions never assigned to a phase | "Quick actions — New Session (prominent), Resume Latest, Open CWD, Rebuild Stats" (spec:116) | All four `disabled`; tooltips read "Coming soon"; `TODO(T4.1/T4.2/T4.5)` references but T4.5 is the Command-Palette task, not a wire-up task for these buttons | spec:116, `QuickActions.tsx:27-36,82-88` |
| D-F2 | "Rebuild Stats" semantics undefined | Bare action label only (spec:116) | Disabled button; correct semantic per RCA decision #9 is "invoke `claude /usage` via Tauri shell", not "compute stats ourselves" | spec:116; RCA `2026-05-09-dashboard-bugs-rca.md` §7 row 9 |
| D-F3 | Staleness banner is shipped but not specified | §4.1 says "Data source: `stats-cache.json`" with no staleness contract (spec:112) | Banner active at >3 day staleness (`ActivityChart.tsx:46,156,199-230`) including text referencing CLI bug + `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Spec must own this behavior or it will get deleted as "scope creep" | spec:112; `ActivityChart.tsx:46-72,199-230`; spec §18 row added 2026-05-09 |
| D-F4 | "Active Since" semantics under-specified | "'Active since' date (mauve accent)" (spec:104) | Computed as `MIN(started_at)` over `archived_at IS NULL` (`dashboard-store.ts:138-141`). Spec never says whether archived rows count, what "since" means when all sessions are archived, or what to render when `started_at` is NULL for every row (RCA Bug 1) | spec:104; `dashboard-store.ts:131-142` |
| D-F5 | "Longest session" tie-break undefined | "Longest session by message count" (spec:103) | `ORDER BY message_count DESC LIMIT 1` (`dashboard-store.ts:145-153`) — non-deterministic for ties. Sublabel uses `display_name ?? first_prompt` but spec doesn't say which | spec:103; `dashboard-store.ts:145-153` |
| D-F6 | Recent sessions: `ALIVE` rows look dead | "Status dot + name + time ago + message count" (spec:114) | `RecentSessions.tsx:104-107` hard-codes a neutral `bg-text-muted` dot with comment "by definition not alive anymore in Phase 2". §5.3 ALIVE state pulses green — but on the Dashboard, an alive session can show up in Recent Sessions and look ended | spec:114; `RecentSessions.tsx:101-107` |
| D-F7 | "Recent sessions" rows are non-interactive but spec says "list" | "Recent sessions list (last 8) … 'View All Sessions' link" (spec:114-115) | Rows have no `onClick`, no link; only the "View All Sessions" link works (`RecentSessions.tsx:40-47`). Users cannot click a recent session to open it — major dead-affordance | spec:114-115; `RecentSessions.tsx:94-164` |
| D-F8 | SystemHealth data sources not enumerated | "System health — MCP connection status, plugin count, API reachability, CLI version" (spec:117) | `SystemHealth.tsx:71-77` accepts `mcpCount`, `pluginCount`, `cliVersion` as props **defaulted to 0/'unknown'** and `DashboardSection.tsx:155-158` passes none. RCA Bug 4. Spec must say which Tauri commands feed which prop | spec:117; `SystemHealth.tsx:71-77`; `DashboardSection.tsx:155-158`; RCA §2.4 |
| D-F9 | Heatmap promised by DESIGN-CONTEXT §6, missing from §4 | DESIGN-CONTEXT §6: "`hourCounts` (GitHub-style heatmap)" | §4.1 spec doesn't mention a heatmap; `stats-reader.ts` reads hourCounts but nothing renders it. Either drop from DESIGN-CONTEXT or add to §4.1 Row 2/4 | DESIGN-CONTEXT.md:248-253; spec:108-112 |
| D-F10 | Model donut: stable color binding not specified | "Legend with token counts per model" (spec:110) | `ModelDonut.tsx:16-23` assigns colors by **list index** (`SEGMENT_VARS[i % …]`). When a model drops out of the window, every other model's color reshuffles between renders | spec:110; `ModelDonut.tsx:16-23,61-67` |
| D-F11 | One-shot load only; refresh contract missing | §4 entire section silent on when data refreshes | `DashboardSection.tsx:45-49` loads once on mount; CLAUDE.md DESIGN-CONTEXT §10 promises "Stats cache: read on mount + window focus" — neither window-focus refresh nor a manual-refresh button exists | spec:94-121; `DashboardSection.tsx:45-49`; DESIGN-CONTEXT.md §10 |

## §4 Dashboard — UI problems

| # | Issue | Cite |
|---|---|---|
| D-U1 | Loading state contract violated | §17.6 (spec:614-616): "Skeleton cards (pulsing gray rectangles) for stat cards and charts". `DashboardSection.tsx` renders no skeleton — it relies on each child component's empty branch. On cold start (`isLoading=true`, `sessions=0`) the user sees four "0" stat cards + "No activity yet" + "No data" + "No recent sessions" + perma-warn SystemHealth — indistinguishable from a fresh-install steady state. Violates §17.6. |
| D-U2 | Empty-state CTA missing | §17.6 promises "'No sessions found. Start your first session to see stats here.' + New Session button" on Dashboard empty. Code has no such state — the RecentSessions empty message is `"No recent sessions"` (`RecentSessions.tsx:66`) and there is no CTA |
| D-U3 | Error banner is dismissable-looking but isn't | `DashboardSection.tsx:66-93` shows a soft amber banner only when SQLite reads throw. It does not surface stats-cache staleness (that's inside `ActivityChart`). Two staleness signals at different scopes confuse users — one is dashboard-global, one is chart-only |
| D-U4 | "View All Sessions" link is the only navigation, but rows look clickable | Recent session rows have `hover` styling (`RecentSessions.tsx:99` `className=… min-w-0` — no explicit hover, but the list item with padded card-bg context invites a click). Combined with D-F7, this is a dead-affordance UX bug |
| D-U5 | Stat card uses raw value with no unit / locale | `StatCard` value `45128` for messages renders as `45128` not `45,128`. `tabular-nums` is applied (`StatCard.tsx:92`) but no `Intl.NumberFormat`. Hard to read at a glance |
| D-U6 | Quick Actions and SystemHealth share the 40% column with no priority order | Spec §4.1 says "Right top: Quick actions. Right bottom: System health" (spec:116-117). Code matches, but with both rendered at fixed height the column overflows on small windows because `min-h-[260px]` is set on Row 3 grid but not the inner column (`DashboardSection.tsx:149-150`). On a 1366×768 window the System Health card scrolls behind the viewport. Spec needs a `min-width` rule for Row 3 |
| D-U7 | No headings hierarchy across rows | Section uses `sr-only h1` (`DashboardSection.tsx:62-64`) and each card has `h3` — Row labels (Stats, Activity, Sessions, Health) are not present, so SR landmarks rotor lists 6 h3s with no grouping |

## §4 Dashboard — proposed spec changes

**Replace lines 94–122** with the following (replaces all of §4 through "**Mockup:** `dashboard.html`"):

```markdown
## 4. Dashboard

Full-page view with stat cards, charts, recent sessions, quick actions, and
system health. Read-only consumer of Claude Code data (see §18 — stats-cache.json
is CLI-owned; the dashboard surfaces staleness, never writes).

### 4.1 Layout

**Row 1 — Stat Cards** (4 cards, `grid-cols-4`):

| Card | Source | Computation | Empty render |
|---|---|---|---|
| Sessions | App SQLite `sessions` | `COUNT(*) WHERE archived_at IS NULL AND is_sidechain = 0` | `0` |
| Total messages | App SQLite | `SUM(message_count) WHERE archived_at IS NULL` (formatted with `Intl.NumberFormat`) | `0` |
| Longest session | App SQLite | `ORDER BY message_count DESC, started_at ASC LIMIT 1`. Tie-break: earliest `started_at` wins. Sublabel: `COALESCE(display_name, first_prompt)` truncated to 60 chars | `—` |
| Active since | App SQLite | `MIN(started_at) WHERE archived_at IS NULL`. Format `Mon DD, YYYY`. If every row has `started_at = NULL` (RCA Bug 1 class), render `—` AND emit a `loadError` banner that says "Session timestamps not yet imported — try Refresh" | `—` |

Accent colors: Sessions = green, Messages = blue, Longest = yellow,
Active since = mauve (`--color-accent`). Stripe is decorative
(`aria-hidden`); value text uses `--color-status-yellow-text` for the yellow
card to satisfy WCAG 1.4.3.

**Row 2 — Charts** (60/40 split, `grid-cols-5`):

- Left (`col-span-3`): Activity stacked area chart (Recharts).
  - Period toggle: `7d / 30d / 90d / all`. Period strings are exact lowercase
    tokens; mapping table is `{ "7d":7, "30d":30, "90d":90, "all":Infinity }`.
  - Series toggle: `messages` vs `toolCalls`.
  - Staleness banner: when `max(dailyActivity[].date)` is more than
    `STALENESS_BANNER_THRESHOLD_DAYS = 3` days behind UTC-midnight today,
    render an amber `role="alert"` banner explaining that
    `~/.claude/stats-cache.json` is CLI-owned and pointing to the upstream
    fix (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` removal in CLI v2.1.105+
    or running a fresh CLI session). See §18 for the architectural boundary.
- Right (`col-span-2`): Model usage donut.
  - Segment color must be **stable across renders for a given model name**.
    Implementation: hash model name → palette index (not array-index based).
  - Legend: model, share (`X.Y%`, sub-0.1% as `<0.1%`), absolute tokens
    formatted in `k` / `M`.

Data source: `~/.claude/stats-cache.json` via `src/lib/stats-reader.ts` (read-only).

**Row 3 — Info** (60/40 split, `grid-cols-5`):

- Left (`col-span-3`): Recent sessions list (last 8 by `started_at DESC`).
  - Row anatomy: status dot (live color per §5.3 — alive rows pulse green,
    ended muted, orphaned amber, archived hidden) + display_name (or
    firstPrompt) + time-ago + message-count.
  - **Each row is a `<button>` (or `<a>`) that calls
    `navigationStore.navigateTo("sessions")` AND
    `sessionStore.selectSession(row.sessionId)`** — clicking a row opens the
    session detail. The current "non-interactive list" rendering is a defect
    (RCA-class dead-affordance).
  - "View All Sessions" link in the header navigates to Sessions section.
  - Empty: "No sessions yet — start your first one." + primary
    "+ New Session" button that triggers the same handler as the Quick
    Actions "New Session" button (see Row 3 right).

- Right (`col-span-2`, two stacked cards):
  - **Quick actions** card. Four buttons, each with a phase-allocated wire-up
    task:
    | Button | Action | Wire-up task |
    |---|---|---|
    | New Session (primary) | Open New Session dialog (§10) | **T4.2** (Dialog UI) |
    | Resume Latest | `claude --continue` via Tauri shell, in user's default terminal | **TBD-T4.6** (new task — currently orphaned, see Out-of-scope §1) |
    | Open CWD | Tauri shell `open()` on `userPreferences.defaultProjectDir` or `$HOME` | **TBD-T4.7** (new task) |
    | Rebuild Stats | Tauri shell launches `claude /usage` (the CLI is the writer; we are not). On completion, re-read stats-cache.json and refresh charts | **TBD-T4.8** (new task) |
    Any button whose wire-up task has not yet shipped MUST render disabled
    AND carry an inline `// TODO(T<phase>.<num>): wire up X` comment (CLAUDE.md
    R2). Shipping a disabled button without a referenced, existing task ID is
    a build-time failure.

  - **System health** card. Four indicators, each backed by a real data
    source — defaults are FORBIDDEN; if a source has not been wired the
    indicator must render `state="checking"` until wired:
    | Indicator | Source (Tauri command) | OK when |
    |---|---|---|
    | MCP | `read_claude_json` → count `$.mcpServers` keys | count ≥ 1 |
    | Plugins | `read_installed_plugins` + `read_settings_enabled_plugins` → count enabled installed plugins | count ≥ 1 |
    | API | HEAD probe of `ANTHROPIC_BASE_URL` from `config.json` (timeout 8s, 2xx/401/403 = OK) | 2xx / 401 / 403 |
    | CLI | `get_cli_version` (executes `claude --version` once on mount, caches result) | semver parses |

### 4.2 Loading and Empty States

| State | Render |
|---|---|
| Loading (first paint, no SQLite data yet) | 4 skeleton stat cards + 1 chart skeleton + 1 donut skeleton + 1 recent-sessions skeleton (4 rows) per §17.6. Skeletons MUST be visually distinct from "0" values |
| Empty (SQLite has 0 non-archived sessions) | Full-card empty-state with illustration and "+ New Session" CTA per §17.6. NOT a row of zeros |
| SQLite error | Non-dismissable amber banner at top: "Couldn't load some dashboard stats — figures may be stale (<error message>). [Retry]" |
| Stats-cache stale (>3 days) | Chart-level amber banner inside ActivityChart (see §18) |
| Stats-cache missing | Chart renders empty state ("No activity yet") AND System Health "CLI" indicator surfaces "Stats cache missing — run `claude /usage`" |

### 4.3 Refresh

- Initial load: on `DashboardSection` mount.
- Window focus: re-run `loadDashboard()` on `window` `focus` event
  (debounced 1s). Per DESIGN-CONTEXT §10.
- Manual: "Rebuild Stats" Quick Action button.
- File watch on `~/.claude/stats-cache.json`: deferred to Phase 4 Task 10
  per current plan. The spec must declare deferral explicitly; absent FS
  watch, focus + manual are the only refresh paths.

### 4.4 Verification (R1 — every item is assertion-style)

- Sessions stat-card value equals `SELECT COUNT(*) FROM sessions WHERE archived_at IS NULL AND is_sidechain = 0` from the live DB at `%APPDATA%/com.claudemanager.app/db.sqlite`.
- Active Since stat-card text matches `^[A-Z][a-z]{2} \d{1,2}, \d{4}$` (e.g. `May 03, 2026`). `—` is allowed ONLY if `SELECT COUNT(started_at) FROM sessions WHERE archived_at IS NULL = 0`; otherwise a `—` is a failure.
- ActivityChart's rightmost X-axis tick is within 1 day of today's UTC date when `STALENESS_BANNER_THRESHOLD_DAYS` is not exceeded; otherwise the staleness banner is visible and its `data-staleness-days` attribute equals `floor((today_utc_midnight - max(dailyActivity.date)) / 86400000)`.
- All four Quick Actions buttons are `enabled` after their referenced wire-up tasks ship. Clicking each produces a side effect (open dialog / spawn terminal / open shell / spawn `claude /usage`); a `disabled` Quick Action without a referenced existing task ID fails the build.
- All four SystemHealth indicators render a non-`checking` status within 10s of mount with at least one (API) confirmed via an actual network call. Defaults (`mcpCount=0` etc.) are not permitted to be the sole reason for a `warn`.
- Recent session row click navigates to Sessions section AND selects that session (`useSessionStore.selectedId` equals the clicked row's id).

**Mockup:** `dashboard.html`
```

## §5 Sessions — functional gaps

| # | Gap | Spec says | Code does | Cite |
|---|---|---|---|---|
| S-F1 | "ALIVE app-started vs external" distinction is invisible in data model | §5.7 (spec:202-206) splits ALIVE into two render paths — "app-started" → full xterm.js PTY; "external" → JSONL tail | `SessionState = "alive" | "ended" | "orphaned" | "archived"` (`SessionCard.tsx:11`). No `entrypoint`/`spawnedByApp` flag distinguishes the two. SessionInfoBar has `actions.alive` (`SessionInfoBar.tsx:82-89`) with a single action set | spec:200-208; `SessionInfoBar.tsx:81-109` |
| S-F2 | "My View" groups/drag-and-drop unspecified and unimplemented | §5.4 (spec:180): "User-organized groups with custom tags. Drag-and-drop ordering. Pinned items float to top. Groups are collapsible with count badges." | `groupMy()` (`SessionListPanel.tsx:47-58`) ships only `Pinned` + `All Sessions`. No groups, no DnD, no collapse, no count badges (besides the header parens already present) | spec:180; `SessionListPanel.tsx:47-58` |
| S-F3 | Tag CRUD nowhere in spec | §5.1 (spec:140): "`displayName, tags, groupId, isPinned, archivedAt` | App SQLite | User-managed metadata" | `SessionCard.tsx:106-129` renders tag pills; no edit UI exists. SessionInfoBar exposes only a `tag-rename` button label (`SessionInfoBar.tsx:87`) which is disabled. No spec section defines tag creation, the tag color taxonomy, or the storage shape | spec:140; `SessionCard.tsx:106-129`; `SessionInfoBar.tsx:87` |
| S-F4 | "Sub-agent sessions, hide from main list" — applies to ALL views? | §5.1 (spec:139) "isSidechain — hide from main list" | `filterSessions()` (`session-store.ts:84`) hides them unconditionally. Spec doesn't say whether a dedicated "Sub-agents" view exists; if not, those sessions are silently dropped forever | spec:139; `session-store.ts:78-93` |
| S-F5 | "Display name" persistence is in-memory only | §5.1 (spec:140) says displayName is "App SQLite" | `setSessionDisplayName` mutates Zustand only; `SessionInfoBar.tsx:212-215` literally annotates "session-scoped — not yet saved across reloads". No task ID referenced — orphan per R2 | spec:140; `session-store.ts:57-62`; `SessionInfoBar.tsx:211-215,242-243` |
| S-F6 | Dual-write safety: who enforces it? | §5.3.1 (spec:174): "Before resuming a session, verify no PID file in `sessions/` references that sessionId" | No code path checks this — `SessionInfoBar` `resume`/`resume-terminal` buttons are all disabled. When wired, where does this check live (frontend? Tauri command?) is unspecified | spec:174 |
| S-F7 | "ORPHANED" detection contradicts DESIGN-CONTEXT | §5.3 (spec:158): "Index entry but no JSONL file" | DESIGN-CONTEXT §2.2 says **100% of index `fullPath` entries are dangling** in observed snapshots and the index must not be primary. So either every session would be ORPHANED, or the index must not be used at all. The spec's detection rule is incompatible with reality — Rust `discovery.rs:1-6` correctly enumerates JSONL directly | spec:158; DESIGN-CONTEXT.md:57-67; `discovery.rs:1-6` |
| S-F8 | "Sessions count badges" missing from Project / Timeline views | §5.4 (spec:181-182): "By Project — Auto-grouped by CWD path. Collapsible groups with session count badges." | `SessionListPanel.tsx:266-268, 308-309` renders `(N)` next to label — that satisfies the badge, but **collapse** is not implemented and the spec gives no contract for collapsed-state persistence | spec:181-182; `SessionListPanel.tsx:258-329` |
| S-F9 | Search "highlight matches" missing | §17.7 (spec:630): "Highlight: Matching text segments highlighted with accent background (`bg-accent/20`)" | `SessionCard.tsx:54-57,61,101` plain-text renders the label with no highlight; `SessionListPanel.tsx` doesn't tokenize query | spec:630; `SessionCard.tsx:59-104` |
| S-F10 | Dead-CWD detection is buried in §17.5 — Session List doesn't show the warning | §17.5 (spec:606): "Session card shows ⚠ icon" | `SessionCard.tsx` has no `exists()` check — only `SessionInfoBar` does (`SessionInfoBar.tsx:138-156`). User cannot see in the list which sessions have dead CWDs | spec:606; `SessionCard.tsx`; `SessionInfoBar.tsx:138-260` |
| S-F11 | "model" in §5.1 is "claude-opus-4.6-1m" — drift with actual JSONL | §5.1 (spec:136): "Assistant message → `message.model`" | OK — but DESIGN-CONTEXT §3 example value is `"claude-opus-4.6-1m"` while the live build identifier in this user's CLAUDE.md mentions `claude-opus-4-6[1m]`. Spec should not pin example values that drift | spec:136; DESIGN-CONTEXT.md:122 |

## §5 Sessions — UI problems

| # | Issue | Cite |
|---|---|---|
| S-U1 | Virtual-list branch and non-virtual branch produce different DOM semantics | `SessionListPanel.tsx:283-329` wraps cards in `<ul><li>` for ≤50 sessions; `SessionListPanel.tsx:241-281` virtualizes them as bare `<button>`s. Result: NVDA/JAWS "L" list navigation works for small lists, breaks for >50. Acknowledged in code comment but spec says nothing |
| S-U2 | New Session button is disabled with no spec-mandated CTA elsewhere | `SessionListPanel.tsx:192-208`. Spec §5.5 (spec:189) declares "+ New Session" button "prominent, accent color" — but the spec never says what to do when it isn't wired yet. Currently the most prominent button in the section is non-functional |
| S-U3 | Empty-state copy doesn't match §17.6 | §17.6 (spec:617): "'No sessions found' with illustration + 'New Session' CTA". `SessionListPanel.tsx:220-222` shows only "No sessions found" text — no illustration, no CTA |
| S-U4 | SessionInfoBar `state-pill` badge row wraps awkwardly | `SessionInfoBar.tsx:216-322`: state pill + model + msgs + entrypoint badges are all `flex` siblings; with long model names (`claude-opus-4-6[1m]`) the row pushes the name input to wrap and the action toolbar drops below. No spec contract on max-width / truncation order |
| S-U5 | The detail-empty state is plain text — no illustration | `SessionDetailPanel.tsx:18-29`. Spec §17.6 (spec:618) demands "Select a session to view its conversation" only — but says nothing about a primary affordance. Inconsistent with how Plugins / MCP detail-empty render |
| S-U6 | "Tag/Rename" action is one button but covers two concerns | `SessionInfoBar.tsx:87`. Spec §5.3 (spec:156) bundles them. Tags = list of strings with colors (per DESIGN-CONTEXT §3); rename = single text field. One disabled button can't gracefully ship one and defer the other |
| S-U7 | ALIVE-session "danger" Stop button has no confirm gate in spec | §5.3.1 (spec:167) only says "Confirm with user before sending". `SessionInfoBar` ships it disabled. Spec must say: modal? `window.confirm`? toast? — anchors the e2e test (R3 Phase Smoke DoD) |
| S-U8 | The detail header lacks any breadcrumb to the project/CWD | `SessionInfoBar.tsx:216-322`. CWD is non-clickable, non-displayed. Spec §5.6 (spec:196-198) defines only "session name, status badges, action buttons" — no path indicator. Hard to know what project a session belongs to without switching to "By Project" view |
| S-U9 | "Toolbar" overflow on narrow detail pane | `SessionInfoBar.tsx:343-347` `flex flex-wrap` — 7 buttons in ALIVE state wrap to 2 rows below ~700px detail-pane width. Spec gives no priority order for collapsing into an overflow menu |

## §5 Sessions — proposed spec changes

**Replace lines 123–230** (all of §5 through "**Mockups:** `session-detail-v2.html`, `session-views.html`, `conversation-viewer.html`" but keep §5.8 message-types table as-is — it's still correct).

```markdown
## 5. Sessions

### 5.1 Data Sources

Session metadata is assembled from multiple sources. The filesystem is
canonical; `sessions-index.json` is a soft hint (see §17.4 / DESIGN-CONTEXT §2.2)
because every observed `fullPath` entry in the index dangles.

| Property | Source | Notes |
|---|---|---|
| pid, sessionId, cwd, startedAt, kind, entrypoint | `~/.claude/sessions/{pid}.json` | PID file only exists while session is alive. `kind` is one of `interactive`/`headless`/`sdk`/`print` — unknown values flow through verbatim (DESIGN-CONTEXT §3). `startedAt` is epoch ms (integer). |
| firstPrompt, summary | JSONL parse (first ~10 lines); index used only as fallback when JSONL parse yields no match | |
| messageCount, duration, toolsUsed | Computed from JSONL | Count `user` + `assistant` messages only |
| permissionMode | First `permission-mode` JSONL line | |
| model | Latest `assistant` message → `message.model` (use latest, not first — model can change mid-session) | |
| version | Any JSONL message → `version` field | CLI version |
| gitBranch | Any JSONL message → `gitBranch` field | |
| slug | System messages in JSONL | Present in ~45% of sessions |
| isSidechain | `sessions-index.json` `entries[].isSidechain` keyed by sessionId | Sub-agent sessions, hidden from main list AND surfaced in a future "Sub-agents" view (TBD-Phase-5) |
| spawnedByApp | App SQLite | `true` when launched via Claude Manager's New Session dialog; drives ALIVE-state rendering choice (§5.7) |
| displayName, tags, groupId, isPinned, archivedAt | App SQLite | See §5.1.1 for tag/group schemas |

#### 5.1.1 Tag and Group Schemas

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,          -- uuid
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL            -- one of: red / amber / green / blue / mauve / muted
);
CREATE TABLE session_tags (
  session_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (session_id, tag_id)
);
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0
);
```

Tag CRUD lives in the Tag/Rename dialog (§5.6.1, deferred to Phase 4 Task
**TBD-T4.9**). Until shipped, tags display read-only.

### 5.2 Data Discovery

1. Enumerate `~/.claude/projects/*/` directories.
2. Glob `*.jsonl` files per project directory (each file = one session).
3. Parse first ~10 lines of each JSONL for metadata.
4. Cross-reference with `~/.claude/sessions/*.json` PID files for alive status.
5. Use `sessions-index.json` only for `summary`/`firstPrompt` fallback;
   NEVER trust it as the session list (its `fullPath` entries dangle ~100%
   in observed installs — see DESIGN-CONTEXT §2.2).
6. Validate: if JSONL mtime > index mtime, re-parse.
7. Upsert into app SQLite. **The upsert column list must include every
   property in §5.1 sourced from disk** — explicitly: `session_id, cwd,
   first_prompt, message_count, model, version, permission_mode, git_branch,
   kind, entrypoint, started_at, last_synced_at`. RCA Bug 1 shipped because
   `started_at` was omitted; adding a property to §5.1 must include the
   upsert column.

### 5.3 Session States

| State | Detection | Status Dot | Action Set |
|---|---|---|---|
| ALIVE (app-started) | PID file exists + `node.exe` cmdline contains `claude-code/cli.js` + `sessions.spawnedByApp = 1` | Green (pulse) | View Live (xterm), Stop, Open CWD, Open in VS Code, Tag/Rename |
| ALIVE (external) | Same PID/cmdline check + `spawnedByApp = 0` | Green (pulse) | View Tail (read-only JSONL stream), Resume in Terminal, Open CWD, Open in VS Code, Tag/Rename, Stop |
| ENDED | No PID file; JSONL exists | Gray | Resume, Fork, View Conversation, Open CWD, Open in VS Code, Tag/Rename, Archive |
| ORPHANED | JSONL parse failed OR PID file references a sessionId with no JSONL on disk | Amber (`bg-status-amber`), italic name | Resume (may work), Open CWD, Delete from list |
| ARCHIVED | `archived_at` set in SQLite | Hidden by default; "Archived" badge when shown via Archived filter | Unarchive, View Conversation, Delete |

Note: the previous spec defined ORPHANED as "Index entry but no JSONL file"
— that test cannot fire because the index is not the source of truth. The
revised definition above lines up with `discovery.rs` (FS-walk primary).

### 5.3.1 CLI Commands for Session Actions

| Action | Command | Confirmation |
|---|---|---|
| Resume | `claude --resume <sessionId>` | None — but verify no PID file in `sessions/` references this sessionId first (dual-write safety). Verification lives in the Tauri command `launch_session`; frontend never reads PID files directly. |
| Fork | `claude --resume <sessionId> --fork-session` | None |
| Stop | `SIGTERM` → wait 5s → `SIGKILL` if still alive | Modal: "Stop session?" with session name, primary "Stop" (danger variant), secondary "Cancel". `window.confirm` is NOT acceptable — must be the app's modal so tests can assert on it. |
| New Session | `claude [--cwd <dir>] [--model <m>] [--permission-mode <pm>] [-p "<prompt>"]` | None |

**Critical:** ALIVE sessions (both flavors) must NOT show a "Resume" button.
External-ALIVE shows "Resume in Terminal" (opens OS terminal at the session's
CWD with `claude --resume` pre-typed). App-started-ALIVE shows "View Live"
(focuses the in-app xterm).

**Process detection:** Claude CLI runs as `node.exe`. Check CommandLine
for `claude-code/cli.js`. Use PowerShell `Get-WmiObject Win32_Process`
(NOT `tasklist` — fails in bash). Cross-check process creation time vs
`startedAt` to defeat PID reuse.

### 5.4 Session Views

Three view modes share a toggle in the list sidebar:

1. **My View (default)** — Pinned items in a "Pinned" group; remaining
   sessions split across user-defined groups (`groups` table). Sessions
   without a group go to "Ungrouped". Groups are collapsible (state
   persisted in `groups.collapsed`) and show a `(N)` count badge.
   Drag-and-drop reordering within a group is **deferred to Phase 5**;
   until then, items sort by `started_at DESC`. The deferral is tracked
   as **TBD-T5.1** — `// TODO(T5.1)` in code (CLAUDE.md R2).
2. **By Project** — Auto-grouped by `cwd` path (basename used as label,
   full path on tooltip and as `aria-label`). Each group has `(N)` badge
   and is collapsible.
3. **Timeline** — Chronological buckets: Today, Yesterday, This Week, then
   by month (e.g. "April 2026"). Sessions with `started_at = NULL` go to
   an "Undated" bucket at the bottom.

All three views share the same search bar. Sub-agent sessions
(`isSidechain = 1`) are excluded from all three; a future "Sub-agents"
view (TBD-Phase-5) will surface them.

### 5.5 Session List Panel

Left sidebar, **width 260px**, minimum content width 200px (long
project / model names truncate with tooltip).

Top → bottom:

1. **"+ New Session"** button (accent, full-width). Wired in Phase 4
   Task T4.1 (Launcher) + T4.2 (Dialog UI). Until shipped, render as
   disabled with `// TODO(T4.2)` per R2 — but this is the dashboard
   section's primary CTA; spec demands T4.2 ship before any §5 e2e Smoke
   gate (R3) can pass.
2. View-mode toggle (My View / Project / Timeline) — ARIA tablist.
3. Search bar (§17.7).
4. Scrollable grouped list of session cards. Switch to virtualization at
   >50 post-filter sessions (§17.8). The virtual and non-virtual branches
   must produce equivalent ARIA semantics — wrap virtualized cards in a
   `role="list"` container and emit each card with `role="listitem"`.

Session card anatomy:

- Status dot (color per §5.3) with `aria-label` matching state name.
- Display name (or truncated firstPrompt). Italic when ORPHANED.
- Optional ⚠ inline icon when the session's `cwd` does not exist on disk
  (§17.5 expansion).
- Tag pills (read-only until Phase 4 Task TBD-T4.9 ships tag CRUD).
- Time-ago footer + message-count footer.
- Search matches highlighted with `bg-accent/20` per §17.7.

### 5.6 Session Detail Panel

Right content area. When no session selected: empty state per §17.6.

Selected layout (top → bottom):

1. **Breadcrumb row** (NEW): `cwd` shown as `…/<parent>/<basename>` with
   a "Copy path" affordance and "Open CWD" icon button.
2. **Title row**: editable display-name input (Enter commits, Esc reverts)
   + status pill + model badge + message-count badge + entrypoint badge.
   Persistence: writes to `sessions.display_name` via SQLite **synchronously**
   — in-memory-only writes are FORBIDDEN per R2 (current code violates this,
   `SessionInfoBar.tsx:211-215`).
3. **Action toolbar** (`role="toolbar"`, `aria-label="Session actions"`).
   Action set per §5.3. When the toolbar would wrap, items collapse into
   an overflow menu in this priority order (lowest priority drops first):
   `Tag/Rename` → `Archive`/`Delete` → `Open in VS Code` → `Open CWD` →
   `Fork` → `Resume in Terminal` → `Stop` → `Resume`/`View Live`.
4. **Content view** per §5.7.

#### 5.6.1 Tag/Rename Dialog (TBD-T4.9)

Modal with:
- Display name text input (max 80 chars; saves on submit).
- Tag multi-select: pick existing tags or create new (name + color from
  the 6-color palette in §5.1.1).
- Group picker (single-select, "(none)" allowed).

### 5.7 Terminal and Conversation Views

| State | Content View |
|---|---|
| ALIVE (app-started) | Full xterm.js terminal via custom Rust PTY plugin. Interactive. |
| ALIVE (external) | Read-only JSONL tail with live updates via FS watch. "Resume in Terminal" opens OS terminal. |
| ENDED / ARCHIVED | Read-only conversation viewer with virtual scrolling and jump-to-turn navigation. |
| ORPHANED | Placeholder: "Conversation file not found. The session metadata exists but the JSONL was deleted or moved. You can still resume or delete the entry." |

**Large file handling:** Parse first 50 messages immediately, rest in a
Web Worker. Virtual scrolling via `@tanstack/react-virtual`. Internal
JSONL line types (`permission-mode`, `file-history-snapshot`,
`queue-operation`, `last-prompt`) are skipped.

**Mockups:** `session-detail-v2.html`, `session-views.html`,
`conversation-viewer.html`

### 5.8 (unchanged — keep the message-types table at current spec lines 212–228)

### 5.9 Verification (R1)

- Sessions count loaded via `loadAllSessions()` equals the number of
  `.jsonl` files found under `~/.claude/projects/*/` minus
  `isSidechain` rows. Off-by-one fails.
- Every column listed in §5.2 step 7 is non-NULL for at least one row in
  the live SQLite after a fresh launch — explicitly `SELECT COUNT(*)
  FROM sessions WHERE started_at IS NULL` must equal
  `SELECT COUNT(*) FROM sessions WHERE pid_file_missing_at_discovery = 1`
  (i.e. only ORPHANED sessions are allowed NULL `started_at`).
- ALIVE-state SessionCard's status dot has the `animate-pulse` class and
  computed color `--color-status-green`.
- Clicking a SessionCard sets `useSessionStore.selectedId` to that
  session's id within 50ms; the detail pane's breadcrumb shows that
  session's `cwd`.
- Tag/Rename modal save: round-trip via SQLite — close + reopen the app
  and the tag still appears on the session card.
- Search query "foo" highlights every "foo" substring in visible session
  cards with `bg-accent/20`; querying a string with no matches renders
  the empty-state copy with the exact query echoed back.
- New Session button is `enabled` in any production build (R2 — orphan
  disabled buttons fail the build once T4.2 ships).

---
```

## Out of scope / flagged for cross-section attention

1. **New plan needed: `2026-05-09-dashboard-activation.md`** is referenced
   by RCA decision #10 but does not exist. The four Quick Actions, the
   SystemHealth wiring, and the session display-name persistence are all
   real orphans without a plan to live in. The cross-review agent should
   create this plan or assign each item to an existing/upcoming phase
   (per CLAUDE.md R2 enforcement).
2. **§10 New Session dialog** is the wire-up target for two Dashboard
   buttons and the Sessions sidebar CTA. The cross-review of §10 should
   ensure T4.2's DoD assertions cover both call sites.
3. **§17.6 (Loading & Empty States)** contradicts current Dashboard
   behavior (D-U1, D-U2 above). Either §17.6 must relax (drop the
   "skeleton stat cards" rule) or DashboardSection must add skeletons.
   Cross-review owner should pick one.
4. **§17.7 (Search Behavior)** — the highlight contract (`bg-accent/20`)
   is unimplemented across at least Sessions, and likely Plugins / Skills
   / MCP too. Cross-review §17.7 enforcement at section-by-section level.
5. **§18 (Visual Mockups Index)** — `dashboard.html` and
   `session-detail-v2.html` mockups should be re-verified against the
   refined §4/§5 specs; any drift becomes a follow-on task.
6. **§17.5 Error Handling** — dead-CWD ⚠ icon is required on session
   cards (spec:606) but only `SessionInfoBar` checks. Either §5.5 or
   §17.5 needs to say which component owns the check; touching both in
   isolation will diverge.
7. **DESIGN-CONTEXT.md §10 "Data Refresh Strategy"** — the spec §4 is
   silent on this; the refined §4.3 above adds the focus-refresh rule.
   Cross-review should confirm DESIGN-CONTEXT remains the source of
   truth for refresh policy across all sections (MCP, Plugins) or move
   it into the spec proper.
8. **CLI version Tauri command** (`get_cli_version`) referenced in the
   refined §4.1 SystemHealth table does not exist in
   `src-tauri/src/`. New task needed (cross-cuts Settings § for "CLI
   version" display too).
