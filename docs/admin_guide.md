# Kolibri Administrator Guide / Руководство администратора Kolibri

## 1. Scope / Область применения

This guide targets operations engineers responsible for running Kolibri in
production. It covers environment preparation, configuration management, and
operational procedures.

Документ описывает требования к эксплуатации Kolibri в продакшне: подготовка
окружения, управление конфигурациями и операционные процедуры.

## 2. System Architecture / Архитектура системы

- **Frontend**: Static React app served by Nginx, consumes wasm bridge for
  KolibriScript execution.
- **Backend node (`kolibri_node`)**: Handles KolibriScript runtime, genome
  evolution, and network replication.
- **Knowledge indexer**: Builds TF-IDF snapshots from documentation.
- **Persistent storage**: `/var/lib/kolibri` holds genomes, knowledge index,
  and telemetry logs.

## 3. Configuration / Конфигурация

| Component | Config location | Notes |
|-----------|-----------------|-------|
| Backend node | `/etc/kolibri/node.env` | Environment variables (`KOLIBRI_REPL`, `KOLIBRI_TRACE`) |
| Knowledge index | `/etc/kolibri/indexer.yml` | Roots to crawl, freshness policy |
| Frontend | `/etc/kolibri/frontend.json` | Feature toggles, branding |

Reload services after applying updates: `docker restart kolibri-backend`.

## 4. Operations / Операции

### Backups / Резервные копии
- Snapshot `/var/lib/kolibri/genome.dat`, `/var/lib/kolibri/knowledge/` nightly.
- Store JSON traces from `logs/kolibri.jsonl` for auditing.
- Use object storage with 30-day retention and weekly integrity checks.

### Logging / Логирование
- Backend logs stream to STDOUT; capture via `docker logs` or forward to ELK/Vector.
- Frontend access logs are enabled in Nginx (`/var/log/nginx/access.log`).
- Enable structured tracing by setting `KOLIBRI_TRACE=1`, storing output at
  `/var/lib/kolibri/traces/trace-<timestamp>.jsonl`.

### Genome Updates / Обновление генома
- New genomes ship with each release; production nodes validate checksums before
  activation.
- To roll back, restore previous `genome.dat` and restart the backend container.
- Track genome hash via `kolibri_node --verify-genome`.

### Recovery / Восстановление
- If backend fails to start, inspect `/var/log/kolibri/backend.log` for diagnostics.
- Re-create containers from manifests using `deploy/release-manifests`.
- For data loss, restore latest backup and re-run knowledge pipeline to rebuild
  index.

### Integrations / Интеграции
- Kafka sink: configure `KOLIBRI_METRICS_KAFKA_BROKER` to publish evolution metrics.
- Prometheus exporter: enable `--listen-metrics 9100` flag (experimental) and
  scrape `http://node:9100/metrics`.
- Webhooks: `kolibri_node` emits POST notifications for new associations when
  `KOLIBRI_WEBHOOK_URL` is set.

## 5. Maintenance Windows / Обслуживание

- Schedule minor upgrades monthly, major upgrades quarterly.
- Notify users 48 hours in advance; use maintenance mode banner in frontend
  (`frontend.json` → `"maintenance": true`).
- Validate replication health before and after maintenance.

## 6. Runbooks / Инструкции

- **High latency**: capture `/var/lib/kolibri/traces/latest.jsonl`, verify CPU/RAM
  usage, scale nodes horizontally.
- **Knowledge drift**: re-run `kolibri_indexer build` with updated documentation,
  redeploy snapshot, notify moderators.
- **Network partition**: check `kolibri_node --peer-status`, restart peers, review
  firewall rules.

## 7. Contacts / Контакты

- Ops on-call: `oncall@kolibri.example` (24/7, SLA 1 hour).
- Escalation: `head.of.ops@kolibri.example`.

