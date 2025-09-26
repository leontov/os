#ifndef KOLIBRI_DECIMAL_H
#define KOLIBRI_DECIMAL_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint8_t *cifry;
    size_t emkost;
    size_t dlina;
    size_t poziciya;
} kolibri_potok_cifr;

/* Инициализирует поток цифр поверх внешнего буфера. */
void kolibri_potok_cifr_init(kolibri_potok_cifr *potok, uint8_t *bufer,
                             size_t emkost);

/* Сбрасывает состояние потока и очищает буфер цифр. */
void kolibri_potok_cifr_sbros(kolibri_potok_cifr *potok);

/* Возвращает указатель чтения в начало последовательности. */
void kolibri_potok_cifr_vernutsya(kolibri_potok_cifr *potok);

/* Добавляет новую цифру 0-9 в поток. */
int kolibri_potok_cifr_push(kolibri_potok_cifr *potok, uint8_t cifra);

/* Считывает следующую цифру из потока. */
int kolibri_potok_cifr_chitat(kolibri_potok_cifr *potok, uint8_t *cifra);

/* Возвращает количество оставшихся цифр для чтения. */
size_t kolibri_potok_cifr_ostalos(const kolibri_potok_cifr *potok);

/* Преобразует байтовый поток UTF-8 в последовательность цифр. */
int kolibri_transducirovat_utf8(kolibri_potok_cifr *potok,
                                const unsigned char *bajty, size_t dlina);

/* Восстанавливает байты UTF-8 из последовательности цифр. */
int kolibri_izluchit_utf8(const kolibri_potok_cifr *potok, unsigned char *vyhod,
                          size_t vyhod_dlina, size_t *zapisano);

/* Возвращает требуемую длину массива цифр для строки заданной длины. */
size_t kolibri_dlina_kodirovki_teksta(size_t dlina_vhoda);

/* Возвращает длину результирующей строки при декодировании массива цифр. */
size_t kolibri_dlina_dekodirovki_teksta(size_t dlina_cifr);

/* Кодирует текст в цифровое представление без промежуточных строк. */
int kolibri_kodirovat_text(const char *vhod, char *vyhod, size_t vyhod_dlina);

/* Декодирует цифровую последовательность обратно в строку UTF-8. */
int kolibri_dekodirovat_text(const char *cifry, char *vyhod, size_t vyhod_dlina);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_DECIMAL_H */
