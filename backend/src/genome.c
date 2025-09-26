/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/genome.h"
#include "kolibri/decimal.h"

#include <errno.h>
#include <openssl/hmac.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

/* Преобразует массив байтов в шестнадцатеричную строку. */
static void preobrazovat_v_hex(const unsigned char *istochnik, size_t dlina,
                               char *naznachenie, size_t razmer_naznacheniya) {
    static const char tablica[] = "0123456789abcdef";
    if (!istochnik || !naznachenie || razmer_naznacheniya < dlina * 2U + 1U) {
        return;
    }
    for (size_t indeks = 0; indeks < dlina; ++indeks) {
        naznachenie[indeks * 2U] = tablica[(istochnik[indeks] >> 4U) & 0x0FU];
        naznachenie[indeks * 2U + 1U] = tablica[istochnik[indeks] & 0x0FU];
    }
    naznachenie[dlina * 2U] = '\0';
}

/* Конвертирует шестнадцатеричную строку в массив байтов. */
static int preobrazovat_hex_v_bajty(const char *stroka,
                                    unsigned char *naznachenie,
                                    size_t razmer_naznacheniya) {
    if (!stroka || !naznachenie) {
        return -1;
    }
    size_t dlina = strlen(stroka);
    if (dlina % 2U != 0U || dlina / 2U != razmer_naznacheniya) {
        return -1;
    }
    for (size_t indeks = 0; indeks < razmer_naznacheniya; ++indeks) {
        unsigned int znachenie = 0U;
        if (sscanf(stroka + indeks * 2U, "%02x", &znachenie) != 1) {
            return -1;
        }
        naznachenie[indeks] = (unsigned char)znachenie;
    }
    return 0;
}

/* Сбрасывает состояние контекста генома в исходное. */
static void sbrosit_kontekst(KolibriGenome *kontekst) {
    if (!kontekst) {
        return;
    }
    kontekst->file = NULL;
    memset(kontekst->last_hash, 0, sizeof(kontekst->last_hash));
    memset(kontekst->hmac_key, 0, sizeof(kontekst->hmac_key));
    kontekst->hmac_key_len = 0U;
    memset(kontekst->path, 0, sizeof(kontekst->path));
    kontekst->next_index = 0U;
}

/* Формирует буфер данных, используемый для HMAC-подписи блока. */
static int preobrazovat_cifry_v_stroku(const uint8_t *istochnik, uint16_t dlina,
                                       char *naznachenie, size_t razmer) {
    if (!naznachenie) {
        return -1;
    }
    if ((size_t)dlina >= razmer) {
        return -1;
    }
    for (uint16_t indeks = 0; indeks < dlina; ++indeks) {
        if (istochnik[indeks] > 9U) {
            return -1;
        }
        naznachenie[indeks] = (char)('0' + istochnik[indeks]);
    }
    naznachenie[dlina] = '\0';
    return 0;
}

static int preobrazovat_stroku_v_cifry(const char *istochnik,
                                       uint8_t *naznachenie, uint16_t *dlina,
                                       size_t emkost) {
    if (!istochnik || !naznachenie || !dlina) {
        return -1;
    }
    size_t dlina_bajt = strlen(istochnik);
    if (dlina_bajt * 3U > emkost) {
        return -1;
    }
    kolibri_potok_cifr potok;
    kolibri_potok_cifr_init(&potok, naznachenie, emkost);
    if (kolibri_transducirovat_utf8(&potok, (const unsigned char *)istochnik,
                                    dlina_bajt) != 0) {
        return -1;
    }
    *dlina = (uint16_t)potok.dlina;
    return 0;
}

