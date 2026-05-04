#!/usr/bin/env bash
# Emit a ralph-loop prompt for a single plan task.
#
# Usage:
#   /ralph-loop:ralph-loop "$(scripts/ralph-task.sh T2.1)" --completion-promise "T2.1_DONE" --max-iterations 25
#
# The prompt body is intentionally small. Standing rules live in:
#   - CLAUDE.md → "Executing a plan task"
#   - docs/superpowers/plans/<phase>.md → "Conventions for all Phase N tasks"

set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "usage: $0 <task-id>   e.g. T2.1" >&2
  exit 1
fi

if [[ ! "$TASK_ID" =~ ^T([0-9]+)\.([0-9]+)$ ]]; then
  echo "error: task id must look like T<phase>.<num> (got: $TASK_ID)" >&2
  exit 1
fi

PHASE="${BASH_REMATCH[1]}"

# Resolve the plan file for this phase (glob expands at runtime).
PLAN_GLOB="docs/superpowers/plans/2026-05-03-phase${PHASE}-*.md"
PLAN_FILE=$(ls $PLAN_GLOB 2>/dev/null | head -n 1)
if [[ -z "$PLAN_FILE" ]]; then
  echo "error: no plan file matching $PLAN_GLOB" >&2
  exit 1
fi

cat <<EOF
Execute task [${TASK_ID}] from ${PLAN_FILE}.

Process:
1. Read CLAUDE.md (section "Executing a plan task") and the phase plan's "Conventions for all Phase ${PHASE} tasks" section. These are the standing rules — do not violate them.
2. Read the [${TASK_ID}] section in ${PLAN_FILE}. For every spec citation (e.g. §5.1) read those sections in docs/superpowers/specs/2026-05-03-claude-manager-design.md before writing any code.
3. Execute every Step in order, including the commit step.
4. Run every checkbox in the task's Verification section. For each item:
   - print "PASS: <item>" or "FAIL: <item> — <reason>"
   - if a section is marked N/A in the plan, print "SKIP (N/A): <section>" and move on
   - never re-classify a non-N/A item as N/A
5. Verify every Definition of Done item is satisfied (incl. plan checkbox flipped from [ ] to [x], commit message uses feat(${TASK_ID}): prefix).
6. If all items PASS or are correctly SKIPPED, output exactly:
   <promise>${TASK_ID}_DONE</promise>
   Otherwise, fix and re-run from step 4.

Forbidden:
- Skipping hooks (--no-verify), it.skip, expect.assertions(0), or any other test bypass
- Editing ${PLAN_FILE} to lower verification standards (you may only flip the [ ] → [x] checkbox)
- Inventing field names, enum values, or behavior not present in the cited spec sections
- Mocking the unit under test
EOF
