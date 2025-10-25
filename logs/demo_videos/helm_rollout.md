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
