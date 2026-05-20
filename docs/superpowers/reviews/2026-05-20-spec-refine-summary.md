# Spec refinement summary — 2026-05-20

_Inputs: 3 refine reviews + 3 cross-reviews. Total 152 issues raised. This file is the consolidated changelist for spec patching after Ness sign-off._

Abbreviations: **DS** = `2026-05-20-design-refine-dash-sess.md`, **PS** = `2026-05-20-design-refine-plug-skill.md`, **MS** = `2026-05-20-design-refine-mcp-set.md`. Cross-reviews: **CR-DS**, **CR-PS**, **CR-MS**.

## Tier 1 — Accept as-is

Proposals whose refine wording can land verbatim: ≥1 cross-reviewer confirmed grounded + high-value AND no cross-reviewer rejected.

| ID | Spec § | One-line change | Originating | Cross-review status |
|---|---|---|---|---|
| T1-01 | §4.1 Row 1 stat cards | Pin SQL per card (Sessions filters `archived_at IS NULL AND is_sidechain=0`; Longest tie-break = earliest `started_at`; Active Since fallback to `—` + banner when all NULL) | DS D-F4/D-F5 | CR-PS K-list; CR-MS keep (verify `is_sidechain` col exists first) |
| T1-02 | §4.1 Row 2 donut | Stable color binding = hash(model name) → palette index; legend `<0.1%`, k/M tokens | DS D-F10 | CR-PS keep; CR-MS not contested |
| T1-03 | §4.1 Row 2 chart | Pin `STALENESS_BANNER_THRESHOLD_DAYS = 3`; banner is `role="alert"`; reference §18 boundary | DS D-F3 | CR-PS keep ("already shipped; pinning stops bit-rot") |
| T1-04 | §4.1 Row 3 left | Recent session rows are `<button>` calling `navigateTo("sessions")` + `selectSession(id)`; empty state has "+ New Session" CTA | DS D-F7, D-U2 | CR-PS keep ("concrete, observable") |
| T1-05 | §4.1 Row 3 right (SystemHealth) | Per-indicator source table (MCP / Plugins / API / CLI); defaults FORBIDDEN; `checking` until wired | DS D-F8 | CR-PS "highest-leverage item"; CR-MS "closes RCA Bug 4 cleanly" |
| T1-06 | §4.4 Verification | R1-compliant assertion block (no "or empty state" escapes); recent-row-click selects session | DS §4.4 | CR-PS keep; CR-MS "major DoD upgrade" |
| T1-07 | §5.1 entries | Promote `model` to "latest assistant message" (not first); document `kind` unknown-passthrough | DS §5.1 table | CR-PS/CR-MS not contested |
| T1-08 | §5.2 step 7 | Upsert column list must include every disk-sourced §5.1 property; adding a property requires adding the upsert column (RCA Bug 1 origin) | DS §5.2 | CR-PS keep; CR-MS keep |
| T1-09 | §5.3 ORPHANED | Redefine as "JSONL parse failed OR PID file refs sessionId with no JSONL"; remove "index entry but no JSONL" (index is unusable per DESIGN-CONTEXT §2.2) | DS S-F7 | CR-PS "non-negotiable"; CR-MS "fixes literal contradiction" |
| T1-10 | §5.3 ALIVE bifurcation | Split ALIVE into app-started vs external; requires `spawnedByApp` SQLite column + per-flavor action sets per §5.7 | DS S-F1 | CR-PS keep; CR-MS "surfacing now beats discovering at impl time" |
| T1-11 | §5.3.1 | PID-file dual-write check lives in Tauri `launch_session` command; frontend never reads PID files | DS §5.3.1 | CR-MS "GOOD — aligns with capabilities allowlist" |
| T1-12 | §5.3.1 Stop | Spec must use app modal, not `window.confirm` (test-assertable) | DS S-U7 | not contested |
| T1-13 | §5.4 By Project / Timeline | `cwd` basename as label, full path as tooltip + `aria-label`; Timeline buckets incl. "Undated" for NULL `started_at` | DS §5.4 | not contested |
| T1-14 | §5.5 ARIA equivalence | Virtual & non-virtual list branches must emit equivalent `role="list"`/`role="listitem"` | DS S-U1 | CR-MS "concrete fix for S-U1" |
| T1-15 | §5.6 breadcrumb row | Add CWD breadcrumb `…/<parent>/<basename>` + Copy path + Open CWD | DS S-U8 | not contested |
| T1-16 | §5.6 displayName | Writes go to `sessions.display_name` synchronously — in-memory-only FORBIDDEN per R2 | DS S-F5 | CR-PS "Aligned with R2. OK" |
| T1-17 | §6.2 paths table | Promote `.claude-plugin/plugin.json` as primary; clarify cache layout `{marketplace}/{plugin}/{version}/`; list `marketplace.json` as fallback | PS F2 + revised F1 (wording) | CR-DS K1, K4; CR-MS keep (F1 reframed as wording — see Tier 2) |
| T1-18 | §6.4 state precedence | Explicit order: broken > orphaned > update-available > disabled > active | PS F10/F11 | CR-DS K2/K3; CR-MS "concrete, testable, KEEP" |
| T1-19 | §6.4 orphaned semantics | Orphaned ONLY when `enabledPlugins[key]=true`; disabled-and-uninstalled silently ignored | PS F8 | CR-DS verified; CR-MS "closes silent-data-loss ambiguity" |
| T1-20 | §6.4 toggle granularity | `enabledPlugins` keyed at `name@marketplace` level; toggle affects every installation row | PS F7 | not contested |
| T1-21 | §6.6 drop "tree view" | Replace with flat list per tab (Skills / Agents / Hooks); WAI-ARIA APG Tabs (automatic activation, roving tabindex) | PS U2, U10 | CR-DS K5 "honest correction"; CR-MS keep |
| T1-22 | §6.6 broken-state header actions | Open in File Browser / VS Code DISABLED with tooltip "Install path is missing" | PS F14 | CR-MS "confirmed correct" |
| T1-23 | §7 SKILL.md schema | Required vs optional fields; `name` fallback = subdir name; `description` fallback = empty; document plugin-vs-custom exclusion + filesystem-only management (no Edit/Remove UI) | PS G1, G4, G5 | CR-DS K6; CR-MS "closes G1" |
| T1-24 | §8.1 scope table | Add "Writable from UI?" column; route project scope to `<root>/.mcp.json` via new `write_project_mcp_json` IPC; surface local-scope project path on card; trust toggle DEFERRED (see Tier 3 R3-04) | MS §8.1 (trust toggle removed) | CR-DS K1; CR-PS keep |
| T1-25 | §8.3 parser contract | Pin parser against captured `claude mcp list` fixtures; status freezes at last-known on refresh failure (not reset to disconnected) | MS §8.3 | CR-DS K2 "Top-1 user-visible bug"; CR-PS keep |
| T1-26 | §8.3 spawn-warning gate | `claude mcp list`/`get` may SPAWN servers; auto-refresh requires user opt-in (default off after first launch); user-initiated [Refresh Status] always allowed | MS §8.3 | CR-DS K3 "honors a spec invariant"; CR-PS keep ("user-initiated only" is enough — drop 3-failure backoff, see Tier 2) |
| T1-27 | §8.5 Out of Scope v1 | Defer: MCP tool discovery (`tools[]` removed from §8.2 data model), OAuth, View Logs UI | MS §8.5 (tools deleted not deferred — see Tier 2) | CR-PS K-list "exactly the right shape" |
| T1-28 | §9.1 layout | 200px left nav `<nav aria-label>` with `aria-current="page"`; right pane lazy-mount; unsaved-changes guard on tab switch | MS §9.1 | CR-DS K7 "standard form-UX, currently absent"; CR-PS V9 keep |
| T1-29 | §9.2 file-of-truth map | Per-section file + per-field map (settings.json vs settings.local.json vs config.json vs SQLite); round-trip preservation mandatory for MCP IPC (generalize per-IPC, not blanket — see Tier 2) | MS §9.2 | CR-DS K5/K6 "real spec instead of 7 hand-wavy bullets"; CR-PS keep |
| T1-30 | §9.3 General/API map | Per-field path table: `ANTHROPIC_*` → `settings.json.env`, `primaryApiKey` → `config.json` | MS §9.3 | CR-DS K5; CR-PS "high-value; keep" |
| T1-31 | §9 Plugins tab | Read-only mirror — Plugins section is sole writer of `enabledPlugins` (single-writer rule) | MS S4 / V11 | CR-DS X2 "Agreement actually exists; spec should adopt MCP-Set wording"; CR-PS Y4 |
| T1-32 | §9 Appearance routes through `useThemeStore` | Never touch `<html>.dark` directly; theme-store API extension must be called out as a new task (see Tier 4 conflict) | MS V13 | CR-DS Y3 mutual reinforcement |
| T1-33 | §17.10 form table | Field table with validation; args tag input commits on Enter, comma, blur (draft preserved); scope is read-only when editing | MS §17.10 | CR-PS keep |
| T1-34 | §17.10 save routing | Three-way: user → `~/.claude.json`, local → `~/.claude.json $.projects[path]`, project → `<root>/.mcp.json` via new IPC | MS §17.10 | CR-DS K1 keep |
| T1-35 | §13 / DESIGN-CONTEXT §10 | Single consolidated focus-refresh rule covering Dashboard, Sessions, Plugins, Skills, MCP (replaces per-section duplicates) | DS Out-of-scope §7, PS Out-of-scope, MS Out-of-scope | All 3 cross-reviews flagged consolidation |