static int preobrazovat_ascii_v_cifry(const char *istochnik,
                                      uint8_t *naznachenie, uint16_t *dlina,
                                      size_t emkost) {
    if (!istochnik || !naznachenie || !dlina) {
        return -1;
    }
    size_t dlina_stroki = strlen(istochnik);
    if (dlina_stroki > emkost) {
        return -1;
    }
    if (dlina_stroki % 3U != 0U) {
        return -1;
    }
    for (size_t indeks = 0; indeks < dlina_stroki; ++indeks) {
        char znak = istochnik[indeks];
        if (znak < '0' || znak > '9') {
            return -1;
        }
        naznachenie[indeks] = (uint8_t)(znak - '0');
    }
    *dlina = (uint16_t)dlina_stroki;
    return 0;
}

static void sobrat_paket(const ReasonBlock *blok, unsigned char *bufer,
                         size_t *dlina) {
    size_t smeschenie = 0U;
    memcpy(bufer + smeschenie, &blok->index, sizeof(blok->index));
    smeschenie += sizeof(blok->index);
    memcpy(bufer + smeschenie, &blok->timestamp, sizeof(blok->timestamp));
    smeschenie += sizeof(blok->timestamp);
    memcpy(bufer + smeschenie, blok->prev_hash, KOLIBRI_HASH_SIZE);
    smeschenie += KOLIBRI_HASH_SIZE;
    memcpy(bufer + smeschenie, &blok->event_digits_len,
           sizeof(blok->event_digits_len));
    smeschenie += sizeof(blok->event_digits_len);
    memcpy(bufer + smeschenie, blok->event_digits, blok->event_digits_len);
    smeschenie += blok->event_digits_len;
    memcpy(bufer + smeschenie, &blok->payload_digits_len,
           sizeof(blok->payload_digits_len));
    smeschenie += sizeof(blok->payload_digits_len);
    memcpy(bufer + smeschenie, blok->payload_digits, blok->payload_digits_len);
    smeschenie += blok->payload_digits_len;
    *dlina = smeschenie;
}

/*
 * Разбирает строку журнала в структуру ReasonBlock, проверяя хеш-цепочку и
 * HMAC. Возвращает 0 при успехе, отрицательное значение при ошибке.
 */
static int razobrat_stroku(const char *stroka,
                           const unsigned char *ozhidaemyj_prev,
                           uint64_t ozhidaemyj_indeks,
                           const unsigned char *klyuch, size_t dlina_klyucha,
                           ReasonBlock *blok) {
    if (!stroka || !ozhidaemyj_prev || !klyuch || dlina_klyucha == 0U ||
        !blok) {
        return -1;
    }

    char pred_hex[KOLIBRI_HASH_SIZE * 2U + 1U];
    char hmac_hex[KOLIBRI_HASH_SIZE * 2U + 1U];
    char sobytie[KOLIBRI_EVENT_DIGITS + 1U];
    char nagruzka[KOLIBRI_PAYLOAD_DIGITS + 1U];
    unsigned long long indeks = 0ULL;
    unsigned long long metka_vremeni = 0ULL;

    int sovpalo =
        sscanf(stroka, "%llu,%llu,%64[^,],%64[^,],%96[^,],%768[^\n]", &indeks,
               &metka_vremeni, pred_hex, hmac_hex, sobytie, nagruzka);
    if (sovpalo != 6) {
        return -1;
    }

    memset(blok, 0, sizeof(*blok));
    blok->index = (uint64_t)indeks;
    blok->timestamp = (uint64_t)metka_vremeni;
    if (preobrazovat_ascii_v_cifry(sobytie, blok->event_digits,
                                   &blok->event_digits_len,
                                   KOLIBRI_EVENT_DIGITS) != 0) {
        return -1;
    }
    if (preobrazovat_ascii_v_cifry(nagruzka, blok->payload_digits,
                                   &blok->payload_digits_len,
                                   KOLIBRI_PAYLOAD_DIGITS) != 0) {
        return -1;
    }

    if (blok->index != ozhidaemyj_indeks) {
        return -1;
    }
    if (preobrazovat_hex_v_bajty(pred_hex, blok->prev_hash,
                                 KOLIBRI_HASH_SIZE) != 0 ||
        preobrazovat_hex_v_bajty(hmac_hex, blok->hmac, KOLIBRI_HASH_SIZE) !=
            0) {
        return -1;
    }
    if (memcmp(blok->prev_hash, ozhidaemyj_prev, KOLIBRI_HASH_SIZE) != 0) {
        return -1;
    }

    unsigned char bufer[sizeof(blok->index) + sizeof(blok->timestamp) +
                        KOLIBRI_HASH_SIZE + sizeof(blok->event_digits_len) +
                        KOLIBRI_EVENT_DIGITS +
                        sizeof(blok->payload_digits_len) +
                        KOLIBRI_PAYLOAD_DIGITS];
    size_t dlina_bufera = 0U;
    sobrat_paket(blok, bufer, &dlina_bufera);

    unsigned char vychisleno[KOLIBRI_HASH_SIZE];
    unsigned int dlina_hmac = 0U;
    unsigned char *rezultat =
        HMAC(EVP_sha256(), klyuch, (int)dlina_klyucha, bufer, dlina_bufera,
             vychisleno, &dlina_hmac);
    if (!rezultat || dlina_hmac != KOLIBRI_HASH_SIZE) {
        return -1;
    }
    if (memcmp(vychisleno, blok->hmac, KOLIBRI_HASH_SIZE) != 0) {
        return -1;
    }

    return 0;
}

