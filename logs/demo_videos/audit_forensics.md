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
