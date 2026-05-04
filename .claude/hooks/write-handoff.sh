#!/usr/bin/env bash
# SessionEnd hook: write a handoff note so the next session can pick up where this one left off.
# Reads JSON event payload from stdin (we only need transcript_path).

set -u

# Resolve project dir; CLAUDE_PROJECT_DIR is set by Claude Code for hooks.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
OUT="$PROJECT_DIR/.claude/handoff.md"

# Pull transcript_path out of the JSON on stdin (best-effort, no jq dependency).
PAYLOAD="$(cat || true)"
TRANSCRIPT="$(printf '%s' "$PAYLOAD" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"

cd "$PROJECT_DIR" || exit 0

{
  echo "# Session handoff"
  echo
  echo "_Written $(date -u +'%Y-%m-%dT%H:%M:%SZ') by SessionEnd hook._"
  echo
  echo "## Git"
  echo
  echo "- Branch: \`$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')\`"
  echo "- HEAD: \`$(git log -1 --pretty='%h %s' 2>/dev/null || echo '?')\`"
  echo
  echo "### Status"
  echo
  echo '```'
  git status --short 2>/dev/null || echo '(git status unavailable)'
  echo '```'
  echo
  echo "### Recent commits"
  echo
  echo '```'
  git log -5 --pretty='%h %s' 2>/dev/null || echo '(git log unavailable)'
  echo '```'

  if [ -n "${TRANSCRIPT:-}" ] && [ -f "$TRANSCRIPT" ]; then
    echo
    echo "## Last user message"
    echo
    # Grab the last user-role message text from the JSONL transcript.
    LAST_USER="$(grep '"role":"user"' "$TRANSCRIPT" 2>/dev/null \
      | tail -n1 \
      | sed -n 's/.*"content"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
      | head -c 1000)"
    if [ -n "$LAST_USER" ]; then
      echo '```'
      printf '%s\n' "$LAST_USER"
      echo '```'
    else
      echo "_(could not extract last user message from transcript)_"
    fi
  fi
} > "$OUT" 2>/dev/null

exit 0