/* Открывает файл генома и восстанавливает контекст цепочки. */
int kg_open(KolibriGenome *kontekst, const char *path,
            const unsigned char *klyuch, size_t dlina_klyucha) {
    if (!kontekst || !path || !klyuch || dlina_klyucha == 0U ||
        dlina_klyucha > sizeof(kontekst->hmac_key)) {
        return -1;
    }

    sbrosit_kontekst(kontekst);

    FILE *fail = fopen(path, "a+b");
    if (!fail) {
        return -1;
    }
    kontekst->file = fail;

    strncpy(kontekst->path, path, sizeof(kontekst->path) - 1U);
    memcpy(kontekst->hmac_key, klyuch, dlina_klyucha);
    kontekst->hmac_key_len = dlina_klyucha;

    fflush(kontekst->file);
    fseek(kontekst->file, 0, SEEK_SET);

    unsigned char ozhidaemyj_prev[KOLIBRI_HASH_SIZE];
    memset(ozhidaemyj_prev, 0, sizeof(ozhidaemyj_prev));
    uint64_t ozhidaemyj_indeks = 0U;

    char stroka[1024];
    while (fgets(stroka, sizeof(stroka), kontekst->file)) {
        ReasonBlock blok;
        if (razobrat_stroku(stroka, ozhidaemyj_prev, ozhidaemyj_indeks,
                            kontekst->hmac_key, kontekst->hmac_key_len,
                            &blok) != 0) {
            fclose(kontekst->file);
            sbrosit_kontekst(kontekst);
            return -1;
        }
        memcpy(ozhidaemyj_prev, blok.hmac, KOLIBRI_HASH_SIZE);
        ozhidaemyj_indeks = blok.index + 1U;
    }

    memcpy(kontekst->last_hash, ozhidaemyj_prev, KOLIBRI_HASH_SIZE);
    kontekst->next_index = ozhidaemyj_indeks;

    fseek(kontekst->file, 0, SEEK_END);
    return 0;
}

/* Закрывает файл генома и очищает конфиденциальные данные. */
void kg_close(KolibriGenome *kontekst) {
    if (!kontekst) {
        return;
    }
    if (kontekst->file) {
        fclose(kontekst->file);
        kontekst->file = NULL;
    }
    memset(kontekst->last_hash, 0, sizeof(kontekst->last_hash));
    memset(kontekst->hmac_key, 0, sizeof(kontekst->hmac_key));
    kontekst->hmac_key_len = 0U;
    memset(kontekst->path, 0, sizeof(kontekst->path));
    kontekst->next_index = 0U;
}

