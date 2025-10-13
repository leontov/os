# KolibriSim C/WASM Port Plan

## 1. Цели и границы
- **Цель:** заменить Python-модуль `core/kolibri_sim.py` на реализацию на чистом C, собираемую как нативную библиотеку и как модуль WebAssembly.
- **Функциональность:** генерация журнала (`ZhurnalZapis`), управление популяцией формул, сохранение цифрового генома с HMAC, поддержка soak/метрик, экспорт трасс (JSON Lines).
- **Не входит:** переписывание KolibriScript-интерпретатора (используем существующий C-код) и UI-графики.

## 2. Архитектура и API
### 2.1 Пакетная структура
- `backend/include/kolibri/sim.h` — публичный заголовок.
- `backend/src/sim/` — исходники ядра.
- `apps/kolibri_sim_cli.c` — CLI для CI/скриптов.
- `wasm/kolibri_sim.c` — обёртка экспорта для WebAssembly.

### 2.2 API (черновик)
```c
typedef struct KolibriSim KolibriSim;

typedef struct {
    const char *tip;
    const char *soobshenie;
    double metka;
} KolibriSimLog;

typedef struct {
    const char *kod;
    double fitness;
    const char *parents;
    const char *context;
} KolibriSimFormula;

KolibriSim *kolibri_sim_create(const KolibriSimConfig *cfg);
void kolibri_sim_destroy(KolibriSim *sim);

int kolibri_sim_tick(KolibriSim *sim, KolibriSimTickResult *out);
int kolibri_sim_seed_knowledge(KolibriSim *sim, const KolibriKnowledgeDoc *docs, size_t count);
int kolibri_sim_export_trace(const KolibriSim *sim, const char *path, KolibriSimTraceOptions opt);
int kolibri_sim_get_formulas(const KolibriSim *sim, KolibriSimFormula *buffer, size_t capacity, size_t *out_count);
int kolibri_sim_get_genome(const KolibriSim *sim, KolibriSimGenomeBlock *buffer, size_t capacity, size_t *out_count);
```

### 2.3 Конфигурация
```c
typedef struct {
    uint32_t seed;
    const char *hmac_key;
    const char *trace_path;
    bool trace_include_genome;
    const char *genome_path;
} KolibriSimConfig;
```

### 2.4 Формат блоков генома
- `index`, `prev_hash`, `payload_dec`, `hmac_dec`, `result_hash`.
- HMAC вычисляется через существующий `kolibri/genome.c` (переиспользуем функции).

## 3. Реализация
### 3.1 Основные компоненты
- **RNG:** переиспользовать `kolibri/random.h` (LCG с seed).
- **Knowledge ingestion:** принимать документы из C-индекса или JSON-файла, хранить в структуре `kolibri_sim_knowledge`.
- **Formula evolution:** обёртка над существующим `kolibri/formula.c` (Pool API) с добавлением контекстов и оценок.
- **Logging:** буфер фиксированного размера + кольцевой буфер; при переполнении смещение (`offset`).
- **Trace writer:** модуль `kolibri_sim_trace.c`: экспорт JSONL в поток/файл.

### 3.2 WebAssembly
- Собирать через `emcc` цель `kolibri_sim.wasm`.
- Экспортировать функции `kolibri_sim_init`, `kolibri_sim_reset`, `kolibri_sim_execute_script(const char *program, char *buf, size_t buf_len)`.
- Память wasm — линейный буфер; взаимодействие с TS/JS через wasm-bindings.

### 3.3 CLI
- `kolibri_sim_cli tick --seed 123 --steps 100`.
- Поддержка soak: `kolibri_sim_cli soak --minutes 5 --log logs/kolibri.jsonl` (сбор JSONL журнала).

## 4. Данные и совместимость
### 4.1 Журнал (`JsonLinesTracer`)
- Формат JSONL сохраняем: `{ "tip": "...", "soobshenie": "...", "metka": 123.45 }`.
- При WebAssembly вывод перенаправляется в shared memory (JS считывает).

### 4.2 Soak/metrics
- Метрика `minute`, `formula`, `fitness`, `genome`.
- C-API: `kolibri_sim_collect_metrics()` возвращает массив структур.

### 4.3 Genом ledger
- API для записи `KolibriGenomeLedger` реализуется на C: файл JSON + HMAC.
- Для wasm хранение в памяти; экспорт массива блоков.

## 5. Интеграция
### 5.1 Сборка
- `CMake` цель `kolibri_sim_core` + `kolibri_sim_cli` + `kolibri_sim_wasm`.
- Добавить флаг `-s EXPORTED_FUNCTIONS` для wasm.
- Обновить `scripts/build_wasm.sh` для сборки `kolibri_sim.wasm`.

### 5.2 Пайплайны
- `scripts/soak.py` заменяется на вызов `kolibri_sim_cli soak`.
- `kolibri_trace.jsonl` теперь пишет CLI, Python-обвязки убираем.
- `ci_bootstrap.sh` вызывает новые бинарники.

### 5.3 Фронтенд
- `frontend/src/core/kolibri-bridge.ts` заменяет fetch wasm на `kolibri_sim.wasm`; TS-обёртка вызывает экспортированные функции.
- `knowledge.ts` читает `index.json` (C-формат).
- Отладка: добавить TS-типы для новых структур.

## 6. Тестирование
- **Unit:** `tests/test_sim.c` (инициализация, tick, genome блоки), `tests/test_sim_trace.c`, `tests/test_sim_wasm` (через `wasmer` или `wasmtime` CLI).
- **Integration:** `kolibri_sim_cli` soak → проверка метрик, `kolibri_sim_cli tick --trace` → проверка структуры JSONL.
- **Frontend:** обновить `frontend/src/core/__tests__/` для wasm-моста (mock wasm exports).
- **CI:** добавить сборку wasm и CLI в `ci_bootstrap.sh`, обновить GitHub Actions (если есть).

## 7. Миграция
1. Реализовать `kolibri_sim_core` (C API) с тестами.
2. Собрать `kolibri_sim_cli`, переписать soak/trace скрипты.
3. Сгенерировать wasm, заменить фронтенд-мост, адаптировать тесты.
4. Удалить Python-модули `core/kolibri_sim.py`, `core/kolibri_script/genome.py`, `core/tracing.py`, заменив bindings (при необходимости через cffi/pybind только на переходный период).

## 8. Открытые вопросы
- Формат secrets/HMAC (`load_secrets_config`) — нужно перенести на C (возможно, INI или JSON парсер).
- Нужна ли обратная совместимость с Python-API для тестов? (Если да — тонкая обёртка через ctypes над C-библиотекой).
- Как обрабатывать кроссплатформенный момент времени (использовать `double` Unix timestamp, как в текущем формате).
