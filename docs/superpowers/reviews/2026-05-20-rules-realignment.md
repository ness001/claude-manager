# Review re-alignment under new R2 + new §State management — 2026-05-20

_Quick-pass re-classification after CLAUDE.md rewrite. Does not re-do the gap analysis — only flips judgments that depended on the deleted rules._

Legend: **INVALIDATED-but-WORSE** = old finding nullified, but placeholder still exists and now violates new R2 harder. **DROP** = finding was purely about missing TODO+task-ID; no underlying defect. **ESCALATED** = already an R2 violation; new R2 makes it a hard merge-blocker. **DROP-RULE** = cited deleted CLAUDE.md authority; check spec; spec doesn't say it → drop. **STANDS** = spec independently says it; re-ground.

## 1. Findings invalidated by the new R2

Findings whose verdict was "R2-violation because TODO+task-ID missing" — the TODO requirement is gone, but the underlying half-built feature is worse now.

| Source file | Finding ID | Original verdict | New verdict | One-line reason |
|---|---|---|---|---|
| design-refine-dash-sess | D-F1 (Quick Actions) | R2 violation: cite T4.5 not per-button task | INVALIDATED-but-WORSE | 4 disabled buttons shipped without backend = textbook new-R2 half-built feature |
| design-refine-dash-sess | S-F2 (My View groups/DnD) | Orphan placeholder per CLAUDE.md R2 | INVALIDATED-but-WORSE | Stubbed "Pinned + All" with no backend = half-built; should be REMOVED until full slice |
| design-refine-dash-sess | S-F5 (displayName in-memory only) | "No task ID referenced — orphan per R2" | INVALIDATED-but-WORSE | Disabled persistence button + frontend-only state = layer-split, exact new-R2 anti-pattern |
| design-refine-plug-skill | R2 sweep (PluginCard L271-273, L311-313; PluginListView L76-82) | Cite `ui-defect-sweep#L293/L294/L295` not `T<phase>.<num>` | INVALIDATED-but-WORSE | Install/Reinstall/Remove disabled stubs with no backend IPC = half-built; new R2 says delete the buttons |
| design-refine-mcp-set | U7 (View Logs/Retry/Cancel/View Tools) | "R2 violation — no `TODO(T<phase>.<num>)` marker" | INVALIDATED-but-WORSE | All four are disabled buttons with no backend = half-built features |
| design-refine-mcp-set | S1 (SettingsSection 29-line stub) | "No `TODO(T4.<n>)` marker — R2 violation" | INVALIDATED-but-WORSE | Whole section is a placeholder shell — under new R2, "deferred whole section" must either ship one full vertical slice or remove from nav |
| design-refine-mcp-set | gap #10 (`mcp-store.cwd` T3.12 orphan) | "R2 orphan: no TODO marker in code, no T3.12 visible" | INVALIDATED-but-WORSE | Field exists in store with no producer = backend-without-UI-caller; new R2 forbids |
| cross-review-dash-sess | A3 ("synchronously writing display_name FORBIDDEN to be in-memory only — Aligned with R2") | OK per old R2 | STANDS (different reason) | Still forbidden under new R2 — half-built persistence layer |
| cross-review-dash-sess | Plan gap (T4.6-T4.9, T5.1, T3.12 must exist or R2 fails) | "R2 fails on next ralph-loop" | INVALIDATED | New R2 doesn't care whether IDs exist; cares whether features ship as full slices |

## 2. Findings strengthened by the new R2

Half-built features already-flagged that escalate from "needs TODO" to "must not merge in this shape."