/* Добавляет новый блок рассуждения в конец цепочки. */
int kg_append(KolibriGenome *kontekst, const char *tip_sobytiya,
              const char *nagruzka, ReasonBlock *vyhod) {
    if (!kontekst || !kontekst->file || !tip_sobytiya || !nagruzka) {
        return -1;
    }

    ReasonBlock blok;
    memset(&blok, 0, sizeof(blok));
    blok.index = kontekst->next_index++;
    blok.timestamp = (uint64_t)time(NULL);
    memcpy(blok.prev_hash, kontekst->last_hash, KOLIBRI_HASH_SIZE);
    if (preobrazovat_stroku_v_cifry(tip_sobytiya, blok.event_digits,
                                    &blok.event_digits_len,
                                    KOLIBRI_EVENT_DIGITS) != 0) {
        return -1;
    }
    if (preobrazovat_stroku_v_cifry(nagruzka, blok.payload_digits,
                                    &blok.payload_digits_len,
                                    KOLIBRI_PAYLOAD_DIGITS) != 0) {
        return -1;
    }

    unsigned char bufer[sizeof(blok.index) + sizeof(blok.timestamp) +
                        KOLIBRI_HASH_SIZE + sizeof(blok.event_digits_len) +
                        KOLIBRI_EVENT_DIGITS + sizeof(blok.payload_digits_len) +
                        KOLIBRI_PAYLOAD_DIGITS];
    size_t dlina_bufera = 0U;
    sobrat_paket(&blok, bufer, &dlina_bufera);

    unsigned int dlina_hmac = 0U;
    unsigned char *rezultat =
        HMAC(EVP_sha256(), kontekst->hmac_key, (int)kontekst->hmac_key_len,
             bufer, dlina_bufera, blok.hmac, &dlina_hmac);
    if (!rezultat || dlina_hmac != KOLIBRI_HASH_SIZE) {
        return -1;
    }

    memcpy(kontekst->last_hash, blok.hmac, KOLIBRI_HASH_SIZE);

    char pred_hex[KOLIBRI_HASH_SIZE * 2U + 1U];
    char hmac_hex[KOLIBRI_HASH_SIZE * 2U + 1U];
    preobrazovat_v_hex(blok.prev_hash, KOLIBRI_HASH_SIZE, pred_hex,
                       sizeof(pred_hex));
    preobrazovat_v_hex(blok.hmac, KOLIBRI_HASH_SIZE, hmac_hex,
                       sizeof(hmac_hex));

    char sobytie_ascii[KOLIBRI_EVENT_DIGITS + 1U];
    char nagruzka_ascii[KOLIBRI_PAYLOAD_DIGITS + 1U];
    if (preobrazovat_cifry_v_stroku(blok.event_digits, blok.event_digits_len,
                                    sobytie_ascii,
                                    sizeof(sobytie_ascii)) != 0) {
        return -1;
    }
    if (preobrazovat_cifry_v_stroku(blok.payload_digits,
                                    blok.payload_digits_len, nagruzka_ascii,
                                    sizeof(nagruzka_ascii)) != 0) {
        return -1;
    }

    int zapisano = fprintf(kontekst->file, "%llu,%llu,%s,%s,%s,%s\n",
                           (unsigned long long)blok.index,
                           (unsigned long long)blok.timestamp, pred_hex,
                           hmac_hex, sobytie_ascii, nagruzka_ascii);
    if (zapisano < 0) {
        return -1;
    }

    fflush(kontekst->file);

    if (vyhod) {
        *vyhod = blok;
    }

    return 0;
}

