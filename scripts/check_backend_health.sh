#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METRICS_FILE="${1:-$REPO_ROOT/logs/kolibri_metrics.prom}"
MAX_AGE_SECONDS="${HEALTHCHECK_MAX_AGE:-300}"

if [[ ! -f "$METRICS_FILE" ]]; then
  echo "ERROR: metrics file '$METRICS_FILE' not found" >&2
  exit 1
fi

# Resolve file mtime for Linux (GNU stat) and macOS (BSD stat).
if stat --version >/dev/null 2>&1; then
  MODIFIED_AT=$(stat -c %Y "$METRICS_FILE")
else
  MODIFIED_AT=$(stat -f %m "$METRICS_FILE")
fi
NOW=$(date +%s)
AGE=$((NOW - MODIFIED_AT))

if (( AGE > MAX_AGE_SECONDS )); then
  echo "ERROR: metrics file is stale (age ${AGE}s > ${MAX_AGE_SECONDS}s)" >&2
  exit 2
fi

if ! grep -q "kolibri_operation_latency_seconds_count" "$METRICS_FILE"; then
  echo "ERROR: latency counter missing from metrics output" >&2
  exit 3
fi

if ! grep -q "kolibri_operation_errors_total" "$METRICS_FILE"; then
  echo "ERROR: error counter missing from metrics output" >&2
  exit 4
fi

echo "OK: backend metrics available (age ${AGE}s)"
