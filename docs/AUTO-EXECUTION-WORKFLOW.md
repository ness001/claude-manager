# Auto-Execution Workflow

A 5-layer pipeline for autonomous, high-quality implementation of the Claude Manager project.

```
┌─────────────────────────────────────────────────────────────────────┐
│  spec (brainstorming)                                               │
│  └─→ DAG task decomposition (level / blockedBy)                     │
│       └─→ subagent-driven-development (3-stage review per task)     │
│            └─→ ralph loop (retry until all tasks pass)              │
│                 └─→ auto PR (push + create/update PR)               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Spec → Plans (already complete)

**Tool:** `superpowers:brainstorming` → `superpowers:writing-plans`

The brainstorming skill produces a formal spec, then `writing-plans` converts it into step-by-step implementation plans with TDD, exact file paths, code blocks, and commit points.

**Output:** 4 phase plans in `docs/superpowers/plans/`:
- Phase 1: Foundation (8 tasks) — Tauri scaffold, theme, nav, sidebar, SQLite
- Phase 2: Sessions & Dashboard (13 tasks) — JSONL parsing, session list, conversation viewer, dashboard
- Phase 3: Plugins, Skills & MCP (13 tasks) — Plugin/skill/MCP loader, stores, UI
- Phase 4: Dialogs & Polish (11 tasks) — New session dialog, PTY, command palette, settings, first launch

**Status:** Done. Plans were Karpathy-reviewed and self-reviewed.

---

## Layer 2: DAG Task Decomposition

**What:** Convert linear plan tasks into a directed acyclic graph with explicit dependency tracking.

**Format** (YAML, one file per phase in `docs/superpowers/specs/_dag-extract/`):

```yaml
- subject: "[T1.1] scaffold Tauri v2 + React 19 + Vite project"
  level: 0
  blockedBy: []
  notes: "Phase 1, Task 1 — npm create tauri-app, package.json, ..."

- subject: "[T1.2] Tailwind CSS v4 + theme system"
  level: 1
  blockedBy: ["[T1.1] scaffold Tauri v2 + React 19 + Vite project"]
  notes: "Phase 1, Task 2 — ..."
```

**Key fields:**
- `level`: Execution order. Level 0 tasks run first. Same-level tasks with no mutual dependencies can run in parallel.
- `blockedBy`: List of task subjects that must complete before this task can start.
- `notes`: Cross-reference back to the plan (phase + task number).

**Files:**
- `docs/superpowers/specs/_dag-extract/phase1-foundation.yaml` — 8 tasks, levels 0-2
- `docs/superpowers/specs/_dag-extract/phase2-sessions-dashboard.yaml` — 13 tasks, levels 0-4
- `docs/superpowers/specs/_dag-extract/phase3-plugins-skills-mcp.yaml` — 13 tasks, levels 0-4
- `docs/superpowers/specs/_dag-extract/phase4-dialogs-polish.yaml` — 11 tasks, levels 0-5

**Why DAG?** Linear plans force sequential execution even when tasks are independent. The DAG enables:
- Parallel worktree execution of same-level tasks (future optimization)
- Clear dependency tracking so agents know what's safe to start
- Level-based progress reporting ("Phase 1: L0 done, L1 in progress")

---

## Layer 3: Subagent-Driven Development (3-stage review)

**Tool:** `superpowers:subagent-driven-development` (already installed)

For each task in the DAG:

```
┌────────────────────────┐
│  Stage 1: Implement    │  Fresh subagent reads the plan task,
│  (Implementer Agent)   │  writes code following TDD steps
├────────────────────────┤
│  Stage 2: Spec Review  │  Fresh subagent compares implementation
│  (Reviewer Agent)      │  against the spec — catches missed requirements
├────────────────────────┤
│  Stage 3: Quality      │  Fresh subagent reviews code quality,
│  (Quality Agent)       │  patterns, tests — catches bugs and style issues
└────────────────────────┘
```

Each stage uses a **fresh subagent** (clean context, no accumulated assumptions). The orchestrator reads review feedback and either approves or sends back for fixes.

**Why 3 stages?** Single-pass implementation has a high defect rate when context is large. The spec reviewer catches "forgot to handle X" errors. The quality reviewer catches "this pattern doesn't match the rest of the codebase" errors.

---

## Layer 4: Ralph Loop (persistence/retry)

**Tool:** `ralph-loop` plugin (already installed as a Claude Code plugin)

Ralph loop is a **Stop hook** that prevents Claude from exiting until work is complete. It:
1. Creates a state file at `.claude/ralph-loop.local.md` with YAML frontmatter
2. Intercepts the Stop event (exit code 2 = block)
3. Reads the last assistant message from the transcript JSONL
4. Checks for `<promise>TEXT</promise>` completion tags
5. If not complete: increments iteration counter, re-feeds the prompt
6. If complete (or max iterations reached): allows exit

**State file format:**
```markdown
---
active: true
iteration: 3
max_iterations: 50
completion_promise: "PHASE 1 COMPLETE"
---