| Source file | Finding ID | Original verdict | New verdict | One-line reason |
|---|---|---|---|---|
| design-refine-dash-sess | D-F2 (Rebuild Stats semantics) | Disabled stub, semantics undefined | ESCALATED | Disabled button awaiting `claude /usage` backend = ship together or remove |
| design-refine-dash-sess | D-F8 (SystemHealth defaults 0/'unknown') | R2-class: half-wired indicator | ESCALATED | Backend props exist with no producer = layer-split |
| design-refine-plug-skill | F4 (Install Plugin button) | Hardcoded disabled, no IPC | ESCALATED | UI-only without backend = new-R2 forbidden |
| design-refine-plug-skill | F5 (Reinstall/Remove) | Hardcoded disabled, no IPC | ESCALATED | Same |
| design-refine-plug-skill | F6 (Update Available pill non-actionable) | Decorative-only | ESCALATED | Visible affordance with no action = half-built |
| design-refine-plug-skill | V7 ("Create Skill" label oversells) | UX mismatch | ESCALATED | Button promises feature, opens folder = half-built feature pretending to be whole |
| design-refine-mcp-set | gap #1 (project-scope MCP) | Cannot create/edit/remove project-scope | ESCALATED | Form rejects project scope yet card surfaces project-scope rows = backend/UI mismatch |
| design-refine-mcp-set | gap #5 (trust tracking ghost) | Load-only, no UI | ESCALATED | Backend reads data with zero UI consumer = layer-split |
| design-refine-mcp-set | gap #2 (`tools[]` dead code) | Type+UI exists, never populated | ESCALATED | UI rendering field that no backend populates = half-built |
| design-refine-mcp-set | U12 (Starting state Cancel action dead) | Permanent disabled | ESCALATED | Unreachable code path = half-built state machine |
| cross-review-dash-sess | R-2 (verification cites nonexistent column) | Over-design | STANDS | Unrelated to R2 — still over-design |

## 3. The 12 "plan-file task allocation gaps"

Under old R2 fix = "add task IDs to plan files." Under new R2, the question is whether the underlying feature should exist at all right now.

| Item | Old fix | New fix |
|---|---|---|
| TBD-T4.6 Quick Action "Resume Latest" | Allocate task ID in dashboard-activation plan | BUILD-NOW-AS-VERTICAL-SLICE (small: spawn `claude --continue`) or REMOVE-PLACEHOLDER |
| TBD-T4.7 Quick Action "Open CWD" | Allocate task ID | BUILD-NOW-AS-VERTICAL-SLICE (tiny: shell `open()` on `$HOME`) |
| TBD-T4.8 Quick Action "Rebuild Stats" (spawn `claude /usage`) | Allocate task ID | BUILD-NOW-AS-VERTICAL-SLICE (gated by C2 shell-out policy) or REMOVE-PLACEHOLDER |
| TBD-T4.9 Tag/Rename modal + tag CRUD | Allocate task ID | REMOVE-PLACEHOLDER (tag pills + disabled rename button); rebuild as full slice when modal lands |
| TBD-T5.1 Sessions DnD + sub-agents view | Allocate Phase 5 ID | REMOVE-PLACEHOLDER from My View; ship Phase 5 as full slice |
| TBD `get_cli_version` IPC | Allocate task + capability entry | BUILD-NOW-AS-VERTICAL-SLICE (paired with SystemHealth CLI indicator — both or neither) |
| TBD `read_claude_json` IPC | Allocate task | BUILD-NOW-AS-VERTICAL-SLICE (paired with MCP indicator) |
| TBD `write_project_mcp_json` IPC | Allocate task | BUILD-NOW-AS-VERTICAL-SLICE (paired with project-scope radio in form) — currently a half-feature both ways |
| TBD-T4.x Plugins CRUD (Install/Reinstall/Remove/Update) | Allocate task IDs | REMOVE-PLACEHOLDER buttons; spec §6 says "Plugins installed via CLI" — honor that in v1, rebuild as full slice in v2 |
| TBD-T4.x SKILL.md scaffold decision | Allocate task | KEEP (button currently opens folder — that IS the full feature). Just rename button label to match honest behavior ("Open Skills Folder") |
| TBD-T4.x Settings 7 tabs (T4.6-T4.8 stub) | Allocate task IDs | BUILD-NOW-AS-VERTICAL-SLICE one tab at a time; REMOVE Settings nav entry until tab 1 ships, or ship Appearance (smallest) first |
| TBD-T3.12 wire `mcp-store.cwd` from session store | Verify T3.12 exists | BUILD-NOW-AS-VERTICAL-SLICE — without it local-scope MCP add is broken; pair with local-scope radio enablement |

## 4. Findings invalidated by the §State management change

Findings that cited CLAUDE.md "two pure stores" or "pure-store invariant" as authority.

