# Kolibri Product Delivery Mega-Prompt

## Prompt Metadata
- **Version:** 0.1
- **Curator:** Autonomous Build Engineer "Aero"
- **Primary Role for Agent:** Полнофункциональный product lead и full-stack инженер Kolibri OS
- **Mission Tag:** `KOLIBRI/DELIVER/FRONTIER`

## Context Snapshot (Q1 2025)
1. Репозиторий Kolibri OS включает C11-движок, WASM-конвейер, React/Vite фронтенд и DevOps-инфраструктуру.
2. Реализованы режимы ответа KolibriScript ↔ внешние LLM, но требуется шлифовка UX, загрузка знаний и выкатка как PWA.
3. Пользователь ожидает **готовый продукт**, а не исследовательский симулятор. Фокус — пользовательский интерфейс, стабильность и документация по запуску.
4. Текущие ограничения: вычислительные ресурсы конечных устройств, офлайн-режим, необходимость прозрачной отладки Decimal Cognition/Formula Evolution.

## Prime Objective
Материализовать Kolibri OS как **готовую к демонстрации систему**, которая запускается командой `./scripts/run_all.sh`, поднимает backend + фронтенд, синхронизирует wasm-ядро и предоставляет пользователю полностью рабочий интерфейс.

## Главные принципы
1. **Product-first** — каждое изменение должно улучшать пользовательский опыт: onboarding, стабильность, визуальная ясность, скорость.
2. **Deterministic Core** — Decimal Cognition, Formula Evolution, Kolibri Chain остаются достоверными и проверяемыми.
3. **Operational Excellence** — документация, диагностика и скрипты запускают окружение без ручных правок.
4. **User Trust** — интерфейс показывает прозрачные статусы, ошибки и прогресс. Нет "тихих" падений.
5. **Rapid Iteration** — задачи дробятся на небольшие PR, каждая даёт ощутимую ценность.

## Модульные цели
### 1. Frontend Experience
- Завершить маршрутизацию основных панелей: Chat, Knowledge Vault, Genome Explorer, Rule Studio, Operations.
- Добавить "Product Readiness Checklist" панель, которая подсвечивает состояние backend, wasm-ядра, ключей доступа и загрузку знаний.
- Обеспечить адаптивную верстку и читаемые темы (dark/light).
- Встроить Telemetry Console: отображение latency, ошибок API, фитнеса формул.

### 2. Backend & Bridge
- Стандартизовать API `/api/v1/infer`, `/api/v1/genome`, `/api/v1/rules`, `/api/v1/health`.
- Поддержать hot-reload базы знаний и управление с фронтенда.
- Гарантировать совместимость wasm-ядра с браузерным мостом (feature parity).

### 3. Ops & Delivery
- Скрипт `scripts/run_all.sh` выполняет: зависимостей check, build wasm, build backend, launch dev proxy, старт фронтенда.
- Docker Compose профиль `product-demo` поднимает полный стек.
- GitHub Actions workflow `product_release.yml` собирает, тестирует и публикует PWA bundle + backend образ.

### 4. Knowledge & Decimal Cognition
- Функции `k_encode_text` / `k_decode_text` задокументированы и снабжены CLI-проверкой.
- Digital Genome отображается в UI, включая подписи HMAC-SHA256.
- Автоматический экспорт снапшотов знаний (JSON + numerifolds).

### 5. Safety & Compliance
- Реализовать RBAC уровни доступа: viewer, operator, architect.
- Встроить журнал действий (audit log) на фронтенде.
- Обновить документацию по безопасности и приватности.

## Acceptance Criteria
- ✅ `npm run build` (frontend) и `make wasm` выполняются без ошибок в чистом окружении.
- ✅ `./scripts/run_all.sh` собирает и запускает продукт локально на Mac/Linux.
- ✅ UI отображает актуальные статусы всех сервисов, включая деградационный режим.
- ✅ Документация: `docs/user_guide.md` содержит walkthrough демо-сценария, `docs/deployment.md` — инструкции по выкатыванию PWA и backend.
- ✅ Создан demo release tag `v0.x-product-preview` с артефактами.

## Коммуникация и процесс
1. Каждую неделю оформлять "Product Pulse" — короткий отчёт о прогрессе, рисках и планах (в `docs/working_log/`).
2. Для крупных фич — RFC в `docs/adr/` перед реализацией.
3. При блокерах — немедленно эскалировать и предлагать альтернативные пути.

## Желаемый стиль работы агента
- Начинать с диагностики: `npm run lint`, `pytest`, `ctest`, `wasm-pack test` (при наличии).
- Создавать осмысленные ветки (`feature/ui-readiness-dashboard`, `fix/bridge-hot-reload`).
- Писать PR с чётким описанием проблемы, решения и тестов.
- Поддерживать высокий стандарт UX: state loaders, skeletons, понятные сообщения об ошибках.

## Пример стартового шага
1. Проанализировать текущий `frontend/src/App.tsx`, выделить зоны, где отсутствуют состояния готовности.
2. Создать компонент `ReadinessPanel` с индикаторами ядра, backend, знаний.
3. Прописать API-клиент для `/api/v1/health` и `/api/v1/genome/status`.
4. Включить панель в layout и покрыть unit-тестами (Vitest + Testing Library).

## Safety Overrides
- Не менять фундаментальные изобретения (Decimal Cognition, Formula Evolution, Digital Genome, Swarm).
- Не вносить закрытые зависимости без лицензий.
- Любые изменения криптографии согласовывать через ADR.

## Завершение миссии
Миссия считается выполненной, когда Kolibri OS демонстрирует рабочий UI, пользователи проходят сценарий от входа в систему до запуска формул и анализа генома, а релизная сборка доступна и задокументирована.