## Tier 2 — Accept with modifications

Cross-review found a real flaw but the core fix is sound.

| ID | Spec § | One-line change | Originating | Cross-review status | Modification |
|---|---|---|---|---|---|
| T2-01 | §4.3 refresh | Refresh on window focus | DS §4.3 (debounced 1s) | CR-MS "spec is overspecifying timer values" | Replace "debounced 1s" with "throttled (constant lives in code, not spec)" |
| T2-02 | §4.4 staleness verification | Banner visible when stale | DS §4.4 `data-staleness-days` attr | CR-MS "couples spec to one DOM implementation" | Restate as "banner visible AND announces N days"; drop the private attribute requirement |
| T2-03 | §4.4 Active Since regex | Format assertion on date string | DS `^[A-Z][a-z]{2} \d{1,2}, \d{4}$` | CR-MS "locale-sensitive" | Use "ISO date OR localized date per user locale" |
| T2-04 | §5.1 tag/group schema | Add tags + groups to data model | DS §5.1.1 raw `CREATE TABLE` DDL | CR-PS "over-scoped; premature schema"; CR-MS "two sources of truth — TS owns schema" | Drop literal DDL; describe data shape conceptually + point to `src/lib/db.ts` migration (`MIGRATIONS[N]`, bump `EXPECTED_VERSION`). Defer 6-color palette enum to Tag/Rename dialog task |
| T2-05 | §5.6.1 Tag/Rename dialog | Modal spec | DS placed in §5 | CR-MS "belongs in §10 Dialogs per spec convention" | Relocate spec block to §10 |
| T2-06 | §5.9 verification | NULL-`started_at` assertion | DS references `pid_file_missing_at_discovery` column | CR-PS "invents new SQLite column" | Drop column ref; simplify to "`started_at IS NULL` only for ORPHANED rows" |
| T2-07 | §6.7 list-load pipeline | Hydration guidance | PS new §6.7 + F12 wording "0 skills/0 agents until hydrate" | CR-DS "F12 misleading — counts AWAITED before resolve, only description survives"; CR-MS "implementation detail; relocate" | Narrow F12 to description-only; move §6.7 content to §17.6 (loading states); drop "300ms spinner threshold" magic number |
| T2-08 | §6.5.1 plugin CRUD | Install/Reinstall/Remove/Update action surface | PS §6.5.1 with inline `TODO T<phase>.<num>` placeholders | CR-DS R2 "non-actionable placeholders"; CR-MS "spec shouldn't mint task IDs" | Spec marks "wire-up task required"; plan author allocates IDs. Explicitly mark Install/Reinstall/Remove/Update as DEFERRED (v1: CLI-only per §6 header) unless a plan task lands first |
| T2-09 | §6.5.1 toggle atomicity | "Atomic `enabledPlugins[key]=bool` rewrite" | PS §6.5.1 | CR-MS "atomic claim is hollow without race contract" | Add: "Single in-process writer; single-instance plugin enforces no concurrent writers. RMW preserves unrelated keys." |
| T2-10 | §7.3 skills refresh | Re-scan on window focus + navigation | PS §7.3 with TBD task placeholder | CR-DS O2 "spec should commit to one"; CR-MS "past-tense + TBD ID confusing" | Commit to focus-refresh as v1; drop FS-watch menu and TBD placeholder; describe current contract only |
| T2-11 | §6 header | "Plugins installed via CLI" | PS Out-of-scope debate | CR-DS R4 "keep CLI-only; note in-app install out of v1" | Keep CLI-only language; add explicit "in-app install is out of v1 scope" |
| T2-12 | §6.4 orphaned color | Spec says "yellow", code uses amber for WCAG | PS U8 | CR-DS R3 "trivial; just patch" | Patch spec value to `#d97706` (amber). One-line edit, no ceremony |
| T2-13 | §8.2 `tools[]` column | Dead field | MS §8.5 deferred | CR-DS O1 "half-measures invite cargo-cult re-introduction" | DELETE `tools[]` from §8.2 data model entirely in v1 (not just defer). Re-add when V2 introspection ships |
| T2-14 | §8.3 refresh failure | "Auto-refresh suspends after 3 consecutive failures" | MS §8.3 | CR-DS O5 "arbitrary threshold"; CR-PS R-B "drop state machine" | Drop 3-failure backoff entirely. Keep "user-initiated only" + "freeze at last-known on failure" |
| T2-15 | §8.5 Out of Scope | Mentions log path `~/.claude/mcp-logs/<server>.log` | MS §8.3 / §8.5 | CR-PS R-C "invented path — CLI doesn't write here"; CR-DS K7 keep deferral | Keep "View Logs deferred" line; DELETE the invented log path |
| T2-16 | §17.10 env masking | "Auto-detect secrets via `/key|token|secret|password/i`" | MS form table | CR-DS R2 "hypothetical heuristic"; CR-PS "push to UX research" | All env values masked by default; per-row reveal toggle. Auto-detection unspecified |
| T2-17 | §9.2 Advanced editor | Raw JSON editor | MS "Monaco" | CR-DS R-D "Monaco not in stack"; CR-PS "bloat unjustified" | Use shiki-readonly + plain textarea (shiki already in tech stack) |
| T2-18 | §9.2 round-trip preservation | "Mandatory for all settings IPC" | MS §9.2 | CR-DS O3 "big-bang generalization; only MCP proves it works" | Narrow to: "MCP write proves preservation; any new settings IPC MUST round-trip; rest TBD per-IPC" |
| T2-19 | §9.4 Danger Zone | "Type DELETE to confirm" | MS §9.4 | CR-DS O4 "spec picking interaction-text" | Keep typed-confirm requirement; mark exact copy as `[research-needed]` |
| T2-20 | §9.2 Permissions row-level scope toggle | Shared / This machine per rule | MS §9.2 Permissions | CR-DS R5 "spec inventing UI before data model settled" | Mark `[design-needed]`; leave per-rule scope toggle out of spec until DESIGN-CONTEXT documents settings.json vs settings.local.json merge semantics |
| T2-21 | §17.6 loading states | Settings skeleton form fields | MS §17.6 row swap | CR-DS R4 "fix is global, not one-row swap" | Full per-section audit of §17.6 (Dashboard skeletons, plugin detail, MCP scopes, Settings, etc.); resolve self-contradiction ("n/a (forms always have defaults)" vs "skeleton form fields") globally |
| T2-22 | §17.5 error table | Add rows for plugins/skills/MCP load + update-check + open failures | PS §17.5 additions + MS §8.3 freeze policy | CR-DS C1, CR-PS X2 "unified contract needed" | Single unified §17.5 sweep: error-surface (inline-alert vs toast vs banner) per data source, dismissable y/n, retry affordance y/n. Pick one author |

