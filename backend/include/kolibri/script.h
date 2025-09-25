/*
 * Copyright (c) 2025 Кочуров Владислав Евгеньевич
 */

#ifndef KOLIBRI_SCRIPT_H
#define KOLIBRI_SCRIPT_H

#include <stdio.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char name[64];
    double value;
} KolibriScriptVariable;

typedef struct {
    KolibriScriptVariable variables[64];
    size_t count;
    char error[256];
} KolibriScriptContext;

/* Инициализирует новый контекст интерпретатора KolibriScript. */
void ks_context_init(KolibriScriptContext *context);
/* Очищает контекст и готовит его к повторному использованию. */
void ks_context_reset(KolibriScriptContext *context);
/* Возвращает текст последней ошибки интерпретатора. */
const char *ks_last_error(const KolibriScriptContext *context);
/* Выполняет KolibriScript из текстовой строки, выводя результат в указанный поток. */
int ks_execute_text(KolibriScriptContext *context, const char *source, FILE *output);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_SCRIPT_H */
