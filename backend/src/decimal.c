/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/decimal.h"

#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* Проверяет, доступно ли ещё место в потоке цифр. */
static int proverit_mesto(kolibri_potok_cifr *potok) {
    if (!potok || !potok->cifry) {
        return -1;
    }
    if (potok->dlina >= potok->emkost) {
        return -1;
    }
    return 0;
}

/* Инициализирует поток поверх заранее выделенного буфера. */
void kolibri_potok_cifr_init(kolibri_potok_cifr *potok, uint8_t *bufer,
                             size_t emkost) {
    if (!potok) {
        return;
    }
    potok->cifry = bufer;
    potok->emkost = emkost;
    potok->dlina = 0;
    potok->poziciya = 0;
    if (potok->cifry && potok->emkost > 0) {
        memset(potok->cifry, 0, potok->emkost);
    }
}

/* Полностью очищает поток и возвращает его в исходное состояние. */
void kolibri_potok_cifr_sbros(kolibri_potok_cifr *potok) {
    if (!potok || !potok->cifry) {
        return;
    }
    memset(potok->cifry, 0, potok->emkost);
    potok->dlina = 0;
    potok->poziciya = 0;
}

/* Перемещает курсор чтения на начало последовательности. */
void kolibri_potok_cifr_vernutsya(kolibri_potok_cifr *potok) {
    if (!potok) {
        return;
    }
    potok->poziciya = 0;
}

/* Добавляет цифру в конец последовательности. */
int kolibri_potok_cifr_push(kolibri_potok_cifr *potok, uint8_t cifra) {
    if (cifra > 9) {
        return -1;
    }
    if (proverit_mesto(potok) != 0) {
        return -1;
    }
    potok->cifry[potok->dlina++] = cifra;
    return 0;
}

/* Считывает очередную цифру из последовательности. */
int kolibri_potok_cifr_chitat(kolibri_potok_cifr *potok, uint8_t *cifra) {
    if (!potok || !cifra) {
        return -1;
    }
    if (potok->poziciya >= potok->dlina) {
        return 1;
    }
    *cifra = potok->cifry[potok->poziciya++];
    return 0;
}

/* Возвращает количество доступных для чтения цифр. */
size_t kolibri_potok_cifr_ostalos(const kolibri_potok_cifr *potok) {
    if (!potok) {
        return 0;
    }
    if (potok->poziciya >= potok->dlina) {
        return 0;
    }
    return potok->dlina - potok->poziciya;
}

/* Подсчитывает количество цифр в десятичном представлении величины. */
static size_t kolibri_podschitat_cifry(uint64_t velichina) {
    size_t schetchik = 0U;
    do {
        schetchik++;
        velichina /= 10ULL;
    } while (velichina > 0ULL);
    return schetchik;
}

/* Возвращает модуль знакового 64-битного числа в беззнаковом виде. */
static uint64_t kolibri_absolyut(int64_t znachenie) {
    if (znachenie >= 0) {
        return (uint64_t)znachenie;
    }
    return (uint64_t)(-(znachenie + 1LL)) + 1ULL;
}

/* Сериализует знаковое целое число в поток цифр. */
int kolibri_potok_cifr_zapisat_chislo(kolibri_potok_cifr *potok,
                                      int64_t znachenie) {
    if (!potok || !potok->cifry) {
        return -1;
    }
    uint64_t modul = kolibri_absolyut(znachenie);
    size_t chislo_cifr = kolibri_podschitat_cifry(modul);
    if (chislo_cifr > 99U) {
        return -1;
    }
    if (potok->dlina + chislo_cifr + 3U > potok->emkost) {
        return -1;
    }
    uint8_t znak = znachenie < 0 ? 1U : 0U;
    uint8_t lokalnye[32];
    uint64_t rabochij = modul;
    for (size_t indeks = 0; indeks < chislo_cifr; ++indeks) {
        lokalnye[chislo_cifr - 1U - indeks] = (uint8_t)(rabochij % 10ULL);
        rabochij /= 10ULL;
    }
    size_t zapis = potok->dlina;
    potok->cifry[zapis++] = (uint8_t)((chislo_cifr / 10U) % 10U);
    potok->cifry[zapis++] = (uint8_t)(chislo_cifr % 10U);
    potok->cifry[zapis++] = znak;
    for (size_t indeks = 0; indeks < chislo_cifr; ++indeks) {
        potok->cifry[zapis++] = lokalnye[indeks];
    }
    potok->dlina = zapis;
    return 0;
}

