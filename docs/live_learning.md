# Kolibri Live Knowledge Loop

## 1. Overview
Этот документ описывает архитектуру «Live Knowledge Loop» — механизма, позволяющего Kolibri
адаптироваться к новым вопросам во время диалога, не нарушая концепцию цифрового генома и
управляемого знания.

## 2. Поток событий
1. **Capture**
   - Все неизвестные вопросы фиксируются в журнале (`kolibri_node --health`, HMAC) и в очереди `live_queue`.
   - Контекст диалога + ближайшие документы (`knowledge/index.json`) сохраняются вместе с вопросом.

2. **Draft Synthesis**
   - Процесс `live_ingest.py` формирует черновой ответ (правила/heuristics/внешний модуль).
   - Создаётся KolibriScript-шаблон, добавляющий ассоциацию и запускающий `:tick`.

3. **Moderation**
   - Модератор подтверждает/редактирует ответ в UI (расширение knowledge queue).
   - Следом вызывается `kolibri_queue enqueue --status approved` → попадание в pipeline.

4. **Assimilation**
   - Nightly job: `scripts/knowledge_pipeline.sh` переиндексирует approved знания.
   - `scripts/auto_train.sh` прогоняет узел (ticks configurable) → обновлённый геном.
   - Health-check и метрики отражают новые знания.

5. **Feedback**
   - Dashboards (`/metrics`, Grafana) показывают hits/misses, SLA модерации.
   - Alerts при росте `kolibri_search_misses_total` или просроченной очереди.

## 3. Компоненты реализации
- `scripts/live_ingest.py` — фоновые сенсоры + черновик KolibriScript.
- Расширение фронтенда: вкладка «Live Queue», кнопки approve/reject/edit.
- Дополнение `scripts/auto_train.sh`: поддержка `--roots` для approved live данных.
- Prometheus: наблюдение за live-очередью, скоростью апрува.

## 4. Ближайшие задачи
1. Проектирование `live_ingest.py` (структура очереди, формат черновика).
2. API фронта для отображения live queue и действий модератора.
3. CI-job `live-loop` (smoke) плюс оповещение ops.
4. Документация: обновить `docs/deployment.md`, `docs/admin_guide.md`.

## 5. Примечания
- Внешние генераторы (LLM) допускаются только как источник черновика и должны быть помечены как «неподтверждённые».
- Приоритет безопасности: никогда не публиковать ответ без approval.
- Все новые формулы должны иметь HMAC-подпись и попадать в swarm через `auto_train`.