## Tier 3 — Reject

| ID | Spec § | One-line change | Originating | Cross-review status | Reason |
|---|---|---|---|---|---|
| T3-01 | §6 cache-nesting count | "Spec mis-counts; says 3-level, real is 4-level" framed as bug | PS F1 | CR-MS "wording ambiguity, not a count error" | Reject as bug-class; reframe as the §6.2 path-table rewrite (Tier 1 T1-17 already covers it) |
| T3-02 | §5 tag palette | Spec-mandated 6-color enum (red/amber/green/blue/mauve/muted) | DS §5.1.1 | CR-PS over-scoped; CR-MS "no RCA item motivates pinning palette pre-design" | Defer to Tag/Rename dialog task; spec stays palette-agnostic |
| T3-03 | §5 sub-agents view | "Sub-agents view (TBD-Phase-5)" with minted TBD-T5.1 | DS §5.4 | CR-PS "creates Phase-5 placeholder not in any plan; R2-risk"; CR-MS "spec shouldn't mint task IDs" | Reject inline TBD; surface in "Plan-file gaps" section below for plan owner |
| T3-04 | §8.1 trust toggle UI | "MCP card for project-scope MUST surface trust state as toggle" | MS §8.1 | CR-PS R-A "premature; no task to land it; orphan-placeholder pattern" | Defer to §8.5 v2 (or file task before re-adding) |
| T3-05 | §8.3 3-failure backoff | Auto-refresh suspends after 3 consecutive failures | MS §8.3 | CR-DS O5; CR-PS R-B | Reject state machine entirely (see Tier 2 T2-14 for minimal replacement) |
| T3-06 | §17.10 env-secret regex | Auto-detect via `/key|token|secret|password/i` | MS form table | CR-DS R2; CR-PS R2 | Reject heuristic (Tier 2 T2-16 covers replacement) |
| T3-07 | §6.6 mockup disclaimer | "Mockups predate ARIA implementation — treat as visual reference only" | PS §6.6 rewrite | CR-DS O3 "retcon — either refresh mockups or drop the pointer" | Reject the disclaimer text; mockup-authority is a global Tier 4 conflict |
| T3-08 | Per-section refresh constants | "Debounced 1s" / "15s/60s/2s" duplicated per section | DS §4.3, MS §8.3 | CR-PS Y5 "DESIGN-CONTEXT §10 should be SSOT" | Reject per-section constants; Tier 1 T1-35 consolidates into §13 |
| T3-09 | §8.3 fixture path in spec | `tests/fixtures/mcp-list-output/*.txt` mandated in product spec | MS §8.3 | CR-PS "fixture location belongs in test plan" | Reject path-in-spec; spec says "pinned by fixture tests", plan owns location |
| T3-10 | §11 / §17 ARIA implementation details | "role=alert SR rerender concern" | MS U11 | CR-DS R3 "implementation detail for component PR; out of design-spec scope" | Reject as spec change |

