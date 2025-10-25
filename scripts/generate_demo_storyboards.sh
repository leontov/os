#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output_dir="$root_dir/logs/demo_videos"
mkdir -p "$output_dir"

echo "[Kolibri] Генерация сценариев демо-видео в $output_dir"

cat <<'STORY' >"$output_dir/sso_rbac_intro.md"
# SSO & RBAC onboarding

**Аудитория:** Security, Platform

## План
1. Показать `/api/v1/sso/saml/metadata` в браузере.
2. Отправить пример `SAMLResponse` через `curl` и получить токен.
3. Вызвать `/api/v1/infer` с валидным Bearer-токеном.

## Команды и логи
```
curl -s http://localhost:8000/api/v1/sso/saml/metadata
curl -s -X POST http://localhost:8000/api/v1/sso/saml/acs -d @fixtures/sso_response.txt
curl -s -H "Authorization: Bearer <token>" -X POST http://localhost:8000/api/v1/infer -d '{"prompt":"status"}'
```
STORY

cat <<'STORY' >"$output_dir/observability_ops.md"
# Prometheus & Grafana

**Аудитория:** SRE

## План
1. Подключиться к `/metrics` и показать ключевые метрики.
2. Импортировать dashboard из Helm values.
3. Настроить алерт при росте `kolibri_infer_requests_total{outcome="error"}`.

## Команды и логи
```
curl -s http://localhost:8000/metrics | head
kubectl --namespace kolibri port-forward svc/kolibri-backend 8000:8000
helm upgrade --install kolibri deploy/helm/kolibri-enterprise -f values/observability.yaml
```
STORY

cat <<'STORY' >"$output_dir/audit_forensics.md"
# Genome audit trail

**Аудитория:** Risk & Compliance

## План
1. Показать новую запись в `logs/audit/enterprise.log` после успешного входа.
2. Сопоставить её с событием `genome.sso`.
3. Экспортировать логи в SIEM (пример через `jq`).

## Команды и логи
```
tail -n 5 logs/audit/enterprise.log
jq '.' logs/genome/events.log | tail -n 5
python scripts/generate_sbom.py --verify logs/genome/events.log
```
STORY

cat <<'STORY' >"$output_dir/pwa_resilience.md"
# PWA resilience walkthrough

**Аудитория:** Frontend, Mobile

## План
1. Открыть `/demo`, показать метрики холодного старта.
2. Искусственно увеличить размер wasm и продемонстрировать деградацию.
3. Перейти в офлайн и показать работу кэша.

## Команды и логи
```
npm run build
npm run preview -- --host
python scripts/tools/bloat_wasm.py kolibri.wasm
```
STORY

cat <<'STORY' >"$output_dir/helm_rollout.md"
# Helm rollout & smoke

**Аудитория:** Platform

## План
1. Развернуть Helm chart в namespace `kolibri`.
2. Запустить `scripts/run_all.sh --skip-cluster --skip-iso`.
3. Проверить, что demo-скрипты пересозданы.

## Команды и логи
```
helm upgrade --install kolibri deploy/helm/kolibri-enterprise
scripts/run_all.sh --skip-cluster --skip-iso
ls logs/demo_videos
```
STORY

cat <<'STORY' >"$output_dir/supply_chain_guardrails.md"
# Supply chain guardrails

**Аудитория:** DevSecOps

## План
1. Пройтись по `ci.yml` и показать этап генерации SBOM.
2. Запустить `scripts/generate_sbom.py` локально.
3. Подписать wasm-ядро скриптом `scripts/sign_wasm.sh`.

## Команды и логи
```
cat .github/workflows/ci.yml
python scripts/generate_sbom.py --output build/sbom.json
scripts/sign_wasm.sh kolibri.wasm build/kolibri.wasm.sig
```
STORY

(
    cd "$output_dir"
    sha256sum *.md > hashes.txt
)

echo "[Kolibri] Сценарии обновлены"
