# Kolibri Enterprise Bundle v1

## Обзор

Enterprise Bundle v1 объединяет сервисы идентификации, наблюдаемости и соответствия стандартам, чтобы Kolibri OS можно было безопасно разворачивать в периметре крупной организации. Этот документ описывает референсную архитектуру и контрольные операции для каждого из компонентов пакета.

## SSO / SAML 2.0

- **SP-метаданные** публикуются по `/api/v1/sso/saml/metadata`. Точка ACS (`Assertion Consumer Service`) configurable через `KOLIBRI_SAML_ACS_URL` и по умолчанию указывает на `/api/v1/sso/saml/acs`.
- **Валидация** построена вокруг подписанного атрибута `https://kolibri.ai/claims/signature`, который должен содержать HMAC-SHA256 от `subject|expires_at` с ключом `KOLIBRI_SSO_SHARED_SECRET`.
- **Роли** извлекаются из атрибута `https://kolibri.ai/claims/roles` и конвертируются в контекст авторизации Kolibri.
- **Отказоустойчивость**: переменная `KOLIBRI_SSO_DEGRADED_TOKENS` позволяет задать заранее согласованные токены `Bearer`, которые включают минимальные роли для режимов деградации (например, `degraded=operator,auditor`).
- **TTL сессии** задаётся через `KOLIBRI_SSO_SESSION_TTL` и дополнительно проверяется по `NotOnOrAfter` из утверждения.

## Role-Based Access Control

- Политика хранится в JSON-файле, путь к которому задаётся `KOLIBRI_RBAC_POLICY_PATH`. Если он не указан, применяется дефолтная политика:
  - `system:admin` — полный доступ (`*`).
  - `operator` — выполнение инференса и просмотр аналитики.
  - `auditor` — доступ к аудит-логу и журналу генома.
  - `observer` — режим только чтение для аналитики.
- Проверка прав выполняется через зависимость FastAPI `require_permission`, которую можно использовать во всех новых эндпоинтах.

## Аудит и журнал «генома»

- Все события записываются в JSONL-файлы `logs/audit/enterprise.log` и `logs/genome/events.log`.
- Аудит фиксирует ключевые атрибуты: тип события, actor, namespace, payload.
- Журнал генома (`genome.*`) используется для трассировки взаимодействий ядра (например, шаги SSO, инференс, обновления знаний).
- Логи формируются даже в офлайн-режиме: директории создаются автоматически.
- Для прод-среды Helm-чарт создаёт PVC с именем `<release>-kolibri-enterprise-logs`, который монтируется в `/var/log/kolibri` и сохраняет аудит между рестартами.

## Наблюдаемость (Prometheus / Grafana)

- Эндпоинт `/metrics` предоставляет метрики Prometheus с namespace `KOLIBRI_PROMETHEUS_NAMESPACE`.
- Доступные метрики:
  - `kolibri_infer_requests_total{outcome=success|error}` — количество запросов.
  - `kolibri_infer_latency_seconds{provider}` — гистограмма латентности.
  - `kolibri_sso_events_total{event}` — события SSO.
- Helm Chart включает `ServiceMonitor` (опционально включается в values) для автоматического обнаружения.
- Grafana dashboard-шаблон описан в `deploy/helm/kolibri-enterprise/values.yaml` (см. раздел `grafana`) и автоматически публикуется через ConfigMap `kolibri-dashboard`.

## Helm-чарт

- Чарт расположен в `deploy/helm/kolibri-enterprise` и поддерживает гибкую конфигурацию backend, frontend и ingress.
- Параметры безопасности (секреты SSO, политика RBAC, пути логов) передаются через `values.yaml` и Secret/ConfigMap.
- Включены ресурсы:
  - Deployment/Service для backend.
  - Deployment/Service для frontend PWA.
  - ConfigMap c настройками RBAC и сервисов.
  - PersistentVolumeClaim (при включении `logging.persistence`) для журналов аудита и генома.
  - ConfigMap с Grafana dashboard, если в values задан JSON-шаблон.
  - (Опционально) ServiceMonitor для Prometheus Operator.

## Контрольный список внедрения

1. Согласовать формат SAML-атрибутов и значение `KOLIBRI_SSO_SHARED_SECRET` с IdP.
2. Сгенерировать и загрузить RBAC-политику в JSON.
3. Прописать `KOLIBRI_AUDIT_LOG_PATH` и `KOLIBRI_GENOME_LOG_PATH` в `values.yaml`, настроить retention.
4. Подключить Prometheus/Grafana, импортировать dashboard.
5. Запустить `scripts/run_all.sh` для smoke-теста и генерации демо-скриптов.
