# Операционные практики Kolibri OS

Документ описывает, как наблюдать за состоянием бэкенда Kolibri и какие дашборды и алерты использовать в Grafana и Prometheus.

## Телеметрия и сбор метрик

- **OpenTelemetry.** Бэкенд использует модуль `core.telemetry` для инициализации `MeterProvider` и экспорта метрик.
- **Prometheus endpoint.** По умолчанию запускается HTTP-сервер `prometheus_client` на `0.0.0.0:9464`. Порт настраивается переменной `KOLIBRI_PROMETHEUS_PORT`, адрес — `KOLIBRI_PROMETHEUS_HOST`.
- **OTLP (опционально).** Для отправки данных в OpenTelemetry Collector установите `KOLIBRI_OTLP_ENDPOINT`. Дополнительно доступны `KOLIBRI_OTLP_HEADERS` и `KOLIBRI_OTLP_EXPORT_INTERVAL_MS`.
- **Отключение.** Установите `KOLIBRI_TELEMETRY=0`, чтобы полностью отключить инициализацию провайдера.
- **Основные метрики:**
  - `kolibri_backend_events_total{event.type}` — счетчик зафиксированных событий (TEACH, ASK и т. д.).
  - `kolibri_backend_events_failed_total{event.type}` — счетчик ошибок при выполнении команд или трассировки.
  - `kolibri_backend_genome_blocks` — гистограмма длины генома после каждого события.
  - `kolibri_backend_soak_duration_seconds{phase="soak"}` — гистограмма длительности `zapustit_soak`.
  - `kolibri_backend_soak_events_total{phase="soak"}` — число событий, созданных во время soak-прогонов.

## Grafana: рекомендуемые дашборды

| Дашборд | Панель | PromQL | Назначение |
| --- | --- | --- | --- |
| **Kolibri Backend Overview** | *Event Throughput* | `sum(rate(kolibri_backend_events_total[5m]))` | Средняя скорость событий, отображается столбчатой диаграммой. |
| | *Error Breakdown* | `sum by (event.type)(increase(kolibri_backend_events_failed_total[15m]))` | Распределение ошибок по типам действий. |
| | *Genome Depth* | `histogram_quantile(0.95, sum by (le)(rate(kolibri_backend_genome_blocks_bucket[10m])))` | 95-й перцентиль длины генома. |
| | *Soak Duration Trend* | `avg(rate(kolibri_backend_soak_duration_seconds_sum[15m])) / avg(rate(kolibri_backend_soak_duration_seconds_count[15m]))` | Скользящее среднее длительности soak-сессий. |
| **Kolibri Soak Drills** | *Events per Session* | `increase(kolibri_backend_soak_events_total[30m])` | Проверка интенсивности генерации событий. |
| | *Latency Heatmap* | Используйте метрику `kolibri_backend_soak_duration_seconds_bucket` | Тепловая карта длительностей длительных прогонов. |

### Настройка

1. Добавьте Prometheus как источник данных в Grafana (URL на скрейпер, например `http://prometheus:9090`).
2. Импортируйте JSON-дашборды или создайте панели вручную согласно таблице выше.
3. Для OTLP/Grafana Cloud укажите endpoint коллектора в `KOLIBRI_OTLP_ENDPOINT`.

## Алерты Prometheus

| Алерт | Условие | Действие |
| --- | --- | --- |
| `KolibriBackendErrorsSpike` | `sum(rate(kolibri_backend_events_failed_total[5m])) / sum(rate(kolibri_backend_events_total[5m])) > 0.05` в течение 10 минут | Отправить уведомление on-call, приложить последнюю трассировку. |
| `KolibriSoakDurationHigh` | `histogram_quantile(0.9, sum by (le)(rate(kolibri_backend_soak_duration_seconds_bucket[30m]))) > 120` | Эскалировать в команду симуляции: soak-прогоны стали дольше 2 минут. |
| `KolibriTelemetryDown` | `absent(kolibri_backend_events_total)` более 5 минут | Проверить состояние сервиса или флаг `KOLIBRI_TELEMETRY`. |

Все алерты стоит сопровождать runbook-ссылками на этот документ и инструкции по перезапуску сервиса.

## Журналы действий пользователей

Фронтенд запрашивает согласие пользователя на сбор анонимных событий (без содержимого сообщений) и записывает их в консоль браузера с префиксом `[kolibri][user-action]`. Это помогает сопоставлять пользовательские действия с backend-метриками при дебаге, соблюдая требования приватности.
