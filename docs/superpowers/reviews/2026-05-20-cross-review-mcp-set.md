# Cross-review by MCP-Set reviewer — 2026-05-20

Scope: critique the Dash-Sess and Plug-Skill refine reviews. Spot-checked
≥5 citations per sibling. Did not re-review §8/§9/§17.10 (own prior round).

## Reviewing: Dash-Sess refine

### Grounded? (citation spot-check)

| Claim | Cite | Spot-check verdict |
|---|---|---|
| D-F4 "Active Since = MIN(started_at) WHERE archived_at IS NULL" | `dashboard-store.ts:138-141` | ACCURATE (verified lines 139-141 in store) |
| D-F1 "TODOs reference T4.5 (Command Palette) — not a per-button wire-up task" | `QuickActions.tsx:27-36` | ACCURATE (lines 30/32/34 all point at T4.5; T4.1+T4.2 only for New Session) |
| D-F6 "RecentSessions hardcodes neutral muted dot, comment 'by definition not alive anymore'" | `RecentSessions.tsx:101-107` | ACCURATE (verbatim at lines 101-106) |
| D-F7 "Recent rows non-interactive" | `RecentSessions.tsx:94-164` | ACCURATE — `<li>` has no onClick, no `<a>`/`<button>` wrapper (verified 95-99, 164) |
| S-F1 "SessionState is flat alive\|ended\|orphaned\|archived; no spawnedByApp flag" | `session-types.ts`, `parser.rs:104` | ACCURATE — `entrypoint` exists but no `spawnedByApp`/`startedByApp` boolean carrier |
| S-F7 "ORPHANED detection contradicts DESIGN-CONTEXT §2.2 (100% dangling)" | DESIGN-CONTEXT.md:57-67 | ACCURATE and HIGH-VALUE — would mark every session ORPHANED if taken literally |

No misclaims found in the 6 spot-checks.

### Over-design / scope creep

| Item | Issue |
|---|---|
| §5.1.1 SQL schema (tags/groups/session_tags) baked into the spec | Premature. The TS-owns-schema rule (`CLAUDE.md` §Architecture, `src/lib/db.ts` `SCHEMA[]`) means schema lives in TS migrations, not spec. Spec should state the data shape/constraints, not literal `CREATE TABLE` DDL — that risks drift between spec and `MIGRATIONS[]`. Reword as conceptual schema + reference to TS migration file. |
| Spec mandates 6-color tag palette enum | Premature. No `ui-defect-sweep` or RCA item motivates pinning the palette pre-design. Leave to the Tag/Rename dialog task. |
| §4.4 "data-staleness-days attribute equals floor(...)" verification | Over-prescriptive. Asserting on a private data attribute couples the spec to one DOM implementation. Restate as "staleness banner visible AND announces N days" — assertion-based but implementation-free. |
| §4.3 "debounced 1s window-focus refresh" | Spec is overspecifying timer values. Move debounce constant to code; spec says "refresh on focus, throttled to avoid storms". |
| New `TBD-T4.6 / T4.7 / T4.8 / T4.9 / T5.1` task IDs minted inside spec | Spec should not invent task IDs — that's the plan's job. Spec should say "needs a wire-up task" and let the plan author allocate. |
| Section "5.6.1 Tag/Rename Dialog" prescribed inside §5 | This belongs in §10 (Dialogs) per existing spec convention, not embedded in §5. Cross-section bleed. |

### Architecture conflicts

| Item | Conflict |
|---|---|
| `CREATE TABLE` DDL in spec §5.1.1 | TS owns schema (`CLAUDE.md` §Architecture). DDL in spec creates two sources of truth. |
| "Verification lives in the Tauri command `launch_session`; frontend never reads PID files directly" (§5.3.1) | GOOD — aligns with capabilities allowlist (`src-tauri/capabilities/default.json`). Keep. |
| Refined §4.3 references "FS watch on `~/.claude/stats-cache.json`" deferred to "Phase 4 Task 10" | Phase numbering not validated by reviewer; risk of dangling ref. Use TBD wording or verify plan file. |
| `get_cli_version` Tauri command (new) added to SystemHealth | Adding new IPC commands needs an entry in `capabilities/default.json`; spec change implies a Rust+capability change but flags it only in §Out-of-scope. OK as flagged, but call out the capability impact. |

