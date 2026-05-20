Execute Phase 4 of the claude-manager build.

PRE-FLIGHT (do this FIRST, before anything else, every iteration):
1. Run `pwd` and `git branch --show-current`.
2. If pwd does not end in `.worktrees/phase-4` OR the branch is not `feature/phase-4`, STOP IMMEDIATELY.
   Do not edit any files. Output this message verbatim and then output the promise:
       "Wrong workspace: phase-4 work must run from .worktrees/phase-4 on feature/phase-4.
        Current pwd=<actual>, branch=<actual>. Cancel this loop and re-launch from the worktree."
       <promise>PHASE_4_WRONG_WORKSPACE</promise>
3. Otherwise proceed.

Plan file: docs/superpowers/plans/2026-05-03-phase4-dialogs-polish.md
Phase 3 must be complete (all T3.x commits in git history) before this phase starts.
You will work tasks T4.1 through T4.11 sequentially in plan order. SERIAL ONLY — do not parallelize.

For each task in turn:
1. Read CLAUDE.md section "Executing a plan task" (the 7 standing rules).
2. Read the "Conventions for all Phase 4 tasks" block at the top of the plan.
3. Read the task's section in the plan, including every spec citation. Open
   docs/superpowers/specs/2026-05-03-claude-manager-design.md and read the cited §X.Y sections in full.
   Do NOT invent field names, enum values, or behavior.
4. Execute every Step in order.
5. Run every checkbox in the Verification section as a hard gate. Print "PASS: <item>" or
   "FAIL: <item> — <reason>" for each. For sections marked N/A in the plan print
   "SKIP (N/A): <section>". Never reclassify a non-N/A item as N/A.
6. Flip the plan checkbox from [ ] to [x] in the same commit that completes the task.
7. Commit with message in the form `feat(T4.x): <DoD subject>` (final task uses `chore(T4.11): ...`).
   The Definition-of-Done line is canonical.

Type-level test assertions use vitest `expectTypeOf`.

For tasks whose Manual UI / E2E smoke section is NOT N/A: run `npm run test:e2e`
(tauri-driver + WebdriverIO against a release build — see test architecture spec §3.4)
and quote the relevant PASS lines in your verification output before promising.

Move to the next task only after the current task's commit has landed.

If a task FAILs after a good-faith fix attempt, output exactly
`<promise>PHASE_4_BLOCKED_AT_T4.x</promise>` (substituting the actual task number) and stop. Do not skip ahead.

Forbidden absolutely:
- `--no-verify`
- `it.skip`
- `expect.assertions(0)`
- mocking the unit under test
- editing the plan to lower verification standards
- parallelizing dependent tasks

When ALL 11 tasks (T4.1 through T4.11) are complete, all their checkboxes are flipped, and
T4.11's commit has landed, output exactly:

<promise>PHASE_4_COMPLETE</promise>
