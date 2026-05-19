#!/usr/bin/env bash
# ralph-phase.sh — Prepare a phase worktree and print the Ralph-loop command to run.
#
# Usage: scripts/ralph-phase.sh <phase-number> [max-iterations]
#
# What it does:
#   1. Verifies scripts/ralph-prompts/phase-<N>.md exists
#   2. Creates .worktrees/phase-<N> on branch feature/phase-<N> if missing
#      (new branches are based on master)
#   3. Runs scripts/sync-pool.sh inside the worktree to install deps + build
#   4. Prints the cd + /ralph-loop:ralph-loop command to paste into your
#      Claude Code session (slash-commands cannot be invoked from a shell)

set -euo pipefail

phase="${1:?usage: ralph-phase.sh <phase-number> [max-iterations]}"
max="${2:-100}"
branch="feature/phase-${phase}"
wt_rel=".worktrees/phase-${phase}"
prompt_rel="scripts/ralph-prompts/phase-${phase}.md"

root="$(git rev-parse --show-toplevel)"
cd "$root"

[[ -f "$prompt_rel" ]] || { echo "ERROR: missing prompt file: $prompt_rel" >&2; exit 1; }

# Create the worktree if it isn't already registered
if git worktree list --porcelain | grep -qE "^branch refs/heads/${branch}$"; then
  echo "✓ Worktree for $branch already exists"
else
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    echo "→ Adding worktree for existing branch $branch at $wt_rel"
    git worktree add "$wt_rel" "$branch"
  else
    echo "→ Creating branch $branch (from master) and worktree at $wt_rel"
    git worktree add -b "$branch" "$wt_rel" master
  fi
fi

# sync-pool.sh requires the branch to exist on origin — publish if missing
if ! git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  echo "→ Publishing $branch to origin (sync-pool requires it)"
  git push -u origin "$branch"
fi

# Sync deps inside the worktree
abs_wt="$(cd "$wt_rel" && pwd)"
echo "→ Syncing $abs_wt"
( cd "$abs_wt" && "$root/scripts/sync-pool.sh" "$branch" )

cat <<EOF

═══════════════════════════════════════════════════════════
Worktree ready: $abs_wt
Branch:         $branch

Paste this into your Claude Code session to start the loop:

  cd "$abs_wt"
  /ralph-loop:ralph-loop "\$(cat $prompt_rel)" --completion-promise PHASE_${phase}_COMPLETE --max-iterations ${max}
═══════════════════════════════════════════════════════════
EOF
