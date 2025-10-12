# Decimal Cognition Layer / Слой десятичного мышления / 十进制认知层

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Goals / Цели / 目标

- Унифицировать внутреннее представление знаний в виде цифр `0–9`.
- Обеспечить обратимую трансформацию текстовых данных.
- Подготовить данные для дальнейшей обработки формульным пулом.

---

## 2. API Summary / Сводка API / API 概览

| Function | Description |
|----------|-------------|

| `void k_digit_stream_init(k_digit_stream*, uint8_t *buf, size_t cap);` | Инициализирует поток цифр поверх внешнего буфера. |
| `int k_digit_stream_push(k_digit_stream*, uint8_t digit);` | Добавляет цифру `0–9`, экономя память за счёт повторного использования буфера. |
| `int k_transduce_utf8(k_digit_stream*, const unsigned char *bytes, size_t len);` | Превращает произвольный байтовый поток в последовательность цифр без промежуточных строк. |
| `int k_emit_utf8(const k_digit_stream*, unsigned char *out, size_t out_len, size_t *written);` | Восстанавливает байты из потока цифр. |
| `size_t k_encode_text_length(size_t input_len);` | Возвращает длину буфера цифр для строки длиной `input_len`. |
| `int k_encode_text(const char *input, char *out, size_t out_len);` | Обёртка над потоковым API для быстрого кодирования UTF-8. |
| `size_t k_decode_text_length(size_t digits_len);` | Оценивает длину строки при декодировании. |
| `int k_decode_text(const char *digits, char *out, size_t out_len);` | Обратная обёртка, использующая потоковую реконструкцию. |

| `size_t k_encode_text_length(size_t input_len);` | Возвращает длину буфера цифр для строки длиной `input_len`. |
| `int k_encode_text(const char *input, char *out, size_t out_len);` | Кодирует UTF-8 строку в последовательность цифр (ASCII `0`–`9`). |
| `size_t k_decode_text_length(size_t digits_len);` | Оценивает длину строки при декодировании. |
| `int k_decode_text(const char *digits, char *out, size_t out_len);` | Восстанавливает оригинальный текст из десятичного представления. |


Возврат `0`/`-1` сигнализирует о нехватке буфера или неверных данных.

---

## 3. Encoding Scheme / Схема кодирования / 编码方案

### Русский
Каждый байт текста преобразуется в три десятичные цифры (000–255). Пример: символ `A` (0x41) → `065`. В результате строка «Hi» становится `072105`.

### English
Each byte is turned into a zero-padded decimal triplet (`000`–`255`). The encoded string length equals `input_len * 3`.

### 中文
每个字节转换为三位十进制数字（前导零补齐），编码后的长度为 `input_len * 3`。

---

## 4. Buffer Management / Управление буферами / 缓冲区管理


1. Выделите повторно используемый буфер `uint8_t digits[N]`.
2. Проинициализируйте `k_digit_stream` и передайте его в `k_transduce_utf8`.
3. При необходимости очистите поток `k_digit_stream_reset` без перераспределения памяти.
4. Для совместимости с существующим кодом доступны обёртки `k_encode_text`/`k_decode_text`.

1. Вызовите `k_encode_text_length` для определения размера выходного массива.
2. Добавьте один байт под завершающий `\0`.
3. При декодировании учитывайте, что длина должна делиться на 3.


---

## 5. Error Handling / Обработка ошибок / 错误处理

- Нулевые указатели → `-1`.
- Недостаточный `out_len` → `-1`.
- Недопустимые символы (не цифры) при декодировании → `-1`.

---

## 6. Usage Example / Пример использования / 使用示例

```c

uint8_t digits[96];
k_digit_stream stream;
k_digit_stream_init(&stream, digits, sizeof(digits));
const unsigned char raw[] = {0x4b, 0x6f, 0x6c};
if (k_transduce_utf8(&stream, raw, sizeof(raw)) == 0) {
    unsigned char decoded[8];
    size_t produced = 0;
    k_emit_utf8(&stream, decoded, sizeof(decoded), &produced);

char digits[64];
if (k_encode_text("Kolibri", digits, sizeof(digits)) == 0) {
    // digits содержит последовательность цифр

}
```

---

## 7. Integration Notes / Заметки по интеграции / 集成说明


- REPL узла и сетевые сообщения теперь используют потоковую трансдукцию без промежуточных строк.
- Цифровая канва (`:canvas`) напрямую читает `k_digit_stream`, сохраняя память и обеспечивая фрактальное отображение.
- Результаты обучения, записываемые в геном, кодируются тем же механизмом для воспроизводимости.

- Входы REPL и сетевые сообщения проходят через этот слой.
- Результаты обучения, записываемые в геном, также могут кодироваться для совместимости между узлами.



# Decimal Cognition Layer / Слой десятичного мышления / 十进制认知层

**Copyright (c) 2025 Кочуров Владислав Евгеньевич**

---

## 1. Goals / Цели / 目标

- Унифицировать внутреннее представление знаний в виде цифр `0–9` (decimal-first).
- Гарантировать обратимость кодирования/декодирования UTF‑8 без промежуточных строк.
- Подготовить поток цифр к последующей обработке формульным конвейером χ→Φ→S→EMIT.
- Минимизировать аллокации и копирование: потоковое API, повторное использование буферов.

---