/* Считывает ранее сериализованное целое число из потока цифр. */
int kolibri_potok_cifr_schitat_chislo(kolibri_potok_cifr *potok,
                                      int64_t *znachenie) {
    if (!potok || !potok->cifry || !znachenie) {
        return -1;
    }
    if (kolibri_potok_cifr_ostalos(potok) == 0U) {
        return 1;
    }
    size_t nachalo = potok->poziciya;
    size_t dostupno = potok->dlina - nachalo;
    if (dostupno < 3U) {
        return -1;
    }
    uint8_t dlina_desyatki = potok->cifry[nachalo];
    uint8_t dlina_edinicy = potok->cifry[nachalo + 1U];
    uint8_t znak = potok->cifry[nachalo + 2U];
    if (dlina_desyatki > 9U || dlina_edinicy > 9U || znak > 1U) {
        return -1;
    }
    size_t chislo_cifr = (size_t)dlina_desyatki * 10U + (size_t)dlina_edinicy;
    if (chislo_cifr == 0U || chislo_cifr > 19U) {
        return -1;
    }
    if (dostupno < chislo_cifr + 3U) {
        return -1;
    }
    size_t poz = nachalo + 3U;
    uint64_t modul = 0ULL;
    for (size_t indeks = 0; indeks < chislo_cifr; ++indeks) {
        uint8_t cifra = potok->cifry[poz + indeks];
        if (cifra > 9U) {
            return -1;
        }
        if (modul > (UINT64_MAX - (uint64_t)cifra) / 10ULL) {
            return -1;
        }
        modul = modul * 10ULL + (uint64_t)cifra;
    }
    if (znak == 0U) {
        if (modul > (uint64_t)INT64_MAX) {
            return -1;
        }
        *znachenie = (int64_t)modul;
    } else {
        if (modul > (uint64_t)INT64_MAX + 1ULL) {
            return -1;
        }
        if (modul == (uint64_t)INT64_MAX + 1ULL) {
            *znachenie = INT64_MIN;
        } else {
            *znachenie = -(int64_t)modul;
        }
    }
    potok->poziciya = poz + chislo_cifr;
    return 0;
}

/* Переводит байт UTF-8 в три десятичные цифры. */
static int zakodirovat_bajt(kolibri_potok_cifr *potok,
                            unsigned char znachenie) {
    uint8_t sotni = (uint8_t)(znachenie / 100U);
    uint8_t desyatki = (uint8_t)((znachenie / 10U) % 10U);
    uint8_t edinicy = (uint8_t)(znachenie % 10U);
    if (kolibri_potok_cifr_push(potok, sotni) != 0 ||
        kolibri_potok_cifr_push(potok, desyatki) != 0 ||
        kolibri_potok_cifr_push(potok, edinicy) != 0) {
        return -1;
    }
    return 0;
}

/* Преобразует массив байтов в цифровую последовательность. */
int kolibri_transducirovat_utf8(kolibri_potok_cifr *potok,
                                const unsigned char *bajty, size_t dlina) {
    if (!potok || !bajty) {
        return -1;
    }
    for (size_t indeks = 0; indeks < dlina; ++indeks) {
        if (zakodirovat_bajt(potok, bajty[indeks]) != 0) {
            return -1;
        }
    }
    return 0;
}