| Source file | Finding ID | Original verdict | New verdict | One-line reason | Spec citation |
|---|---|---|---|---|---|
| cross-review-dash-sess | B3 (`useThemeStore` purity, terminalFontSize expansion changes pure → persistent) | "changes a 'pure' Zustand store" per CLAUDE.md | DROP-RULE | CLAUDE.md no longer claims pure-store invariant | Spec §9.2 Appearance has no purity claim either |
| spec-refine-summary | Tier 4 C4 (useThemeStore API expansion vs new appearance-store, recommends B "preserves CLAUDE.md two pure stores principle") | Recommend B to preserve CLAUDE.md principle | STANDS (different reason) | New CLAUDE.md drops the principle; recommendation B still valid on separation-of-concerns grounds (persistence vs ephemeral theme), just no longer rule-driven | n/a — judgment call now |
| design-refine-mcp-set | V13 ("Theme=system + .dark class race … CLAUDE.md 'State management' says App.tsx owns the `<html>.dark` toggle") | Cited CLAUDE.md as authority | STANDS | Behavioral concern (single owner of `<html>.dark`) is real regardless of who documents it; just re-ground in code/spec instead of CLAUDE.md | Spec silent; ground in `src/App.tsx` ownership |
| cross-review-dash-sess | Y3 ("Dash-Sess wants useThemeStore to remain owner of `<html>.dark`. MCP-Set agrees (V13). No conflict — mutual reinforcement") | Cited CLAUDE.md frame | STANDS | Same as V13 — behavioral, re-ground in code | n/a |

## 5. Net impact on the 4 tiers in the summary file

**T1 (35 accept-as-is):** No drops. T1-32 (§9 Appearance routes through `useThemeStore`) stays but re-grounded on behavioral single-owner argument, not CLAUDE.md authority. Net: **0 change**.

**T2 (22 accept-with-mods):** T2-08 (Plugins CRUD spec marks "wire-up task required") shifts from "rework the placeholder language" to "spec should mark as DEFERRED + remove disabled buttons from code." Now aligns with §6 header "CLI-only v1." Net: **1 shifts** (T2-08 stronger DEFERRED stance).

**T3 (10 reject):** No un-rejections. T3-03 (sub-agents view TBD-T5.1) and T3-04 (trust toggle premature) both rejected for non-R2 reasons (spec shouldn't mint IDs / premature scope) that still hold. Net: **0 change**.

**T4 (5 conflicts):** **C4 reshaped, not eliminated.** Recommendation B (new `appearance-store`) loses its CLAUDE.md-rule justification but the separation-of-concerns argument stands — still recommend B. C1, C2, C3, C5 unaffected. Net: **C4 reshaped (rationale only); 0 disappearances**.

Cross-cutting: **all "Plan-file gaps" table rows** (12 entries) are no longer R2-driven. They now need a per-row BUILD-NOW vs REMOVE decision (see §3). Capabilities-allowlist patch (§9 in summary) is also still needed for IPCs that DO get built — but only for IPCs whose UI ships in the same PR.

## 6. Recommended next action

Ness: the spec-refine-summary's Tier 1 / 2 / 3 / 4 tables are still 99% valid; the real impact lands on §3 above (the 12 plan-gap items). Before patching the spec per the recommended sequence, do a code sweep: every disabled button + every TODO+task-ID marker currently in `src/` is now non-compliant. Triage each into BUILD-NOW-AS-VERTICAL-SLICE (smallest viable UI+backend) or REMOVE-PLACEHOLDER. That sweep replaces the "allocate task IDs" plan-author task from the old workflow. Recommend doing the sweep first (one PR per section: Dashboard, Sessions, Plugins, MCP, Settings) before any §17 / §13 / §10 cross-section spec patches — otherwise the new spec patches will reference UI surfaces that should be deleted.

---

**Sign-off:** 9 findings invalidated (8 INVALIDATED-but-WORSE + 1 DROP-RULE). 11 findings escalated. T1: 0 affected. T2: 1 shifted (T2-08 stronger DEFERRED). T3: 0 un-rejected. T4: 1 reshaped (C4 rationale, not outcome). All 12 plan-file gap items need fresh BUILD-NOW vs REMOVE triage. Recommended: do a code-side disabled-button + TODO sweep across the 5 sections, deciding per item to ship a small vertical slice or delete the placeholder, BEFORE patching the spec per the existing recommended sequence in the summary — otherwise spec edits will reference UI that should no longer exist.
