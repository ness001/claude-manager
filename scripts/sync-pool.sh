#!/usr/bin/env bash
# sync-pool.sh — Synchronize a git worktree to the latest working branch state.
# Adapted from CCSM project patterns for the Claude Manager auto-execution workflow.
#
# Usage: scripts/sync-pool.sh [branch] [--force]
#
# What it does:
#   1. git fetch origin
#   2. git reset --hard origin/<branch>
#   3. npm install
#   4. npm run build (if build script exists)
#   5. Marks worktree as synced via .pool-synced-at-<SHA> marker
#
# Idempotent: skips work if marker file matches current remote SHA.
# Safety: refuses to run if uncommitted changes exist (unless --force).

set -euo pipefail

BRANCH="${1:-master}"
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
  esac
done

# Must be inside a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "ERROR: not inside a git repository" >&2
  exit 1
fi

REMOTE_SHA=$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | awk '{print $1}')
if [[ -z "$REMOTE_SHA" ]]; then
  echo "ERROR: branch '$BRANCH' not found on origin" >&2
  exit 1
fi

MARKER=".pool-synced-at-${REMOTE_SHA:0:12}"

# Idempotent check — already synced to this SHA
if [[ -f "$MARKER" ]]; then
  echo "✓ Already synced to $BRANCH @ ${REMOTE_SHA:0:12}"
  exit 0
fi

# Safety: refuse if there are uncommitted changes
if ! $FORCE; then
  if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "ERROR: uncommitted changes detected. Use --force to override." >&2
    echo "  (This will discard all local changes!)" >&2
    exit 1
  fi
  # Check for untracked files in src directories
  UNTRACKED=$(git ls-files --others --exclude-standard -- src/ src-tauri/ tests/ 2>/dev/null | head -5)
  if [[ -n "$UNTRACKED" ]]; then
    echo "WARNING: untracked files in source directories:" >&2
    echo "$UNTRACKED" >&2
    echo "Use --force to override." >&2
    exit 1
  fi
fi

echo "→ Syncing to $BRANCH @ ${REMOTE_SHA:0:12}..."

# Fetch and reset
git fetch origin "$BRANCH" --quiet
git reset --hard "origin/$BRANCH" --quiet
git clean -fd --quiet

# Install dependencies
if [[ -f "package.json" ]]; then
  echo "→ Installing npm dependencies..."
  npm install --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund
fi

# Build if script exists
if [[ -f "package.json" ]] && node -e "const p=require('./package.json'); process.exit(p.scripts?.build ? 0 : 1)" 2>/dev/null; then
  echo "→ Running build..."
  npm run build --silent 2>/dev/null || npm run build
fi

# Rust check if Cargo.toml exists
if [[ -f "src-tauri/Cargo.toml" ]]; then
  echo "→ Checking Rust compilation..."
  (cd src-tauri && cargo check --quiet 2>/dev/null || cargo check)
fi

# Mark as synced — remove old markers first
rm -f .pool-synced-at-* 2>/dev/null || true
touch "$MARKER"

echo "✓ Synced to $BRANCH @ ${REMOTE_SHA:0:12}"
