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