## 2. Terms & Invariants / Термины и инварианты / 术语与不变式

- **Digit stream** — последовательность символов `0–9`, построенная из входных байтов.
- **Reversible** — каждый входной байт восстанавливается из трёх десятичных цифр (триплет).
- **Invariant:** длина закодированной строки = `3 * input_len`.
- **Invariant:** при декодировании длина должна делиться на `3` без остатка.

---

## 3. Public API / Публичный API / 公共 API

| Function | Description |
|----------|-------------|
| `void k_digit_stream_init(k_digit_stream* s, uint8_t *buf, size_t cap);` | Инициализирует поток цифр поверх внешнего буфера (без аллокаций). |
| `void k_digit_stream_reset(k_digit_stream* s);` | Сбрасывает счётчики потока, буфер переиспользуется. |
| `int k_digit_stream_push(k_digit_stream* s, uint8_t digit);` | Добавляет одну цифру `0–9`; `0` — ok, `-1` — нет места/не цифра. |
| `int k_transduce_utf8(k_digit_stream* s, const unsigned char *bytes, size_t len);` | Потоковое преобразование байтов UTF‑8 в десятичные цифры (000–255). |
| `int k_emit_utf8(const k_digit_stream* s, unsigned char *out, size_t out_len, size_t *written);` | Восстанавливает байты из потока цифр в `out`; пишет фактический объём в `written`. |
| `size_t k_encode_text_length(size_t input_len);` | Возвращает точную длину буфера под цифры для строки длиной `input_len` (без учёта завершающего `\0`). |
| `int k_encode_text(const char *input, char *out, size_t out_len);` | Обёртка над потоковым API: быстрый encode UTF‑8→digits. Возвращает `0`/`-1`. |
| `size_t k_decode_text_length(size_t digits_len);` | Оценивает длину результирующей строки при decode. |
| `int k_decode_text(const char *digits, char *out, size_t out_len);` | Обратная обёртка: digits→UTF‑8. Возвращает `0`/`-1`. |

**Коды возврата:** `0` — успех; `-1` — некорректные входные данные или недостаточный буфер.

---

## 4. Encoding Scheme / Схема кодирования / 编码方案

**Русский / English / 中文**

Каждый байт входа преобразуется в три десятичные цифры (с ведущими нулями) в диапазоне `000–255`.
Примеры: `A (0x41)` → `065`; строка `Hi` → `072105`.
Encoded length = `input_len * 3`.

---

## 5. Buffer Management / Управление буферами / 缓冲区管理

1. Предварительно выделите повторно используемый буфер: `uint8_t digits[N]`.
2. Вызовите `k_digit_stream_init(&s, digits, sizeof(digits))`.
3. Преобразуйте вход: `k_transduce_utf8(&s, bytes, len)`.
4. Для декодирования вызовите `k_emit_utf8(&s, out, out_len, &written)`.
5. Для совместимости доступны обёртки `k_encode_text`/`k_decode_text`.
6. Длину выходного массива под encode определяйте через `k_encode_text_length(input_len)` и добавляйте `+1` байт под завершающий `\0`.

---

## 6. Error Handling / Обработка ошибок / 错误处理

- Нулевые указатели → `-1`.
- `out_len` недостаточен → `-1`.
- При decode встречены недопустимые символы (не цифры) или длина не кратна 3 → `-1`.

---

## 7. Complexity & Performance / Сложность и производительность

- Время: `O(n)` по длине входа; одна константная запись/чтение на цифру.
- Память: потоковый режим без промежуточных строк; переиспользование внешнего буфера.

---

## 8. Security Notes / Замечания по безопасности

- Формат детерминирован и полностью обратим — не используйте как шифрование.
- Для целостности пакетов используйте HMAC‑SHA256 (см. `tools/sign_trace.py`).

---

## 9. Usage Examples / Примеры использования / 使用示例

### A) Stream API
```c
// Буфер для цифр
uint8_t digits[96];
k_digit_stream s;
k_digit_stream_init(&s, digits, sizeof(digits));

// Исходные байты
const unsigned char raw[] = {0x4b, 0x6f, 0x6c}; // "Kol"
if (k_transduce_utf8(&s, raw, sizeof(raw)) == 0) {
    unsigned char decoded[8];
    size_t produced = 0;
    if (k_emit_utf8(&s, decoded, sizeof(decoded), &produced) == 0) {
        // decoded[0..produced) содержит исходные байты
    }
}
```

### B) Convenience wrappers
```c
char digits_out[64];
if (k_encode_text("Kolibri", digits_out, sizeof(digits_out)) == 0) {
    char text_out[32];
    if (k_decode_text(digits_out, text_out, sizeof(text_out)) == 0) {
        // text_out содержит исходную строку
    }
}
```

---

## 10. Integration Notes / Заметки по интеграции / 集成说明

- Входы REPL и сетевые сообщения проходят через потоковую трансдукцию без промежуточных строк.
- Цифровая канва (`:canvas`) напрямую читает `k_digit_stream`, обеспечивая фрактальное отображение и экономию памяти.
- Результаты обучения, сохраняемые в геном/трассы, кодируются тем же механизмом для воспроизводимости.

---

## 11. Versioning / Версионирование

- Документ приведён к консистентной спецификации: устранены дубликаты таблиц API, исправлены примеры кода и закрытия блоков.