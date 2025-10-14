# Kolibri Monitoring Setup

## 1. Overview
Kolibri exposes health and metrics endpoints designed for Prometheus/Grafana.  
This guide covers scraping configuration, alerting, and dashboards.

## 2. Endpoints
| Component | Endpoint | Description |
|-----------|----------|-------------|
| Kolibri Node | `kolibri_node --health` | JSON health status, exit code reflects genome integrity |
| Knowledge API | `http://<host>:8000/healthz` | Health probe with document count |
| Knowledge API | `http://<host>:8000/metrics` | Prometheus metrics (requests, hits/misses, docs) |
| Frontend | `http://<host>/healthz` | Basic availability probe |

### Metrics exposed (knowledge API)
- `kolibri_knowledge_documents` (gauge) — number of indexed documents.
- `kolibri_requests_total` (counter) — HTTP requests handled.
- `kolibri_search_hits_success` (counter) — queries returning at least one result.
- `kolibri_search_misses_total` (counter) — queries without results.
- `kolibri_bootstrap_generated_unixtime` (gauge) — timestamp of last bootstrap script generation.

## 3. Prometheus Scrape Config
```yaml
scrape_configs:
  - job_name: kolibri-knowledge
    metrics_path: /metrics
    static_configs:
      - targets: ['kolibri-backend:8000']

  - job_name: kolibri-node-health
    metrics_path: /health
    static_configs:
      - targets: ['kolibri-node:4050']
```
For `kolibri_node --health`, use the Prometheus `blackbox_exporter` or a custom exporter to interpret the JSON output.

## 4. Grafana Dashboard
- Import `deploy/monitoring/grafana_dashboard.json`.
- Key panels:
  - Total documents vs. target.
  - Search hits/misses (rate over 5 minutes).
  - Health status heatmap for nodes.
  - Alerts for stale bootstrap (`now - kolibri_bootstrap_generated_unixtime`).

## 5. Alerting Suggestions
- **Knowledge index stale**: difference between current time and `kolibri_bootstrap_generated_unixtime` > 24h.
- **Search miss spike**: increase of `kolibri_search_misses_total` rate > threshold.
- **Genome corruption**: `kolibri_node --health` exit code ≠ 0 (use exec probes or custom exporter).

## 6. Logging
- Kolibri writes JSONL into `logs/kolibri.jsonl`. Use Loki/Fluent Bit for ingestion.
- Recommended labels: `service`, `node_id`, `severity`.

## 7. Next Steps
- Integrate runbooks from `docs/service_playbook.md`.
- Extend dashboards with business metrics (requests per knowledge category).
- Automate health aggregation via `/metrics` + on-call notifications.