### Conflicts with Plug-Skill proposal

| Topic | Dash-Sess says | Plug-Skill says | Conflict |
|---|---|---|---|
| Refresh strategy | §4.3 adds focus-refresh for dashboard | Plug-Skill G6/V6 punts on FS watch for skills + asks for focus-refresh | NO conflict; both agree on focus-refresh. Cross-review should harmonize into one §13 entry, not duplicate per-section. |
| Plugin count in SystemHealth | Wants `read_installed_plugins` + `read_settings_enabled_plugins` count | Plug-Skill F7 documents toggle granularity is per `name@marketplace`, not per installation | Implicit conflict: the "enabled plugins count" definition needs §6.4 to define what "enabled" means. Reviewer should reference Plug-Skill's F7 wording. |
| §17.5 error rows | Dash-Sess flags missing rows in §Out-of-scope (item 3) | Plug-Skill explicitly adds 3 rows for plugins, 2 for skills | Plug-Skill has the concrete patches; Dash-Sess should defer to that PR rather than re-add. |
| §17.7 search highlight | Dash-Sess S-F9 says spec demands `bg-accent/20`, code doesn't | Plug-Skill out-of-scope §3 also notes §17.7 unimplemented widely | Agreement; consolidate into one §17.7 enforcement task. |

### Proposals to keep as-is (high-value)

- **D-F8 / refined §4.1 SystemHealth source table** — closes RCA Bug 4 cleanly. Highest-leverage item in the whole refine.
- **D-F7 (Recent sessions dead-affordance) + verification "clicking selects session"** — concrete, observable, R1-compliant.
- **S-F7 ORPHANED redefinition** — fixes a literal-spec-vs-reality contradiction; non-negotiable.
- **S-F1 ALIVE app-started vs external requires `spawnedByApp` carrier** — without it §5.7 cannot ship; surfacing this now beats discovering at impl time.
- **§4.4 / §5.9 R1-compliant verification blocks** — replaces existing zero-verification §4/§5 cleanly. Major DoD upgrade.
- **§5.5 ARIA-equivalence rule (virtual ↔ non-virtual)** — concrete fix for S-U1.

### Proposals to reject or rework

| Proposal | Verdict |
|---|---|
| `CREATE TABLE tags/session_tags/groups` literal DDL in §5.1.1 | REJECT as written. Replace with prose data-shape + pointer to `src/lib/db.ts` migrations. |
| 6-color palette enum baked into spec | REJECT/DEFER. Move to Tag dialog task. |
| Inventing `TBD-T4.6..T4.9` and `TBD-T5.1` task IDs in spec text | REWORK. Spec should mark "wire-up task required" and link to a plan; plan owner mints the ID. |
| §4.1 Sessions card filter `AND is_sidechain = 0` | KEEP, but reviewer didn't verify the SQL column exists in current schema (`dashboard-store.ts:137-141` does NOT filter sidechain today). Verification step needed before adding to spec. |
| §4.3 "debounced 1s" constant in spec | REWORK to "throttled". |
| §5.6.1 Tag/Rename dialog defined inside §5 | RELOCATE to §10. |
| §4.4 "Active since text matches `^[A-Z][a-z]{2} \d{1,2}, \d{4}$`" | REWORK — locale-sensitive. Use "ISO date OR localized date per user locale". |

---

## Reviewing: Plug-Skill refine

### Grounded? (citation spot-check)

