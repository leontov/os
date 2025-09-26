# Kolibri Developer Guide / Руководство разработчика / 开发者指南

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Purpose / Назначение / 目的

Документ описывает требования к разработке Kolibri: сборка, тестирование, линтинг, код-стайл и процесс внесения изменений.

---

## 2. Build Workflow / Процесс сборки / 构建流程

### Русский
1. Установите инструменты: `cmake`, `nasm`, `grub-mkrescue`, `xorriso`, поддержку `-m32` (например, `gcc-multilib`) и Emscripten (`emcc`).
2. Выполните `make` для базовой сборки бинарников и создания каталога `build/`.
3. Команда `make check` запустит `ctest`, соберёт ISO (`scripts/build_iso.sh`) и сформирует `build/wasm/kolibri.wasm` с проверкой лимита <1 МБ.
4. Для чистой сборки используйте `make clean`.
5. `./kolibri.sh up` соберёт проект, при необходимости создаст `root.key` и поднимет одиночный узел.
6. `./scripts/run_cluster.sh` разворачивает локальный рой, генерирует общий ключ `swarm.key` и управляет временем жизни процессов.
7. `./scripts/run_all.sh` выполняет полный цикл: сборку, тесты, артефакты ISO/WASM и короткий запуск роя.

### English
Install `cmake`, `nasm`, `grub-mkrescue`, `xorriso`, a compiler with `-m32` support (e.g. `gcc-multilib`), and Emscripten. Run `make` followed by `make check` to execute `ctest`, build the ISO image, and produce `build/wasm/kolibri.wasm` under the 1 MB budget. Use `make clean` for a fresh build. `./kolibri.sh up` starts a single node (creating `root.key` automatically), `./scripts/run_cluster.sh` spins up a local swarm with a shared `swarm.key`, and `./scripts/run_all.sh` chains all stages including a short swarm run.

### 中文
请安装 `cmake`、`nasm`、`grub-mkrescue`、`xorriso`、支持 `-m32` 的编译器（例如 `gcc-multilib`）以及 Emscripten。运行 `make` 后执行 `make check`，依次完成 `ctest`、ISO 构建及 `build/wasm/kolibri.wasm` 生成（并保证尺寸 <1MB）。如需全新编译可使用 `make clean`。脚本 `./kolibri.sh up` 会创建 `root.key` 并启动单节点，`./scripts/run_cluster.sh` 可部署本地蜂群并生成共享的 `swarm.key`，`./scripts/run_all.sh` 则会串联全部流程并短暂运行蜂群。

---

## 3. Testing Matrix / Матрица тестирования / 测试矩阵

| Layer | Command | Notes |
|-------|---------|-------|
| Unit tests | `make test` | Покрывают decimal/genome/formula/roy. |
| Full check | `make check` | Запускает тесты, сборку ISO и wasm с проверкой лимитов. |
| Property tests | встроены в `tests/test_decimal.c` и `tests/test_formula.c` | Используют случайные входы с фиксированным seed. |
| Static analysis | `clang-tidy backend/src/*.c apps/kolibri_node.c -- -Ibackend/include` | Выполняется при изменении C-кода. |
| Integration | `./scripts/run_cluster.sh` | Разворачивает локальный рой и проверяет обмен формулами. |
| Full pipeline | `./scripts/run_all.sh` | Запускает сборку, тесты, артефакты и короткий прогон роя. |

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

## 7. Release Checklist / Чек-лист релиза / 发布清单

1. `make check` (включая ISO и wasm) и `./kolibri.sh up` без ошибок.
2. `clang-tidy` для затронутых исходников.
3. Обновлённые документы и ссылки в `README.md`.
4. Проверка отсутствия секретов и бинарных артефактов в репозитории.
5. Создание PR с описанием изменений и ссылкой на задачу.

