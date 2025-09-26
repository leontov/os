/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#include "kolibri/script.h"
#include "kolibri/formula.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

void test_script(void) {
    KolibriFormulaPool pool;
    kf_pool_init(&pool, 424242ULL);

    KolibriScript skript;
    assert(ks_init(&skript, &pool, NULL) == 0);

    const char *programma =
        "начало:\n"
        "    показать \"Kolibri приветствует Архитектора\"\n"
        "    обучить число 2 -> 4\n"
        "    тикнуть 24\n"
        "    спросить число 2\n"
        "    сохранить лучшую формулу\n"
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
    assert(strstr(bufer, "[Скрипт] f(2) =") != NULL);
}
