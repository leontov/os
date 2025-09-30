# Operations and Observability Guide

This runbook documents how to monitor Kolibri end to end: backend binaries export Prometheus-ready metrics, the web frontend emits privacy-aware usage traces, and health checks verify both halves of the stack before deploying.

## Backend telemetry

The C backend now links against a lightweight telemetry layer (`backend/src/telemetry.c`) that records latency and error counts for critical code paths such as:

- `node.teach`, `node.ask`, `node.tick`, `node.share`
- genome writes (`genome.append`)
- network helpers (`net.share_formula`, listener polls)

Metrics are flushed to `logs/kolibri_metrics.prom` in the Prometheus textfile format each time a span completes. The exporter exposes three metric families:

| Metric | Type | Description |
| ------ | ---- | ----------- |
| `kolibri_operation_latency_seconds_*` | summary | Count / sum / max latency per operation |
| `kolibri_operation_errors_total` | counter | Number of failed executions per operation |
| `kolibri_operation_trace_hash` | gauge | FNV-1a hash of the most recent trace hint that touched the operation |

The trace hash allows correlation with frontend events without storing raw prompts. The hash is computed over UTF-8 bytes of the original command and truncated to 32 bits; collisions are possible but rare in practice.

### Prometheus integration

The metrics file is intended to be scraped via the Node Exporter textfile collector. Example configuration:

```yaml
scrape_configs:
  - job_name: kolibri-node
    static_configs:
      - targets: ['127.0.0.1:9100']
    params:
      collect[]: [textfile]
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'node_textfile_scrape_error'
        action: drop
```

Point the textfile collector at the repository `logs/` directory, e.g. `--collector.textfile.directory=/opt/kolibri/logs`. Dashboards can then chart:

- Latency percentiles (`*_sum` / `*_count`) split by operation.
- Error totals over time for `node.ask` and `net.share_formula` to catch routing failures.
- The latest `kolibri_operation_trace_hash` as a table to line up with frontend traces.

### Grafana dashboards

Recommended panels:

1. **Operation latency heatmap** – query `rate(kolibri_operation_latency_seconds_sum[5m]) / rate(kolibri_operation_latency_seconds_count[5m])` per `operation`.
2. **Error rate** – `increase(kolibri_operation_errors_total[15m])` stacked by operation.
3. **Trace hash inspector** – `kolibri_operation_trace_hash` in a table to spot the most recent hashed user flow touching each subsystem.

## Frontend telemetry

`frontend/src/core/telemetry.ts` introduces a small telemetry client that:

- Generates a browser session ID and action-specific trace IDs.
- Computes the same 32-bit FNV-1a hash as the backend when given a `traceHint` (the raw prompt is discarded after hashing).
- Restricts metadata to whitelisted keys (`mode`, `reason`, error details) and trims strings to avoid logging user content.
- Dispatches JSON envelopes via `navigator.sendBeacon` to `VITE_TELEMETRY_ENDPOINT` (or logs to the console when unset).

`App.tsx` wires the client into key user flows:

- `chat.ask` spans wrap question/answer cycles and report input/output lengths.
- `chat.reset`, `chat.mode_change`, and suggestion clicks emit lightweight events.
- Bridge initialisation is timed via the `bridge.init` span and reported even when the component unmounts mid-flight.

Sample payload:

```json
{
  "type": "trace",
  "action": "chat.ask",
  "status": "success",
  "durationMs": 128.4,
  "metadata": { "inputLength": 12, "mode": "Быстрый ответ", "outputLength": 48 },
  "sessionId": "f1b9e1c2-…",
  "traceId": "6f5c…",
  "traceHash": 2813436629,
  "timestamp": "2025-02-12T09:15:27.123Z"
}
```

The `traceHash` matches the backend gauge, enabling Grafana to join client and server perspectives.

## Health checks

Two scripts live under `scripts/` for deployment automation:

| Script | Purpose |
| ------ | ------- |
| `check_backend_health.sh` | Verifies that `logs/kolibri_metrics.prom` exists, is fresh (`<HEALTHCHECK_MAX_AGE>` seconds old), and contains the expected metric families. Exits non-zero when telemetry is stale. |
| `check_frontend_health.sh` | Ensures the frontend can lint and build; installs dependencies on first run, executes `npm run lint` and `npm run build`, and fails fast on any error. |

Invoke them from CI/CD pipelines before promoting a build. Example:

```bash
scripts/check_backend_health.sh /opt/kolibri/logs/kolibri_metrics.prom
scripts/check_frontend_health.sh
```

## Troubleshooting

- **Metrics file missing** – confirm `kolibri_node` starts successfully; telemetry initialisation will log `[Телеметрия]` failures to stderr.
- **Trace hash mismatch** – verify the telemetry collector respects UTF-8 encoding and that the frontend `traceHint` was supplied (e.g. the user must issue a `:ask` command).
- **Frontend telemetry not arriving** – check `VITE_TELEMETRY_ENDPOINT` is set in the deployment environment. When unset, events fall back to `console.debug`.