/* Восстанавливает байты из цифрового представления. */
int kolibri_izluchit_utf8(const kolibri_potok_cifr *potok, unsigned char *vyhod,
                          size_t vyhod_dlina, size_t *zapisano) {
    if (!potok || !vyhod) {
        return -1;
    }
    if (potok->dlina % 3 != 0) {
        return -1;
    }
    size_t ozhidaemye_bajty = potok->dlina / 3U;
    if (vyhod_dlina < ozhidaemye_bajty) {
        return -1;
    }
    for (size_t indeks = 0; indeks < ozhidaemye_bajty; ++indeks) {
        size_t smeschenie = indeks * 3U;
        unsigned int znachenie =
            (unsigned int)(potok->cifry[smeschenie] * 100U +
                           potok->cifry[smeschenie + 1U] * 10U +
                           potok->cifry[smeschenie + 2U]);
        vyhod[indeks] = (unsigned char)znachenie;
    }
    if (zapisano) {
        *zapisano = ozhidaemye_bajty;
    }
    return 0;
}

/* Возвращает длину буфера цифр для строки заданной длины. */
size_t kolibri_dlina_kodirovki_teksta(size_t dlina_vhoda) {
    return dlina_vhoda * 3U + 1U;
}

/* Возвращает длину строки, которая получится после декодирования. */
size_t kolibri_dlina_dekodirovki_teksta(size_t dlina_cifr) {
    if (dlina_cifr % 3U != 0U) {
        return 0U;
    }
    return dlina_cifr / 3U + 1U;
}

/* Быстрая обёртка для кодирования текста в цифровой поток. */
int kolibri_kodirovat_text(const char *vhod, char *vyhod, size_t vyhod_dlina) {
    if (!vhod || !vyhod) {
        return -1;
    }
    size_t dlina_vhoda = strlen(vhod);
    size_t nuzhno = dlina_vhoda * 3U + 1U;
    if (vyhod_dlina < nuzhno) {
        return -1;
    }
    uint8_t bufer[512];
    kolibri_potok_cifr potok;
    kolibri_potok_cifr_init(&potok, bufer, sizeof(bufer));
    if (dlina_vhoda * 3U > sizeof(bufer)) {
        return -1;
    }
    if (kolibri_transducirovat_utf8(&potok, (const unsigned char *)vhod,
                                    dlina_vhoda) != 0) {
        return -1;
    }
    for (size_t indeks = 0; indeks < potok.dlina; ++indeks) {
        vyhod[indeks] = (char)('0' + potok.cifry[indeks]);
    }
    vyhod[potok.dlina] = '\0';
    return 0;
}

/* Быстрая обёртка для декодирования цифровой строки в UTF-8. */
int kolibri_dekodirovat_text(const char *cifry, char *vyhod,
                             size_t vyhod_dlina) {
    if (!cifry || !vyhod) {
        return -1;
    }
    size_t dlina_cifr = strlen(cifry);
    if (dlina_cifr % 3U != 0U) {
        return -1;
    }
    size_t ozhidaemye_bajty = dlina_cifr / 3U;
    if (vyhod_dlina < ozhidaemye_bajty + 1U) {
        return -1;
    }
    kolibri_potok_cifr potok;
    uint8_t bufer[512];
    if (dlina_cifr > sizeof(bufer)) {
        return -1;
    }
    kolibri_potok_cifr_init(&potok, bufer, sizeof(bufer));
    for (size_t indeks = 0; indeks < dlina_cifr; ++indeks) {
        if (!isdigit((unsigned char)cifry[indeks])) {
            return -1;
        }
        uint8_t cifra = (uint8_t)(cifry[indeks] - '0');
        if (kolibri_potok_cifr_push(&potok, cifra) != 0) {
            return -1;
        }
    }
    size_t zapisano = 0U;
    if (kolibri_izluchit_utf8(&potok, (unsigned char *)vyhod, vyhod_dlina,
                              &zapisano) != 0) {
        return -1;
    }
    vyhod[zapisano] = '\0';
    return 0;
}
