# KOLIBRI-Σ Core Specification v1.0-draft

Эта спецификация описывает офлайн-ядро KOLIBRI-Σ: структуру данных, микровиртуальную машину и WebAssembly-ABI. Документ служит отправной точкой для участников Kolibri Improvement Proposals (KIP) и производителей офлайн-устройств.

## 1. Архитектура ядра

### 1.1 Память

* **Арена (arena)** — набор страниц по 4 КБ с монотонным bump-аллокатором и счётчиком фрагментации. Используется для узлов DAAWG и их ребёр.
* **Стандартные выделения** (`malloc/calloc/free`) применяются лишь для бытовых структур (случайные стеки при сериализации, буферы вывода).

### 1.2 Обратимые скетчи

* Состояние скетча — пара `(state, checksum)` (64 бита).
* Обновление: `state <- rotl(state ^ f(byte), 7) + φ`, `checksum <- checksum ^ rotl(state, τ)`.
* Композиция: `compose(a,b) = rotl(a,17) ^ rotl(b,29) ^ (a + μ*b)`.
* Подсказка восстановления (`trace_hint`) = `rotl(checksum,11) ^ (state + salt*FNV)`.

### 1.3 DAAWG

* Узел: `depth`, `frequency`, `children[]`, `boundary_flags`, `sketch`.
* Ребро: `symbol`, `frequency`, `flags`, `target`.
* **Мерджинг**: после вставки вычисляется сигнатура (`frequency`, `child_count`, хэши детей), используется open-addressing hash-table для переиспользования изоморфных поддеревьев.
* **Орбиты**: генератор выбирает ребро по `freq + noise`, с возвратом в аттрактор при наличии `boundary_flags`.

### 1.4 Микро-VM

* Формат инструкции: `(opcode, operand_index, operand_value)`.
* Опкоды: `PUSH_CONST`, `PUSH_CTX`, `ADD`, `SUB`, `MUL`, `DIV`, `MIN`, `MAX`, `SIGMOID`, `TANH`, `ABS`, `CLAMP01`, `NOISE`, `END`.
* Контекст (`ctx[0..15]`): счётчики использования, бюджеты ширины/глубины, энергия/фаза, метрики окна, случайный шум.

### 1.5 Резонансное голосование

* Каждое ядро отдаёт `(energy, phase, weight, bias[10])`.
* Итоговые скоринги: `score[j] = Σ_d weight_d * (bias_d[j] + energy_d) * cos(phase_d - phase_j)`.
* Выбор: сортировка по score, top-k с температурой, детерминированный выбор `k=1`.

## 2. API (C/WASM)

| Экспорт                    | Подпись                                   | Описание                                         |
|----------------------------|-------------------------------------------|--------------------------------------------------|
| `k_state_new`              | `KState* k_state_new(void)`              | Создать новое состояние и сделать активным.      |
| `k_state_free`             | `void k_state_free(void)`                | Освободить активное состояние.                   |
| `k_state_save`             | `size_t k_state_save(uint8_t*, size_t)`  | Сериализовать состояние в буфер.                 |
| `k_state_load`             | `int k_state_load(const uint8_t*, size_t)` | Загрузить состояние из буфера.                  |
| `k_observe`                | `int k_observe(const uint8_t*, size_t)`  | Индукция (обновление графов цифр).               |
| `k_decode`                 | `size_t k_decode(const uint8_t*, size_t, uint8_t*, size_t, int, int)` | Генерация ответа. |
| `k_digit_add_syll`         | `int k_digit_add_syll(uint32_t, const uint8_t*, size_t)` | Ручное добавление слога. |
| `k_profile`                | `size_t k_profile(uint32_t, uint8_t*, size_t)` | Диагностика и метрики ядра.                 |
| `kolibri_bridge_init/reset/execute` | Совместимость с текущим фронтендом. | Тонкая обёртка поверх нового API.              |

## 3. Формат snapshot

```
struct Snapshot {
  uint32 version = 1;
  double limit_b;
  double limit_d;
  double usage[10];
  double transitions[10][10];
  double window_b[128];
  double window_d[128];
  uint32 window_index;
  uint32 window_size;
  uint64 rng_state;
  Digit digits[10];
}

struct Digit {
  float bias[10];
  float energy;
  float phase;
  float weight;
  double budget_b;
  double budget_d;
}
```

> TODO: v1.1 дополнит структуруми DAAWG и скетчей, чтобы полностью восстанавливать граф.

## 4. Метрики и профили

`k_profile()` возвращает JSON:

```json
{
  "limit_b": 240.0,
  "limit_d": 160.0,
  "budget_b": 17.5,
  "budget_d": 9.1,
  "usage": [2.0, 1.0, ...],
  "window": 24,
  "fragmentation": 1024
}
```

* **Conserved-B/D Ratio** — `budget_b/limit_b`, `budget_d/limit_d`.
* **Stability@k** — доля повторяемых орбит при вариациях top-k.
* **Auditability** — процент восстанавливаемых треков по `trace_hint`.

## 5. Дорожная карта эволюции спецификации

1. **v1.0** — стабилизация API, описание микро-VM и снапшотов.
2. **v1.1** — формализация экспорта DAAWG, сигнатур и обратимых путей.
3. **v1.2** — ввод стандартов для SDK (TS/Python) и KIP-процесса.

## 6. Политика совместимости

* WebAssembly таргет: `wasm32-unknown-emscripten`, `-msimd128`, без роста памяти по умолчанию (опционально включаемый).
* Лицензия ядра: MPL-2.0, совместима с закрытыми приложениями при публикации модификаций ядра.
* Сценарии проверки: `scripts/build_wasm.sh` (сборка), `scripts/generate_sbom.py` (SBOM), `scripts/sign_wasm.sh` (подпись).

