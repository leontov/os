#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "ERROR: frontend directory not found at $FRONTEND_DIR" >&2
  exit 1
fi

cd "$FRONTEND_DIR"

if [[ ! -d node_modules ]]; then
  echo "Installing frontend dependencies…" >&2
  npm install >/dev/null
fi

echo "Running frontend lint…" >&2
npm run lint

echo "Building production bundle…" >&2
npm run build

echo "OK: frontend lint and build succeeded"
