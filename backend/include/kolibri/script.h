/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#ifndef KOLIBRI_SCRIPT_H
#define KOLIBRI_SCRIPT_H

#include "kolibri/formula.h"
#include "kolibri/genome.h"
#include "kolibri/symbol_table.h"

#include <stdio.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Контекст исполнения KolibriScript. Хранит цифровой поток сценария и
 * предоставляет доступ к пулу формул и цифровому геному.
 */
struct KolibriScriptVariable;
struct KolibriScriptAssociation;
struct KolibriScriptFormulaBinding;

typedef struct {
    double lambda_b;
    double lambda_d;
    double target_b;
    double target_d;
    double temperature;
    double top_k;
    int cf_beam;
} KolibriScriptControls;

typedef struct {
    KolibriFormulaPool *pool;
    KolibriGenome *genome;
    FILE *vyvod;
    char *source_text;
    KolibriSymbolTable symbol_table;
    char mode[32];
    KolibriScriptControls controls;

    /* Runtime state */
    struct KolibriScriptVariable *variables;
    size_t variables_count;
    size_t variables_capacity;

    struct KolibriScriptAssociation *associations;
    size_t associations_count;
    size_t associations_capacity;

    struct KolibriScriptFormulaBinding *formulas;
    size_t formulas_count;
    size_t formulas_capacity;
} KolibriScript;

/* Инициализирует интерпретатор и выделяет внутренний цифровой буфер. */
int ks_init(KolibriScript *skript, KolibriFormulaPool *pool,
            KolibriGenome *genome);

/* Освобождает выделенные ресурсы интерпретатора. */
void ks_free(KolibriScript *skript);

/* Переназначает поток вывода интерпретатора (по умолчанию stdout). */
void ks_set_output(KolibriScript *skript, FILE *vyvod);

/* Загружает русскоязычный сценарий из текстовой строки. */
int ks_load_text(KolibriScript *skript, const char *text);

/* Загружает сценарий из файла на диске. */
int ks_load_file(KolibriScript *skript, const char *path);

/* Выполняет сценарий, возвращает 0 при успехе. */
int ks_execute(KolibriScript *skript);

int ks_set_controls(KolibriScript *skript, const KolibriScriptControls *controls);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_SCRIPT_H */