| Claim | Cite | Spot-check verdict |
|---|---|---|
| F8 "Orphan only emitted when enabledMap[key]===true; false silently dropped" | `plugin-loader.ts:144-161` | ACCURATE (verified line 146: `if (enabledMap[key] !== true) continue;`) |
| F13 "Description hardcoded `""` in list view" | `plugin-loader.ts:131` | ACCURATE (line 132 `description: ""`) |
| F12 "Counts init to 0 then hydrated in parallel" | `plugin-loader.ts:135-187` | ACCURATE (lines 135-138 init; 168-187 hydrate) |
| R2 violations cite `ui-defect-sweep#L293/L294` instead of task IDs | `PluginCard.tsx:271-273, 311-313` | ACCURATE (verified — strings `ui-defect-sweep#L293`/`L294` present at lines 271 and 311) |
| F2 "Manifest is preferred from `.claude-plugin/plugin.json`" | `commands.rs:272-289` | ACCURATE per file path naming; not byte-verified but consistent with spec line 282 |
| F1 cache path "4 segments under cache/" | DESIGN-CONTEXT §13 | LIKELY ACCURATE — spec line 252 says "3-level" but path has 3 segments under `cache/` (`{marketplace}/{plugin-name}/{version}`), so technically 3 sub-levels. Reviewer's count dispute is a wording quibble, not a factual error. **DISPUTABLE.** |

5/6 ironclad; F1 is a semantic argument over "3-level nesting" wording rather than a code/reality mismatch. Spec wording IS ambiguous — fix worthwhile but framing as a bug is overstated.

### Over-design / scope creep

| Item | Issue |
|---|---|
| §6.5.1 mints `TODO T<phase>.<num>` placeholders inside spec | Same anti-pattern as Dash-Sess — spec shouldn't allocate task IDs. |
| State precedence "broken > orphaned > update-available > disabled > active" | Concrete and useful; not over-design. KEEP. |
| §6.7 "List load pipeline" prescribing skeleton-render rules | Borderline — UI guidance belongs in §17.6, not §6. Move. |
| `loadPlugins`-internal description hydration mandated by spec | Implementation detail. Spec should say "card shows description from manifest"; whether hydration is parallel/sequential is code's call. |
| §7.3 "no FS watch; manual relaunch tracked under TODO T<phase>.<num>" | Same task-ID-minting anti-pattern. |
| WAI-ARIA APG explicit reference (U10/V9) | KEEP — actually under-design relative to current spec. Good call. |

### Architecture conflicts

| Item | Conflict |
|---|---|
| Spec rewrite assumes Rust IPC `claude plugins install/uninstall/update` actions | Tauri capabilities allowlist (`src-tauri/capabilities/default.json`) must add shell-execute scopes; spec doesn't flag this. Minor — flag for §10/§17.10 cross-review. |
| Toggle = "atomic enabledPlugins[key]=bool rewrite of settings.json" | Currently done via Rust IPC (`plugins/commands.rs`) — spec says "atomic" but doesn't specify who enforces atomicity (single-process lock? read-modify-write race?). Same gap as §8 MCP config writes I owned last round. Cross-section consistency needed. |
| Spec change "Open in File Browser DISABLED when broken/orphaned" | Confirmed correct per F14. But adding "disabled" needs ARIA disabled-button-with-tooltip pattern — spec should reference §17.x rather than re-spec ARIA. |
| `git ls-remote` per-marketplace in spec §6.5.1 table | Already-shipped in `plugin-updates.ts`; correct attribution. No conflict. |

### Conflicts with Dash-Sess proposal

| Topic | Plug-Skill says | Dash-Sess says | Conflict |
|---|---|---|---|
| `enabledPlugins` count for SystemHealth | F7 documents "toggle keyed at `name@marketplace`, affects every installation" | Dash-Sess §4.1 SystemHealth "Plugins indicator OK when count ≥ 1" without defining what counts | RESOLVABLE: dashboard count must use the same enabledMap rule. Spec text in both proposals doesn't cross-reference. |
| Refresh policy | Asks for focus-refresh for skills (G6/V6) and plugins (implicit via update-check) | Adds focus-refresh for dashboard | Both punt to `DESIGN-CONTEXT §10` (or new `§13`). Consolidate into one rule. |
| §17.5 / §17.6 / §17.7 patches | Both add rows | Dash-Sess flags as out-of-scope; Plug-Skill provides concrete diffs | NO conflict, but if accepted in parallel, ensure §17 owner merges both diffs without duplicate rows. |
| Mockups drift (U13/D-U?/§18) | Plug-Skill says "treat as visual reference only" | Dash-Sess Out-of-scope item 5 says "re-verify mockups" | Mild conflict in disposition. Pick one: authoritative vs reference. |

