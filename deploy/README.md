# Kolibri Deployment Manifests

Этот каталог содержит пример манифестов Kubernetes и docker-compose для развёртывания Kolibri OS.

## Структура

- `k8s/namespace.yaml` — пространство имён `kolibri` и базовый `ConfigMap`.
- `k8s/backend.yaml` — Deployment и Service для C-бэкенда (`kolibri_node`).
- `k8s/frontend.yaml` — Deployment, Service и Ingress для веб-клиента.
- `k8s/training-cronjob.yaml` — CronJob для периодического запуска тренировки.
- `docker-compose.yml` — локальный запуск трёх сервисов (kolibri-node, knowledge API, frontend) с health-check.
- `monitoring/` — пример конфигурации Prometheus (`prometheus.yml`) и дашборд Grafana (`grafana_dashboard.json`).

Во всех манифестах оставлены плейсхолдеры `REPLACE_WITH_REGISTRY` и `RELEASE_TAG`.
Перед применением замените их на значения, которые использует `scripts/package_release.sh`
при публикации Docker-образов (например, `ghcr.io/my-org` и git-тег релиза).

Применение:

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/backend.yaml
kubectl apply -f deploy/k8s/frontend.yaml
kubectl apply -f deploy/k8s/training-cronjob.yaml
```

Ingress настроен на хост `kolibri.local`. Обновите его, чтобы соответствовать вашей
инфраструктуре (например, добавьте TLS-секцию или измените host).

Docker Compose:

```bash
docker compose -f deploy/docker-compose.yml up -d
docker compose ps
```

Файл `docker-compose.yml` собирает Docker-образ бэкенда локально из `backend/Dockerfile` и
использует его для сервисов `kolibri-node` и `knowledge`. Это позволяет клиентам
контролировать процесс сборки и не загружать готовые образы из внешних реестров.
При необходимости можно явно выполнить сборку перед запуском:

```bash
docker compose -f deploy/docker-compose.yml build kolibri-node knowledge
```