[The full prompt that gets re-fed each iteration]
```

**How to use:**
```bash
# In a Claude Code session, inside the claude-manager directory:
/ralph-loop:ralph-loop "Read docs/superpowers/plans/2026-05-03-phase1-foundation.md and implement all tasks using superpowers:subagent-driven-development. When ALL tasks are done and tests pass: <promise>PHASE 1 COMPLETE</promise>" --max-iterations 50 --completion-promise "PHASE 1 COMPLETE"
```

**Why ralph loop?** Claude Code sessions have context limits. When context fills up, the session compresses and continues. Ralph loop ensures that even across context resets, the agent picks up where it left off by:
- Re-feeding the full prompt (which includes "read the plan and check what's done")
- The plan files have `- [ ]` / `- [x]` checkboxes that persist progress
- Each iteration reads current state from disk, not from conversation history

**Two ralph implementations available:**
1. **ralph-loop plugin** (recommended) — In-session Stop hook. No new process. State persists in `.claude/ralph-loop.local.md`. Activated via `/ralph-loop:ralph-loop` command.
2. **ralph-marketplace** — External bash loop that spawns fresh `claude --print` processes per iteration. Uses `prd.json` format. Good for headless/CI use.

---

## Layer 5: Auto PR Lifecycle

**Tool:** `scripts/auto-pr.sh` (custom script)

After all tasks in a phase complete:
1. Push the branch to origin
2. Create a PR with phase-specific title and body
3. Reference the plan file, DAG, and spec in the PR description
4. Include verification checklist (tests, Rust check, dev build)

**Usage:**
```bash
scripts/auto-pr.sh 1            # Create PR for Phase 1
scripts/auto-pr.sh 2 --base master  # Create PR for Phase 2 against master
```

If a PR already exists for the branch, it updates the existing PR instead of creating a duplicate.

---

## Worktree Synchronization

**Tool:** `scripts/sync-pool.sh` (custom script)

When using multiple worktrees for parallel task execution:
```bash
scripts/sync-pool.sh master         # Sync worktree to latest master
scripts/sync-pool.sh master --force # Override uncommitted changes
```

Features:
- **Idempotent:** `.pool-synced-at-<SHA>` marker files prevent redundant work
- **Safe:** Refuses to run with uncommitted changes unless `--force`
- **Full sync:** git fetch → reset → npm install → build → cargo check

---

## Complete Execution Flow

### Per-phase execution:

```
1. cd C:\Users\lianli\claude-manager
2. git checkout -b phase-1-foundation  (or reuse existing branch)
3. claude --dangerously-skip-permissions

4. /ralph-loop:ralph-loop "<prompt>" --max-iterations 50 --completion-promise "PHASE 1 COMPLETE"
   │
   ├─ Iteration 1:
   │   ├─ Read plan → find first unchecked task
   │   ├─ Invoke superpowers:subagent-driven-development
   │   │   ├─ Implementer subagent → writes code + tests
   │   │   ├─ Spec reviewer subagent → checks against spec
   │   │   └─ Quality reviewer subagent → checks patterns + quality
   │   ├─ Mark task checkbox [x] in plan file
   │   ├─ git commit
   │   └─ Check: all tasks done? → No → context fills up → compress → re-feed
   │
   ├─ Iteration 2:
   │   ├─ Read plan → checkboxes show progress → skip done tasks
   │   ├─ Continue with next unchecked task
   │   └─ ... (repeat)
   │
   └─ Iteration N:
       ├─ All tasks checked
       ├─ Run unit tests (vitest run) — fix failures before proceeding
       ├─ Run Rust check (cargo check) — fix failures before proceeding
       ├─ Run E2E/UI verification (npx tauri dev — app launches, sections render, interactions work)
       ├─ Fix any failures, re-run ALL tests
       ├─ Run scripts/auto-pr.sh to push + create PR
       ├─ Output: <promise>PHASE 1 COMPLETE</promise>
       └─ Ralph loop detects promise → allows exit

