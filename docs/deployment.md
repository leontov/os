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
   # директории с индексом знаний (через двоеточие)
   KOLIBRI_KNOWLEDGE_DIRS="docs:data"
   # необязательно: переопределить порт службы знаний
   # KOLIBRI_KNOWLEDGE_PORT=8080
   ```
3. Запустите:
   ```bash
   docker compose up -d
   ```
4. Проверьте health-checkи:
   - `docker compose exec kolibri-node kolibri_node --health`
   - `curl http://localhost:8000/healthz`
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
| `kolibri_node --health` | KolibriNode | CLI-проверка генома, семени и HMAC (возвращает JSON) |
| `/healthz` | Knowledge API | HTTP 200 с `status`, `documents`, `generatedAt`, `indexRoots`, `requests` |
| `/metrics` | Knowledge API | Prometheus-метрики по документам, ключу, директориям и времени генерации |
| `/healthz` | Frontend | проверка wasm и API-доступности |

Пример использования health-check для узла:

```bash
docker exec kolibri-node kolibri_node --health
# {"status":"ok","node_id":1,...}
```

Проверка knowledge API:

```bash
curl http://kolibri-backend:8000/healthz
curl http://kolibri-backend:8000/metrics
```

Ответ `/healthz` содержит временные метки (`generatedAt`, `bootstrapGeneratedAt`), список корней, источник индекса (`indexSource`) и HMAC-ключа (`keyOrigin`) — UI использует эти поля для отображения актуальности знаний и состояния пайплайна.

### Конфигурация knowledge-server

| Переменная / флаг | Значение по умолчанию | Описание |
|-------------------|-----------------------|----------|
| `KOLIBRI_KNOWLEDGE_PORT` / `--port` | `8000` | TCP-порт HTTP API |
| `KOLIBRI_KNOWLEDGE_BIND` / `--bind` | `127.0.0.1` | Адрес привязки |
| `KOLIBRI_KNOWLEDGE_DIRS` / `--knowledge-dir` | `docs:data` | Каталоги с Markdown-файлами (через `:`) |
| `KOLIBRI_KNOWLEDGE_INDEX_CACHE` / `--index-cache` | `.kolibri/index` | Папка для выгрузки JSON-индекса (manifest + index.json) |
| `KOLIBRI_KNOWLEDGE_INDEX_JSON` / `--index-json` | — | Использовать готовый JSON-индекс вместо сканирования каталогов |
| `KOLIBRI_KNOWLEDGE_ADMIN_TOKEN` / `--admin-token` | — | Bearer-токен для POST `/api/knowledge/feedback` и `/api/knowledge/teach` |
| `KOLIBRI_KNOWLEDGE_ADMIN_TOKEN_FILE` / `--admin-token-file` | — | Загрузить токен из файла (без перевода строк) |
| `KOLIBRI_HMAC_KEY`, `KOLIBRI_HMAC_KEY_FILE` | — | HMAC-ключ для журнала эволюции |

Эндпоинты `/api/knowledge/feedback` и `/api/knowledge/teach` теперь требуют POST-запроса с `Authorization: Bearer <token>` и защищены внутренним rate limiting (по умолчанию 30 запросов в минуту на процесс).

Пример запуска:

```bash
./kolibri_knowledge_server \
  --bind 0.0.0.0 --port 8080 \
  --knowledge-dir /opt/kolibri/docs \
  --index-cache /var/cache/kolibri/index \
  --admin-token-file /etc/kolibri/knowledge.token
```

### Подготовка знаний и JSON-индекса

Для воспроизводимой поставки рекомендуется предварительно собрать TF-IDF индекс и выгрузить артефакты JSON:

```bash
./kolibri_indexer build --output build/index-cache docs knowledge-extra
# появятся build/index-cache/index.json и build/index-cache/manifest.json
```

На продакшене можно развернуть только JSON (без Markdown), указав `KOLIBRI_KNOWLEDGE_INDEX_JSON=/opt/kolibri/index-cache` — `/healthz` вернёт `"indexSource":"prebuilt"`, что подтверждает загрузку из подготовленного снапшота.
Ответ `/healthz` содержит временные метки (`generatedAt`, `bootstrapGeneratedAt`), список корней индекса и источник HMAC-ключа (`keyOrigin`) — UI использует эти поля для отображения актуальности знаний.

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
- Мониторинг: см. `docs/monitoring_setup.md` и примеры в `deploy/monitoring/`.
- Live loop: архитектура и шаги описаны в `docs/live_learning.md`.

## 11. Automated Training
- Скрипт `scripts/auto_train.sh` запускает конвейер знаний, генерирует KolibriScript bootstrap и выполняет пакетное обучение узла.
  ```bash
  scripts/auto_train.sh --ticks 256 docs data
  ```
- Результаты: обновлённый геном (`build/training/auto_genome.dat`) и проверка здоровья `kolibri_node --health`.
- Параметры: `--seed`, `--genome`, `--bootstrap`, `--skip-build`, дополнительные корни для `knowledge_pipeline`.

---

Подробности и checklist для внедрения — см. `docs/ops_briefing.md` и `docs/service_playbook.md`.
