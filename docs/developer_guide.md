# Kolibri Developer Guide / Руководство разработчика / 开发者指南

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Purpose / Назначение / 目的

Документ описывает требования к разработке Kolibri: сборка, тестирование, линтинг, код-стайл и процесс внесения изменений.

---

## 2. Build Workflow / Процесс сборки / 构建流程

### Русский
1. Установите зависимости компилятора C11 и `cmake` (при необходимости).
2. Выполните `make` для генерации бинарников в `build/`.
3. Для чистой сборки используйте `make clean`.
4. Скрипт `./kolibri.sh up` выполняет последовательность: сборка, тесты, запуск локального роя.

**Линковка библиотек**
- `libkolibri_core.a` содержит C-рантайм (скрипты, геном, сеть). Подключайте через `target_link_libraries(foo PRIVATE kolibri_core)` либо `-lkolibri_core -lssl -lsqlite3` при использовании собственных Makefile.
- `libkolibri_wasm.a` объединяет мостовые функции для wasm. Для встраивания в приложение добавьте `target_link_libraries(foo PRIVATE kolibri_wasm)`; библиотека зависит от `libkolibri_core`.
- Флаг `-fPIC` включён по умолчанию, поэтому артефакты можно использовать и как статические, и как дочерние части динамических библиотек.
- Для подключения в стороннем проекте используйте экспортируемые заголовки из `backend/include/kolibri/` и добавьте путь `-I/path/to/kolibri/backend/include`.
- macOS (Homebrew): установите `openssl@3` и перед конфигурацией задайте `OPENSSL_ROOT_DIR=$(brew --prefix openssl@3)` либо добавьте `-DOPENSSL_ROOT_DIR=$(brew --prefix openssl@3)` в команду `cmake`, чтобы корректно подхватить импортируемую цель `OpenSSL::Crypto`.

### English
Run `make`, `make test`, and `./kolibri.sh up` after source changes. Use `cmake --build build` for IDE-generated projects.

### 中文
修改源码后依次执行 `make`、`make test` 与 `./kolibri.sh up`。若使用 IDE，可通过 `cmake --build build` 构建。

---

## 3. Testing Matrix / Матрица тестирования / 测试矩阵

| Layer | Command | Notes |
|-------|---------|-------|
| Unit tests | `make test` | Покрывают decimal/genome/formula/net. |
| Property tests | встроены в `tests/test_formula.c` | Используют случайные входы с фиксированным seed. |
| Static analysis | `clang-tidy backend/src/*.c apps/kolibri_node.c -- -Ibackend/include` | Выполняется при изменении C-кода. |
| Integration | `./kolibri.sh up` | Стартует два узла и проверяет обмен формулами. |
| Fuzzing | `cmake -S . -B build-fuzz -DKOLIBRI_ENABLE_FUZZ=ON && cmake --build build-fuzz && ./build-fuzz/kolibri_fuzz_script -runs=1000` | Использует libFuzzer; nightly workflow `Kolibri Nightly Fuzz` запускается автоматически. |

*Документационные изменения не требуют запуска тестов, однако в коммит-сообщении нужно явно указывать причину пропуска.*

---

## 4. Coding Standards / Стандарты кодирования / 编码规范

- Соблюдайте C11, избегайте нестандартных расширений.
- Новые заголовочные файлы размещайте в `backend/include/kolibri/` с защитой `#ifndef`/`#define`.
- Логирование: используйте существующие макросы `printf`/`fprintf` с префиксами `[INFO]`, `[ERROR]`.
- Детеминизм: все генераторы случайных чисел принимают seed.
- Добавляйте авторскую строку в новые файлы.

---

## 5. Git & Commits / Git и коммиты / Git 提交

- Работайте в ветке `main` без дополнительных веток.
- Используйте Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`.
- Перед коммитом убедитесь, что `git status` чист и тесты успешны.
- При изменении CLI/протоколов обновляйте `README.md`, `docs/`, и при необходимости `docs/api_spec.yaml`.

---

## 6. Documentation Policy / Политика документации / 文档策略

- Все новые возможности сопровождаются многоязычным описанием (RU/EN/ZH) в соответствующих файлах.
- Научные результаты отражаются в `docs/kolibri_integrated_prototype.md`.
- Эта папка (`docs/`) является единственным источником истины для проектной документации.

---

## 7. Versioning & Compatibility / Правила версионирования / 版本与兼容性

### Русский
- Проект использует [SemVer](https://semver.org/lang/ru/): `MAJOR.MINOR.PATCH`.
- Стабильные интерфейсы перечислены в `docs/public_interfaces.md`. Изменение их сигнатур допускается только в `MAJOR`-релизах.
- Новые возможности добавляются в минорных релизах. Флаговые функции должны иметь значение по умолчанию, совместимое с предыдущими версиями.
- Исправления ошибок выпускаются как patch-релизы и не меняют поведение за пределами устранённой проблемы.
- Формат генома, сетевые протоколы и трассировочные журналы объявляются стабильными в рамках текущего `MAJOR`. Любые изменения требуют записи в changelog и миграционного плана.

### English
- The project follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.
- Stable interfaces are documented in `docs/public_interfaces.md`. Breaking changes require a new major release.
- Feature work lands in minor releases. Feature flags must default to backwards-compatible behaviour.
- Bug fixes ship as patch releases with no behavioural surprises beyond the fix.
- Genome format, network protocols, and tracing events stay stable within a major release. Changes must be documented together with migration steps.

### 中文
- 项目采用 [语义化版本](https://semver.org/lang/zh-CN/)：`主.次.修订`。
- 稳定接口记录在 `docs/public_interfaces.md`，任何破坏性调整都需要新的主版本。
- 新功能进入次版本，特性开关的默认值必须保持向后兼容。
- Bug 修复作为修订版发布，不引入额外行为变化。
- 基因组格式、网络协议和追踪事件在同一主版本内保持稳定，变更需在 changelog 中说明并给出迁移方案。

### Changelog Policy / Политика changelog / 更新日志策略
- Для каждого релиза обновляйте `CHANGELOG.md`, соблюдая формат [Keep a Changelog](https://keepachangelog.com/).
- Делите записи на разделы `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Отмечайте компонент (`C API`, `CLI`, `Python`, `Frontend`, `Docs`) и воздействие на потребителей (например, `BREAKING`, `Experimental`).

