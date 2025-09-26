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
| `void kolibri_potok_cifr_init(kolibri_potok_cifr*, uint8_t *buf, size_t emkost);` | Инициализирует поток цифр поверх внешнего буфера. |
| `void kolibri_potok_cifr_sbros(kolibri_potok_cifr*);` | Очищает последовательность и возвращает указатели в начало. |
| `void kolibri_potok_cifr_vernutsya(kolibri_potok_cifr*);` | Перемещает курсор чтения в позицию `0`. |
| `int kolibri_potok_cifr_push(kolibri_potok_cifr*, uint8_t cifra);` | Добавляет цифру `0–9`, избегая перераспределений. |
| `int kolibri_potok_cifr_chitat(kolibri_potok_cifr*, uint8_t *cifra);` | Считывает следующую цифру; `1` = конец данных. |
| `size_t kolibri_potok_cifr_ostalos(const kolibri_potok_cifr*);` | Сообщает, сколько цифр доступно для чтения. |
| `int kolibri_transducirovat_utf8(kolibri_potok_cifr*, const unsigned char *bajty, size_t dlina);` | Превращает произвольный байтовый поток в последовательность цифр без промежуточных строк. |
| `int kolibri_izluchit_utf8(const kolibri_potok_cifr*, unsigned char *vyhod, size_t vyhod_dlina, size_t *zapisano);` | Восстанавливает байты из потока цифр. |
| `size_t kolibri_dlina_kodirovki_teksta(size_t dlina_vhoda);` | Возвращает длину цифрового буфера для строки длиной `dlina_vhoda`. |
| `size_t kolibri_dlina_dekodirovki_teksta(size_t dlina_cifr);` | Оценивает длину строки при обратном преобразовании. |
| `int kolibri_kodirovat_text(const char *vhod, char *vyhod, size_t vyhod_dlina);` | Обёртка над потоковым API для быстрого кодирования UTF-8. |
| `int kolibri_dekodirovat_text(const char *cifry, char *vyhod, size_t vyhod_dlina);` | Обратная обёртка, использующая потоковую реконструкцию. |

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

1. Выделите повторно используемый буфер `uint8_t cifry[N]`.
2. Проинициализируйте `kolibri_potok_cifr` и передайте его в `kolibri_transducirovat_utf8`.
3. При необходимости очистите поток `kolibri_potok_cifr_sbros` без перераспределения памяти.
4. Для совместимости с высокоуровневым кодом доступны обёртки `kolibri_kodirovat_text`/`kolibri_dekodirovat_text`.

---

## 5. Error Handling / Обработка ошибок / 错误处理

- Нулевые указатели → `-1`.
- Недостаточный `vyhod_dlina` → `-1`.
- Недопустимые символы (не цифры) при декодировании → `-1`.

---

## 6. Usage Example / Пример использования / 使用示例

```c
uint8_t cifry[96];
kolibri_potok_cifr potok;
kolibri_potok_cifr_init(&potok, cifry, sizeof(cifry));
const unsigned char syroe[] = {0x4b, 0x6f, 0x6c};
if (kolibri_transducirovat_utf8(&potok, syroe, sizeof(syroe)) == 0) {
    unsigned char dekodirovannye[8];
    size_t proizvedeno = 0;
    kolibri_izluchit_utf8(&potok, dekodirovannye, sizeof(dekodirovannye), &proizvedeno);
}
```

---

## 7. Integration Notes / Заметки по интеграции / 集成说明

- REPL узла и сетевые сообщения используют потоковую трансдукцию без промежуточных строк.
- Цифровая канва (`:canvas`) напрямую читает `kolibri_potok_cifr`, сохраняя память и обеспечивая фрактальное отображение.
- Результаты обучения, записываемые в геном, кодируются тем же механизмом для воспроизводимости.