### Proposals to keep as-is (high-value)

- **State precedence rule (broken > orphaned > update-available > disabled > active)** — closes F10/F11. Concrete, testable.
- **§6.2 manifest path table rewrite** — fixes ambiguity between primary `plugin.json` location and marketplace.json fallback. Direct bug-prevention.
- **F8 disabled-and-uninstalled clarification ("silently ignored — no UI state")** — closes silent-data-loss ambiguity.
- **R2 audit calling out `ui-defect-sweep#L293/L294` citations** — exactly the orphan-placeholder rule's purpose. Must-fix.
- **§7.1 SKILL.md schema (required/optional + fallback)** — closes G1.
- **§17.5 error-row additions** — closes the "store has error field but no UI reads it" class of bugs.
- **§6.6 rewrite dropping "tree view" claim** — honest scope reset; tree was never built and the flat list works.

### Proposals to reject or rework

| Proposal | Verdict |
|---|---|
| F1 "spec mis-counts cache nesting" — framed as a bug | REWORK: it's wording ambiguity, not a count error. "3-level nesting" can mean "3 nested directories" which IS correct. Replace with one-liner clarifying the path template. |
| Task-ID minting inside spec text (`T<phase>.<num>` placeholders) | REWORK — spec marks "wire-up task required", plan author allocates. |
| §6.7 list-load pipeline guidance inside §6 | RELOCATE to §17.6 (loading states). |
| "WCAG criteria once at top of §6/§7" (U14/V9) | KEEP DIRECTION but be specific — name the criteria (1.3.1, 4.1.2, 2.4.6) rather than "reference WCAG". |
| Toggle rewrite "Atomic `enabledPlugins[key] = bool` rewrite" without race-safety contract | REWORK — add "Single in-process writer; file lock not used (single-instance plugin enforces no concurrent writers)." Without it the "atomic" claim is hollow. |
| §7.3 "manual relaunch was required; tracked under TODO T<phase>.<num>" | REWORK — past-tense + TBD ID is confusing. Just describe the current refresh contract. |

---

## Net recommendation

| Refine | Verdict | Action |
|---|---|---|
| Dash-Sess | ACCEPT with rework — high-value structural fixes (D-F8, S-F1, S-F7, R1 verification blocks) outweigh the over-design (DDL in spec, minted task IDs). | Strip §5.1.1 literal DDL; strip minted `TBD-T*` IDs; relocate §5.6.1 to §10; verify `is_sidechain` filter against actual schema before adding; soften §4.4 staleness-attribute assertion. |
| Plug-Skill | ACCEPT with light rework — most claims are tightly grounded; F1 framing is the only real misstep. | Drop F1 as bug-class; relabel as wording cleanup. Strip minted `T<phase>.<num>` placeholders. Move §6.7 to §17.6. Add atomicity contract to toggle rewrite. |

Cross-cutting follow-ups for the §17 / §13 / §10 owner:
1. Merge both reviews' §17.5 / §17.6 / §17.7 patches into a single §17 sweep; deduplicate.
2. Consolidate focus-refresh policy into one `§13 Data Refresh` rule covering Dashboard, Sessions, Plugins, Skills, MCP.
3. Adjudicate mockup authority (`docs/design-visuals/*.html`) — code-of-truth or design-of-truth — across all sections.
4. New plan needed for: Quick Actions wire-up (4 buttons), session displayName persistence, Plugin Install/Reinstall/Remove/Update, SKILL.md create scaffold, `get_cli_version` IPC + capability entry. None of these have a parent plan today (R2-orphan risk).
5. Both reviewers minted task IDs inside spec text — adopt a project rule: spec marks "wire-up task required", plan author allocates the ID.