---

## 8. Release Checklist / Чек-лист релиза / 发布清单

### CI Pipeline / Конвейер CI / CI 流水线
- GitHub Actions запускает ступени:
  - `python-quality`: `ruff`, `pyright`, `pytest`.
  - `core-build`: CMake/ctest, сборка ISO и подпись cosign.
  - `wasm-build`: `scripts/build_wasm.sh`, SHA256 и подпись wasm-модуля.
  - `frontend-build`: `npm ci`, `npm run build`, `vitest --runInBand`, упаковка `dist/`.
  - `docker-smoke`: `docker build` backend/indexer/frontend и smоke-тест `scripts/deploy_linux.sh --skip-pull`.
  - `release-bundle`: генерация `release-manifest.json` и выгрузка подписанных артефактов.
- Артефакты и подписи публикуются как release artifacts (ISO, wasm, фронтенд `dist/`, Docker-образы).
- Проверка подписей выполняется `cosign verify-blob` на скачанных бинарниках.
- Автоматически генерируйте changelog-выдержку (`scripts/run_all.sh changelog`) и приложите к релизу.

### Manual Validation / Ручная проверка / 手动验证
1. `make`, `make test`, `./kolibri.sh up` без ошибок на локальном окружении.
2. `clang-tidy backend/src/*.c apps/kolibri_node.c -- -Ibackend/include`.
3. `npm run preview --prefix frontend` и ручная проверка UI против контрольного сценария.
4. Проверка отсутствия секретов и бинарных артефактов в репозитории (`scripts/policy_validate.py`).
5. Обновите `CHANGELOG.md`, `docs/public_interfaces.md` (если требуется) и `README.md`.

### Release Publishing / Публикация / 发布
- Используйте артефакт GitHub Actions `kolibri-release-bundle`
- Workflow `run-all` выполняет `scripts/run_all.sh --skip-cluster` в CI для smoke-проверки., который содержит `release-manifest.json`, контрольные суммы и подписи. При необходимости синхронизируйте содержимое в `deploy/release-manifests/<version>/`.
- Создайте PR с описанием изменений, ссылками на тикеты и чек-листом релиза.
- После merge создайте Git tag `vMAJOR.MINOR.PATCH`, прикрепите артефакты и changelog.
- Распространите уведомление команде поддержки и обновите внутренние трекеры.

---

## 9. Knowledge Pipeline / Конвейер знаний / 知识管线

- **RU:** Для построения актуального снапшота знаний выполните `./scripts/knowledge_pipeline.sh docs data`. Артефакты появятся в `build/knowledge/index.json` и `build/knowledge/manifest.json`.
- **EN:** Generate a fresh knowledge snapshot with `./scripts/knowledge_pipeline.sh docs data`. The tool writes `build/knowledge/index.json` and `build/knowledge/manifest.json`.
- **ZH:** 运行 `./scripts/knowledge_pipeline.sh docs data` 可生成最新知识快照，结果保存在 `build/knowledge/index.json` 与 `build/knowledge/manifest.json`。

- **RU:** Предварительная модерация новых материалов: используйте `./build/kolibri_queue enqueue --db build/knowledge/queue.db --title ... --content ...` для добавления заявок, `list` для просмотра и `moderate` для утверждения или отклонения. Одобренные записи автоматически попадают в снапшот.
- **EN:** For moderation, run `./build/kolibri_queue enqueue --db build/knowledge/queue.db --title ... --content ...`, then `list` and `moderate` to approve/reject entries. Approved submissions are exported into the snapshot automatically.
- **ZH:** 新素材需通过 `./build/kolibri_queue enqueue --db build/knowledge/queue.db --title ... --content ...` 提交，可用 `list` 查看，`moderate` 审核，批准后会自动进入知识快照。

---

## 10. Simulation CLI / CLI симулятора / 模拟器命令

- **RU:** Для локальных проверок используйте `./build/kolibri_sim tick --seed 123 --steps 60` или длительный прогон `./build/kolibri_sim soak --minutes 10 --log logs/kolibri.jsonl`.
- **EN:** Run short diagnostics with `./build/kolibri_sim tick --seed 123 --steps 60` or soak sessions via `./build/kolibri_sim soak --minutes 10 --log logs/kolibri.jsonl`.
- **ZH:** 可运行 `./build/kolibri_sim tick --seed 123 --steps 60` 进行快速检查，或使用 `./build/kolibri_sim soak --minutes 10 --log logs/kolibri.jsonl` 长时间测试。
