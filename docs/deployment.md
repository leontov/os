# Kolibri Deployment Guide / Руководство по развёртыванию Kolibri

## 1. Поддерживаемые топологии
- **Single-node**: разработка и тестирование, Docker Compose.
- **Clustered**: 3+ узла KolibriNode с отдельными службами знаний и фронтендом.
- **Managed** (план): управляемое предложение на базе партнёрского облака.

## 2. Минимальные требования
| Компонент | CPU | RAM | Диск | Примечания |
|-----------|-----|-----|------|-----------|
| KolibriNode | 4 vCPU | 8 GB | 20 GB SSD | Linux x86_64, Docker Engine 24+, OpenSSL 3 |
| Knowledge Indexer | 2 vCPU | 4 GB | 10 GB | fast I/O для обработки Markdown |
| Frontend | 1 vCPU | 2 GB | 5 GB | Nginx или CDN |
| Observability stack | 2 vCPU | 4 GB | 20 GB | Prometheus + Loki |

## 3. Быстрый старт (Docker Compose)
1. Скопируйте `deploy/docker-compose.yml` (см. репозиторий).
2. Подготовьте `.env`:
   ```bash
   KOLIBRI_LICENSE_KEY=...
   KOLIBRI_HMAC_KEY=$(openssl rand -hex 32)
   ```
3. Запустите:
   ```bash
   docker compose up -d
   ```
4. Проверьте health-checkи:
   - `curl http://localhost:4100/healthz`
   - `curl http://localhost:8080/healthz`

## 4. Kubernetes / Helm (Pilot)
- Chart: `deploy/helm/kolibri`.
- Основные значения:
  ```yaml
  node:
    replicas: 3
    resources:
      limits:
        cpu: 1
        memory: 2Gi
  ingress:
    host: kolibri.example.com
  secrets:
    hmacKey: <base64>
  ```
- Установка:
  ```bash
  helm upgrade --install kolibri deploy/helm/kolibri -f values-prod.yaml
  ```

## 5. Зависимости и внешние сервисы
- PostgreSQL 14+ (опционально) — хранение feedback/аналитики.
- Object storage (S3/MinIO) — резервные копии genoma и pipeline результатов.
- LDAP / OAuth2 провайдер — SSO.

## 6. Health Checks
| Endpoint | Компонент | Описание |
|----------|-----------|----------|
| `/healthz` | KolibriNode | базовый статус, проверка генома и пула формул |
| `/readyz` | KolibriNode | готовность к приёму запросов (сеть, bootstrap) |
| `/metrics` | kolibri_node exporter | Prometheus-метрики (CPU, evolution ticks, backlog) |
| `/healthz` | Frontend | проверка wasm и API-доступности |

## 7. Обновления
1. Скачать релизный пакет (`kolibri-release-bundle`).
2. Проверить подписи:
   ```bash
   cosign verify-blob --signature kolibri.iso.sig kolibri.iso
   cosign verify-blob --signature kolibri.wasm.sig kolibri.wasm
   ```
3. Остановить узлы по одному, применить обновление, убедиться, что swarm re-join успешен.
4. Запустить smoke-плейбук `scripts/run_all.sh --skip-cluster`.

## 8. Резервное копирование
- Геном: `kolibri_node --export-genome path`.
- Knowledge snapshot: `scripts/knowledge_pipeline.sh docs data`.
- Конфигурация: `kubectl get secret kolibri-config -o yaml`.

## 9. Безопасность
- Используйте HMAC-ключи длиной ≥ 32 байт.
- Включайте TLS (Ingress / Nginx) с современным шифрованием.
- Ограничивайте доступ к `/admin` и observability.

## 10. Troubleshooting
- Журналы: `logs/kolibri.jsonl`, `build/cluster/node_*.log`.
- Проверка состояния swarm: `kolibri_node --peer-status`.
- Скрипт диагностики: `scripts/run_kolibri_stack.sh --smoke`.

---

Подробности и checklist для внедрения — см. `docs/ops_briefing.md` и `docs/service_playbook.md`.
