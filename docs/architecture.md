# Kolibri Architecture / Архитектура Kolibri / Kolibri 架构

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Overview / Обзор / 概览

### Русский
Kolibri — это модульная система, в которой каждая подсистема реализована в чистом C и связана предсказуемыми интерфейсами. Ключевые слои:
1. **Decimal Cognition** (`backend/src/decimal.c`) — преобразует внешние данные в десятичные импульсы и обратно.
2. **Formula Evolution** (`backend/src/formula.c`) — эволюционный пул формул, управляющий «геномом» знаний.
3. **Digital Genome** (`backend/src/genome.c`) — криптографический журнал ReasonBlock, фиксирующий события и формулы.
4. **Swarm Networking** (`backend/src/roy.c`) — UDP-протокол Kolibri Swarm с HMAC и широковещательным обнаружением соседей.
5. **KolibriScript Interpreter** (`backend/src/script.c`) — исполняет русскоязычные сценарии, трансформируя их в десятичные импульсы.
6. **Kolibri Node CLI** (`apps/kolibri_node.c`) — оболочка, которая объединяет все подсистемы и предоставляет REPL/daemon режим.
7. **Тесты** (`tests/`) — регрессионный каркас, обеспечивающий воспроизводимость.

### English
Kolibri is a modular system implemented in pure C with predictable boundaries between subsystems. The major layers are identical to the list above with focus on deterministic APIs and minimal dependencies.

### 中文
Kolibri 采用纯 C 模块化实现，子系统之间通过稳定接口协作。主要层级如上所列，强调确定性与最小依赖。

---

## 2. Component Responsibilities / Ответственность компонентов / 组件职责

### Decimal Cognition
- **API:** `kolibri_kodirovat_text`, `kolibri_dekodirovat_text`, и функции оценки длины буферов.
- **Назначение:** конвертация входа/выхода в цифры `0–9`, обеспечение обратимости.
- **Артефакты:** `backend/include/kolibri/decimal.h`, `backend/src/decimal.c`, тест `tests/test_decimal.c`.

### Formula Evolution
- **API:** `kf_pool_init`, `kf_pool_tick`, `kf_pool_best`, `kf_formula_apply`.
- **Механика:** ограниченный пул из 16 формул с мутациями коэффициентов `a`, `b`; fitness пересчитывается при каждом `tick`.
- **Артефакты:** `backend/include/kolibri/formula.h`, `backend/src/formula.c`, тесты `tests/test_formula.c`.

### Digital Genome
- **API:** `kg_open`, `kg_append`, `kg_close`.
- **Особенности:** HMAC-SHA256 для подписи, хранение хэшей цепочки, максимальные размеры событий.
- **Артефакты:** `backend/include/kolibri/genome.h`, `backend/src/genome.c`, тест `tests/test_genome.c`.

### Swarm Networking
- **API:** `kolibri_roy_zapustit`, `kolibri_roy_poluchit_sobytie`, `kolibri_roy_otpravit_sluchajnomu`, `kolibri_roy_otpravit_vsem`.
- **Назначение:** широковещательные HELLO и одноадресная/широковещательная отправка генов через UDP.
- **Артефакты:** `backend/include/kolibri/roy.h`, `backend/src/roy.c`, тест `tests/test_roy.c`.

### Application Layer
- **Колибри-узел:** аргументы командной строки (`--seed`, `--node-id`, `--listen`, `--peer`), REPL-команды (`:good`, `:bad`, `:why`, `:canvas`, `:sync`, `:verify`).
- **KolibriScript:** `backend/include/kolibri/script.h`, `backend/src/script.c`, тест `tests/test_script.c`; команда REPL `:script` исполняет русскоязычный сценарий и логирует действия в геном.
- **Скрипты оркестрации:** `kolibri.sh` автоматизирует сборку, запуск тестов, старт кластера.

---

## 3. Data Flow / Потоки данных / 数据流

1. Пользовательский ввод поступает в `apps/kolibri_node` → кодируется функцией `kolibri_kodirovat_text` → формирует импульсы для формульного пула.
2. `KolibriFormulaPool` обновляет формулы, вычисляя fitness, и выбирает лучшую формулу для текущего контекста.
3. События обучения записываются в `KolibriGenome` как `ReasonBlock` с HMAC.
4. При командах `:sync`/`:cluster broadcast` лучшая формула кодируется и отправляется через `kolibri_roy_otpravit_sluchajnomu` или `kolibri_roy_otpravit_vsem`.
5. Поток роя принимает пакет, создаёт событие `KOLIBRI_ROY_SOBYTIE_FORMULA`, узел интегрирует формулу и логирует событие `IMPORT`.

---

## 4. Determinism & Reproducibility / Детерминизм и воспроизводимость / 确定性与可复现性

- **RNG:** `KolibriRng` использует линейный конгруэнтный генератор, инициализируемый `--seed` (или значением по умолчанию).
- **Формулы:** любые мутации зависят только от RNG, входного набора и текущей популяции.
- **Геном:** каждый блок включает индекс, метку времени, хеш предыдущего блока и HMAC, исключая расхождения между узлами.
- **Тесты:** `make test` проверяет функциональность каждого слоя, а `clang-tidy` обеспечивает статический анализ.

---

## 5. Deployment Targets / Целевые окружения / 部署目标

- **Native:** сборка `make` производит бинарники в `build/`.
- **Cluster:** `kolibri.sh up` запускает многопроцессный рой для локального тестирования.
- **WASM (план):** ядро поддерживает компиляцию в WebAssembly через Emscripten (см. `web_interface.md`).
- **Kolibri OS:** минимальная оболочка загружается через `kolibri_os.md`.

---

## 6. Extensibility / Расширяемость / 可扩展性

- Новые типы сообщений добавляются в `kolibri/roy.h` и реализуются в `backend/src/roy.c` вместе с тестами.
- Дополнительные формульные операторы могут быть добавлены в `KolibriFormula` при сохранении совместимости сериализации.
- Подключение плагинов осуществляется через документированный API (см. `developer_guide.md`).