5. Repeat for Phase 2, 3, 4 (fully automatic per phase)
```

### Multi-phase orchestration:

Phases are **sequential** (Phase 2 depends on Phase 1 output). Run them one at a time:

```bash
# Phase 1
git checkout -b phase-1-foundation
claude --dangerously-skip-permissions
# Inside the session (auto-PR is included in the prompt):
/ralph-loop:ralph-loop "..." --completion-promise "PHASE 1 COMPLETE"
# → session auto-creates PR, then exits

# Phase 2
git checkout master && git pull
git checkout -b phase-2-sessions
scripts/sync-pool.sh master
claude --dangerously-skip-permissions
/ralph-loop:ralph-loop "..." --completion-promise "PHASE 2 COMPLETE"
# → session auto-creates PR, then exits

# Phase 3, 4 follow the same pattern
```

---

## Existing Tools (no gaps to fill)

| Component | Source | Status |
|-----------|--------|--------|
| `superpowers:brainstorming` | superpowers plugin v5.0.7 | Installed |
| `superpowers:writing-plans` | superpowers plugin v5.0.7 | Installed |
| `superpowers:subagent-driven-development` | superpowers plugin v5.0.7 | Installed |
| `superpowers:executing-plans` | superpowers plugin v5.0.7 | Installed |
| `superpowers:verification-before-completion` | superpowers plugin v5.0.7 | Installed |
| `superpowers:test-driven-development` | superpowers plugin v5.0.7 | Installed |
| `superpowers:using-git-worktrees` | superpowers plugin v5.0.7 | Installed |
| `superpowers:finishing-a-development-branch` | superpowers plugin v5.0.7 | Installed |
| `ralph-loop` | ralph-loop plugin | Installed |
| `ralph` (external loop) | ralph-marketplace plugin | Installed |

## Custom Scripts (created for this workflow)

| Script | Purpose |
|--------|---------|
| `scripts/sync-pool.sh` | Synchronize git worktree to latest branch state |
| `scripts/auto-pr.sh` | Create/update PR after phase completion |

## DAG Files (created for this workflow)

| File | Tasks | Levels |
|------|-------|--------|
| `docs/superpowers/specs/_dag-extract/phase1-foundation.yaml` | 8 | 0-2 |
| `docs/superpowers/specs/_dag-extract/phase2-sessions-dashboard.yaml` | 13 | 0-4 |
| `docs/superpowers/specs/_dag-extract/phase3-plugins-skills-mcp.yaml` | 13 | 0-4 |
| `docs/superpowers/specs/_dag-extract/phase4-dialogs-polish.yaml` | 11 | 0-5 |
| **Total** | **45** | |

---

## Ralph Loop Prompt Template

Use this template for each phase's ralph-loop invocation:

```
You are implementing Phase N of the Claude Manager project.

1. Read the implementation plan: docs/superpowers/plans/2026-05-03-phaseN-*.md
2. Read the spec: docs/superpowers/specs/2026-05-03-claude-manager-design.md
3. Read the DAG: docs/superpowers/specs/_dag-extract/phaseN-*.yaml
4. Check which tasks have [x] (completed) vs [ ] (pending) in the plan
5. Pick the next uncompleted task (respect DAG level ordering)
6. Invoke superpowers:subagent-driven-development to implement it
7. After implementation + review, mark the task checkbox as [x]
8. git commit with message: feat: [Task ID] - [Task Subject]
9. Repeat until all tasks are complete

When ALL tasks are checked [x]:
10. Run all tests:
    - Unit tests: npx vitest run
    - Rust compilation: cd src-tauri && cargo check && cd ..
    - Integration/E2E: npx tauri dev (verify app launches, navigate all sections, test key interactions)
    - UI verification: use browser tools if available to screenshot and validate UI renders correctly
11. If any test fails, fix the issue, re-run ALL tests, and commit the fix before proceeding
12. Push branch and create PR: bash scripts/auto-pr.sh N
13. Output: <promise>PHASE N COMPLETE</promise>

Do NOT output the promise until ALL tests (unit + integration + E2E) pass AND the PR has been created.
```

Replace `N` with the phase number (1-4) and adjust the plan filename accordingly.
