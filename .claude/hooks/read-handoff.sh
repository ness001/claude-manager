#!/usr/bin/env bash
# SessionStart hook: print the handoff note to stdout so Claude Code injects it as context.
# Skip if the note is missing or older than 24 hours.

set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
NOTE="$PROJECT_DIR/.claude/handoff.md"

[ -f "$NOTE" ] || exit 0

# Age check: skip if older than 24h (86400s).
if [ "$(date +%s)" -gt "$(( $(date -r "$NOTE" +%s 2>/dev/null || echo 0) + 86400 ))" ]; then
  exit 0
fi

cat "$NOTE"
exit 0
