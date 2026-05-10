# Stats-Cache Investigation

> **Date:** 2026-05-09
> **Author:** Claude (assisted, decisions logged inline)
> **Trigger:** Dashboard's ActivityChart stops at 2026-04-07 on Ness's machine; today is 2026-05-09 (32 days stale).
> **Status:** Root cause confirmed; remediation strategy decided (see §6).

---

## 1. Question

Why is `~/.claude/stats-cache.json` stale, and is this a claude-manager bug?

## 2. Facts (verified, not inferred)

| Fact | Evidence |
|---|---|
| File mtime | `2026-04-09 15:14` (last write); today `2026-05-09` |
| File schema | `version: 2`, `lastComputedDate: "2026-04-08"`, `dailyActivity` last entry `2026-04-07` |
| Writer | Claude Code CLI itself, not claude-manager |
| Reader contract | `src/lib/stats-reader.ts:5` comment: *"The on-disk file is written by Claude Code itself; we treat it as untrusted input"* |
| Installed CLI version | `2.1.98` at `C:\ProgramData\global-npm\node_modules\@anthropic-ai\claude-code\` |
| Settings flag | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"` in `~/.claude/settings.json` line 7 |
| CLI bug fix release | v2.1.105 changelog: *"Fixed `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` in one project's settings permanently disabling usage metrics for all projects on the machine"* |

## 3. Root Cause

The CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 flag, in CLI versions **before** v2.1.105, permanently disables usage-metrics collection across all projects on the machine. Usage metrics include the stats-cache write step. The user's installed CLI is v2.1.98 — affected by the bug.

The cache is normally written on session-end and on the `/usage` command. Neither path executes when metrics are disabled.

**This is not a claude-manager bug.** The reader code, the chart component, the slicing logic, and the period-toggle handler all work correctly given the input they receive. The input itself is stale.

## 4. What claude-manager *does* do wrong (separate concern)

Claude-manager renders 32-day-stale data with **zero indication** that it's stale:

- ActivityChart silently shows up to 4/7 with no banner
- The "7d" period toggle implies "last 7 days from now"; the chart actually shows "last 7 days *of available data*" — a misleading affordance
- StatCard for "Active Since" reads from a different source (SQLite `MIN(started_at)`) and is also broken — see [dashboard-bugs-rca.md §3.1](./2026-05-09-dashboard-bugs-rca.md)
- "Rebuild Stats" Quick Action exists in the spec (§4.1) but is disabled placeholder — even if it weren't, claude-manager can't rebuild a cache it doesn't write

## 5. Decision: do NOT take stats-cache writing into claude-manager

**Considered:** Should claude-manager parse `~/.claude/projects/*.jsonl` directly and compute its own stats, owning the cache?

**Rejected.** Reasons:

1. **Architectural boundary respect.** The Claude Code CLI owns its stats schema; duplicating computation creates schema drift risk every CLI release.
2. **Compute cost.** Re-aggregating tens of MB of JSONL on every dashboard mount is wasteful when the CLI already does it.
3. **Two writers, one file** is a recipe for corruption (no file lock).
4. **Root cause is upstream and fixed.** The CLI bug has a known fix (v2.1.105). The right action is upgrade + flag review, not architectural takeover.

**Decision:** claude-manager remains read-only for `stats-cache.json`. We add staleness detection and surface it in UI; we do not become a writer.

## 6. Remediation (no workarounds)

**For Ness's machine (one-time):**
```bash
npm update -g @anthropic-ai/claude-code   # to >=2.1.105
# Then either remove the flag from ~/.claude/settings.json,
# or accept that disabling non-essential traffic also disables stats — that's the documented design.
claude /usage   # forces a fresh write
```
After this, the cache will be regenerated on the next session-end.

**For claude-manager (permanent):**

1. **Staleness detection in stats-reader** — return `lastComputedDate` and file mtime alongside `StatsData`. (New field on `StatsData`; the reader already parses the file.)
2. **Staleness banner in DashboardSection** — when `lastComputedDate` is more than 1 day behind today OR file mtime is more than 1 day old, render a non-dismissable banner: *"Activity data is stale (last updated YYYY-MM-DD). Run `claude /usage` to refresh, or check that `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is not set."*
3. **Period toggle relabel** — change "7d" → "Last 7 days of recorded data" (or compute true rolling window from today, padding missing days with zeros so the X-axis goes to today and stale data is visually obvious).

The "Rebuild Stats" Quick Action's correct semantics are now clear: it should invoke `claude /usage` via Tauri shell, not attempt to compute the cache itself. This belongs in the dashboard-activation plan ([2026-05-09-dashboard-activation.md](../superpowers/plans/) — to be created).

## 7. Verification steps for the fix

After applying remediation §6:
1. `~/.claude/stats-cache.json` mtime updates within 1 minute of running `claude /usage`
2. `lastComputedDate` field equals today's date
3. claude-manager Dashboard shows banner before fix; banner disappears after fix
4. Period toggle "7d" shows true today-7 to today range, with zero-padded days if no activity

## 8. Cross-references

- Reader code: `src/lib/stats-reader.ts:1-196`
- Store consumer: `src/stores/dashboard-store.ts:111`
- Spec: `docs/superpowers/specs/2026-05-03-claude-manager-design.md` §4.1, §6
- DESIGN-CONTEXT: this investigation will be folded into a new §18 there
- Sibling RCA: [2026-05-09-dashboard-bugs-rca.md](./2026-05-09-dashboard-bugs-rca.md)