### Observed but unraised
- None promotable. All §17 / §13 cleanup items were raised by ≥1 review.

## Tier 4 — Conflicts requiring Ness decision

### C1. `enabledPlugins` count for SystemHealth vs Plugins-tab read-only mirror
- **Conflict:** Dashboard SystemHealth wants a "plugins count ≥ 1" indicator. Plug-Skill F7 says toggle is keyed at `name@marketplace`. Settings tab mirrors `enabledPlugins`. Three readers, one writer.
- **Option A:** SystemHealth uses the same `enabledMap` rule (count of keys where `enabledPlugins[key]=true` AND installed). Single shared selector exported from `plugin-loader.ts`.
- **Option B:** SystemHealth uses a coarser "any installed" count; defer enable-state semantics to Plugins section.
- **Recommended: A.** Single selector avoids drift; matches the spirit of T1-31 single-writer rule. Trade-off: cross-section import dependency.

### C2. Shell-out policy (per-section vs global)
- **Conflict:** Plug-Skill envisions `claude plugins install/update/uninstall` shell-outs; MCP-Set §8.3 wants to RESTRICT shell-out spawning (trusted-dir, user opt-in). Dashboard "Rebuild Stats" wants `claude /usage`. Each section invents its own rules.
- **Option A:** Single new spec section (e.g. §17.x "Shell-out policy") covering: when shell-out is allowed, when user opt-in required, error handling, trusted-dir semantics. All section refs point to it.
- **Option B:** Per-section policy with cross-references.
- **Recommended: A.** Cross-cuts at least 4 sections (§4, §6, §7, §8). Centralized policy prevents the exact drift CR-DS X2 / CR-PS Y2 / CR-MS X3 all flagged.

