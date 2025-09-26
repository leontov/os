/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/script.h"

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Удаляет пробелы в начале и в конце строки. */
static void ochistit_probely(char *tekst)
{
    if (!tekst) {
        return;
    }
    size_t dlina = strlen(tekst);
    size_t nachalo = 0U;
    while (nachalo < dlina && isspace((unsigned char)tekst[nachalo])) {
        ++nachalo;
    }
    size_t konec = dlina;
    while (konec > nachalo && isspace((unsigned char)tekst[konec - 1U])) {
        --konec;
    }
    size_t novaya_dlina = konec - nachalo;
    if (nachalo > 0U && novaya_dlina > 0U) {
        memmove(tekst, tekst + nachalo, novaya_dlina);
    }
    tekst[novaya_dlina] = '\0';
}

/* Считывает строку в кавычках, продвигая указатель. */
static int izvlest_citatu(const char **poziciya, char *vyhod, size_t vyhod_dlina)
{
    const char *tekst = *poziciya;
    while (*tekst && isspace((unsigned char)*tekst)) {
        ++tekst;
    }
    if (*tekst != '"') {
        return -1;
    }
    ++tekst;
    size_t zapisano = 0U;
    while (*tekst && *tekst != '"') {
        if (zapisano + 1U >= vyhod_dlina) {
            return -2;
        }
        vyhod[zapisano++] = *tekst;
        ++tekst;
    }
    if (*tekst != '"') {
        return -3;
    }
    vyhod[zapisano] = '\0';
    ++tekst;
    *poziciya = tekst;
    return 0;
}

/* Обрабатывает команду обучения вида обучить "a" -> "b". */
static int obrabotat_komandu_obuchenie(const kolibri_script_obrabotchiki *obrabotchiki,
                                       const char *argumenty)
{
    if (!obrabotchiki || !obrabotchiki->obrabotat_obuchenie) {
        return -1;
    }
    const char *poziciya = argumenty;
    char vopros[256];
    char otvet[256];
    int status = izvlest_citatu(&poziciya, vopros, sizeof(vopros));
    if (status != 0) {
        return status;
    }
    while (*poziciya && isspace((unsigned char)*poziciya)) {
        ++poziciya;
    }
    if (poziciya[0] != '-' || poziciya[1] != '>') {
        return -4;
    }
    poziciya += 2;
    status = izvlest_citatu(&poziciya, otvet, sizeof(otvet));
    if (status != 0) {
        return status;
    }
    return obrabotchiki->obrabotat_obuchenie(
        obrabotchiki->polzovatelskie_dannye, vopros, otvet);
}

/* Обрабатывает команду вопроса вида спросить "текст". */
static int obrabotat_komandu_vopros(const kolibri_script_obrabotchiki *obrabotchiki,
                                    const char *argumenty)
{
    if (!obrabotchiki || !obrabotchiki->obrabotat_vopros) {
        return -1;
    }
    const char *poziciya = argumenty;
    char zapros[256];
    int status = izvlest_citatu(&poziciya, zapros, sizeof(zapros));
    if (status != 0) {
        return status;
    }
    return obrabotchiki->obrabotat_vopros(
        obrabotchiki->polzovatelskie_dannye, zapros);
}

/* Обрабатывает команду похвалы или порицания. */
static int obrabotat_komandu_ocenka(const kolibri_script_obrabotchiki *obrabotchiki,
                                    int znachenie)
{
    if (!obrabotchiki || !obrabotchiki->obrabotat_ocenku) {
        return -1;
    }
    return obrabotchiki->obrabotat_ocenku(
        obrabotchiki->polzovatelskie_dannye, znachenie);
}

/* Сохраняет текст ошибки с учётом размера буфера. */
static void zapisat_oshibku(char *oshibka, size_t oshibka_dlina, const char *tekst)
{
    if (!oshibka || oshibka_dlina == 0U) {
        return;
    }
    if (!tekst) {
        oshibka[0] = '\0';
        return;
    }
    strncpy(oshibka, tekst, oshibka_dlina - 1U);
    oshibka[oshibka_dlina - 1U] = '\0';
}

int kolibri_script_vypolnit(const char *put_k_fajlu,
                            const kolibri_script_obrabotchiki *obrabotchiki,
                            char *oshibka, size_t oshibka_dlina)
{
    if (!put_k_fajlu || !obrabotchiki) {
        zapisat_oshibku(oshibka, oshibka_dlina,
                         "некорректные параметры интерпретатора");
        return -1;
    }
    FILE *fajl = fopen(put_k_fajlu, "r");
    if (!fajl) {
        zapisat_oshibku(oshibka, oshibka_dlina, strerror(errno));
        return -2;
    }
    char stroka[512];
    unsigned long nomer_stroki = 0UL;
    int rezultat = 0;
    while (fgets(stroka, sizeof(stroka), fajl)) {
        ++nomer_stroki;
        ochistit_probely(stroka);
        if (stroka[0] == '\0') {
            continue;
        }
        if (stroka[0] == '/' && stroka[1] == '/') {
            continue;
        }
        if (strcmp(stroka, "начало:") == 0 || strcmp(stroka, "конец.") == 0) {
            continue;
        }
        const char *komanda_obuchenie = "обучить";
        const char *komanda_vopros = "спросить";
        size_t dlina_obuchenie = strlen(komanda_obuchenie);
        size_t dlina_vopros = strlen(komanda_vopros);
        if (strncmp(stroka, komanda_obuchenie, dlina_obuchenie) == 0) {
            rezultat = obrabotat_komandu_obuchenie(obrabotchiki,
                                                    stroka + dlina_obuchenie);
        } else if (strncmp(stroka, komanda_vopros, dlina_vopros) == 0) {
            rezultat = obrabotat_komandu_vopros(obrabotchiki,
                                                stroka + dlina_vopros);
        } else if (strcmp(stroka, "похвала") == 0) {
            rezultat = obrabotat_komandu_ocenka(obrabotchiki, 1);
        } else if (strcmp(stroka, "порицание") == 0) {
            rezultat = obrabotat_komandu_ocenka(obrabotchiki, -1);
        } else {
            rezultat = -100;
        }
        if (rezultat != 0) {
            char opisanie[256];
            snprintf(opisanie, sizeof(opisanie),
                     "ошибка на строке %lu", nomer_stroki);
            zapisat_oshibku(oshibka, oshibka_dlina, opisanie);
            fclose(fajl);
            return rezultat;
        }
    }
    if (ferror(fajl)) {
        zapisat_oshibku(oshibka, oshibka_dlina,
                         "не удалось прочитать сценарий");
        fclose(fajl);
        return -3;
    }
    fclose(fajl);
    zapisat_oshibku(oshibka, oshibka_dlina, NULL);
    return 0;
}
