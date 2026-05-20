# Cross-review by Dash-Sess reviewer — 2026-05-20

Scope: critique sibling reviews `2026-05-20-design-refine-plug-skill.md` (§§6–7) and
`2026-05-20-design-refine-mcp-set.md` (§§8–9, §17.10). I did NOT own these in the
prior round.

## Reviewing: Plug-Skill refine

### Grounded? (citation spot-check)

| # | Claim | Verified at | Verdict |
|---|---|---|---|
| 1 | `derivePluginState` only checks `inRegistry && pathExists`, never returns `update-available` | `src/lib/plugin-loader.ts:89-97` | ✅ Exact match. |
| 2 | `mergeRemoteSha` skips `broken`/`orphaned` but overwrites `disabled` → `update-available` | `src/lib/plugin-updates.ts:76-82` | ✅ Confirmed (also doesn't filter `disabled`). |
| 3 | F12: list-view counts pre-hydration are `0` "during the hydration window every card shows 0 skills/0 agents" | `src/lib/plugin-loader.ts:135-187` | ❌ Misleading. `loadPlugins` AWAITS `Promise.all(...)` for counts (line 168) before returning. The skeleton state covers this; cards never render literal-zero counts post-resolution. Only `description=""` truly survives. F12 should be narrowed to description-only. |
| 4 | F8: `plugin-loader.ts:144-161` only emits orphan when `enabledMap[key] === true` | `src/lib/plugin-loader.ts:144-161` | ✅ `enabledMap[key] !== true` continue at line 146. |
| 5 | R2 violation — TODOs cite `ui-defect-sweep#L293/L294/L295`, not `T<phase>.<num>` | `src/components/plugins/PluginCard.tsx:271-279, 311-314` | ✅ Confirmed verbatim. The R2 rule in CLAUDE.md does say "task ID must exist in the corresponding plan"; the cited tracker is a checkbox in `ui-defect-sweep.md`, not a `T*.<n>` ID. Real R2 violation. |
| 6 | F2: `read_manifest` reads `.claude-plugin/plugin.json` as primary | `src-tauri/src/plugins/commands.rs:272-289` | (Not spot-verified — taking author's word; flagged for ground-truth in implementation PR.) |
| 7 | Spec line 252 says "3-level nesting" but real path has 4 segments under `cache/` | spec line 252 | ✅ Confirmed. F1 is correct and material. |

### Over-design / scope creep

| # | Item | Rebuttal |
|---|---|---|
| O1 | Proposed §6.7 "List load pipeline" mandates "spinner overlay only after 300ms" | Specific 300ms threshold is not currently a documented project convention; introducing a magic number here forces a global standard. Either reference an existing pattern or drop the number — let implementer pick + record in the test. |
| O2 | Proposed §7.3 demands FS watch OR window-focus refresh | Reasonable but the proposed text says "tracked under TODO T<phase>.<num>" without picking one. Spec should commit to one (focus refresh is the simpler v1) rather than offer a menu. |
| O3 | "Mockups predate ARIA implementation — treat as visual reference only" sentence in §6.6 rewrite | Trying to retcon mockup authority into the spec. Either drop the mockup pointer or actually refresh mockups — don't paper over with a disclaimer. |

### Architecture conflicts

None significant. All proposed changes stay within the TS-owns-schema / Rust-doesn't-run-SQL boundary. The proposed `claude plugins update/install/uninstall` IPCs are shell-out commands (mirrors existing `check_mcp_status` pattern) and need capability allowlist entries — Plug-Skill review doesn't mention `src-tauri/capabilities/default.json` updates. **Minor gap.**

### Conflicts with MCP-Set proposal

| # | Conflict |
|---|---|
| C1 | Both reviews flag §17.5 (error table) as incomplete and propose new rows in slightly different shapes. Plug-Skill proposes "inline alert" verbatim copy; MCP-Set proposes "non-dismissable inline error with manual Retry" + 3-failure suspend policy for MCP refresh. Net §17.5 needs a unified contract: error-surface (inline-alert / toast / banner) per data source, dismissable y/n, retry affordance y/n. Pick one author to draft. |
| C2 | Both flag R2-orphan placeholder issue (Plug-Skill: Reinstall/Remove/Install/Update; MCP-Set: View Logs/Retry/Cancel/View Tools). Both recommend creating `T<phase>.<num>` tasks. The fixes need a single sweep task, not two parallel ones. |

### Proposals to keep as-is (high-value)

| # | Pick |
|---|---|
| K1 | F1 (cache-path depth wording) and §6.2 table rewrite. Real spec defect, low-risk fix. |
| K2 | F11 + proposed precedence "broken > orphaned > update-available > disabled > active". Pins ambiguous behavior. |
| K3 | F10 spec change clarifying that update-available does NOT overlay `disabled`. Matches actual code intent. |
| K4 | F2 (manifest location promotion to primary). Real spec/code mismatch. |
| K5 | U2 (drop "tree view" from §6.6 — never built). Honest correction. |
| K6 | §7 SKILL.md schema (G1) — fields, defaults, frontmatter-absent fallback. Closes a real hole. |
| K7 | G6/V6 refresh-after-create. Genuine UX dead-end. |

### Proposals to reject or rework

| # | Reject / rework | Alternative |
|---|---|---|
| R1 | F12 wording overstates the bug ("0 skills/0 agents until hydration"). Counts ARE hydrated before `loadPlugins` resolves. | Restrict to: "description renders empty in list view until detail load; hydrate it during `loadPlugins` or render a placeholder." |
| R2 | Proposed §6.5.1 lists `Install Plugin` / `Reinstall` / `Remove` / `Update` as TODO items with no decision on whether they're v1 or deferred. | Spec should explicitly mark them DEFERRED with a §X cross-reference to a Phase 5/6 plan, OR commit to wiring in v1 with concrete IPC names. The "TODO T<phase>.<num>" placeholder in the spec itself is non-actionable. |
| R3 | U7 "5 states palette" — amber vs yellow nit. | Trivial; just patch the spec value to `#d97706` in one edit, don't ceremony it. |
| R4 | Spec §6 header copy retain-or-remove debate ("Plugins are installed via the CLI"). | Keep CLI-only language; explicitly note "in-app install is out of v1 scope." Don't leave open. |

---

## Reviewing: MCP-Set refine

### Grounded? (citation spot-check)

| # | Claim | Verified at | Verdict |
|---|---|---|---|
| 1 | `write_mcp_server` rejects `scope="project"` | `src-tauri/src/mcp/commands.rs:120-124` | ✅ Exact match. |
| 2 | `refreshStatus` regex `/^([\w.-]+)\s*:\s*(.*)$/` doesn't match real `claude mcp list` output | `src/stores/mcp-store.ts:110-113` | ✅ Regex confirmed at line 112. CLI-output mismatch claim not independently verified here (would require running `claude mcp list`), but the claim that the spec doesn't pin the parser contract is sound — spec line 340 says only "Computed via `claude mcp list`". |
| 3 | `check_mcp_status` shells out from app CWD, not project root | `src-tauri/src/mcp/commands.rs:187-189`, runner at 200-210 | ✅ `Command::new("claude").args(["mcp","list"])` with no `.current_dir(...)`. Confirmed. |
| 4 | Auto-poll on mount violates §8.3 trusted-directory warning | `src/sections/McpSection.tsx:34-67` | ✅ `loadServers + refreshStatus` in mount effect, every 15s — confirmed. Real concern given the spawn-warning. |
| 5 | `SettingsSection.tsx` is 29-line stub with only heading + tagline | `src/sections/SettingsSection.tsx` | ✅ File is 30 lines (29 close enough). Pure placeholder confirmed. |
| 6 | "no `TODO(T4.<n>)` marker — R2 violation" for SettingsSection | `src/sections/SettingsSection.tsx` (full file) | ✅ Zero TODO markers in file. R2 violation confirmed. |
| 7 | `mcp-store.ts:7` comment cites "T3.12 will wire this from the session store" | `src/stores/mcp-store.ts` (top) | ⚠️ Not spot-verified here — author should pin the line; "T3.12" needs to be confirmed against the actual phase plan. |
| 8 | Local-scope add broken end-to-end (cwd empty) | `src-tauri/src/mcp/commands.rs:100-102` + `McpSection.tsx:28` shows `cwd` from store with no setter wired | ✅ McpSection.tsx:28 reads `cwd` from store; section never calls `setCwd`. Local-scope save would Err. |

### Over-design / scope creep

| # | Item | Rebuttal |
|---|---|---|
| O1 | Proposed §8.5 "Out of Scope for v1" lists OAuth + Tools discovery + Logs UI | Useful but `tools[]` (gap #2) is already noted as dead code; spec should DELETE it from §8.2 in v1 (remove the column), not just defer with a "(v2)" tag. Half-measures invite cargo-cult re-introduction. |
| O2 | Proposed §17.10 form adds "Env value secret auto-detection by regex `/key|token|secret|password/i`" | Hypothetical heuristic with no implementation backing. Push to a UX research note, not the spec. Spec should say "values marked secret render masked" and leave the detection mechanism unspecified for now. |
| O3 | Proposed Settings §9.2 demands "round-trip preservation for ALL settings IPC" | Big-bang generalization. Today only the MCP write proves it works (`commands.rs:264-282`). Spec should narrow this to "MCP and any new IPC MUST round-trip; rest TBD per-IPC." |
| O4 | Proposed §9.4 Danger Zone "type DELETE to confirm" | Specific copy. Fine, but spec is now picking interaction-text. Likely better as a `[research-needed]` placeholder. |
| O5 | Proposed §9.2 "Auto-refresh suspends after 3 consecutive failures" | Arbitrary threshold (3) introduced without prior art. Reduce to "auto-refresh suspends after repeated failures (threshold TBD)." |

### Architecture conflicts

| # | Conflict |
|---|---|
| A1 | Proposed §9.2 Appearance row says "App SQLite (`app_settings` table, see §17.9 + new migration)". CLAUDE.md states TS owns the schema in `src/lib/db.ts` (SCHEMA[] + MIGRATIONS). The spec change must mention SCHEMA + EXPECTED_VERSION bump, not a generic "+ new migration" handwave. Otherwise implementers add a Rust-side migration and break the boundary. |
| A2 | Proposed new IPC `write_project_mcp_json` needs a `capabilities/default.json` allowlist entry — MCP-Set review doesn't mention it. Same gap as Plug-Skill. |
| A3 | Proposed Appearance writes "through `useThemeStore` only" with new fields `terminalFontSize`/`terminalFontFamily`/`compactMode`. Current store has only `mode`/resolved theme (per CLAUDE.md). This is a real store-API change the spec must call out explicitly with a §9.X entry and a Phase 4 task — currently buried inside V13. |

### Conflicts with Plug-Skill proposal

| # | Conflict |
|---|---|
| X1 | Both reviews want §17.5 expansion (see Plug-Skill C1). MCP-Set's proposal is more elaborate (3-failure threshold, freeze-on-error). One unified design needed. |
| X2 | Plug-Skill V11 (Plugins-tab dual-write) and MCP-Set S4 BOTH note that `enabledPlugins` may be touched from two places. MCP-Set proposes "read-only mirror — Plugins section owns writes." Plug-Skill is silent. **Agreement actually exists**; spec should adopt MCP-Set's wording. |
| X3 | Plug-Skill §6 envisions in-app `claude plugins install` / `update` / `uninstall` shell-outs. MCP-Set §8.3 wants to RESTRICT shell-out spawning (trusted-dir gate, opt-in auto-refresh). The spec needs a single shell-out policy section (probably in §13 or new §17.X) covering: when shell-out is allowed, when it requires user opt-in, error-handling. Currently each section invents its own rules. |

### Proposals to keep as-is (high-value)

| # | Pick |
|---|---|
| K1 | Gap #1 + §8.1 rewrite — project-scope write path. Real broken feature, fix is mechanical. |
| K2 | Gap #3 + §8.3 parser-contract section with fixture tests. Status-always-disconnected is a Top-1 user-visible bug. |
| K3 | Gap #4 + spawn-warning gate. Honors a spec invariant the code currently violates. |
| K4 | Gap #10 + U15 — local-scope `cwd` source. End-to-end broken today; needs a session-store contract before MCP local-scope is usable. |
| K5 | §9.3 per-field map for General/API. Disambiguates `settings.json` vs `config.json` ownership. |
| K6 | S7 (Monaco isn't in stack — pick CodeMirror/shiki). Tech-stack mismatch is a real defect. |
| K7 | V9 unsaved-changes guard on tab switch. Standard form-UX requirement, currently absent. |

### Proposals to reject or rework

| # | Reject / rework | Alternative |
|---|---|---|
| R1 | "OAuth-authenticated MCP servers … floating" (gap #9) — proposes adding §8.5 deferral. | Simpler: cite DESIGN-CONTEXT.md §16 once in spec §8 header and say "v2 scope." Don't carve a new subsection for it. |
| R2 | U3 "MaskedValue masks every env var including NODE_ENV" — proposed change asks for a heuristic. | Reject the heuristic. Spec should say "all env values masked by default; user toggles reveal per-row." Auto-detection is over-design. |
| R3 | U11 "role=alert" SR-rerender concern | Out of design-spec scope; this is an implementation detail for the component PR. Don't add to spec. |
| R4 | V6 §17.6 "contradicts itself" finding | Real point, but the proposed Settings-only override is too narrow. Fix is global: §17.6 should list per-section loading-state explicitly; spec table needs full audit, not one-row swap. |
| R5 | §9.2 Permissions "Each rule row has a scope toggle (Shared / This machine)" | Spec inventing UI before the data model is settled. Today neither file's permissions API surface is fully understood (no citation to a DESIGN-CONTEXT.md note on merge semantics). Mark this as `[design-needed]` and leave the row-level toggle out of the spec until precedence is documented in DESIGN-CONTEXT.md. |

---

## Net recommendation

**Adopt outright:**

- Plug-Skill §6.2 path table (F1), §6.4 precedence order (F11/F10/F8), §6.6 drop "tree view" (U2), §7 SKILL.md schema (G1), R2-orphan TODO sweep.
- MCP-Set §8.1 project-scope routing (gap #1), §8.3 parser contract + fixtures (gap #3), §8.3 spawn-warning gate (gap #4), §9.3 per-field map for General/API (S3), V9 dirty-state guard.

**Adopt with rework:**

- Unified §17.5 error table — one author, single shape (inline alert vs toast vs banner per source). Currently both sides propose overlapping/divergent rows.
- Single shell-out policy section (covers Plug-Skill's planned `claude plugins install/update/uninstall` and MCP-Set's `claude mcp list/get` warnings). Today each section reinvents the rules.
- Settings §9.2 Appearance — must specify `db.ts` SCHEMA[] + EXPECTED_VERSION bump + `useThemeStore` API extension, not a vague "new migration."
- Both reviews need to mention `src-tauri/capabilities/default.json` allowlist entries for new IPCs.

**Cut:**

- F12 wording overstates the bug — counts hydrate inside `loadPlugins`. Trim to description-only.
- Monaco vs CodeMirror — pick one in spec text, don't enumerate options.
- Heuristic-based env-secret detection (regex on key name). Push to UX research.
- Specific magic numbers introduced without prior art (300ms spinner threshold, 3-failure auto-refresh suspend).

**Cross-section gaps neither side caught:**

- Capabilities allowlist (`src-tauri/capabilities/default.json`) updates for every new IPC are unaddressed.
- Single shell-out policy missing (project-wide).
- Spec §17.6 needs a full per-section audit, not one-row patches.
