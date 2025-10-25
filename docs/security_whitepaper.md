# Kolibri OS Security Whitepaper

## Executive Summary

Kolibri OS Enterprise Bundle v1 обеспечивает безопасность на уровне идентификации, контроля доступа и цепочки поставки знаний («генома»). Документ описывает модели угроз, механизмы защиты и процессы реагирования.

## Threat Model Overview

| Угроза | Вектор | Митигирующие меры |
| --- | --- | --- |
| Захват SSO-сессии | Подмена SAML-ответа | HMAC-подпись атрибута `kolibriSignature`, проверка `NotOnOrAfter`, короткий TTL токена |
| Эскалация привилегий | Ошибочная выдача ролей | Политики RBAC в JSON, unit-тесты на отказ в доступе, аудит всех вызовов `require_permission` |
| Подмена знаний (генома) | Загрузка фальшивых документов | Журнал `genome` с хэшами артефактов, регулярное сравнение с эталонным корнем доверия |
| Supply-chain атака | Компрометация CI/CD | Pipeline `ci.yml` подписывает артефакты, строит SBOM через `scripts/generate_sbom.py`, проверяет контрольные суммы |
| Утечка ключей | Неправильное хранение секретов | Использование Kubernetes Secrets/HashiCorp Vault, ротация через `KOLIBRI_SSO_SESSION_TTL`, запрет на вывод секрета в логи |
| Потеря журналов аудита | Перезапуск pod / сбой узла | PVC `*-kolibri-enterprise-logs` хранит JSONL-файлы, ServiceAccount не имеет доступа к другим PV |

## Identity & Access Management

- **SAML Assertion Validation** — обязательная проверка HMAC, допустимые аудитории (`KOLIBRI_SAML_AUDIENCE`), контроль часов (`KOLIBRI_SAML_CLOCK_SKEW`).
- **RBAC** — политика по принципу минимально необходимых прав, разделение ролей operator/auditor.
- **Degraded Tokens** — ограниченный доступ при деградации, роли жёстко зашиты в конфигурацию, токены проходят через HMAC-проверку.
- **Key Hygiene** — секреты (`KOLIBRI_SSO_SHARED_SECRET`, ключи подписи wasm) хранятся в Kubernetes Secret; доступ к ним получает только service account релиза и job `scripts/sign_wasm.sh`, который читает ключ из переменных окружения.

## Genome Chain Integrity

- Каждое взаимодействие с ядром фиксируется как событие `genome.*` с timestamp, actor и полезной нагрузкой (sha256 хэши артефактов).
- Для загрузок знаний рекомендуется хранить эталонные хэши в Secrets и сравнивать их внутри пайплайна.
- Офлайн-режим добавляет пометку `"mode": "offline"` в аудит, что упрощает расследование.
- PVC Helm-чарта обеспечивает долговременное хранение логов; рантайм при записи (`Path.mkdir`) гарантирует наличие каталогов с правами только для владельца.

## Supply Chain Controls (`ci.yml`)

1. **Build** — сборка backend/frontend и WASM, сохранение артефактов с sha256 в артефакт-репозитории.
2. **Scan** — генерация SBOM (`scripts/generate_sbom.py`), запуск `ruff` и `pytest`.
3. **Sign** — скрипт `scripts/sign_wasm.sh` подписывает wasm-ядро; подпись публикуется рядом с артефактом.
4. **Release** — Helm Chart упаковывается и подписывается (`helm package --sign`).
- **Verify** — job `scripts/run_all.sh --skip-cluster --skip-iso` пересоздаёт демо-скрипты и обновляет `hashes.txt` для последующей сверки sha256.

## Incident Response

- **Detection** — Prometheus алерты на `kolibri_infer_requests_total{outcome="error"}` и `kolibri_sso_events_total{event="login"}` с аномальной динамикой.
- **Containment** — перевести `KOLIBRI_SSO_DEGRADED_TOKENS` в режим только чтение, ограничить роли аудитором.
- **Eradication** — инвалидировать все токены через смену `KOLIBRI_SSO_SHARED_SECRET`, восстановить RBAC из резервной копии.
- **Recovery** — повторное развертывание Helm чарта, проверка целостности журналов.
- **Post-Incident Review** — выгрузить PVC с логами аудита, пересчитать sha256 и сравнить с `logs/demo_videos/hashes.txt` для подтверждения неизменности демонстрационных сценариев.

## Compliance & Audit

- JSONL журналы легко интегрируются с SIEM (Splunk, Elastic). Каждая запись содержит namespace и payload для корреляции.
- В PWA демонстрации сохраняются контрольные суммы сценариев (`logs/demo_videos/hashes.txt`), что подтверждает неизменность демо-контента.

