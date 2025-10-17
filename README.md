# Kolibri OS

Колибри OS — легковесная экспериментальная платформа, объединяющая KolibriScript, симулятор и набор утилит для отладки цифровых сценариев. Этот документ описывает, как развернуть окружение разработчика и запустить основные проверки.

## Требования
- Python 3.10+
- `pip` и `virtualenv`
- Компилятор C/C++ с поддержкой CMake 3.20+
- Ninja либо Make (по желанию)

## Быстрый старт
1. Клонируйте репозиторий и перейдите в директорию проекта.
2. Подготовьте виртуальное окружение Python (поддерживаются версии 3.10+):
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
   python -m pip install --upgrade pip
   ```
3. Установите инструменты, перечисленные в [`requirements.txt`](requirements.txt). Файл включает точные версии `pytest`, `coverage`, `ruff` и `pyright`, которые используются в CI.
   ```bash
   pip install -r requirements.txt
   ```
4. Соберите C-компоненты Kolibri:
   ```bash
   cmake -S . -B build -G "Ninja"  # или опустите -G, чтобы использовать Makefiles
   cmake --build build
   ```

5. Для веб-интерфейса соберите wasm-ядро перед фронтендом:
   ```bash
   ./scripts/build_wasm.sh
   ```
6. Соберите фронтенд (после установки npm-зависимостей в `frontend/`):
   ```bash
   cd frontend
   npm install
   npm run build
   ```
7. Запустите тесты:

   ```bash
   pytest -q
   ruff check .
   pyright
   ctest --test-dir build
   ```

## Проверки качества
- Линтеры Python: `ruff check`, `pyright`
- Политики проекта: `python scripts/policy_validate.py`
- Форматирование C-кода выполняется стандартными средствами компилятора; следуйте существующему стилю файлов в `apps/` и `tests/`.

## Дополнительные ресурсы
- [План релиза](docs/project_plan.md) описывает долгосрочные вехи и критерии готовности.
- Скрипты и утилиты размещены в `scripts/`; каждый скрипт содержит встроенные подсказки по использованию.

## Режимы ответа Kolibri
Kolibri OS поддерживает два режима генерации ответов:

1. **Deterministic KolibriScript** — ответы собираются локально внутри браузера через WebAssembly-мост. Это режим по умолчанию.
2. **LLM Proxy** — запросы проксируются в внешний LLM через FastAPI-сервис.

Чтобы активировать режим LLM, задайте переменные окружения и запустите сервис:

```bash
export KOLIBRI_RESPONSE_MODE=llm
export KOLIBRI_LLM_ENDPOINT="https://llm.example.com/v1/infer"
export KOLIBRI_LLM_API_KEY="<token>"  # опционально
export KOLIBRI_LLM_MODEL="kolibri-pro"  # опционально
export KOLIBRI_LLM_TEMPERATURE="0.7"  # опционально, диапазон 0.0-2.0
export KOLIBRI_LLM_MAX_TOKENS="512"  # опционально, положительное целое
./scripts/run_backend.sh --port 8080
```

Фронтенд ожидает те же настройки через Vite:

```bash
export VITE_KOLIBRI_RESPONSE_MODE=llm
export VITE_KOLIBRI_API_BASE="http://localhost:8080/api"
npm --prefix frontend run dev
```

Если `VITE_KOLIBRI_RESPONSE_MODE` не равен `llm`, интерфейс автоматически вернётся к KolibriScript. При ошибке LLM фронтенд повторит запрос через KolibriScript и дополнит ответ примечанием о деградации.

