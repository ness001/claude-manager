# Acceptance Stage & Plan-Template Tightening — Design

**Date:** 2026-05-04
**Author:** Ness + Claude
**Status:** Approved-for-planning (pending Ness's review of this doc)

## Why this exists

Phase 2 of claude-manager shipped with every plan checkbox marked complete and every test passing — yet five user-visible bugs survived to first launch:

1. **My View** has no UI to create / edit / assign user-defined groups (spec §5.4).
2. **Project view** group headers are not collapsible (spec §5.4).
3. **Timeline view** entries display undated — `started_at` is never populated for ENDED sessions because the loader sources it only from PID files, which ENDED sessions don't have.
4. **Session detail** action buttons (Resume, Stop, Open CWD, Open in VS Code, Tag/Rename, Archive, Fork, Unarchive, Delete) are silent no-ops; `handleAction` in `SessionInfoBar.tsx` has an empty body except for the `stop`-confirmation case.
5. **Dashboard** action buttons in `QuickActions.tsx` (New Session, Resume Latest, Open CWD, Rebuild Stats) have no `onClick` handlers at all.

A forensic pass collapsed these into six recurring failure modes:

- **F1** verification asserts presence (`button is in DOM`) instead of behavior (`click → handler invoked with args`)
- **F2** scope deferred to later phases is declared in plan comments but **not** marked in code with `// TODO(PhaseN)` — silent stubs
- **F3** every layer is unit-tested against mocks; no end-to-end fixture flows real JSONL through Rust → loader → store → component
- **F4** when screenshot tooling broke, the agent self-waived the manual-smoke gate by claiming "RTL tests cover it" (they don't click real buttons)
- **F5** spec phrases like "user-organized groups" / "collapsible groups" appear in cited spec sections but are never decomposed into plan steps, so the spec-reviewer subagent has nothing concrete to flag
- **F6** the 3-stage subagent review (Implementer → Spec → Quality) has no stage that exercises the running app

This design closes all six gaps for Phases 3 and 4, and queues retroactive cleanup for the five Phase-2 bugs.

## What changes

### 1. New review stage — Acceptance

Insert a **Stage 4 — Acceptance** in `superpowers:subagent-driven-development`, dispatched after Quality Reviewer signs off and before the orchestrator flips the plan checkbox. A fresh subagent (clean context) launches the running app via `tauri-driver`, drives the WebView2 window with `webdriverio`, and produces a structured report with three tables:

**Table A — Button/affordance audit.** One row per interactive element shipped by the task. Columns: `Element`, `Spec section`, `Documented behavior`, `Status ∈ {✅ works, 🟡 stub-marked, ❌ stub-not-marked}`. Any `❌` is a hard fail. `🟡` requires both (a) the plan task's *Deferred actions* block lists the element AND (b) the code contains a matching `// TODO(PhaseN): wire <action>` comment.

**Table B — Spec-coverage cross-check.** One row per imperative phrase in the cited spec sections (`must`, `shows`, `user can`, `collapsible`, `editable`, etc.). Columns: `Spec §`, `Phrase`, `UI affordance found?`. Any unmet phrase is a fail unless the plan explicitly defers it.

**Table C — Real-data pipeline check.** Verifies that at least one test loads a real fixture file (no mocks at the boundary) and asserts the rendered component shows the expected values.

**Failure semantics.** Any `❌` row → task is incomplete; orchestrator re-dispatches Implementer with the report as feedback. **If `tauri-driver` fails to launch**, the subagent outputs `<promise>ACCEPTANCE_DRIVER_BROKEN_AT_T<id></promise>` and stops. Self-waiving by claiming "tests cover it" is forbidden — broken tooling becomes a Ness-blocking event, not a silent skip.

**Artifact.** Acceptance report committed at `docs/superpowers/acceptance-reports/T<phase>.<num>.md` in the same commit as the implementation. Atomic.

### 2. Tightened plan-template verification block

Every UI-shipping task's `Verification` section is restructured into five required typed subsections:

- **Presence assertions** — DOM/render checks. The thing exists.
- **Behavior assertions** — Interaction checks. Click X → assert handler called with Y. UI tasks with **zero** behavior assertions are malformed.
- **End-to-end fixture assertions** — At least one test loads real fixture data through ≥2 layers without mocking the boundary. UI tasks with **zero** E2E assertions are malformed.
- **Deferred to later phase** — Explicit list of buttons/affordances whose handlers are intentionally stubs. Each row MUST appear as `// TODO(PhaseN): wire <action>` in code. Acceptance Stage cross-checks both directions.
- **Spec-coverage map** — Every imperative phrase from cited spec sections mapped to either a code symbol or an explicit defer. Forces the plan author to read the spec phrase-by-phrase.

The current free-form "Manual UI / E2E smoke" section is replaced by an **Acceptance stage** subsection that explicitly forbids self-waiving and requires the report file to exist.

### 3. Workflow-doc and ralph-prompt edits

- `docs/AUTO-EXECUTION-WORKFLOW.md` — diagram grows to 4 stages; new "Layer 3.5 — Acceptance Stage" subsection; forbidden-shortcuts list gains three items (no self-waive, no presence-as-behavior, no unmarked stubs).
- `scripts/ralph-prompts/phase-N.md` — new Step 6 dispatches the Acceptance subagent and gates the checkbox flip on a green report. Existing steps renumber.
- New `scripts/ralph-prompts/_acceptance-stage.md` — single-source-of-truth prompt template the Acceptance subagent receives. Future phases reuse without copy-paste drift.
- `CLAUDE.md` — new standing rule #8: "Acceptance stage is non-optional. The orchestrator (not the implementer) flips the plan checkbox after Acceptance passes."

### 4. Tooling — `tauri-driver`

One-time setup script `scripts/setup-acceptance.ps1` installs `tauri-driver` (`cargo install tauri-driver`), downloads the matching `msedgedriver.exe`, and adds `webdriverio` + `@wdio/cli` as devDependencies. Documented in workflow doc.

### 5. Retroactive Phase 2 cleanup

Append five tasks to `docs/superpowers/plans/2026-05-03-phase2-sessions-dashboard.md` under a new "Phase 2 Addendum" heading. Each task uses the new tightened-template schema and gates on the Acceptance Stage:

| Task | Bug | One-line scope |
|---|---|---|
| **T2.14** | Bug 3 — undated timeline | Populate SQLite `started_at` from JSONL first-line timestamp for ENDED sessions; loader writes it; SessionCard renders non-empty timeAgo |
| **T2.15** | Bug 4 — session detail buttons | Add Rust IPC commands (`kill_session`, `spawn_claude_resume`, `spawn_claude_fork`, `open_path`, `open_in_vscode`, `archive_session`, `delete_session`, `unarchive_session`, `update_session_meta`) and wire `SessionInfoBar` `handleAction` |
| **T2.16** | Bug 5 — dashboard buttons | Wire `QuickActions` to reuse `session-actions.ts` from T2.15; New Session opens dialog (or marks `// TODO(Phase 4)` if dialog isn't built) |
| **T2.17** | Bug 1 — My View groups CRUD | New `GroupCRUDDialog` + store actions + SQLite `groups` table migration |
| **T2.18** | Bug 2 — Project view collapse | `useCollapseState` in `SessionListPanel` + group header click handler + localStorage persistence |

**Order:** T2.14 → T2.15 → T2.16 → T2.17 → T2.18. T2.16 reuses T2.15's `session-actions.ts`. T2.17 likely splits into 2–3 sub-tasks during plan writing.

**Phase 3 plan revision.** T2.15 + T2.17 pull Rust IPC and groups CRUD forward from Phase 3 into Phase 2 cleanup. The Phase 3 plan needs a revision pass to remove duplicate scope. This is itself a small follow-up task, not part of the cleanup tasks.

## Out of scope

- Rewriting committed Phase 2 verification reports (`feat(T2.10)` etc.).
- Retroactive Acceptance reports for T2.1–T2.13.
- Fixing `scripts/_test/helper.ps1` PrintWindow capture — `tauri-driver` replaces it; the broken script can be deleted during T2.18 cleanup.

## Risks

- **`tauri-driver` setup is non-trivial on Windows.** Edge WebDriver version must match installed Edge build. The setup script must handle version drift.
- **Plan files grow.** New typed verification schema roughly 1.7× the size. Tradeoff is far stricter completion semantics.
- **The "no self-waive" rule blocks on tooling failures.** Intentional — broken tooling becomes a Ness ping rather than a silent skip. Acceptable cost.

## Definition of "this design is delivered"

- `superpowers:writing-plans` produces an implementation plan covering: workflow-doc edits, ralph-prompt edits, `_acceptance-stage.md` template, `setup-acceptance.ps1`, `CLAUDE.md` rule #8, and the five Phase-2 cleanup tasks.
- The first task to run under the new workflow is one of T2.14–T2.18, exercising the Acceptance Stage end-to-end against a real fix.
