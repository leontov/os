/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/script.h"
#include "kolibri/formula.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

void test_script(void) {
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 424242ULL);

    KolibriScript skript;
    assert(ks_init(&skript, &pool, NULL) == 0);

    const char *programma =
        "начало:\n"
        "    показать \"Kolibri приветствует Архитектора\"\n"
        "    обучить связь \"2\" -> \"4\"\n"
        "    создать формулу ответ из \"ассоциация\"\n"
        "    вызвать эволюцию\n"
        "    оценить ответ на задаче \"2\"\n"
        "    показать итог\n"
        "конец.\n";

    FILE *vyvod = tmpfile();
    assert(vyvod != NULL);
    ks_set_output(&skript, vyvod);

    assert(ks_load_text(&skript, programma) == 0);
    assert(ks_execute(&skript) == 0);

    fflush(vyvod);
    fseek(vyvod, 0L, SEEK_SET);
    char bufer[256];
    size_t prochitano = fread(bufer, 1U, sizeof(bufer) - 1U, vyvod);
    bufer[prochitano] = '\0';
    fclose(vyvod);

    ks_free(&skript);

    const KolibriFormula *luchshaja = kf_pool_best(&pool);
    assert(luchshaja != NULL);
    assert(strstr(bufer, "Kolibri приветствует Архитектора") != NULL);
    assert(strstr(bufer, "4") != NULL);
}

static void zapisat_skript_text(char *path, size_t path_dlina, const char *programma) {
    char shablon[] = "/tmp/kolibri_scriptXXXXXX";
    assert(path_dlina >= sizeof(shablon));
    memcpy(path, shablon, sizeof(shablon));
    int fd = mkstemp(path);
    assert(fd >= 0);
    FILE *file = fdopen(fd, "wb");
    assert(file != NULL);
    size_t dlina = strlen(programma);
    assert(fwrite(programma, 1U, dlina, file) == dlina);
    fclose(file);
}

void test_script_load_file(void) {
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 171717ULL);

    KolibriScript skript;
    assert(ks_init(&skript, &pool, NULL) == 0);

    const char *programma =
        "начало:\n"
        "    обучить связь \"1\" -> \"3\"\n"
        "    показать \"Загружено из файла\"\n"
        "    создать формулу ответ из \"ассоциация\"\n"
        "    вызвать эволюцию\n"
        "    оценить ответ на задаче \"1\"\n"
        "    показать итог\n"
        "конец.\n";

    char vremya[sizeof "/tmp/kolibri_scriptXXXXXX"];
    zapisat_skript_text(vremya, sizeof(vremya), programma);

    assert(ks_load_file(&skript, vremya) == 0);
    assert(ks_execute(&skript) == 0);

    remove(vremya);
    ks_free(&skript);
}
