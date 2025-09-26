#ifndef KOLIBRI_SCRIPT_H
#define KOLIBRI_SCRIPT_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Обработчики действий, которые вызываются интерпретатором KolibriScript. */
typedef struct {
    void *polzovatelskie_dannye;
    int (*obrabotat_obuchenie)(void *polz, const char *vopros,
                               const char *otvet);
    int (*obrabotat_vopros)(void *polz, const char *zapros);
    int (*obrabotat_ocenku)(void *polz, int znachenie);
} kolibri_script_obrabotchiki;

/* Выполняет сценарий KolibriScript из файла. */
int kolibri_script_vypolnit(const char *put_k_fajlu,
                            const kolibri_script_obrabotchiki *obrabotchiki,
                            char *oshibka, size_t oshibka_dlina);

#ifdef __cplusplus
}
#endif

#endif /* KOLIBRI_SCRIPT_H */