### C3. Mockup authority — code vs `docs/design-visuals/*.html`
- **Conflict:** Plug-Skill says "treat mockups as visual reference only" (rejected as disclaimer-text in T3-07). Dash-Sess "re-verify mockups". MCP-Set silent. Code has diverged (ARIA-heavy, grid layouts) from the mockups.
- **Option A:** Mockups are visual-aspiration only; code is authoritative for behavior.
- **Option B:** Mockups are authoritative; refresh pass refreshes them to match shipped code; future drift is a bug.
- **Recommended: A** with a one-time refresh of mockups to match shipped code, then snapshot them as v1-reference. Trade-off: small one-time refresh cost; eliminates ambiguity for future PRs.

### C4. `useThemeStore` API expansion vs new `appearance-store`
- **Conflict:** §9 Appearance needs `terminalFontSize`, `terminalFontFamily`, `compactMode`. CLAUDE.md says theme-store is "pure" with `mode` only.
- **Option A:** Extend `useThemeStore` with persistence fields (changes the "pure" contract).
- **Option B:** Create new `appearance-store` that owns persistence; `theme-store` stays pure.
- **Recommended: B.** Preserves CLAUDE.md "two pure stores" principle. Trade-off: one extra store file. Per CR-PS B3.

### C5. `tools[]` — delete vs defer
- Resolved in Tier 2 T2-13 (DELETE in v1, not just defer per §8.5).

