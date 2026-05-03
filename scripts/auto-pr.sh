#!/usr/bin/env bash
# auto-pr.sh — Create or update a PR for autoexecution phase completion.
#
# Usage: scripts/auto-pr.sh <phase-number> [--base <branch>]
#
# What it does:
#   1. Detects the current branch name
#   2. Pushes to origin
#   3. Creates a PR (or updates existing) with phase-specific title/body
#   4. Optionally sets auto-merge if all checks pass
#
# Requires: gh CLI authenticated

set -euo pipefail

PHASE="${1:?Usage: auto-pr.sh <phase-number> [--base <branch>]}"
BASE_BRANCH="master"

# Parse optional args
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_BRANCH="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Phase metadata
declare -A PHASE_NAMES=(
  [1]="Foundation"
  [2]="Sessions & Dashboard"
  [3]="Plugins, Skills & MCP Servers"
  [4]="Dialogs & Polish"
)

declare -A PHASE_TASKS=(
  [1]="8"
  [2]="13"
  [3]="13"
  [4]="11"
)

PHASE_NAME="${PHASE_NAMES[$PHASE]:-Phase $PHASE}"
TASK_COUNT="${PHASE_TASKS[$PHASE]:-?}"

CURRENT_BRANCH=$(git branch --show-current)
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "ERROR: not on a branch (detached HEAD?)" >&2
  exit 1
fi

echo "→ Pushing $CURRENT_BRANCH to origin..."
git push -u origin "$CURRENT_BRANCH" 2>/dev/null || git push -u origin "$CURRENT_BRANCH"

# Check if PR already exists
EXISTING_PR=$(gh pr list --head "$CURRENT_BRANCH" --base "$BASE_BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)

PR_TITLE="feat: Phase $PHASE — $PHASE_NAME"
PR_BODY="## Phase $PHASE: $PHASE_NAME

### Summary
Implements all $TASK_COUNT tasks from Phase $PHASE of the Claude Manager implementation plan.

### Plan Reference
- Plan file: \`docs/superpowers/plans/2026-05-03-phase${PHASE}-*.md\`
- DAG: \`docs/superpowers/specs/_dag-extract/phase${PHASE}-*.yaml\`
- Spec: \`docs/superpowers/specs/2026-05-03-claude-manager-design.md\`

### Verification
- [ ] All vitest tests pass (\`npx vitest run\`)
- [ ] Rust compiles clean (\`cd src-tauri && cargo check\`)
- [ ] Dev build runs (\`npx tauri dev\`)

### Auto-Execution
This PR was created by the auto-execution workflow:
\`\`\`
spec → DAG task decomposition → subagent-driven-development → ralph loop → auto PR
\`\`\`
"

if [[ -n "$EXISTING_PR" && "$EXISTING_PR" != "null" ]]; then
  echo "→ Updating existing PR #$EXISTING_PR..."
  gh pr edit "$EXISTING_PR" --title "$PR_TITLE" --body "$PR_BODY"
  echo "✓ PR #$EXISTING_PR updated: $(gh pr view "$EXISTING_PR" --json url --jq '.url')"
else
  echo "→ Creating PR..."
  PR_URL=$(gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base "$BASE_BRANCH" \
    --head "$CURRENT_BRANCH" \
    2>&1)
  echo "✓ PR created: $PR_URL"
fi
