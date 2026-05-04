Execute Phase 2 of the claude-manager build.

Plan file: docs/superpowers/plans/2026-05-03-phase2-sessions-dashboard.md
T2.1 is already complete (commit feat(T2.1) is in git history).
You will work tasks T2.2 through T2.13 sequentially in plan order. SERIAL ONLY — do not parallelize.

For each task in turn:
1. Read CLAUDE.md section "Executing a plan task" (the 7 standing rules).
2. Read the "Conventions for all Phase 2 tasks" block at the top of the plan.
3. Read the task's section in the plan, including every spec citation. Open
   docs/superpowers/specs/2026-05-03-claude-manager-design.md and read the cited §X.Y sections in full.
   Do NOT invent field names, enum values, or behavior.
4. Execute every Step in order.
5. Run every checkbox in the Verification section as a hard gate. Print "PASS: <item>" or
   "FAIL: <item> — <reason>" for each. For sections marked N/A in the plan print
   "SKIP (N/A): <section>". Never reclassify a non-N/A item as N/A.
6. Flip the plan checkbox from [ ] to [x] in the same commit that completes the task.
7. Commit with message in the form `feat(T2.x): <DoD subject>`. The Definition-of-Done line is canonical.

Type-level test assertions use vitest `expectTypeOf`.

For tasks whose Manual UI / E2E smoke section is NOT N/A: run `npx tauri dev` (or `cargo build` + launch),
capture screenshots via `scripts/_test/helper.ps1`, and embed screenshot file paths in your verification output
before promising.

Move to the next task only after the current task's commit has landed.

If a task FAILs after a good-faith fix attempt, output exactly
`<promise>PHASE_2_BLOCKED_AT_T2.x</promise>` (substituting the actual task number) and stop. Do not skip ahead.

Forbidden absolutely:
- `--no-verify`
- `it.skip`
- `expect.assertions(0)`
- mocking the unit under test
- editing the plan to lower verification standards
- parallelizing dependent tasks

When ALL 12 remaining tasks (T2.2 through T2.13) are complete, all their checkboxes are flipped, and
T2.13's commit has landed, output exactly:

<promise>PHASE_2_COMPLETE</promise>