/* Проверяет целостность цепочки блоков в указанном файле. */
int kg_verify_file(const char *path, const unsigned char *klyuch,
                   size_t dlina_klyucha) {
    if (!path || !klyuch || dlina_klyucha == 0U ||
        dlina_klyucha > KOLIBRI_HMAC_KEY_SIZE) {
        return -1;
    }

    FILE *fail = fopen(path, "rb");
    if (!fail) {
        if (errno == ENOENT) {
            return 1;
        }
        return -1;
    }

    unsigned char ozhidaemyj_prev[KOLIBRI_HASH_SIZE];
    memset(ozhidaemyj_prev, 0, sizeof(ozhidaemyj_prev));
    uint64_t ozhidaemyj_indeks = 0U;

    char stroka[1024];
    while (fgets(stroka, sizeof(stroka), fail)) {
        ReasonBlock blok;
        if (razobrat_stroku(stroka, ozhidaemyj_prev, ozhidaemyj_indeks, klyuch,
                            dlina_klyucha, &blok) != 0) {
            fclose(fail);
            return -1;
        }
        memcpy(ozhidaemyj_prev, blok.hmac, KOLIBRI_HASH_SIZE);
        ozhidaemyj_indeks = blok.index + 1U;
    }

    fclose(fail);
    return 0;
}

/*
 * Последовательно воспроизводит блоки генома, вызывая обратный вызов для
 * каждого блока. Возвращает 0 при успехе, 1 если файл отсутствует,
 * отрицательное значение при ошибке.
 */
int kg_replay(const char *path, const unsigned char *klyuch,
              size_t dlina_klyucha, KolibriGenomeVisitor posetitel,
              void *kontekst) {
    if (!path || !klyuch || dlina_klyucha == 0U ||
        dlina_klyucha > KOLIBRI_HMAC_KEY_SIZE || !posetitel) {
        return -1;
    }

    FILE *fail = fopen(path, "rb");
    if (!fail) {
        if (errno == ENOENT) {
            return 1;
        }
        return -1;
    }

    unsigned char ozhidaemyj_prev[KOLIBRI_HASH_SIZE];
    memset(ozhidaemyj_prev, 0, sizeof(ozhidaemyj_prev));
    uint64_t ozhidaemyj_indeks = 0U;

    char stroka[1024];
    while (fgets(stroka, sizeof(stroka), fail)) {
        ReasonBlock blok;
        if (razobrat_stroku(stroka, ozhidaemyj_prev, ozhidaemyj_indeks, klyuch,
                            dlina_klyucha, &blok) != 0) {
            fclose(fail);
            return -1;
        }
        if (posetitel(&blok, kontekst) != 0) {
            fclose(fail);
            return -1;
        }
        memcpy(ozhidaemyj_prev, blok.hmac, KOLIBRI_HASH_SIZE);
        ozhidaemyj_indeks = blok.index + 1U;
    }

    fclose(fail);
    return 0;
}

/* Восстанавливает текстовую метку события из цифрового блока. */
int kg_block_event_text(const ReasonBlock *blok, char *bufer, size_t razmer) {
    if (!blok || !bufer) {
        return -1;
    }
    kolibri_potok_cifr potok;
    potok.cifry = (uint8_t *)blok->event_digits;
    potok.emkost = blok->event_digits_len;
    potok.dlina = blok->event_digits_len;
    potok.poziciya = 0U;
    size_t zapisano = 0U;
    if (kolibri_izluchit_utf8(&potok, (unsigned char *)bufer, razmer,
                              &zapisano) != 0) {
        return -1;
    }
    if (zapisano >= razmer) {
        return -1;
    }
    bufer[zapisano] = '\0';
    return 0;
}

/* Восстанавливает полезную нагрузку из цифрового блока. */
int kg_block_payload_text(const ReasonBlock *blok, char *bufer, size_t razmer) {
    if (!blok || !bufer) {
        return -1;
    }
    kolibri_potok_cifr potok;
    potok.cifry = (uint8_t *)blok->payload_digits;
    potok.emkost = blok->payload_digits_len;
    potok.dlina = blok->payload_digits_len;
    potok.poziciya = 0U;
    size_t zapisano = 0U;
    if (kolibri_izluchit_utf8(&potok, (unsigned char *)bufer, razmer,
                              &zapisano) != 0) {
        return -1;
    }
    if (zapisano >= razmer) {
        return -1;
    }
    bufer[zapisano] = '\0';
    return 0;
}
