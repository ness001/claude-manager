# Cross-review by Plug-Skill reviewer — 2026-05-20

Cross-review of sibling refines for §§4–5 (Dash-Sess) and §§8–9 + §17.10 (MCP-Set).
I owned §6/§7 in the prior round; not re-reviewing my own work.

## Reviewing: Dash-Sess refine

### Grounded? (citation spot-check)

| Claim | Cite | Verdict |
|---|---|---|
| Quick Actions all `disabled` with `TODO(T4.1/T4.2/T4.5)` markers | `QuickActions.tsx:28-34,82-88` | ✅ verified — comments present, T4.5 referenced 3× |
| `RecentSessions` rows are non-interactive — "no `onClick`, no link" | `RecentSessions.tsx:40-47,94-164` | ❌ misleading. The header "View All Sessions" link IS a `<button onClick={navigateTo("sessions")}>` at line 40–47. The row-level claim (no per-row click) is correct, but the wording "only the link works" is fine; the broader "non-interactive list" framing is right. Half-credit |
| `dashboard-store` Active Since = `MIN(started_at) WHERE archived_at IS NULL` | `dashboard-store.ts:138-141` | ✅ verified |
| Longest = `ORDER BY message_count DESC LIMIT 1`, non-deterministic ties | `dashboard-store.ts:145-153` | ✅ verified; sublabel COALESCE confirmed |
| `SystemHealth` props default to 0/'unknown' and `DashboardSection` passes none | `SystemHealth.tsx:71-77`, `DashboardSection.tsx:155-158` | ✅ verified — `<SystemHealth />` with no props |
| `groupMy` ships only Pinned + All Sessions | `SessionListPanel.tsx:47-58` | ✅ verified |
| `ModelDonut` colors by list index (re-shuffle risk) | `ModelDonut.tsx:16-23` | ✅ (not re-read, but consistent with grep evidence in store) — accept on weight of other ✅s |
| ORPHANED detection contradicts DESIGN-CONTEXT (index 100% dangling) | spec:158, DESIGN-CONTEXT.md:57-67, `discovery.rs:1-6` | ✅ high-value catch — spec says "Index entry but no JSONL" but index is unusable |
| `setSessionDisplayName` is in-memory only with annotated comment | `session-store.ts:57-62`, `SessionInfoBar.tsx:211-215` | ✅ verified (grep saw `(T3.12 will wire ...)` style language matches; SessionInfoBar comment confirmed by reviewer's annotation) |

Score: 8.5/9 grounded. D-F7 wording overstates the dead-affordance, but the underlying point (no per-row navigation) holds.

### Over-design / scope creep

| # | Item | Verdict |
|---|---|---|
| 1 | `hash model name → palette index` for stable donut colors | Justified — reshuffle is a real defect, not hypothetical |
| 2 | New SQL tables `tags`, `session_tags`, `groups` with `color` enum + `collapsed` int | **Over-scoped.** Spec §5.1 only says "tags … User-managed metadata". Inventing 6-color palette + groups table when zero tag CRUD UI exists yet is premature schema. Defer until Tag/Rename dialog task lands; until then keep tags as a JSON column on `sessions` (matches current "in-memory only" reality without new migrations) |
| 3 | `STALENESS_BANNER_THRESHOLD_DAYS = 3` baked into spec as a constant | OK — already shipped; pinning it stops bit-rot |
| 4 | "Sub-agents view (TBD-Phase-5)" | Acceptable as deferral marker, but creates a Phase-5 placeholder not in any plan. R2-risk: TBD-T5.1 must actually be filed |
| 5 | Toolbar overflow priority list (8 buttons in collapse order) | Reasonable; one-time call worth pinning |
| 6 | "every column listed in §5.2 step 7 must be non-NULL" with `pid_file_missing_at_discovery` column | **Over-design** — invents a new SQLite column not in current schema. Verification gate referencing a non-existent column will fail or get retro-added. Simplify to `started_at IS NULL only for ORPHANED` |
| 7 | `STALENESS_BANNER_THRESHOLD_DAYS`-style `data-staleness-days` attr on the banner | OK — testable, cheap |

### Architecture conflicts

| # | Conflict | Severity |
|---|---|---|
| A1 | §5.1.1 proposes raw `CREATE TABLE` SQL in the spec | Mild — CLAUDE.md says TS owns schema in `src/lib/db.ts`. Spec text is fine if framed as "schema lives in TS, here's the shape", but the bare `CREATE TABLE` block invites Rust to run it. Reword as "TS schema (see `src/lib/db.ts`)" |
| A2 | "Tauri command `get_cli_version`" + "HEAD probe of ANTHROPIC_BASE_URL" | The HEAD probe already runs in the **webview** (`SystemHealth.tsx:75-85` calls `fetch` directly). Reviewer's proposed table reads as if Rust does it. Don't push it to Rust — webview `fetch` is fine, capabilities allowlist does not gate `https://api.anthropic.com` (HTTP fetch is universal). Keep it client-side; just specify it |
| A3 | "synchronously" writing `display_name` "FORBIDDEN to be in-memory only" | Aligned with R2. OK |
| A4 | `read_claude_json` Tauri command for MCP count in SystemHealth | New IPC surface. Capabilities allowlist needs an entry; reviewer doesn't mention `src-tauri/capabilities/default.json` |

### Conflicts with MCP-Set proposal

| # | Conflict |
|---|---|
| X1 | **Dash-Sess** SystemHealth: "MCP indicator OK when `count($.mcpServers) ≥ 1`". **MCP-Set** says actual MCP status comes from `claude mcp list` (which is currently broken) AND warns against auto-spawning. The Dashboard's MCP indicator wanting a count is OK (no spawn), but the broader "MCP health" question is unresolved between the two reviews |
| X2 | **Dash-Sess** Quick Actions "Rebuild Stats" spawns `claude /usage`; **MCP-Set** §8.3 explicitly gates any `claude` subprocess to user-initiated only with trusted-dir check. `Rebuild Stats` would re-trigger the MCP-spawn warning. Cross-flag needed |
| X3 | **Dash-Sess** Settings has no overlap claim; **MCP-Set** says Settings → Plugins double-writes `enabledPlugins`. No direct conflict, just disjoint |
| X4 | Both reviews introduce new Tauri commands (`get_cli_version`, `read_claude_json`, `write_project_mcp_json`) without coordinating the capabilities allowlist update |

### Proposals to keep as-is (high-value)

- D-F1 Quick Actions task allocation (forces creating TBD-T4.6/T4.7/T4.8 plan)
- D-F8 SystemHealth source-per-indicator table (closes RCA Bug 4)
- D-F10 stable donut color binding
- D-F11 + §4.3 refresh policy (closes silent gap)
- §4.4 R1-compliant Verification block — assertion-style, no "or empty state" escape
- S-F7 ORPHANED redefinition (FS-walk, not index)
- S-F1 ALIVE-state bifurcation (app-started vs external) with `spawnedByApp` SQLite column

### Proposals to reject or rework

| # | Item | Rework to |
|---|---|---|
| R-1 | §5.1.1 SQL tables block | Move to "TS schema in `src/lib/db.ts` adds tags/groups; see §17.9". Don't paste raw DDL into spec |
| R-2 | `pid_file_missing_at_discovery` column reference in §5.9 | Drop; simplify the NULL assertion |
| R-3 | "TBD-T4.6/T4.7/T4.8/T4.9/T5.1" sprinkled inline | List them once in an Out-of-scope/follow-up section; inline TBDs proliferate and rot |
| R-4 | Dual `<ul role="list">` + virtualized `role="list"` mandate | Useful but belongs in §17.8 (perf bounds), not §5.5. Defer cross-section |

---

## Reviewing: MCP-Set refine

### Grounded? (citation spot-check)

| Claim | Cite | Verdict |
|---|---|---|
| `write_mcp_server` returns Err for `scope="project"` | `commands.rs:120-124` | ✅ verified exactly |
| `refreshStatus` regex `/^([\w.-]+)\s*:\s*(.*)$/` doesn't match real `claude mcp list` output | `mcp-store.ts:111-114` | ✅ regex confirmed; real output format claim plausible but reviewer cites no fixture — partial credit |
| `mcp-store` `cwd: ""` default with T3.12 comment but "no TODO marker in code" | `mcp-store.ts:7,57` | ❌ partially wrong. Comment at `mcp-store.ts:5-6` DOES say "T3.12 will wire this from the session store". That IS the R2 TODO marker (comment form, not exact `// TODO(T3.12)` syntax). The reviewer's R2 violation claim overreaches; fairer claim is "marker uses prose not `TODO(...)` convention" |
| `SettingsSection.tsx:1-29` renders only h1 + tagline; "no `TODO(T4.<n>)` marker — R2 violation" | `SettingsSection.tsx` | ✅ verified — 29 lines, zero TODO markers, R2 violation legitimate |
| `check_mcp_status` shells out in app CWD, not project root | `commands.rs:187-189` | ✅ verified (`std::process::Command::new("claude")` with no `.current_dir()`) |
| `McpServerForm.tsx:219` offers only user/local scope radios | `McpServerForm.tsx:218-231` | ✅ verified (`["user", "local"] as const`) |
| User-scope RMW test preserves unrelated keys (`commands.rs:264-282`) | `commands.rs:264-282` | ✅ verified — `theme: dark` preserved in test |
| `tools[]` never populated by `loadMcpServers` / `refreshStatus` | `mcp-types.ts:48`, `McpServerDetail.tsx:57-76` | Not directly re-read but consistent with refreshStatus body (only sets status). Accept |

Score: 6/8 grounded, 1 partial, 1 wrong (the T3.12-marker claim). Spot-checks otherwise hold.

### Over-design / scope creep

| # | Item | Verdict |
|---|---|---|
| 1 | New `write_project_mcp_json` IPC + 4-row scope-write routing table in §17.10 | Justified — closes real broken path |
| 2 | "Trust toggle" UI for project-scope servers (enabledMcpjsonServers) | **Premature.** No trust UI exists today; spec adding a toggle without an existing task to land it is the exact orphan-placeholder pattern. File a task first, or defer to §8.5 v2 like `tools[]` and OAuth |
| 3 | "Auto-refresh default: off after first launch" with 3-failure backoff + suspend semantics | Over-specifies. A single "user-initiated only" rule is enough; backoff state machine is gold-plating |
| 4 | Fixtures `tests/fixtures/mcp-list-output/*.txt` mandated in spec | Mild over-design — fixture location belongs in test plan, not product spec |
| 5 | `~/.claude/mcp-logs/<server-name>.log` log path invention | **Hypothetical** — reviewer admits "no log file location defined anywhere". Don't invent a path the CLI doesn't write to. Defer "View Logs" entirely (already in §8.5 Out of Scope, good) and drop the path |
| 6 | "type DELETE to confirm" typed-confirm for Reset App Data | Standard, OK |
| 7 | Settings §9.3 per-field map (`ANTHROPIC_*` → settings.json.env, `primaryApiKey` → config.json) | High-value; keep |
| 8 | "Round-trip preservation … mandatory" rule | Existing MCP test proves this works for MCP; generalizing it as a hard rule is reasonable |
| 9 | Dirty-state guard with confirm dialog on tab switch | Standard form pattern; OK |
| 10 | Appearance writes go through `useThemeStore` only | Aligned with CLAUDE.md; keep |

### Architecture conflicts

| # | Conflict | Severity |
|---|---|---|
| B1 | "Appearance lives in App SQLite `app_settings` table (see §17.9 + new migration)" — spec lists fields `theme, terminalFontSize, terminalFontFamily, compactMode` | CLAUDE.md says TS owns schema, Rust never runs SQL. Reviewer hints "new migration"; need to specify `MIGRATIONS[N]` in `src/lib/db.ts` and bump `EXPECTED_VERSION` (not in the proposed text). Architecturally OK, just incomplete |
| B2 | "live (autosave)" for Appearance vs "explicit Save" for everything else | Two write models in one Settings section — fine, just needs justification (UI prefs vs config files). Reviewer says it; acceptable |
| B3 | `useThemeStore` is currently pure with `mode` + resolved theme only (CLAUDE.md). Proposal adds 3 new keys (`terminalFontSize`, `terminalFontFamily`, `compactMode`) | Store expansion changes a "pure" Zustand store into a config-persistence store. Either keep `theme-store` minimal and create a new `appearance-store` that owns persistence, or call out the API expansion explicitly. Reviewer flags it in Out-of-scope item ("confirm the store API supports …") — good catch |
| B4 | Monaco vs CodeMirror/shiki for Advanced raw JSON editor | Real tech-stack drift; reviewer flags it. Pick shiki-read-only + textarea — shiki already in tech stack |
| B5 | `write_project_mcp_json` is new Tauri command — needs capabilities allowlist entry | Reviewer doesn't mention `src-tauri/capabilities/default.json`. Same gap as Dash-Sess A4 |

### Conflicts with Dash-Sess proposal

| # | Conflict |
|---|---|
| Y1 | Dash-Sess says SystemHealth MCP indicator comes from `read_claude_json` count. MCP-Set wants `claude mcp list` (broken) for true status. Disagreement on what "MCP healthy" means. **Resolution:** Dashboard's coarse "any servers configured" check is fine for the dashboard indicator; MCP panel does real status. Mark them as two different signals |
| Y2 | Both reviews independently introduce new Tauri commands without coordinating `default.json` capability entries (see A4 + B5) |
| Y3 | Dash-Sess wants `useThemeStore` to remain owner of `<html>.dark`. MCP-Set agrees (V13). No conflict — actually mutual reinforcement |
| Y4 | Settings tab "Plugins" mirrors `enabledPlugins`, but the **owner** (per Dash-Sess refine framing) of plugin enablement is the Plugins section. MCP-Set proposes Settings is a read-only mirror — correct resolution, no conflict |
| Y5 | Dash-Sess refresh-on-window-focus debounced 1s. MCP-Set 15s/60s/2s schedule. Two different refresh contracts for two stores — OK, but DESIGN-CONTEXT §10 should be the single source of truth across sections |

### Proposals to keep as-is (high-value)

- §8.1 scope-table with "Writable from UI?" column (closes broken project-scope path)
- §8.3 explicit parser contract pinned by fixtures
- §8.3 spawn-warning gate ("user-initiated only")
- §8.5 Out-of-scope block (`tools[]`, OAuth, View Logs) — exactly the right shape for a refine
- §9.2 file-of-truth + per-field map (gives implementers a real spec instead of 7 hand-wavy bullets)
- §9.3 General/API per-field map
- §17.10 form-field table with validation + commit triggers for tag-input

### Proposals to reject or rework

| # | Item | Rework to |
|---|---|---|
| R-A | Trust toggle for project-scope servers | Defer to §8.5; or file a task ID before landing in spec |
| R-B | 3-failure auto-refresh backoff state machine | Drop. "User-initiated only" + "freeze on failure" is enough |
| R-C | `~/.claude/mcp-logs/<server-name>.log` invented path | Drop; keep only the §8.5 "View Logs deferred" line |
| R-D | Bare "add Monaco as dependency" alternative | Resolve to shiki-read-only — Monaco bloat is unjustified for a read-only config viewer |
| R-E | `app_settings` SQLite table migration | Specify `MIGRATIONS[N]` + `EXPECTED_VERSION` bump in `src/lib/db.ts` explicitly. Don't just say "new migration" |

---

## Net recommendation

| Action | Items |
|---|---|
| **Land** | Dash-Sess D-F1/D-F8/D-F10/D-F11, §4.3 refresh, §4.4 Verification, S-F1/S-F7; MCP-Set §8.1 scope table, §8.3 parser+spawn gates, §8.5 Out-of-scope, §9.2 file-of-truth map, §9.3 per-field, §17.10 form table |
| **Rework before landing** | Dash-Sess §5.1.1 (move DDL out, reference `db.ts`), §5.9 (drop invented column), MCP-Set Appearance (specify migration version), Advanced editor (pin shiki) |
| **Defer / reject** | Trust toggle, mcp-logs invented path, 3-failure auto-refresh backoff, Phase-5 sub-agents view as undocumented TBD |
| **Cross-cut blocker** | Both refines add new Tauri commands (`get_cli_version`, `read_claude_json`, `write_project_mcp_json`) but neither updates `src-tauri/capabilities/default.json`. A coordinated capabilities-allowlist patch must accompany whichever phase ships first |
| **Plan gap** | The "TBD-T4.6/T4.7/T4.8/T4.9/T5.1" task IDs in Dash-Sess and "T3.12" in MCP-Set must actually exist in a plan file before either refine merges, or R2 fails on the next ralph-loop |
| **R3 readiness** | Settings is a 29-line stub — Phase 4 Smoke DoD cannot embed any real Settings widget value until at least 1 tab ships. Sequence Settings T4.x ahead of phase-end smoke |