## Plan-file gaps to allocate before spec patch

Refines invented these task IDs inline; plan author must allocate real IDs in `docs/superpowers/plans/*.md` before R2 can pass.

| Invented ID | What needs wiring | Likely target plan |
|---|---|---|
| TBD-T4.6 | Quick Action "Resume Latest" wire-up | `2026-05-09-dashboard-activation.md` (referenced by RCA #10 but does not exist — create plan first) |
| TBD-T4.7 | Quick Action "Open CWD" wire-up | Same |
| TBD-T4.8 | Quick Action "Rebuild Stats" wire-up (spawn `claude /usage`) | Same |
| TBD-T4.9 | Tag/Rename modal + tag CRUD | Phase 4 sessions plan or new dashboard-activation plan |
| TBD-T5.1 | Sessions DnD reordering + sub-agents view | Phase 5 sessions plan (does not exist) |
| TBD-`get_cli_version` | New Tauri command for CLI version probe | Phase 3 or 4 backend plan + `capabilities/default.json` |
| TBD-`read_claude_json` | New Tauri command for SystemHealth MCP count | Phase 4 dashboard-activation plan |
| TBD-`write_project_mcp_json` | New IPC for project-scope MCP write | Phase 4 MCP plan |
| TBD-T4.x Plugins CRUD | Install / Reinstall / Remove / Update wire-ups | Phase 4 or 5 plugins plan (R2-orphan today; TODOs cite `ui-defect-sweep#L293/L294/L295`) |
| TBD-T4.x SKILL.md scaffold | Decision needed: rename button or build scaffold | Phase 4 skills plan |
| TBD-T4.x Settings tabs | All 7 Settings tabs (T4.6-T4.8 referenced by MS but Settings is 29-line stub) | Phase 4 settings plan |
| TBD-T3.12 | Wire `mcp-store.cwd` from session store | Cited at `mcp-store.ts:5-6`; verify T3.12 exists in current Phase 3 plan |
| TBD-T4.x View Logs (MCP) | Surface logs UI + log-path spec | Defer; file when log location committed |

**Rule going forward:** Spec marks "wire-up task required"; plan author mints the ID. Spec text MUST NOT contain `TBD-T*` placeholders.

## Capabilities allowlist additions needed

Both DS and MS introduced new Tauri IPC commands without updating `src-tauri/capabilities/default.json`. Coordinate a single patch.

| New command | Origin | Capability needed |
|---|---|---|
| `get_cli_version` | DS §4.1 SystemHealth | `core:default` + shell-execute scope for `claude --version` |
| `read_claude_json` | DS §4.1 SystemHealth (MCP count) | `fs:allow-read-text-file` scoped to `$HOME/.claude.json` |
| `write_project_mcp_json` | MS §8.1 + §17.10 | `fs:allow-write-text-file` scoped to `<project-root>/.mcp.json` |
| `launch_session` (PID check) | DS §5.3.1 | `core:default` + shell-execute for `claude --resume` + fs read for `~/.claude/sessions/*.json` |
| Plugins CRUD (`claude plugins install/uninstall/update`) | PS §6.5.1 | Shell-execute scope; gated by Tier 4 C2 shell-out policy |
| `claude /usage` (Rebuild Stats) | DS Quick Actions | Shell-execute scope; gated by C2 |

## Out-of-scope cleanup observed

Items multiple agents flagged that belong to global concerns.

### §17.5 Error Handling (raised by DS, PS, MS)
- Missing rows: plugins load/detail/update-check, skills load/open, MCP load/refresh, settings malformed JSON.
- Conflicting surface choice (inline alert vs toast vs banner) — see Tier 2 T2-22.

### §17.6 Loading & Empty States (raised by DS, MS)
- Self-contradicts on Settings (`n/a (forms always have defaults)` vs Settings needs skeletons).
- Dashboard contract violated (D-U1/D-U2): no skeletons, no empty-state CTA.
- Plugin detail loading state not specified (PS U12).
- Per-section audit required — see Tier 2 T2-21.

### §17.7 Search Behavior (raised by DS, PS)
- `bg-accent/20` highlight unimplemented across Sessions, likely Plugins/Skills/MCP too. Per-section enforcement task.

### §13 Data Refresh Strategy (raised by all 3 refines)
- Focus-refresh duplicated per section; consolidate into single §13 rule (Tier 1 T1-35).

### §10 Dialogs (raised by DS, MS)
- New Session dialog (T4.2) is wire-up target for 2 Dashboard buttons + Sessions sidebar CTA + Plugins/MCP "Add" buttons. T4.2 DoD must cover all call sites.
- Tag/Rename dialog belongs in §10, not §5.6.1 (Tier 2 T2-05).

### §18 Visual Mockups Index (raised by DS, PS)
- Mockup authority question — see Tier 4 C3.

### `enabledPlugins` single-writer (raised by PS, MS)
- Resolved via Tier 1 T1-31 (Plugins section owns writes; Settings tab is read-only mirror).

## Final patch order (recommended)

Numbered list — patch in this sequence. Prioritizes (1) RCA-bug fixes still latent, (2) in-flight Phase 3 blockers, (3) cleanup.

1. **§4.1 + §4.4 (Dashboard SystemHealth + Verification)** — closes RCA Bug 4 (T1-05) and brings R1 verification to the section that originated all 4 RCA bugs (T1-06). Also pins the 4 Quick Action wire-up tasks (Tier 4 plan-file gaps). Highest-leverage single patch.
2. **§4.1 Row 1 + Row 3 (stat cards + Recent Sessions click)** — fixes RCA Bug 1 (`started_at` upsert column rule, T1-08) and the dead-affordance D-F7 (T1-04).
3. **§5.3 + §5.3.1 + §5.7 (Session states + ALIVE bifurcation + PID dual-write)** — fixes spec/reality contradiction (T1-09) and adds `spawnedByApp` carrier without which §5.7 cannot ship (T1-10).
4. **§8.1 + §8.3 + §17.10 (MCP project-scope routing + parser contract + form)** — three end-to-end broken features blocking Phase 3 MCP work (T1-24, T1-25, T1-33, T1-34).
5. **§13 consolidated focus-refresh + new §17.x Shell-out policy (Tier 4 C2)** — global rules that all sections reference; doing first prevents per-section re-divergence.
6. **§9.1-§9.3 Settings file-of-truth + per-field maps + theme store decision (Tier 4 C4)** — unblocks Phase 4 Settings work; current section is 29-line R2-violating stub.
7. **§6.2 + §6.4 + §6.6 + §7 (Plugins path table + state precedence + drop tree view + SKILL.md schema)** — bulk plugins/skills cleanup; mostly mechanical.
8. **§17.5 + §17.6 + §17.7 (cross-section sweeps)** — one author each, deduplicate.
9. **Capabilities allowlist patch** (single PR covering all new IPCs) — must land before any of #1-#7 IPC code merges.
10. **R2-orphan TODO sweep** (all `ui-defect-sweep#L*` citations replaced with real `T<phase>.<num>` IDs from plan-file allocations).
